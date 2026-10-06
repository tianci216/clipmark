import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Store } from "./store.js";

/**
 * The server-owned Library Folder (ADR-0005) and the address readback for Settings.
 * The folder lives in the `settings` table and is read per request, so a change
 * applies to the next scan / stream without a restart.
 */

export const LIBRARY_FOLDER_KEY = "library_folder";
export const LIBRARY_FOLDER_ENV = "CLIPMARK_VIDEO_DIR";
export const COOKIES_KEY = "cookies_from_browser";
export type CookiesFromBrowser = "none" | "chrome" | "safari" | "firefox";
export const COOKIE_BROWSERS: readonly CookiesFromBrowser[] = ["none", "chrome", "safari", "firefox"];
export const DEFAULT_COOKIES: CookiesFromBrowser = "chrome";

/** Browser yt-dlp reads cookies from; Chrome unless the user changed it. */
export function getCookiesFromBrowser(store: Store): CookiesFromBrowser {
  const value = store.getSetting(COOKIES_KEY);
  return isCookiesFromBrowser(value) ? value : DEFAULT_COOKIES;
}

export function setCookiesFromBrowser(store: Store, browser: CookiesFromBrowser): void {
  store.setSetting(COOKIES_KEY, browser);
}

export function isCookiesFromBrowser(input: unknown): input is CookiesFromBrowser {
  return typeof input === "string" && (COOKIE_BROWSERS as readonly string[]).includes(input);
}

/** Appearance (spec #17): saved server-side so it holds across launches and devices. */
export const FONT_KEY = "font";
export const COLOR_KEY = "color";
export const FONTS = ["public-sans", "sf-pro"] as const;
export const COLORS = ["paper", "ember"] as const;
export type Font = (typeof FONTS)[number];
export type Color = (typeof COLORS)[number];

export function isFont(input: unknown): input is Font {
  return typeof input === "string" && (FONTS as readonly string[]).includes(input);
}

export function isColor(input: unknown): input is Color {
  return typeof input === "string" && (COLORS as readonly string[]).includes(input);
}

export function getAppearance(store: Store): { font: Font; color: Color } {
  const font = store.getSetting(FONT_KEY);
  const color = store.getSetting(COLOR_KEY);
  return { font: isFont(font) ? font : FONTS[0], color: isColor(color) ? color : COLORS[0] };
}

export function setAppearance(store: Store, patch: { font?: Font; color?: Color }): void {
  if (patch.font) store.setSetting(FONT_KEY, patch.font);
  if (patch.color) store.setSetting(COLOR_KEY, patch.color);
}

export function getLibraryFolder(store: Store): string | null {
  return store.getSetting(LIBRARY_FOLDER_KEY);
}

/**
 * Saves the folder and runs the one-time ADR-0005 migration of pre-existing
 * folder-relative `videos.file` rows. The migration only fires when at least one
 * relative row actually resolves to a file under this folder — so typing a wrong
 * (but existing) folder first cannot prefix every legacy row with the wrong root.
 */
export function setLibraryFolder(store: Store, folder: string): void {
  store.setSetting(LIBRARY_FOLDER_KEY, folder);
  const relativeRows = store.getVideos().filter((v) => !path.isAbsolute(v.file));
  if (relativeRows.some((v) => fs.existsSync(path.join(folder, v.file)))) {
    store.absolutizeVideoPaths(folder);
  }
}

/**
 * First-run seed: only when no row exists and the env var names a real directory.
 * An invalid value is ignored (with a warning) so the app still opens on Settings.
 */
export function seedLibraryFolder(
  store: Store,
  env: Record<string, string | undefined>,
): void {
  if (getLibraryFolder(store) !== null) return;
  const fromEnv = env[LIBRARY_FOLDER_ENV];
  if (!fromEnv) return;
  const result = validateLibraryFolder(fromEnv);
  if (result.ok) setLibraryFolder(store, result.folder);
  else console.warn(`Ignoring ${LIBRARY_FOLDER_ENV}: ${result.error}`);
}

export type FolderValidation =
  | { ok: true; folder: string }
  | { ok: false; error: string };

export function validateLibraryFolder(input: unknown): FolderValidation {
  if (typeof input !== "string" || input.trim() === "") {
    return { ok: false, error: "Enter the absolute path of your Library Folder." };
  }
  const trimmed = input.trim();
  if (!path.isAbsolute(trimmed)) {
    return { ok: false, error: `Use an absolute path (starting with /), not "${trimmed}".` };
  }
  const folder = path.resolve(trimmed);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(folder);
  } catch {
    return { ok: false, error: `No folder found at ${folder}.` };
  }
  if (!stat.isDirectory()) {
    return { ok: false, error: `${folder} is a file, not a folder.` };
  }
  return { ok: true, folder };
}

/** True when `abs` is the folder itself or lies under it. */
export function isUnderFolder(folder: string, abs: string): boolean {
  const base = path.resolve(folder);
  const target = path.resolve(abs);
  return target === base || target.startsWith(base + path.sep);
}

/** Folder-relative form of an absolute path under the folder (what the API exposes). */
export function relativeToFolder(folder: string, abs: string): string {
  return path.relative(path.resolve(folder), path.resolve(abs)).split(path.sep).join("/");
}

export type NetworkInterfaces = () => NodeJS.Dict<os.NetworkInterfaceInfo[]>;

export interface Addresses {
  tailscaleIp: string | null;
  lanIp: string | null;
}

function ipv4Octets(address: string): number[] | null {
  const parts = address.split(".").map(Number);
  return parts.length === 4 && parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
    ? parts
    : null;
}

/** Tailscale hands out addresses from the CGNAT range 100.64.0.0/10. */
export function isTailscaleIp(address: string): boolean {
  const o = ipv4Octets(address);
  return !!o && o[0] === 100 && o[1] >= 64 && o[1] <= 127;
}

/** RFC 1918 private ranges — what a LAN hands out. */
export function isPrivateLanIp(address: string): boolean {
  const o = ipv4Octets(address);
  if (!o) return false;
  return (
    o[0] === 10 ||
    (o[0] === 172 && o[1] >= 16 && o[1] <= 31) ||
    (o[0] === 192 && o[1] === 168)
  );
}

export function deriveAddresses(interfaces: NetworkInterfaces): Addresses {
  const all = Object.values(interfaces())
    .flat()
    .filter((i): i is os.NetworkInterfaceInfo => !!i && !i.internal && i.family === "IPv4");
  const tailscale = all.find((i) => isTailscaleIp(i.address));
  const lan = all.find((i) => isPrivateLanIp(i.address));
  return { tailscaleIp: tailscale?.address ?? null, lanIp: lan?.address ?? null };
}
