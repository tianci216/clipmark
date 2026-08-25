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

/** Display name for a folder path; the top level of the Library Folder has none. */
export function folderLabel(path: string): string {
  return path === "" ? "Library Folder" : path;
}
