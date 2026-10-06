import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { createApp, type AppOptions } from "../server/src/app";
import { defaultMixxxDbPath, defaultMusicBase } from "../server/src/music";
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
    downloader: fakeDownloader(null).downloader,
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
      mixxxDbPath: defaultMixxxDbPath(),
      musicBase: defaultMusicBase(),
      tailscaleIp: "100.101.102.103",
      lanIp: "192.168.1.23",
      port: 8899,
      cookiesFromBrowser: "chrome",
      font: "public-sans",
      color: "paper",
      ytDlp: null,
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
    expect((await get("/api/tree")).body).toEqual({ videos: [], folders: [] });
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

describe("GET /api/tree folders", () => {
  it("lists every subfolder of the Library Folder, including empty ones, for the Download picker", async () => {
    const lib = folder("lib", { "Choreography/Sweet Vanilla/a.mp4": "a", "notes.txt": "x" });
    fs.mkdirSync(path.join(lib, "Classes"));
    fs.mkdirSync(path.join(lib, ".hidden"));
    await start({ env: { CLIPMARK_VIDEO_DIR: lib } });
    const { body } = await get("/api/tree");
    expect(body.folders).toEqual(["Choreography", "Choreography/Sweet Vanilla", "Classes"]);
  });

  it("is empty with no Library Folder", async () => {
    await start();
    expect((await get("/api/tree")).body).toEqual({ videos: [], folders: [] });
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

/* ---------------- Downloads (fake downloader) ---------------- */

import type { Downloader, DownloadEvents, DownloadRequest } from "../server/src/downloads";

interface FakeRun {
  request: DownloadRequest;
  events: DownloadEvents;
  cancelled: boolean;
}

/** Scripted downloader: the test drives progress / exit by hand. */
function fakeDownloader(status: { path: string; version: string } | null = { path: "/opt/homebrew/bin/yt-dlp", version: "2026.06.09" }) {
  const runs: FakeRun[] = [];
  let cookieResult: { ok: boolean; output: string } = { ok: true, output: "" };
  const downloader: Downloader = {
    start(request, events) {
      const run: FakeRun = { request, events, cancelled: false };
      runs.push(run);
      return {
        cancel: () => {
          run.cancelled = true;
        },
      };
    },
    testCookies: async () => cookieResult,
    status: async () => status,
  };
  return {
    downloader,
    runs,
    setCookieResult(r: { ok: boolean; output: string }) {
      cookieResult = r;
    },
    /** Pretend yt-dlp wrote a partial file, then finished with the final file. */
    finish(run: FakeRun, filename: string) {
      const dir = path.dirname(run.request.outputTemplate);
      fs.writeFileSync(path.join(dir, filename), "video bytes");
      run.events.onExit({ code: 0, filepath: path.join(dir, filename), stderrTail: "" });
    },
    fail(run: FakeRun, stderr: string) {
      run.events.onExit({ code: 1, filepath: null, stderrTail: stderr });
    },
  };
}

const settle = () => new Promise((r) => setTimeout(r, 5));

describe("POST /api/downloads", () => {
  it("queues a job for a subfolder and reports it with progress, then the landed file", async () => {
    const lib = folder("lib", { "Classes/old.mp4": "old" });
    const fake = fakeDownloader();
    await start({ env: { CLIPMARK_VIDEO_DIR: lib }, downloader: fake.downloader });

    const created = await post("/api/downloads", { url: "https://youtu.be/abc", folder: "Classes" });
    expect(created.status).toBe(202);
    expect(typeof created.body.id).toBe("number");
    await settle();

    expect(fake.runs).toHaveLength(1);
    expect(fake.runs[0].request.url).toBe("https://youtu.be/abc");
    expect(fake.runs[0].request.outputTemplate).toBe(
      path.join(lib, "Classes", "%(title)s [%(id)s].%(ext)s"),
    );
    expect(fake.runs[0].request.cookiesFromBrowser).toBe("chrome");

    fake.runs[0].events.onTitle("Swing out drills");
    fake.runs[0].events.onProgress(42.5);
    let list = (await get("/api/downloads")).body;
    expect(list).toEqual([
      expect.objectContaining({
        id: created.body.id,
        url: "https://youtu.be/abc",
        folder: "Classes",
        state: "running",
        progress: 42.5,
        title: "Swing out drills",
      }),
    ]);

    fake.finish(fake.runs[0], "Swing out drills [abc].mp4");
    list = (await get("/api/downloads")).body;
    expect(list[0]).toMatchObject({
      state: "done",
      progress: 100,
      file: "Classes/Swing out drills [abc].mp4",
    });
    const tree = (await get("/api/tree")).body;
    expect(tree.videos.map((v: { file: string }) => v.file)).toContain("Classes/Swing out drills [abc].mp4");
  });

  it("runs two jobs one at a time, in order", async () => {
    const lib = folder("lib");
    const fake = fakeDownloader();
    await start({ env: { CLIPMARK_VIDEO_DIR: lib }, downloader: fake.downloader });

    const a = await post("/api/downloads", { url: "https://a", folder: "" });
    const b = await post("/api/downloads", { url: "https://b" });
    await settle();
    expect(fake.runs.map((r) => r.request.url)).toEqual(["https://a"]);
    let list = (await get("/api/downloads")).body;
    expect(list.map((j: { id: number; state: string }) => [j.id, j.state])).toEqual([
      [a.body.id, "running"],
      [b.body.id, "queued"],
    ]);

    fake.finish(fake.runs[0], "A [a].mp4");
    await settle();
    expect(fake.runs.map((r) => r.request.url)).toEqual(["https://a", "https://b"]);
    list = (await get("/api/downloads")).body;
    expect(list.find((j: { id: number }) => j.id === b.body.id).state).toBe("running");
    expect(list.find((j: { id: number }) => j.id === b.body.id).folder).toBe("");
  });

  it("rejects a missing URL, a folder outside the Library Folder, and a folder that does not exist", async () => {
    const lib = folder("lib", { "Classes/old.mp4": "old" });
    folder("Elsewhere");
    const fake = fakeDownloader();
    await start({ env: { CLIPMARK_VIDEO_DIR: lib }, downloader: fake.downloader });

    expect((await post("/api/downloads", { folder: "Classes" })).status).toBe(400);
    expect((await post("/api/downloads", { url: "notaurl", folder: "Classes" })).status).toBe(400);
    for (const bad of ["../Elsewhere", "/Elsewhere", "Nope", "Classes/old.mp4"]) {
      const { status, body } = await post("/api/downloads", { url: "https://x", folder: bad });
      expect(status, bad).toBe(400);
      expect(typeof body.error).toBe("string");
    }
    await settle();
    expect(fake.runs).toHaveLength(0);
    expect((await get("/api/downloads")).body).toEqual([]);
  });

  it("refuses to download when no Library Folder is set", async () => {
    const fake = fakeDownloader();
    await start({ downloader: fake.downloader });
    const { status, body } = await post("/api/downloads", { url: "https://x" });
    expect(status).toBe(400);
    expect(body.error).toMatch(/Library Folder/);
  });
});

describe("DELETE /api/downloads/:id", () => {
  it("cancels a running job and removes its partial files", async () => {
    const lib = folder("lib", { "Classes/keep.mp4.part": "not ours" });
    const fake = fakeDownloader();
    await start({ env: { CLIPMARK_VIDEO_DIR: lib }, downloader: fake.downloader });
    const { body } = await post("/api/downloads", { url: "https://x", folder: "Classes" });
    await settle();
    const run = fake.runs[0];
    fs.writeFileSync(path.join(lib, "Classes", "Thing [x].f137.mp4.part"), "half");
    fs.writeFileSync(path.join(lib, "Classes", "Thing [x].f137.mp4.ytdl"), "state");

    const del = await request("DELETE", `/api/downloads/${body.id}`);
    expect(del.status).toBe(204);
    expect(run.cancelled).toBe(true);
    // yt-dlp exits after the SIGINT; the queue then cleans up and forgets the job.
    run.events.onExit({ code: 130, filepath: null, stderrTail: "" });
    await settle();

    expect((await get("/api/downloads")).body).toEqual([]);
    expect(fs.readdirSync(path.join(lib, "Classes")).sort()).toEqual(["keep.mp4.part"]);
  });

  it("drops a queued job before it starts", async () => {
    const lib = folder("lib");
    const fake = fakeDownloader();
    await start({ env: { CLIPMARK_VIDEO_DIR: lib }, downloader: fake.downloader });
    await post("/api/downloads", { url: "https://a" });
    const b = await post("/api/downloads", { url: "https://b" });
    await settle();
    expect((await request("DELETE", `/api/downloads/${b.body.id}`)).status).toBe(204);
    fake.finish(fake.runs[0], "A [a].mp4");
    await settle();
    expect(fake.runs).toHaveLength(1);
    expect((await get("/api/downloads")).body.map((j: { url: string }) => j.url)).toEqual(["https://a"]);
  });

  it("reports a failure with the stderr tail, cleans up, and lets the row be dismissed", async () => {
    const lib = folder("lib");
    const fake = fakeDownloader();
    await start({ env: { CLIPMARK_VIDEO_DIR: lib }, downloader: fake.downloader });
    const { body } = await post("/api/downloads", { url: "https://x" });
    await settle();
    fs.writeFileSync(path.join(lib, "Thing [x].mp4.part"), "half");
    fake.fail(fake.runs[0], "ERROR: [youtube] x: Video unavailable");
    await settle();

    const [job] = (await get("/api/downloads")).body;
    expect(job).toMatchObject({ state: "failed", error: "ERROR: [youtube] x: Video unavailable" });
    expect(fs.readdirSync(lib)).toEqual([]);

    expect((await request("DELETE", `/api/downloads/${body.id}`)).status).toBe(204);
    expect((await get("/api/downloads")).body).toEqual([]);
    expect((await request("DELETE", `/api/downloads/${body.id}`)).status).toBe(404);
  });
});

describe("cookies from browser", () => {
  it("defaults to chrome, persists a change, and omits the flag when none", async () => {
    const lib = folder("lib");
    const fake = fakeDownloader();
    await start({ env: { CLIPMARK_VIDEO_DIR: lib }, downloader: fake.downloader });
    expect((await get("/api/settings")).body.cookiesFromBrowser).toBe("chrome");

    expect((await put("/api/settings", { cookiesFromBrowser: "edge" })).status).toBe(400);
    const saved = await put("/api/settings", { cookiesFromBrowser: "none" });
    expect(saved.status).toBe(200);
    expect(saved.body.cookiesFromBrowser).toBe("none");
    expect(saved.body.libraryFolder).toBe(lib);
    expect((await get("/api/settings")).body.cookiesFromBrowser).toBe("none");

    await post("/api/downloads", { url: "https://x" });
    await settle();
    expect(fake.runs[0].request.cookiesFromBrowser).toBeNull();
  });

  it("POST /api/downloads/test-cookies reports success or yt-dlp's error", async () => {
    const fake = fakeDownloader();
    await start({ downloader: fake.downloader });
    expect((await post("/api/downloads/test-cookies", {})).body).toEqual({ ok: true, browser: "chrome" });

    fake.setCookieResult({ ok: false, output: "ERROR: Could not copy Chrome cookie database" });
    expect((await post("/api/downloads/test-cookies", {})).body).toEqual({
      ok: false,
      browser: "chrome",
      error: "ERROR: Could not copy Chrome cookie database",
    });

    await put("/api/settings", { cookiesFromBrowser: "none" });
    expect((await post("/api/downloads/test-cookies", {})).status).toBe(400);
  });
});

describe("appearance: font and colour", () => {
  it("defaults to Public Sans on paper, persists each change, and rejects unknown values", async () => {
    await start();
    const initial = (await get("/api/settings")).body;
    expect(initial.font).toBe("public-sans");
    expect(initial.color).toBe("paper");

    const font = await put("/api/settings", { font: "sf-pro" });
    expect(font.status).toBe(200);
    expect(font.body.font).toBe("sf-pro");
    expect(font.body.color).toBe("paper");

    const color = await put("/api/settings", { color: "ember" });
    expect(color.status).toBe(200);
    expect(color.body.color).toBe("ember");

    for (const bad of [{ font: "fraunces" }, { color: "neon" }, { font: 3 }, { color: null }]) {
      const res = await put("/api/settings", bad);
      expect(res.status, JSON.stringify(bad)).toBe(400);
      expect(typeof res.body.error).toBe("string");
    }
    // A rejected key saves nothing, even alongside a valid one.
    expect((await put("/api/settings", { font: "public-sans", color: "neon" })).status).toBe(400);

    const after = (await get("/api/settings")).body;
    expect(after.font).toBe("sf-pro");
    expect(after.color).toBe("ember");
  });
});

describe("yt-dlp status", () => {
  it("is reported in the settings response, or null when not installed", async () => {
    await start({ downloader: fakeDownloader().downloader });
    expect((await get("/api/settings")).body.ytDlp).toEqual({
      path: "/opt/homebrew/bin/yt-dlp",
      version: "2026.06.09",
    });
    await new Promise<void>((r) => server!.close(() => r()));
    server = null;
    await start({ downloader: fakeDownloader(null).downloader });
    expect((await get("/api/settings")).body.ytDlp).toBeNull();
  });
});
