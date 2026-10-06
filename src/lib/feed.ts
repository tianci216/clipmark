import type { Clip, Download, Video } from "./api";
import { dirname, folderLabel, formatUploadDate } from "./format";
import { orphanVideoFor } from "./rail";
import { matchesTokens } from "./tags";

/** How many matching Clips a filtered card lists under its title. */
export const FIRST_MATCHES = 3;

export interface VideoCard {
  kind: "video";
  video: Video;
  /** Every Clip on this Video, sorted by start then id. */
  clips: Clip[];
  /** The Video's file is gone from inside the Library Folder; the card exists for its Clips. */
  missing: boolean;
  total: number;
  /** Clips matching the filter (every Clip when no filter is active). */
  matching: number;
  matchIds: Set<number>;
  /** The first few matching Clips by start, listed on the card while filtering. */
  firstMatches: Clip[];
}

export type DownloadCardState = "queued" | "downloading" | "failed" | "scanning" | "cancelling";

export interface DownloadCard {
  kind: "download";
  download: Download;
  /** "scanning" once the file has landed, until the Video's own card replaces it. */
  state: DownloadCardState;
  /** Queued and running Downloads can be cancelled from the card. */
  cancellable: boolean;
}

const CARD_STATE: Record<Download["state"], DownloadCardState> = {
  queued: "queued",
  running: "downloading",
  failed: "failed",
  done: "scanning",
  cancelled: "cancelling",
};

function downloadCard(download: Download): DownloadCard {
  return {
    kind: "download",
    download,
    state: CARD_STATE[download.state],
    cancellable: download.state === "queued" || download.state === "running",
  };
}

export type FeedCard = VideoCard | DownloadCard;

export interface Feed {
  cards: FeedCard[];
  filtering: boolean;
  /** Why there are no cards: nothing in the library, or nothing matches the filter. */
  empty: "library" | "filter" | null;
}

/**
 * A Video card's two meta lines, minus the clip count: `place` is "channel · folder"
 * (just the folder without a channel); `origin` follows the count — the upload date,
 * "local file" without a Source, or null when the Source has no date.
 */
export function cardMeta(video: Video): { place: string; origin: string | null } {
  const folder = folderLabel(dirname(video.file));
  const { source } = video;
  if (!source) return { place: folder, origin: "local file" };
  return {
    place: source.channel ? `${source.channel} · ${folder}` : folder,
    origin: source.uploadDate ? formatUploadDate(source.uploadDate) : null,
  };
}

const byStart = (a: Clip, b: Clip) => a.startSeconds - b.startSeconds || a.id - b.id;

/** Newest file first; Videos without an mtime (missing files) after dated ones; ties by file. */
function newestFirst(a: Video, b: Video): number {
  if (a.fileMtime !== b.fileMtime) {
    if (a.fileMtime === null) return 1;
    if (b.fileMtime === null) return -1;
    return b.fileMtime - a.fileMtime;
  }
  return a.file.localeCompare(b.file);
}

/**
 * The library feed (replaces the folder tree): Download cards first (only while no filter
 * is active), then one card per Video, newest file first, plus a missing-file card for each
 * Hash that has Clips but no file on disk. A filter keeps only Videos with a matching Clip.
 */
export function buildFeed(videos: Video[], clips: Clip[], tokens: string[], downloads: Download[]): Feed {
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
    ...videos.map((video) => ({ video, missing: false })),
    ...[...orphans.values()].map((video) => ({ video, missing: true })),
  ].sort((a, b) => newestFirst(a.video, b.video));

  const filtering = tokens.length > 0;
  const cards: FeedCard[] = filtering ? [] : downloads.map(downloadCard);
  for (const { video, missing } of rows) {
    const own = (clipsByHash.get(video.hash) ?? []).slice().sort(byStart);
    const matches = filtering ? own.filter((c) => matchesTokens(tokens, c.tags)) : own;
    if (filtering && matches.length === 0) continue;
    cards.push({
      kind: "video",
      video,
      clips: own,
      missing,
      total: own.length,
      matching: matches.length,
      matchIds: new Set(matches.map((c) => c.id)),
      firstMatches: matches.slice(0, FIRST_MATCHES),
    });
  }
  const empty = cards.length > 0 ? null : filtering ? "filter" : "library";
  return { cards, filtering, empty };
}
