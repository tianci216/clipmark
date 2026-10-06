import type { Clip, Video } from "./api";

export interface RailEntry {
  video: Video;
  clip: Clip;
  shared: number;
}

export interface RailResult {
  own: Clip[];
  others: RailEntry[];
}

export function orphanVideoFor(clip: Clip): Video {
  return {
    hash: clip.videoHash,
    file: clip.file,
    fileMtime: null,
    durationSeconds: null,
    thumbnail: null,
    clipCount: 0,
    firstClipStart: null,
    source: null,
  };
}

export function railFor(
  video: Video,
  videos: Video[],
  clips: Clip[],
): RailResult {
  const videosByHash = new Map(videos.map((v) => [v.hash, v]));
  const own = clips
    .filter((c) => c.videoHash === video.hash)
    .slice()
    .sort((a, b) => a.startSeconds - b.startSeconds || a.id - b.id);
  const ownTags = new Set(own.flatMap((c) => c.tags).map((t) => t.toLowerCase()));
  const others: RailEntry[] = [];
  for (const clip of clips) {
    if (clip.videoHash === video.hash) continue;
    const shared = clip.tags.filter((t) => ownTags.has(t.toLowerCase())).length;
    if (shared === 0) continue;
    others.push({
      video: videosByHash.get(clip.videoHash) ?? orphanVideoFor(clip),
      clip,
      shared,
    });
  }
  others.sort(
    (a, b) =>
      b.shared - a.shared ||
      a.clip.startSeconds - b.clip.startSeconds ||
      a.clip.id - b.clip.id,
  );
  return { own, others };
}
