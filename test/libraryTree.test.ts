import { describe, expect, it } from "vitest";
import { buildLibraryTree } from "../src/lib/libraryTree";
import type { Clip, Video } from "../src/lib/api";

function video(hash: string, file: string, duration: number | null = 120): Video {
  return {
    hash,
    file,
    fileMtime: null,
    durationSeconds: duration,
    thumbnail: null,
    clipCount: 0,
    firstClipStart: null,
  };
}

function clip(
  id: number,
  videoHash: string,
  file: string,
  startSeconds: number,
  tags: string[],
): Clip {
  return {
    id,
    videoHash,
    file,
    startSeconds,
    endSeconds: startSeconds + 5,
    note: "",
    tags,
  };
}

const swing = video("aaa", "Choreography/Sweet Vanilla/swing.mp4");
const lindy = video("bbb", "Classes/lindy.mp4");
const solo = video("ccc", "Practice recordings/solo.mov");

describe("buildLibraryTree", () => {
  it("groups videos by the directory part of their file and sorts folders by name", () => {
    const tree = buildLibraryTree([solo, swing, lindy], [], []);
    expect(tree.folders.map((f) => f.path)).toEqual([
      "Choreography/Sweet Vanilla",
      "Classes",
      "Practice recordings",
    ]);
    expect(tree.folders[1].videos.map((v) => v.video.file)).toEqual(["Classes/lindy.mp4"]);
  });

  it("attaches each video's clips sorted by start then id, and sorts videos in a folder by file", () => {
    const later = video("ddd", "Classes/balboa.mp4");
    const cs = [
      clip(3, "bbb", lindy.file, 40, ["swingout"]),
      clip(1, "bbb", lindy.file, 10, ["kick"]),
      clip(2, "bbb", lindy.file, 10, ["kick"]),
      clip(4, "ddd", later.file, 5, ["balboa"]),
    ];
    const tree = buildLibraryTree([lindy, later], cs, []);
    const classes = tree.folders[0];
    expect(classes.videos.map((v) => v.video.file)).toEqual(["Classes/balboa.mp4", "Classes/lindy.mp4"]);
    expect(classes.videos[1].clips.map((c) => c.id)).toEqual([1, 2, 3]);
  });

  it("synthesises an orphan Video for clips whose file is missing, under its saved folder", () => {
    const cs = [clip(9, "zzz", "Classes/gone.mp4", 3, ["lost"])];
    const tree = buildLibraryTree([swing], cs, []);
    const classes = tree.folders.find((f) => f.path === "Classes");
    expect(classes?.videos).toHaveLength(1);
    const orphan = classes!.videos[0];
    expect(orphan.orphan).toBe(true);
    expect(orphan.video.hash).toBe("zzz");
    expect(orphan.video.thumbnail).toBeNull();
    expect(orphan.clips.map((c) => c.id)).toEqual([9]);
    expect(tree.folders[0].videos[0].orphan).toBe(false);
  });

  describe("with a tag filter", () => {
    const cs = [
      clip(1, "aaa", swing.file, 10, ["Swingout", "frida"]),
      clip(2, "aaa", swing.file, 30, ["kick"]),
      clip(3, "bbb", lindy.file, 5, ["swing out"]),
      clip(4, "ccc", solo.file, 5, ["solo jazz"]),
    ];

    it("keeps only Videos with a matching Clip and drops empty folders", () => {
      const tree = buildLibraryTree([swing, lindy, solo], cs, ["swingout"]);
      expect(tree.folders.map((f) => f.path)).toEqual(["Choreography/Sweet Vanilla"]);
      expect(tree.filtering).toBe(true);
    });

    it("matches AND across tokens, case-insensitively, by substring", () => {
      const tree = buildLibraryTree([swing, lindy, solo], cs, ["SWING", "fri"]);
      expect(tree.folders.flatMap((f) => f.videos.map((v) => v.video.hash))).toEqual(["aaa"]);
      expect(tree.folders[0].videos[0].visibleClips.map((c) => c.id)).toEqual([1]);
    });

    it("exposes matching/total per Video, and every clip when no filter is active", () => {
      const filtered = buildLibraryTree([swing], cs, ["kick"]);
      const row = filtered.folders[0].videos[0];
      expect(row.matching).toBe(1);
      expect(row.total).toBe(2);
      expect(row.visibleClips.map((c) => c.id)).toEqual([2]);

      const plain = buildLibraryTree([swing], cs, []);
      expect(plain.filtering).toBe(false);
      expect(plain.folders[0].videos[0].visibleClips.map((c) => c.id)).toEqual([1, 2]);
    });

    it("returns no folders when nothing matches", () => {
      expect(buildLibraryTree([swing, lindy], cs, ["tango"]).folders).toEqual([]);
    });
  });

  it("reports footnote totals over the whole library regardless of the filter", () => {
    const cs = [
      clip(1, "aaa", swing.file, 10, ["swingout"]),
      clip(2, "bbb", lindy.file, 5, ["kick"]),
      clip(3, "zzz", "Classes/gone.mp4", 3, ["kick"]),
    ];
    const tree = buildLibraryTree([swing, lindy, solo], cs, ["kick"]);
    expect(tree.totals).toEqual({ videos: 4, folders: 3, clips: 3, matching: 2 }); // 3 files + 1 orphan row
    expect(tree.folders.map((f) => f.path)).toEqual(["Classes"]);
  });

  it("renders two files that share a Hash as two rows", () => {
    const one = video("same", "Choreography/Sweet Vanilla/IMG_7521.mov");
    const two = video("same", "Practice recordings/IMG_7521.mov");
    const cs = [clip(1, "same", one.file, 2, ["x"])];
    const tree = buildLibraryTree([one, two], cs, []);
    const files = tree.folders.flatMap((f) => f.videos.map((v) => v.video.file));
    expect(files).toEqual([one.file, two.file]);
    for (const f of tree.folders) expect(f.videos[0].clips).toHaveLength(1);
    expect(tree.totals.videos).toBe(2);
  });
});
