/**
 * The shared pill input's pure core: suggestion indexes, suggestions and the state transition
 * behind every keystroke. PillInput.tsx is only the React shell around this.
 *
 * A field is configured by pill kind (Dancer and Tag; folder next): each kind brings its
 * suggestion index, its normaliser and a label. `freeKind` is the kind typed text commits as.
 */

/** One entry in a suggestion index: a term and how many Clips use it. */
export interface Term {
  text: string;
  count: number;
}

export interface Pill<K extends string = string> {
  kind: K;
  text: string;
}

export interface Suggestion<K extends string = string> extends Pill<K> {
  count: number;
}

export interface PillKind {
  /** Shown beside a suggestion when the field accepts more than one kind. */
  label: string;
  index: Term[];
  /** Raw typed or picked text to the pill's text; "" means nothing to commit. */
  normalize: (raw: string) => string;
}

export interface PillConfig<K extends string = string> {
  kinds: Record<K, PillKind>;
  /** The kind that typed (not picked) text commits as, fixed or decided from the text. */
  freeKind: K | ((text: string) => K);
  /** Suggestions shown at most; 8 by default. */
  limit?: number;
}

const fold = (s: string) => s.toLowerCase();

/** A field of Tag pills over a suggestion index (the create form). */
export function tagField(index: Term[]): PillConfig<"tag"> {
  return { kinds: { tag: { label: "tag", index, normalize: normalizeTag } }, freeKind: "tag" };
}

/** A field of Dancer pills over a suggestion index (the create form, before Tags). */
export function dancerField(index: Term[]): PillConfig<"dancer"> {
  return { kinds: { dancer: { label: "dancer", index, normalize: normalizeDancer } }, freeKind: "dancer" };
}

/**
 * The top-bar search: Dancer, Tag and folder pills, suggested together and labelled by kind.
 * Typed text becomes a Dancer pill when it is part of a known Dancer's name, otherwise a Tag
 * pill; a folder pill only comes from a suggestion (or a card's folder name).
 */
export function searchField(dancers: Term[], tags: Term[], folders: Term[]): PillConfig<"dancer" | "tag" | "folder"> {
  return {
    kinds: {
      dancer: { label: "dancer", index: dancers, normalize: normalizeDancer },
      tag: { label: "tag", index: tags, normalize: normalizeTag },
      folder: { label: "folder", index: folders, normalize: (raw) => raw.trim() },
    },
    freeKind: (text) => {
      const q = fold(text.trim());
      return dancers.some((d) => fold(d.text).includes(q)) ? "dancer" : "tag";
    },
  };
}

/** A Dancer as the Store keeps it (ADR-0008): trimmed, spaces collapsed, capitalisation as typed. */
export function normalizeDancer(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/** A Tag as the Store keeps it (ADR-0008): trimmed, spaces collapsed, lowercase. */
export function normalizeTag(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * A suggestion index from each Clip's list of terms: counted once per Clip, case-insensitively,
 * shown in the most common spelling (the first seen on a tie). Most-used first, then A-Z.
 */
export function buildTermIndex(lists: string[][]): Term[] {
  const terms = new Map<string, { count: number; spellings: Map<string, number> }>();
  for (const list of lists) {
    const seen = new Set<string>();
    for (const raw of list) {
      const key = fold(raw);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const entry = terms.get(key) ?? { count: 0, spellings: new Map<string, number>() };
      entry.count++;
      entry.spellings.set(raw, (entry.spellings.get(raw) ?? 0) + 1);
      terms.set(key, entry);
    }
  }
  const out: Term[] = [];
  for (const { count, spellings } of terms.values()) {
    let text = "";
    let best = 0;
    for (const [spelling, n] of spellings) if (n > best) [text, best] = [spelling, n];
    out.push({ text, count });
  }
  return out.sort(byUse);
}

const byUse = (a: Term, b: Term) => b.count - a.count || a.text.localeCompare(b.text);

/**
 * Terms of every kind containing the query (case-insensitive), minus pills already chosen
 * of that kind, most-used first, at most `limit`.
 */
export function suggest<K extends string>(config: PillConfig<K>, query: string, chosen: Pill<K>[]): Suggestion<K>[] {
  const q = fold(query.trim());
  if (!q) return [];
  const out: Suggestion<K>[] = [];
  for (const kind of Object.keys(config.kinds) as K[]) {
    const taken = new Set(chosen.filter((p) => p.kind === kind).map((p) => fold(p.text)));
    for (const term of config.kinds[kind].index) {
      const key = fold(term.text);
      if (key.includes(q) && !taken.has(key)) out.push({ kind, text: term.text, count: term.count });
    }
  }
  return out.sort(byUse).slice(0, config.limit ?? 8);
}

/** Everything a pill field holds. `hi` is the highlighted suggestion, -1 for none. */
export interface PillState<K extends string = string> {
  pills: Pill<K>[];
  draft: string;
  open: boolean;
  hi: number;
}

export type PillEvent =
  | { type: "input"; text: string }
  | { type: "key"; key: string }
  | { type: "pick"; index: number }
  | { type: "hover"; index: number }
  | { type: "remove"; index: number }
  | { type: "focus" }
  | { type: "blur" };

export interface PillStep<K extends string = string> {
  state: PillState<K>;
  /** The event was consumed: the shell should preventDefault (and stop a key propagating). */
  handled: boolean;
}

function addPill<K extends string>(config: PillConfig<K>, pills: Pill<K>[], kind: K, raw: string): Pill<K>[] {
  const text = config.kinds[kind].normalize(raw);
  if (!text) return pills;
  const key = fold(text);
  if (pills.some((p) => p.kind === kind && fold(p.text) === key)) return pills;
  return [...pills, { kind, text }];
}

const freeKindOf = <K extends string>(config: PillConfig<K>, text: string): K =>
  typeof config.freeKind === "function" ? config.freeKind(text) : config.freeKind;

/** Text left in the field becomes a pill: what Save does before it reads the pills. */
export function commitDraft<K extends string>(config: PillConfig<K>, pills: Pill<K>[], draft: string): Pill<K>[] {
  return addPill(config, pills, freeKindOf(config, draft), draft);
}

/** The suggestions for a state's text, whether or not the list is open (arrows reopen it). */
export function suggestionsFor<K extends string>(config: PillConfig<K>, state: PillState<K>): Suggestion<K>[] {
  return suggest(config, state.draft, state.pills);
}

/**
 * One event against a pill field. Comma or Enter commits the typed text; Enter with a
 * highlighted suggestion picks it instead; Backspace on an empty field removes the last pill;
 * arrows move the highlight; Escape closes an open list. Anything else (Tab included) is not
 * handled and leaves the state as it was.
 */
export function pillStep<K extends string>(config: PillConfig<K>, state: PillState<K>, event: PillEvent): PillStep<K> {
  const done = (next: Partial<PillState<K>>): PillStep<K> => ({ state: { ...state, ...next }, handled: true });
  const pass: PillStep<K> = { state, handled: false };
  const committed = (pills: Pill<K>[]) => done({ pills, draft: "", open: false, hi: -1 });
  const sugg = () => suggestionsFor(config, state);

  switch (event.type) {
    case "input": {
      const parts = event.text.split(",");
      const draft = parts.pop() ?? "";
      let pills = state.pills;
      for (const part of parts) pills = commitDraft(config, pills, part);
      return done({ pills, draft, open: true, hi: -1 });
    }
    case "pick": {
      const s = sugg()[event.index];
      return s ? committed(addPill(config, state.pills, s.kind, s.text)) : pass;
    }
    case "hover":
      return done({ hi: event.index });
    case "remove":
      return done({ pills: state.pills.filter((_, i) => i !== event.index) });
    case "focus":
      return done({ open: true });
    case "blur":
      return done({ open: false, hi: -1 });
    case "key":
      break;
  }

  switch (event.key) {
    case ",":
      return committed(commitDraft(config, state.pills, state.draft));
    case "Enter": {
      const s = state.open && state.hi >= 0 ? sugg()[state.hi] : undefined;
      if (s) return committed(addPill(config, state.pills, s.kind, s.text));
      if (!state.draft.trim()) return pass;
      return committed(commitDraft(config, state.pills, state.draft));
    }
    case "Backspace":
      if (state.draft || state.pills.length === 0) return pass;
      return done({ pills: state.pills.slice(0, -1) });
    case "ArrowDown": {
      const n = sugg().length;
      if (!n) return pass;
      return done({ open: true, hi: state.open ? Math.min(state.hi + 1, n - 1) : 0 });
    }
    case "ArrowUp":
      if (!sugg().length) return pass;
      return done({ hi: Math.max(state.hi - 1, -1) });
    case "Escape":
      if (!state.open || !sugg().length) return pass;
      return done({ open: false, hi: -1 });
    default:
      return pass;
  }
}
