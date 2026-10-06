import { useEffect, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { COLORS, FONTS, type Appearance } from "./appearance";
import type { DownloadControls } from "./downloadControls";
import { folderLabel } from "./format";

/**
 * The top bar on every page: the Clips | Music switch on the left, the page's search in
 * the centre, and Download (when the page has Downloads) plus the Settings gear on the right.
 * The gear opens the Appearance popover, which links on to the Settings page.
 */
export function TopBar({
  tabs,
  search,
  downloads,
  appearance,
  onAppearance,
  settingsOpen,
  onSettingsPage,
}: {
  tabs: ReactNode;
  /** The page's search box; the slot stays reserved when a page has none. */
  search: ReactNode;
  /** Download button and popover; null hides them (the Music tab). */
  downloads: DownloadControls | null;
  appearance: Appearance;
  onAppearance: (patch: Partial<Appearance>) => void;
  /** The Settings page is showing. */
  settingsOpen: boolean;
  /** Opens the Settings page (library, downloads and music). */
  onSettingsPage: () => void;
}) {
  const [dlOpen, setDlOpen] = useState(false);
  const [setOpen, setSetOpen] = useState(false);
  useEffect(() => {
    if (!downloads) setDlOpen(false);
  }, [downloads]);
  return (
    <header className="cm-topbar">
      <div className="cm-topbar__left">{tabs}</div>
      <div className="cm-topbar__search">{search}</div>
      <div className="cm-topbar__right">
        {downloads && (
          <button
            type="button"
            className={"cm-dlbtn" + (dlOpen ? " is-open" : "")}
            title="Download a video into the library"
            aria-expanded={dlOpen}
            onClick={() => {
              setDlOpen((o) => !o);
              setSetOpen(false);
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Download
            {downloads.activeCount > 0 && (
              <span className="cm-actions__badge cm-mono">{downloads.activeCount}</span>
            )}
          </button>
        )}
        <button
          type="button"
          className={"cm-iconbtn cm-gear" + (setOpen || settingsOpen ? " is-open" : "")}
          title="Settings"
          aria-label="Settings"
          aria-expanded={setOpen}
          onClick={() => {
            setSetOpen((o) => !o);
            setDlOpen(false);
          }}
        >
          ⚙
        </button>
        {downloads && dlOpen && (
          <DownloadPopover
            folders={downloads.folders}
            onDownload={downloads.onStart}
            onClose={() => setDlOpen(false)}
          />
        )}
        {setOpen && (
          <AppearancePopover
            appearance={appearance}
            onAppearance={onAppearance}
            onSettingsPage={() => {
              setSetOpen(false);
              onSettingsPage();
            }}
            onClose={() => setSetOpen(false)}
          />
        )}
      </div>
    </header>
  );
}

/** Closes a popover on Escape or a press outside it (except on its own toggle button). */
function useDismiss(box: RefObject<HTMLElement | null>, toggle: string, onClose: () => void) {
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Element;
      if (box.current && !box.current.contains(t) && !t.closest?.(toggle)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [box, toggle, onClose]);
}

function AppearancePopover({
  appearance,
  onAppearance,
  onSettingsPage,
  onClose,
}: {
  appearance: Appearance;
  onAppearance: (patch: Partial<Appearance>) => void;
  onSettingsPage: () => void;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  useDismiss(box, ".cm-gear", onClose);
  return (
    <div className="cm-pop cm-set" ref={box} role="dialog" aria-label="Settings">
      <div className="cm-pop__title">Settings</div>
      <div className="cm-set__group">
        <span className="cm-eyebrow">Appearance</span>
        <span className="cm-set__label">Font</span>
        <div className="cm-seg" role="radiogroup" aria-label="Font">
          {FONTS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="radio"
              aria-checked={appearance.font === f.value}
              className={"cm-seg__opt cm-seg__opt--" + f.value + (appearance.font === f.value ? " is-on" : "")}
              onClick={() => onAppearance({ font: f.value })}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="cm-set__label">Color</span>
        <div className="cm-seg" role="radiogroup" aria-label="Color">
          {COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              role="radio"
              aria-checked={appearance.color === c.value}
              className={"cm-seg__opt" + (appearance.color === c.value ? " is-on" : "")}
              onClick={() => onAppearance({ color: c.value })}
            >
              <span
                className="cm-seg__sw"
                style={{ background: `linear-gradient(135deg, ${c.swatch[0]} 50%, ${c.swatch[1]} 50%)` }}
              />
              {c.label}
            </button>
          ))}
        </div>
      </div>
      <button type="button" className="cm-set__more" onClick={onSettingsPage}>
        Library, downloads and music settings…
      </button>
    </div>
  );
}

function DownloadPopover({
  folders,
  onDownload,
  onClose,
}: {
  folders: string[];
  onDownload: (url: string, folder: string) => Promise<void>;
  onClose: () => void;
}) {
  const [url, setUrl] = useState("");
  const [folder, setFolder] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLFormElement>(null);

  useEffect(() => input.current?.focus(), []);
  // The Download button toggles the popover itself.
  useDismiss(box, ".cm-dlbtn", onClose);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onDownload(url.trim(), folder);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const options = ["", ...folders.filter((f) => f !== "")];
  return (
    <form className="cm-pop" ref={box} onSubmit={submit}>
      <div className="cm-pop__title">Download a video</div>
      <input
        ref={input}
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Paste a YouTube or Instagram link"
        aria-label="Video link"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
      />
      <select value={folder} onChange={(e) => setFolder(e.target.value)} aria-label="Folder">
        {options.map((f) => (
          <option key={f} value={f}>
            {f === "" ? "Library Folder (top level)" : folderLabel(f)}
          </option>
        ))}
      </select>
      {error && <div className="cm-error">{error}</div>}
      <div className="cm-pop__row">
        <button className="cm-actions__btn" type="button" onClick={onClose}>
          Cancel
        </button>
        <button className="cm-save" type="submit" disabled={busy || url.trim() === ""}>
          {busy ? "Starting…" : "Download"}
        </button>
      </div>
    </form>
  );
}
