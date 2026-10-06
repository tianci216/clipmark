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
    source: null,
  };
}

function clip(
  id: number,
  videoHash: string,
  startSeconds: number,
  endSeconds: number,
  tags: string[],
  dancers: string[] = [],
): Clip {
  return {
    id,
    videoHash,
    file: `${videoHash}.mp4`,
    startSeconds,
    endSeconds,
    note: "",
    dancers,
    tags,
  };
}

const a = video("aaa", "a.mp4");
const b = video("bbb", "b.mp4");
const c = video("ccc", "c.mp4");
const ids = (r: ReturnType<typeof railFor>) => r.related.map((e) => e.clip.id);

describe("railFor", () => {
  it("lists the video's own clips ordered by start time", () => {
    const clips = [
      clip(1, "aaa", 200, 220, ["swing out"]),
      clip(2, "aaa", 50, 80, ["charleston"]),
    ];
    const { own } = railFor(a, [a], clips);
    expect(own.map((c) => c.startSeconds)).toEqual([50, 200]);
  });

  it("ranks related clips by how many Dancers and Tags they share, then start time", () => {
    const clips = [
      clip(1, "aaa", 100, 120, ["charleston", "frankie"]),
      clip(2, "bbb", 30, 60, ["charleston"]),
      clip(3, "bbb", 70, 90, ["charleston", "frankie", "savoy"]),
      clip(4, "ccc", 10, 20, ["swing out"]),
    ];
    const r = railFor(a, [a, b, c], clips);
    expect(r.own).toHaveLength(1);
    expect(ids(r)).toEqual([3, 2]);
    expect(r.related.map((e) => e.shared)).toEqual([2, 1]);
  });

  it("counts a shared Dancer, case-insensitively, as well as a shared Tag", () => {
    const clips = [
      clip(1, "aaa", 100, 120, ["swing out"], ["Dax Hock"]),
      clip(2, "bbb", 30, 60, ["texas tommy"], ["dax hock"]),
      clip(3, "ccc", 5, 9, ["SWING OUT"], ["Dax Hock"]),
      clip(4, "ccc", 10, 20, ["texas tommy"], ["Naomi Uyama"]),
    ];
    const r = railFor(a, [a, b, c], clips);
    expect(ids(r)).toEqual([3, 2]);
    expect(r.related.map((e) => e.shared)).toEqual([2, 1]);
  });

  it("never matches a Dancer against a Tag of the same text", () => {
    const clips = [
      clip(1, "aaa", 100, 120, [], ["Dax Hock"]),
      clip(2, "bbb", 30, 60, ["dax hock"]),
    ];
    expect(ids(railFor(a, [a, b], clips))).toEqual([]);
  });

  it("includes clips on this video that share a Dancer or Tag with another of its clips, ranked first on a tie", () => {
    const clips = [
      clip(1, "aaa", 100, 120, ["charleston"]),
      clip(2, "aaa", 130, 140, ["charleston"], ["Ann"]),
      clip(3, "aaa", 150, 160, ["tuck"], ["ann"]),
      clip(4, "aaa", 170, 180, ["lonely"]),
      clip(5, "bbb", 10, 20, ["lonely"]),
    ];
    const r = railFor(a, [a, b], clips);
    expect(r.own).toHaveLength(4);
    // 4's only Tag is on no other clip of this video, so 4 is left out; 5 shares it from b.
    // Same share count: this video's clips first, then by start.
    expect(ids(r)).toEqual([2, 1, 3, 5]);
    expect(r.related.find((e) => e.clip.id === 2)?.shared).toBe(2);
    expect(r.related.find((e) => e.clip.id === 2)?.video).toBe(a);
  });

  it("hides clips that share nothing with the video's clips", () => {
    const clips = [
      clip(1, "aaa", 100, 120, ["charleston"], ["Ann"]),
      clip(2, "bbb", 30, 60, ["swing out"], ["Bob"]),
    ];
    expect(ids(railFor(a, [a, b], clips))).toEqual([]);
  });

  it("falls back to an orphan video built from the clip when the file is gone", () => {
    const clips = [
      clip(1, "aaa", 100, 120, ["charleston"]),
      clip(2, "bbb", 30, 60, ["charleston"]),
    ];
    const { related } = railFor(a, [a], clips);
    expect(related).toHaveLength(1);
    expect(related[0].video.hash).toBe("bbb");
    expect(related[0].video.file).toBe("bbb.mp4");
    expect(related[0].video.thumbnail).toBeNull();
  });
});
