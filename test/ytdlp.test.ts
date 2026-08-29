import { describe, expect, it } from "vitest";
import { YT_DLP_CANDIDATE_DIRS, buildArgs, ytDlpEnv } from "../server/src/ytdlp.js";

describe("ytDlpEnv", () => {
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
    const base = { url: "https://youtu.be/x", outputTemplate: "/tmp/%(title)s.%(ext)s" };
    expect(buildArgs({ ...base, cookiesFromBrowser: "chrome" })).toContain("--cookies-from-browser");
    expect(buildArgs({ ...base, cookiesFromBrowser: null })).not.toContain("--cookies-from-browser");
  });
});
