import type { Clip, Video } from "./api";
import { dirname } from "./format";
import { orphanVideoFor } from "./rail";
import { matchesTokens } from "./tags";

export interface TreeVideo {
  video: Video;
  /** Every Clip on this Video, sorted by start then id. */
  clips: Clip[];
  /** True when the Video's file is missing from disk and the row exists only because of its Clips. */
  orphan: boolean;
  /** Clips to render: the matching ones while a filter is active, else every clip. */
  visibleClips: Clip[];
  /** Number of clips matching the filter (equals total when no filter is active). */
  matching: number;
  total: number;
}

export interface TreeFolder {
  /** Folder-relative path; "" is the Library Folder's top level. */
  path: string;
  videos: TreeVideo[];
}

export interface LibraryTree {
  folders: TreeFolder[];
  filtering: boolean;
  /** Footnote numbers over the whole library (not the filtered view). */
  totals: { videos: number; folders: number; clips: number; matching: number };
}

export function buildLibraryTree(
  videos: Video[],
  clips: Clip[],
  tokens: string[],
): LibraryTree {
  const filtering = tokens.length > 0;
  const clipsByHash = new Map<string, Clip[]>();
  for (const clip of clips) {
    const list = clipsByHash.get(clip.videoHash) ?? [];
    list.push(clip);
    clipsByHash.set(clip.videoHash, list);
  }
  const known = new Set(videos.map((v) => v.hash));
  const orphans = new Map<string, Video>();
  for (const clip of clips) {
    if (!known.has(clip.videoHash) && !orphans.has(clip.videoHash)) {
      orphans.set(clip.videoHash, orphanVideoFor(clip));
    }
  }
  const rows = [
    ...videos.map((video) => ({ video, orphan: false })),
    ...[...orphans.values()].map((video) => ({ video, orphan: true })),
  ];
  const byFolder = new Map<string, TreeVideo[]>();
  const allFolders = new Set<string>();
  for (const { video, orphan } of rows) {
    const path = dirname(video.file);
    allFolders.add(path);
    const list = byFolder.get(path) ?? [];
    const own = (clipsByHash.get(video.hash) ?? [])
      .slice()
      .sort((a, b) => a.startSeconds - b.startSeconds || a.id - b.id);
    const matchingClips = filtering
      ? own.filter((c) => matchesTokens(tokens, c.tags))
      : own;
    if (filtering && matchingClips.length === 0) continue;
    list.push({
      video,
      clips: own,
      orphan,
      visibleClips: matchingClips,
      matching: matchingClips.length,
      total: own.length,
    });
    byFolder.set(path, list);
  }
  const folders = [...byFolder.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([path, vs]) => ({
      path,
      videos: vs.sort((a, b) => a.video.file.localeCompare(b.video.file)),
    }));
  const totals = {
    videos: rows.length,
    folders: allFolders.size,
    clips: clips.length,
    matching: filtering
      ? clips.filter((c) => matchesTokens(tokens, c.tags)).length
      : clips.length,
  };
  return { folders, filtering, totals };
}
