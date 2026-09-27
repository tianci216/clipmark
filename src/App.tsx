import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createClip,
  deleteClip,
  fetchClips,
  fetchDownloads,
  fetchSettings,
  fetchTree,
  removeDownload,
  startDownload,
  type Clip,
  type ClipInput,
  type Download,
  type Settings,
  type Video,
} from "./lib/api";
import type { DownloadControls } from "./lib/downloadControls";
import { dirname, folderLabel } from "./lib/format";
import { IndexPane } from "./lib/IndexPane";
import { buildLibraryTree } from "./lib/libraryTree";
import { MusicPane } from "./lib/MusicPane";
import { MusicPlayer } from "./lib/MusicPlayer";
import { MusicNav, MusicSidebar } from "./lib/MusicSidebar";
import { PhoneLibrary } from "./lib/PhoneLibrary";
import { PlayerPane } from "./lib/PlayerPane";
import { SettingsPane } from "./lib/SettingsPane";
import { Sidebar, type Target } from "./lib/Sidebar";
import { TabSwitch, type Tab } from "./lib/TabSwitch";
import { buildTagIndex } from "./lib/tags";
import { useAudioPlayer } from "./lib/useAudioPlayer";
import { PHONE_QUERY, useMedia } from "./lib/useMedia";
import { useMusicLibrary } from "./lib/useMusicLibrary";

const ACTIVE_STATES = new Set<Download["state"]>(["queued", "running", "cancelled"]);
/** Poll fast while a Download is in flight, slowly otherwise (another device may start one). */
const POLL_ACTIVE_MS = 1000;
const POLL_IDLE_MS = 5000;
const TOAST_MS = 8000;
const TAB_KEY = "clipmark.tab";

function readTab(): Tab {
  try {
    return localStorage.getItem(TAB_KEY) === "music" ? "music" : "clips";
  } catch {
    return "clips";
  }
}

/**
 * Persistent Explorer shell (ADR-0001 amendment). Selection state lives here:
 * the tag filter, the target Video + loop Clip, the phone's drilled-into folder,
 * whether the main pane shows Settings, and the scroll positions the index /
 * folder screen restore on return. The Clips / Music tab switch lives here too, with
 * the Music tab's library state and the one audio player, so music keeps playing
 * across tabs.
 */
export function App() {
  const [videos, setVideos] = useState<Video[]>([]);
  // Every subfolder on disk (not just those with Videos) — the Download picker's options.
  const [folders, setFolders] = useState<string[]>([]);
  const [clips, setClips] = useState<Clip[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [tokens, setTokens] = useState<string[]>([]);
  const [target, setTarget] = useState<Target | null>(null);
  const [phoneFolder, setPhoneFolder] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  // Settings replaces the main pane / screen; leaving it restores whatever was there.
  const [showSettings, setShowSettings] = useState(false);
  const [downloads, setDownloads] = useState<Download[]>([]);
  // Landed Downloads whose Video the refetch has not shown yet ("landed — scanning").
  const [scanning, setScanning] = useState<Set<number>>(() => new Set());
  const [toast, setToast] = useState<{ title: string; video: Video } | null>(null);
  const landing = useRef(new Set<number>());
  const indexScroll = useRef(0);
  const phoneScroll = useRef(0);
  const isPhone = useMedia(PHONE_QUERY);
  const [tab, setTabState] = useState<Tab>(readTab);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const music = useMusicLibrary(tab === "music");
  const player = useAudioPlayer();
  const { setVisibleList } = player;
  const reloadMusic = music.reload;

  useEffect(() => setVisibleList(music.tracks), [music.tracks, setVisibleList]);

  const setTab = useCallback((next: Tab) => {
    setTabState(next);
    setShowSettings(false);
    setDrawerOpen(false);
    try {
      localStorage.setItem(TAB_KEY, next);
    } catch {
      // Private mode: the tab just isn't remembered.
    }
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
  const tree = useMemo(
    () => buildLibraryTree(videos, clips, tokens, downloads),
    [videos, clips, tokens, downloads],
  );

  const open = useCallback((video: Video, clip: Clip | null) => {
    setTarget({ video, loopClip: clip });
    // On the phone, back from the player lands in the video's own folder.
    setPhoneFolder(dirname(video.file));
    setShowSettings(false);
  }, []);

  const home = useCallback(() => {
    setTarget(null);
    setShowSettings(false);
  }, []);

  const openSettings = useCallback(() => setShowSettings(true), []);
  const closeSettings = useCallback(() => setShowSettings(false), []);

  const handleSaved = useCallback(
    (saved: Settings) => {
      setSettings(saved);
      // The folder applies live on the server; the library reflects it on the next fetch.
      setTarget(null);
      setPhoneFolder(null);
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

  const videoPlayer = target && (
    <PlayerPane
      key={`${target.video.file}:${target.loopClip ? target.loopClip.id : "plain"}`}
      video={target.video}
      loopClip={target.loopClip}
      orphan={!videos.some((v) => v.file === target.video.file)}
      videos={videos}
      clips={clips}
      phone={isPhone}
      onSave={handleSave}
      onRemove={handleRemove}
      onOpen={open}
    />
  );

  const settingsPane = <SettingsPane settings={settings} onSaved={handleSaved} />;

  const tabs = <TabSwitch tab={tab} onTab={setTab} />;
  const showPlayer = tab === "music" || player.display !== null;
  const playerBar = showPlayer && <MusicPlayer player={player} />;
  const musicPane = <MusicPane library={music} player={player} onSettings={openSettings} />;

  const toastEl = toast && (
    <div className={"cm-toast" + (showPlayer ? " is-raised" : "")} role="status">
      <span className="cm-toast__text">Downloaded {toast.title}</span>
      <button
        className="cm-toast__btn"
        type="button"
        onClick={() => {
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
  );

  if (isPhone) {
    if (showSettings) {
      return (
        <main className="cm-app cm-app--phone">
          <header className="cm-phead">
            <button className="cm-back" type="button" onClick={closeSettings}>
              ‹ {tab === "music" ? "Music" : "Library"}
            </button>
          </header>
          {settingsPane}
          {playerBar}
          {toastEl}
        </main>
      );
    }
    if (target) {
      return (
        <main className="cm-app cm-app--phone">
          <header className="cm-phead">
            <button className="cm-back" type="button" onClick={home}>
              ‹ {folderLabel(dirname(target.video.file))}
            </button>
          </header>
          <section className="cm-main">{videoPlayer}</section>
          {playerBar}
          {toastEl}
        </main>
      );
    }
    if (tab === "music") {
      return (
        <main className="cm-app cm-app--phone">
          <header className="cm-phead">
            <span className="mx-phead__left">
              <button
                className="mx-menu"
                type="button"
                aria-label="Crates and playlists"
                onClick={() => setDrawerOpen(true)}
              >
                ☰
              </button>
              {tabs}
            </span>
            <button className="cm-actions__btn" type="button" title="Settings" aria-label="Settings" onClick={openSettings}>
              ⚙
            </button>
          </header>
          {musicPane}
          {playerBar}
          <div className={"mx-overlay" + (drawerOpen ? " is-open" : "")} onClick={() => setDrawerOpen(false)} />
          <aside className={"mx-drawer" + (drawerOpen ? " is-open" : "")} aria-hidden={!drawerOpen}>
            <MusicNav library={music} onPick={() => setDrawerOpen(false)} />
          </aside>
          {toastEl}
        </main>
      );
    }
    return (
      <>
        <PhoneLibrary
          tree={tree}
          tagIndex={tagIndex}
          tokens={tokens}
          onTokens={setTokens}
          folder={phoneFolder}
          onFolder={setPhoneFolder}
          scrollRef={phoneScroll}
          onOpen={open}
          onSettings={openSettings}
          downloads={downloadControls}
          tabs={tabs}
          footer={playerBar}
        />
        {toastEl}
      </>
    );
  }

  if (tab === "music") {
    return (
      <main className="cm-app">
        <div className="cm-cols">
          <MusicSidebar
            top={
              <div className="cm-side__brandrow">
                <div className="cm-brand">
                  Clipmark<span>.</span>
                </div>
                {tabs}
              </div>
            }
            library={music}
            onPick={closeSettings}
            onSettings={openSettings}
          />
          {showSettings ? settingsPane : musicPane}
        </div>
        {playerBar}
        {toastEl}
      </main>
    );
  }

  return (
    <main className="cm-app">
      <div className="cm-cols">
        <Sidebar
          tree={tree}
          tagIndex={tagIndex}
          tokens={tokens}
          onTokens={setTokens}
          target={target}
          onHome={home}
          onOpen={open}
          onSettings={openSettings}
          downloads={downloadControls}
          tabs={tabs}
        />
        {showSettings ? (
          settingsPane
        ) : target ? (
          <section className="cm-main">{videoPlayer}</section>
        ) : (
          <IndexPane tree={tree} tokens={tokens} scrollRef={indexScroll} onOpen={open} />
        )}
      </div>
      {playerBar}
      {toastEl}
    </main>
  );
}
