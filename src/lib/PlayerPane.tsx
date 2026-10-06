import { Fragment, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import type { Clip, ClipInput, Video } from "./api";
import { videoUrl } from "./api";
import { basename, dirname, displayName, folderLabel, formatTime, formatUploadDate, sourceHost } from "./format";
import type { Draft, TimeField } from "./clipEditor";
import { activeDraft, draftInput, editorStep, initialEditor, loopAfterSave, markedTime, typedTime } from "./clipEditor";
import { ClipName, PillInput, plainText } from "./PillInput";
import type { PillConfig } from "./pills";
import { buildTermIndex, dancerField, tagField } from "./pills";
import { railFor } from "./rail";
import { Strip, stripDuration } from "./Strip";
import type { VideoPlayer } from "./useVideoPlayer";
import { useVideoPlayer } from "./useVideoPlayer";
import { fullscreenElement, isTypingTarget, toggleFullscreen, watchKeyAction } from "./watchKeys";

/**
 * The watch page, two columns. Left: native video, clip strip (a Clip's bar Loops it), the
 * Loop hint and the video info. Right (about 420 px): the clip editor (New clip, or Edit clip
 * for a row's Edit), "Clips on this video" and "Same dancers or tags". Narrow widths stack
 * them: video, strip, hint, editor, Clips, related, info. Keys: Escape cancels an edit, else
 * stops the Loop without seeking; F toggles native fullscreen.
 * Mount it with a key of file + loop clip so the loop state machine restarts per target.
 */
export function PlayerPane({
  video,
  loopClip,
  orphan,
  videos,
  clips,
  onSave,
  onUpdate,
  onRemove,
  onOpen,
  active = true,
}: {
  video: Video;
  loopClip: Clip | null;
  orphan: boolean;
  videos: Video[];
  clips: Clip[];
  onSave: (video: Video, input: ClipInput) => Promise<void>;
  onUpdate: (clip: Clip, input: ClipInput) => Promise<Clip>;
  onRemove: (clip: Clip) => Promise<void>;
  onOpen: (video: Video, clip: Clip | null) => void;
  /** False while the page is hidden (behind Music or Settings): the video pauses, keys are off. */
  active?: boolean;
}) {
  const player = useVideoPlayer(
    loopClip ? { start: loopClip.startSeconds, end: loopClip.endSeconds } : null,
  );
  const { videoRef, stopLoop } = player;
  const looping = !!player.loop;
  useEffect(() => {
    if (!active) videoRef.current?.pause();
  }, [active, videoRef]);

  const { own, related } = useMemo(() => railFor(video, videos, clips), [video, videos, clips]);
  const [editor, dispatch] = useReducer(editorStep, undefined, initialEditor);
  const editId = editor.mode.kind === "edit" ? editor.mode.clipId : null;
  // A Clip that left this Video's list (removed elsewhere) ends its edit.
  const editingClip = editId === null ? null : (own.find((c) => c.id === editId) ?? null);
  const editing = editingClip !== null;
  useEffect(() => {
    if (editId !== null && !editing) dispatch({ type: "cancel" });
  }, [editId, editing]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = watchKeyAction({
        key: e.key,
        meta: e.metaKey,
        ctrl: e.ctrlKey,
        alt: e.altKey,
        typing: isTypingTarget(e.target),
        active,
        fullscreen: fullscreenElement() !== null,
        looping,
        editing,
      });
      if (action === "cancel-edit") dispatch({ type: "cancel" });
      else if (action === "stop-loop") stopLoop();
      else if (action === "fullscreen") {
        e.preventDefault();
        toggleFullscreen(videoRef.current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, looping, editing, stopLoop, videoRef]);

  // Opening an edit brings the panel into view, scrolling the watch page vertically only
  // (scrollIntoView would also shift the sliding track sideways).
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = panelRef.current;
    const sc = el?.closest(".cm-watch");
    if (editId === null || !el || !sc) return;
    const r = el.getBoundingClientRect();
    const sr = sc.getBoundingClientRect();
    if (r.top < sr.top || r.bottom > sr.bottom) sc.scrollBy({ top: r.top - sr.top - 12, behavior: "smooth" });
  }, [editId]);
  const tagConfig = useMemo(() => tagField(buildTermIndex(clips.map((c) => c.tags))), [clips]);
  const dancerConfig = useMemo(() => dancerField(buildTermIndex(clips.map((c) => c.dancers))), [clips]);
  const duration = player.duration > 0 ? player.duration : stripDuration(video.durationSeconds, own);

  return (
    <div className="cm-watch">
      <div className="cm-watch__grid">
        <div className="cm-watch__main">
          <div className="cm-frame">
            {orphan ? (
              <div className="cm-frame__missing">
                <span>∿</span>
                file missing on disk · {video.file}
              </div>
            ) : (
              <>
                <video
                  ref={player.videoRef}
                  className="cm-frame__video"
                  src={videoUrl(video.file)}
                  controls
                  playsInline
                  preload="auto"
                />
                <span className="cm-frame__time">{formatTime(player.currentTime)}</span>
              </>
            )}
          </div>

          <Strip
            className="cm-strip--player"
            duration={duration}
            clips={own}
            active={(c) => player.isLooping(c.startSeconds, c.endSeconds)}
            dim={looping}
            onClip={(c) => player.startLoop(c.startSeconds, c.endSeconds)}
            onSeek={player.seek}
            playhead={player.currentTime}
            loop={player.loop}
          />

          {/* Always holds its line; only the opacity changes, so nothing below jumps. */}
          <p className={"cm-loophint" + (looping ? " is-on" : "")} aria-hidden={!looping}>
            Press <kbd>Esc</kbd> to stop looping
          </p>
        </div>

        <aside className="cm-watch__side">
          <ClipEditor
            key={editingClip ? `edit-${editingClip.id}` : "new"}
            panelRef={panelRef}
            clip={editingClip}
            draft={editingClip ? activeDraft(editor) : editor.newDraft}
            onChange={(patch) => dispatch({ type: "change", patch })}
            player={player}
            dancerConfig={dancerConfig}
            tagConfig={tagConfig}
            onSave={async (input) => {
              if (!editingClip) {
                await onSave(video, input);
                dispatch({ type: "created" });
                return;
              }
              const updated = await onUpdate(editingClip, input);
              const loop = loopAfterSave(player.loop, editingClip, updated);
              if (loop) player.startLoop(loop.start, loop.end);
              dispatch({ type: "updated", clipId: editingClip.id });
            }}
            onCancel={() => dispatch({ type: "cancel" })}
            onRemove={async () => {
              if (!editingClip) return;
              await onRemove(editingClip);
              dispatch({ type: "removed", clipId: editingClip.id });
            }}
          />

          <section>
            <div className="cm-sec__head">
              <span className="cm-eyebrow">Clips on this video · {own.length}</span>
            </div>
            <div className="cm-clist">
              {own.map((c) => (
                <div
                  key={c.id}
                  className={
                    "cm-crow" +
                    (player.isLooping(c.startSeconds, c.endSeconds) ? " is-looping" : "") +
                    (c.id === editingClip?.id ? " is-editing" : "")
                  }
                >
                  <div className="cm-crow__t">
                    <button
                      type="button"
                      title="Loop this clip"
                      onClick={() => player.startLoop(c.startSeconds, c.endSeconds)}
                    >
                      {formatTime(c.startSeconds)}
                    </button>
                    <button
                      type="button"
                      title="Play from the end of this clip"
                      onClick={() => player.seekAndPlay(c.endSeconds)}
                    >
                      {formatTime(c.endSeconds)}
                    </button>
                  </div>
                  <div className="cm-crow__body">
                    <button
                      type="button"
                      className="cm-crow__name"
                      title="Loop this clip"
                      onClick={() => player.startLoop(c.startSeconds, c.endSeconds)}
                    >
                      <ClipName clip={c} />
                    </button>
                    {c.note && <div className="cm-crow__note">{c.note}</div>}
                  </div>
                  <div className="cm-crow__act">
                    {c.id === editingClip?.id ? (
                      <span className="cm-crow__editing">Editing ↑</span>
                    ) : (
                      <>
                        <button type="button" onClick={() => dispatch({ type: "edit", clip: c })}>
                          Edit
                        </button>
                        <button type="button" onClick={() => void onRemove(c)}>
                          Remove
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
              {own.length === 0 && (
                <div className="cm-none">No clips yet — mark IN and OUT to add one.</div>
              )}
            </div>
          </section>

          {related.length > 0 && (
            <section>
              <div className="cm-sec__head">
                <span className="cm-eyebrow">Same dancers or tags · {related.length}</span>
              </div>
              <div className="cm-nlist">
                {related.map(({ clip, video: rv }) => {
                  const d = stripDuration(rv.durationSeconds, [clip]);
                  return (
                    <button
                      key={`${rv.file}-${clip.id}`}
                      type="button"
                      className="cm-next"
                      onClick={() => onOpen(rv, clip)}
                    >
                      <span className="cm-next__thumb">
                        {rv.thumbnail ? (
                          <img src={rv.thumbnail} alt="" loading="lazy" />
                        ) : (
                          <span className="cm-card__nothumb" aria-hidden="true">
                            ∿
                          </span>
                        )}
                        <span className="cm-card__dur">
                          {formatTime(clip.startSeconds)}–{formatTime(clip.endSeconds)}
                        </span>
                        <span className="cm-card__strip" aria-hidden="true">
                          <i
                            style={{
                              left: `${(clip.startSeconds / d) * 100}%`,
                              width: `${((clip.endSeconds - clip.startSeconds) / d) * 100}%`,
                            }}
                          />
                        </span>
                      </span>
                      <span className="cm-next__body">
                        <span className="cm-next__name">
                          <ClipName clip={clip} />
                        </span>
                        <span className="cm-next__video">{displayName(rv)}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </aside>

        <WatchInfo video={video} />
      </div>
    </div>
  );
}

/**
 * The video info under the player: the Source panel (title, channel · upload date · page
 * link, description collapsed with MORE / LESS), or folder and file name for a local file.
 */
function WatchInfo({ video }: { video: Video }) {
  const [open, setOpen] = useState(false);
  // The toggle shows only when the collapsed description actually hides lines.
  const [clipped, setClipped] = useState(false);
  const descRef = useRef<HTMLParagraphElement>(null);
  const src = video.source;
  useLayoutEffect(() => {
    const el = descRef.current;
    if (!el || open) return;
    const measure = () => setClipped(el.scrollHeight > el.clientHeight + 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, src?.description]);
  if (!src) {
    return (
      <div className="cm-winfo">
        <h1 className="cm-winfo__title">{basename(video.file)}</h1>
        <div className="cm-winfo__meta">{folderLabel(dirname(video.file))}</div>
      </div>
    );
  }
  const meta = [src.channel, src.uploadDate ? formatUploadDate(src.uploadDate) : null].filter(
    (x): x is string => !!x,
  );
  return (
    <div className="cm-winfo">
      <h1 className="cm-winfo__title">{src.title}</h1>
      <div className="cm-winfo__meta">
        {meta.map((m) => (
          <Fragment key={m}>
            <span>{m}</span>
            <span aria-hidden="true">·</span>
          </Fragment>
        ))}
        {/* A new-window target; the shell routes it to the default browser. */}
        <a href={src.url} target="_blank" rel="noopener noreferrer">
          {sourceHost(src.url)} ↗
        </a>
      </div>
      {src.description.trim() !== "" && (
        <div className="cm-winfo__desc">
          <p ref={descRef} className={"cm-source__desc" + (open ? "" : " is-clamped")}>
            {src.description}
          </p>
          {(open || clipped) && (
            <button
              type="button"
              className="cm-source__more"
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
            >
              {open ? "Less ▴" : "More ▾"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** IN or OUT: a Mark button (the playhead) over a typable MM:SS field. */
function TimeMark({
  label,
  field,
  onField,
  playhead,
  onEnter,
}: {
  label: string;
  field: TimeField;
  onField: (f: TimeField) => void;
  playhead: number;
  onEnter: () => void;
}) {
  const bad = field.text.trim() !== "" && field.seconds === null;
  return (
    <div className={"cm-tmark" + (field.seconds !== null ? " is-set" : "") + (bad ? " is-bad" : "")}>
      <div className="cm-tmark__top">
        <small>{label}</small>
        <button
          type="button"
          className="cm-tmark__set"
          title={`Set ${label} to the playhead`}
          onClick={() => onField(markedTime(playhead))}
        >
          Mark
        </button>
      </div>
      <input
        value={field.text}
        placeholder="--:--"
        aria-label={`${label} time, MM:SS`}
        aria-invalid={bad}
        inputMode="numeric"
        {...plainText}
        spellCheck={false}
        onChange={(e) => onField(typedTime(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === "Enter") onEnter();
        }}
      />
    </div>
  );
}

/**
 * The one clip editor panel: New clip (Save clip, then it clears) or, given a Clip, Edit clip
 * (Remove clip, Cancel, Save changes). The draft lives in the page's editor state, so the
 * New draft survives an edit. No save on blur.
 */
function ClipEditor({
  panelRef,
  clip,
  draft,
  onChange,
  player,
  dancerConfig,
  tagConfig,
  onSave,
  onCancel,
  onRemove,
}: {
  panelRef: React.RefObject<HTMLElement>;
  clip: Clip | null;
  draft: Draft;
  onChange: (patch: Partial<Draft>) => void;
  player: VideoPlayer;
  dancerConfig: PillConfig<"dancer">;
  tagConfig: PillConfig<"tag">;
  onSave: (input: ClipInput) => Promise<void>;
  onCancel: () => void;
  onRemove: () => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const editing = clip !== null;

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (busy) return;
    const out = draftInput(draft, dancerConfig, tagConfig);
    if ("error" in out) {
      setError(out.error);
      return;
    }
    // Text still in the Dancers or Tags field became a pill; show it while saving.
    onChange(out.draft);
    void run(() => onSave(out.input));
  };

  return (
    <section
      ref={panelRef}
      className={"cm-panel cm-editor" + (editing ? " is-editing" : "")}
      aria-label={editing ? "Edit clip" : "New clip"}
    >
      <div className="cm-editor__head">
        <span className="cm-eyebrow">
          {editing ? (
            <>
              Editing clip · <b>{formatTime(clip.startSeconds)}</b>
            </>
          ) : (
            "New clip"
          )}
        </span>
        <span className="cm-deck__live cm-mono">live {formatTime(player.currentTime)}</span>
      </div>
      <div className="cm-tmarks">
        <TimeMark
          label="IN"
          field={draft.in}
          onField={(f) => onChange({ in: f })}
          playhead={player.currentTime}
          onEnter={save}
        />
        <span className="cm-deck__arrow">→</span>
        <TimeMark
          label="OUT"
          field={draft.out}
          onField={(f) => onChange({ out: f })}
          playhead={player.currentTime}
          onEnter={save}
        />
      </div>
      <div className="cm-editor__fields">
        <PillInput
          config={dancerConfig}
          pills={draft.dancers}
          onPills={(dancers) => onChange({ dancers })}
          draft={draft.dancerDraft}
          onDraft={(dancerDraft) => onChange({ dancerDraft })}
          placeholder="Dancers"
        />
        <PillInput
          config={tagConfig}
          pills={draft.tags}
          onPills={(tags) => onChange({ tags })}
          draft={draft.tagDraft}
          onDraft={(tagDraft) => onChange({ tagDraft })}
          placeholder="Tags"
        />
        <input
          className="cm-editor__note"
          value={draft.note}
          onChange={(e) => onChange({ note: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
          }}
          placeholder="Note"
          {...plainText}
        />
      </div>
      {error && <div className="cm-error">{error}</div>}
      {editing ? (
        <div className="cm-editor__act">
          <button type="button" className="cm-editor__rm" disabled={busy} onClick={() => void run(onRemove)}>
            Remove clip
          </button>
          <button type="button" className="cm-editor__cancel" onClick={onCancel}>
            Cancel <span className="cm-mono">esc</span>
          </button>
          <button type="button" className="cm-save" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      ) : (
        <button type="button" className="cm-save cm-editor__new" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save clip"}
        </button>
      )}
    </section>
  );
}
