import { useEffect, useRef, useState, type PointerEvent } from "react";
import { formatClock } from "./musicApi";
import type { AudioPlayer } from "./useAudioPlayer";

interface Progress {
  played: number;
  buffered: number;
  time: number;
  duration: number;
}

const EMPTY: Progress = { played: 0, buffered: 0, time: 0, duration: 0 };

/** End of the buffered range holding the playhead (else the furthest one), as a fraction. */
function bufferedFraction(audio: HTMLAudioElement): number {
  const d = audio.duration;
  if (!d || !Number.isFinite(d) || audio.buffered.length === 0) return 0;
  let end = 0;
  for (let i = 0; i < audio.buffered.length; i++) {
    const s = audio.buffered.start(i);
    const e = audio.buffered.end(i);
    if (audio.currentTime >= s && audio.currentTime <= e) {
      end = e;
      break;
    }
    end = Math.max(end, e);
  }
  return Math.min(1, Math.max(0, end / d));
}

function readProgress(audio: HTMLAudioElement): Progress {
  const d = audio.duration;
  if (!d || !Number.isFinite(d)) return { ...EMPTY, time: audio.currentTime || 0 };
  return {
    played: audio.currentTime / d,
    buffered: bufferedFraction(audio),
    time: audio.currentTime,
    duration: d,
  };
}

/**
 * The now-playing bar: buffered + played progress (click or drag to seek), the
 * track's title and artist, previous / play-pause / next, and the clock.
 */
export function MusicPlayer({ player }: { player: AudioPlayer }) {
  const { audio, display, paused, loadingId } = player;
  const [progress, setProgress] = useState<Progress>(EMPTY);
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => setProgress(readProgress(audio));
    const reset = () => setProgress(EMPTY);
    const events = ["timeupdate", "progress", "loadedmetadata", "durationchange", "seeked", "playing"];
    events.forEach((e) => audio.addEventListener(e, update));
    audio.addEventListener("emptied", reset);
    update();
    return () => {
      events.forEach((e) => audio.removeEventListener(e, update));
      audio.removeEventListener("emptied", reset);
    };
  }, [audio]);

  const seek = (e: PointerEvent<HTMLDivElement>) => {
    if (!audio.duration || !bar.current) return;
    const rect = bar.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = pct * audio.duration;
  };

  const loading = loadingId !== null;
  return (
    <div className="mx-player">
      <div
        className="mx-player__bar"
        ref={bar}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          seek(e);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) seek(e);
        }}
      >
        <div className="mx-player__buffered" style={{ width: `${progress.buffered * 100}%` }} />
        <div className="mx-player__played" style={{ width: `${progress.played * 100}%` }} />
      </div>
      <div className="mx-player__body">
        <div className="mx-player__now">
          {display ? (
            <>
              <div className="mx-player__title">{display.title}</div>
              <div className="mx-player__artist">{display.artist}</div>
            </>
          ) : (
            <div className="mx-player__placeholder">Select a track to play</div>
          )}
        </div>
        <div className="mx-player__controls">
          <button className="mx-btn" type="button" title="Previous" onClick={() => player.step(-1)}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
            </svg>
          </button>
          <button
            className={"mx-btn mx-btn--play" + (loading ? " is-loading" : "")}
            type="button"
            title="Play/Pause"
            onClick={player.toggle}
          >
            {loading ? (
              <span className="mx-spinner" aria-label="Loading" />
            ) : paused ? (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            )}
          </button>
          <button className="mx-btn" type="button" title="Next" onClick={() => player.step(1)}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
            </svg>
          </button>
        </div>
        <div className="mx-player__time cm-mono">
          {formatClock(progress.time)}
          {progress.duration > 0 && <span> / {formatClock(progress.duration)}</span>}
        </div>
      </div>
    </div>
  );
}
