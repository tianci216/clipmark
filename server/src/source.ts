/**
 * A downloaded Video's Source (ADR-0009, CONTEXT.md): where it came from online.
 * yt-dlp prints it as one tagged JSON line after the move; the Download queue
 * saves it keyed by the landed file's Hash.
 */
export interface Source {
  /** The page the Video was downloaded from. */
  url: string;
  title: string;
  description: string;
  channel: string | null;
  /** ISO date (YYYY-MM-DD) the site gives as the upload date. */
  uploadDate: string | null;
  /** The site's own id for the video (yt-dlp `id`). */
  siteId: string;
  /** Local URL of the preview image in the thumbnail store, or null when none was saved. */
  preview: string | null;
}

/** The `--print` template: the fields yt-dlp knows the Source by, as one JSON object. */
export const SOURCE_PRINT_FIELDS = "webpage_url,title,description,channel,uploader,upload_date,id";

export type SourceParse = { ok: true; source: Omit<Source, "preview"> } | { ok: false; error: string };

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

/** yt-dlp's `upload_date` is YYYYMMDD. */
function isoDate(v: unknown): string | null {
  const m = typeof v === "string" ? /^(\d{4})(\d{2})(\d{2})$/.exec(v) : null;
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** Parses the JSON yt-dlp printed for the Source; page URL, title and site id are required. */
export function parseSourceJson(raw: string | null): SourceParse {
  if (raw === null || raw.trim() === "") return { ok: false, error: "yt-dlp printed no Source line" };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    return { ok: false, error: `Source line is not JSON (${(err as Error).message})` };
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { ok: false, error: "Source line is not a JSON object" };
  }
  const d = data as Record<string, unknown>;
  const url = str(d.webpage_url);
  const title = str(d.title);
  const siteId = str(d.id);
  if (!url || !title || !siteId) {
    return { ok: false, error: "Source line lacks webpage_url, title or id" };
  }
  return {
    ok: true,
    source: {
      url,
      title,
      description: typeof d.description === "string" ? d.description : "",
      channel: str(d.channel) ?? str(d.uploader),
      uploadDate: isoDate(d.upload_date),
      siteId,
    },
  };
}
