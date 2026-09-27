import { useEffect, useRef } from "react";
import { formatDuration, type SortColumn } from "./musicApi";
import type { AudioPlayer } from "./useAudioPlayer";
import type { MusicLibrary } from "./useMusicLibrary";

const COLUMNS: { col: SortColumn | null; label: string; className: string }[] = [
  { col: null, label: "#", className: "mx-c-num" },
  { col: "artist", label: "Artist", className: "mx-c-artist" },
  { col: "title", label: "Title", className: "mx-c-title" },
  { col: "bpm", label: "BPM", className: "mx-c-bpm" },
  { col: "key", label: "Key", className: "mx-c-key" },
  { col: "duration", label: "Dur", className: "mx-c-dur" },
  { col: "genre", label: "Genre", className: "mx-c-genre" },
];

const SORT_OPTIONS: { col: SortColumn; label: string }[] = [
  { col: "artist", label: "Artist" },
  { col: "title", label: "Title" },
  { col: "bpm", label: "BPM" },
  { col: "key", label: "Key" },
  { col: "duration", label: "Duration" },
  { col: "genre", label: "Genre" },
];

/**
 * The Music tab's main pane: view title, track count, search (Lucene-style, with
 * a syntax cheat sheet while the box is focused and empty) and the sortable track
 * table, which folds into two-line cards on the phone.
 */
export function MusicPane({
  library,
  player,
  onSettings,
}: {
  library: MusicLibrary;
  player: AudioPlayer;
  onSettings: () => void;
}) {
  const { view, tracks, sort, toggleSort, status, error, queryError } = library;
  const listRef = useRef<HTMLDivElement>(null);
  const title = view.type === "all" ? "All Tracks" : view.name;
  const arrow = sort.order === "asc" ? "▲" : "▼";

  // Keep the playing track in view when it changes or the list reloads.
  useEffect(() => {
    listRef.current?.querySelector(".mx-row.is-playing")?.scrollIntoView({ block: "nearest" });
  }, [player.currentId, tracks]);

  return (
    <section className="cm-main mx-main">
      <header className="mx-head">
        <h1 className="mx-title">{title}</h1>
        <span className="mx-count cm-mono">
          {status === "ready" ? `${tracks.length} tracks` : ""}
        </span>
        <span className="mx-psort">
          <select
            className="mx-psort__select"
            value={sort.col}
            aria-label="Sort by"
            onChange={(e) => toggleSort(e.target.value as SortColumn)}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.col} value={o.col}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            className="cm-actions__btn"
            type="button"
            aria-label={sort.order === "asc" ? "Ascending" : "Descending"}
            onClick={() => toggleSort(sort.col)}
          >
            {arrow}
          </button>
        </span>
        <div className="mx-search">
          <input
            type="search"
            value={library.searchText}
            onChange={(e) => library.setSearchText(e.target.value)}
            placeholder='Search… e.g. bpm:>150 AND crate:"lindy hop"'
            aria-label="Search tracks"
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
          />
          <div className="mx-help">
            <kbd>artist:basie</kbd> <kbd>title:jump</kbd> <kbd>genre:jazz</kbd> <kbd>key:Bb</kbd>{" "}
            <kbd>album:swing</kbd>
            <br />
            <kbd>bpm:&gt;150</kbd> <kbd>bpm:[120 TO 160]</kbd> <kbd>duration:&gt;180</kbd>
            <br />
            <kbd>crate:"lindy hop"</kbd> <kbd>playlist:"set 1"</kbd>
            <br />
            Combine with <kbd>AND</kbd> / <kbd>OR</kbd> / <kbd>NOT</kbd> — plain text searches artist, title,
            album
          </div>
        </div>
        {queryError && <div className="mx-qerr cm-mono">{queryError}</div>}
      </header>

      {status === "error" ? (
        <div className="cm-empty">
          <div className="cm-empty__glyph">♫</div>
          <p>Couldn't read the Mixxx library.</p>
          <p className="mx-err cm-mono">{error}</p>
          <button className="cm-actions__btn" type="button" onClick={onSettings}>
            Open Settings
          </button>
        </div>
      ) : status !== "ready" ? (
        <div className="cm-empty">
          <div className="cm-empty__glyph">♫</div>
          <p>Loading the music library…</p>
        </div>
      ) : (
        <div className="mx-list" ref={listRef}>
          <table className="mx-table">
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <th
                    key={c.label}
                    className={c.className + (c.col ? " is-sortable" : "")}
                    onClick={c.col ? () => toggleSort(c.col!) : undefined}
                    aria-sort={
                      c.col && sort.col === c.col ? (sort.order === "asc" ? "ascending" : "descending") : undefined
                    }
                  >
                    {c.label}
                    {c.col && sort.col === c.col && <span className="mx-arrow">{arrow}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tracks.map((t, i) => (
                <tr
                  key={t.id}
                  className={
                    "mx-row" +
                    (t.id === player.currentId ? " is-playing" : "") +
                    (t.id === player.loadingId ? " is-loading" : "")
                  }
                  onClick={() => player.play(t, tracks)}
                >
                  <td className="mx-c-num cm-mono">{i + 1}</td>
                  <td className="mx-c-artist">{t.artist}</td>
                  <td className="mx-c-title">{t.title}</td>
                  <td className="mx-c-bpm cm-mono">{t.bpm || ""}</td>
                  <td className="mx-c-key cm-mono">{t.key}</td>
                  <td className="mx-c-dur cm-mono">{formatDuration(t.duration)}</td>
                  <td className="mx-c-genre">{t.genre}</td>
                </tr>
              ))}
              {tracks.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length} className="mx-none">
                    No tracks found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
