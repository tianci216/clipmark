import { useEffect, useRef, useState } from "react";

export interface Loop {
  start: number;
  end: number;
}

export interface VideoPlayer {
  videoRef: React.RefObject<HTMLVideoElement>;
  currentTime: number;
  duration: number;
  loop: Loop | null;
  seek: (t: number) => void;
  seekAndPlay: (t: number) => void;
  startLoop: (start: number, end: number) => void;
  isLooping: (start: number, end: number) => boolean;
}

export function useVideoPlayer(initialLoop: Loop | null): VideoPlayer {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loop, setLoop] = useState<Loop | null>(null);

  const loopRef = useRef(loop);
  loopRef.current = loop;
  const readyRef = useRef(false);
  const initialLoopRef = useRef<Loop | null>(initialLoop);
  const ignoreSeekRef = useRef(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      const l = loopRef.current;
      if (l && video.currentTime >= l.end) {
        ignoreSeekRef.current = true;
        video.currentTime = l.start;
      }
    };
    const onSeeking = () => {
      if (ignoreSeekRef.current) {
        ignoreSeekRef.current = false;
        return;
      }
      setLoop(null);
    };
    const onEnded = () => {
      const l = loopRef.current;
      if (l) {
        ignoreSeekRef.current = true;
        video.currentTime = l.start;
        video.play();
      }
    };
    const onLoadedMetadata = () => {
      const d = video.duration || 0;
      setDuration(d);
      readyRef.current = true;
      const il = initialLoopRef.current;
      if (il && d > 0) {
        initialLoopRef.current = null;
        setLoop(il);
        ignoreSeekRef.current = true;
        video.currentTime = il.start;
        video.play();
      }
    };
    const onDurationChange = () => setDuration(video.duration || 0);

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("seeking", onSeeking);
    video.addEventListener("ended", onEnded);
    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("durationchange", onDurationChange);
    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("seeking", onSeeking);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("durationchange", onDurationChange);
    };
  }, []);

  const seek = (t: number) => {
    const video = videoRef.current;
    if (!video) return;
    const clamped = duration > 0 ? Math.max(0, Math.min(t, duration)) : Math.max(0, t);
    video.currentTime = clamped;
  };

  const seekAndPlay = (t: number) => {
    const video = videoRef.current;
    if (!video) return;
    setLoop(null);
    ignoreSeekRef.current = true;
    video.currentTime = t;
    video.play();
  };

  const startLoop = (start: number, end: number) => {
    const video = videoRef.current;
    if (!video || !readyRef.current) return;
    setLoop({ start, end });
    ignoreSeekRef.current = true;
    video.currentTime = start;
    video.play();
  };

  const isLooping = (start: number, end: number) =>
    !!loop && loop.start === start && loop.end === end;

  return {
    videoRef,
    currentTime,
    duration,
    loop,
    seek,
    seekAndPlay,
    startLoop,
    isLooping,
  };
}
