import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createClip,
  deleteClip,
  fetchClips,
  fetchDownloads,
  fetchSettings,
  fetchTree,
  removeDownload,
  saveSettings,
  startDownload,
  type Clip,
  type ClipInput,
  type Download,
  type Settings,
  type Video,
} from "./lib/api";
import { applyAppearance, type Appearance } from "./lib/appearance";
import type { DownloadControls } from "./lib/downloadControls";
import { buildFeed } from "./lib/feed";
import { FeedPane } from "./lib/FeedPane";
import { MusicPane, MusicSearch } from "./lib/MusicPane";
import { MusicPlayer } from "./lib/MusicPlayer";
import { PlayerPane } from "./lib/PlayerPane";
import { SettingsPane } from "./lib/SettingsPane";
import { Slide } from "./lib/Slide";
import { readFlag, writeFlag } from "./lib/storedFlag";
import { TabSwitch, type Tab } from "./lib/TabSwitch";
import { TagFilter } from "./lib/TagFilter";
import { buildTagIndex } from "./lib/tags";
import { TopBar } from "./lib/TopBar";
import { useAudioPlayer } from "./lib/useAudioPlayer";
import { PHONE_QUERY, useMedia } from "./lib/useMedia";
import { useMusicLibrary } from "./lib/useMusicLibrary";

const ACTIVE_STATES = new Set<Download["state"]>(["queued", "running", "cancelled"]);
/** Poll fast while a Download is in flight, slowly otherwise (another device may start one). */
const POLL_ACTIVE_MS = 1000;
const POLL_IDLE_MS = 5000;
const TOAST_MS = 8000;
const TAB_KEY = "clipmark.tab";
const PLAYER_HIDDEN_KEY = "clipmark.musicbar.hidden";

/** What the Clips page shows instead of the feed: a Video, optionally looping one of its Clips. */
export interface Target {
  video: Video;
  loopClip: Clip | null;
}

function readTab(): Tab {
  try {
    return localStorage.getItem(TAB_KEY) === "music" ? "music" : "clips";
  } catch {
    return "clips";
  }
}

/**
 * The app frame: one top bar (Clips | Music, search, Download, Settings) over a
 * double-width track holding the Clips page (the library feed, or the watch page for
 * a target Video) and the Music page side by side; switching tabs slides the track.
 * Selection state lives here: the tag filter, the target Video + loop Clip, whether
 * Settings covers the pages, and the feed's scroll position. The Music tab's library
 * state and the one audio player live here too, so music keeps playing on either tab.
 */
export function App() {
  const [videos, setVideos] = useState<Video[]>([]);
  // Every subfolder on disk (not just those with Videos) — the Download picker's options.
  const [folders, setFolders] = useState<string[]>([]);
  const [clips, setClips] = useState<Clip[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [tokens, setTokens] = useState<string[]>([]);
  const [target, setTarget] = useState<Target | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  // Settings replaces the main pane / screen; leaving it restores whatever was there.
  const [showSettings, setShowSettings] = useState(false);
  const [downloads, setDownloads] = useState<Download[]>([]);
  // Landed Downloads whose Video the refetch has not shown yet ("landed — scanning").
  const [scanning, setScanning] = useState<Set<number>>(() => new Set());
  const [toast, setToast] = useState<{ title: string; video: Video } | null>(null);
  const landing = useRef(new Set<number>());
  const feedScroll = useRef(0);
  const isPhone = useMedia(PHONE_QUERY);
  const [tab, setTabState] = useState<Tab>(readTab);
  // Per device: hiding the player bar never stops playback.
  const [playerHidden, setPlayerHiddenState] = useState(() => readFlag(PLAYER_HIDDEN_KEY));
  const music = useMusicLibrary(tab === "music");
  const player = useAudioPlayer();
  const { setVisibleList } = player;
  const reloadMusic = music.reload;

  useEffect(() => setVisibleList(music.tracks), [music.tracks, setVisibleList]);

  const setTab = useCallback((next: Tab) => {
    setTabState(next);
    setShowSettings(false);
    try {
      localStorage.setItem(TAB_KEY, next);
    } catch {
      // Private mode: the tab just isn't remembered.
    }
  }, []);

  const setPlayerHidden = useCallback((hidden: boolean) => {
    setPlayerHiddenState(hidden);
    writeFlag(PLAYER_HIDDEN_KEY, hidden);
  }, []);

  const loadLibrary = useCallback(async (): Promise<Video[]> => {
    const [tree, cs] = await Promise.all([fetchTree(), fetchClips()]);
    setVideos(tree.videos);
    setFolders(tree.folders);
    setClips(cs);
    return tree.videos;
  }, []);

  useEffect(() => {
    Promise.all([fetchSettings(), loadLibrary()])
      .then(([s]) => {
        setSettings(s);
        // First run explains itself: no Library Folder yet → open Settings.
        if (s.libraryFolder === null) setShowSettings(true);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, [loadLibrary]);

  // Appearance follows the server setting; another device's change shows when this one comes back into view.
  const font = settings?.font;
  const color = settings?.color;
  useEffect(() => {
    if (font && color) applyAppearance({ font, color });
  }, [font, color]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      fetchSettings()
        .then((s) => setSettings((prev) => (prev ? { ...prev, font: s.font, color: s.color } : prev)))
        .catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const changeAppearance = useCallback((patch: Partial<Appearance>) => {
    // Applies at once; a rejected save puts the previous choice back.
    let previous: Appearance | null = null;
    setSettings((prev) => {
      if (!prev) return prev;
      previous = { font: prev.font, color: prev.color };
      return { ...prev, ...patch };
    });
    saveSettings(patch).catch(() => {
      setSettings((prev) => (prev && previous ? { ...prev, ...previous } : prev));
    });
  }, []);

  // Downloads: poll the queue, and when a file lands refetch the library until the
  // new Video shows, then toast and drop the row (the server forgets it on DELETE).
  const refreshDownloads = useCallback(async () => {
    setDownloads(await fetchDownloads());
  }, []);

  const anyActive = downloads.some((d) => ACTIVE_STATES.has(d.state));
  useEffect(() => {
    if (status !== "ready") return;
    refreshDownloads().catch(() => {});
    const t = setInterval(
      () => refreshDownloads().catch(() => {}),
      anyActive ? POLL_ACTIVE_MS : POLL_IDLE_MS,
    );
    return () => clearInterval(t);
  }, [status, anyActive, refreshDownloads]);

  useEffect(() => {
    for (const d of downloads) {
      if (d.state !== "done" || !d.file || landing.current.has(d.id)) continue;
      landing.current.add(d.id);
      setScanning((prev) => new Set(prev).add(d.id));
      const file = d.file;
      (async () => {
        const vs = await loadLibrary();
        const video = vs.find((v) => v.file === file);
        if (!video) {
          // Not scanned yet — retry on the next poll.
          landing.current.delete(d.id);
          return;
        }
        setToast({ title: d.title ?? video.file, video });
        await removeDownload(d.id);
        setDownloads((prev) => prev.filter((x) => x.id !== d.id));
      })()
        .catch(() => landing.current.delete(d.id))
        .finally(() =>
          setScanning((prev) => {
            const next = new Set(prev);
            next.delete(d.id);
            return next;
          }),
        );
    }
  }, [downloads, loadLibrary]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  const handleStartDownload = useCallback(
    async (url: string, folder: string) => {
      const started = await startDownload(url, folder);
      setDownloads((prev) => [...prev, started]);
    },
    [],
  );

  const handleRemoveDownload = useCallback((target: Download) => {
    // Optimistic: a cancelled row reads "cancelling…" until the server forgets it.
    setDownloads((prev) =>
      target.state === "running"
        ? prev.map((d) => (d.id === target.id ? { ...d, state: "cancelled" } : d))
        : prev.filter((d) => d.id !== target.id),
    );
    removeDownload(target.id).catch(() => {});
  }, []);

  const downloadControls: DownloadControls = useMemo(
    () => ({
      folders,
      activeCount: downloads.filter((d) => ACTIVE_STATES.has(d.state)).length,
      scanning,
      onStart: handleStartDownload,
      onRemove: handleRemoveDownload,
    }),
    [folders, downloads, scanning, handleStartDownload, handleRemoveDownload],
  );

  const tagIndex = useMemo(() => buildTagIndex(clips), [clips]);
  const feed = useMemo(
    () => buildFeed(videos, clips, tokens, downloads),
    [videos, clips, tokens, downloads],
  );

  const open = useCallback((video: Video, clip: Clip | null) => {
    setTarget({ video, loopClip: clip });
    setShowSettings(false);
  }, []);

  const home = useCallback(() => {
    setTarget(null);
    setShowSettings(false);
  }, []);

  const openSettings = useCallback(() => setShowSettings(true), []);

  // No logo: clicking Clips while already on Clips returns to the feed.
  const pickTab = useCallback(
    (next: Tab) => {
      if (next === "clips" && tab === "clips") home();
      else setTab(next);
    },
    [tab, home, setTab],
  );

  // The search sits in the top bar on every Clips page; filtering from the watch page returns to the feed.
  const changeTokens = useCallback((next: string[]) => {
    setTokens(next);
    setTarget(null);
  }, []);

  const handleSaved = useCallback(
    (saved: Settings) => {
      setSettings(saved);
      // The folder applies live on the server; the library reflects it on the next fetch.
      setTarget(null);
      loadLibrary().catch(() => setStatus("error"));
      reloadMusic();
    },
    [loadLibrary, reloadMusic],
  );

  const handleSave = useCallback(async (video: Video, input: ClipInput): Promise<void> => {
    const clip = await createClip(video.hash, input);
    setClips((prev) => [...prev, clip]);
    setVideos((prev) =>
      prev.map((v) =>
        v.hash === video.hash
          ? {
              ...v,
              clipCount: v.clipCount + 1,
              firstClipStart:
                v.firstClipStart == null
                  ? clip.startSeconds
                  : Math.min(v.firstClipStart, clip.startSeconds),
            }
          : v,
      ),
    );
  }, []);

  const handleRemove = useCallback(
    async (clip: Clip): Promise<void> => {
      await deleteClip(clip.id);
      setClips((prev) => prev.filter((c) => c.id !== clip.id));
      setVideos((prev) =>
        prev.map((v) => {
          if (v.hash !== clip.videoHash) return v;
          const remaining = clips.filter((c) => c.videoHash === v.hash && c.id !== clip.id);
          return {
            ...v,
            clipCount: remaining.length,
            firstClipStart: remaining.length
              ? Math.min(...remaining.map((c) => c.startSeconds))
              : null,
          };
        }),
      );
    },
    [clips],
  );

  if (status !== "ready" || settings === null) {
    return (
      <main className="cm-app">
        <div className="cm-empty">
          <div className="cm-empty__glyph">∿</div>
          <p>{status === "loading" ? "Loading the archive…" : "Couldn't reach the Clipmark server."}</p>
        </div>
      </main>
    );
  }

  const onMusic = tab === "music";
  // The Clips page is hidden behind Music or Settings: it is inert and its video pauses.
  const clipsHidden = onMusic || showSettings;

  const clipsPage = target ? (
    <section className="cm-main">
      <PlayerPane
        key={`${target.video.file}:${target.loopClip ? target.loopClip.id : "plain"}`}
        video={target.video}
        loopClip={target.loopClip}
        orphan={!videos.some((v) => v.file === target.video.file)}
        videos={videos}
        clips={clips}
        onSave={handleSave}
        onRemove={handleRemove}
        onOpen={open}
        active={!clipsHidden}
      />
    </section>
  ) : (
    <FeedPane feed={feed} tokens={tokens} downloads={downloadControls} scrollRef={feedScroll} onOpen={open} />
  );

  const musicPage = (
    <MusicPane library={music} player={player} onSettings={openSettings} />
  );

  const showPlayer = onMusic || player.display !== null;

  // On the phone the watch page swaps the top bar for a back header.
  const header =
    isPhone && target && !onMusic && !showSettings ? (
      <header className="cm-phead">
        <button className="cm-back" type="button" onClick={home}>
          ‹ Library
        </button>
      </header>
    ) : (
      <TopBar
        tabs={<TabSwitch tab={tab} onTab={pickTab} />}
        search={
          onMusic ? (
            <MusicSearch library={music} />
          ) : (
            <div className="cm-search" role="search">
              <TagFilter index={tagIndex} tokens={tokens} onTokens={changeTokens} compact />
            </div>
          )
        }
        downloads={onMusic ? null : downloadControls}
        appearance={{ font: settings.font, color: settings.color }}
        onAppearance={changeAppearance}
        settingsOpen={showSettings}
        onSettingsPage={openSettings}
      />
    );

  return (
    <main className={"cm-app" + (isPhone ? " cm-app--phone" : "")}>
      {header}
      <div className="cm-slider">
        <div className={"cm-slider__track" + (onMusic ? " is-music" : "")}>
          <Slide hidden={clipsHidden}>{clipsPage}</Slide>
          <Slide hidden={!onMusic || showSettings}>{musicPage}</Slide>
        </div>
        {showSettings && (
          <div className="cm-layer">
            <SettingsPane settings={settings} onSaved={handleSaved} />
          </div>
        )}
      </div>
      {showPlayer && <MusicPlayer player={player} hidden={playerHidden} onHidden={setPlayerHidden} />}
      {toast && (
        <div className={"cm-toast" + (showPlayer && !playerHidden ? " is-raised" : "")} role="status">
          <span className="cm-toast__text">Downloaded {toast.title}</span>
          <button
            className="cm-toast__btn"
            type="button"
            onClick={() => {
              setTab("clips");
              open(toast.video, null);
              setToast(null);
            }}
          >
            Open
          </button>
          <button className="cm-toast__btn" type="button" aria-label="Dismiss" onClick={() => setToast(null)}>
            ×
          </button>
        </div>
      )}
    </main>
  );
}
