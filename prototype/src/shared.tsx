import { Video } from "./data";

// Fake video surface — a stylised "frame" that stands in for the real <video>.
export function FakeFrame({
  video,
  accent,
  children,
}: {
  video: Video | null;
  accent: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="fake-frame"
      style={{
        background: video
          ? `radial-gradient(120% 100% at 50% 0%, ${accent}26, #0a0a0d 72%)`
          : "#0a0a0d",
      }}
    >
      <div className="fake-frame__haze" />
      {video ? (
        <>
          <div className="fake-frame__kicker">SWING & JAZZ ARCHIVE</div>
          <div className="fake-frame__title">{video.name}</div>
          <div className="fake-frame__warm">{video.hash}</div>
        </>
      ) : (
        <div className="fake-frame__empty">Select a video to begin</div>
      )}
      {children}
    </div>
  );
}
