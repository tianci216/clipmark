import type { Clip } from "./api";

export interface TagEntry {
  tag: string;
  count: number;
}

export function buildTagIndex(clips: Clip[]): TagEntry[] {
  const counts = new Map<string, { tag: string; count: number }>();
  for (const clip of clips) {
    for (const tag of clip.tags) {
      const key = tag.toLowerCase();
      const entry = counts.get(key);
      if (entry) entry.count++;
      else counts.set(key, { tag, count: 1 });
    }
  }
  return [...counts.values()].sort(
    (a, b) => b.count - a.count || a.tag.localeCompare(b.tag),
  );
}

export function suggestTags(
  index: TagEntry[],
  query: string,
  exclude: string[] = [],
  limit = 8,
): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const excluded = new Set(exclude.map((t) => t.toLowerCase()));
  return index
    .filter((e) => e.tag.toLowerCase().includes(q) && !excluded.has(e.tag.toLowerCase()))
    .slice(0, limit)
    .map((e) => e.tag);
}

export function tagMatches(token: string, clipTags: string[]): boolean {
  return clipTags.some((t) => t.toLowerCase().includes(token.trim().toLowerCase()));
}

export function matchesTokens(tokens: string[], clipTags: string[]): boolean {
  return tokens.every((t) => tagMatches(t, clipTags));
}
