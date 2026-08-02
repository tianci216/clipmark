import fs from "node:fs";
import path from "node:path";
import express from "express";

const MAX_DEPTH = 3;

function findDistDir(): string | null {
  let dir = import.meta.dirname;
  for (let i = 0; i < MAX_DEPTH; i++) {
    const candidate = path.join(dir, "dist");
    if (fs.existsSync(path.join(candidate, "index.html"))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

export function createApp() {
  const app = express();
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  const distDir = findDistDir();
  if (distDir) {
    app.use(express.static(distDir));
    app.get("*", (req, res) => {
      if (req.path.startsWith("/api/") || req.path.startsWith("/video/")) {
        res.status(404).send("Not found");
        return;
      }
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  return app;
}
