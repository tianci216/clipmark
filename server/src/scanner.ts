import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { Store } from "./store.js";

const execFileAsync = promisify(execFile);

export const VIDEO_EXTENSIONS = [".mp4", ".mov"];
export const HASH_BYTES = 65536;
const THUMB_URL_PREFIX = "/thumbnails";

export function computeFileHash(file: string): string {
  const fd = fs.openSync(file, "r");
  const buf = Buffer.alloc(HASH_BYTES);
  const bytesRead = fs.readSync(fd, buf, 0, HASH_BYTES, 0);
  fs.closeSync(fd);
  return crypto
    .createHash("sha256")
    .update(buf.subarray(0, bytesRead))
    .digest("hex")
    .slice(0, 16);
}

export async function probeDuration(file: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        file,
      ],
      { timeout: 15000 },
    );
    const seconds = Number.parseFloat(stdout.trim());
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
  } catch {
    return null;
  }
}

export async function extractThumbnail(
  file: string,
  thumbPath: string,
  seekSeconds: number,
): Promise<void> {
  fs.mkdirSync(path.dirname(thumbPath), { recursive: true });
  await execFileAsync(
    "ffmpeg",
    [
      "-y",
      "-ss", String(seekSeconds),
      "-i", file,
      "-frames:v", "1",
      "-vf", "scale=480:-2",
      thumbPath,
    ],
    { timeout: 30000 },
  );
}

export interface ScanDeps {
  stat(file: string): number;
  hash(file: string): string;
  probeDuration(file: string): Promise<number | null>;
  extractThumbnail(file: string, thumbPath: string, seekSeconds: number): Promise<void>;
}

export const realDeps: ScanDeps = {
  stat: (file) => fs.statSync(file).mtimeMs,
  hash: computeFileHash,
  probeDuration,
  extractThumbnail,
};

export interface ScannedVideo {
  hash: string;
  file: string;
  fileMtime: number;
  durationSeconds: number | null;
  thumbnail: string | null;
}

interface VideoFile {
  abs: string;
  rel: string;
}

function walkVideoFiles(dir: string, relDir: string, out: VideoFile[]): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const abs = path.join(dir, entry.name);
    const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      walkVideoFiles(abs, rel, out);
    } else if (
      entry.isFile() &&
      VIDEO_EXTENSIONS.includes(path.extname(entry.name).toLowerCase())
    ) {
      out.push({ abs, rel });
    }
  }
}

function seekFor(durationSeconds: number | null): number {
  if (durationSeconds != null && durationSeconds > 1) return durationSeconds / 2;
  return 1;
}

export async function scanVideoDir(
  store: Store,
  videoDir: string,
  thumbDir: string,
  deps: ScanDeps = realDeps,
): Promise<ScannedVideo[]> {
  const files: VideoFile[] = [];
  if (fs.existsSync(videoDir)) walkVideoFiles(videoDir, "", files);

  const results: ScannedVideo[] = [];
  for (const { abs, rel } of files) {
    try {
      const fileMtime = Math.round(deps.stat(abs));
      const cached = store.getVideoByFile(rel);
      if (cached && cached.fileMtime === fileMtime) {
        results.push({
          hash: cached.hash,
          file: rel,
          fileMtime,
          durationSeconds: cached.durationSeconds,
          thumbnail: cached.thumbnail,
        });
        continue;
      }

      const hash = deps.hash(abs);
      store.upsertVideo(hash, rel);

      let durationSeconds: number | null = null;
      let thumbnail: string | null = null;
      const existing = store.getVideo(hash);
      if (
        existing &&
        existing.fileMtime === fileMtime &&
        existing.durationSeconds != null &&
        existing.thumbnail != null
      ) {
        durationSeconds = existing.durationSeconds;
        thumbnail = existing.thumbnail;
      } else {
        durationSeconds = await deps.probeDuration(abs);
        const thumbPath = path.join(thumbDir, `${hash}.jpg`);
        await deps.extractThumbnail(abs, thumbPath, seekFor(durationSeconds));
        thumbnail = `${THUMB_URL_PREFIX}/${hash}.jpg`;
      }
      store.updateVideoCache(hash, { fileMtime, durationSeconds, thumbnail });

      results.push({ hash, file: rel, fileMtime, durationSeconds, thumbnail });
    } catch (err) {
      console.error(`Tree scan skipped ${rel}:`, err);
    }
  }
  return results;
}
