import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { TOOL_CANDIDATE_DIRS, toolEnv } from "./toolEnv.js";
import type { Downloader, DownloadEvents, DownloadRequest, YtDlpStatus } from "./downloads.js";
import { SOURCE_PRINT_FIELDS } from "./source.js";

/**
 * The production `Downloader`: wraps the yt-dlp process. Resolved from the same
 * candidate directories the macOS shell uses for node, so the bundled app finds
 * the Homebrew binary without PATH.
 */

export const YT_DLP_CANDIDATE_DIRS = TOOL_CANDIDATE_DIRS;
/** @see toolEnv */
export const ytDlpEnv = toolEnv;

export function findYtDlp(dirs: string[] = YT_DLP_CANDIDATE_DIRS): string | null {
  for (const dir of dirs) {
    const candidate = path.join(dir, "yt-dlp");
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // try the next directory
    }
  }
  return null;
}


/** avc1 + mp4a when the site has them, else anything, forced into an mp4 container. */
const FORMAT = "bv*[vcodec^=avc1]+ba[acodec^=mp4a]/b[vcodec^=avc1][acodec^=mp4a]/bv*+ba/b";

/** Fixed public URL for the cookie test; simulate mode never downloads it. */
export const COOKIE_TEST_URL = "https://www.youtube.com/watch?v=jNQXAC9IVRw";

const STDERR_TAIL_LINES = 8;
const CANCEL_FORCE_MS = 10_000;

function tail(text: string, lines = STDERR_TAIL_LINES): string {
  return text.trim().split("\n").slice(-lines).join("\n");
}

export function buildArgs(request: DownloadRequest): string[] {
  const args = [
    "--no-playlist",
    "--newline",
    "--progress",
    "--no-simulate",
    "--print", `before_dl:${TITLE_TAG}%(title)s`,
    "--print", `after_move:${FILE_TAG}%(filepath)s`,
    // The Source (ADR-0009) as one JSON line; yt-dlp escapes newlines inside it.
    "--print", `after_move:${SOURCE_TAG}%(.{${SOURCE_PRINT_FIELDS}})j`,
    // The preview image goes to the app's thumbnail store, never the Library Folder.
    "--write-thumbnail",
    "--convert-thumbnails", "jpg",
    "-o", `thumbnail:${request.previewBase}.%(ext)s`,
    "-f", FORMAT,
    "--merge-output-format", "mp4",
    "--recode-video", "mp4",
    "-o", request.outputTemplate,
  ];
  if (request.cookiesFromBrowser) args.push("--cookies-from-browser", request.cookiesFromBrowser);
  args.push("--", request.url);
  return args;
}

const PROGRESS_RE = /^\[download\]\s+([\d.]+)%/;
/** Tags on the `--print` lines so a title that itself starts with "[" cannot be mistaken for anything else. */
const TITLE_TAG = "clipmark-title:";
const FILE_TAG = "clipmark-file:";
const SOURCE_TAG = "clipmark-source:";

/** Feeds yt-dlp's stdout lines to the events: progress %, the title, the final path and the Source. */
export function parseStdoutLine(
  line: string,
  events: Pick<DownloadEvents, "onProgress" | "onTitle">,
  state: { filepath: string | null; source: string | null },
): void {
  if (line.startsWith(SOURCE_TAG)) {
    state.source = line.slice(SOURCE_TAG.length).trim();
    return;
  }
  if (line.startsWith(TITLE_TAG)) {
    events.onTitle(line.slice(TITLE_TAG.length).trim());
    return;
  }
  if (line.startsWith(FILE_TAG)) {
    state.filepath = line.slice(FILE_TAG.length).trim();
    return;
  }
  const m = PROGRESS_RE.exec(line);
  if (m) events.onProgress(Number.parseFloat(m[1]));
}

export function createYtDlpDownloader(initialBinary: string | null = findYtDlp()): Downloader {
  let binary = initialBinary;
  let statusCache: Promise<YtDlpStatus | null> | null = null;
  return {
    start(request, events) {
      if (!binary) {
        queueMicrotask(() =>
          events.onExit({
            code: null,
            filepath: null,
            stderrTail: "yt-dlp not found — brew install yt-dlp",
            source: null,
          }),
        );
        return { cancel() {} };
      }
      const child = spawn(binary, buildArgs(request), { stdio: ["ignore", "pipe", "pipe"], env: ytDlpEnv() });
      const state = { filepath: null as string | null, source: null as string | null };
      let stderr = "";
      let stdoutBuf = "";
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdoutBuf += chunk;
        const lines = stdoutBuf.split(/\r?\n/);
        stdoutBuf = lines.pop() ?? "";
        for (const line of lines) parseStdoutLine(line, events, state);
      });
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        stderr = (stderr + chunk).slice(-8192);
      });
      child.on("error", (err) => {
        events.onExit({ code: null, filepath: null, stderrTail: err.message, source: null });
      });
      child.on("close", (code) => {
        if (stdoutBuf) parseStdoutLine(stdoutBuf, events, state);
        events.onExit({ code, filepath: state.filepath, stderrTail: tail(stderr), source: state.source });
      });
      return {
        cancel() {
          // SIGINT lets yt-dlp exit cleanly; if it is stuck (e.g. on a Keychain prompt), force it.
          child.kill("SIGINT");
          const force = setTimeout(() => child.kill("SIGKILL"), CANCEL_FORCE_MS);
          child.once("close", () => clearTimeout(force));
        },
      };
    },
    testCookies(browser) {
      return new Promise((resolve) => {
        if (!binary) {
          resolve({ ok: false, output: "yt-dlp not found — brew install yt-dlp" });
          return;
        }
        execFile(
          binary,
          ["--simulate", "--no-playlist", "--cookies-from-browser", browser, "--", COOKIE_TEST_URL],
          { timeout: 120_000, env: ytDlpEnv() },
          (err, _stdout, stderr) => {
            resolve(err ? { ok: false, output: tail(String(stderr) || err.message) } : { ok: true, output: "" });
          },
        );
      });
    },
    status() {
      // Only a found binary is cached: installing yt-dlp after launch shows up on the next Settings visit.
      if (!statusCache) {
        const found = binary ?? findYtDlp();
        if (!found) return Promise.resolve(null);
        binary = found;
        statusCache = new Promise((resolve) => {
          execFile(found, ["--version"], { timeout: 15_000, env: ytDlpEnv() }, (err, stdout) => {
            if (err) statusCache = null;
            resolve(err ? null : { path: found, version: String(stdout).trim() });
          });
        });
      }
      return statusCache;
    },
  };
}
