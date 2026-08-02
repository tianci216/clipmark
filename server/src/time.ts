const TIME_RE = /^(\d{1,2}):([0-5]\d)$/;

export function mmssToSeconds(value: string): number {
  const match = TIME_RE.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid MM:SS time: "${value}"`);
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

export function secondsToMmss(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}
