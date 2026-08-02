import path from "node:path";
import express from "express";
import { walkUp } from "./config.js";

function findDistDir(): string | null {
  return walkUp(import.meta.dirname, "dist/index.html");
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
