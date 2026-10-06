import { describe, expect, it } from "vitest";
import type { Source, Video } from "../src/lib/api";
import { cardMeta } from "../src/lib/feed";
import { displayName, formatUploadDate, sourceHost } from "../src/lib/format";

const SOURCE: Source = {
  url: "https://www.youtube.com/watch?v=abc123",
  title: "ILHC 2024 – Strictly Lindy Finals",
  description: "Six couples.",
  channel: "ILHC",
  uploadDate: "2024-08-26",
  siteId: "abc123",
  preview: "/thumbnails/source-aaa.jpg",
};

function video(file: string, source: Source | null): Video {
  return {
    hash: "aaa",
    file,
    fileMtime: 1,
    durationSeconds: 60,
    thumbnail: null,
    clipCount: 0,
    firstClipStart: null,
    source,
  };
}

describe("Video display name", () => {
  it("is the Source title, falling back to the file name without extension", () => {
    expect(displayName(video("ILHC/ILHC 2024 [abc123].mp4", SOURCE))).toBe("ILHC 2024 – Strictly Lindy Finals");
    expect(displayName(video("Practice/class recap.mov", null))).toBe("class recap");
  });
});

describe("Source labels", () => {
  it("formats the upload date as day, short month, year", () => {
    expect(formatUploadDate("2024-08-26")).toBe("26 Aug 2024");
    expect(formatUploadDate("2005-01-04")).toBe("4 Jan 2005");
  });

  it("names the page link by its host, without www", () => {
    expect(sourceHost("https://www.youtube.com/watch?v=abc123")).toBe("youtube.com");
    expect(sourceHost("https://vimeo.com/1")).toBe("vimeo.com");
    expect(sourceHost("not a url")).toBe("link");
  });
});

describe("cardMeta", () => {
  it("leads with the channel, and dates a Video with a Source", () => {
    expect(cardMeta(video("ILHC/a.mp4", SOURCE))).toEqual({ place: "ILHC · ILHC", origin: "26 Aug 2024" });
  });

  it("marks a Video without a Source as a local file, in the top-level folder", () => {
    expect(cardMeta(video("a.mp4", null))).toEqual({ place: "Library Folder", origin: "local file" });
  });

  it("drops what the Source does not give", () => {
    expect(cardMeta(video("A/a.mp4", { ...SOURCE, channel: null, uploadDate: null }))).toEqual({
      place: "A",
      origin: null,
    });
  });
});
