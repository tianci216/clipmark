import { useEffect, useMemo, useState } from "react";
import type { Clip, ClipInput, Video } from "./api";
import { videoUrl } from "./api";
import { basename, dirname, folderLabel, formatTime } from "./format";
import { railFor } from "./rail";
import { Strip, stripDuration } from "./Strip";
import type { VideoPlayer } from "./useVideoPlayer";
import { useVideoPlayer } from "./useVideoPlayer";

/**
 * The player: breadcrumb, native video, clip strip, mark deck, "Clips on this video" and
 * "Same tags, other videos". Rendered in the desktop main pane and as the phone's player screen.
 * Mount it with a key of file + loop clip so the loop state machine restarts per target.
 */
export function PlayerPane({
  video,
  loopClip,
  orphan,
  videos,
  clips,
  phone,
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
  phone: boolean;
  onSave: (video: Video, input: ClipInput) => Promise<void>;
  onRemove: (clip: Clip) => Promise<void>;
  onOpen: (video: Video, clip: Clip | null) => void;
  /** False while the page is hidden (behind Music or Settings): the video pauses. */
  active?: boolean;
}) {
  const player = useVideoPlayer(
    loopClip ? { start: loopClip.startSeconds, end: loopClip.endSeconds } : null,
  );
  const { videoRef } = player;
  useEffect(() => {
    if (!active) videoRef.current?.pause();
  }, [active, videoRef]);
  const { own, others } = useMemo(() => railFor(video, videos, clips), [video, videos, clips]);
  const duration = player.duration > 0 ? player.duration : stripDuration(video.durationSeconds, own);

  return (
    <div className="cm-main__scroll">
      <div className="cm-path cm-mono">
        {folderLabel(dirname(video.file))} <i>›</i> <b>{basename(video.file)}</b>
        {loopClip && (
          <>
            {" "}
            <i>›</i> clip at {formatTime(loopClip.startSeconds)}
          </>
        )}
      </div>

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
        dim={!!player.loop}
        onClip={(c) => player.startLoop(c.startSeconds, c.endSeconds)}
        onSeek={player.seek}
        playhead={player.currentTime}
        loop={player.loop}
      />

      <MarkDeck player={player} onSave={(input) => onSave(video, input)} stacked={phone} />

      <div className="cm-clips">
        <div className="cm-eyebrow">Clips on this video · {own.length}</div>
        <table className="cm-table cm-table--clips">
          <tbody>
            {own.map((c) => (
              <tr
                key={c.id}
                className={player.isLooping(c.startSeconds, c.endSeconds) ? "is-looping" : ""}
              >
                <td className="cm-mono">
                  <button
                    type="button"
                    title="Loop this clip"
                    onClick={() => player.startLoop(c.startSeconds, c.endSeconds)}
                  >
                    {formatTime(c.startSeconds)}
                  </button>
                </td>
                <td className="cm-mono">
                  <button
                    type="button"
                    title="Play from the end of this clip"
                    onClick={() => player.seekAndPlay(c.endSeconds)}
                  >
                    {formatTime(c.endSeconds)}
                  </button>
                </td>
                <td className="cm-table__name">{c.tags.join(" · ") || "untitled"}</td>
                <td className="cm-table__note">{c.note}</td>
                <td className="cm-table__rm">
                  <button type="button" onClick={() => void onRemove(c)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {own.length === 0 && (
              <tr>
                <td className="cm-none" colSpan={5}>
                  No clips yet — mark IN and OUT to add one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {others.length > 0 && (
        <div className="cm-clips">
          <div className="cm-eyebrow">Same tags, other videos · {others.length}</div>
          <table className="cm-table cm-table--clips">
            <tbody>
              {others.map(({ clip, video: rv }) => (
                <tr
                  key={`${rv.file}-${clip.id}`}
                  className="is-link"
                  onClick={() => onOpen(rv, clip)}
                >
                  <td className="cm-mono">{formatTime(clip.startSeconds)}</td>
                  <td className="cm-mono">{formatTime(clip.endSeconds)}</td>
                  <td className="cm-table__name">{clip.tags.join(" · ")}</td>
                  <td className="cm-table__note">
                    {folderLabel(dirname(rv.file))} › {basename(rv.file)}
                  </td>
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MarkDeck({
  player,
  onSave,
  stacked,
}: {
  player: VideoPlayer;
  onSave: (input: ClipInput) => Promise<void>;
  stacked: boolean;
}) {
  const [mark, setMark] = useState<{ s: number | null; e: number | null }>({ s: null, e: null });
  const [tags, setTags] = useState("");
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
    setSaving(true);
    setError("");
    try {
      await onSave({
        startSeconds: mark.s,
        endSeconds: mark.e,
        note: note.trim(),
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      });
      setMark({ s: null, e: null });
      setTags("");
      setNote("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={"cm-deck " + (stacked ? "cm-deck--stack" : "cm-deck--row")}>
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
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="Tags, comma separated"
        />
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note" />
        <button type="button" className="cm-save" onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : "Save clip"}
        </button>
      </div>
      {error && <div className="cm-error">{error}</div>}
    </div>
  );
}
