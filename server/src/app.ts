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
  COLORS,
  deriveAddresses,
  FONTS,
  getAppearance,
  getCookiesFromBrowser,
  isColor,
  isFont,
  setAppearance,
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
import {
  audioMime,
  countTracks,
  getMusicConfig,
  intParam,
  listCrates,
  listPlaylists,
  listTracks,
  openMixxx,
  setMusicConfig,
  trackLocation,
  validateMixxxDb,
  validateMusicBase,
  type PathValidation,
} from "./music.js";
import { QuerySqlError } from "./musicQuery.js";
import { mimeForFile, parseRange, resolveVideoPath } from "./videoStream.js";
import { createYtDlpDownloader } from "./ytdlp.js";

/** Every key PUT /api/settings accepts; a body with none of them saves nothing. */
const SETTINGS_KEYS = ["libraryFolder", "cookiesFromBrowser", "mixxxDbPath", "musicBase", "font", "color"] as const;

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

function streamRange(
  abs: string,
  size: number,
  req: Request,
  res: Response,
  contentType: string = mimeForFile(abs),
): void {
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Type", contentType);
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
  /** Environment used for the one-time CLIPMARK_VIDEO_DIR seed and the Music tab's MIXXX_DB_PATH / MUSIC_BASE fallbacks. */
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
  const downloads = new DownloadQueue({
    downloader,
    thumbnailDir,
    hash: scanDeps.hash,
    saveSource: (hash, source) => store.setSource(hash, source),
  });

  const musicConfig = () => getMusicConfig(store, env);

  const settingsResponse = async () => ({
    libraryFolder: libraryFolder(),
    ...musicConfig(),
    ...deriveAddresses(networkInterfaces),
    port,
    cookiesFromBrowser: getCookiesFromBrowser(store),
    ...getAppearance(store),
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
      const body = (req.body ?? {}) as Partial<Record<(typeof SETTINGS_KEYS)[number], unknown>>;
      if (SETTINGS_KEYS.every((key) => body[key] === undefined)) {
        res.status(400).json({ error: "Nothing to save." });
        return;
      }
      const folderResult = body.libraryFolder === undefined ? null : validateLibraryFolder(body.libraryFolder);
      if (folderResult && !folderResult.ok) {
        res.status(400).json({ error: folderResult.error });
        return;
      }
      const dbResult = body.mixxxDbPath === undefined ? null : validateMixxxDb(body.mixxxDbPath);
      const baseResult = body.musicBase === undefined ? null : validateMusicBase(body.musicBase);
      for (const r of [dbResult, baseResult] as (PathValidation | null)[]) {
        if (r && !r.ok) {
          res.status(400).json({ error: r.error });
          return;
        }
      }
      if (body.cookiesFromBrowser !== undefined && !isCookiesFromBrowser(body.cookiesFromBrowser)) {
        res.status(400).json({ error: "Cookies from browser must be none, chrome, safari or firefox." });
        return;
      }
      if (body.font !== undefined && !isFont(body.font)) {
        res.status(400).json({ error: `Font must be ${FONTS.join(" or ")}.` });
        return;
      }
      if (body.color !== undefined && !isColor(body.color)) {
        res.status(400).json({ error: `Color must be ${COLORS.join(" or ")}.` });
        return;
      }
      if (folderResult?.ok) setLibraryFolder(store, folderResult.folder);
      if (isCookiesFromBrowser(body.cookiesFromBrowser)) setCookiesFromBrowser(store, body.cookiesFromBrowser);
      setAppearance(store, {
        font: isFont(body.font) ? body.font : undefined,
        color: isColor(body.color) ? body.color : undefined,
      });
      setMusicConfig(store, {
        mixxxDbPath: dbResult?.ok ? dbResult.path : undefined,
        musicBase: baseResult?.ok ? baseResult.path : undefined,
      });
      const folder = libraryFolder();
      res.json({
        ...(await settingsResponse()),
        videoCount: folder === null ? 0 : listVideoFiles(folder).length,
        ...(dbResult || baseResult ? { trackCount: musicTrackCount() } : {}),
      });
    }),
  );

  // ---------- Music tab: the Mixxx library, read-only ----------

  /**
   * Runs `fn` against a fresh read-only connection; 503 when the Mixxx library can't be opened.
   * An async open comes first because opening a file in Mixxx's sandbox container waits on
   * macOS's "access data from other apps" prompt (a stat does not): that wait must park a
   * libuv worker, not the event loop (better-sqlite3 opens synchronously), or every request
   * stalls with it.
   */
  const withMixxx = async (res: Response, fn: (db: ReturnType<typeof openMixxx>) => void): Promise<void> => {
    const { mixxxDbPath } = musicConfig();
    let db: ReturnType<typeof openMixxx>;
    try {
      await (await fs.promises.open(mixxxDbPath, "r")).close();
      db = openMixxx(mixxxDbPath);
    } catch (err) {
      res.status(503).json({
        error: `Couldn't open the Mixxx library at ${mixxxDbPath}: ${(err as Error).message}`,
      });
      return;
    }
    try {
      fn(db);
    } finally {
      db.close();
    }
  };

  const musicTrackCount = (): number | null => {
    try {
      const db = openMixxx(musicConfig().mixxxDbPath);
      try {
        return countTracks(db);
      } finally {
        db.close();
      }
    } catch {
      return null;
    }
  };

  app.get(
    "/api/music/crates",
    asyncHandler((_req, res) => withMixxx(res, (db) => res.json(listCrates(db)))),
  );

  app.get(
    "/api/music/playlists",
    asyncHandler((_req, res) => withMixxx(res, (db) => res.json(listPlaylists(db)))),
  );

  app.get(
    "/api/music/tracks",
    asyncHandler(async (req, res) => {
      const q = req.query;
      await withMixxx(res, (db) => {
        try {
          res.json(
            listTracks(db, {
              crate: intParam(q.crate),
              playlist: intParam(q.playlist),
              q: typeof q.q === "string" ? q.q : undefined,
              sort: typeof q.sort === "string" ? q.sort : undefined,
              order: typeof q.order === "string" ? q.order : undefined,
            }),
          );
        } catch (err) {
          if (!(err instanceof QuerySqlError)) throw err;
          res.status(400).json({ error: err.message });
        }
      });
    }),
  );

  app.get(
    "/api/music/audio/:id",
    asyncHandler(async (req, res) => {
      const id = intParam(req.params.id);
      if (id === undefined) {
        res.status(404).send("Track not found");
        return;
      }
      await withMixxx(res, (db) => {
        const row = trackLocation(db, id);
        if (!row) {
          res.status(404).send("Track not found");
          return;
        }
        if (!isUnderFolder(musicConfig().musicBase, row.location)) {
          res.status(403).send("Forbidden");
          return;
        }
        let size: number;
        try {
          const stat = fs.statSync(row.location);
          if (!stat.isFile()) throw new Error("not a file");
          size = stat.size;
        } catch {
          res.status(404).send("File not found");
          return;
        }
        streamRange(row.location, size, req, res, audioMime(row.filetype));
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
      const sources = store.getSources();
      const videos = scanned.map((s) => {
        const stat = stats.get(s.hash);
        const source = sources.get(s.hash) ?? null;
        return {
          hash: s.hash,
          file: s.file,
          fileMtime: s.fileMtime,
          durationSeconds: s.durationSeconds,
          // The Source's local preview image replaces the mid-frame thumbnail (ADR-0009).
          thumbnail: source?.preview ?? s.thumbnail,
          clipCount: stat?.clipCount ?? 0,
          firstClipStart: stat?.firstClipStart ?? null,
          source,
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

  /** A create or update body as a ClipInput, or the 400 message (same rules for both). */
  const clipInput = (raw: unknown): ClipInput | { error: string } => {
    const body = (raw ?? {}) as Partial<ClipInput>;
    const { startSeconds, endSeconds } = body;
    if (
      typeof startSeconds !== "number" ||
      typeof endSeconds !== "number" ||
      !Number.isFinite(startSeconds) ||
      !Number.isFinite(endSeconds)
    ) {
      return { error: "Start and end times must be numbers." };
    }
    if (!(endSeconds > startSeconds)) return { error: "The clip has to end after it starts." };
    return {
      startSeconds,
      endSeconds,
      note: typeof body.note === "string" ? body.note : "",
      tags: strings(body.tags),
      dancers: strings(body.dancers),
    };
  };

  app.post("/api/clips", (req, res) => {
    const videoHash = ((req.body ?? {}) as { videoHash?: string }).videoHash;
    if (!videoHash) {
      res.status(400).json({ error: "A video hash is required." });
      return;
    }
    const input = clipInput(req.body);
    if ("error" in input) {
      res.status(400).json(input);
      return;
    }
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

  // Full replacement of a Clip's times, Note, Dancers and Tags (ADR-0008).
  app.put("/api/clips/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "A numeric clip id is required." });
      return;
    }
    const input = clipInput(req.body);
    if ("error" in input) {
      res.status(400).json(input);
      return;
    }
    // A Clip on a Video outside the Library Folder is hidden, so it is unknown here too.
    const folder = libraryFolder();
    const existing = store.getClip(id);
    if (folder === null || !existing || !visibleClip(folder, existing)) {
      res.status(404).json({ error: "No such clip." });
      return;
    }
    try {
      const updated = store.updateClip(id, input);
      if (!updated) {
        // Deleted between the check above and the update.
        res.status(404).json({ error: "No such clip." });
        return;
      }
      res.json(visibleClip(folder, updated));
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

/** The strings in a JSON field that should be a list of them; anything else is dropped. */
function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((t): t is string => typeof t === "string") : [];
}
