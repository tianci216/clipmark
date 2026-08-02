export const DEFAULT_VIDEO_DIR = "/Users/tianci/Documents/Swing & Jazz";
export const HOST = "0.0.0.0";
export const PORT = 8899;

export function resolveVideoDir(argv: string[]): string {
  return argv[2] ?? DEFAULT_VIDEO_DIR;
}
