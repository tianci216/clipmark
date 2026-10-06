import { describe, expect, it } from "vitest";
import { YT_DLP_CANDIDATE_DIRS, buildArgs, parseStdoutLine, ytDlpEnv } from "../server/src/ytdlp.js";

describe("ytDlpEnv (toolEnv, shared with the scanner)", () => {
  it("prepends the candidate dirs to a bare GUI PATH so yt-dlp can find its JS runtime", () => {
    const env = ytDlpEnv({ PATH: "/usr/bin:/bin", HOME: "/Users/x" });
    expect(env.PATH).toBe([...YT_DLP_CANDIDATE_DIRS, "/bin"].join(":"));
    expect(env.HOME).toBe("/Users/x");
  });

  it("does not duplicate dirs already on PATH and copes with no PATH at all", () => {
    expect(ytDlpEnv({ PATH: "/opt/homebrew/bin:/x" }).PATH).toBe([...YT_DLP_CANDIDATE_DIRS, "/x"].join(":"));
    expect(ytDlpEnv({}).PATH).toBe(YT_DLP_CANDIDATE_DIRS.join(":"));
  });
});

describe("buildArgs", () => {
  it("passes --cookies-from-browser only when a browser is set", () => {
    const base = { url: "https://youtu.be/x", outputTemplate: "/tmp/%(title)s.%(ext)s", previewBase: "/thumbs/p" };
    expect(buildArgs({ ...base, cookiesFromBrowser: "chrome" })).toContain("--cookies-from-browser");
    expect(buildArgs({ ...base, cookiesFromBrowser: null })).not.toContain("--cookies-from-browser");
  });
});

describe("Source capture (ADR-0009)", () => {
  const request = {
    url: "https://youtu.be/x",
    outputTemplate: "/lib/%(title)s.%(ext)s",
    previewBase: "/thumbs/source-pending-1",
    cookiesFromBrowser: null,
  };

  it("writes the preview image into the thumbnail store, not next to the video", () => {
    const args = buildArgs(request);
    expect(args).toContain("--write-thumbnail");
    expect(args).toContain("thumbnail:/thumbs/source-pending-1.%(ext)s");
  });

  it("keeps the tagged Source line and does not treat it as progress or title", () => {
    const state = { filepath: null as string | null, source: null as string | null };
    const titles: string[] = [];
    const events = { onProgress: () => {}, onTitle: (t: string) => void titles.push(t) };
    parseStdoutLine('clipmark-source:{"title": "[download] 50% off"}', events, state);
    parseStdoutLine("clipmark-file:/lib/a.mp4", events, state);
    expect(state).toEqual({ filepath: "/lib/a.mp4", source: '{"title": "[download] 50% off"}' });
    expect(titles).toEqual([]);
  });
});
