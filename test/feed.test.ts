import { describe, expect, it } from "vitest";
import {
  buildFeed,
  chipOn,
  folderTerms,
  noMatchText,
  searchChips,
  toggleChip,
  type FeedCard,
  type SearchPill,
} from "../src/lib/feed";
import type { Clip, Download, Video } from "../src/lib/api";

function video(hash: string, file: string, fileMtime: number | null, duration: number | null = 120): Video {
  return {
    hash,
    file,
    fileMtime,
    durationSeconds: duration,
    thumbnail: null,
    clipCount: 0,
    firstClipStart: null,
    source: null,
  };
}

function clip(id: number, videoHash: string, file: string, startSeconds: number, tags: string[], dancers: string[] = []): Clip {
  return { id, videoHash, file, startSeconds, endSeconds: startSeconds + 5, note: "", dancers, tags };
}

const tagPills = (...texts: string[]): SearchPill[] => texts.map((text) => ({ kind: "tag", text }));
const dancer = (text: string): SearchPill => ({ kind: "dancer", text });

function job(id: number, state: Download["state"], folder = "Classes"): Download {
  return { id, url: "https://x", folder, state, progress: 10, title: null, file: null, error: null, startedAt: null };
}

const files = (cards: FeedCard[]) =>
  cards.flatMap((c) => (c.kind === "video" ? [c.video.file] : [`download:${c.download.id}`]));

const swing = video("aaa", "Choreography/Sweet Vanilla/swing.mp4", 3000);
const lindy = video("bbb", "Classes/lindy.mp4", 1000);
const solo = video("ccc", "Practice recordings/solo.mov", 2000);

describe("buildFeed", () => {
  it("orders Video cards newest file first, across folders", () => {
    const feed = buildFeed([lindy, swing, solo], [], [], []);
    expect(files(feed.cards)).toEqual([swing.file, solo.file, lindy.file]);
  });

  it("breaks mtime ties by file and puts Videos without an mtime after dated ones", () => {
    const a = video("d1", "B/a.mp4", 500);
    const b = video("d2", "A/b.mp4", 500);
    const undated = video("d3", "A/undated.mp4", null);
    expect(files(buildFeed([undated, a, b], [], [], []).cards)).toEqual(["A/b.mp4", "B/a.mp4", "A/undated.mp4"]);
  });

  it("gives each card its Clips sorted by start then id, with the Clip count", () => {
    const cs = [
      clip(3, "bbb", lindy.file, 40, ["swingout"]),
      clip(1, "bbb", lindy.file, 10, ["kick"]),
      clip(2, "bbb", lindy.file, 10, ["kick"]),
    ];
    const [card] = buildFeed([lindy], cs, [], []).cards;
    expect(card.kind === "video" && card.clips.map((c) => c.id)).toEqual([1, 2, 3]);
    expect(card.kind === "video" && card.total).toBe(3);
  });

  it("shows a Video whose file went missing as a missing-file card after the files on disk", () => {
    const cs = [clip(9, "zzz", "Classes/gone.mp4", 3, ["lost"]), clip(10, "zzz", "Classes/gone.mp4", 9, ["lost"])];
    const feed = buildFeed([lindy, swing], cs, [], []);
    expect(files(feed.cards)).toEqual([swing.file, lindy.file, "Classes/gone.mp4"]);
    const missing = feed.cards[2];
    expect(missing.kind === "video" && missing.missing).toBe(true);
    expect(missing.kind === "video" && missing.video.hash).toBe("zzz");
    expect(missing.kind === "video" && missing.total).toBe(2);
    const onDisk = feed.cards[0];
    expect(onDisk.kind === "video" && onDisk.missing).toBe(false);
  });

  it("renders two files that share a Hash as two cards, each with the Clips", () => {
    const one = video("same", "Choreography/IMG_7521.mov", 20);
    const two = video("same", "Practice recordings/IMG_7521.mov", 10);
    const feed = buildFeed([one, two], [clip(1, "same", one.file, 2, ["x"])], [], []);
    expect(files(feed.cards)).toEqual([one.file, two.file]);
    for (const c of feed.cards) expect(c.kind === "video" && c.total).toBe(1);
  });

  describe("with a tag filter", () => {
    const cs = [
      clip(1, "aaa", swing.file, 10, ["Swingout", "frida"]),
      clip(2, "aaa", swing.file, 30, ["kick"]),
      clip(3, "bbb", lindy.file, 5, ["swing out"]),
      clip(4, "ccc", solo.file, 5, ["solo jazz"]),
      clip(5, "aaa", swing.file, 50, ["swingout"]),
      clip(6, "aaa", swing.file, 70, ["swingout"]),
      clip(7, "aaa", swing.file, 60, ["swingout"]),
    ];

    it("keeps only Videos with a matching Clip, matching AND across tokens by case-insensitive substring", () => {
      const feed = buildFeed([swing, lindy, solo], cs, tagPills("SWING", "fri"), []);
      expect(feed.filtering).toBe(true);
      expect(files(feed.cards)).toEqual([swing.file]);
    });

    it("counts matching of total Clips and lists the first three matches by start", () => {
      const [card] = buildFeed([swing], cs, tagPills("swingout"), []).cards;
      if (card.kind !== "video") throw new Error("expected a video card");
      expect(card.matching).toBe(4);
      expect(card.total).toBe(5);
      expect(card.firstMatches.map((c) => c.id)).toEqual([1, 5, 7]);
      expect([...card.matchIds].sort()).toEqual([1, 5, 6, 7]);
    });

    it("treats every Clip as matching when no filter is active", () => {
      const feed = buildFeed([swing], cs, [], []);
      const [card] = feed.cards;
      expect(feed.filtering).toBe(false);
      expect(card.kind === "video" && card.matching).toBe(5);
      expect(feed.empty).toBeNull();
    });

    it("is empty because of the filter when nothing matches", () => {
      const feed = buildFeed([swing, lindy], cs, tagPills("tango"), []);
      expect(feed.cards).toEqual([]);
      expect(feed.empty).toBe("filter");
    });
  });

  describe("with Dancer and Tag pills", () => {
    const cs = [
      clip(1, "aaa", swing.file, 10, ["swing out"], ["Dax Hock", "Sarah Breck"]),
      clip(2, "aaa", swing.file, 30, ["texas tommy"], ["Dax Hock"]),
      clip(3, "bbb", lindy.file, 5, ["dax hock routine"], []),
      clip(4, "ccc", solo.file, 5, ["swing out"], ["Naomi Uyama"]),
    ];
    const matched = (pills: SearchPill[]) =>
      buildFeed([swing, lindy, solo], cs, pills, []).cards.flatMap((c) => (c.kind === "video" ? [...c.matchIds] : [])).sort();

    it("matches a Dancer pill against Dancers only, by case-insensitive substring", () => {
      expect(matched([dancer("dax")])).toEqual([1, 2]);
      expect(matched([dancer("UYAMA")])).toEqual([4]);
    });

    it("matches a Tag pill against Tags only, never a Dancer's name", () => {
      expect(matched(tagPills("dax"))).toEqual([3]);
      expect(matched(tagPills("breck"))).toEqual([]);
    });

    it("needs every pill to match, across both kinds", () => {
      expect(matched([dancer("dax"), ...tagPills("swing")])).toEqual([1]);
      expect(matched([dancer("sarah"), dancer("dax hock")])).toEqual([1]);
      expect(matched([dancer("naomi"), ...tagPills("tommy")])).toEqual([]);
    });
  });

  describe("with a folder pill", () => {
    const nested = video("ddd", "Choreography/Sweet Vanilla/b-side.mp4", 2500);
    const parent = video("eee", "Choreography/intro.mp4", 2400);
    const root = video("fff", "loose.mp4", 2300);
    const twin = video("aaa", "Classes/swing copy.mp4", 900);
    const cs = [
      clip(1, "aaa", swing.file, 10, ["swing out"], ["Dax Hock"]),
      clip(2, "aaa", swing.file, 30, ["kick"]),
      clip(3, "bbb", lindy.file, 5, ["swing out"]),
      clip(4, "ddd", nested.file, 5, ["kick"]),
      clip(5, "eee", parent.file, 5, ["kick"]),
      clip(6, "fff", root.file, 5, ["kick"]),
    ];
    const all = [swing, lindy, nested, parent, root, twin];
    const folder = (text: string): SearchPill => ({ kind: "folder", text });

    it("keeps only Videos in exactly that folder, case-insensitively, with every Clip matching", () => {
      const feed = buildFeed(all, cs, [folder("choreography/sweet vanilla")], []);
      expect(files(feed.cards)).toEqual([swing.file, nested.file]);
      const [card] = feed.cards;
      expect(card.kind === "video" && [card.matching, card.total]).toEqual([2, 2]);
    });

    it("filters a shared Hash by the card's own file, not the Clip's", () => {
      expect(files(buildFeed(all, cs, [folder("Classes")], []).cards)).toEqual([lindy.file, twin.file]);
    });

    it("names the Library Folder itself as a folder", () => {
      expect(files(buildFeed(all, cs, [folder("Library Folder")], []).cards)).toEqual([root.file]);
    });

    it("combines with Dancer and Tag pills, every pill matching", () => {
      const feed = buildFeed(all, cs, [folder("Choreography/Sweet Vanilla"), ...tagPills("kick")], []);
      expect(files(feed.cards)).toEqual([swing.file, nested.file]);
      const [card] = feed.cards;
      expect(card.kind === "video" && [card.matching, card.total, [...card.matchIds]]).toEqual([1, 2, [2]]);
    });
  });

  it("is empty because of the library when there are no Videos and no Downloads", () => {
    expect(buildFeed([], [], [], []).empty).toBe("library");
  });
});

describe("buildFeed with Downloads", () => {
  it("puts Download cards first, in queue order, before the newest Video", () => {
    const feed = buildFeed([lindy, swing], [], [], [job(2, "queued"), job(1, "running", "")]);
    expect(files(feed.cards)).toEqual(["download:2", "download:1", swing.file, lindy.file]);
  });

  it("names each Download card's state: queued, downloading, failed, scanning once landed, cancelling", () => {
    const feed = buildFeed(
      [],
      [],
      [],
      [job(1, "queued"), job(2, "running"), job(3, "failed"), job(4, "done"), job(5, "cancelled")],
    );
    expect(feed.cards.map((c) => c.kind === "download" && [c.state, c.cancellable])).toEqual([
      ["queued", true],
      ["downloading", true],
      ["failed", false],
      ["scanning", false],
      ["cancelling", false],
    ]);
  });

  it("is not empty while only Downloads are showing", () => {
    expect(buildFeed([], [], [], [job(1, "queued")]).empty).toBeNull();
  });

  it("hides Download cards while a filter is active", () => {
    const cs = [clip(1, "bbb", lindy.file, 3, ["swing out"])];
    const feed = buildFeed([lindy], cs, tagPills("swing"), [job(1, "running")]);
    expect(files(feed.cards)).toEqual([lindy.file]);
    expect(buildFeed([lindy], cs, tagPills("tango"), [job(1, "running")]).empty).toBe("filter");
  });
});

describe("searchChips", () => {
  it("lists the most-used Dancers and Tags together, by Clip count then A-Z, at most 16", () => {
    const cs = [
      clip(1, "aaa", swing.file, 1, ["swing out", "kick"], ["Dax Hock"]),
      clip(2, "aaa", swing.file, 2, ["Swing Out"], ["dax hock", "Sarah Breck"]),
      clip(3, "aaa", swing.file, 3, ["swing out"], ["Dax Hock"]),
      clip(4, "aaa", swing.file, 4, ["kick"], []),
    ];
    expect(searchChips(cs)).toEqual([
      { kind: "dancer", text: "Dax Hock", count: 3 },
      { kind: "tag", text: "swing out", count: 3 },
      { kind: "tag", text: "kick", count: 2 },
      { kind: "dancer", text: "Sarah Breck", count: 1 },
    ]);
    const many = Array.from({ length: 20 }, (_, i) => clip(i, "aaa", swing.file, i, [`move ${String(i).padStart(2, "0")}`]));
    expect(searchChips(many).map((c) => c.text)).toEqual(
      Array.from({ length: 16 }, (_, i) => `move ${String(i).padStart(2, "0")}`),
    );
  });
});

describe("folderTerms", () => {
  it("counts the Clips on each folder's Videos, most first, skipping folders without Clips", () => {
    const twin = video("aaa", "Classes/swing copy.mp4", 900);
    const loose = video("fff", "loose.mp4", 800);
    const cs = [
      clip(1, "aaa", swing.file, 1, ["a"]),
      clip(2, "aaa", swing.file, 2, ["b"]),
      clip(3, "bbb", lindy.file, 3, ["c"]),
      clip(4, "zzz", "Gone/x.mp4", 3, ["d"]),
      clip(5, "fff", loose.file, 3, ["e"]),
    ];
    expect(folderTerms([swing, lindy, solo, twin, loose], cs)).toEqual([
      { text: "Classes", count: 3 },
      { text: "Choreography/Sweet Vanilla", count: 2 },
      { text: "Gone", count: 1 },
      { text: "Library Folder", count: 1 },
    ]);
  });
});

describe("toggleChip", () => {
  const chip = { kind: "dancer", text: "Dax Hock" } as const;

  it("adds a chip that is not in the search, after the pills already there", () => {
    expect(toggleChip(tagPills("kick"), chip)).toEqual([...tagPills("kick"), { kind: "dancer", text: "Dax Hock" }]);
  });

  it("removes a chip already in the search, ignoring case, and leaves other kinds alone", () => {
    const search: SearchPill[] = [dancer("dax hock"), ...tagPills("Dax Hock")];
    expect(toggleChip(search, chip)).toEqual(tagPills("Dax Hock"));
    expect(chipOn(search, chip)).toBe(true);
    expect(chipOn(tagPills("dax hock"), chip)).toBe(false);
  });
});

describe("noMatchText", () => {
  it("names every pill of the search", () => {
    expect(noMatchText([dancer("Dax Hock"), ...tagPills("kick"), { kind: "folder", text: "Classes" }])).toBe(
      "No clips match Dax Hock + kick + Classes",
    );
  });
});
