import type { Video } from "./api";

/** A Video's thumbnail, or a placeholder naming why there is none. */
export function Still({
  video,
  orphan = false,
  className = "",
}: {
  video: Video;
  orphan?: boolean;
  className?: string;
}) {
  return (
    <span className={"cm-still " + className}>
      {video.thumbnail ? (
        <img className="cm-still__img" src={video.thumbnail} alt="" loading="lazy" />
      ) : (
        <span className="cm-still__missing">
          <span>∿</span>
          {orphan ? "file missing" : "no thumbnail"}
        </span>
      )}
    </span>
  );
}
