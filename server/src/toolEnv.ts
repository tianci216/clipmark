/**
 * Environment for external tools the server spawns (yt-dlp, ffprobe, ffmpeg).
 *
 * The macOS shell inherits the bare GUI PATH (no /opt/homebrew/bin), so a tool
 * spawned by bare name is not found (ffmpeg ENOENT → "landed — scanning" forever)
 * and a tool that is found cannot locate its own helpers (yt-dlp → deno, giving
 * "n challenge solving failed"). Prepending the Homebrew/local dirs makes every
 * child behave exactly as it does from a terminal.
 */

export const TOOL_CANDIDATE_DIRS = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"];

export function toolEnv(
  base: NodeJS.ProcessEnv = process.env,
  dirs: string[] = TOOL_CANDIDATE_DIRS,
): NodeJS.ProcessEnv {
  const current = (base.PATH ?? "").split(":").filter(Boolean);
  const merged = [...dirs, ...current.filter((d) => !dirs.includes(d))];
  return { ...base, PATH: merged.join(":") };
}
