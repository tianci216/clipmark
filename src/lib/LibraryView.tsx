import { useEffect, useMemo, useRef } from "react";
import type { Clip, Video } from "./api";
import { ClipCard, VideoCard } from "./Cards";
import { TagFilter } from "./TagFilter";
import type { TagEntry } from "./tags";
import { matchesTokens } from "./tags";

export type Tab = "clips" | "videos";

export function LibraryView({
  tab,
  onTab,
  tokens,
  onTokens,
  tagIndex,
  videos,
  clips,
  initialScrollTop,
  onOpenClip,
  onOpenVideo,
}: {
  tab: Tab;
  onTab: (t: Tab) => void;
  tokens: string[];
  onTokens: (t: string[]) => void;
  tagIndex: TagEntry[];
  videos: Video[];
  clips: Clip[];
  initialScrollTop: number;
  onOpenClip: (video: Video, clip: Clip, scrollTop: number) => void;
  onOpenVideo: (video: Video, scrollTop: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = initialScrollTop;
  }, [initialScrollTop]);
  const videosByHash = useMemo(
    () => new Map(videos.map((v) => [v.hash, v])),
    [videos],
  );

  const clipEntries = useMemo(
    () =>
      clips.map((clip) => ({
        video:
          videosByHash.get(clip.videoHash) ??
          ({
            hash: clip.videoHash,
            file: clip.file,
            fileMtime: null,
            durationSeconds: null,
            thumbnail: null,
            clipCount: 0,
            firstClipStart: null,
          } satisfies Video),
        clip,
      })),
    [clips, videosByHash],
  );

  const filteredClips = useMemo(
    () => clipEntries.filter(({ clip }) => matchesTokens(tokens, clip.tags)),
    [clipEntries, tokens],
  );

  const filteredVideos = useMemo(
    () =>
      videos.filter((v) =>
        tokens.length === 0
          ? true
          : clips.some(
              (c) => c.videoHash === v.hash && matchesTokens(tokens, c.tags),
            ),
      ),
    [videos, clips, tokens],
  );

  const hasFilter = tokens.length > 0;

  return (
    <main className="cm-app">
      <header className="cm-header">
        <div className="cm-brand">
          Clipmark<span className="cm-brand__dot">.</span>
          <small>a dance archive</small>
        </div>
        <TagFilter index={tagIndex} tokens={tokens} onTokens={onTokens} />
      </header>

      <div className="cm-lib" ref={scrollRef}>
        <nav className="cm-tabs">
          <button
            className={"cm-tab" + (tab === "clips" ? " is-active" : "")}
            onClick={() => onTab("clips")}
          >
            Clips <span className="cm-tab__n">{filteredClips.length}</span>
          </button>
          <button
            className={"cm-tab" + (tab === "videos" ? " is-active" : "")}
            onClick={() => onTab("videos")}
          >
            Videos <span className="cm-tab__n">{filteredVideos.length}</span>
          </button>
          {hasFilter && (
            <button className="cm-tabs__clear" onClick={() => onTokens([])}>
              Clear filters
            </button>
          )}
        </nav>

        {tab === "clips" ? (
          filteredClips.length === 0 ? (
            <EmptyState what="clips" hasFilter={hasFilter} onClear={() => onTokens([])} />
          ) : (
            <div className="cm-grid">
              {filteredClips.map(({ video, clip }) => (
                <ClipCard
                  key={`${video.hash}-${clip.id}`}
                  video={video}
                  clip={clip}
                  onOpen={() =>
                    onOpenClip(video, clip, scrollRef.current?.scrollTop ?? 0)
                  }
                />
              ))}
            </div>
          )
        ) : filteredVideos.length === 0 ? (
          <EmptyState what="videos" hasFilter={hasFilter} onClear={() => onTokens([])} />
        ) : (
          <div className="cm-grid cm-grid--videos">
            {filteredVideos.map((v) => (
              <VideoCard
                key={v.file}
                video={v}
                onOpen={() =>
                  onOpenVideo(v, scrollRef.current?.scrollTop ?? 0)
                }
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function EmptyState({
  what,
  hasFilter,
  onClear,
}: {
  what: string;
  hasFilter: boolean;
  onClear: () => void;
}) {
  return (
    <div className="cm-empty">
      <div className="cm-empty__glyph">∿</div>
      <p>{hasFilter ? `No ${what} match these tags.` : `No ${what} in the archive yet.`}</p>
      {hasFilter && (
        <>
          <p className="cm-empty__sub">Try fewer tags, or check the other tab.</p>
          <button className="cm-empty__btn" onClick={onClear}>
            Clear filters
          </button>
        </>
      )}
    </div>
  );
}
