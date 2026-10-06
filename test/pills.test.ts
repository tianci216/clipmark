import { describe, expect, it } from "vitest";
import {
  buildTermIndex,
  commitDraft,
  dancerField,
  normalizeDancer,
  normalizeTag,
  searchField,
  pillStep,
  suggest,
  type Pill,
  type PillConfig,
  type PillEvent,
  type PillState,
} from "../src/lib/pills";

const tagsOnly = (lists: string[][]): PillConfig<"tag"> => ({
  kinds: { tag: { label: "tag", index: buildTermIndex(lists), normalize: normalizeTag } },
  freeKind: "tag",
});

describe("buildTermIndex", () => {
  it("counts each term once per Clip, case-insensitively, most-used first then alphabetical", () => {
    const index = buildTermIndex([["kick", "tuck"], ["tuck"], ["swing out", "Tuck"], ["anchor"]]);
    expect(index).toEqual([
      { text: "tuck", count: 3 },
      { text: "anchor", count: 1 },
      { text: "kick", count: 1 },
      { text: "swing out", count: 1 },
    ]);
  });

  it("shows the most common spelling of a term, the first one seen on a tie", () => {
    const index = buildTermIndex([["dax hock"], ["Dax Hock"], ["Dax Hock"], ["Alice"], ["alice"]]);
    expect(index).toEqual([
      { text: "Dax Hock", count: 3 },
      { text: "Alice", count: 2 },
    ]);
  });
});

describe("suggest", () => {
  it("matches the query anywhere in the term, ignoring case", () => {
    const config = tagsOnly([["dax hock"], ["hockey stop"], ["swing out"]]);
    expect(suggest(config, "HOCK", []).map((s) => s.text)).toEqual(["dax hock", "hockey stop"]);
  });

  it("orders by use and returns at most 8", () => {
    const lists: string[][] = [];
    for (let i = 1; i <= 10; i++) for (let n = 0; n < i; n++) lists.push([`move ${i}`]);
    const out = suggest(tagsOnly(lists), "move", []);
    expect(out.map((s) => s.text)).toEqual([
      "move 10",
      "move 9",
      "move 8",
      "move 7",
      "move 6",
      "move 5",
      "move 4",
      "move 3",
    ]);
    expect(out[0]).toEqual({ kind: "tag", text: "move 10", count: 10 });
  });

  it("leaves out pills already chosen, ignoring case", () => {
    const config = tagsOnly([["swing out"], ["swing out"], ["swingout"]]);
    expect(suggest(config, "swing", [{ kind: "tag", text: "Swing Out" }]).map((s) => s.text)).toEqual([
      "swingout",
    ]);
  });

  it("suggests nothing for an empty or blank query", () => {
    const config = tagsOnly([["kick"]]);
    expect(suggest(config, "", [])).toEqual([]);
    expect(suggest(config, "   ", [])).toEqual([]);
  });

  it("merges several kinds by use, labelled by kind, excluding chosen pills only of the same kind", () => {
    const config: PillConfig<"dancer" | "tag"> = {
      kinds: {
        dancer: { label: "dancer", index: buildTermIndex([["Dax Hock"], ["Dax Hock"], ["Ann"]]), normalize: (s) => s.trim() },
        tag: { label: "tag", index: buildTermIndex([["anchor"], ["anchor"], ["anchor"], ["dax hock"]]), normalize: normalizeTag },
      },
      freeKind: "tag",
    };
    expect(suggest(config, "a", [{ kind: "tag", text: "dax hock" }])).toEqual([
      { kind: "tag", text: "anchor", count: 3 },
      { kind: "dancer", text: "Dax Hock", count: 2 },
      { kind: "dancer", text: "Ann", count: 1 },
    ]);
  });
});

describe("pillStep", () => {
  const config = tagsOnly([["swing out"], ["swing out"], ["swingout"], ["tuck"]]);
  const tag = (text: string): Pill<"tag"> => ({ kind: "tag", text });
  const at = (draft: string, pills: Pill<"tag">[] = [], open = true, hi = -1): PillState<"tag"> => ({ pills, draft, open, hi });
  const key = (k: string): PillEvent => ({ type: "key", key: k });
  const run = (state: PillState<"tag">, ...events: PillEvent[]) => {
    let handled = false;
    for (const e of events) ({ state, handled } = pillStep(config, state, e));
    return { state, handled };
  };

  it("commits the typed text, normalised, on comma and on Enter", () => {
    expect(run(at(" Swing  Out"), key(","))).toEqual({ state: at("", [tag("swing out")], false), handled: true });
    expect(run(at("Kick", [tag("tuck")]), key("Enter"))).toEqual({
      state: at("", [tag("tuck"), tag("kick")], false),
      handled: true,
    });
  });

  it("does not add a pill twice, ignoring case, and commits nothing for blank text", () => {
    expect(run(at("TUCK", [tag("tuck")]), key(",")).state.pills).toEqual([tag("tuck")]);
    expect(run(at("   "), key(",")).state).toEqual(at("", [], false));
  });

  it("lets Enter on an empty field through", () => {
    expect(run(at(""), key("Enter"))).toEqual({ state: at(""), handled: false });
  });

  it("removes the last pill on Backspace in an empty field, and leaves Backspace alone otherwise", () => {
    expect(run(at("", [tag("a"), tag("b")]), key("Backspace"))).toEqual({ state: at("", [tag("a")]), handled: true });
    expect(run(at("sw", [tag("a")]), key("Backspace")).handled).toBe(false);
    expect(run(at(""), key("Backspace")).handled).toBe(false);
  });

  it("walks the suggestions with the arrows, clamped, and Enter picks the highlighted one", () => {
    // "swing" suggests swing out (2), swingout (1)
    expect(run(at("swing"), key("ArrowDown")).state.hi).toBe(0);
    expect(run(at("swing"), key("ArrowDown"), key("ArrowDown"), key("ArrowDown")).state.hi).toBe(1);
    expect(run(at("swing"), key("ArrowDown"), key("ArrowUp"), key("ArrowUp")).state.hi).toBe(-1);
    expect(run(at("swing"), key("ArrowDown"), key("ArrowDown"), key("Enter")).state).toEqual(
      at("", [tag("swingout")], false),
    );
  });

  it("commits exactly what was typed when Enter has no highlight, even with suggestions showing", () => {
    expect(run(at("swing"), key("Enter")).state.pills).toEqual([tag("swing")]);
  });

  it("opens a closed list on ArrowDown, and ignores arrows with nothing to suggest", () => {
    expect(run(at("swing", [], false), key("ArrowDown")).state).toEqual(at("swing", [], true, 0));
    expect(run(at("zzz"), key("ArrowDown"))).toEqual({ state: at("zzz"), handled: false });
  });

  it("closes the list on Escape, keeping the text, and lets Escape through when there is no list", () => {
    expect(run(at("swing", [], true, 1), key("Escape"))).toEqual({ state: at("swing", [], false), handled: true });
    expect(run(at("swing", [], false), key("Escape")).handled).toBe(false);
    expect(run(at("zzz"), key("Escape")).handled).toBe(false);
  });

  it("leaves Tab untouched", () => {
    const state = at("swing", [], true, 0);
    expect(run(state, key("Tab"))).toEqual({ state, handled: false });
  });

  it("opens the list and clears the highlight as the text changes", () => {
    expect(run(at("sw", [], false, 1), { type: "input", text: "swi" }).state).toEqual(at("swi", [], true, -1));
  });

  it("commits each comma-separated part of pasted text, keeping the last part as text", () => {
    expect(run(at(""), { type: "input", text: "Kick, Tuck,swing" }).state).toEqual(
      at("swing", [tag("kick"), tag("tuck")], true),
    );
  });

  it("picks a suggestion by index, and removes a pill by index", () => {
    expect(run(at("swing"), { type: "pick", index: 1 }).state).toEqual(at("", [tag("swingout")], false));
    expect(run(at("", [tag("a"), tag("b"), tag("c")]), { type: "remove", index: 1 }).state.pills).toEqual([
      tag("a"),
      tag("c"),
    ]);
  });

  it("highlights on hover, opens on focus and closes on blur", () => {
    expect(run(at("swing"), { type: "hover", index: 1 }).state.hi).toBe(1);
    expect(run(at("swing", [], false), { type: "focus" }).state.open).toBe(true);
    expect(run(at("swing", [], true, 1), { type: "blur" }).state).toEqual(at("swing", [], false));
  });
});

describe("commitDraft", () => {
  const config = tagsOnly([]);
  it("adds text left in the field as a pill, for Save", () => {
    expect(commitDraft(config, [{ kind: "tag", text: "tuck" }], " Swing Out ")).toEqual([
      { kind: "tag", text: "tuck" },
      { kind: "tag", text: "swing out" },
    ]);
  });

  it("returns the pills unchanged for blank or duplicate text", () => {
    const pills = [{ kind: "tag" as const, text: "tuck" }];
    expect(commitDraft(config, pills, "  ")).toBe(pills);
    expect(commitDraft(config, pills, "Tuck")).toBe(pills);
  });
});

describe("Dancer fields", () => {
  it("keep a Dancer's capitalisation, trimming and collapsing spaces only", () => {
    expect(normalizeDancer("  Remy   Kouakou\tKouame ")).toBe("Remy Kouakou Kouame");
    expect(normalizeDancer("deVries")).toBe("deVries");
  });

  it("commit typed names as Dancer pills, deduplicated ignoring case", () => {
    const config = dancerField(buildTermIndex([["Dax Hock"]]));
    const pills = commitDraft(config, [{ kind: "dancer", text: "Dax Hock" }], " dax  hock ");
    expect(pills).toEqual([{ kind: "dancer", text: "Dax Hock" }]);
    expect(commitDraft(config, pills, "Sarah Breck")).toEqual([
      { kind: "dancer", text: "Dax Hock" },
      { kind: "dancer", text: "Sarah Breck" },
    ]);
  });
});

describe("searchField", () => {
  const config = searchField(
    buildTermIndex([["Dax Hock", "Sarah Breck"], ["Dax Hock"]]),
    buildTermIndex([["swing out"], ["dax routine"]]),
  );

  it("suggests Dancers and Tags together, labelled by kind", () => {
    expect(suggest(config, "dax", [])).toEqual([
      { kind: "dancer", text: "Dax Hock", count: 2 },
      { kind: "tag", text: "dax routine", count: 1 },
    ]);
    expect(config.kinds.dancer.label).toBe("dancer");
    expect(config.kinds.tag.label).toBe("tag");
  });

  it("commits typed text as a Dancer when it is part of a known Dancer's name, else as a Tag", () => {
    expect(commitDraft(config, [], "Breck")).toEqual([{ kind: "dancer", text: "Breck" }]);
    expect(commitDraft(config, [], "Swing")).toEqual([{ kind: "tag", text: "swing" }]);
  });
});
