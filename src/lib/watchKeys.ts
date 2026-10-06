/** What the watch page sees of a keydown, plus the page state that decides it. */
export interface WatchKeyInput {
  key: string;
  meta: boolean;
  ctrl: boolean;
  alt: boolean;
  /** Focus is in a text field (input, textarea, contenteditable). */
  typing: boolean;
  /** The player is on screen (not hidden behind Music or Settings). */
  active: boolean;
  /** Something is in fullscreen; Escape there belongs to the browser. */
  fullscreen: boolean;
  looping: boolean;
}

export type WatchKeyAction = "fullscreen" | "stop-loop" | null;

/** Watch page keys: F toggles native fullscreen, Escape stops the Loop without seeking. */
export function watchKeyAction(k: WatchKeyInput): WatchKeyAction {
  if (!k.active) return null;
  if (k.key === "Escape") return k.looping && !k.fullscreen ? "stop-loop" : null;
  if ((k.key === "f" || k.key === "F") && !k.typing && !k.meta && !k.ctrl && !k.alt) return "fullscreen";
  return null;
}

/** True when the event target is a place the user types into. */
export function isTypingTarget(t: EventTarget | null): boolean {
  if (!t || typeof (t as HTMLElement).tagName !== "string") return false;
  const el = t as HTMLElement;
  if (el.isContentEditable) return true;
  if (el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
  if (el.tagName !== "INPUT") return false;
  const type = ((el as HTMLInputElement).type || "text").toLowerCase();
  return !["button", "checkbox", "radio", "range", "submit", "reset", "file", "color"].includes(type);
}

type FsDocument = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
type FsVideo = HTMLVideoElement & { webkitRequestFullscreen?: () => void; webkitEnterFullscreen?: () => void };

export function fullscreenElement(): Element | null {
  const d = document as FsDocument;
  return d.fullscreenElement ?? d.webkitFullscreenElement ?? null;
}

/** Native fullscreen on the video element; leaves fullscreen if anything is in it. */
export function toggleFullscreen(video: HTMLVideoElement | null): void {
  const d = document as FsDocument;
  if (fullscreenElement()) {
    if (d.exitFullscreen) void d.exitFullscreen().catch(() => {});
    else d.webkitExitFullscreen?.();
    return;
  }
  const v = video as FsVideo | null;
  if (!v) return;
  if (v.requestFullscreen) void v.requestFullscreen().catch(() => {});
  else if (v.webkitRequestFullscreen) v.webkitRequestFullscreen();
  else v.webkitEnterFullscreen?.();
}
