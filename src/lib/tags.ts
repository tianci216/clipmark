export function tagMatches(token: string, clipTags: string[]): boolean {
  return clipTags.some((t) => t.toLowerCase().includes(token.trim().toLowerCase()));
}

export function matchesTokens(tokens: string[], clipTags: string[]): boolean {
  return tokens.every((t) => tagMatches(t, clipTags));
}
