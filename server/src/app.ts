import path from "node:path";
import type { Request, Response } from "express";
import express from "express";
import { walkUp } from "./config.js";
import { scanVideoDir } from "./scanner.js";
import type { Store } from "./store.js";

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
