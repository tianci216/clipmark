import { useCallback, useEffect, useRef, useState } from "react";
import { audioUrl, type Track } from "./musicApi";

const MEDIA_ERRORS: Record<number, string> = {
  1: "Aborted",
  2: "Network error",
  3: "Decode error",
  4: "Not supported",
};

export interface AudioPlayer {
  /** The one audio element; the player bar reads time and buffering from it directly. */
  audio: HTMLAudioElement;
  /** Track loaded in the player (highlighted in the list); null when idle or after an error. */
  currentId: number | null;
  /** Track whose audio has not started yet. */
  loadingId: number | null;
  paused: boolean;
  /** The now-playing lines; null shows "Select a track to play". */
  display: { title: string; artist: string } | null;
  /** Plays `track`; `list` is the list it was picked from, for next / previous. */
  play: (track: Track, list: Track[]) => void;
  toggle: () => void;
  /** Next (+1) or previous (-1) track. */
  step: (delta: number) => void;
  /** The list on screen; next / previous follow it while it holds the current track. */
  setVisibleList: (list: Track[]) => void;
}

/**
 * Audio playback for the Music tab (ported from mobile-mixxx): one audio element
 * for the whole app, so music keeps playing across tab switches. A click on the
 * playing track restarts it; the end of a track advances to the next one.
 */
export function useAudioPlayer(): AudioPlayer {
  const [audio] = useState(() => {
    const el = new Audio();
    el.preload = "auto";
    return el;
  });
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [paused, setPaused] = useState(true);
  const [display, setDisplay] = useState<AudioPlayer["display"]>(null);
  const current = useRef<number | null>(null);
  const loading = useRef<number | null>(null);
  const loadToken = useRef(0);
  const queue = useRef<Track[]>([]);
  const visible = useRef<Track[]>([]);

  const setCurrent = (id: number | null) => {
    current.current = id;
    setCurrentId(id);
  };
  const setLoading = (id: number | null) => {
    loading.current = id;
    setLoadingId(id);
  };

  const play = useCallback(
    async (track: Track, list: Track[]) => {
      // Same track already loaded: restart it.
      if (track.id === current.current && audio.getAttribute("src") && loading.current === null) {
        audio.currentTime = 0;
        audio.play().catch(() => {});
        return;
      }

      const token = ++loadToken.current;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();

      queue.current = list;
      setCurrent(track.id);
      setLoading(track.id);
      setDisplay({ title: track.title, artist: track.artist });

      try {
        audio.src = audioUrl(track.id);
        audio.load();
        try {
          await audio.play();
        } catch (err) {
          if (token !== loadToken.current) return;
          if ((err as DOMException).name !== "NotAllowedError") throw err;
          setPaused(true);
          setDisplay({ title: track.title, artist: `${track.artist} — Tap play to start` });
        }
      } catch (err) {
        if (token !== loadToken.current || (err as DOMException).name === "AbortError") return;
        setCurrent(null);
        setDisplay({ title: "Error", artist: (err as Error).message || "Tap to retry" });
      } finally {
        if (token === loadToken.current) setLoading(null);
      }
    },
    [audio],
  );

  const step = useCallback(
    (delta: number) => {
      const id = current.current;
      if (id === null) return;
      // Follow the list on screen when it still holds the track, else the one it was picked from.
      const onScreen = visible.current.findIndex((t) => t.id === id);
      const list = onScreen >= 0 ? visible.current : queue.current;
      const idx = onScreen >= 0 ? onScreen : list.findIndex((t) => t.id === id);
      const next = list[idx + delta];
      if (idx >= 0 && next) play(next, list);
    },
    [play],
  );

  const toggle = useCallback(() => {
    if (audio.getAttribute("src") && audio.paused) audio.play().catch(() => {});
    else audio.pause();
  }, [audio]);

  const setVisibleList = useCallback((list: Track[]) => {
    visible.current = list;
  }, []);

  useEffect(() => {
    const onPlay = () => setPaused(false);
    const onPause = () => setPaused(true);
    const onPlaying = () => setLoading(null);
    const onEnded = () => step(1);
    const onError = () => {
      // Clearing the source between tracks is not a failure.
      if (!audio.getAttribute("src")) return;
      const msg = MEDIA_ERRORS[audio.error?.code ?? 0] ?? "Unknown error";
      setLoading(null);
      setCurrent(null);
      setPaused(true);
      setDisplay({ title: `Error: ${msg}`, artist: "Tap to retry" });
    };
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };
  }, [audio, step]);

  return { audio, currentId, loadingId, paused, display, play, toggle, step, setVisibleList };
}
