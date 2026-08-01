// PROTOTYPE — mock data mirroring annotations.yaml (seconds, per ADR-0004).
// In production this shape comes from /api/clips; here it is frozen in memory.
export type Clip = {
  id: number;
  start: number; // seconds
  end: number; // seconds
  tags: string[];
  note: string;
};

export type Video = {
  hash: string;
  name: string;
  path: string;
  duration: number; // seconds (fabricated for the prototype)
  clips: Clip[];
};

export type Folder = {
  name: string;
  videos: Video[];
  children: Folder[];
};

const MMSS = (t: string) => {
  const [m, s] = t.split(":").map(Number);
  return m * 60 + s;
};

function v(
  hash: string,
  file: string,
  duration: number,
  clips: Array<[string, string, string[], string]>
): Video {
  return {
    hash,
    name: file.split("/").pop()!,
    path: file,
    duration,
    clips: clips.map(([s, e, tags, note], i) => ({
      id: i,
      start: MMSS(s),
      end: MMSS(e),
      tags,
      note,
    })),
  };
}

export const TREE: Folder = {
  name: "Music and Dance Clips",
  videos: [],
  children: [
    {
      name: "Current (after 2010)",
      videos: [
        v("c5ac6603986d3888", "Savoy Cup 2022 - Open Strictly Final [5pIiAv_RtA8].mp4", 361, [
          ["01:44", "02:07", ["william pisani", "alice faraone", "combo", "charleston"], "Learn their combo"],
          ["04:12", "04:31", ["medard delphine", "george o neill", "air"], "Danlin wants to learn this air"],
          ["05:30", "05:40", ["frederic caputo", "fun"], "fun spin on the ground"],
        ]),
        v("46ed7e57a7969a4b", "CASTLE ROCK - Nils and Bianca Improvisation.mp4", 174, [
          ["00:27", "00:38", ["nils andren", "bianca locatelli", "slide"], "cool slide"],
        ]),
        v("e047cd21b44ec705", "Claudia Fonte & Maria Mallan - La Jam Barcelona 2024.mp4", 322, [
          ["00:18", "00:32", ["Claudia Fonte", "Maria Mallan", "circle variation"], "Cool circle"],
          ["00:42", "00:50", ["claudia fonte", "maria mallan", "swing out variation", "boogie back"], "swing out > boogie back, so damn cool"],
          ["00:06", "00:16", ["claudia fonte", "maria mallan", "tuck turn variation", "shorty george"], "tuck turn > shorty george"],
        ]),
        v("583afab2ff759d5c", "Felix & Diana -  MYB17.mp4", 248, [
          ["01:07", "01:11", ["felix", "diana", "swing out"], "swing out example"],
          ["01:47", "01:54", ["felix", "diana", "swing out"], "swing out example"],
          ["02:26", "02:30", ["felix", "diana", "swing out"], "swing out example"],
        ]),
        v("7906136745a2d3d0", "Lindy Hop Non Stop 2023_ Mix & Match Competition.mp4", 406, [
          ["05:55", "06:03", ["unknown dancers", "high kick", "charleston"], ""],
        ]),
        v("b9b77ad0db101385", "Lindylicious 2023 - Mix & Match.mp4", 384, [
          ["02:17", "02:23", ["unknown dancers", "swing out variation"], ""],
        ]),
        v("f251ebf1c3f48a49", "Rikard & Pamela -  MYB17.mp4", 247, [
          ["01:51", "01:57", ["Rikard Ekstrand", "Pamela Gaizutyte", "swing out"], "Good swing out example."],
          ["03:20", "03:32", ["rikard ekstrand", "pamela gaizutyte", "swing out"], "Good swing out example"],
        ]),
        v("8351a1fc8b271447", "Savoy Cup 2024 - Advanced Couple Routine - Pedro Vieira & Marta Chamosa.mp4", 512, [
          ["00:07", "00:35", ["Pedro Vieira", "Marta Chamosa", "solo combo", "flying charleston"], ""],
        ]),
        v("b3d4601515e38496", "Savoy Cup 2024 - All-Star M&M Final with Martín Burguez & His Rhythm Combo.mp4", 421, [
          ["01:29", "01:35", ["Florent Llamas", "Chloe Hong", "step touch variation"], "sugar push > step touch"],
          ["01:46", "01:56", ["Pontus Persson", "Jill Demuelenaere", "swing out", "taxes tommy"], "taxes tommy quick stop"],
          ["03:01", "03:08", ["Juan Villafane", "Sonia Ortega Betriu", "teapot variation"], "cool teapot variation"],
          ["04:27", "04:37", ["Hector Artal Parada", "Hyunjung Choi", "hacksaw variation"], "cool hacksaw exit"],
        ]),
        v("144be497f40d0a04", "The Battle Busan 2016 (TBB2016) 'Dax & Sarah_Social DEMO'.mp4", 299, [
          ["00:42", "00:47", ["Dax Hock", "Sarah Breck", "swing out"], "Google swing out example"],
          ["01:19", "01:24", ["dax hock", "sarah breck", "swing out"], "Good swing out example"],
        ]),
        v("fd907c8cdbe78fc4", "The Big Apple routine.mp4", 217, [
          ["00:03", "00:16", ["Yuyu", "Meti", "Big apple full break"], "Good big apple full break example"],
        ]),
        v("22a2b1ce115ee877", "Savoy Cup 2024 - Advanced Couple Routine - William Pisani & Alice Faraone [IZQPviFNJaY].mp4", 511, [
          ["01:03", "01:09", ["William Pisani", "Alice Faraone", "big apple full break"], "full break combo"],
        ]),
        v("f58ebaf236ff21b8", "ADVANCED STRICTLY FINALS - ILHC EUROPE 2025 [0VgkDNuIKn0].mp4", 388, [
          ["04:31", "05:13", ["Roser Ros", "Xavier Iborra Vicheto", "combo"], "Learn their combo"],
        ]),
        v("6e2b62ccd791ce8a", "SWINGALA 2025- Teachers show： Pamela & Tadas [wgjEuH4XzDs].mp4", 216, [
          ["00:21", "00:28", ["pamela", "tadas", "pop turn variation"], "pop turn leader also turn"],
          ["00:29", "00:40", ["pamela", "tadas", "charleston variation"], "the exit is cool"],
          ["00:44", "00:48", ["pamela", "tadas", "swing out variation"], "twist"],
          ["02:06", "02:11", ["pamela", "tadas", "swing out variation"], "swing out to drag"],
          ["02:32", "02:43", ["pamela", "tadas", "out-in variation"], "very cool ending"],
        ]),
        v("232da9c68202a39e", "Juan Villafane & Pamela Gaizutyte - The Royal Swing Fest [taltZk9A1Xk].mp4", 233, [
          ["01:23", "01:29", ["Juan Villafane", "Pamela Gaizutyte", "pop turn"], "8-count pop turn"],
        ]),
      ],
      children: [],
    },
  ],
};

// Flatten the tree for simple lookups.
export const ALL_VIDEOS: Video[] = (function collect(node: Folder, out: Video[]): Video[] {
  out.push(...node.videos);
  node.children.forEach((c) => collect(c, out));
  return out;
})(TREE, []);

export const formatTime = (seconds: number): string => {
  if (!isFinite(seconds) || seconds < 0) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

export const clipDuration = (c: Clip) => c.end - c.start;
// (kept for the rail/scrubber to show durations; currently unused by UI)

// Tag index, deduped case-insensitively, ranked by frequency then alphabetically.
const tagCounts = new Map<string, { tag: string; count: number }>();
for (const v of ALL_VIDEOS) {
  for (const c of v.clips) {
    for (const t of c.tags) {
      const key = t.toLowerCase();
      const entry = tagCounts.get(key);
      if (entry) entry.count++;
      else tagCounts.set(key, { tag: t, count: 1 });
    }
  }
}
export const TAG_INDEX: Array<{ tag: string; count: number }> = [...tagCounts.values()].sort(
  (a, b) => b.count - a.count || a.tag.localeCompare(b.tag)
);

// Substring, case-insensitive autocomplete suggestions for the tag filter.
export function suggestTags(query: string, exclude: string[] = []): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const excluded = new Set(exclude.map((t) => t.toLowerCase()));
  return TAG_INDEX.filter(
    (e) => e.tag.toLowerCase().includes(q) && !excluded.has(e.tag.toLowerCase())
  )
    .slice(0, 8)
    .map((e) => e.tag);
}

// A tag token matches a clip if it's a substring of any of the clip's tags
// (case-insensitive) — the app's established search semantics, per ADR-0004.
export const tagMatches = (token: string, clipTags: string[]): boolean =>
  clipTags.some((t) => t.toLowerCase().includes(token.trim().toLowerCase()));

export function matchesTokens(tokens: string[], clipTags: string[]): boolean {
  return tokens.every((t) => tagMatches(t, clipTags));
}
