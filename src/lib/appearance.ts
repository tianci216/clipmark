/**
 * Appearance: Font and Color are server settings (they hold across launches and
 * devices). They apply through <html data-font> / <html data-color>, which override
 * the theme tokens in styles.css. The last applied pair is also cached in browser
 * storage so the next launch paints in it before /api/settings answers.
 */
export type Font = "public-sans" | "sf-pro";
export type Color = "paper" | "ember";

export const FONTS: { value: Font; label: string }[] = [
  { value: "public-sans", label: "Public Sans" },
  { value: "sf-pro", label: "SF Pro" },
];

export const COLORS: { value: Color; label: string; swatch: [string, string] }[] = [
  { value: "paper", label: "Paper & rust", swatch: ["#f7f5f0", "#a6451f"] },
  { value: "ember", label: "Ember", swatch: ["#151412", "#e8844f"] },
];

export interface Appearance {
  font: Font;
  color: Color;
}

const CACHE_KEY = "clipmark.appearance";

export function applyAppearance({ font, color }: Appearance): void {
  const root = document.documentElement;
  root.dataset.font = font;
  root.dataset.color = color;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ font, color }));
  } catch {
    // Unavailable storage: the next launch paints in the default until settings load.
  }
}

/** First paint: the cached pair, if any (the server's value replaces it once loaded). */
export function applyCachedAppearance(): void {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null") as Partial<Appearance> | null;
    if (cached && FONTS.some((f) => f.value === cached.font)) document.documentElement.dataset.font = cached.font;
    if (cached && COLORS.some((c) => c.value === cached.color)) document.documentElement.dataset.color = cached.color;
  } catch {
    // No cache: defaults.
  }
}
