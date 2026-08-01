// PROTOTYPE — library grid cards. Clip card: frame + time-range badge, title =
// tags, subtitle = video name, note when present. Video card: frame + clip-count
// badge, title = name, subtitle = n clips · first at MM:SS.
import { formatTime, type Clip, type Video } from "../data";

function hue(hash: string): number {
  let n = 0;
  for (const ch of hash) n += ch.charCodeAt(0);
  return n % 360;
}

export function Thumb({
  video,
  badge,
}: {
  video: Video;
  badge?: React.ReactNode;
}) {
  const h = hue(video.hash);
  return (
    <div
      className="thumb"
      style={{
        background: `linear-gradient(140deg, hsl(${h} 38% 24%), hsl(${(h + 45) % 360} 52% 12%))`,
      }}
    >
      <span className="thumb__grain" />
      <span className="thumb__initials">{video.name.replace(/[^A-Za-z0-9]/g, "").slice(0, 2)}</span>
      {badge}
    </div>
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
            {formatTime(clip.start)} → {formatTime(clip.end)}
          </span>
        }
      />
      <span className="clip-card__title">{clip.tags.join(" · ")}</span>
      <span className="clip-card__sub">{video.name}</span>
      {clip.note && <span className="clip-card__note">{clip.note}</span>}
    </button>
  );
}

export function VideoCard({
  video,
  clipCount,
  onOpen,
}: {
  video: Video;
  clipCount: number;
  onOpen: () => void;
}) {
  const first = video.clips.length ? formatTime(video.clips[0].start) : "—";
  return (
    <button className="clip-card" onClick={onOpen}>
      <Thumb
        video={video}
        badge={
          <span className="clip-card__range clip-card__range--count">
            {clipCount} {clipCount === 1 ? "clip" : "clips"}
          </span>
        }
      />
      <span className="clip-card__title">{video.name}</span>
      <span className="clip-card__sub">
        {clipCount} {clipCount === 1 ? "clip" : "clips"} · first at {first}
      </span>
    </button>
  );
}
