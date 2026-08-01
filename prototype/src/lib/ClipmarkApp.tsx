// PROTOTYPE — the shared Clipmark app, themed per variant.
// Library home (Clips/Videos tabs + tag filter) ⇄ YouTube-style player view.
// No router: view/tab/tokens live in this state machine; library scroll is
// restored on back.
import { useState } from "react";
import { ALL_VIDEOS, type Clip, type Video } from "../data";
import { LibraryView } from "./LibraryView";
import { PlayerView } from "./PlayerView";
import "./clipmark.css";

export type Theme = "paper" | "editor" | "vinyl";

export type ClipEntry = { video: Video; clip: Clip };

function seedClips(): Record<string, Clip[]> {
  const out: Record<string, Clip[]> = {};
  for (const v of ALL_VIDEOS) out[v.hash] = [...v.clips];
  return out;
}

export default function ClipmarkApp({ theme }: { theme: Theme }) {
  const [tab, setTab] = useState<"clips" | "videos">("clips");
  const [tokens, setTokens] = useState<string[]>([]);
  const [clipsByVideo, setClipsByVideo] = useState<Record<string, Clip[]>>(seedClips);
  const [target, setTarget] = useState<{ video: Video; loopClip: Clip | null } | null>(null);
  const [libScroll, setLibScroll] = useState(0);

  const openClip = (video: Video, clip: Clip, scrollTop: number) => {
    setLibScroll(scrollTop);
    setTarget({ video, loopClip: clip });
  };
  const openVideo = (video: Video, scrollTop: number) => {
    setLibScroll(scrollTop);
    setTarget({ video, loopClip: null });
  };
  const back = () => setTarget(null);

  const saveClip = (hash: string, clip: Clip) =>
    setClipsByVideo((m) => ({ ...m, [hash]: [...(m[hash] || []), clip] }));
  const removeClip = (hash: string, id: number) =>
    setClipsByVideo((m) => ({ ...m, [hash]: (m[hash] || []).filter((c) => c.id !== id) }));

  if (target) {
    return (
      <PlayerView
        key={target.video.hash}
        theme={theme}
        video={target.video}
        loopClip={target.loopClip}
        clipsByVideo={clipsByVideo}
        onSave={saveClip}
        onRemove={removeClip}
        onBack={back}
        onNavigate={(v, c) => setTarget({ video: v, loopClip: c })}
      />
    );
  }

  return (
    <LibraryView
      theme={theme}
      tab={tab}
      onTab={setTab}
      tokens={tokens}
      onTokens={setTokens}
      clipsByVideo={clipsByVideo}
      onOpenClip={openClip}
      onOpenVideo={openVideo}
      initialScrollTop={libScroll}
    />
  );
}
