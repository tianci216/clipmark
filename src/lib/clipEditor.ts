import type { Clip, ClipInput } from "./api";
import { formatTime } from "./format";
import type { Pill, PillConfig } from "./pills";
import { commitDraft } from "./pills";
import type { Loop } from "./useVideoPlayer";

/**
 * The watch page's clip editor (ADR-0008): one panel that is New clip by default and turns
 * into Edit clip for a saved Clip. The New draft is kept while editing, so a half-made clip
 * survives; Save changes, Cancel and Escape all return to New clip without saving.
 */

/** IN or OUT: the text as shown or typed, and the seconds it stands for (null when invalid). */
export interface TimeField {
  text: string;
  seconds: number | null;
}

export interface Draft {
  in: TimeField;
  out: TimeField;
  dancers: Pill<"dancer">[];
  dancerDraft: string;
  tags: Pill<"tag">[];
  tagDraft: string;
  note: string;
}

export type EditorMode = { kind: "new" } | { kind: "edit"; clipId: number };

export interface EditorState {
  mode: EditorMode;
  newDraft: Draft;
  /** Prefilled from the Clip when Edit opens; null in New clip. */
  editDraft: Draft | null;
}

export type EditorEvent =
  /** Edit on a Clip row. */
  | { type: "edit"; clip: Clip }
  /** A field of the draft on screen changed. */
  | { type: "change"; patch: Partial<Draft> }
  /** Cancel or Escape while editing. */
  | { type: "cancel" }
  /** A New clip was saved: its draft resets, whatever the panel shows now. */
  | { type: "created" }
  /** Save changes finished for this Clip. */
  | { type: "updated"; clipId: number }
  /** This Clip was removed. */
  | { type: "removed"; clipId: number };

const EMPTY_TIME: TimeField = { text: "", seconds: null };

export const emptyDraft: Draft = {
  in: EMPTY_TIME,
  out: EMPTY_TIME,
  dancers: [],
  dancerDraft: "",
  tags: [],
  tagDraft: "",
  note: "",
};

export function initialEditor(): EditorState {
  return { mode: { kind: "new" }, newDraft: emptyDraft, editDraft: null };
}

const TIME_RE = /^(\d+):([0-5]\d)$/;

/** Seconds for a typed MM:SS (minutes may run past 99), or null. */
export function parseTime(text: string): number | null {
  const m = TIME_RE.exec(text.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function typedTime(text: string): TimeField {
  return { text, seconds: parseTime(text) };
}

/** Mark: the exact playhead, shown as MM:SS. */
export function markedTime(seconds: number): TimeField {
  return { text: formatTime(seconds), seconds };
}

export function draftFromClip(clip: Clip): Draft {
  return {
    in: markedTime(clip.startSeconds),
    out: markedTime(clip.endSeconds),
    dancers: clip.dancers.map((text) => ({ kind: "dancer", text })),
    dancerDraft: "",
    tags: clip.tags.map((text) => ({ kind: "tag", text })),
    tagDraft: "",
    note: clip.note,
  };
}

const toNew = (s: EditorState): EditorState => ({ ...s, mode: { kind: "new" }, editDraft: null });
const editing = (s: EditorState, clipId: number) => s.mode.kind === "edit" && s.mode.clipId === clipId;

export function editorStep(s: EditorState, e: EditorEvent): EditorState {
  switch (e.type) {
    case "edit":
      return { ...s, mode: { kind: "edit", clipId: e.clip.id }, editDraft: draftFromClip(e.clip) };
    case "change":
      return s.mode.kind === "edit" && s.editDraft
        ? { ...s, editDraft: { ...s.editDraft, ...e.patch } }
        : { ...s, newDraft: { ...s.newDraft, ...e.patch } };
    case "cancel":
      return toNew(s);
    case "created":
      return { ...s, newDraft: emptyDraft };
    case "updated":
    case "removed":
      return editing(s, e.clipId) ? toNew(s) : s;
  }
}

/** The draft the panel shows. */
export function activeDraft(s: EditorState): Draft {
  return s.mode.kind === "edit" && s.editDraft ? s.editDraft : s.newDraft;
}

/**
 * What Save sends: text left in the Dancers or Tags field becomes a pill first (the returned
 * draft shows it), times must both be valid and OUT after IN, the Note is trimmed.
 */
export function draftInput(
  d: Draft,
  dancerConfig: PillConfig<"dancer">,
  tagConfig: PillConfig<"tag">,
): { input: ClipInput; draft: Draft } | { error: string } {
  const start = d.in.seconds;
  const end = d.out.seconds;
  if (start === null || end === null) return { error: "Mark IN and OUT, or type them as MM:SS." };
  if (!(end > start)) return { error: "The clip has to end after it starts." };
  const dancers = commitDraft(dancerConfig, d.dancers, d.dancerDraft);
  const tags = commitDraft(tagConfig, d.tags, d.tagDraft);
  return {
    input: {
      startSeconds: start,
      endSeconds: end,
      note: d.note.trim(),
      dancers: dancers.map((p) => p.text),
      tags: tags.map((p) => p.text),
    },
    draft: { ...d, dancers, dancerDraft: "", tags, tagDraft: "" },
  };
}

/** Saving new times on the looping Clip moves the Loop to the new range; null leaves it. */
export function loopAfterSave(
  loop: Loop | null,
  before: Clip,
  after: { startSeconds: number; endSeconds: number },
): Loop | null {
  if (!loop || loop.start !== before.startSeconds || loop.end !== before.endSeconds) return null;
  if (after.startSeconds === before.startSeconds && after.endSeconds === before.endSeconds) return null;
  return { start: after.startSeconds, end: after.endSeconds };
}
