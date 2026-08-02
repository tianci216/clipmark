import fs from "node:fs";
import path from "node:path";
import type { Request, Response } from "express";
import express from "express";
import { walkUp } from "./config.js";
import { scanVideoDir } from "./scanner.js";
import type { ClipInput, Store } from "./store.js";
import { mimeForFile, parseRange, resolveVideoPath } from "./videoStream.js";

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
  videoDir: string;
  thumbnailDir: string;
}

export function createApp({ store, videoDir, thumbnailDir }: AppOptions) {
  const app = express();
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get(
    "/api/tree",
    asyncHandler(async (_req, res) => {
      const scanned = await scanVideoDir(store, videoDir, thumbnailDir);
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
      res.json({ videos });
    }),
  );

  app.get("/api/clips", (_req, res) => {
    res.json(store.getClips());
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
    try {
      const clip = store.createClip(videoHash, input);
      res.status(201).json(clip);
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
    const abs = resolveVideoPath(videoDir, rawPath);
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
