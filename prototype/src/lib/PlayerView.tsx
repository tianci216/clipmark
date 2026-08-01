// PROTOTYPE — the YouTube-style watch page. Left: player + theme signature
// (transport/scrubber or turntable) + mark deck. Right: related rail — this
// video's clips first, then clips from other videos sharing a tag, ranked by
// shared-tag count then start time. Rail hidden when nothing shares a tag.
import { useEffect, useMemo, useState } from "react";
import { ALL_VIDEOS, formatTime, type Clip, type Video } from "../data";
import { useSimulatedPlayer } from "../useSimulatedPlayer";
import { FakeFrame } from "../shared";
import { TransportScrubber, Turntable, ScrubberTrack } from "./Signatures";
import type { Theme } from "./ClipmarkApp";

type RailEntry = { video: Video; clip: Clip; shared: number };

function railFor(
  video: Video,
  clipsByVideo: Record<string, Clip[]>
): { own: Clip[]; others: RailEntry[] } {
  const own = (clipsByVideo[video.hash] || []).slice().sort((a, b) => a.start - b.start);
  const ownTags = new Set(own.flatMap((c) => c.tags).map((t) => t.toLowerCase()));
  const others: RailEntry[] = [];
  for (const v of ALL_VIDEOS) {
    if (v.hash === video.hash) continue;
    for (const c of clipsByVideo[v.hash] || []) {
      const shared = c.tags.filter((t) => ownTags.has(t.toLowerCase())).length;
      if (shared > 0) others.push({ video: v, clip: c, shared });
    }
  }
  others.sort((a, b) => b.shared - a.shared || a.clip.start - b.clip.start);
  return { own, others };
}

export function PlayerView({
  theme,
  video,
  loopClip,
  clipsByVideo,
  onSave,
  onRemove,
  onBack,
  onNavigate,
}: {
  theme: Theme;
  video: Video;
  loopClip: Clip | null;
  clipsByVideo: Record<string, Clip[]>;
  onSave: (hash: string, clip: Clip) => void;
  onRemove: (hash: string, id: number) => void;
  onBack: () => void;
  onNavigate: (video: Video, clip: Clip) => void;
}) {
  const player = useSimulatedPlayer(video.duration, video.hash);
  const [mark, setMark] = useState<{ s: number | null; e: number | null }>({ s: null, e: null });
  const [tags, setTags] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const { own, others } = useMemo(() => railFor(video, clipsByVideo), [video, clipsByVideo]);

  useEffect(() => {
    if (loopClip) player.startLoop(loopClip.start, loopClip.end);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = () => {
    if (mark.s === null || mark.e === null) {
      setError("Mark both IN and OUT before saving.");
      return;
    }
    if (mark.e <= mark.s) {
      setError("The clip has to end after it starts.");
      return;
    }
    onSave(video.hash, {
      id: Date.now(),
      start: mark.s,
      end: mark.e,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      note: note.trim(),
    });
    setMark({ s: null, e: null });
    setTags("");
    setNote("");
    setError("");
  };

  return (
    <div className={`cm-app cm-app--${theme}`}>
      <header className="cm-header cm-header--player">
        <button className="cm-back" onClick={onBack}>
          ‹ Back to library
        </button>
        <div className="cm-brand">
          Clipmark<span className="cm-brand__dot">.</span>
        </div>
      </header>

      <div className="cm-player">
        <div className="cm-player__main">
          <FakeFrame video={video} accent={theme === "paper" ? "#a6451f" : theme === "editor" ? "#45c8e8" : "#d9a441"}>
            <div className="cm-frame__time">{formatTime(player.currentTime)}</div>
          </FakeFrame>

          {theme === "editor" && <TransportScrubber player={player} clips={own} />}
          {theme === "vinyl" && <Turntable player={player} />}
          {theme === "paper" && <ScrubberTrack player={player} clips={own} />}

          <div className="cm-deck">
            <div className="cm-deck__row">
              <button className="cm-mark" onClick={() => setMark({ ...mark, s: player.currentTime })}>
                <small>IN</small>
                {formatTime(mark.s ?? -1)}
              </button>
              <span className="cm-deck__arrow">→</span>
              <button className="cm-mark" onClick={() => setMark({ ...mark, e: player.currentTime })}>
                <small>OUT</small>
                {formatTime(mark.e ?? -1)}
              </button>
              <span className="cm-deck__live">live {formatTime(player.currentTime)}</span>
            </div>
            <div className="cm-deck__row">
              <input
                className="cm-field"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="Tags, comma separated"
              />
              <input
                className="cm-field"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Note"
              />
              <button className="cm-save" onClick={save}>
                Save clip
              </button>
            </div>
            {error && <div className="cm-error">{error}</div>}
          </div>
        </div>

        <aside className="cm-rail">
          <div className="cm-rail__title">{video.name}</div>
          {own.length > 0 && (
            <div className="cm-rail__group">
              <div className="cm-rail__head">This video</div>
              {own.map((c) => (
                <RailRow
                  key={c.id}
                  clip={c}
                  video={video}
                  onLoop={() => player.startLoop(c.start, c.end)}
                  onRemove={c.id === loopClip?.id ? undefined : () => onRemove(video.hash, c.id)}
                />
              ))}
            </div>
          )}
          {others.length > 0 && (
            <div className="cm-rail__group">
              <div className="cm-rail__head">From your library</div>
              {others.map(({ video: rv, clip: rc }) => (
                <RailRow key={`${rv.hash}-${rc.id}`} clip={rc} video={rv} onLoop={() => onNavigate(rv, rc)} />
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function RailRow({
  clip,
  video,
  onLoop,
  onRemove,
}: {
  clip: Clip;
  video: Video;
  onLoop: () => void;
  onRemove?: () => void;
}) {
  return (
    <div className="rail-row">
      <button className="rail-row__time" onClick={onLoop}>
        {formatTime(clip.start)} → {formatTime(clip.end)}
      </button>
      <span className="rail-row__tags">{clip.tags.join(" · ")}</span>
      <span className="rail-row__file">{video.name}</span>
      {onRemove && (
        <button className="rail-row__remove" onClick={onRemove}>
          Remove
        </button>
      )}
    </div>
  );
}
