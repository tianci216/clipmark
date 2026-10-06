import fs from "node:fs";
import path from "node:path";
import { isUnderFolder, relativeToFolder, type CookiesFromBrowser } from "./settings.js";
import { parseSourceJson, type Source } from "./source.js";

/**
 * The Download queue: in-memory, sequential, not persisted. A Download is an
 * in-flight fetch of an online video into the Library Folder (CONTEXT.md); once
 * the file has landed the scanner turns it into a Video and the client drops the row.
 *
 * The process itself sits behind the single `Downloader` seam so the HTTP suite
 * drives the queue with a scripted fake and no yt-dlp.
 */

export interface DownloadRequest {
  url: string;
  /** Absolute yt-dlp output template inside the destination folder. */
  outputTemplate: string;
  /** Browser to read cookies from, or null to omit the flag. */
  cookiesFromBrowser: Exclude<CookiesFromBrowser, "none"> | null;
  /**
   * Absolute path, without extension, where yt-dlp writes the preview image: inside the
   * app's thumbnail store, never the Library Folder. The queue renames it by Hash on landing.
   */
  previewBase: string;
}

export interface DownloadExit {
  code: number | null;
  /** Final path of the landed file (yt-dlp `after_move:filepath`), if it reported one. */
  filepath: string | null;
  stderrTail: string;
  /** The Source as yt-dlp printed it (the JSON after the tag), or null when no line came. */
  source: string | null;
}

export interface DownloadEvents {
  onProgress(percent: number): void;
  onTitle(title: string): void;
  onExit(result: DownloadExit): void;
}

export interface DownloadHandle {
  /** Ask the process to stop (SIGINT); `onExit` still fires afterwards. */
  cancel(): void;
}

export interface YtDlpStatus {
  path: string;
  version: string;
}

export interface Downloader {
  start(request: DownloadRequest, events: DownloadEvents): DownloadHandle;
  /** Simulate-mode run with the browser's cookies; `output` is the stderr tail on failure. */
  testCookies(browser: Exclude<CookiesFromBrowser, "none">): Promise<{ ok: boolean; output: string }>;
  /** Installed yt-dlp, or null when none of the candidate directories has it. */
  status(): Promise<YtDlpStatus | null>;
}

export type DownloadState = "queued" | "running" | "done" | "failed" | "cancelled";

export interface Download {
  id: number;
  url: string;
  /** Folder-relative destination; "" is the Library Folder's top level. */
  folder: string;
  state: DownloadState;
  /** 0–100. */
  progress: number;
  title: string | null;
  /** Folder-relative path of the landed file once done. */
  file: string | null;
  /** stderr tail once failed. */
  error: string | null;
  /** Epoch ms when it started running; the client uses it for the Keychain-prompt hint. */
  startedAt: number | null;
}

/** A queued Download plus what the queue needs to run and clean up after it. */
interface Entry {
  download: Download;
  destination: string;
  libraryFolder: string;
  request: DownloadRequest;
  handle: DownloadHandle | null;
  /** Partial files already in the destination before this Download ran — never ours to delete. */
  preexistingPartials: Set<string>;
}

const PARTIAL_SUFFIXES = [".part", ".ytdl", ".part-Frag"];

function isPartialFile(name: string): boolean {
  return PARTIAL_SUFFIXES.some((s) => name.includes(s));
}

function listPartials(dir: string): Set<string> {
  try {
    return new Set(fs.readdirSync(dir).filter(isPartialFile));
  } catch {
    return new Set();
  }
}

export type DestinationValidation =
  | { ok: true; folder: string; destination: string }
  | { ok: false; error: string };

/**
 * `folder` is relative to the Library Folder and must name an existing directory
 * under it. Traversal and absolute paths are refused the same way /video/* refuses them.
 */
export function validateDestination(libraryFolder: string, input: unknown): DestinationValidation {
  const raw = typeof input === "string" ? input.trim() : "";
  if (raw === "") return { ok: true, folder: "", destination: libraryFolder };
  if (path.isAbsolute(raw)) {
    return { ok: false, error: "Choose a folder inside the Library Folder." };
  }
  const destination = path.resolve(libraryFolder, raw);
  if (!isUnderFolder(libraryFolder, destination)) {
    return { ok: false, error: "Choose a folder inside the Library Folder." };
  }
  let stat: fs.Stats;
  try {
    stat = fs.statSync(destination);
  } catch {
    return { ok: false, error: `No folder named "${raw}" in the Library Folder.` };
  }
  if (!stat.isDirectory()) {
    return { ok: false, error: `"${raw}" is a file, not a folder.` };
  }
  return { ok: true, folder: relativeToFolder(libraryFolder, destination), destination };
}

export function isHttpUrl(input: unknown): input is string {
  if (typeof input !== "string") return false;
  try {
    const u = new URL(input.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export const OUTPUT_TEMPLATE = "%(title)s [%(id)s].%(ext)s";

/** Name of the preview image yt-dlp writes for a running Download, before its Hash is known. */
const PENDING_PREVIEW = "source-pending-";

/** File name of a saved Source's preview image in the thumbnail store. */
export function previewName(hash: string, ext: string): string {
  return `source-${hash}${ext}`;
}

export interface DownloadQueueOptions {
  downloader: Downloader;
  /** The app's thumbnail store (served at /thumbnails). */
  thumbnailDir: string;
  /** The scanner's hash function, so the saved Source is keyed exactly as the scan keys the Video. */
  hash(file: string): string;
  saveSource(hash: string, source: Source): void;
}

export class DownloadQueue {
  private readonly entries: Entry[] = [];
  private nextId = 1;
  private running: Entry | null = null;

  constructor(private readonly options: DownloadQueueOptions) {}

  list(): Download[] {
    return this.entries.map((e) => ({ ...e.download }));
  }

  enqueue(input: {
    url: string;
    libraryFolder: string;
    folder: string;
    destination: string;
    cookiesFromBrowser: CookiesFromBrowser;
  }): Download {
    const download: Download = {
      id: this.nextId++,
      url: input.url,
      folder: input.folder,
      state: "queued",
      progress: 0,
      title: null,
      file: null,
      error: null,
      startedAt: null,
    };
    this.entries.push({
      download,
      destination: input.destination,
      libraryFolder: input.libraryFolder,
      request: {
        url: input.url,
        outputTemplate: path.join(input.destination, OUTPUT_TEMPLATE),
        cookiesFromBrowser: input.cookiesFromBrowser === "none" ? null : input.cookiesFromBrowser,
        // Unique per run so a stale image from an earlier Download is never picked up.
        previewBase: path.join(this.options.thumbnailDir, `${PENDING_PREVIEW}${Date.now()}-${download.id}`),
      },
      handle: null,
      preexistingPartials: new Set(),
    });
    this.pump();
    return { ...download };
  }

  /**
   * Running → SIGINT, cleaned up and forgotten once the process exits (a second
   * call while it is still exiting is a no-op). Queued → dropped.
   * Done / failed → dismissed (removed from the list). False when no such Download exists.
   */
  remove(id: number): boolean {
    const entry = this.entries.find((e) => e.download.id === id);
    if (!entry) return false;
    const { state } = entry.download;
    if (state === "running") {
      entry.download.state = "cancelled";
      entry.handle?.cancel();
    } else if (state !== "cancelled") {
      this.forget(entry);
    }
    return true;
  }

  private forget(entry: Entry): void {
    const i = this.entries.indexOf(entry);
    if (i >= 0) this.entries.splice(i, 1);
  }

  private pump(): void {
    if (this.running) return;
    const next = this.entries.find((e) => e.download.state === "queued");
    if (!next) return;
    this.running = next;
    next.download.state = "running";
    next.download.startedAt = Date.now();
    next.preexistingPartials = listPartials(next.destination);
    next.handle = this.options.downloader.start(next.request, {
      onProgress: (percent) => {
        if (next.download.state === "running") {
          next.download.progress = Math.max(0, Math.min(100, percent));
        }
      },
      onTitle: (title) => {
        next.download.title = title;
      },
      onExit: (result) => this.finish(next, result),
    });
  }

  private finish(entry: Entry, result: DownloadExit): void {
    const { download } = entry;
    if (download.state === "cancelled") {
      this.cleanupPartials(entry);
      this.forget(entry);
    } else if (result.code === 0 && result.filepath && isUnderFolder(entry.libraryFolder, result.filepath)) {
      download.state = "done";
      download.progress = 100;
      download.file = relativeToFolder(entry.libraryFolder, result.filepath);
      this.saveSource(entry, result.filepath, result.source);
    } else {
      download.state = "failed";
      download.error =
        result.stderrTail.trim() ||
        (result.code === 0 ? "yt-dlp finished without reporting a file." : `yt-dlp exited with code ${result.code}.`);
      this.cleanupPartials(entry);
    }
    this.removePendingPreviews(entry);
    this.running = null;
    this.pump();
  }

  /**
   * Keys the Source by the landed file's Hash (ADR-0009) so it exists before the next scan.
   * A Source that can't be parsed, or a file that can't be hashed, never fails the Download;
   * a preview that can't be claimed only leaves the Source without one.
   */
  private saveSource(entry: Entry, filepath: string, raw: string | null): void {
    const parsed = parseSourceJson(raw);
    if (!parsed.ok) {
      console.error(`Download ${entry.download.url} landed without a Source: ${parsed.error}`);
      return;
    }
    try {
      const hash = this.options.hash(filepath);
      let preview: string | null = null;
      try {
        preview = this.claimPreview(entry, hash);
      } catch (err) {
        console.error(`Could not keep the preview for ${filepath}:`, err);
      }
      this.options.saveSource(hash, { ...parsed.source, preview });
    } catch (err) {
      console.error(`Could not save the Source for ${filepath}:`, err);
    }
  }

  /** Renames the preview yt-dlp wrote to the Hash's name; its /thumbnails URL, or null. */
  private claimPreview(entry: Entry, hash: string): string | null {
    const found = this.pendingPreviews(entry).sort(
      (a, b) => Number(!a.endsWith(".jpg")) - Number(!b.endsWith(".jpg")),
    )[0];
    if (!found) return null;
    const name = previewName(hash, path.extname(found).toLowerCase());
    fs.renameSync(path.join(this.options.thumbnailDir, found), path.join(this.options.thumbnailDir, name));
    return `/thumbnails/${name}`;
  }

  private pendingPreviews(entry: Entry): string[] {
    const prefix = path.basename(entry.request.previewBase) + ".";
    try {
      return fs.readdirSync(this.options.thumbnailDir).filter((n) => n.startsWith(prefix));
    } catch {
      return [];
    }
  }

  private removePendingPreviews(entry: Entry): void {
    for (const name of this.pendingPreviews(entry)) {
      fs.rmSync(path.join(this.options.thumbnailDir, name), { force: true });
    }
  }

  private cleanupPartials(entry: Entry): void {
    for (const name of listPartials(entry.destination)) {
      if (entry.preexistingPartials.has(name)) continue;
      try {
        fs.rmSync(path.join(entry.destination, name), { force: true });
      } catch (err) {
        console.error(`Could not remove partial download ${name}:`, err);
      }
    }
  }
}
