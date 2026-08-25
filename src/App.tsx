import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createClip,
  deleteClip,
  fetchClips,
  fetchVideos,
  type Clip,
  type ClipInput,
  type Video,
} from "./lib/api";
import { dirname, folderLabel } from "./lib/format";
import { IndexPane } from "./lib/IndexPane";
import { buildLibraryTree } from "./lib/libraryTree";
import { PhoneLibrary } from "./lib/PhoneLibrary";
import { PlayerPane } from "./lib/PlayerPane";
import { Sidebar, type Target } from "./lib/Sidebar";
import { buildTagIndex } from "./lib/tags";
import { PHONE_QUERY, useMedia } from "./lib/useMedia";

/**
 * Persistent Explorer shell (ADR-0001 amendment). Selection state lives here:
 * the tag filter, the target Video + loop Clip, the phone's drilled-into folder,
 * and the scroll positions the index / folder screen restore on return.
 */
export function App() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [clips, setClips] = useState<Clip[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [tokens, setTokens] = useState<string[]>([]);
  const [target, setTarget] = useState<Target | null>(null);
  const [phoneFolder, setPhoneFolder] = useState<string | null>(null);
  const indexScroll = useRef(0);
  const phoneScroll = useRef(0);
  const isPhone = useMedia(PHONE_QUERY);

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
  const tree = useMemo(() => buildLibraryTree(videos, clips, tokens), [videos, clips, tokens]);

  const open = useCallback((video: Video, clip: Clip | null) => {
    setTarget({ video, loopClip: clip });
    // On the phone, back from the player lands in the video's own folder.
    setPhoneFolder(dirname(video.file));
  }, []);

  const home = useCallback(() => setTarget(null), []);

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

  if (status !== "ready") {
    return (
      <main className="cm-app">
        <div className="cm-empty">
          <div className="cm-empty__glyph">∿</div>
          <p>{status === "loading" ? "Loading the archive…" : "Couldn't reach the Clipmark server."}</p>
        </div>
      </main>
    );
  }

  const player = target && (
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

  if (isPhone) {
    if (target) {
      return (
        <main className="cm-app cm-app--phone">
          <header className="cm-phead">
            <button className="cm-back" type="button" onClick={home}>
              ‹ {folderLabel(dirname(target.video.file))}
            </button>
          </header>
          <section className="cm-main">{player}</section>
        </main>
      );
    }
    return (
      <PhoneLibrary
        tree={tree}
        tagIndex={tagIndex}
        tokens={tokens}
        onTokens={setTokens}
        folder={phoneFolder}
        onFolder={setPhoneFolder}
        scrollRef={phoneScroll}
        onOpen={open}
      />
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
        />
        {target ? (
          <section className="cm-main">{player}</section>
        ) : (
          <IndexPane tree={tree} tokens={tokens} scrollRef={indexScroll} onOpen={open} />
        )}
      </div>
    </main>
  );
}
