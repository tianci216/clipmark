import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { createApp } from "../server/src/app";
import { roundHalfEven } from "../server/src/music";
import { parseSearchQuery } from "../server/src/musicQuery";
import { Store } from "../server/src/store";

/**
 * The Music tab (ported from mobile-mixxx): the Lucene-style search parser, and
 * the /api/music endpoints over a synthetic Mixxx database in a temp folder.
 */

const FREE = "l.artist LIKE ? OR l.title LIKE ? OR l.album LIKE ?";
const free = (w: string) => [`%${w}%`, `%${w}%`, `%${w}%`];

describe("parseSearchQuery", () => {
  it("searches artist, title and album for plain words, AND-ing several", () => {
    expect(parseSearchQuery("basie")).toEqual({ sql: FREE, params: free("basie") });
    expect(parseSearchQuery("count basie")).toEqual({
      sql: `(${FREE}) AND (${FREE})`,
      params: [...free("count"), ...free("basie")],
    });
  });

  it("returns null for an empty query", () => {
    expect(parseSearchQuery("   ")).toBeNull();
    expect(parseSearchQuery(undefined)).toBeNull();
  });

  it("maps text, numeric and collection fields", () => {
    expect(parseSearchQuery("Artist:basie")).toEqual({ sql: "l.artist LIKE ?", params: ["%basie%"] });
    expect(parseSearchQuery("bpm:>150")).toEqual({ sql: "l.bpm > ?", params: [150] });
    expect(parseSearchQuery("bpm:>=150")).toEqual({ sql: "l.bpm >= ?", params: [150] });
    expect(parseSearchQuery("duration:<=180")).toEqual({ sql: "l.duration <= ?", params: [180] });
    expect(parseSearchQuery("bpm:[120 TO 160]")).toEqual({ sql: "l.bpm BETWEEN ? AND ?", params: [120, 160] });
    expect(parseSearchQuery("bpm:150")).toEqual({ sql: "l.bpm = ?", params: [150] });
    expect(parseSearchQuery('crate:"lindy hop"').params).toEqual(["%lindy hop%"]);
    expect(parseSearchQuery('playlist:"set 1"').sql).toContain("PlaylistTracks");
  });

  it("drops unknown fields and unsupported syntax", () => {
    expect(parseSearchQuery("foo:bar")).toBeNull();
    expect(parseSearchQuery("foo:bar baz")).toEqual({ sql: `(${FREE})`, params: free("baz") });
    expect(parseSearchQuery("+a")).toBeNull();
  });

  it("negates with NOT and -", () => {
    expect(parseSearchQuery("NOT a")).toEqual({ sql: `NOT (${FREE})`, params: free("a") });
    expect(parseSearchQuery("-genre:jazz")).toEqual({ sql: "NOT (l.genre LIKE ?)", params: ["%jazz%"] });
  });

  // Groupings as luqum (PLY) produced them in mobile-mixxx.
  it("follows luqum's operator precedence", () => {
    expect(parseSearchQuery("a AND b OR c")!.sql).toBe(`((${FREE}) AND (${FREE})) OR (${FREE})`);
    expect(parseSearchQuery("a OR b AND c")!.sql).toBe(`(${FREE}) OR ((${FREE}) AND (${FREE}))`);
    expect(parseSearchQuery("a OR b c")!.sql).toBe(`((${FREE}) OR (${FREE})) AND (${FREE})`);
    expect(parseSearchQuery("a b OR c")!.sql).toBe(`(${FREE}) AND ((${FREE}) OR (${FREE}))`);
    expect(parseSearchQuery("a OR b -c")!.sql).toBe(`(${FREE}) OR ((${FREE}) AND (NOT (${FREE})))`);
    expect(parseSearchQuery("a b c")!.sql).toBe(`(${FREE}) AND (${FREE}) AND (${FREE})`);
  });

  it("falls back to a plain-text search of the whole query when it does not parse", () => {
    expect(parseSearchQuery("a AND")).toEqual({ sql: FREE, params: free("a AND") });
    expect(parseSearchQuery("(a")).toEqual({ sql: FREE, params: free("(a") });
    expect(parseSearchQuery("'quoted'")).toEqual({ sql: FREE, params: free("'quoted'") });
  });

  it("rejects a numeric field with a non-number", () => {
    expect(() => parseSearchQuery("bpm:fast")).toThrow(/not a number/);
  });
});

describe("roundHalfEven", () => {
  it("rounds like Python's round()", () => {
    expect([120.5, 121.5, 120.4, 120.6, 128].map(roundHalfEven)).toEqual([120, 122, 120, 121, 128]);
  });
});

// ---------- HTTP ----------

let root: string;
let musicBase: string;
let dbPath: string;
let store: Store;
let server: Server | null = null;
let base = "";

interface Seed {
  artist?: string | null;
  title?: string | null;
  album?: string;
  genre?: string;
  bpm?: number | null;
  duration?: number;
  key?: string;
  filetype?: string;
  file?: string;
  mixxxDeleted?: number;
  fsDeleted?: number;
}

function makeMixxxDb(file: string, tracks: Seed[]): void {
  const db = new Database(file);
  db.exec(`
    CREATE TABLE track_locations (id INTEGER PRIMARY KEY, location TEXT, fs_deleted INTEGER DEFAULT 0);
    CREATE TABLE library (
      id INTEGER PRIMARY KEY, artist TEXT, title TEXT, album TEXT, year TEXT, genre TEXT,
      duration REAL, bpm REAL, key TEXT, filetype TEXT, location INTEGER, mixxx_deleted INTEGER DEFAULT 0
    );
    CREATE TABLE crates (id INTEGER PRIMARY KEY, name TEXT);
    CREATE TABLE crate_tracks (crate_id INTEGER, track_id INTEGER);
    CREATE TABLE Playlists (id INTEGER PRIMARY KEY, name TEXT, position INTEGER, hidden INTEGER DEFAULT 0);
    CREATE TABLE PlaylistTracks (id INTEGER PRIMARY KEY, playlist_id INTEGER, track_id INTEGER, position INTEGER);
  `);
  tracks.forEach((t, i) => {
    const id = i + 1;
    db.prepare("INSERT INTO track_locations (id, location, fs_deleted) VALUES (?, ?, ?)").run(
      id,
      t.file ?? path.join(musicBase, `t${id}.mp3`),
      t.fsDeleted ?? 0,
    );
    db.prepare(
      `INSERT INTO library (id, artist, title, album, genre, duration, bpm, key, filetype, location, mixxx_deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      t.artist === undefined ? `Artist ${id}` : t.artist,
      t.title === undefined ? `Title ${id}` : t.title,
      t.album ?? "",
      t.genre ?? "",
      t.duration ?? 180,
      t.bpm === undefined ? 120 : t.bpm,
      t.key ?? "",
      t.filetype ?? "mp3",
      id,
      t.mixxxDeleted ?? 0,
    );
  });
  db.exec(`
    INSERT INTO crates (id, name) VALUES (1, 'Lindy Hop'), (2, 'Balboa');
    INSERT INTO crate_tracks VALUES (1, 1), (1, 2), (2, 3);
    INSERT INTO Playlists (id, name, position, hidden) VALUES (1, 'Set 2', 2, 0), (2, 'Set 1', 1, 0), (3, 'Auto DJ', 0, 2);
    INSERT INTO PlaylistTracks (playlist_id, track_id, position) VALUES (2, 3, 1), (2, 1, 2), (2, 2, 3);
  `);
  db.close();
}

const TRACKS: Seed[] = [
  { artist: "Count Basie", title: "Jumpin' at the Woodside", genre: "Swing", bpm: 230.4, key: "Bb" },
  { artist: "Chick Webb", title: "Stompin' at the Savoy", genre: "Swing", bpm: 160.5, duration: 200 },
  { artist: "Artie Shaw", title: "Begin the Beguine", genre: "Jazz", bpm: 120.5, filetype: "m4a" },
  { artist: null, title: null, bpm: null },
  { artist: "Deleted", mixxxDeleted: 1 },
  { artist: "Gone", fsDeleted: 1 },
];

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "clipmark-music-"));
  musicBase = path.join(root, "Music");
  fs.mkdirSync(musicBase);
  dbPath = path.join(root, "mixxxdb.sqlite");
  makeMixxxDb(dbPath, TRACKS);
  store = new Store(new Database(":memory:"));
});

afterEach(async () => {
  if (server) await new Promise<void>((r) => server!.close(() => r()));
  server = null;
  store.close();
  fs.rmSync(root, { recursive: true, force: true });
});

async function start(env: Record<string, string> = { MIXXX_DB_PATH: dbPath, MUSIC_BASE: musicBase }) {
  const app = createApp({
    store,
    thumbnailDir: path.join(root, "thumbs"),
    networkInterfaces: () => ({}),
    env,
    downloader: {
      start: () => ({ cancel: () => {} }),
      testCookies: async () => ({ ok: true, output: "" }),
      status: async () => null,
    },
  });
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
}

async function getJson(url: string) {
  const res = await fetch(base + url);
  return { status: res.status, body: await res.json() };
}

const ids = (tracks: { id: number }[]) => tracks.map((t) => t.id);

describe("GET /api/music/crates and /playlists", () => {
  it("lists crates by name and visible playlists by position", async () => {
    await start();
    expect((await getJson("/api/music/crates")).body).toEqual([
      { id: 2, name: "Balboa" },
      { id: 1, name: "Lindy Hop" },
    ]);
    expect((await getJson("/api/music/playlists")).body).toEqual([
      { id: 2, name: "Set 1" },
      { id: 1, name: "Set 2" },
    ]);
  });

  it("answers 503 when the Mixxx library cannot be opened", async () => {
    await start({ MIXXX_DB_PATH: path.join(root, "nope.sqlite"), MUSIC_BASE: musicBase });
    const { status, body } = await getJson("/api/music/crates");
    expect(status).toBe(503);
    expect(body.error).toMatch(/Couldn't open the Mixxx library/);
  });
});

describe("GET /api/music/tracks", () => {
  it("lists live tracks sorted by artist, with nulls as empty strings and BPM rounded half-even", async () => {
    await start();
    const { status, body } = await getJson("/api/music/tracks");
    expect(status).toBe(200);
    expect(ids(body)).toEqual([4, 3, 2, 1]);
    expect(body[0]).toEqual({
      id: 4, artist: "", title: "", album: "", genre: "", duration: 180, bpm: null, key: "", filetype: "mp3",
    });
    expect(body.find((t: { id: number }) => t.id === 3).bpm).toBe(120);
    expect(body.find((t: { id: number }) => t.id === 2).bpm).toBe(160);
  });

  it("sorts by an allowed column and order, defaulting unknown columns to artist", async () => {
    await start();
    expect(ids((await getJson("/api/music/tracks?sort=bpm&order=desc")).body)).toEqual([1, 2, 3, 4]);
    expect(ids((await getJson("/api/music/tracks?sort=l.id;drop&order=desc")).body)).toEqual([1, 2, 3, 4]);
  });

  it("filters to a crate, and orders a playlist by its own positions", async () => {
    await start();
    expect(ids((await getJson("/api/music/tracks?crate=1")).body)).toEqual([2, 1]);
    expect(ids((await getJson("/api/music/tracks?playlist=2")).body)).toEqual([3, 1, 2]);
    expect(ids((await getJson("/api/music/tracks?playlist=2&order=desc")).body)).toEqual([2, 1, 3]);
    expect(ids((await getJson("/api/music/tracks?playlist=2&sort=title")).body)).toEqual([3, 1, 2]);
    // A non-integer id is ignored, as Flask's type=int did.
    expect(ids((await getJson("/api/music/tracks?crate=abc")).body)).toEqual([4, 3, 2, 1]);
  });

  it("applies the search query", async () => {
    await start();
    const q = (s: string) => getJson("/api/music/tracks?q=" + encodeURIComponent(s));
    expect(ids((await q('bpm:>150 AND crate:"lindy"')).body)).toEqual([2, 1]);
    expect(ids((await q("genre:swing -artist:basie")).body)).toEqual([2]);
    expect(ids((await q("savoy")).body)).toEqual([2]);
    expect(ids((await q("key:Bb OR bpm:[100 TO 130]")).body)).toEqual([3, 1]);
    const bad = await q("bpm:fast");
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/not a number/);
  });
});

describe("GET /api/music/audio/:id", () => {
  it("streams the file with its MIME type and honours Range", async () => {
    fs.writeFileSync(path.join(musicBase, "t1.mp3"), "0123456789");
    await start();
    const full = await fetch(base + "/api/music/audio/1");
    expect(full.status).toBe(200);
    expect(full.headers.get("content-type")).toBe("audio/mpeg");
    expect(full.headers.get("accept-ranges")).toBe("bytes");
    expect(await full.text()).toBe("0123456789");
    const part = await fetch(base + "/api/music/audio/1", { headers: { Range: "bytes=2-4" } });
    expect(part.status).toBe(206);
    expect(await part.text()).toBe("234");
  });

  it("refuses files outside the Music Folder and reports missing tracks and files", async () => {
    await start();
    // Track 3's file is under the Music Folder but not on disk.
    expect((await fetch(base + "/api/music/audio/3")).status).toBe(404);
    expect((await fetch(base + "/api/music/audio/99")).status).toBe(404);
    await new Promise<void>((r) => server!.close(() => r()));
    server = null;
    const elsewhere = path.join(root, "Elsewhere");
    fs.mkdirSync(elsewhere);
    fs.writeFileSync(path.join(musicBase, "t1.mp3"), "x");
    await start({ MIXXX_DB_PATH: dbPath, MUSIC_BASE: elsewhere });
    expect((await fetch(base + "/api/music/audio/1")).status).toBe(403);
  });
});

describe("music settings", () => {
  it("reports the env fallbacks, then saves validated paths with a track count", async () => {
    await start();
    const before = await getJson("/api/settings");
    expect(before.body.mixxxDbPath).toBe(dbPath);
    expect(before.body.musicBase).toBe(musicBase);

    const put = (body: unknown) =>
      fetch(base + "/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(async (r) => ({ status: r.status, body: await r.json() }));

    expect((await put({ mixxxDbPath: "relative.sqlite" })).status).toBe(400);
    const notMixxx = path.join(root, "empty.sqlite");
    new Database(notMixxx).close();
    expect((await put({ mixxxDbPath: notMixxx })).body.error).toMatch(/Not a readable Mixxx library/);
    expect((await put({ musicBase: path.join(root, "missing") })).status).toBe(400);

    const copy = path.join(root, "copy.sqlite");
    fs.copyFileSync(dbPath, copy);
    const saved = await put({ mixxxDbPath: copy, musicBase: root + "/" });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ mixxxDbPath: copy, musicBase: root, trackCount: 4 });
    expect((await getJson("/api/settings")).body.mixxxDbPath).toBe(copy);
  });
});
