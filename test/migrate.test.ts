import path from "node:path";
import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { Store } from "../server/src/store";
import { migrateFromYamlFile } from "../server/src/importer";

const FIXTURE = path.join(import.meta.dirname, "fixtures", "annotations.fixture.yaml");

function openStore() {
  return new Store(new Database(":memory:"));
}

describe("YAML -> SQLite migration", () => {
  it("imports videos, clips, and tags, converting MM:SS to seconds", () => {
    const store = openStore();
    migrateFromYamlFile(store, FIXTURE);

    const videos = store.getVideos();
    expect(videos).toHaveLength(2);

    const clips = store.getClips();
    expect(clips).toHaveLength(3);

    const savoy = clips.find((c) => c.file.includes("Savoy Cup 2022"));
    expect(savoy).toMatchObject({
      startSeconds: 104,
      endSeconds: 127,
      note: "Learn their combo",
    });
    expect(savoy?.tags).toEqual(["william pisani", "alice faraone", "combo"]);

    const noNote = clips.find(
      (c) => c.startSeconds === 252 && c.file.includes("Savoy Cup 2022"),
    );
    expect(noNote?.note).toBe("");
    expect(noNote?.tags).toEqual(["medard delphine", "charleston"]);

    const castleRock = clips.find((c) => c.file.includes("CASTLE ROCK"));
    expect(castleRock).toMatchObject({
      startSeconds: 27,
      endSeconds: 38,
      note: "cool slide",
    });
    expect(castleRock?.tags).toEqual(["nils andren", "bianca locatelli", "slide"]);
  });

  it("is idempotent: re-running is a no-op and never duplicates rows", () => {
    const store = openStore();
    migrateFromYamlFile(store, FIXTURE);
    migrateFromYamlFile(store, FIXTURE);
    expect(store.getVideos()).toHaveLength(2);
    expect(store.getClips()).toHaveLength(3);
  });

  it("never destroys clips created after migration", () => {
    const store = openStore();
    migrateFromYamlFile(store, FIXTURE);
    store.upsertVideo("newvideo", "videos/new.mp4");
    store.createClip("newvideo", {
      startSeconds: 10,
      endSeconds: 20,
      note: "saved after migration",
      tags: ["swing"],
    });

    const reimported = migrateFromYamlFile(store, FIXTURE);

    expect(reimported).toBe(false);
    expect(store.getVideos()).toHaveLength(3);
    expect(store.getClips()).toHaveLength(4);
    const saved = store.getClips().find((c) => c.file === "videos/new.mp4");
    expect(saved?.note).toBe("saved after migration");
  });
});
