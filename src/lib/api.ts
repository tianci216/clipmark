export interface Video {
  hash: string;
  file: string;
  fileMtime: number | null;
  durationSeconds: number | null;
  thumbnail: string | null;
  clipCount: number;
  firstClipStart: number | null;
}

export interface Clip {
  id: number;
  videoHash: string;
  file: string;
  startSeconds: number;
  endSeconds: number;
  note: string;
  tags: string[];
}

interface TreeResponse {
  videos: Video[];
}

export async function fetchVideos(): Promise<Video[]> {
  const res = await fetch("/api/tree");
  if (!res.ok) throw new Error(`GET /api/tree failed: ${res.status}`);
  const body = (await res.json()) as TreeResponse;
  return body.videos;
}

export async function fetchClips(): Promise<Clip[]> {
  const res = await fetch("/api/clips");
  if (!res.ok) throw new Error(`GET /api/clips failed: ${res.status}`);
  return (await res.json()) as Clip[];
}
