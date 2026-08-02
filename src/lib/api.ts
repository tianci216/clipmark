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

export function videoUrl(file: string): string {
  return "/video/" + file.split("/").map(encodeURIComponent).join("/");
}

export interface ClipInput {
  startSeconds: number;
  endSeconds: number;
  note: string;
  tags: string[];
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

export async function createClip(videoHash: string, input: ClipInput): Promise<Clip> {
  const res = await fetch("/api/clips", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ videoHash, ...input }),
  });
  if (!res.ok) {
    let message = `POST /api/clips failed: ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // keep the status message
    }
    throw new Error(message);
  }
  return (await res.json()) as Clip;
}

export async function deleteClip(id: number): Promise<void> {
  const res = await fetch(`/api/clips/${id}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) {
    throw new Error(`DELETE /api/clips/${id} failed: ${res.status}`);
  }
}
