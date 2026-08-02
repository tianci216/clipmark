import { describe, expect, it } from "vitest";
import { mmssToSeconds, secondsToMmss } from "../server/src/time";

describe("MM:SS <-> seconds conversion", () => {
  it.each([
    ["00:00", 0],
    ["00:30", 30],
    ["01:44", 104],
    ["04:12", 252],
    ["05:55", 355],
    ["59:59", 3599],
  ])("parses %s as %d seconds", (text, seconds) => {
    expect(mmssToSeconds(text)).toBe(seconds);
  });

  it("accepts non-padded minutes and surrounding whitespace", () => {
    expect(mmssToSeconds(" 1:05 ")).toBe(65);
  });

  it.each(["", "5", "12:34:56", "01:6", "abc", "01:60"])(
    "rejects malformed time %j",
    (text) => {
      expect(() => mmssToSeconds(text)).toThrow();
    },
  );

  it.each([
    [0, "00:00"],
    [30, "00:30"],
    [65, "01:05"],
    [104, "01:44"],
    [3599, "59:59"],
  ])("formats %d seconds as %s", (seconds, text) => {
    expect(secondsToMmss(seconds)).toBe(text);
  });

  it("floors fractional seconds and clamps negatives", () => {
    expect(secondsToMmss(104.9)).toBe("01:44");
    expect(secondsToMmss(-5)).toBe("00:00");
  });

  it("round-trips", () => {
    for (let s = 0; s <= 3600; s += 37) {
      expect(mmssToSeconds(secondsToMmss(s))).toBe(s);
    }
  });
});
