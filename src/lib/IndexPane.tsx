import { useEffect, useRef, type MutableRefObject } from "react";
import type { Clip, Video } from "./api";
import { basename, folderLabel, formatTime } from "./format";
import type { LibraryTree } from "./libraryTree";
import { Still } from "./Still";
import { Strip, stripDuration } from "./Strip";
import { matchesTokens } from "./tags";

export function Footnote({ tree }: { tree: LibraryTree }) {
  const t = tree.totals;
  return (
    <p className="cm-foot cm-mono">
      {t.videos} video{t.videos === 1 ? "" : "s"} · {t.folders} folder{t.folders === 1 ? "" : "s"} ·{" "}
      {t.clips} clip{t.clips === 1 ? "" : "s"}
      {tree.filtering ? ` · ${t.matching} match the filter` : ""}
    </p>
  );
}

/** Desktop main pane when nothing is selected: the folder-grouped index of Videos. */
export function IndexPane({
  tree,
  tokens,
  scrollRef,
  onOpen,
}: {
  tree: LibraryTree;
  tokens: string[];
  /** Stores the pane's scroll position so it survives a trip to the player. */
  scrollRef: MutableRefObject<number>;
  onOpen: (video: Video, clip: Clip | null) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (el.current) el.current.scrollTop = scrollRef.current;
  }, [scrollRef]);
  // Track scrolling (covers leaving via the sidebar) and also capture at the moment of
  // leaving via a row, since a scroll event may not have fired yet.
  const openFrom = (video: Video, clip: Clip | null) => {
    scrollRef.current = el.current?.scrollTop ?? 0;
    onOpen(video, clip);
  };

  return (
    <section className="cm-main">
      <div
        className="cm-main__scroll"
        ref={el}
        onScroll={(e) => {
          scrollRef.current = e.currentTarget.scrollTop;
        }}
      >
        <h1 className="cm-h1">Library</h1>
        {tree.folders.map((folder) => (
          <div className="cm-sec" key={folder.path}>
            <div className="cm-sec__h cm-eyebrow">{folderLabel(folder.path)}</div>
            <table className="cm-table">
              <tbody>
                {folder.videos.map((row) => (
                  <tr key={row.video.file} onClick={() => openFrom(row.video, null)}>
                    <td className="cm-table__still">
                      <Still video={row.video} orphan={row.orphan} />
                    </td>
                    <td className="cm-table__name">{basename(row.video.file)}</td>
                    <td className="cm-mono cm-table__dur">{formatTime(row.video.durationSeconds)}</td>
                    <td className="cm-table__strip">
                      <Strip
                        duration={stripDuration(row.video.durationSeconds, row.clips)}
                        clips={row.clips}
                        active={(c) => !tree.filtering || matchesTokens(tokens, c.tags)}
                        dim={tree.filtering}
                        onClip={(c) => openFrom(row.video, c)}
                      />
                    </td>
                    <td className="cm-mono cm-table__n">
                      {row.matching}
                      {tree.filtering ? `/${row.total}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        {tree.folders.length === 0 && (
          <div className="cm-none">
            {tree.filtering ? "No clips match these tags." : "No videos in the library yet."}
          </div>
        )}
        <Footnote tree={tree} />
      </div>
    </section>
  );
}
