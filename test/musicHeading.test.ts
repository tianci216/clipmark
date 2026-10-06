import { describe, expect, it } from "vitest";
import { listHeading, type Track } from "../src/lib/musicApi";

function track(id: number, duration: number): Track {
  return { id, artist: "", title: "", album: "", genre: "", duration, bpm: null, key: "", filetype: "mp3" };
}

describe("listHeading", () => {
  it("names All tracks with the count and total minutes", () => {
    expect(listHeading({ type: "all" }, [track(1, 180), track(2, 200)])).toEqual({
      title: "All tracks",
      meta: "2 tracks · 6 min",
    });
  });

  it("prefixes a crate or playlist with its kind", () => {
    expect(listHeading({ type: "crate", id: 1, name: "Lindy" }, [track(1, 3000)])).toEqual({
      title: "Lindy",
      meta: "Crate · 1 track · 50 min",
    });
    expect(listHeading({ type: "playlist", id: 2, name: "Set 1" }, [])).toEqual({
      title: "Set 1",
      meta: "Playlist · 0 tracks · 0 min",
    });
  });

  it("rounds the total to the nearest minute and ignores tracks without a duration", () => {
    expect(listHeading({ type: "all" }, [track(1, 89), track(2, 0)]).meta).toBe("2 tracks · 1 min");
    expect(listHeading({ type: "all" }, [track(1, 91)]).meta).toBe("1 track · 2 min");
  });
});
