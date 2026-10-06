import Database from "better-sqlite3";
import type { Source } from "./source.js";

export interface Clip {
  id: number;
  videoHash: string;
  file: string;
  startSeconds: number;
  endSeconds: number;
  note: string;
  tags: string[];
}

export interface Video {
  hash: string;
  file: string;
  fileMtime: number | null;
  durationSeconds: number | null;
  thumbnail: string | null;
  clipCount: number;
  firstClipStart: number | null;
}

export interface VideoCache {
  fileMtime?: number | null;
  durationSeconds?: number | null;
  thumbnail?: string | null;
}

export interface FileCache {
  hash: string;
  file: string;
  fileMtime: number | null;
  durationSeconds: number | null;
  thumbnail: string | null;
}

export interface ClipInput {
  startSeconds: number;
  endSeconds: number;
  note: string;
  tags: string[];
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS videos (
  hash TEXT PRIMARY KEY,
  file TEXT NOT NULL,
  file_mtime INTEGER,
  duration_seconds REAL,
  thumbnail TEXT
);

CREATE TABLE IF NOT EXISTS clips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_hash TEXT NOT NULL,
  start_seconds REAL NOT NULL,
  end_seconds REAL NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (video_hash) REFERENCES videos(hash) ON DELETE CASCADE,
  CHECK (end_seconds > start_seconds)
);

CREATE TABLE IF NOT EXISTS clip_tags (
  clip_id INTEGER NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY (clip_id, tag),
  FOREIGN KEY (clip_id) REFERENCES clips(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- A downloaded Video's Source (ADR-0009). Keyed by Hash, no foreign key: the
-- Download queue writes it as the file lands, before the scan adds the videos row.
CREATE TABLE IF NOT EXISTS video_sources (
  hash TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  channel TEXT,
  upload_date TEXT,
  site_id TEXT NOT NULL,
  preview TEXT
);

CREATE INDEX IF NOT EXISTS idx_clips_video_hash ON clips(video_hash);
CREATE INDEX IF NOT EXISTS idx_clip_tags_tag ON clip_tags(tag);
`;

interface ClipRow {
  id: number;
  video_hash: string;
  file: string;
  start_seconds: number;
  end_seconds: number;
  note: string;
}

interface VideoRow {
  hash: string;
  file: string;
  file_mtime: number | null;
  duration_seconds: number | null;
  thumbnail: string | null;
  clip_count: number;
  first_clip_start: number | null;
}

interface SourceRow {
  hash: string;
  url: string;
  title: string;
  description: string;
  channel: string | null;
  upload_date: string | null;
  site_id: string;
  preview: string | null;
}

export class Store {
  constructor(private readonly db: Database.Database) {
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.exec(SCHEMA);
  }

  static open(dbPath: string): Store {
    return new Store(new Database(dbPath));
  }

  close(): void {
    this.db.close();
  }

  getSetting(key: string): string | null {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
      | { value: string }
      | undefined;
    return row ? row.value : null;
  }

  setSetting(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(key, value);
  }

  /**
   * One-time ADR-0005 migration: rows written before the Library Folder became a
   * setting hold folder-relative paths; prefix them so every `videos.file` is absolute.
   * Absolute rows (leading "/") are untouched, so running it again changes nothing.
   */
  absolutizeVideoPaths(libraryFolder: string): void {
    this.db
      .prepare("UPDATE videos SET file = ? || '/' || file WHERE file NOT LIKE '/%'")
      .run(libraryFolder.replace(/\/+$/, ""));
  }

  upsertVideo(hash: string, file: string): void {
    this.db
      .prepare(
        `INSERT INTO videos (hash, file) VALUES (?, ?)
         ON CONFLICT(hash) DO UPDATE SET file = excluded.file`,
      )
      .run(hash, file);
  }

  updateVideoCache(hash: string, cache: VideoCache): void {
    const fields: string[] = [];
    const values: (number | string | null)[] = [];
    if (cache.fileMtime !== undefined) {
      fields.push("file_mtime = ?");
      values.push(cache.fileMtime);
    }
    if (cache.durationSeconds !== undefined) {
      fields.push("duration_seconds = ?");
      values.push(cache.durationSeconds);
    }
    if (cache.thumbnail !== undefined) {
      fields.push("thumbnail = ?");
      values.push(cache.thumbnail);
    }
    if (fields.length === 0) return;
    values.push(hash);
    this.db
      .prepare(`UPDATE videos SET ${fields.join(", ")} WHERE hash = ?`)
      .run(...values);
  }

  createClip(videoHash: string, input: ClipInput): Clip {
    const { startSeconds, endSeconds, note, tags } = input;
    if (!(endSeconds > startSeconds)) {
      throw new Error("end_seconds must be greater than start_seconds");
    }
    const insertClip = this.db.prepare(
      "INSERT INTO clips (video_hash, start_seconds, end_seconds, note) VALUES (?, ?, ?, ?)",
    );
    const insertTag = this.db.prepare(
      "INSERT INTO clip_tags (clip_id, tag) VALUES (?, ?)",
    );
    const insert = this.db.transaction(() => {
      const info = insertClip.run(videoHash, startSeconds, endSeconds, note);
      const id = Number(info.lastInsertRowid);
      const seen = new Set<string>();
      for (const raw of tags) {
        const tag = raw.trim();
        if (tag === "" || seen.has(tag)) continue;
        seen.add(tag);
        insertTag.run(id, tag);
      }
      return id;
    });
    return this.getClip(insert()) as Clip;
  }

  deleteClip(id: number): boolean {
    return this.db.prepare("DELETE FROM clips WHERE id = ?").run(id).changes > 0;
  }

  getClip(id: number): Clip | undefined {
    const row = this.db
      .prepare(
        `SELECT c.id, c.video_hash, v.file, c.start_seconds, c.end_seconds, c.note
         FROM clips c JOIN videos v ON v.hash = c.video_hash
         WHERE c.id = ?`,
      )
      .get(id) as ClipRow | undefined;
    if (!row) return undefined;
    return toClip(row, this.loadTags([id]).get(id) ?? []);
  }

  getClips(): Clip[] {
    const rows = this.db
      .prepare(
        `SELECT c.id, c.video_hash, v.file, c.start_seconds, c.end_seconds, c.note
         FROM clips c JOIN videos v ON v.hash = c.video_hash
         ORDER BY c.id`,
      )
      .all() as ClipRow[];
    const tags = this.loadTags(rows.map((r) => r.id));
    return rows.map((r) => toClip(r, tags.get(r.id) ?? []));
  }

  getClipsByVideo(videoHash: string): Clip[] {
    const rows = this.db
      .prepare(
        `SELECT c.id, c.video_hash, v.file, c.start_seconds, c.end_seconds, c.note
         FROM clips c JOIN videos v ON v.hash = c.video_hash
         WHERE c.video_hash = ?
         ORDER BY c.start_seconds, c.id`,
      )
      .all(videoHash) as ClipRow[];
    const tags = this.loadTags(rows.map((r) => r.id));
    return rows.map((r) => toClip(r, tags.get(r.id) ?? []));
  }

  getVideo(hash: string): Video | undefined {
    const row = this.db
      .prepare(
        `SELECT v.hash, v.file, v.file_mtime, v.duration_seconds, v.thumbnail,
                COUNT(c.id) AS clip_count,
                MIN(c.start_seconds) AS first_clip_start
         FROM videos v LEFT JOIN clips c ON c.video_hash = v.hash
         WHERE v.hash = ?
         GROUP BY v.hash`,
      )
      .get(hash) as VideoRow | undefined;
    return row ? toVideo(row) : undefined;
  }

  getVideoByFile(file: string): FileCache | undefined {
    const row = this.db
      .prepare(
        `SELECT hash, file, file_mtime, duration_seconds, thumbnail
         FROM videos WHERE file = ?
         ORDER BY rowid DESC LIMIT 1`,
      )
      .get(file) as
      | { hash: string; file: string; file_mtime: number | null; duration_seconds: number | null; thumbnail: string | null }
      | undefined;
    if (!row) return undefined;
    return {
      hash: row.hash,
      file: row.file,
      fileMtime: row.file_mtime,
      durationSeconds: row.duration_seconds,
      thumbnail: row.thumbnail,
    };
  }

  getVideos(): Video[] {
    const rows = this.db
      .prepare(
        `SELECT v.hash, v.file, v.file_mtime, v.duration_seconds, v.thumbnail,
                COUNT(c.id) AS clip_count,
                MIN(c.start_seconds) AS first_clip_start
         FROM videos v LEFT JOIN clips c ON c.video_hash = v.hash
         GROUP BY v.hash
         ORDER BY v.file COLLATE NOCASE`,
      )
      .all() as VideoRow[];
    return rows.map(toVideo);
  }

  /** Saves the Source for a Hash, replacing any existing one. */
  setSource(hash: string, source: Source): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO video_sources
           (hash, url, title, description, channel, upload_date, site_id, preview)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        hash,
        source.url,
        source.title,
        source.description,
        source.channel,
        source.uploadDate,
        source.siteId,
        source.preview,
      );
  }

  /** Every saved Source by Hash. */
  getSources(): Map<string, Source> {
    const rows = this.db
      .prepare("SELECT hash, url, title, description, channel, upload_date, site_id, preview FROM video_sources")
      .all() as SourceRow[];
    return new Map(
      rows.map((r) => [
        r.hash,
        {
          url: r.url,
          title: r.title,
          description: r.description,
          channel: r.channel,
          uploadDate: r.upload_date,
          siteId: r.site_id,
          preview: r.preview,
        },
      ]),
    );
  }

  getTags(): string[] {
    const rows = this.db
      .prepare("SELECT DISTINCT tag FROM clip_tags ORDER BY tag COLLATE NOCASE")
      .all() as { tag: string }[];
    return rows.map((r) => r.tag);
  }

  private loadTags(clipIds: number[]): Map<number, string[]> {
    const result = new Map<number, string[]>();
    if (clipIds.length === 0) return result;
    const placeholders = clipIds.map(() => "?").join(",");
    const rows = this.db
      .prepare(
        `SELECT clip_id, tag FROM clip_tags
         WHERE clip_id IN (${placeholders})
         ORDER BY rowid`,
      )
      .all(...clipIds) as { clip_id: number; tag: string }[];
    for (const row of rows) {
      const list = result.get(row.clip_id) ?? [];
      list.push(row.tag);
      result.set(row.clip_id, list);
    }
    return result;
  }
}

function toClip(row: ClipRow, tags: string[]): Clip {
  return {
    id: row.id,
    videoHash: row.video_hash,
    file: row.file,
    startSeconds: row.start_seconds,
    endSeconds: row.end_seconds,
    note: row.note,
    tags,
  };
}

function toVideo(row: VideoRow): Video {
  return {
    hash: row.hash,
    file: row.file,
    fileMtime: row.file_mtime,
    durationSeconds: row.duration_seconds,
    thumbnail: row.thumbnail,
    clipCount: row.clip_count,
    firstClipStart: row.first_clip_start,
  };
}
