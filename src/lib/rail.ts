import type { Clip, Video } from "./api";

export interface RailEntry {
  video: Video;
  clip: Clip;
  /** How many of the clip's Dancers and Tags appear on the watched Video's clips. */
  shared: number;
}

export interface RailResult {
  own: Clip[];
  /** "Same dancers or tags": clips on this Video and others sharing a Dancer or a Tag with it. */
  related: RailEntry[];
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

/** A clip's Dancers and Tags as case-folded keys; a Dancer never equals a Tag of the same text. */
function keysOf(clip: Clip): string[] {
  const keys = new Set<string>();
  for (const d of clip.dancers) keys.add("d:" + d.toLowerCase());
  for (const t of clip.tags) keys.add("t:" + t.toLowerCase());
  return [...keys];
}

/**
 * The watch page's lists. `own`: this Video's clips by start. `related`: every clip sharing a
 * Dancer or a Tag with a clip on this Video (for this Video's own clips, with another of them),
 * most shared first, this Video's clips first on a tie, then by start and id.
 */
export function railFor(video: Video, videos: Video[], clips: Clip[]): RailResult {
  const videosByHash = new Map(videos.map((v) => [v.hash, v]));
  const own = clips
    .filter((c) => c.videoHash === video.hash)
    .slice()
    .sort((a, b) => a.startSeconds - b.startSeconds || a.id - b.id);
  // How many of this Video's clips carry each key, so an own clip can discount itself.
  const ownKeys = new Map<string, number>();
  for (const c of own) for (const k of keysOf(c)) ownKeys.set(k, (ownKeys.get(k) ?? 0) + 1);

  const related: RailEntry[] = [];
  for (const clip of clips) {
    const isOwn = clip.videoHash === video.hash;
    const shared = keysOf(clip).filter((k) => (ownKeys.get(k) ?? 0) > (isOwn ? 1 : 0)).length;
    if (shared === 0) continue;
    related.push({
      video: isOwn ? video : (videosByHash.get(clip.videoHash) ?? orphanVideoFor(clip)),
      clip,
      shared,
    });
  }
  const here = (e: RailEntry) => (e.clip.videoHash === video.hash ? 0 : 1);
  related.sort(
    (a, b) =>
      b.shared - a.shared ||
      here(a) - here(b) ||
      a.clip.startSeconds - b.clip.startSeconds ||
      a.clip.id - b.clip.id,
  );
  return { own, related };
}
