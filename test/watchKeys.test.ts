import { describe, expect, it } from "vitest";
import { watchKeyAction, type WatchKeyInput } from "../src/lib/watchKeys";

const base: WatchKeyInput = {
  key: "f",
  meta: false,
  ctrl: false,
  alt: false,
  typing: false,
  active: true,
  fullscreen: false,
  looping: false,
  editing: false,
};
const press = (over: Partial<WatchKeyInput>) => watchKeyAction({ ...base, ...over });

describe("watch page keys", () => {
  it("F toggles fullscreen, either case", () => {
    expect(press({ key: "f" })).toBe("fullscreen");
    expect(press({ key: "F" })).toBe("fullscreen");
  });

  it("F does nothing while typing in a text field", () => {
    expect(press({ key: "f", typing: true })).toBeNull();
  });

  it("F does nothing while the Clips page is hidden behind Music or Settings", () => {
    expect(press({ key: "f", active: false })).toBeNull();
  });

  it("F with a modifier is left to the browser (Cmd-F finds)", () => {
    expect(press({ key: "f", meta: true })).toBeNull();
    expect(press({ key: "f", ctrl: true })).toBeNull();
    expect(press({ key: "f", alt: true })).toBeNull();
  });

  it("F leaves fullscreen too, so the Loop survives the round trip", () => {
    expect(press({ key: "f", fullscreen: true, looping: true })).toBe("fullscreen");
  });

  it("Escape stops a Loop", () => {
    expect(press({ key: "Escape", looping: true })).toBe("stop-loop");
    expect(press({ key: "Escape", looping: true, typing: true })).toBe("stop-loop");
  });

  it("Escape with no Loop, in fullscreen, or while hidden is not ours", () => {
    expect(press({ key: "Escape", looping: false })).toBeNull();
    expect(press({ key: "Escape", looping: true, fullscreen: true })).toBeNull();
    expect(press({ key: "Escape", looping: true, active: false })).toBeNull();
  });

  it("other keys are ignored", () => {
    expect(press({ key: "g" })).toBeNull();
    expect(press({ key: " " , looping: true })).toBeNull();
  });
});

describe("Escape with the clip editor", () => {
  it("cancels an open edit first, even while a Loop runs or focus is in a field", () => {
    expect(press({ key: "Escape", editing: true })).toBe("cancel-edit");
    expect(press({ key: "Escape", editing: true, looping: true })).toBe("cancel-edit");
    expect(press({ key: "Escape", editing: true, typing: true })).toBe("cancel-edit");
  });

  it("only otherwise stops the Loop", () => {
    expect(press({ key: "Escape", editing: false, looping: true })).toBe("stop-loop");
  });

  it("leaves Escape to the browser in fullscreen or while the page is hidden", () => {
    expect(press({ key: "Escape", editing: true, fullscreen: true })).toBeNull();
    expect(press({ key: "Escape", editing: true, active: false })).toBeNull();
  });
});
