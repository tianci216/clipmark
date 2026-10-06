import { describe, expect, it } from "vitest";
import { clipLabel, dancerLabel } from "../src/lib/format";

describe("dancerLabel", () => {
  it("joins a pair with & and longer lists with commas", () => {
    expect(dancerLabel([])).toBe("");
    expect(dancerLabel(["Dax Hock"])).toBe("Dax Hock");
    expect(dancerLabel(["Dax Hock", "Sarah Breck"])).toBe("Dax Hock & Sarah Breck");
    expect(dancerLabel(["A", "B", "C"])).toBe("A, B, C");
  });
});

describe("clipLabel", () => {
  it("puts Dancers before Tags, and says untitled with neither", () => {
    expect(clipLabel({ dancers: ["Dax Hock", "Sarah Breck"], tags: ["swing out", "tuck"] })).toBe(
      "Dax Hock & Sarah Breck · swing out · tuck",
    );
    expect(clipLabel({ dancers: [], tags: ["tuck"] })).toBe("tuck");
    expect(clipLabel({ dancers: [], tags: [] })).toBe("untitled");
  });
});
