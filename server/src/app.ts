import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Request, Response } from "express";
import express from "express";
import { PORT, walkUp } from "./config.js";
import {
  DownloadQueue,
  isHttpUrl,
  validateDestination,
  type Downloader,
} from "./downloads.js";
import { listSubfolders, listVideoFiles, realDeps, scanVideoDir, type ScanDeps } from "./scanner.js";
import {
  deriveAddresses,
  getCookiesFromBrowser,
  getLibraryFolder,
  isCookiesFromBrowser,
  setCookiesFromBrowser,
  isUnderFolder,
  relativeToFolder,
  seedLibraryFolder,
  setLibraryFolder,
  validateLibraryFolder,
  type NetworkInterfaces,
} from "./settings.js";
import type { Clip, ClipInput, Store } from "./store.js";
import { mimeForFile, parseRange, resolveVideoPath } from "./videoStream.js";
import { createYtDlpDownloader } from "./ytdlp.js";

function findDistDir(): string | null {
  const found = walkUp(import.meta.dirname, "dist/index.html");
  return found ? path.join(found, "dist") : null;
}

function asyncHandler(
  fn: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response) => void {
  return (req, res) => {
    fn(req, res).catch((err) => {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    });
  };
}

function streamRange(abs: string, size: number, req: Request, res: Response): void {
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Type", mimeForFile(abs));
  const range = parseRange(req.headers.range, size);
  if (range.kind === "unsatisfiable") {
    res.setHeader("Content-Range", `bytes */${size}`);
    res.status(416).end();
    return;
  }
  if (range.kind === "full") {
    res.setHeader("Content-Length", String(size));
    fs.createReadStream(abs).pipe(res);
    return;
  }
  const length = range.end - range.start + 1;
  res.status(206);
  res.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
  res.setHeader("Content-Length", String(length));
  fs.createReadStream(abs, { start: range.start, end: range.end }).pipe(res);
}

export interface AppOptions {
  store: Store;
  thumbnailDir: string;
  /** Scanner dependencies (ffprobe/ffmpeg/hash/stat); tests inject fakes. */
  scanDeps?: ScanDeps;
  /** OS network interfaces for the address readback; tests inject fixtures. */
  networkInterfaces?: NetworkInterfaces;
  /** Environment used for the one-time CLIPMARK_VIDEO_DIR seed. */
  env?: Record<string, string | undefined>;
  /** Port reported in /api/settings (the one the server listens on). */
  port?: number;
  /** Wraps the yt-dlp process; tests inject a scripted fake. */
  downloader?: Downloader;
}

export function createApp({
  store,
  thumbnailDir,
  scanDeps = realDeps,
  networkInterfaces = os.networkInterfaces,
  env = process.env,
  port = PORT,
  downloader = createYtDlpDownloader(),
}: AppOptions) {
  seedLibraryFolder(store, env);
  // Read per request (ADR-0005) so a PUT applies to the next scan and stream.
  const libraryFolder = () => getLibraryFolder(store);
  const downloads = new DownloadQueue(downloader);

  const settingsResponse = async () => ({
    libraryFolder: libraryFolder(),
    ...deriveAddresses(networkInterfaces),
    port,
    cookiesFromBrowser: getCookiesFromBrowser(store),
    ytDlp: await downloader.status(),
  });

  /** A Clip as the API exposes it — folder-relative path — or null when it is hidden (Video outside the folder). */
  const visibleClip = (folder: string, clip: Clip): Clip | null =>
    isUnderFolder(folder, clip.file) ? { ...clip, file: relativeToFolder(folder, clip.file) } : null;

  const app = express();
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get(
    "/api/settings",
    asyncHandler(async (_req, res) => {
      res.json(await settingsResponse());
    }),
  );

  // Partial update: each key present is validated and saved; nothing is saved on any error.
  app.put(
    "/api/settings",
    asyncHandler(async (req, res) => {
      const body = (req.body ?? {}) as { libraryFolder?: unknown; cookiesFromBrowser?: unknown };
      if (body.libraryFolder === undefined && body.cookiesFromBrowser === undefined) {
        res.status(400).json({ error: "Nothing to save." });
        return;
      }
      const folderResult = body.libraryFolder === undefined ? null : validateLibraryFolder(body.libraryFolder);
      if (folderResult && !folderResult.ok) {
        res.status(400).json({ error: folderResult.error });
        return;
      }
      if (body.cookiesFromBrowser !== undefined && !isCookiesFromBrowser(body.cookiesFromBrowser)) {
        res.status(400).json({ error: "Cookies from browser must be none, chrome, safari or firefox." });
        return;
      }
      if (folderResult?.ok) setLibraryFolder(store, folderResult.folder);
      if (isCookiesFromBrowser(body.cookiesFromBrowser)) setCookiesFromBrowser(store, body.cookiesFromBrowser);
      const folder = libraryFolder();
      res.json({
        ...(await settingsResponse()),
        videoCount: folder === null ? 0 : listVideoFiles(folder).length,
      });
    }),
  );

  app.get("/api/downloads", (_req, res) => {
    res.json(downloads.list());
  });

  app.post("/api/downloads", (req, res) => {
    const body = (req.body ?? {}) as { url?: unknown; folder?: unknown };
    if (!isHttpUrl(body.url)) {
      res.status(400).json({ error: "Paste an http(s) link to a video." });
      return;
    }
    const folder = libraryFolder();
    if (folder === null) {
      res.status(400).json({ error: "Choose a Library Folder in Settings before downloading." });
      return;
    }
    const dest = validateDestination(folder, body.folder);
    if (!dest.ok) {
      res.status(400).json({ error: dest.error });
      return;
    }
    const job = downloads.enqueue({
      url: body.url.trim(),
      libraryFolder: folder,
      folder: dest.folder,
      destination: dest.destination,
      cookiesFromBrowser: getCookiesFromBrowser(store),
    });
    res.status(202).json(job);
  });

  // Triggers the one-time macOS Keychain grant for the browser's cookie store.
  app.post(
    "/api/downloads/test-cookies",
    asyncHandler(async (_req, res) => {
      const browser = getCookiesFromBrowser(store);
      if (browser === "none") {
        res.status(400).json({ error: "Cookies are off — pick a browser first." });
        return;
      }
      const result = await downloader.testCookies(browser);
      res.json(result.ok ? { ok: true, browser } : { ok: false, browser, error: result.output });
    }),
  );

  app.delete("/api/downloads/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "A numeric download id is required." });
      return;
    }
    if (!downloads.remove(id)) {
      res.status(404).json({ error: "No such download." });
      return;
    }
    res.status(204).end();
  });

  app.get(
    "/api/tree",
    asyncHandler(async (_req, res) => {
      const folder = libraryFolder();
      if (folder === null) {
        res.json({ videos: [], folders: [] });
        return;
      }
      const scanned = await scanVideoDir(store, folder, thumbnailDir, scanDeps);
      const stats = new Map(store.getVideos().map((v) => [v.hash, v]));
      const videos = scanned.map((s) => {
        const stat = stats.get(s.hash);
        return {
          hash: s.hash,
          file: s.file,
          fileMtime: s.fileMtime,
          durationSeconds: s.durationSeconds,
          thumbnail: s.thumbnail,
          clipCount: stat?.clipCount ?? 0,
          firstClipStart: stat?.firstClipStart ?? null,
        };
      });
      res.json({ videos, folders: listSubfolders(folder) });
    }),
  );

  app.get("/api/clips", (_req, res) => {
    const folder = libraryFolder();
    if (folder === null) {
      res.json([]);
      return;
    }
    // Clips on Videos outside the folder are hidden, never deleted (ADR-0005).
    res.json(store.getClips().flatMap((c) => visibleClip(folder, c) ?? []));
  });

  app.post("/api/clips", (req, res) => {
    const body = (req.body ?? {}) as Partial<ClipInput> & { videoHash?: string };
    const videoHash = body.videoHash;
    const startSeconds = body.startSeconds;
    const endSeconds = body.endSeconds;
    if (!videoHash) {
      res.status(400).json({ error: "A video hash is required." });
      return;
    }
    if (
      typeof startSeconds !== "number" ||
      typeof endSeconds !== "number" ||
      !Number.isFinite(startSeconds) ||
      !Number.isFinite(endSeconds)
    ) {
      res.status(400).json({ error: "Start and end times must be numbers." });
      return;
    }
    if (!(endSeconds > startSeconds)) {
      res.status(400).json({ error: "The clip has to end after it starts." });
      return;
    }
    const input: ClipInput = {
      startSeconds,
      endSeconds,
      note: typeof body.note === "string" ? body.note : "",
      tags: Array.isArray(body.tags) ? body.tags.filter((t): t is string => typeof t === "string") : [],
    };
    // Only Videos in the current Library Folder can take Clips: the UI could not show
    // one on a hidden Video, and the response must never carry an absolute path.
    const folder = libraryFolder();
    const video = store.getVideo(videoHash);
    if (folder === null || !video || !isUnderFolder(folder, video.file)) {
      res.status(400).json({ error: "That video is not in the current Library Folder." });
      return;
    }
    try {
      const clip = store.createClip(videoHash, input);
      res.status(201).json(visibleClip(folder, clip));
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.delete("/api/clips/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "A numeric clip id is required." });
      return;
    }
    if (!store.deleteClip(id)) {
      res.status(404).json({ error: "No such clip." });
      return;
    }
    res.status(204).end();
  });

  app.get("/video/*", (req, res) => {
    const rawPath = (req.params as Record<string, string | undefined>)["0"] ?? "";
    const folder = libraryFolder();
    const abs = folder === null ? null : resolveVideoPath(folder, rawPath);
    if (!abs) {
      res.status(403).send("Forbidden");
      return;
    }
    let size: number;
    try {
      const stat = fs.statSync(abs);
      if (!stat.isFile()) throw new Error("not a file");
      size = stat.size;
    } catch {
      res.status(404).send("Not found");
      return;
    }
    streamRange(abs, size, req, res);
  });

  app.use("/thumbnails", express.static(thumbnailDir));

  const distDir = findDistDir();
  if (distDir) {
    app.use(express.static(distDir));
    app.get("*", (req, res) => {
      if (
        req.path.startsWith("/api/") ||
        req.path.startsWith("/video/") ||
        req.path.startsWith("/thumbnails/")
      ) {
        res.status(404).send("Not found");
        return;
      }
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  return app;
}
