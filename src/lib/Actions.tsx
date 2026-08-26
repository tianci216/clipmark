import { useEffect, useRef, useState, type FormEvent } from "react";
import type { DownloadControls } from "./downloadControls";
import { folderLabel } from "./format";

/**
 * "+ Download" with its popover (link field + subfolder picker) and the Settings
 * gear, in their final positions (sidebar footer on desktop, header on phone).
 */
export function Actions({
  downloads,
  onSettings,
}: {
  downloads: DownloadControls;
  onSettings: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span className="cm-actions">
      <button
        className={"cm-actions__btn" + (open ? " is-open" : "")}
        type="button"
        title="Download a video into the library"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        + Download
        {downloads.activeCount > 0 && (
          <span className="cm-actions__badge cm-mono">{downloads.activeCount}</span>
        )}
      </button>
      <button
        className="cm-actions__btn"
        type="button"
        title="Settings"
        aria-label="Settings"
        onClick={onSettings}
      >
        ⚙
      </button>
      {open && (
        <DownloadPopover
          folders={downloads.folders}
          onDownload={downloads.onStart}
          onClose={() => setOpen(false)}
        />
      )}
    </span>
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
      if (box.current && !box.current.contains(e.target as Node)) onClose();
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
      <div className="cm-eyebrow">Download</div>
      <input
        ref={input}
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Paste a link…"
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
          Close
        </button>
        <button className="cm-save" type="submit" disabled={busy || url.trim() === ""}>
          {busy ? "Starting…" : "Download"}
        </button>
      </div>
    </form>
  );
}
