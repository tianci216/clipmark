import { useState, type FormEvent } from "react";
import { saveLibraryFolder, type SavedSettings, type Settings } from "./api";

/**
 * Settings: the Library Folder field with validation readback, and the address to
 * type on the phone. Renders in the main pane on desktop and as its own screen on
 * the phone; the caller supplies the back affordance around it.
 */
export function SettingsPane({
  settings,
  onSaved,
}: {
  settings: Settings;
  /** Called after a successful save with the server's response; the caller refetches the library. */
  onSaved: (saved: SavedSettings) => void;
}) {
  const [draft, setDraft] = useState(settings.libraryFolder ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readback, setReadback] = useState<SavedSettings | null>(null);
  const firstRun = settings.libraryFolder === null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const saved = await saveLibraryFolder(draft);
      setReadback(saved);
      setDraft(saved.libraryFolder ?? draft);
      onSaved(saved);
    } catch (err) {
      setReadback(null);
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="cm-main">
      <div className="cm-main__scroll cm-settings">
        <h1 className="cm-h1">Settings</h1>

        <form className="cm-settings__block" onSubmit={submit}>
          <div className="cm-eyebrow">Library Folder</div>
          {firstRun && !readback && (
            <p className="cm-settings__lede">
              Choose your library folder — the folder of videos Clipmark scans. Type its
              absolute path.
            </p>
          )}
          <div className="cm-settings__field">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="/Users/you/Videos/Dance"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              aria-label="Library Folder path"
            />
            <button className="cm-save" type="submit" disabled={busy || draft.trim() === ""}>
              {busy ? "Checking…" : "Save"}
            </button>
          </div>
          {error && <div className="cm-error">{error}</div>}
          {readback && (
            <p className="cm-settings__readback cm-mono">
              Saved · {readback.libraryFolder} · {readback.videoCount} video
              {readback.videoCount === 1 ? "" : "s"} found
            </p>
          )}
          <p className="cm-settings__hint">
            Applies immediately. Clips on videos outside this folder are hidden, not deleted.
          </p>
        </form>

        <div className="cm-settings__block">
          <div className="cm-eyebrow">On your phone</div>
          {settings.tailscaleIp ? (
            <AddressLine label="Tailscale" url={`http://${settings.tailscaleIp}:${settings.port}`} />
          ) : (
            <p className="cm-settings__addr cm-settings__addr--off">Tailscale: not connected</p>
          )}
          {settings.lanIp && (
            <AddressLine label="LAN" url={`http://${settings.lanIp}:${settings.port}`} />
          )}
          {!settings.tailscaleIp && !settings.lanIp && (
            <p className="cm-settings__hint">No network address found.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function AddressLine({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (insecure context) — the address is still selectable text.
    }
  };
  return (
    <p className="cm-settings__addr">
      <span className="cm-settings__addr-label">{label}</span>
      <span className="cm-mono cm-settings__url">{url}</span>
      <button className="cm-actions__btn" type="button" onClick={copy}>
        {copied ? "Copied" : "Copy"}
      </button>
    </p>
  );
}
