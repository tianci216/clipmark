import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import type { Store } from "./store.js";
import { parseSearchQuery } from "./musicQuery.js";

/**
 * The Music tab: a read-only view of the Mixxx DJ library (ported from mobile-mixxx).
 * The Mixxx database is opened read-only per request and never written; audio is
 * served only from under the Music Folder.
 */

export const MIXXX_DB_KEY = "mixxx_db_path";
export const MUSIC_BASE_KEY = "music_base";
export const MIXXX_DB_ENV = "MIXXX_DB_PATH";
export const MUSIC_BASE_ENV = "MUSIC_BASE";

/** Where the Mac App Store / sandboxed Mixxx keeps its library. */
export function defaultMixxxDbPath(home: string = os.homedir()): string {
  return path.join(
    home,
    "Library/Containers/org.mixxx.mixxx/Data/Library/Application Support/Mixxx/mixxxdb.sqlite",
  );
}

export function defaultMusicBase(home: string = os.homedir()): string {
  return path.join(home, "Documents/Music");
}

export interface MusicConfig {
  mixxxDbPath: string;
  musicBase: string;
}

/** Saved setting, else the environment variable mobile-mixxx read, else the default. */
export function getMusicConfig(
  store: Store,
  env: Record<string, string | undefined> = process.env,
  home: string = os.homedir(),
): MusicConfig {
  return {
    mixxxDbPath: store.getSetting(MIXXX_DB_KEY) ?? env[MIXXX_DB_ENV] ?? defaultMixxxDbPath(home),
    musicBase: store.getSetting(MUSIC_BASE_KEY) ?? env[MUSIC_BASE_ENV] ?? defaultMusicBase(home),
  };
}

export function setMusicConfig(store: Store, patch: Partial<MusicConfig>): void {
  if (patch.mixxxDbPath !== undefined) store.setSetting(MIXXX_DB_KEY, patch.mixxxDbPath);
  if (patch.musicBase !== undefined) store.setSetting(MUSIC_BASE_KEY, patch.musicBase);
}

export type PathValidation = { ok: true; path: string } | { ok: false; error: string };

function absolute(input: unknown, what: string): PathValidation {
  if (typeof input !== "string" || input.trim() === "") {
    return { ok: false, error: `Enter the absolute path of the ${what}.` };
  }
  const trimmed = input.trim();
  if (!path.isAbsolute(trimmed)) {
    return { ok: false, error: `Use an absolute path (starting with /), not "${trimmed}".` };
  }
  return { ok: true, path: path.resolve(trimmed) };
}

export function validateMixxxDb(input: unknown): PathValidation {
  const result = absolute(input, "Mixxx database");
  if (!result.ok) return result;
  try {
    const db = openMixxx(result.path);
    try {
      db.prepare("SELECT 1 FROM library LIMIT 1").get();
    } finally {
      db.close();
    }
  } catch (err) {
    return { ok: false, error: `Not a readable Mixxx library at ${result.path}: ${(err as Error).message}` };
  }
  return result;
}

export function validateMusicBase(input: unknown): PathValidation {
  const result = absolute(input, "Music Folder");
  if (!result.ok) return result;
  try {
    if (!fs.statSync(result.path).isDirectory()) {
      return { ok: false, error: `${result.path} is a file, not a folder.` };
    }
  } catch {
    return { ok: false, error: `No folder found at ${result.path}.` };
  }
  return result;
}

export function openMixxx(dbPath: string): Database.Database {
  return new Database(dbPath, { readonly: true, fileMustExist: true });
}

export interface Crate {
  id: number;
  name: string;
}

export interface Track {
  id: number;
  artist: string;
  title: string;
  album: string;
  genre: string;
  duration: number;
  bpm: number | null;
  key: string;
  filetype: string;
}

export const SORT_COLUMNS = ["artist", "title", "bpm", "duration", "key", "genre"] as const;
export type SortColumn = (typeof SORT_COLUMNS)[number];

export interface TrackQuery {
  crate?: number;
  playlist?: number;
  q?: string;
  sort?: string;
  order?: string;
}

export function listCrates(db: Database.Database): Crate[] {
  return db.prepare("SELECT id, name FROM crates ORDER BY name").all() as Crate[];
}

export function listPlaylists(db: Database.Database): Crate[] {
  return db
    .prepare("SELECT id, name FROM Playlists WHERE hidden = 0 ORDER BY position")
    .all() as Crate[];
}

/** Python's round(): halves go to the even neighbour, as mobile-mixxx reported BPM. */
export function roundHalfEven(x: number): number {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

interface TrackRow {
  id: number;
  artist: string | null;
  title: string | null;
  album: string | null;
  genre: string | null;
  duration: number | null;
  bpm: number | null;
  key: string | null;
  filetype: string | null;
}

/** Tracks in the library, a crate or a playlist, filtered by a search query and sorted. */
export function listTracks(db: Database.Database, query: TrackQuery): Track[] {
  let sql = `
    SELECT l.id, l.artist, l.title, l.album, l.genre,
           l.duration, l.bpm, l.key, l.filetype
    FROM library l
    JOIN track_locations tl ON l.location = tl.id
    WHERE l.mixxx_deleted = 0 AND tl.fs_deleted = 0
  `;
  const params: (string | number)[] = [];

  if (query.crate !== undefined) {
    sql += " AND l.id IN (SELECT track_id FROM crate_tracks WHERE crate_id = ?)";
    params.push(query.crate);
  }
  if (query.playlist !== undefined) {
    sql += " AND l.id IN (SELECT track_id FROM PlaylistTracks WHERE playlist_id = ?)";
    params.push(query.playlist);
  }
  const search = parseSearchQuery(query.q);
  if (search) {
    sql += ` AND (${search.sql})`;
    params.push(...search.params);
  }

  const sort: SortColumn = (SORT_COLUMNS as readonly string[]).includes(query.sort ?? "")
    ? (query.sort as SortColumn)
    : "artist";
  const order = query.order === "desc" ? "DESC" : "ASC";
  if (query.playlist !== undefined && sort === "artist") {
    // A playlist's default order is its own track order.
    sql += ` ORDER BY (SELECT position FROM PlaylistTracks WHERE playlist_id = ? AND track_id = l.id) ${order}`;
    params.push(query.playlist);
  } else {
    sql += ` ORDER BY l.${sort} ${order}`;
  }

  return (db.prepare(sql).all(...params) as TrackRow[]).map((r) => ({
    id: r.id,
    artist: r.artist || "",
    title: r.title || "",
    album: r.album || "",
    genre: r.genre || "",
    duration: r.duration || 0,
    bpm: r.bpm ? roundHalfEven(r.bpm) : null,
    key: r.key || "",
    filetype: r.filetype || "",
  }));
}

export function countTracks(db: Database.Database): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM library l JOIN track_locations tl ON l.location = tl.id
       WHERE l.mixxx_deleted = 0 AND tl.fs_deleted = 0`,
    )
    .get() as { n: number };
  return row.n;
}

export function trackLocation(
  db: Database.Database,
  id: number,
): { location: string; filetype: string } | null {
  const row = db
    .prepare(
      `SELECT tl.location, l.filetype FROM library l
       JOIN track_locations tl ON l.location = tl.id WHERE l.id = ?`,
    )
    .get(id) as { location: string | null; filetype: string | null } | undefined;
  return row ? { location: row.location ?? "", filetype: row.filetype ?? "" } : null;
}

export const AUDIO_MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  flac: "audio/flac",
  mp4: "audio/mp4",
};

export function audioMime(filetype: string): string {
  return AUDIO_MIME[filetype.toLowerCase()] ?? "application/octet-stream";
}

/** Query-string integer the way Flask's `type=int` read it: anything else is absent. */
export function intParam(value: unknown): number | undefined {
  return typeof value === "string" && /^\s*[+-]?\d+\s*$/.test(value) ? Number(value) : undefined;
}
