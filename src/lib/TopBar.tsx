import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { DownloadControls } from "./downloadControls";
import { folderLabel } from "./format";

/**
 * The top bar on every page: the Clips | Music switch on the left, the page's search in
 * the centre, and Download (when the page has Downloads) plus the Settings gear on the right.
 */
export function TopBar({
  tabs,
  search,
  downloads,
  settingsOpen,
  onSettings,
}: {
  tabs: ReactNode;
  /** The page's search box; the slot stays reserved when a page has none. */
  search: ReactNode;
  /** Download button and popover; null hides them (the Music tab). */
  downloads: DownloadControls | null;
  settingsOpen: boolean;
  /** Toggles the Settings page. */
  onSettings: () => void;
}) {
  const [dlOpen, setDlOpen] = useState(false);
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
            onClick={() => setDlOpen((o) => !o)}
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
          className={"cm-iconbtn" + (settingsOpen ? " is-open" : "")}
          title="Settings"
          aria-label="Settings"
          aria-pressed={settingsOpen}
          onClick={onSettings}
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
      </div>
    </header>
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

  useEffect(() => {
    input.current?.focus();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Element;
      // The Download button toggles the popover itself.
      if (box.current && !box.current.contains(t) && !t.closest?.(".cm-dlbtn")) onClose();
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
  }, [onClose]);

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
