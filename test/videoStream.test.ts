import { describe, expect, it } from "vitest";
import {
  mimeForFile,
  parseRange,
  resolveVideoPath,
} from "../server/src/videoStream";

describe("parseRange", () => {
  it("serves the whole file when no Range header is present", () => {
    expect(parseRange(undefined, 1000)).toEqual({ kind: "full" });
  });

  it("serves from an open start to the end", () => {
    expect(parseRange("bytes=500-", 1000)).toEqual({
      kind: "partial",
      start: 500,
      end: 999,
    });
  });

  it("serves an explicit byte window", () => {
    expect(parseRange("bytes=100-199", 1000)).toEqual({
      kind: "partial",
      start: 100,
      end: 199,
    });
  });

  it("treats a suffix range as the last N bytes", () => {
    expect(parseRange("bytes=-500", 1000)).toEqual({
      kind: "partial",
      start: 500,
      end: 999,
    });
  });

  it("clamps an end past EOF to the file size", () => {
    expect(parseRange("bytes=800-99999", 1000)).toEqual({
      kind: "partial",
      start: 800,
      end: 999,
    });
  });

  it("rejects start > end as unsatisfiable", () => {
    expect(parseRange("bytes=500-499", 1000)).toEqual({ kind: "unsatisfiable" });
  });

  it("rejects a start at or past EOF as unsatisfiable", () => {
    expect(parseRange("bytes=1000-", 1000)).toEqual({ kind: "unsatisfiable" });
    expect(parseRange("bytes=1001-2000", 1000)).toEqual({ kind: "unsatisfiable" });
  });

  it("rejects a zero-length suffix range as unsatisfiable", () => {
    expect(parseRange("bytes=-0", 1000)).toEqual({ kind: "unsatisfiable" });
  });

  it("ignores malformed and multi-range headers (serves full)", () => {
    expect(parseRange("bytes=abc", 1000)).toEqual({ kind: "full" });
    expect(parseRange("items=0-1", 1000)).toEqual({ kind: "full" });
    expect(parseRange("bytes=0-1,4-5", 1000)).toEqual({ kind: "full" });
    expect(parseRange("bytes=-", 1000)).toEqual({ kind: "full" });
  });
});

describe("resolveVideoPath", () => {
  const dir = "/videos/Swing & Jazz";

  it("resolves a relative path with decoded spaces inside the video dir", () => {
    expect(resolveVideoPath(dir, "sub/Clips Vol. 2.mp4")).toBe(
      "/videos/Swing & Jazz/sub/Clips Vol. 2.mp4",
    );
  });

  it("survives a literal percent sign in a filename", () => {
    expect(resolveVideoPath(dir, "100%.mp4")).toBe(
      "/videos/Swing & Jazz/100%.mp4",
    );
    expect(resolveVideoPath(dir, "100%20.mp4")).toBe(
      "/videos/Swing & Jazz/100%20.mp4",
    );
  });

  it("rejects parent-directory traversal", () => {
    expect(resolveVideoPath(dir, "../secret.mp4")).toBeNull();
    expect(resolveVideoPath(dir, "sub/../../etc/passwd")).toBeNull();
  });

  it("rejects absolute paths", () => {
    expect(resolveVideoPath(dir, "/etc/passwd")).toBeNull();
  });
});

describe("mimeForFile", () => {
  it("maps mp4 and mov to their video MIME types", () => {
    expect(mimeForFile("a.mp4")).toBe("video/mp4");
    expect(mimeForFile("A.MOV")).toBe("video/quicktime");
  });

  it("falls back to octet-stream for unknown extensions", () => {
    expect(mimeForFile("a.txt")).toBe("application/octet-stream");
  });
});
