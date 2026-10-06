import { useEffect, useRef, useState, type MutableRefObject } from "react";
import type { Clip, Video } from "./api";
import type { DownloadControls } from "./downloadControls";
import { cardMeta, type DownloadCard, type Feed, type SearchPill, type VideoCard } from "./feed";
import { clipLabel, displayName, folderLabel, formatTime } from "./format";
import { stripDuration } from "./Strip";

/** A running Download with no progress for this long is probably waiting on the Mac's Keychain prompt. */
const STALLED_AFTER_MS = 10_000;
/** A failed card shows only the tail of yt-dlp's output. */
const ERROR_LINES = 4;

/**
 * The library page below the top bar: a responsive grid of cards, Downloads first, then
 * Videos newest file first. One column on the phone.
 */
export function FeedPane({
  feed,
  pills,
  downloads,
  scrollRef,
  onOpen,
}: {
  feed: Feed;
  pills: SearchPill[];
  downloads: DownloadControls;
  /** Stores the feed's scroll position so it survives a trip to the watch page. */
  scrollRef: MutableRefObject<number>;
  onOpen: (video: Video, clip: Clip | null) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (el.current) el.current.scrollTop = scrollRef.current;
  }, [scrollRef]);
  // Capture the position at the moment of leaving; a scroll event may not have fired yet.
  const openFrom = (video: Video, clip: Clip | null) => {
    scrollRef.current = el.current?.scrollTop ?? 0;
    onOpen(video, clip);
  };

  return (
    <div
      className="cm-feed__scroll"
      ref={el}
      onScroll={(e) => {
        scrollRef.current = e.currentTarget.scrollTop;
      }}
    >
      {feed.empty ? (
        <div className="cm-feed__empty">
          {feed.empty === "filter"
            ? `No clips match ${pills.map((p) => p.text).join(" + ")}.`
            : "No videos in the library yet. Download one, or add files to the Library Folder."}
        </div>
      ) : (
        <div className="cm-grid">
          {feed.cards.map((card) =>
            card.kind === "download" ? (
              <DownloadCardView key={`dl-${card.download.id}`} card={card} onRemove={downloads.onRemove} />
            ) : (
              <VideoCardView
                key={card.video.file}
                card={card}
                filtering={feed.filtering}
                onOpen={openFrom}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}

function VideoCardView({
  card,
  filtering,
  onOpen,
}: {
  card: VideoCard;
  filtering: boolean;
  onOpen: (video: Video, clip: Clip | null) => void;
}) {
  const { video, clips, missing } = card;
  const d = stripDuration(video.durationSeconds, clips);
  const pct = (x: number) => `${Math.max(0, Math.min(100, (x / d) * 100))}%`;
  const name = displayName(video);
  const meta = cardMeta(video);
  // While filtering, the thumbnail lands on the first matching Clip, looping.
  const firstMatch = filtering ? (card.firstMatches[0] ?? null) : null;
  return (
    <article className={"cm-card" + (missing ? " is-missing" : "")}>
      <button
        type="button"
        className="cm-card__thumb"
        title={name}
        aria-label={firstMatch ? `${name}, loop the first matching clip` : name}
        onClick={() => onOpen(video, firstMatch)}
      >
        {video.thumbnail ? (
          <img src={video.thumbnail} alt="" loading="lazy" />
        ) : (
          <span className="cm-card__nothumb" aria-hidden="true">
            ∿
          </span>
        )}
        {missing && <span className="cm-card__badge">file missing</span>}
        {video.durationSeconds != null && (
          <span className="cm-card__dur">{formatTime(video.durationSeconds)}</span>
        )}
        <span className="cm-card__strip" aria-hidden="true">
          {clips.map((c) => (
            <i
              key={c.id}
              className={filtering && !card.matchIds.has(c.id) ? "is-dim" : ""}
              style={{ left: pct(c.startSeconds), width: pct(c.endSeconds - c.startSeconds) }}
            />
          ))}
        </span>
      </button>
      <div className="cm-card__body">
        <button type="button" className="cm-card__title" onClick={() => onOpen(video, null)}>
          {name}
        </button>
        <div className="cm-card__meta">{meta.place}</div>
        <div className="cm-card__meta">
          {filtering ? (
            <>
              <b>
                {card.matching} of {card.total}
              </b>{" "}
              clip{card.total === 1 ? "" : "s"} match
            </>
          ) : (
            `${card.total} clip${card.total === 1 ? "" : "s"}`
          )}
          {meta.origin && ` · ${meta.origin}`}
        </div>
        {filtering && (
          <ul className="cm-card__matches">
            {card.firstMatches.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => onOpen(video, c)}>
                  <span className="cm-mono">{formatTime(c.startSeconds)}</span>
                  <span>{clipLabel(c)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

const STATE_LABEL: Record<DownloadCard["state"], string> = {
  queued: "Queued",
  downloading: "Downloading",
  failed: "Failed",
  scanning: "Scanning…",
  cancelling: "Cancelling…",
};

/** A Download at the start of the grid, where its Video's card will appear. */
function DownloadCardView({
  card,
  onRemove,
}: {
  card: DownloadCard;
  onRemove: DownloadControls["onRemove"];
}) {
  const job = card.download;
  const downloading = card.state === "downloading";
  const now = useNow(downloading && job.progress === 0);
  const stalled =
    downloading && job.progress === 0 && job.startedAt !== null && now - job.startedAt > STALLED_AFTER_MS;
  const name = job.title ?? job.url.replace(/^https?:\/\//, "");
  const pct = Math.floor(job.progress);
  const errorTail = job.error ? job.error.trimEnd().split("\n").slice(-ERROR_LINES).join("\n") : null;

  return (
    <article className={`cm-card cm-card--dl is-${card.state}`}>
      <div className="cm-card__thumb">
        <span className="cm-card__state">
          {STATE_LABEL[card.state]}
          {downloading ? ` · ${pct}%` : ""}
        </span>
        {(card.state === "queued" || downloading) && (
          <div className="cm-dl__bar">
            <div
              className="cm-dl__fill"
              style={{ width: downloading ? `${Math.max(1, Math.min(100, job.progress))}%` : "0%" }}
            />
          </div>
        )}
        {card.cancellable && (
          <button
            type="button"
            className="cm-card__x"
            title="Cancel this download"
            aria-label="Cancel download"
            onClick={() => onRemove(job)}
          >
            ✕
          </button>
        )}
      </div>
      <div className="cm-card__body">
        <div className="cm-card__title" title={job.url}>
          {name}
        </div>
        <div className="cm-card__meta">
          {folderLabel(job.folder)}
          {card.cancellable ? " · in the queue" : ""}
        </div>
        {stalled && (
          <div className="cm-dl__hint">
            No progress yet — it may be waiting on a Keychain prompt on the Mac (Chrome cookies).
          </div>
        )}
        {card.state === "failed" && (
          <>
            {errorTail && <pre className="cm-dl__err">{errorTail}</pre>}
            <button type="button" className="cm-actions__btn cm-card__dismiss" onClick={() => onRemove(job)}>
              Dismiss
            </button>
          </>
        )}
      </div>
    </article>
  );
}
