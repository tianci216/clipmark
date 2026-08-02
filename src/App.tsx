import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createClip,
  deleteClip,
  fetchClips,
  fetchVideos,
  type Clip,
  type ClipInput,
  type Video,
} from "./lib/api";
import { LibraryView, type Tab } from "./lib/LibraryView";
import { PlayerView } from "./lib/PlayerView";
import { buildTagIndex } from "./lib/tags";

interface Target {
  video: Video;
  loopClip: Clip | null;
}

export function App() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [clips, setClips] = useState<Clip[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [tab, setTab] = useState<Tab>("clips");
  const [tokens, setTokens] = useState<string[]>([]);
  const [target, setTarget] = useState<Target | null>(null);
  const [libScroll, setLibScroll] = useState(0);

  useEffect(() => {
    Promise.all([fetchVideos(), fetchClips()])
      .then(([vs, cs]) => {
        setVideos(vs);
        setClips(cs);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  const tagIndex = useMemo(() => buildTagIndex(clips), [clips]);

  const open = useCallback(
    (video: Video, clip: Clip | null, scrollTop?: number) => {
      if (scrollTop !== undefined) setLibScroll(scrollTop);
      setTarget({ video, loopClip: clip });
    },
    [],
  );

  const handleSave = useCallback(
    async (video: Video, input: ClipInput): Promise<void> => {
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
    },
    [],
  );

  const handleRemove = useCallback(
    async (clip: Clip): Promise<void> => {
      await deleteClip(clip.id);
      setClips((prev) => prev.filter((c) => c.id !== clip.id));
      setVideos((prev) =>
        prev.map((v) => {
          if (v.hash !== clip.videoHash) return v;
          const remaining = clips.filter(
            (c) => c.videoHash === v.hash && c.id !== clip.id,
          );
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

  const handleNavigate = useCallback(
    (video: Video, clip: Clip) => open(video, clip),
    [open],
  );

  if (status !== "ready") {
    return (
      <main className="cm-app">
        <div className="cm-empty">
          <div className="cm-empty__glyph">∿</div>
          <p>
            {status === "loading"
              ? "Loading the archive…"
              : "Couldn't reach the Clipmark server."}
          </p>
        </div>
      </main>
    );
  }

  if (target) {
    return (
      <PlayerView
        key={`${target.video.hash}:${target.loopClip ? target.loopClip.id : "plain"}`}
        video={target.video}
        loopClip={target.loopClip}
        videos={videos}
        clips={clips}
        onSave={handleSave}
        onRemove={handleRemove}
        onBack={() => setTarget(null)}
        onNavigate={handleNavigate}
      />
    );
  }

  return (
    <LibraryView
      tab={tab}
      onTab={setTab}
      tokens={tokens}
      onTokens={setTokens}
      tagIndex={tagIndex}
      videos={videos}
      clips={clips}
      initialScrollTop={libScroll}
      onOpenClip={(video, clip, scrollTop) => open(video, clip, scrollTop)}
      onOpenVideo={(video, scrollTop) => open(video, null, scrollTop)}
    />
  );
}
