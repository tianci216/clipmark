import { describe, expect, it } from "vitest";
import { DEFAULT_VIDEO_DIR, resolveVideoDir } from "../server/src/config";

describe("CLI contract", () => {
  it("defaults to the dance-video folder when no video_dir is given", () => {
    expect(resolveVideoDir([])).toBe(DEFAULT_VIDEO_DIR);
    expect(DEFAULT_VIDEO_DIR).toBe("/Users/tianci/Documents/Swing & Jazz");
  });

  it("uses the supplied [video_dir] positional argument", () => {
    expect(resolveVideoDir(["node", "server/index.js", "/tmp/videos"])).toBe(
      "/tmp/videos",
    );
  });
});
