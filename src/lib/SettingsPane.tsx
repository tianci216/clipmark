import { useState, type FormEvent } from "react";
import {
  COOKIE_BROWSERS,
  saveLibraryFolder,
  saveSettings,
  testCookies,
  type CookieTest,
  type CookiesFromBrowser,
  type SavedSettings,
  type Settings,
} from "./api";

const BROWSER_LABEL: Record<CookiesFromBrowser, string> = {
  none: "None",
  chrome: "Chrome",
  safari: "Safari",
  firefox: "Firefox",
};

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

        <DownloadsBlock settings={settings} onSaved={onSaved} />

        <MusicBlock settings={settings} onSaved={onSaved} />

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

/** The Music tab's Mixxx database and Music Folder, saved together with a track-count readback. */
function MusicBlock({
  settings,
  onSaved,
}: {
  settings: Settings;
  onSaved: (saved: SavedSettings) => void;
}) {
  const [db, setDb] = useState(settings.mixxxDbPath);
  const [base, setBase] = useState(settings.musicBase);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readback, setReadback] = useState<SavedSettings | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const saved = await saveSettings({ mixxxDbPath: db, musicBase: base });
      setReadback(saved);
      setDb(saved.mixxxDbPath);
      setBase(saved.musicBase);
      onSaved(saved);
    } catch (err) {
      setReadback(null);
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="cm-settings__block" onSubmit={submit}>
      <div className="cm-eyebrow">Music (Mixxx)</div>
      <label className="cm-settings__label" htmlFor="cm-mixxx-db">
        Mixxx database
      </label>
      <div className="cm-settings__field">
        <input
          id="cm-mixxx-db"
          type="text"
          value={db}
          onChange={(e) => setDb(e.target.value)}
          placeholder="…/Mixxx/mixxxdb.sqlite"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
        />
      </div>
      <label className="cm-settings__label" htmlFor="cm-music-base">
        Music Folder
      </label>
      <div className="cm-settings__field">
        <input
          id="cm-music-base"
          type="text"
          value={base}
          onChange={(e) => setBase(e.target.value)}
          placeholder="/Users/you/Music"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
        />
        <button className="cm-save" type="submit" disabled={busy || db.trim() === "" || base.trim() === ""}>
          {busy ? "Checking…" : "Save"}
        </button>
      </div>
      {error && <div className="cm-error">{error}</div>}
      {readback && (
        <p className="cm-settings__readback cm-mono">
          Saved · {readback.trackCount ?? 0} track{readback.trackCount === 1 ? "" : "s"} in the Mixxx library
        </p>
      )}
      <p className="cm-settings__hint">
        The Music tab reads Mixxx's library read-only and never writes to it. Tracks play only from
        files under the Music Folder.
      </p>
    </form>
  );
}

/** Cookies-from-browser choice, the Keychain test, and the yt-dlp status line. */
function DownloadsBlock({
  settings,
  onSaved,
}: {
  settings: Settings;
  onSaved: (saved: SavedSettings) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<CookieTest | "testing" | null>(null);
  const browser = settings.cookiesFromBrowser;

  const change = async (next: CookiesFromBrowser) => {
    setBusy(true);
    setError(null);
    setTest(null);
    try {
      onSaved(await saveSettings({ cookiesFromBrowser: next }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const runTest = async () => {
    setTest("testing");
    try {
      setTest(await testCookies());
    } catch (err) {
      setTest({ ok: false, browser, error: (err as Error).message });
    }
  };

  return (
    <div className="cm-settings__block">
      <div className="cm-eyebrow">Downloads</div>
      <p className="cm-settings__addr">
        <span className="cm-settings__addr-label">yt-dlp</span>
        {settings.ytDlp ? (
          <span className="cm-mono cm-settings__url">
            {settings.ytDlp.version} · {settings.ytDlp.path}
          </span>
        ) : (
          <span className="cm-settings__missing">
            not found — <span className="cm-mono">brew install yt-dlp</span>
          </span>
        )}
      </p>
      <p className="cm-settings__addr">
        <label className="cm-settings__addr-label" htmlFor="cm-cookies">
          Cookies
        </label>
        <select
          id="cm-cookies"
          className="cm-settings__select"
          value={browser}
          disabled={busy}
          onChange={(e) => change(e.target.value as CookiesFromBrowser)}
        >
          {COOKIE_BROWSERS.map((b) => (
            <option key={b} value={b}>
              {BROWSER_LABEL[b]}
            </option>
          ))}
        </select>
        <button
          className="cm-actions__btn"
          type="button"
          disabled={browser === "none" || test === "testing"}
          onClick={runTest}
        >
          {test === "testing" ? "Testing…" : "Test cookie access"}
        </button>
      </p>
      {error && <div className="cm-error">{error}</div>}
      {test && test !== "testing" && (
        test.ok ? (
          <p className="cm-settings__readback cm-mono">
            {BROWSER_LABEL[test.browser as CookiesFromBrowser] ?? test.browser} cookies readable.
          </p>
        ) : (
          <pre className="cm-error cm-settings__pre">{test.error}</pre>
        )
      )}
      <p className="cm-settings__hint">
        yt-dlp reads the browser's cookies so downloads that fail anonymously succeed. The first
        read asks for Keychain access on the Mac — run the test once to grant it. Chrome may need
        to be closed while its cookies are read.
      </p>
    </div>
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
