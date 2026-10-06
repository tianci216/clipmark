import { describe, expect, it } from "vitest";
import type { Clip } from "../src/lib/api";
import {
  activeDraft,
  draftFromClip,
  draftInput,
  editorStep,
  emptyDraft,
  initialEditor,
  loopAfterSave,
  markedTime,
  parseTime,
  typedTime,
  type EditorState,
} from "../src/lib/clipEditor";
import { dancerField, tagField } from "../src/lib/pills";

const clip = (over: Partial<Clip> = {}): Clip => ({
  id: 7,
  videoHash: "h",
  file: "a.mp4",
  startSeconds: 65,
  endSeconds: 80.5,
  note: "nice",
  dancers: ["Dax Hock"],
  tags: ["swing out"],
  ...over,
});

const dancers = dancerField([]);
const tags = tagField([]);

describe("parseTime", () => {
  it("reads MM:SS, with one or more minute digits", () => {
    expect(parseTime("01:05")).toBe(65);
    expect(parseTime("1:05")).toBe(65);
    expect(parseTime(" 12:00 ")).toBe(720);
    expect(parseTime("125:30")).toBe(7530);
  });

  it("rejects anything else", () => {
    for (const bad of ["", "1:5", "1:60", "65", "ab:cd", "1:05:00", "-1:00"]) expect(parseTime(bad)).toBeNull();
  });
});

describe("time fields", () => {
  it("a typed entry keeps its text and is invalid when it does not parse", () => {
    expect(typedTime("1:05")).toEqual({ text: "1:05", seconds: 65 });
    expect(typedTime("1:7")).toEqual({ text: "1:7", seconds: null });
  });

  it("a Mark keeps the exact playhead and shows it as MM:SS", () => {
    expect(markedTime(65.4)).toEqual({ text: "01:05", seconds: 65.4 });
  });
});

describe("editor state", () => {
  const typeIn = (s: EditorState, text: string) => editorStep(s, { type: "change", patch: { in: typedTime(text) } });

  it("starts in New clip with an empty draft", () => {
    const s = initialEditor();
    expect(s.mode).toEqual({ kind: "new" });
    expect(activeDraft(s)).toEqual(emptyDraft);
  });

  it("Edit prefills the edit draft from the Clip, keeping exact times", () => {
    const s = editorStep(initialEditor(), { type: "edit", clip: clip() });
    expect(s.mode).toEqual({ kind: "edit", clipId: 7 });
    expect(activeDraft(s)).toEqual({
      in: { text: "01:05", seconds: 65 },
      out: { text: "01:20", seconds: 80.5 },
      dancers: [{ kind: "dancer", text: "Dax Hock" }],
      dancerDraft: "",
      tags: [{ kind: "tag", text: "swing out" }],
      tagDraft: "",
      note: "nice",
    });
    expect(draftFromClip(clip())).toEqual(activeDraft(s));
  });

  it("a half-filled New clip survives editing another Clip and cancelling", () => {
    let s = typeIn(initialEditor(), "00:10");
    s = editorStep(s, { type: "change", patch: { note: "half" } });
    s = editorStep(s, { type: "edit", clip: clip() });
    s = typeIn(s, "00:30");
    expect(activeDraft(s).in.text).toBe("00:30");
    s = editorStep(s, { type: "cancel" });
    expect(s.mode).toEqual({ kind: "new" });
    expect(activeDraft(s).in.text).toBe("00:10");
    expect(activeDraft(s).note).toBe("half");
  });

  it("saving an edit returns to New clip with the New draft untouched", () => {
    let s = typeIn(initialEditor(), "00:10");
    s = editorStep(s, { type: "edit", clip: clip() });
    s = editorStep(s, { type: "updated", clipId: 7 });
    expect(s.mode).toEqual({ kind: "new" });
    expect(activeDraft(s).in.text).toBe("00:10");
  });

  it("an update finishing for a Clip no longer being edited leaves the editor alone", () => {
    let s = editorStep(initialEditor(), { type: "edit", clip: clip({ id: 8 }) });
    s = editorStep(s, { type: "updated", clipId: 7 });
    expect(s.mode).toEqual({ kind: "edit", clipId: 8 });
  });

  it("removing the Clip being edited returns to New clip", () => {
    let s = editorStep(initialEditor(), { type: "edit", clip: clip() });
    s = editorStep(s, { type: "removed", clipId: 7 });
    expect(s.mode).toEqual({ kind: "new" });
  });

  it("saving a New clip resets the New draft, even if an edit has opened meanwhile", () => {
    let s = typeIn(initialEditor(), "00:10");
    expect(editorStep(s, { type: "created" })).toEqual(initialEditor());
    s = editorStep(s, { type: "edit", clip: clip() });
    s = editorStep(s, { type: "created" });
    expect(s.mode).toEqual({ kind: "edit", clipId: 7 });
    s = editorStep(s, { type: "cancel" });
    expect(activeDraft(s)).toEqual(emptyDraft);
  });

  it("Edit on another Clip while editing switches to it", () => {
    let s = editorStep(initialEditor(), { type: "edit", clip: clip() });
    s = typeIn(s, "00:01");
    s = editorStep(s, { type: "edit", clip: clip({ id: 9, startSeconds: 3 }) });
    expect(s.mode).toEqual({ kind: "edit", clipId: 9 });
    expect(activeDraft(s).in.text).toBe("00:03");
  });
});

describe("draftInput", () => {
  const draft = { ...emptyDraft, in: typedTime("00:10"), out: typedTime("00:20") };

  it("asks for both times", () => {
    expect(draftInput({ ...draft, out: typedTime("") }, dancers, tags)).toEqual({
      error: "Mark IN and OUT, or type them as MM:SS.",
    });
    expect(draftInput({ ...draft, in: typedTime("0:1") }, dancers, tags)).toEqual({
      error: "Mark IN and OUT, or type them as MM:SS.",
    });
  });

  it("refuses OUT not after IN with the server's message", () => {
    expect(draftInput({ ...draft, out: typedTime("00:10") }, dancers, tags)).toEqual({
      error: "The clip has to end after it starts.",
    });
  });

  it("commits text left in the Dancers and Tags fields and trims the Note", () => {
    const out = draftInput(
      { ...draft, dancers: [{ kind: "dancer", text: "Dax Hock" }], dancerDraft: "Sarah Breck", tagDraft: "Tuck", note: " hi " },
      dancers,
      tags,
    );
    expect(out).toEqual({
      input: { startSeconds: 10, endSeconds: 20, note: "hi", dancers: ["Dax Hock", "Sarah Breck"], tags: ["tuck"] },
      draft: {
        ...draft,
        dancers: [
          { kind: "dancer", text: "Dax Hock" },
          { kind: "dancer", text: "Sarah Breck" },
        ],
        dancerDraft: "",
        tags: [{ kind: "tag", text: "tuck" }],
        tagDraft: "",
        note: " hi ",
      },
    });
  });
});

describe("loopAfterSave", () => {
  const before = clip({ startSeconds: 10, endSeconds: 20 });

  it("snaps a Loop on the saved Clip to its new range", () => {
    expect(loopAfterSave({ start: 10, end: 20 }, before, { startSeconds: 12, endSeconds: 25 })).toEqual({
      start: 12,
      end: 25,
    });
  });

  it("leaves the Loop alone when it is on another range, off, or the times did not change", () => {
    expect(loopAfterSave({ start: 30, end: 40 }, before, { startSeconds: 12, endSeconds: 25 })).toBeNull();
    expect(loopAfterSave(null, before, { startSeconds: 12, endSeconds: 25 })).toBeNull();
    expect(loopAfterSave({ start: 10, end: 20 }, before, { startSeconds: 10, endSeconds: 20 })).toBeNull();
  });
});
