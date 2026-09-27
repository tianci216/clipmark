import { useEffect, useRef, type ReactNode } from "react";
import type { Clip, Video } from "./api";
import { Actions } from "./Actions";
import type { DownloadControls } from "./downloadControls";
import { DownloadRow } from "./DownloadRow";
import { folderLabel, formatTime, title } from "./format";
import type { LibraryTree } from "./libraryTree";
import { TagFilter } from "./TagFilter";
import type { TagEntry } from "./tags";

export interface Target {
  video: Video;
  loopClip: Clip | null;
}

/** Desktop sidebar: brand, compact filter, Folder › Video › Clip tree, footer actions. */
export function Sidebar({
  tree,
  tagIndex,
  tokens,
  onTokens,
  target,
  onHome,
  onOpen,
  onSettings,
  downloads,
  tabs,
}: {
  tree: LibraryTree;
  tagIndex: TagEntry[];
  tokens: string[];
  onTokens: (t: string[]) => void;
  target: Target | null;
  onHome: () => void;
  onOpen: (video: Video, clip: Clip | null) => void;
  onSettings: () => void;
  downloads: DownloadControls;
  /** The Clips / Music switch, beside the brand. */
  tabs: ReactNode;
}) {
  const treeRef = useRef<HTMLElement>(null);
  const selectedFile = target?.video.file;
  useEffect(() => {
    // Keep the selected Video in view when it was picked from the index or a related table.
    treeRef.current
      ?.querySelector(".cm-node.is-sel")
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedFile]);
  return (
    <aside className="cm-side">
      <div className="cm-side__top">
        <div className="cm-side__brandrow">
          <button className="cm-brand" type="button" onClick={onHome} title="Library">
            Clipmark<span>.</span>
          </button>
          {tabs}
        </div>
        <TagFilter index={tagIndex} tokens={tokens} onTokens={onTokens} compact />
      </div>
      <nav className="cm-tree" ref={treeRef}>
        {tree.folders.map((folder) => (
          <div className="cm-folder" key={folder.path}>
            <div className="cm-folder__name cm-eyebrow">{folderLabel(folder.path)}</div>
            {folder.videos.map((row) => {
              const selected = target?.video.file === row.video.file;
              const expanded = (selected || tree.filtering) && row.visibleClips.length > 0;
              return (
                <div className={"cm-node" + (selected ? " is-sel" : "")} key={row.video.file}>
                  <button
                    className="cm-node__video"
                    type="button"
                    onClick={() => onOpen(row.video, null)}
                  >
                    <span className="cm-node__name">{title(row.video.file)}</span>
                    <span className="cm-node__n cm-mono">
                      {row.matching}
                      {tree.filtering ? `/${row.total}` : ""}
                    </span>
                  </button>
                  {expanded && (
                    <ul className="cm-node__clips">
                      {row.visibleClips.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            className={
                              "cm-node__clip" +
                              (selected && target?.loopClip?.id === c.id ? " is-sel" : "")
                            }
                            onClick={() => onOpen(row.video, c)}
                          >
                            <span className="cm-mono">{formatTime(c.startSeconds)}</span>
                            <span>{c.tags.join(" · ") || "untitled"}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
            {folder.downloads.map((d) => (
              <DownloadRow key={d.id} download={d} controls={downloads} />
            ))}
          </div>
        ))}
        {tree.folders.length === 0 && (
          <div className="cm-none">
            {tree.filtering ? "No clips match these tags." : "No videos in the library yet."}
          </div>
        )}
      </nav>
      <div className="cm-side__foot">
        <Actions downloads={downloads} onSettings={onSettings} />
      </div>
    </aside>
  );
}
