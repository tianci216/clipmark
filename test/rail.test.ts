import { describe, expect, it } from "vitest";
import { railFor } from "../src/lib/rail";
import type { Clip, Video } from "../src/lib/api";

function video(hash: string, file: string): Video {
  return {
    hash,
    file,
    fileMtime: null,
    durationSeconds: null,
    thumbnail: null,
    clipCount: 0,
    firstClipStart: null,
  };
}

function clip(
  id: number,
  videoHash: string,
  startSeconds: number,
  endSeconds: number,
  tags: string[],
): Clip {
  return {
    id,
    videoHash,
    file: `${videoHash}.mp4`,
    startSeconds,
    endSeconds,
    note: "",
    tags,
  };
}

const a = video("aaa", "a.mp4");
const b = video("bbb", "b.mp4");
const c = video("ccc", "c.mp4");

describe("railFor", () => {
  it("lists the video's own clips ordered by start time", () => {
    const clips = [
      clip(1, "aaa", 200, 220, ["swing out"]),
      clip(2, "aaa", 50, 80, ["charleston"]),
    ];
    const { own } = railFor(a, [a], clips);
    expect(own.map((c) => c.startSeconds)).toEqual([50, 200]);
  });

  it("ranks library clips by shared-tag count then start time", () => {
    const clips = [
      clip(1, "aaa", 100, 120, ["charleston", "frankie"]),
      clip(2, "bbb", 30, 60, ["charleston"]),
      clip(3, "bbb", 70, 90, ["charleston", "frankie", "savoy"]),
      clip(4, "ccc", 10, 20, ["swing out"]),
    ];
    const { own, others } = railFor(a, [a, b, c], clips);
    expect(own).toHaveLength(1);
    expect(others.map((o) => o.clip.id)).toEqual([3, 2]);
    expect(others[0].shared).toBe(2);
    expect(others[1].shared).toBe(1);
  });

  it("hides clips that share no tags with the video's own clips", () => {
    const clips = [
      clip(1, "aaa", 100, 120, ["charleston"]),
      clip(2, "bbb", 30, 60, ["swing out"]),
    ];
    const { others } = railFor(a, [a, b], clips);
    expect(others).toEqual([]);
  });

  it("excludes the video's own clips from the library section", () => {
    const clips = [
      clip(1, "aaa", 100, 120, ["charleston"]),
      clip(2, "aaa", 130, 140, ["charleston"]),
    ];
    const { own, others } = railFor(a, [a], clips);
    expect(own).toHaveLength(2);
    expect(others).toEqual([]);
  });

  it("falls back to an orphan video built from the clip when the file is gone", () => {
    const clips = [
      clip(1, "aaa", 100, 120, ["charleston"]),
      clip(2, "bbb", 30, 60, ["charleston"]),
    ];
    const { others } = railFor(a, [a], clips);
    expect(others).toHaveLength(1);
    expect(others[0].video.hash).toBe("bbb");
    expect(others[0].video.file).toBe("bbb.mp4");
    expect(others[0].video.thumbnail).toBeNull();
  });
});
