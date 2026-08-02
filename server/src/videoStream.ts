import path from "node:path";

export const MIME_BY_EXTENSION: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
};

export function mimeForFile(file: string): string {
  return MIME_BY_EXTENSION[path.extname(file).toLowerCase()] ?? "application/octet-stream";
}

export type RangeResult =
  | { kind: "full" }
  | { kind: "partial"; start: number; end: number }
  | { kind: "unsatisfiable" };

const RANGE_RE = /^bytes=(\d*)-(\d*)$/;

export function parseRange(rangeHeader: string | undefined, size: number): RangeResult {
  if (!rangeHeader) return { kind: "full" };
  const match = RANGE_RE.exec(rangeHeader.trim());
  if (!match) return { kind: "full" };
  const startRaw = match[1];
  const endRaw = match[2];
  if (startRaw === "" && endRaw === "") return { kind: "full" };

  let start: number;
  let end: number;
  if (startRaw === "") {
    const suffix = Number(endRaw);
    if (!Number.isFinite(suffix) || suffix <= 0) return { kind: "unsatisfiable" };
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(startRaw);
    end = endRaw === "" ? size - 1 : Math.min(Number(endRaw), size - 1);
  }

  if (!Number.isFinite(start) || start > end || start >= size || end < 0) {
    return { kind: "unsatisfiable" };
  }
  return { kind: "partial", start, end };
}

// Express decodes URL-encoded route params, so rawPath arrives already
// decoded; only the traversal guard is needed here.
export function resolveVideoPath(videoDir: string, rawPath: string): string | null {
  const base = path.resolve(videoDir);
  const abs = path.resolve(base, rawPath);
  if (abs !== base && !abs.startsWith(base + path.sep)) return null;
  return abs;
}
