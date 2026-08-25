import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { createApp, type AppOptions } from "../server/src/app";
import { computeFileHash, type ScanDeps } from "../server/src/scanner";
import { Store } from "../server/src/store";

/**
 * HTTP-level suite over createApp (ADR-0005): in-memory Store, temp folders as
 * Library Folders, injected scanDeps (no ffmpeg) and networkInterfaces fixtures.
 */

const fakeScanDeps: ScanDeps = {
  stat: (f) => Math.round(fs.statSync(f).mtimeMs),
  hash: computeFileHash,
  probeDuration: async () => 90,
  extractThumbnail: async (_f, thumbPath) => {
    fs.mkdirSync(path.dirname(thumbPath), { recursive: true });
    fs.writeFileSync(thumbPath, "thumb");
  },
};

const TAILSCALE_UP = (() => ({
  lo0: [{ address: "127.0.0.1", family: "IPv4", internal: true }],
  en0: [
    { address: "fe80::1", family: "IPv6", internal: false },
    { address: "192.168.1.23", family: "IPv4", internal: false },
  ],
  utun3: [{ address: "100.101.102.103", family: "IPv4", internal: false }],
})) as unknown as AppOptions["networkInterfaces"];

const TAILSCALE_DOWN = (() => ({
  lo0: [{ address: "127.0.0.1", family: "IPv4", internal: true }],
  en0: [{ address: "192.168.1.23", family: "IPv4", internal: false }],
})) as unknown as AppOptions["networkInterfaces"];

let root: string;
let store: Store;
let server: Server | null = null;
let base = "";

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "clipmark-app-"));
  store = new Store(new Database(":memory:"));
});

afterEach(async () => {
  if (server) await new Promise<void>((r) => server!.close(() => r()));
  server = null;
  store.close();
  fs.rmSync(root, { recursive: true, force: true });
});

async function start(opts: Partial<AppOptions> = {}): Promise<void> {
  const app = createApp({
    store,
    thumbnailDir: path.join(root, "thumbs"),
    scanDeps: fakeScanDeps,
    networkInterfaces: TAILSCALE_UP,
    env: {},
    port: 8899,
    ...opts,
  });
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
}

function folder(name: string, files: Record<string, string> = {}): string {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return dir;
}

async function request(method: string, url: string, body?: unknown) {
  const res = await fetch(base + url, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = res.headers.get("content-type")?.includes("json") ? await res.json() : null;
  return { status: res.status, body: json };
}
const get = (url: string) => request("GET", url);
const put = (url: string, body: unknown) => request("PUT", url, body);
const post = (url: string, body: unknown) => request("POST", url, body);

describe("GET /api/settings", () => {
  it("reports no Library Folder on a fresh install without the env var", async () => {
    await start();
    const { status, body } = await get("/api/settings");
    expect(status).toBe(200);
    expect(body).toEqual({
      libraryFolder: null,
      tailscaleIp: "100.101.102.103",
      lanIp: "192.168.1.23",
      port: 8899,
    });
  });

  it("seeds the Library Folder from CLIPMARK_VIDEO_DIR once, when the row is missing", async () => {
    const seeded = folder("seeded");
    await start({ env: { CLIPMARK_VIDEO_DIR: seeded } });
    expect((await get("/api/settings")).body.libraryFolder).toBe(seeded);

    // A later launch with a different env var must not overwrite the saved setting.
    await new Promise<void>((r) => server!.close(() => r()));
    server = null;
    await start({ env: { CLIPMARK_VIDEO_DIR: folder("other") } });
    expect((await get("/api/settings")).body.libraryFolder).toBe(seeded);
  });

  it("ignores a CLIPMARK_VIDEO_DIR that is not a directory, so first run still opens Settings", async () => {
    await start({ env: { CLIPMARK_VIDEO_DIR: path.join(root, "gone") } });
    expect((await get("/api/settings")).body.libraryFolder).toBeNull();
  });

  it("shows Tailscale as not connected when no 100.64.0.0/10 interface exists", async () => {
    await start({ networkInterfaces: TAILSCALE_DOWN });
    const { body } = await get("/api/settings");
    expect(body.tailscaleIp).toBeNull();
    expect(body.lanIp).toBe("192.168.1.23");
  });
});

describe("PUT /api/settings", () => {
  it("saves a valid directory and reports the resolved path with the video count", async () => {
    await start();
    const lib = folder("lib", { "a.mp4": "aaa", "Choreography/b.mov": "bbb", "notes.txt": "x" });
    const { status, body } = await put("/api/settings", { libraryFolder: lib + "/" });
    expect(status).toBe(200);
    expect(body.libraryFolder).toBe(lib);
    expect(body.videoCount).toBe(2);
    expect((await get("/api/settings")).body.libraryFolder).toBe(lib);
  });

  it("rejects a missing path, a file, a relative path and a blank value without saving", async () => {
    await start();
    const lib = folder("lib", { "a.mp4": "aaa" });
    const cases: unknown[] = [path.join(root, "nope"), path.join(lib, "a.mp4"), "relative/dir", "", 42];
    for (const libraryFolder of cases) {
      const { status, body } = await put("/api/settings", { libraryFolder });
      expect(status, String(libraryFolder)).toBe(400);
      expect(typeof body.error).toBe("string");
    }
    expect((await get("/api/settings")).body.libraryFolder).toBeNull();
  });
});

describe("Library Folder applies live", () => {
  it("serves an empty library and no streams until a folder is set", async () => {
    await start();
    expect((await get("/api/tree")).body).toEqual({ videos: [] });
    expect((await get("/api/clips")).body).toEqual([]);
    expect((await fetch(base + "/video/a.mp4")).status).toBe(403);
  });

  it("changes what /api/tree returns and where /video streams from on the next call", async () => {
    const a = folder("A", { "alpha.mp4": "alpha bytes" });
    const b = folder("B", { "Classes/beta.mp4": "beta bytes" });
    await start({ env: { CLIPMARK_VIDEO_DIR: a } });

    let tree = (await get("/api/tree")).body;
    expect(tree.videos.map((v: { file: string }) => v.file)).toEqual(["alpha.mp4"]);
    expect((await fetch(base + "/video/alpha.mp4")).status).toBe(200);

    await put("/api/settings", { libraryFolder: b });

    tree = (await get("/api/tree")).body;
    expect(tree.videos.map((v: { file: string }) => v.file)).toEqual(["Classes/beta.mp4"]);
    const stream = await fetch(base + "/video/Classes/beta.mp4");
    expect(stream.status).toBe(200);
    expect(await stream.text()).toBe("beta bytes");
    expect((await fetch(base + "/video/alpha.mp4")).status).toBe(404);
    expect((await fetch(base + "/video/..%2FA%2Falpha.mp4")).status).toBe(403);
  });
});

describe("Clips outside the Library Folder", () => {
  it("are hidden from /api/clips and /api/tree while the folder is elsewhere, and come back", async () => {
    const a = folder("A", { "Choreography/alpha.mp4": "alpha bytes" });
    const b = folder("B", { "beta.mp4": "beta bytes" });
    await start({ env: { CLIPMARK_VIDEO_DIR: a } });
    const [alpha] = (await get("/api/tree")).body.videos;

    const created = await post("/api/clips", {
      videoHash: alpha.hash,
      startSeconds: 10,
      endSeconds: 20,
      note: "",
      tags: ["swing out"],
    });
    expect(created.status).toBe(201);
    expect(created.body.file).toBe("Choreography/alpha.mp4");
    expect((await get("/api/clips")).body.map((c: { file: string }) => c.file)).toEqual([
      "Choreography/alpha.mp4",
    ]);

    await put("/api/settings", { libraryFolder: b });
    expect((await get("/api/clips")).body).toEqual([]);
    expect((await get("/api/tree")).body.videos.map((v: { hash: string }) => v.hash)).not.toContain(
      alpha.hash,
    );

    await put("/api/settings", { libraryFolder: a });
    const back = (await get("/api/clips")).body;
    expect(back).toHaveLength(1);
    expect(back[0]).toMatchObject({ id: created.body.id, file: "Choreography/alpha.mp4", tags: ["swing out"] });
    const row = (await get("/api/tree")).body.videos.find((v: { hash: string }) => v.hash === alpha.hash);
    expect(row.clipCount).toBe(1);
  });

  it("refuses a Clip on a Video outside the current Library Folder", async () => {
    const a = folder("A", { "alpha.mp4": "alpha bytes" });
    await start({ env: { CLIPMARK_VIDEO_DIR: a } });
    const [alpha] = (await get("/api/tree")).body.videos;
    await put("/api/settings", { libraryFolder: folder("B") });
    const { status, body } = await post("/api/clips", {
      videoHash: alpha.hash,
      startSeconds: 1,
      endSeconds: 2,
      note: "",
      tags: [],
    });
    expect(status).toBe(400);
    expect(body.error).toMatch(/Library Folder/);
  });

  it("does not prefix legacy relative rows with a folder that holds none of their files", async () => {
    const a = folder("A", { "alpha.mp4": "alpha bytes" });
    const wrong = folder("Wrong", { "other.mp4": "other" });
    const hash = computeFileHash(path.join(a, "alpha.mp4"));
    store.upsertVideo(hash, "alpha.mp4");
    store.createClip(hash, { startSeconds: 1, endSeconds: 2, note: "old", tags: [] });
    await start();

    await put("/api/settings", { libraryFolder: wrong });
    expect(store.getVideos()[0].file).toBe("alpha.mp4");

    await put("/api/settings", { libraryFolder: a });
    expect(store.getVideos()[0].file).toBe(path.join(a, "alpha.mp4"));
    expect((await get("/api/clips")).body.map((c: { file: string }) => c.file)).toEqual(["alpha.mp4"]);
  });

  it("migrates pre-ADR-0005 relative rows once the folder is known, so their Clips stay visible", async () => {
    const a = folder("A", { "alpha.mp4": "alpha bytes" });
    const hash = computeFileHash(path.join(a, "alpha.mp4"));
    store.upsertVideo(hash, "alpha.mp4");
    store.createClip(hash, { startSeconds: 1, endSeconds: 2, note: "old", tags: [] });
    await start({ env: { CLIPMARK_VIDEO_DIR: a } });

    const clips = (await get("/api/clips")).body;
    expect(clips).toHaveLength(1);
    expect(clips[0].file).toBe("alpha.mp4");
    expect(store.getVideos()[0].file).toBe(path.join(a, "alpha.mp4"));
  });
});
