import { useEffect, useRef, type MutableRefObject } from "react";
import type { Clip, Video } from "./api";
import { Actions } from "./Actions";
import { folderLabel, formatTime, title } from "./format";
import { Footnote } from "./IndexPane";
import type { LibraryTree } from "./libraryTree";
import { Still } from "./Still";
import { TagFilter } from "./TagFilter";
import type { TagEntry } from "./tags";

/** Phone drill-down: the folder list, or one folder's Videos with their Clips beneath. */
export function PhoneLibrary({
  tree,
  tagIndex,
  tokens,
  onTokens,
  folder,
  onFolder,
  scrollRef,
  onOpen,
  onSettings,
}: {
  tree: LibraryTree;
  tagIndex: TagEntry[];
  tokens: string[];
  onTokens: (t: string[]) => void;
  /** Folder currently drilled into; null shows the folder list. */
  folder: string | null;
  onFolder: (path: string | null) => void;
  /** Scroll position of the current screen, restored when coming back from the player. */
  scrollRef: MutableRefObject<number>;
  onOpen: (video: Video, clip: Clip | null) => void;
  onSettings: () => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (el.current) el.current.scrollTop = scrollRef.current;
  }, [scrollRef, folder]);

  const current = folder === null ? null : tree.folders.find((f) => f.path === folder);
  // Capture the position at the moment of leaving; a scroll event may not have fired yet.
  const openFrom = (video: Video, clip: Clip | null) => {
    scrollRef.current = el.current?.scrollTop ?? 0;
    onOpen(video, clip);
  };

  return (
    <main className="cm-app cm-app--phone">
      <header className="cm-phead">
        {folder !== null ? (
          <button
            className="cm-back"
            type="button"
            onClick={() => {
              scrollRef.current = 0;
              onFolder(null);
            }}
          >
            ‹ Library
          </button>
        ) : (
          <div className="cm-brand">
            Clipmark<span>.</span>
          </div>
        )}
        <Actions onSettings={onSettings} />
      </header>
      <div className="cm-pfilter">
        <TagFilter index={tagIndex} tokens={tokens} onTokens={onTokens} compact />
      </div>
      <div className="cm-scroll" ref={el}>
        {folder === null ? (
          <ul className="cm-list">
            {tree.folders.map((f) => {
              const clipCount = f.videos.reduce((n, v) => n + v.visibleClips.length, 0);
              return (
                <li key={f.path}>
                  <button
                    className="cm-row cm-row--folder"
                    type="button"
                    onClick={() => {
                      scrollRef.current = 0;
                      onFolder(f.path);
                    }}
                  >
                    <span className="cm-row__glyph">▸</span>
                    <span className="cm-row__main">
                      <span className="cm-row__name">{folderLabel(f.path)}</span>
                      <span className="cm-row__meta cm-mono">
                        {f.videos.length} video{f.videos.length === 1 ? "" : "s"} · {clipCount} clip
                        {clipCount === 1 ? "" : "s"}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
            {tree.folders.length === 0 && (
              <li className="cm-none">
                {tree.filtering ? "No clips match these tags." : "No videos in the library yet."}
              </li>
            )}
            <li>
              <Footnote tree={tree} />
            </li>
          </ul>
        ) : (
          <>
            <div className="cm-crumb cm-eyebrow">{folderLabel(folder)}</div>
            <ul className="cm-list">
              {(current?.videos ?? []).map((row) => (
                <li key={row.video.file} className="cm-vgroup">
                  <button
                    className="cm-row cm-row--video"
                    type="button"
                    onClick={() => openFrom(row.video, null)}
                  >
                    <Still video={row.video} orphan={row.orphan} className="cm-row__still" />
                    <span className="cm-row__main">
                      <span className="cm-row__name">{title(row.video.file)}</span>
                      <span className="cm-row__meta cm-mono">
                        {formatTime(row.video.durationSeconds)} · {row.matching}
                        {tree.filtering ? `/${row.total}` : ""} clip{row.total === 1 ? "" : "s"}
                      </span>
                    </span>
                  </button>
                  <ul className="cm-sub">
                    {row.visibleClips.map((c) => (
                      <li key={c.id}>
                        <button
                          className="cm-row cm-row--clip"
                          type="button"
                          onClick={() => openFrom(row.video, c)}
                        >
                          <span className="cm-row__t cm-mono">{formatTime(c.startSeconds)}</span>
                          <span className="cm-row__name">{c.tags.join(" · ") || "untitled"}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
              {!current && (
                <li className="cm-none">
                  {tree.filtering ? "No clips match these tags." : "This folder is empty."}
                </li>
              )}
            </ul>
          </>
        )}
      </div>
    </main>
  );
}
