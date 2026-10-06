import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Clip, ClipInput, Video } from "./api";
import { videoUrl } from "./api";
import { basename, dirname, displayName, folderLabel, formatTime, formatUploadDate, sourceHost } from "./format";
import { ClipName, PillInput, plainText } from "./PillInput";
import type { Pill, PillConfig } from "./pills";
import { buildTermIndex, commitDraft, dancerField, tagField } from "./pills";
import { railFor } from "./rail";
import { Strip, stripDuration } from "./Strip";
import type { VideoPlayer } from "./useVideoPlayer";
import { useVideoPlayer } from "./useVideoPlayer";
import { fullscreenElement, isTypingTarget, toggleFullscreen, watchKeyAction } from "./watchKeys";

/**
 * The watch page, two columns. Left: native video, clip strip (a Clip's bar Loops it), the
 * Loop hint and the video info. Right (about 420 px): the mark deck, "Clips on this video"
 * and "Same dancers or tags". Narrow widths stack them: video, strip, hint, deck, Clips,
 * related, info. Keys: Escape stops the Loop without seeking; F toggles native fullscreen.
 * Mount it with a key of file + loop clip so the loop state machine restarts per target.
 */
export function PlayerPane({
  video,
  loopClip,
  orphan,
  videos,
  clips,
  onSave,
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
      });
      if (action === "stop-loop") stopLoop();
      else if (action === "fullscreen") {
        e.preventDefault();
        toggleFullscreen(videoRef.current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, looping, stopLoop, videoRef]);

  const { own, related } = useMemo(() => railFor(video, videos, clips), [video, videos, clips]);
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
          <section className="cm-panel">
            <div className="cm-eyebrow">New clip</div>
            <MarkDeck
              player={player}
              dancerConfig={dancerConfig}
              tagConfig={tagConfig}
              onSave={(input) => onSave(video, input)}
            />
          </section>

          <section>
            <div className="cm-sec__head">
              <span className="cm-eyebrow">Clips on this video · {own.length}</span>
            </div>
            <div className="cm-clist">
              {own.map((c) => (
                <div
                  key={c.id}
                  className={
                    "cm-crow" + (player.isLooping(c.startSeconds, c.endSeconds) ? " is-looping" : "")
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
                    <button type="button" onClick={() => void onRemove(c)}>
                      Remove
                    </button>
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

function MarkDeck({
  player,
  dancerConfig,
  tagConfig,
  onSave,
}: {
  player: VideoPlayer;
  dancerConfig: PillConfig<"dancer">;
  tagConfig: PillConfig<"tag">;
  onSave: (input: ClipInput) => Promise<void>;
}) {
  const [mark, setMark] = useState<{ s: number | null; e: number | null }>({ s: null, e: null });
  const [dancers, setDancers] = useState<Pill<"dancer">[]>([]);
  const [dancerDraft, setDancerDraft] = useState("");
  const [tags, setTags] = useState<Pill<"tag">[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (mark.s === null || mark.e === null) {
      setError("Mark both IN and OUT before saving.");
      return;
    }
    if (mark.e <= mark.s) {
      setError("The clip has to end after it starts.");
      return;
    }
    // Text still in the Dancers or Tags field counts: it becomes a pill before saving.
    const allDancers = commitDraft(dancerConfig, dancers, dancerDraft);
    const allTags = commitDraft(tagConfig, tags, tagDraft);
    setDancers(allDancers);
    setDancerDraft("");
    setTags(allTags);
    setTagDraft("");
    setSaving(true);
    setError("");
    try {
      await onSave({
        startSeconds: mark.s,
        endSeconds: mark.e,
        note: note.trim(),
        dancers: allDancers.map((p) => p.text),
        tags: allTags.map((p) => p.text),
      });
      setMark({ s: null, e: null });
      setDancers([]);
      setTags([]);
      setNote("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="cm-deck">
      <div className="cm-deck__marks">
        <button
          type="button"
          className={"cm-mark" + (mark.s != null ? " is-set" : "")}
          onClick={() => setMark({ ...mark, s: player.currentTime })}
        >
          <small>IN</small>
          {formatTime(mark.s)}
        </button>
        <span className="cm-deck__arrow">→</span>
        <button
          type="button"
          className={"cm-mark" + (mark.e != null ? " is-set" : "")}
          onClick={() => setMark({ ...mark, e: player.currentTime })}
        >
          <small>OUT</small>
          {formatTime(mark.e)}
        </button>
        <span className="cm-deck__live cm-mono">live {formatTime(player.currentTime)}</span>
      </div>
      <div className="cm-deck__fields">
        <PillInput
          config={dancerConfig}
          pills={dancers}
          onPills={setDancers}
          draft={dancerDraft}
          onDraft={setDancerDraft}
          placeholder="Dancers"
        />
        <PillInput
          config={tagConfig}
          pills={tags}
          onPills={setTags}
          draft={tagDraft}
          onDraft={setTagDraft}
          placeholder="Tags"
        />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note" {...plainText} />
        <button type="button" className="cm-save" onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : "Save clip"}
        </button>
      </div>
      {error && <div className="cm-error">{error}</div>}
    </div>
  );
}
