import { describe, expect, it } from "vitest";
import { readFlag, writeFlag } from "../src/lib/storedFlag";

function memoryStorage(): Pick<Storage, "getItem" | "setItem"> {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

const throwing: Pick<Storage, "getItem" | "setItem"> = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
};

describe("stored flag", () => {
  it("round-trips through storage", () => {
    const s = memoryStorage();
    expect(readFlag("k", s)).toBe(false);
    writeFlag("k", true, s);
    expect(readFlag("k", s)).toBe(true);
    writeFlag("k", false, s);
    expect(readFlag("k", s)).toBe(false);
  });

  it("falls back to false when storage throws or is missing", () => {
    expect(readFlag("k", throwing)).toBe(false);
    expect(() => writeFlag("k", true, throwing)).not.toThrow();
    // The node test environment has no localStorage at all.
    expect(readFlag("k")).toBe(false);
    expect(() => writeFlag("k", true)).not.toThrow();
  });
});
