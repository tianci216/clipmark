/** The Music tab's read-only view of the Mixxx library (GET /api/music/*). */

export interface Collection {
  id: number;
  name: string;
}

export interface Track {
  id: number;
  artist: string;
  title: string;
  album: string;
  genre: string;
  /** Seconds; 0 when Mixxx has none. */
  duration: number;
  bpm: number | null;
  key: string;
  filetype: string;
}

export type SortColumn = "artist" | "title" | "bpm" | "key" | "duration" | "genre";
export type SortOrder = "asc" | "desc";

export type MusicView =
  | { type: "all" }
  | { type: "crate"; id: number; name: string }
  | { type: "playlist"; id: number; name: string };

/** A failed request, with the HTTP status (400 = the search was rejected, 503 = no Mixxx library). */
export class MusicHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    let message = `GET ${url} failed: ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // keep the status message
    }
    throw new MusicHttpError(message, res.status);
  }
  return (await res.json()) as T;
}

export function fetchCrates(): Promise<Collection[]> {
  return getJson("/api/music/crates");
}

export function fetchPlaylists(): Promise<Collection[]> {
  return getJson("/api/music/playlists");
}

export function fetchTracks(
  view: MusicView,
  query: string,
  sort: { col: SortColumn; order: SortOrder },
): Promise<Track[]> {
  const params = new URLSearchParams();
  if (view.type === "crate") params.set("crate", String(view.id));
  if (view.type === "playlist") params.set("playlist", String(view.id));
  if (query) params.set("q", query);
  params.set("sort", sort.col);
  params.set("order", sort.order);
  return getJson("/api/music/tracks?" + params);
}

export function audioUrl(id: number): string {
  return `/api/music/audio/${id}`;
}

/** m:ss for the track table; blank when unknown, as mobile-mixxx showed it. */
/** The list heading: its name, then "Crate · / Playlist · N tracks · M min". */
export function listHeading(view: MusicView, tracks: Track[]): { title: string; meta: string } {
  const seconds = tracks.reduce((sum, t) => sum + (t.duration || 0), 0);
  const count = `${tracks.length} ${tracks.length === 1 ? "track" : "tracks"} · ${Math.round(seconds / 60)} min`;
  if (view.type === "all") return { title: "All tracks", meta: count };
  return { title: view.name, meta: `${view.type === "crate" ? "Crate" : "Playlist"} · ${count}` };
}

export function formatDuration(seconds: number): string {
  if (!seconds) return "";
  return formatClock(seconds);
}

/** m:ss for the player clock; 0:00 at the start. */
export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
