import { useEffect, useRef } from "react";
import { formatDuration, listHeading, type Collection, type SortColumn } from "./musicApi";
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
 * The Mixxx query box for the top bar (Lucene-style, with a syntax cheat sheet while
 * the box is focused and empty).
 */
export function MusicSearch({ library }: { library: MusicLibrary }) {
  return (
    <div className="mx-search" role="search">
      <input
        type="search"
        value={library.searchText}
        onChange={(e) => library.setSearchText(e.target.value)}
        placeholder='Search tracks · artist:basie bpm:>150 crate:"lindy hop"'
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
  );
}

/** "All tracks" first, then the Mixxx crates and playlists as chips; picking the selected one returns to All tracks. */
function MusicChips({ library }: { library: MusicLibrary }) {
  const { view, selectView, crates, playlists } = library;
  const chip = (type: "crate" | "playlist", c: Collection) => {
    const on = view.type === type && view.id === c.id;
    return (
      <button
        key={`${type}-${c.id}`}
        type="button"
        className={`cm-chip mx-chip--${type}` + (on ? " is-on" : "")}
        title={type === "crate" ? "Crate" : "Playlist"}
        aria-pressed={on}
        onClick={() => selectView(on ? { type: "all" } : { type, id: c.id, name: c.name })}
      >
        {c.name}
      </button>
    );
  };
  return (
    <nav className="cm-chips mx-chips" aria-label="Crates and playlists">
      <button
        type="button"
        className={"cm-chip" + (view.type === "all" ? " is-on" : "")}
        aria-pressed={view.type === "all"}
        onClick={() => selectView({ type: "all" })}
      >
        All tracks
      </button>
      {crates.map((c) => chip("crate", c))}
      {playlists.map((c) => chip("playlist", c))}
    </nav>
  );
}

/**
 * The Music page below the top bar: crate and playlist chips, the list heading
 * (name, then kind · tracks · minutes) and the sortable track table, which folds
 * into two-line cards on the phone. Clicking a row plays it.
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
  const heading = listHeading(view, tracks);
  const arrow = sort.order === "asc" ? "▲" : "▼";

  // Keep the playing track in view when it changes or the list reloads.
  useEffect(() => {
    listRef.current?.querySelector(".mx-row.is-playing")?.scrollIntoView({ block: "nearest" });
  }, [player.currentId, tracks]);

  return (
    <section className="cm-main mx-main">
      <div className="mx-scroll" ref={listRef}>
        <MusicChips library={library} />
        <div className="mx-page">
          <header className="mx-head">
            <h1 className="mx-title">{heading.title}</h1>
            <span className="mx-count">{status === "ready" ? heading.meta : ""}</span>
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
            <div className="mx-list">
              <table className="mx-table">
                <thead>
                  <tr>
                    {COLUMNS.map((c) => (
                      <th
                        key={c.label}
                        className={c.className + (c.col ? " is-sortable" : "")}
                        onClick={c.col ? () => toggleSort(c.col!) : undefined}
                        aria-sort={
                          c.col && sort.col === c.col
                            ? sort.order === "asc"
                              ? "ascending"
                              : "descending"
                            : undefined
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
                      <td className="mx-c-num cm-mono">
                        <span className="mx-num__n">{i + 1}</span>
                        <span className="mx-num__p" aria-hidden="true">
                          {t.id === player.currentId ? "♪" : "▶"}
                        </span>
                      </td>
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
        </div>
      </div>
    </section>
  );
}
