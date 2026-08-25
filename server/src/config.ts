import fs from "node:fs";
import path from "node:path";

export const HOST = "0.0.0.0";
export const PORT = 8899;
export const DB_RELATIVE_PATH = "data/clipmark.db";

const MAX_DEPTH = 3;

export function walkUp(startDir: string, marker: string): string | null {
  let dir = startDir;
  for (let i = 0; i < MAX_DEPTH; i++) {
    if (fs.existsSync(path.join(dir, marker))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

export function findRepoRoot(): string {
  return walkUp(import.meta.dirname, "package.json") ?? import.meta.dirname;
}

export function findDataDir(env: Record<string, string | undefined> = process.env): string {
  return env.CLIPMARK_DATA_DIR ?? path.join(findRepoRoot(), "data");
}
