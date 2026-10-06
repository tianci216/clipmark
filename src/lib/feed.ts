import type { Clip, Download, Video } from "./api";
import { dirname, folderLabel, formatUploadDate } from "./format";
import { buildTermIndex, type Pill, type Suggestion, type Term } from "./pills";
import { orphanVideoFor } from "./rail";

/** What the top-bar search filters by: Dancers, Tags and the folder a Video sits in. */
export type SearchKind = "dancer" | "tag" | "folder";
export type SearchPill = Pill<SearchKind>;

const contains = (values: string[], text: string) => {
  const q = text.trim().toLowerCase();
  return values.some((v) => v.toLowerCase().includes(q));
};

/** The folder a Video sits in, as a folder pill names it ("Library Folder" for the top level). */
export const videoFolder = (video: Video): string => folderLabel(dirname(video.file));

/**
 * A Dancer pill looks only at Dancers and a Tag pill only at Tags, by case-insensitive substring.
 * A folder pill matches every Clip on a Video in exactly that folder (not its subfolders), going
 * by the card's own file: two files sharing a Hash can sit in different folders.
 */
export function pillMatches(pill: SearchPill, clip: Clip, video: Video): boolean {
  switch (pill.kind) {
    case "dancer":
      return contains(clip.dancers, pill.text);
    case "tag":
      return contains(clip.tags, pill.text);
    case "folder":
      return videoFolder(video).toLowerCase() === pill.text.trim().toLowerCase();
  }
}

/** A Clip on a Video matches the search when every pill matches it. */
export function matchesPills(pills: SearchPill[], clip: Clip, video: Video): boolean {
  return pills.every((p) => pillMatches(p, clip, video));
}

/** How many suggested chips the feed shows after "All". */
export const CHIP_COUNT = 16;

export type SearchChip = Suggestion<"dancer" | "tag">;

/** The chips row: the most-used Dancers and Tags together, by Clip count then A-Z. */
export function searchChips(clips: Clip[], limit = CHIP_COUNT): SearchChip[] {
  const dancers = buildTermIndex(clips.map((c) => c.dancers)).map((t) => ({ kind: "dancer" as const, ...t }));
  const tags = buildTermIndex(clips.map((c) => c.tags)).map((t) => ({ kind: "tag" as const, ...t }));
  return [...dancers, ...tags]
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text))
    .slice(0, limit);
}

const samePill = (a: Pill, b: Pill) => a.kind === b.kind && a.text.toLowerCase() === b.text.toLowerCase();

/** Whether a chip's pill is in the search (same kind, any case). */
export function chipOn(search: SearchPill[], chip: Pill<SearchKind>): boolean {
  return search.some((p) => samePill(p, chip));
}

/** Clicking a chip: drops its pill from the search if there, else adds it at the end. */
export function toggleChip(search: SearchPill[], chip: Pill<SearchKind>): SearchPill[] {
  return chipOn(search, chip)
    ? search.filter((p) => !samePill(p, chip))
    : [...search, { kind: chip.kind, text: chip.text }];
}

/** The filtered feed's empty state, naming the search. */
export function noMatchText(search: SearchPill[]): string {
  return `No clips match ${search.map((p) => p.text).join(" + ")}`;
}

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
 * A Video card's two meta lines, minus the clip count: the first reads "channel · folder"
 * (just the folder without a channel; the folder is what a folder pill names); `origin`
 * follows the count — the upload date, "local file" without a Source, or null when the
 * Source has no date.
 */
export function cardMeta(video: Video): { channel: string | null; folder: string; origin: string | null } {
  const folder = videoFolder(video);
  const { source } = video;
  if (!source) return { channel: null, folder, origin: "local file" };
  return {
    channel: source.channel,
    folder,
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
export function buildFeed(videos: Video[], clips: Clip[], pills: SearchPill[], downloads: Download[]): Feed {
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

  const filtering = pills.length > 0;
  const cards: FeedCard[] = filtering ? [] : downloads.map(downloadCard);
  for (const { video, missing } of rows) {
    const own = (clipsByHash.get(video.hash) ?? []).slice().sort(byStart);
    const matches = filtering ? own.filter((c) => matchesPills(pills, c, video)) : own;
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

/**
 * The search's folder suggestions: each folder with the Clips its cards hold (missing-file
 * cards included), most first then A-Z. Folders whose Videos have no Clips are left out:
 * a folder pill only ever shows Clips.
 */
export function folderTerms(videos: Video[], clips: Clip[]): Term[] {
  const counts = new Map<string, number>();
  for (const card of buildFeed(videos, clips, [], []).cards) {
    if (card.kind !== "video" || card.total === 0) continue;
    const folder = videoFolder(card.video);
    counts.set(folder, (counts.get(folder) ?? 0) + card.total);
  }
  return [...counts]
    .map(([text, count]) => ({ text, count }))
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text));
}
