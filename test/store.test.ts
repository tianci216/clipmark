import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { Store } from "../server/src/store";

function openStore() {
  const db = new Database(":memory:");
  const store = new Store(db);
  return { db, store };
}

function clipSeed() {
  return {
    startSeconds: 104,
    endSeconds: 127,
    note: "Learn their combo",
    tags: ["william pisani", "charleston", "swing out"],
  };
}

describe("Store schema (ADR-0004)", () => {
  it("creates videos, clips, clip_tags, clip_dancers (ADR-0008) and video_sources tables", () => {
    const { db } = openStore();
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all()
      .map((r) => (r as { name: string }).name);
    expect(tables).toEqual(["clip_dancers", "clip_tags", "clips", "settings", "video_sources", "videos"]);
  });

  it("gives clips the ADR-0004 columns", () => {
    const { db } = openStore();
    const columns = db
      .prepare("PRAGMA table_info(clips)")
      .all()
      .map((r) => (r as { name: string }).name);
    expect(columns).toEqual([
      "id",
      "video_hash",
      "start_seconds",
      "end_seconds",
      "note",
    ]);
  });

  it("indexes clips.video_hash and clip_tags.tag", () => {
    const { db } = openStore();
    const indexes = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all()
      .map((r) => (r as { name: string }).name);
    expect(indexes).toContain("idx_clips_video_hash");
    expect(indexes).toContain("idx_clip_tags_tag");
  });

  it("enforces end_seconds > start_seconds at the schema level", () => {
    const { db, store } = openStore();
    store.upsertVideo("a1b2", "videos/a.mp4");
    expect(() =>
      store.createClip("a1b2", { startSeconds: 30, endSeconds: 30, note: "", tags: [] }),
    ).toThrow(/end_seconds/);
    expect(() =>
      db
        .prepare(
          "INSERT INTO clips (video_hash, start_seconds, end_seconds, note) VALUES (?, ?, ?, ?)",
        )
        .run("a1b2", 50, 49, ""),
    ).toThrow(/CHECK/);
  });
});

describe("Store videos", () => {
  it("upserts videos keyed by hash without duplicating", () => {
    const { store } = openStore();
    store.upsertVideo("a1b2", "old/name.mp4");
    store.upsertVideo("a1b2", "renamed/name.mp4");
    const videos = store.getVideos();
    expect(videos).toHaveLength(1);
    expect(videos[0].hash).toBe("a1b2");
    expect(videos[0].file).toBe("renamed/name.mp4");
  });

  it("caches duration, thumbnail, and mtime against a video", () => {
    const { store } = openStore();
    store.upsertVideo("a1b2", "videos/a.mp4");
    store.updateVideoCache("a1b2", {
      fileMtime: 12345,
      durationSeconds: 72.5,
      thumbnail: "/thumbnails/a1b2.jpg",
    });
    const video = store.getVideo("a1b2");
    expect(video?.fileMtime).toBe(12345);
    expect(video?.durationSeconds).toBe(72.5);
    expect(video?.thumbnail).toBe("/thumbnails/a1b2.jpg");
  });

  it("keeps cached fields when the video row is upserted again", () => {
    const { store } = openStore();
    store.upsertVideo("a1b2", "videos/a.mp4");
    store.updateVideoCache("a1b2", { fileMtime: 12345, durationSeconds: 72.5 });
    store.upsertVideo("a1b2", "renamed/a.mp4");
    const video = store.getVideo("a1b2");
    expect(video?.file).toBe("renamed/a.mp4");
    expect(video?.fileMtime).toBe(12345);
    expect(video?.durationSeconds).toBe(72.5);
  });

  it("lets the cache be invalidated (cleared to null)", () => {
    const { store } = openStore();
    store.upsertVideo("a1b2", "videos/a.mp4");
    store.updateVideoCache("a1b2", { fileMtime: 12345, durationSeconds: 72.5 });
    store.updateVideoCache("a1b2", { durationSeconds: null });
    const video = store.getVideo("a1b2");
    expect(video?.fileMtime).toBe(12345);
    expect(video?.durationSeconds).toBeNull();
  });

  it("reports clip count and first clip start per video", () => {
    const { store } = openStore();
    store.upsertVideo("a1b2", "videos/a.mp4");
    store.createClip("a1b2", { startSeconds: 104, endSeconds: 127, note: "", tags: [] });
    store.createClip("a1b2", { startSeconds: 60, endSeconds: 90, note: "", tags: [] });
    const video = store.getVideos()[0];
    expect(video.clipCount).toBe(2);
    expect(video.firstClipStart).toBe(60);
  });

  it("looks up the latest row by file path (the scan's mtime-cache key)", () => {
    const { store } = openStore();
    store.upsertVideo("oldhash", "videos/a.mp4");
    store.upsertVideo("newhash", "videos/a.mp4");
    store.updateVideoCache("newhash", { fileMtime: 999, durationSeconds: 60 });
    const video = store.getVideoByFile("videos/a.mp4");
    expect(video?.hash).toBe("newhash");
    expect(video?.fileMtime).toBe(999);
    expect(video?.durationSeconds).toBe(60);
    expect(store.getVideoByFile("videos/missing.mp4")).toBeUndefined();
  });
});

describe("Store clips", () => {
  it("creates a clip and reads it back with its tags joined", () => {
    const { store } = openStore();
    store.upsertVideo("a1b2", "videos/a.mp4");
    const clip = store.createClip("a1b2", clipSeed());
    expect(clip).toMatchObject({
      id: clip.id,
      videoHash: "a1b2",
      file: "videos/a.mp4",
      startSeconds: 104,
      endSeconds: 127,
      note: "Learn their combo",
    });
    expect(clip.tags).toEqual(["william pisani", "charleston", "swing out"]);
  });

  it("preserves tag order and dedupes, skipping blanks", () => {
    const { store } = openStore();
    store.upsertVideo("a1b2", "videos/a.mp4");
    const clip = store.createClip("a1b2", {
      startSeconds: 1,
      endSeconds: 2,
      note: "",
      tags: ["  ", "b", "a", "b", "a"],
    });
    expect(clip.tags).toEqual(["b", "a"]);
  });

  it("rejects creating a clip on a missing video", () => {
    const { store } = openStore();
    expect(() => store.createClip("nope", clipSeed())).toThrow(/FOREIGN KEY/i);
  });

  it("deletes a clip and its tags", () => {
    const { db, store } = openStore();
    store.upsertVideo("a1b2", "videos/a.mp4");
    const clip = store.createClip("a1b2", clipSeed());
    expect(store.deleteClip(clip.id)).toBe(true);
    expect(store.getClips()).toHaveLength(0);
    const orphanTags = db
      .prepare("SELECT COUNT(*) AS n FROM clip_tags")
      .get() as { n: number };
    expect(orphanTags.n).toBe(0);
  });

  it("returns false when deleting a nonexistent clip", () => {
    const { store } = openStore();
    expect(store.deleteClip(999)).toBe(false);
  });

  it("deleting a video cascades to its clips and tags", () => {
    const { db, store } = openStore();
    store.upsertVideo("a1b2", "videos/a.mp4");
    store.createClip("a1b2", clipSeed());
    db.prepare("DELETE FROM videos WHERE hash = ?").run("a1b2");
    expect(store.getClips()).toHaveLength(0);
    const orphanTags = db
      .prepare("SELECT COUNT(*) AS n FROM clip_tags")
      .get() as { n: number };
    expect(orphanTags.n).toBe(0);
  });

  it("orders clips within a video by start time", () => {
    const { store } = openStore();
    store.upsertVideo("a1b2", "videos/a.mp4");
    store.createClip("a1b2", { startSeconds: 200, endSeconds: 220, note: "", tags: [] });
    store.createClip("a1b2", { startSeconds: 50, endSeconds: 80, note: "", tags: [] });
    const clips = store.getClipsByVideo("a1b2");
    expect(clips.map((c) => c.startSeconds)).toEqual([50, 200]);
  });
});

describe("Store tags", () => {
  it("lists distinct tags", () => {
    const { store } = openStore();
    store.upsertVideo("a1b2", "videos/a.mp4");
    store.createClip("a1b2", { startSeconds: 1, endSeconds: 2, note: "", tags: ["swing", "savoy"] });
    store.createClip("a1b2", { startSeconds: 3, endSeconds: 4, note: "", tags: ["swing"] });
    expect(store.getTags()).toEqual(["savoy", "swing"]);
  });
});

describe("Store settings (ADR-0005)", () => {
  it("returns null for a setting that was never written", () => {
    const { store } = openStore();
    expect(store.getSetting("library_folder")).toBeNull();
  });

  it("round-trips a setting and overwrites it on a second write", () => {
    const { store } = openStore();
    store.setSetting("library_folder", "/Volumes/Dance");
    expect(store.getSetting("library_folder")).toBe("/Volumes/Dance");
    store.setSetting("library_folder", "/Users/me/Videos");
    expect(store.getSetting("library_folder")).toBe("/Users/me/Videos");
  });
});

describe("Store video path migration (ADR-0005)", () => {
  it("prefixes relative video paths with the Library Folder, leaving absolute ones alone", () => {
    const { store } = openStore();
    store.upsertVideo("rel1", "Choreography/a.mp4");
    store.upsertVideo("rel2", "b.mov");
    store.upsertVideo("abs1", "/Volumes/Other/c.mp4");
    store.absolutizeVideoPaths("/Users/me/Swing & Jazz");
    const files = Object.fromEntries(store.getVideos().map((v) => [v.hash, v.file]));
    expect(files).toEqual({
      rel1: "/Users/me/Swing & Jazz/Choreography/a.mp4",
      rel2: "/Users/me/Swing & Jazz/b.mov",
      abs1: "/Volumes/Other/c.mp4",
    });
  });

  it("is a no-op when run a second time", () => {
    const { store } = openStore();
    store.upsertVideo("rel1", "a.mp4");
    store.absolutizeVideoPaths("/lib");
    store.absolutizeVideoPaths("/other");
    expect(store.getVideos()[0].file).toBe("/lib/a.mp4");
  });
});
