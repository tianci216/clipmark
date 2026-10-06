import type { Color, Font } from "./appearance";

export interface Video {
  hash: string;
  file: string;
  fileMtime: number | null;
  durationSeconds: number | null;
  thumbnail: string | null;
  clipCount: number;
  firstClipStart: number | null;
  /** Where a downloaded Video came from (ADR-0009); null for local files. */
  source: Source | null;
}

/** A downloaded Video's Source, saved by Hash when the Download lands. */
export interface Source {
  /** The page the Video was downloaded from. */
  url: string;
  title: string;
  description: string;
  channel: string | null;
  /** ISO date, YYYY-MM-DD. */
  uploadDate: string | null;
  siteId: string;
  /** Local URL of the preview image (already the Video's thumbnail), or null. */
  preview: string | null;
}

export interface Clip {
  id: number;
  videoHash: string;
  file: string;
  startSeconds: number;
  endSeconds: number;
  note: string;
  dancers: string[];
  tags: string[];
}

export interface TreeResponse {
  videos: Video[];
  /** Every subfolder of the Library Folder (folder-relative), for the Download picker. */
  folders: string[];
}

export function videoUrl(file: string): string {
  return "/video/" + file.split("/").map(encodeURIComponent).join("/");
}

export interface ClipInput {
  startSeconds: number;
  endSeconds: number;
  note: string;
  dancers: string[];
  tags: string[];
}

export async function fetchTree(): Promise<TreeResponse> {
  const res = await fetch("/api/tree");
  if (!res.ok) throw new Error(`GET /api/tree failed: ${res.status}`);
  return (await res.json()) as TreeResponse;
}

export async function fetchClips(): Promise<Clip[]> {
  const res = await fetch("/api/clips");
  if (!res.ok) throw new Error(`GET /api/clips failed: ${res.status}`);
  return (await res.json()) as Clip[];
}

export async function createClip(videoHash: string, input: ClipInput): Promise<Clip> {
  return send<Clip>("POST", "/api/clips", { videoHash, ...input });
}

/** Replaces a Clip's IN, OUT, Note, Dancers and Tags in full (ADR-0008). */
export async function updateClip(id: number, input: ClipInput): Promise<Clip> {
  return send<Clip>("PUT", `/api/clips/${id}`, input);
}

export async function deleteClip(id: number): Promise<void> {
  const res = await fetch(`/api/clips/${id}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) {
    throw new Error(`DELETE /api/clips/${id} failed: ${res.status}`);
  }
}

export type CookiesFromBrowser = "none" | "chrome" | "safari" | "firefox";
export const COOKIE_BROWSERS: readonly CookiesFromBrowser[] = ["none", "chrome", "safari", "firefox"];

/** GET /api/settings — the server-owned Library Folder (ADR-0005), cookies, yt-dlp status, addresses. */
export interface Settings {
  libraryFolder: string | null;
  /** The Mixxx database the Music tab reads (read-only). */
  mixxxDbPath: string;
  /** Audio is only served from under this folder. */
  musicBase: string;
  tailscaleIp: string | null;
  lanIp: string | null;
  port: number;
  cookiesFromBrowser: CookiesFromBrowser;
  font: Font;
  color: Color;
  /** Installed yt-dlp, or null when not found. */
  ytDlp: { path: string; version: string } | null;
}

export interface SettingsPatch {
  libraryFolder?: string;
  cookiesFromBrowser?: CookiesFromBrowser;
  mixxxDbPath?: string;
  musicBase?: string;
  font?: Font;
  color?: Color;
}

/** PUT /api/settings response: the saved settings plus how many video files the folder holds. */
export interface SavedSettings extends Settings {
  videoCount: number;
  /** Tracks in the Mixxx library, when the music paths were saved (null if unreadable). */
  trackCount?: number | null;
}

export async function fetchSettings(): Promise<Settings> {
  const res = await fetch("/api/settings");
  if (!res.ok) throw new Error(`GET /api/settings failed: ${res.status}`);
  return (await res.json()) as Settings;
}

async function send<T>(method: string, url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message = `${method} ${url} failed: ${res.status}`;
    try {
      const json = (await res.json()) as { error?: string };
      if (json.error) message = json.error;
    } catch {
      // keep the status message
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export function saveSettings(patch: SettingsPatch): Promise<SavedSettings> {
  return send<SavedSettings>("PUT", "/api/settings", patch);
}

export function saveLibraryFolder(libraryFolder: string): Promise<SavedSettings> {
  return saveSettings({ libraryFolder });
}

export type DownloadState = "queued" | "running" | "done" | "failed" | "cancelled";

/** A Download: an in-flight fetch into the Library Folder; becomes a Video once landed. */
export interface Download {
  id: number;
  url: string;
  /** Folder-relative destination; "" is the top level. */
  folder: string;
  state: DownloadState;
  progress: number;
  title: string | null;
  /** Folder-relative path of the landed file once done. */
  file: string | null;
  error: string | null;
  startedAt: number | null;
}

export async function fetchDownloads(): Promise<Download[]> {
  const res = await fetch("/api/downloads");
  if (!res.ok) throw new Error(`GET /api/downloads failed: ${res.status}`);
  return (await res.json()) as Download[];
}

export function startDownload(url: string, folder: string): Promise<Download> {
  return send<Download>("POST", "/api/downloads", { url, folder });
}

/** Cancels a running Download, drops a queued one, or dismisses a finished row. */
export async function removeDownload(id: number): Promise<void> {
  const res = await fetch(`/api/downloads/${id}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204 && res.status !== 404) {
    throw new Error(`DELETE /api/downloads/${id} failed: ${res.status}`);
  }
}

export type CookieTest = { ok: true; browser: string } | { ok: false; browser: string; error: string };

export function testCookies(): Promise<CookieTest> {
  return send<CookieTest>("POST", "/api/downloads/test-cookies", {});
}
