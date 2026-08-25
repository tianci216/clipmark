// PROTOTYPE — mock library. Shapes mirror src/lib/api.ts so the winner ports cleanly.
export interface Video {
  hash: string;
  file: string;
  durationSeconds: number | null;
  /** CSS gradient standing in for the thumbnail */
  still: string | null;
  clipCount: number;
  firstClipStart: number | null;
}

export interface Clip {
  id: number;
  videoHash: string;
  file: string;
  startSeconds: number;
  endSeconds: number;
  note: string;
  tags: string[];
}

const stills = [
  "linear-gradient(135deg,#2b2620 0%,#6b5a44 55%,#c9a374 100%)",
  "linear-gradient(160deg,#1a1d24 0%,#3b4a5c 60%,#8aa0b5 100%)",
  "linear-gradient(120deg,#3a1f1a 0%,#7a3b2b 50%,#d98b62 100%)",
  "linear-gradient(140deg,#20241c 0%,#4d5a3b 55%,#a5b487 100%)",
  "linear-gradient(150deg,#241c2a 0%,#5a4466 55%,#b79cc2 100%)",
  "linear-gradient(130deg,#1e1e1e 0%,#555 55%,#bdbdbd 100%)",
  "linear-gradient(145deg,#2a2418 0%,#7c6a36 55%,#d9c26e 100%)",
  "linear-gradient(125deg,#16232a 0%,#2f5f6b 55%,#7fb8c2 100%)",
];

const rawVideos: Array<[string, string, number, number | null]> = [
  ["a1f3c9e2b7d40e11", "Choreography/Sweet Vanilla/IMG_7521.mov", 214, 0],
  ["b82d0f5a6c31e977", "Choreography/Sweet Vanilla/run-through 2026-06-14.mp4", 187, 1],
  ["c4e7a1d9f0b2c356", "Classes/Frankie Manning routine/week 3 recap.mp4", 642, 2],
  ["d9b1e4c7a2f6d803", "Classes/Frankie Manning routine/week 4 recap.mp4", 701, 3],
  ["e2c6f8a1b3d5e094", "Socials/Herräng 2025/Friday night party.mov", 1533, 4],
  ["f7a3b9c2d4e6f185", "Socials/Herräng 2025/Tuesday jam circle.mov", 926, 5],
  ["0a5c7e9b1d3f0276", "Practice recordings/2026-07-02 swingout drill.mp4", 312, 6],
  ["1b6d8f0c2e4a1367", "Practice recordings/2026-07-09 charleston footwork.mp4", 288, 7],
  ["2c7e9a1d3f5b2458", "Practice recordings/2026-08-01 musicality set.mp4", 455, null],
];

const rawClips: Array<[number, string, number, number, string[], string]> = [
  [1, "a1f3c9e2b7d40e11", 12, 31, ["Skye", "swingout", "sweet vanilla"], "opening eight — hold the frame longer"],
  [2, "a1f3c9e2b7d40e11", 64, 79, ["Frida", "charleston", "sweet vanilla"], ""],
  [3, "a1f3c9e2b7d40e11", 142, 171, ["tandem", "sweet vanilla"], "watch the exit into tandem"],
  [4, "b82d0f5a6c31e977", 20, 44, ["swingout", "sweet vanilla"], "faster tempo, same shape"],
  [5, "b82d0f5a6c31e977", 101, 118, ["kick-away", "footwork"], ""],
  [6, "c4e7a1d9f0b2c356", 38, 72, ["shim sham", "footwork"], "count-in from 5"],
  [7, "c4e7a1d9f0b2c356", 214, 236, ["big apple", "Frankie"], "the truck section"],
  [8, "c4e7a1d9f0b2c356", 480, 521, ["swingout", "Frankie", "styling"], "arm styling on 7-8"],
  [9, "d9b1e4c7a2f6d803", 90, 128, ["big apple", "Frankie"], "full routine once through"],
  [10, "d9b1e4c7a2f6d803", 402, 440, ["charleston", "Frankie", "styling"], ""],
  [11, "e2c6f8a1b3d5e094", 611, 655, ["Skye", "musicality"], "break on the stop-time"],
  [12, "e2c6f8a1b3d5e094", 1204, 1249, ["Frida", "swingout", "musicality"], ""],
  [13, "e2c6f8a1b3d5e094", 1390, 1421, ["jam", "big apple"], "everyone in"],
  [14, "f7a3b9c2d4e6f185", 55, 98, ["jam", "Skye"], ""],
  [15, "0a5c7e9b1d3f0276", 0, 45, ["swingout", "drill"], "left side only"],
  [16, "0a5c7e9b1d3f0276", 130, 190, ["swingout", "drill", "footwork"], "triple steps under tempo"],
  [17, "1b6d8f0c2e4a1367", 14, 60, ["charleston", "footwork", "drill"], ""],
  [18, "1b6d8f0c2e4a1367", 200, 244, ["kick-away", "charleston"], "kick-away → hand-to-hand"],
  // orphan: file no longer on disk
  [19, "9f9f9f9f9f9f9f9f", 30, 62, ["swingout", "Skye"], "old phone recording"],
];

export const clips: Clip[] = rawClips.map(([id, videoHash, s, e, tags, note]) => ({
  id,
  videoHash,
  file:
    rawVideos.find((v) => v[0] === videoHash)?.[1] ??
    "Practice recordings/2025-11-20 old phone.mov",
  startSeconds: s,
  endSeconds: e,
  tags,
  note,
}));

export const videos: Video[] = rawVideos.map(([hash, file, dur, stillIdx]) => {
  const own = clips.filter((c) => c.videoHash === hash);
  return {
    hash,
    file,
    durationSeconds: dur,
    still: stillIdx == null ? null : stills[stillIdx],
    clipCount: own.length,
    firstClipStart: own.length ? Math.min(...own.map((c) => c.startSeconds)) : null,
  };
});
