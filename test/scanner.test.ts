import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { Store } from "../server/src/store";
import { computeFileHash, scanVideoDir, type ScanDeps } from "../server/src/scanner";

interface Fakes {
  mtimes: Map<string, number>;
  hashCalls: string[];
  probeCalls: string[];
  extractCalls: { file: string; thumbPath: string; seek: number }[];
  deps: ScanDeps;
}

function makeFakes(): Fakes {
  const mtimes = new Map<string, number>();
  const hashCalls: string[] = [];
  const probeCalls: string[] = [];
  const extractCalls: { file: string; thumbPath: string; seek: number }[] = [];
  const deps: ScanDeps = {
    stat: (f) => mtimes.get(f) ?? 0,
    hash: (f) => {
      hashCalls.push(f);
      return computeFileHash(f);
    },
    probeDuration: async (f) => {
      probeCalls.push(f);
      return 120.5;
    },
    extractThumbnail: async (f, thumbPath, seek) => {
      extractCalls.push({ file: f, thumbPath, seek });
      fs.mkdirSync(path.dirname(thumbPath), { recursive: true });
      fs.writeFileSync(thumbPath, "thumb");
    },
  };
  return { mtimes, hashCalls, probeCalls, extractCalls, deps };
}

function openStore() {
  return new Store(new Database(":memory:"));
}

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "clipmark-scan-"));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function writeVideo(rel: string, content: string): string {
  const abs = path.join(root, "videos", rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  return abs;
}

describe("tree scan (mtime-cached hashing, duration, thumbnails)", () => {
  it("walks the dir, hashing/probing/extracting each video and persisting the cache", async () => {
    const { mtimes, probeCalls, extractCalls, deps } = makeFakes();
    const alpha = writeVideo("alpha.mp4", "alpha");
    const beta = writeVideo("SubFolder/beta.mov", "beta");
    mtimes.set(alpha, 1000);
    mtimes.set(beta, 2000);
    const store = openStore();

    const result = await scanVideoDir(store, path.join(root, "videos"), path.join(root, "thumbs"), deps);

    expect(result).toHaveLength(2);
    const alphaEntry = result.find((v) => v.file === "alpha.mp4");
    const betaEntry = result.find((v) => v.file === "SubFolder/beta.mov");
    expect(alphaEntry?.hash).toBe(computeFileHash(alpha));
    expect(alphaEntry?.durationSeconds).toBe(120.5);
    expect(alphaEntry?.thumbnail).toBe(`/thumbnails/${computeFileHash(alpha)}.jpg`);
    expect(alphaEntry?.fileMtime).toBe(1000);
    expect(betaEntry?.durationSeconds).toBe(120.5);
    expect(probeCalls).toHaveLength(2);
    expect(extractCalls).toHaveLength(2);
    expect(fs.existsSync(path.join(root, "thumbs", `${computeFileHash(alpha)}.jpg`))).toBe(true);

    const videos = store.getVideos();
    expect(videos).toHaveLength(2);
    expect(videos[0].fileMtime).toBe(1000);
    expect(videos[0].durationSeconds).toBe(120.5);
    expect(videos[0].thumbnail).toBe(`/thumbnails/${computeFileHash(alpha)}.jpg`);
  });

  it("stores the absolute path while reporting the folder-relative one (ADR-0005)", async () => {
    const { mtimes, deps } = makeFakes();
    const alpha = writeVideo("SubFolder/alpha.mp4", "alpha");
    mtimes.set(alpha, 1000);
    const store = openStore();

    const result = await scanVideoDir(store, path.join(root, "videos"), path.join(root, "thumbs"), deps);

    expect(result[0].file).toBe("SubFolder/alpha.mp4");
    expect(store.getVideos()[0].file).toBe(alpha);
  });

  it("does not reuse the cache for a same-named file in a different Library Folder", async () => {
    const { mtimes, deps } = makeFakes();
    const alpha = writeVideo("alpha.mp4", "alpha");
    const otherDir = path.join(root, "elsewhere");
    fs.mkdirSync(otherDir, { recursive: true });
    const other = path.join(otherDir, "alpha.mp4");
    fs.writeFileSync(other, "completely different bytes");
    mtimes.set(alpha, 1000);
    mtimes.set(other, 1000);
    const store = openStore();

    await scanVideoDir(store, path.join(root, "videos"), path.join(root, "thumbs"), deps);
    const result = await scanVideoDir(store, otherDir, path.join(root, "thumbs"), deps);

    expect(result).toHaveLength(1);
    expect(result[0].hash).toBe(computeFileHash(other));
    expect(result[0].hash).not.toBe(computeFileHash(alpha));
  });

  it("reuses the cache when mtimes are unchanged — no re-hash, probe, or extract", async () => {
    const { mtimes, hashCalls, probeCalls, extractCalls, deps } = makeFakes();
    const alpha = writeVideo("alpha.mp4", "alpha");
    mtimes.set(alpha, 1000);
    const store = openStore();

    await scanVideoDir(store, path.join(root, "videos"), path.join(root, "thumbs"), deps);
    const first = hashCalls.length;

    const result = await scanVideoDir(store, path.join(root, "videos"), path.join(root, "thumbs"), deps);

    expect(hashCalls.length).toBe(first);
    expect(probeCalls).toHaveLength(1);
    expect(extractCalls).toHaveLength(1);
    expect(result[0].durationSeconds).toBe(120.5);
  });

  it("recomputes only the file whose mtime changed", async () => {
    const { mtimes, probeCalls, extractCalls, deps } = makeFakes();
    const alpha = writeVideo("alpha.mp4", "alpha");
    const beta = writeVideo("beta.mp4", "beta");
    mtimes.set(alpha, 1000);
    mtimes.set(beta, 2000);
    const store = openStore();

    await scanVideoDir(store, path.join(root, "videos"), path.join(root, "thumbs"), deps);
    mtimes.set(alpha, 3000);
    await scanVideoDir(store, path.join(root, "videos"), path.join(root, "thumbs"), deps);

    expect(probeCalls).toHaveLength(3);
    expect(extractCalls).toHaveLength(3);
    expect(probeCalls.filter((f) => f === alpha)).toHaveLength(2);
    expect(probeCalls.filter((f) => f === beta)).toHaveLength(1);
  });

  it("fills the cache for videos imported from YAML (known hash, no mtime yet)", async () => {
    const { mtimes, probeCalls, deps } = makeFakes();
    const alpha = writeVideo("alpha.mp4", "alpha");
    mtimes.set(alpha, 1000);
    const store = openStore();
    store.upsertVideo(computeFileHash(alpha), "alpha.mp4");

    const result = await scanVideoDir(store, path.join(root, "videos"), path.join(root, "thumbs"), deps);

    expect(probeCalls).toHaveLength(1);
    const video = store.getVideoByFile(alpha);
    expect(video?.fileMtime).toBe(1000);
    expect(video?.durationSeconds).toBe(120.5);
    expect(video?.thumbnail).toBe(`/thumbnails/${computeFileHash(alpha)}.jpg`);
    expect(result[0].hash).toBe(computeFileHash(alpha));
  });

  it("reuses cached duration/thumbnail when a file moves (same hash, same mtime)", async () => {
    const { mtimes, probeCalls, extractCalls, deps } = makeFakes();
    const alpha = writeVideo("alpha.mp4", "alpha");
    mtimes.set(alpha, 1000);
    const store = openStore();

    await scanVideoDir(store, path.join(root, "videos"), path.join(root, "thumbs"), deps);

    fs.mkdirSync(path.join(root, "videos", "moved"), { recursive: true });
    const moved = path.join(root, "videos", "moved", "alpha.mp4");
    fs.renameSync(alpha, moved);
    mtimes.set(moved, 1000);
    mtimes.delete(alpha);

    const result = await scanVideoDir(store, path.join(root, "videos"), path.join(root, "thumbs"), deps);

    expect(probeCalls).toHaveLength(1);
    expect(extractCalls).toHaveLength(1);
    expect(result[0].file).toBe("moved/alpha.mp4");
    expect(result[0].durationSeconds).toBe(120.5);
  });

  it("returns an empty list for an empty directory", async () => {
    const { mtimes, deps } = makeFakes();
    fs.mkdirSync(path.join(root, "videos"), { recursive: true });
    const store = openStore();

    const result = await scanVideoDir(store, path.join(root, "videos"), path.join(root, "thumbs"), deps);

    expect(result).toEqual([]);
    void mtimes;
  });

  it("ignores non-video files", async () => {
    const { mtimes, deps } = makeFakes();
    const txt = writeVideo("notes.txt", "hello");
    mtimes.set(txt, 1000);
    const store = openStore();

    const result = await scanVideoDir(store, path.join(root, "videos"), path.join(root, "thumbs"), deps);

    expect(result).toEqual([]);
  });
});
