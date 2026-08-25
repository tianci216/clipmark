import type { MouseEvent as ReactMouseEvent } from "react";
import type { Clip } from "./api";
import { formatTime } from "./format";
import type { Loop } from "./useVideoPlayer";

/** Duration to lay clips out against: the Video's, else far enough to fit every clip. */
export function stripDuration(durationSeconds: number | null, clips: Clip[]): number {
  if (durationSeconds && durationSeconds > 0) return durationSeconds;
  return Math.max(1, ...clips.map((c) => c.endSeconds));
}

/** Proportional clip track — the visual of "these Clips belong to this Video". */
export function Strip({
  duration,
  clips,
  active,
  dim = false,
  onClip,
  onSeek,
  playhead,
  loop,
  className = "",
}: {
  duration: number;
  clips: Clip[];
  /** Predicate for highlighted clips (matches the filter / is looping). */
  active?: (c: Clip) => boolean;
  /** Dim the clips that are not active. */
  dim?: boolean;
  onClip?: (c: Clip) => void;
  onSeek?: (t: number) => void;
  playhead?: number;
  loop?: Loop | null;
  className?: string;
}) {
  const pct = (x: number) => `${Math.max(0, Math.min(100, (x / duration) * 100))}%`;
  const seekFromEvent = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!onSeek) return;
    const r = e.currentTarget.getBoundingClientRect();
    const t = ((e.clientX - r.left) / r.width) * duration;
    onSeek(Math.max(0, Math.min(t, duration)));
  };
  return (
    <div
      className={"cm-strip " + className + (onSeek ? " is-seekable" : "")}
      onClick={seekFromEvent}
    >
      {Array.from({ length: Math.floor(duration / 60) }, (_, i) => (
        <i key={i} className="cm-strip__min" style={{ left: pct((i + 1) * 60) }} />
      ))}
      {clips.map((c) => {
        const on = active ? active(c) : true;
        return (
          <button
            key={c.id}
            type="button"
            className={"cm-strip__clip" + (on ? " is-on" : dim ? " is-dim" : "")}
            style={{ left: pct(c.startSeconds), width: pct(c.endSeconds - c.startSeconds) }}
            title={`${formatTime(c.startSeconds)} → ${formatTime(c.endSeconds)}${
              c.tags.length ? " · " + c.tags.join(", ") : ""
            }`}
            onClick={(e) => {
              e.stopPropagation();
              onClip?.(c);
            }}
          />
        );
      })}
      {loop && (
        <span
          className="cm-strip__loop"
          style={{ left: pct(loop.start), width: pct(loop.end - loop.start) }}
          aria-hidden
        />
      )}
      {playhead != null && (
        <span className="cm-strip__head" style={{ left: pct(playhead) }} aria-hidden />
      )}
    </div>
  );
}
