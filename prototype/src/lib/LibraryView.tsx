import { useEffect, useMemo, useRef } from "react";
import { ALL_VIDEOS, matchesTokens, type Clip, type Video } from "../data";
import type { ClipEntry, Theme } from "./ClipmarkApp";
import { TagFilter } from "./TagFilter";
import { ClipCard, VideoCard } from "./Cards";

export function LibraryView({
  theme,
  tab,
  onTab,
  tokens,
  onTokens,
  clipsByVideo,
  onOpenClip,
  onOpenVideo,
  initialScrollTop,
}: {
  theme: Theme;
  tab: "clips" | "videos";
  onTab: (t: "clips" | "videos") => void;
  tokens: string[];
  onTokens: (t: string[]) => void;
  clipsByVideo: Record<string, Clip[]>;
  onOpenClip: (video: Video, clip: Clip, scrollTop: number) => void;
  onOpenVideo: (video: Video, scrollTop: number) => void;
  initialScrollTop: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = initialScrollTop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allClips: ClipEntry[] = useMemo(
    () => ALL_VIDEOS.flatMap((v) => (clipsByVideo[v.hash] || []).map((clip) => ({ video: v, clip }))),
    [clipsByVideo]
  );

  const filteredClips = useMemo(
    () => allClips.filter(({ clip }) => matchesTokens(tokens, clip.tags)),
    [allClips, tokens]
  );

  const filteredVideos = useMemo(
    () =>
      ALL_VIDEOS.filter((v) =>
        tokens.length === 0
          ? true
          : (clipsByVideo[v.hash] || []).some((c) => matchesTokens(tokens, c.tags))
      ),
    [tokens, clipsByVideo]
  );

  const hasFilter = tokens.length > 0;

  return (
    <div className={`cm-app cm-app--${theme}`}>
      <header className="cm-header">
        <div className="cm-brand">
          Clipmark<span className="cm-brand__dot">.</span>
          <small>a dance archive</small>
        </div>
        <TagFilter tokens={tokens} onTokens={onTokens} />
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
            <EmptyState
              what="clips"
              hasFilter={hasFilter}
              onClear={() => onTokens([])}
            />
          ) : (
            <div className="cm-grid">
              {filteredClips.map(({ video, clip }) => (
                <ClipCard
                  key={`${video.hash}-${clip.id}`}
                  video={video}
                  clip={clip}
                  onOpen={() => onOpenClip(video, clip, scrollRef.current?.scrollTop ?? 0)}
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
                key={v.hash}
                video={v}
                clipCount={(clipsByVideo[v.hash] || []).length}
                onOpen={() => onOpenVideo(v, scrollRef.current?.scrollTop ?? 0)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
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
