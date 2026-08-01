// PROTOTYPE — fake <video> element. Advances currentTime on a timer so the
// scrubber / loop behaviour can be judged without real video files. Mirrors the
// locked loop rules: clicking a clip's start loops start->end, a manual seek
// breaks the loop, clicking a clip's end seeks and plays once.
import { useEffect, useRef, useState, useCallback } from "react";

export type Player = {
  currentTime: number;
  duration: number;
  playing: boolean;
  loop: { start: number; end: number } | null;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  seek: (t: number) => void;
  startLoop: (start: number, end: number) => void;
  clearLoop: () => void;
  isLooping: (start: number, end: number) => boolean;
};

export function useSimulatedPlayer(duration: number, resetKey?: string): Player {
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState<{ start: number; end: number } | null>(null);
  const loopRef = useRef(loop);
  loopRef.current = loop;

  useEffect(() => {
    setCurrentTime(0);
    setPlaying(false);
    setLoop(null);
  }, [resetKey]);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setCurrentTime((t) => {
        let next = t + 0.05;
        const l = loopRef.current;
        if (l && next >= l.end) next = l.start;
        if (next >= duration) {
          next = 0;
          setPlaying(false);
        }
        return next;
      });
    }, 50);
    return () => clearInterval(id);
  }, [playing, duration]);

  const seek = useCallback((t: number) => {
    setCurrentTime(Math.max(0, Math.min(t, duration)));
    setLoop(null);
  }, [duration]);

  const startLoop = useCallback((start: number, end: number) => {
    setLoop({ start, end });
    setCurrentTime(start);
    setPlaying(true);
  }, []);

  const play = useCallback(() => setPlaying(true), []);
  const pause = useCallback(() => setPlaying(false), []);
  const toggle = useCallback(() => setPlaying((p) => !p), []);
  const clearLoop = useCallback(() => setLoop(null), []);

  return {
    currentTime,
    duration,
    playing,
    loop,
    play,
    pause,
    toggle,
    seek,
    startLoop,
    clearLoop,
    isLooping: (s, e) => !!loop && loop.start === s && loop.end === e,
  };
}
