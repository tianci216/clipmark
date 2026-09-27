import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchCrates,
  fetchPlaylists,
  fetchTracks,
  MusicHttpError,
  type Collection,
  type MusicView,
  type SortColumn,
  type SortOrder,
  type Track,
} from "./musicApi";

const SEARCH_DEBOUNCE_MS = 300;

export interface MusicLibrary {
  crates: Collection[];
  playlists: Collection[];
  view: MusicView;
  selectView: (view: MusicView) => void;
  sort: { col: SortColumn; order: SortOrder };
  /** Same column flips the order; a new column starts ascending. */
  toggleSort: (col: SortColumn) => void;
  /** The search box text; the track list follows it after a short pause. */
  searchText: string;
  setSearchText: (text: string) => void;
  tracks: Track[];
  status: "idle" | "loading" | "ready" | "error";
  /** Why the library could not be read (e.g. no Mixxx database), when status is "error". */
  error: string | null;
  /** A search the server rejected (e.g. bpm:fast); the previous list stays. */
  queryError: string | null;
  /** Refetches collections and tracks (after the Mixxx settings change). */
  reload: () => void;
}

/**
 * Music tab state (ported from mobile-mixxx): the selected view (all tracks, a
 * crate or a playlist), sort, debounced search, and the track list. Lives in the
 * App so it survives tab switches; nothing is fetched until the tab is first opened.
 */
export function useMusicLibrary(enabled: boolean): MusicLibrary {
  const [started, setStarted] = useState(false);
  const [crates, setCrates] = useState<Collection[]>([]);
  const [playlists, setPlaylists] = useState<Collection[]>([]);
  const [view, setView] = useState<MusicView>({ type: "all" });
  const [sort, setSort] = useState<{ col: SortColumn; order: SortOrder }>({ col: "artist", order: "asc" });
  const [searchText, setSearchText] = useState("");
  const [query, setQuery] = useState("");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [status, setStatus] = useState<MusicLibrary["status"]>("idle");
  const [error, setError] = useState<string | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const requestToken = useRef(0);

  useEffect(() => {
    if (enabled) setStarted(true);
  }, [enabled]);

  useEffect(() => {
    const t = setTimeout(() => setQuery(searchText.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchText]);

  useEffect(() => {
    if (!started) return;
    Promise.all([fetchCrates(), fetchPlaylists()])
      .then(([c, p]) => {
        setCrates(c);
        setPlaylists(p);
      })
      .catch(() => {
        // The track fetch reports the reason.
      });
  }, [started, generation]);

  useEffect(() => {
    if (!started) return;
    const token = ++requestToken.current;
    setStatus((s) => (s === "ready" ? s : "loading"));
    fetchTracks(view, query, sort)
      .then((ts) => {
        if (token !== requestToken.current) return;
        setTracks(ts);
        setStatus("ready");
        setError(null);
        setQueryError(null);
      })
      .catch((err: Error) => {
        if (token !== requestToken.current) return;
        // A rejected search keeps the list; anything else means the library is unreadable.
        if (err instanceof MusicHttpError && err.status === 400) {
          setQueryError(err.message);
          setStatus("ready");
        } else {
          setError(err.message);
          setStatus("error");
        }
      });
  }, [started, view, query, sort, generation]);

  const selectView = useCallback((next: MusicView) => {
    setView(next);
    // A playlist opens in its own order (the server's default for "artist, ascending").
    if (next.type === "playlist") setSort({ col: "artist", order: "asc" });
  }, []);

  const toggleSort = useCallback((col: SortColumn) => {
    setSort((s) => (s.col === col ? { col, order: s.order === "asc" ? "desc" : "asc" } : { col, order: "asc" }));
  }, []);

  const reload = useCallback(() => setGeneration((g) => g + 1), []);

  return {
    crates,
    playlists,
    view,
    selectView,
    sort,
    toggleSort,
    searchText,
    setSearchText,
    tracks,
    status,
    error,
    queryError,
    reload,
  };
}
