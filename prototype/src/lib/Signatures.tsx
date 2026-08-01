// PROTOTYPE — per-theme player signatures.
// - ScrubberTrack: the clip-on-timeline visualization (paper + editor both use
//   it). Editor wraps it in a transport bar; paper renders it bare and quiet.
// - Turntable: the vinyl theme's spinning record + tonearm that drops on loop.
import { useRef } from "react";
import { formatTime, type Clip } from "../data";
import type { Player } from "../useSimulatedPlayer";

export function ScrubberTrack({
  player,
  clips,
}: {
  player: Player;
  clips: Clip[];
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const pct = (t: number) => (t / player.duration) * 100;

  const seekFromEvent = (e: React.MouseEvent) => {
    const el = trackRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const t = ((e.clientX - r.left) / r.width) * player.duration;
    player.seek(Math.max(0, Math.min(t, player.duration)));
  };

  return (
    <div className="scrub-track" ref={trackRef} onClick={seekFromEvent}>
      <div className="scrub-track__ticks">
        {Array.from({ length: Math.floor(player.duration / 15) + 1 }, (_, i) => (
          <span key={i} className="scrub-track__tick" style={{ left: `${((i * 15) / player.duration) * 100}%` }} />
        ))}
      </div>
      {clips.map((c) => (
        <div
          key={c.id}
          className={"scrub-track__clip" + (player.isLooping(c.start, c.end) ? " is-looping" : "")}
          style={{ left: `${pct(c.start)}%`, width: `${pct(c.end) - pct(c.start)}%` }}
          title={`${formatTime(c.start)} — ${formatTime(c.end)}`}
          onClick={(e) => {
            e.stopPropagation();
            player.startLoop(c.start, c.end);
          }}
        >
          <span className="scrub-track__clip-time">{formatTime(c.start)}</span>
        </div>
      ))}
      {player.loop && (
        <div
          className="scrub-track__loop"
          style={{
            left: `${pct(player.loop.start)}%`,
            width: `${pct(player.loop.end) - pct(player.loop.start)}%`,
          }}
        >
          <i className="scrub-track__loop-a" />
          <i className="scrub-track__loop-b" />
        </div>
      )}
      <div className="scrub-track__playhead" style={{ left: `${pct(player.currentTime)}%` }}>
        <i />
      </div>
    </div>
  );
}

export function TransportScrubber({
  player,
  clips,
}: {
  player: Player;
  clips: Clip[];
}) {
  return (
    <div className="scrub">
      <div className="scrub__transport">
        <button className="scrub__btn" onClick={player.toggle}>
          {player.playing ? "❚❚" : "▶"}
        </button>
        <button className="scrub__btn" onClick={() => player.seek(player.currentTime - 5)}>
          −5s
        </button>
        <button className="scrub__btn" onClick={() => player.seek(player.currentTime + 5)}>
          +5s
        </button>
        <span className="scrub__clock">
          {formatTime(player.currentTime)} <i>/</i> {formatTime(player.duration)}
        </span>
        {player.loop && (
          <span className="scrub__loopchip">
            LOOP {formatTime(player.loop.start)}–{formatTime(player.loop.end)}
            <button onClick={player.clearLoop} aria-label="Clear loop">
              ✕
            </button>
          </span>
        )}
      </div>
      <ScrubberTrack player={player} clips={clips} />
    </div>
  );
}

export function Turntable({ player }: { player: Player }) {
  const spinning = player.playing || !!player.loop;
  return (
    <div className="turntable">
      <button className="turntable__play" onClick={player.toggle} aria-label={spinning ? "Pause" : "Play"}>
        {spinning ? "❚❚" : "▶"}
      </button>
      <div className={"turntable__vinyl" + (spinning ? " is-spinning" : "")}>
        <span className="turntable__grooves" />
        <span className="turntable__label">
          CLIPMARK <i>·</i> 45
        </span>
      </div>
      <span className={"turntable__arm" + (player.loop ? " is-down" : "")} aria-hidden>
        <i className="turntable__pivot" />
      </span>
      <span className="turntable__clock">{formatTime(player.currentTime)}</span>
    </div>
  );
}
