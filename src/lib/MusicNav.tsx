import type { Collection, MusicView } from "./musicApi";
import type { MusicLibrary } from "./useMusicLibrary";

/** Library › All Tracks, then the Mixxx crates and playlists (in the Music drawer). */
export function MusicNav({
  library,
  onPick,
}: {
  library: MusicLibrary;
  /** Called after a view is picked (closes the drawer). */
  onPick?: () => void;
}) {
  const { view, selectView, crates, playlists } = library;
  const pick = (next: MusicView) => {
    selectView(next);
    onPick?.();
  };
  const item = (key: string, label: string, selected: boolean, next: MusicView) => (
    <li key={key}>
      <button
        type="button"
        className={"mx-nav__item" + (selected ? " is-sel" : "")}
        onClick={() => pick(next)}
      >
        {label}
      </button>
    </li>
  );
  const group = (title: string, type: "crate" | "playlist", list: Collection[]) => (
    <>
      <div className="mx-nav__head cm-eyebrow">{title}</div>
      <ul className="mx-nav__list">
        {list.map((c) =>
          item(`${type}-${c.id}`, c.name, view.type === type && view.id === c.id, { type, id: c.id, name: c.name }),
        )}
        {list.length === 0 && <li className="mx-nav__none">None</li>}
      </ul>
    </>
  );
  return (
    <nav className="mx-nav">
      <div className="mx-nav__head cm-eyebrow">Library</div>
      <ul className="mx-nav__list">{item("all", "All Tracks", view.type === "all", { type: "all" })}</ul>
      {group("Crates", "crate", crates)}
      {group("Playlists", "playlist", playlists)}
    </nav>
  );
}
