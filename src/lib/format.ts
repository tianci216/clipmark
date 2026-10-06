import type { Video } from "./api";

export function formatTime(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "--:--";
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function basename(file: string): string {
  const parts = file.split("/");
  return parts[parts.length - 1] || file;
}

/** Folder part of a folder-relative path; "" for a file at the Library Folder's top level. */
export function dirname(file: string): string {
  return file.split("/").slice(0, -1).join("/");
}

/** File name without its extension. */
export function title(file: string): string {
  return basename(file).replace(/\.[a-z0-9]+$/i, "");
}

/** A Video's name everywhere it is shown: the Source title, else the file name. */
export function displayName(video: Video): string {
  return video.source?.title ?? title(video.file);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2024-08-26" → "26 Aug 2024"; anything else is shown as given. */
export function formatUploadDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const month = m ? MONTHS[Number(m[2]) - 1] : undefined;
  return m && month ? `${Number(m[3])} ${month} ${m[1]}` : iso;
}

/** The page link's label: its host without "www.". */
export function sourceHost(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return "link";
  }
}

/** Display name for a folder path; the top level of the Library Folder has none. */
export function folderLabel(path: string): string {
  return path === "" ? "Library Folder" : path;
}
