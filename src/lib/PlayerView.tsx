import { useMemo, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { Clip, ClipInput, Video } from "./api";
import { videoUrl } from "./api";
import { basename, formatTime } from "./format";
import { railFor } from "./rail";
import type { VideoPlayer } from "./useVideoPlayer";
import { useVideoPlayer } from "./useVideoPlayer";

export function PlayerView({
  video,
  loopClip,
  videos,
  clips,
  onSave,
  onRemove,
  onBack,
  onNavigate,
}: {
  video: Video;
  loopClip: Clip | null;
  videos: Video[];
  clips: Clip[];
  onSave: (video: Video, input: ClipInput) => Promise<void>;
  onRemove: (clip: Clip) => Promise<void>;
  onBack: () => void;
  onNavigate: (video: Video, clip: Clip) => void;
}) {
  const player = useVideoPlayer(
    loopClip
      ? { start: loopClip.startSeconds, end: loopClip.endSeconds }
      : null,
  );
  const [mark, setMark] = useState<{ s: number | null; e: number | null }>({
    s: null,
    e: null,
  });
  const [tags, setTags] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const { own, others } = useMemo(
    () => railFor(video, videos, clips),
    [video, videos, clips],
  );
  const showRail = own.length > 0 || others.length > 0;

  const save = async () => {
    if (mark.s === null || mark.e === null) {
      setError("Mark both IN and OUT before saving.");
      return;
    }
    if (mark.e <= mark.s) {
      setError("The clip has to end after it starts.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave(video, {
        startSeconds: mark.s,
        endSeconds: mark.e,
        note: note.trim(),
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });
      setMark({ s: null, e: null });
      setTags("");
      setNote("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="cm-app">
      <header className="cm-header cm-header--player">
        <button className="cm-back" onClick={onBack}>
          ‹ Back to library
        </button>
        <div className="cm-brand">
          Clipmark<span className="cm-brand__dot">.</span>
          <small>a dance archive</small>
        </div>
      </header>

      <div className="cm-player">
        <div className="cm-player__main">
          <div className="cm-frame">
            <video
              ref={player.videoRef}
              className="cm-frame__video"
              src={videoUrl(video.file)}
              controls
              playsInline
              preload="auto"
            />
            <span className="cm-frame__time">{formatTime(player.currentTime)}</span>
          </div>

          <ScrubberTrack player={player} clips={own} />

          <div className="cm-deck">
            <div className="cm-deck__row">
              <button
                className="cm-mark"
                onClick={() => setMark({ ...mark, s: player.currentTime })}
              >
                <small>IN</small>
                {formatTime(mark.s)}
              </button>
              <span className="cm-deck__arrow">→</span>
              <button
                className="cm-mark"
                onClick={() => setMark({ ...mark, e: player.currentTime })}
              >
                <small>OUT</small>
                {formatTime(mark.e)}
              </button>
              <span className="cm-deck__live">
                live {formatTime(player.currentTime)}
              </span>
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
              <button className="cm-save" onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save clip"}
              </button>
            </div>
            {error && <div className="cm-error">{error}</div>}
          </div>
        </div>

        {showRail && (
          <aside className="cm-rail">
            <div className="cm-rail__title">{basename(video.file)}</div>
            {own.length > 0 && (
              <div className="cm-rail__group">
                <div className="cm-rail__head">This video</div>
                {own.map((c) => (
                  <RailRow
                    key={c.id}
                    clip={c}
                    video={video}
                    onLoop={() => player.startLoop(c.startSeconds, c.endSeconds)}
                    onSeekEnd={() => player.seekAndPlay(c.endSeconds)}
                    onRemove={() => onRemove(c)}
                  />
                ))}
              </div>
            )}
            {others.length > 0 && (
              <div className="cm-rail__group">
                <div className="cm-rail__head">From your library</div>
                {others.map(({ video: rv, clip: rc }) => (
                  <RailRow
                    key={`${rv.hash}-${rc.id}`}
                    clip={rc}
                    video={rv}
                    onLoop={() => onNavigate(rv, rc)}
                    onSeekEnd={() => onNavigate(rv, rc)}
                  />
                ))}
              </div>
            )}
          </aside>
        )}
      </div>
    </main>
  );
}

function RailRow({
  clip,
  video,
  onLoop,
  onSeekEnd,
  onRemove,
}: {
  clip: Clip;
  video: Video;
  onLoop: () => void;
  onSeekEnd: () => void;
  onRemove?: () => void;
}) {
  return (
    <div className="rail-row">
      <div className="rail-row__times">
        <button
          className="rail-row__time"
          onClick={onLoop}
          title="Loop this range"
        >
          {formatTime(clip.startSeconds)}
        </button>
        <span className="rail-row__sep">→</span>
        <button
          className="rail-row__time"
          onClick={onSeekEnd}
          title="Seek and play once"
        >
          {formatTime(clip.endSeconds)}
        </button>
      </div>
      <span className="rail-row__tags">
        {clip.tags.length ? clip.tags.join(" · ") : "Untitled"}
      </span>
      <span className="rail-row__file">{basename(video.file)}</span>
      {onRemove && (
        <button className="rail-row__remove" onClick={onRemove}>
          Remove
        </button>
      )}
    </div>
  );
}

function ScrubberTrack({
  player,
  clips,
}: {
  player: VideoPlayer;
  clips: Clip[];
}) {
  const duration = player.duration;
  const pct = (t: number) => (duration > 0 ? (t / duration) * 100 : 0);

  const seekFromEvent = (e: ReactMouseEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (duration <= 0) return;
    const r = el.getBoundingClientRect();
    const t = ((e.clientX - r.left) / r.width) * duration;
    player.seek(Math.max(0, Math.min(t, duration)));
  };

  if (duration <= 0) {
    return <div className="scrub-track scrub-track--empty" aria-hidden />;
  }

  return (
    <div className="scrub-track" onClick={seekFromEvent}>
      <div className="scrub-track__ticks" aria-hidden>
        {Array.from({ length: Math.floor(duration / 15) + 1 }, (_, i) => (
          <span
            key={i}
            className="scrub-track__tick"
            style={{ left: `${((i * 15) / duration) * 100}%` }}
          />
        ))}
      </div>
      {clips.map((c) => (
        <div
          key={c.id}
          className={
            "scrub-track__clip" +
            (player.isLooping(c.startSeconds, c.endSeconds) ? " is-looping" : "")
          }
          style={{
            left: `${pct(c.startSeconds)}%`,
            width: `${Math.max(0, pct(c.endSeconds) - pct(c.startSeconds))}%`,
          }}
          title={`${formatTime(c.startSeconds)} — ${formatTime(c.endSeconds)}`}
          onClick={(e) => {
            e.stopPropagation();
            player.startLoop(c.startSeconds, c.endSeconds);
          }}
        >
          <span className="scrub-track__clip-time">
            {formatTime(c.startSeconds)}
          </span>
        </div>
      ))}
      {player.loop && (
        <div
          className="scrub-track__loop"
          style={{
            left: `${pct(player.loop.start)}%`,
            width: `${Math.max(0, pct(player.loop.end) - pct(player.loop.start))}%`,
          }}
          aria-hidden
        >
          <i className="scrub-track__loop-a" />
          <i className="scrub-track__loop-b" />
        </div>
      )}
      <div
        className="scrub-track__playhead"
        style={{ left: `${pct(player.currentTime)}%` }}
        aria-hidden
      >
        <i />
      </div>
    </div>
  );
}
