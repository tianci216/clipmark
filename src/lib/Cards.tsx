import type { ReactNode } from "react";
import type { Clip, Video } from "./api";
import { basename, formatTime } from "./format";

export function Thumb({
  video,
  badge,
  duration,
}: {
  video: Video;
  badge?: ReactNode;
  duration?: string;
}) {
  return (
    <span className="thumb">
      {video.thumbnail ? (
        <img className="thumb__img" src={video.thumbnail} alt="" loading="lazy" />
      ) : (
        <span className="thumb__blank">
          <span className="thumb__glyph">∿</span>
          {basename(video.file).replace(/[^A-Za-z0-9]/g, "").slice(0, 2)}
        </span>
      )}
      {duration != null && <span className="thumb__duration">{duration}</span>}
      {badge}
    </span>
  );
}

export function ClipCard({
  video,
  clip,
  onOpen,
}: {
  video: Video;
  clip: Clip;
  onOpen: () => void;
}) {
  return (
    <button className="clip-card" onClick={onOpen}>
      <Thumb
        video={video}
        badge={
          <span className="clip-card__range">
            {formatTime(clip.startSeconds)} → {formatTime(clip.endSeconds)}
          </span>
        }
      />
      <span className="clip-card__title">
        {clip.tags.length ? clip.tags.join(" · ") : "Untitled"}
      </span>
      <span className="clip-card__sub">{basename(video.file)}</span>
      {clip.note && <span className="clip-card__note">{clip.note}</span>}
    </button>
  );
}

export function VideoCard({
  video,
  onOpen,
}: {
  video: Video;
  onOpen: () => void;
}) {
  const count = video.clipCount;
  return (
    <button className="clip-card" onClick={onOpen}>
      <Thumb
        video={video}
        duration={formatTime(video.durationSeconds)}
        badge={
          <span className="clip-card__range">
            {count} {count === 1 ? "clip" : "clips"}
          </span>
        }
      />
      <span className="clip-card__title">{basename(video.file)}</span>
      <span className="clip-card__sub">
        {count === 0
          ? "no clips yet"
          : `${count} ${count === 1 ? "clip" : "clips"} · first at ${formatTime(video.firstClipStart)}`}
      </span>
    </button>
  );
}
