// PROTOTYPE — shared bits that are NOT layout: mock state, fake player, formatting, tag filter.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { clips as seedClips, videos as seedVideos, type Clip, type Video } from "./data";

export { type Clip, type Video };

/* ---------- formatting ---------- */
export const fmt = (s: number | null | undefined) => {
  if (s == null || !Number.isFinite(s) || s < 0) return "--:--";
  const t = Math.floor(s);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};
export const basename = (f: string) => f.split("/").pop() || f;
export const dirname = (f: string) => f.split("/").slice(0, -1).join("/") || "—";
export const title = (f: string) => basename(f).replace(/\.[a-z0-9]+$/i, "");

/* ---------- tag matching (same semantics as src/lib/tags.ts) ---------- */
export const matches = (tokens: string[], tags: string[]) =>
  tokens.every((tok) => tags.some((t) => t.toLowerCase().includes(tok.toLowerCase())));

export function tagIndex(cs: Clip[]): Array<[string, number]> {
  const m = new Map<string, number>();
  for (const c of cs) for (const t of c.tags) m.set(t, (m.get(t) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/* ---------- mock app state (in-memory only) ---------- */
export type Tab = "clips" | "videos";
export interface Target {
  video: Video;
  loopClip: Clip | null;
}

export function orphanFor(clip: Clip): Video {
  return {
    hash: clip.videoHash,
    file: clip.file,
    durationSeconds: null,
    still: null,
    clipCount: 0,
    firstClipStart: null,
  };
}

export function useProto() {
  const [videos, setVideos] = useState<Video[]>(seedVideos);
  const [clips, setClips] = useState<Clip[]>(seedClips);
  const [tab, setTab] = useState<Tab>("clips");
  const [tokens, setTokens] = useState<string[]>([]);
  const [target, setTarget] = useState<Target | null>(null);

  const byHash = useMemo(() => new Map(videos.map((v) => [v.hash, v])), [videos]);
  const videoOf = useCallback(
    (c: Clip) => byHash.get(c.videoHash) ?? orphanFor(c),
    [byHash],
  );
  const clipsOf = useCallback(
    (v: Video) =>
      clips
        .filter((c) => c.videoHash === v.hash)
        .sort((a, b) => a.startSeconds - b.startSeconds || a.id - b.id),
    [clips],
  );

  const filteredClips = useMemo(
    () => clips.filter((c) => matches(tokens, c.tags)),
    [clips, tokens],
  );
  const filteredVideos = useMemo(
    () =>
      videos.filter(
        (v) =>
          tokens.length === 0 ||
          clips.some((c) => c.videoHash === v.hash && matches(tokens, c.tags)),
      ),
    [videos, clips, tokens],
  );

  const recount = (vs: Video[], cs: Clip[]) =>
    vs.map((v) => {
      const own = cs.filter((c) => c.videoHash === v.hash);
      return {
        ...v,
        clipCount: own.length,
        firstClipStart: own.length ? Math.min(...own.map((c) => c.startSeconds)) : null,
      };
    });

  const save = (video: Video, input: Omit<Clip, "id" | "videoHash" | "file">) => {
    const clip: Clip = {
      id: Math.max(0, ...clips.map((c) => c.id)) + 1,
      videoHash: video.hash,
      file: video.file,
      ...input,
    };
    const next = [...clips, clip];
    setClips(next);
    setVideos(recount(videos, next));
  };
  const remove = (clip: Clip) => {
    const next = clips.filter((c) => c.id !== clip.id);
    setClips(next);
    setVideos(recount(videos, next));
  };

  const open = (video: Video, loopClip: Clip | null = null) => setTarget({ video, loopClip });
  const back = () => setTarget(null);

  return {
    videos, clips, tab, setTab, tokens, setTokens, target, open, back,
    videoOf, clipsOf, filteredClips, filteredVideos, save, remove,
    index: useMemo(() => tagIndex(clips), [clips]),
  };
}
export type Proto = ReturnType<typeof useProto>;

/* ---------- related rail (same ranking as src/lib/rail.ts) ---------- */
export function related(video: Video, clips: Clip[], videoOf: (c: Clip) => Video) {
  const own = clips.filter((c) => c.videoHash === video.hash);
  const ownTags = new Set(own.flatMap((c) => c.tags.map((t) => t.toLowerCase())));
  return clips
    .filter((c) => c.videoHash !== video.hash)
    .map((clip) => ({
      clip,
      video: videoOf(clip),
      shared: clip.tags.filter((t) => ownTags.has(t.toLowerCase())).length,
    }))
    .filter((e) => e.shared > 0)
    .sort((a, b) => b.shared - a.shared || a.clip.startSeconds - b.clip.startSeconds);
}

/* ---------- fake player: same state machine as useVideoPlayer, no <video> ---------- */
export interface Loop {
  start: number;
  end: number;
}
export function useFakePlayer(duration: number, initialLoop: Loop | null) {
  const [t, setT] = useState(initialLoop?.start ?? 0);
  const [playing, setPlaying] = useState(!!initialLoop);
  const [loop, setLoop] = useState<Loop | null>(initialLoop);
  const loopRef = useRef(loop);
  loopRef.current = loop;

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setT((prev) => {
        const l = loopRef.current;
        let n = prev + 0.25;
        if (l && n >= l.end) n = l.start;
        if (n >= duration) {
          setPlaying(false);
          return duration;
        }
        return n;
      });
    }, 250);
    return () => clearInterval(id);
  }, [playing, duration]);

  const seek = (x: number) => {
    setLoop(null); // manual seek breaks the loop
    setT(Math.max(0, Math.min(x, duration)));
  };
  const startLoop = (start: number, end: number) => {
    setLoop({ start, end });
    setT(start);
    setPlaying(true);
  };
  const seekAndPlay = (x: number) => {
    setLoop(null);
    setT(x);
    setPlaying(true);
  };
  const isLooping = (s: number, e: number) => !!loop && loop.start === s && loop.end === e;

  return {
    t, duration, playing, loop, seek, startLoop, seekAndPlay, isLooping,
    toggle: () => setPlaying((p) => !p),
  };
}
export type FakePlayer = ReturnType<typeof useFakePlayer>;

/* ---------- small shared visuals ---------- */
export function Still({
  video,
  className = "",
  children,
}: {
  video: Video;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <span
      className={"p-still " + className}
      style={video.still ? { background: video.still } : undefined}
    >
      {!video.still && (
        <span className="p-still__missing">
          <span>∿</span>
          {video.durationSeconds == null ? "file missing" : "no thumbnail"}
        </span>
      )}
      {children}
    </span>
  );
}

/** Proportional track with clip segments — the visual of "clips belong to this video". */
export function Strip({
  video,
  clips,
  active,
  dim,
  onClip,
  onSeek,
  playhead,
  loop,
  className = "",
}: {
  video: Video;
  clips: Clip[];
  /** predicate for highlighted clips (e.g. matches filter / looping) */
  active?: (c: Clip) => boolean;
  /** dim non-active clips */
  dim?: boolean;
  onClip?: (c: Clip) => void;
  onSeek?: (t: number) => void;
  playhead?: number;
  loop?: Loop | null;
  className?: string;
}) {
  const d = video.durationSeconds ?? Math.max(1, ...clips.map((c) => c.endSeconds));
  const pct = (x: number) => `${(x / d) * 100}%`;
  return (
    <div
      className={"p-strip " + className + (onSeek ? " is-seekable" : "")}
      onClick={(e) => {
        if (!onSeek) return;
        const r = e.currentTarget.getBoundingClientRect();
        onSeek(((e.clientX - r.left) / r.width) * d);
      }}
    >
      {Array.from({ length: Math.floor(d / 60) }, (_, i) => (
        <i key={i} className="p-strip__min" style={{ left: pct((i + 1) * 60) }} />
      ))}
      {clips.map((c) => {
        const on = active ? active(c) : true;
        return (
          <button
            key={c.id}
            className={"p-strip__clip" + (on ? " is-on" : dim ? " is-dim" : "")}
            style={{ left: pct(c.startSeconds), width: pct(c.endSeconds - c.startSeconds) }}
            title={`${fmt(c.startSeconds)} → ${fmt(c.endSeconds)} · ${c.tags.join(", ")}`}
            onClick={(e) => {
              e.stopPropagation();
              onClip?.(c);
            }}
          />
        );
      })}
      {loop && (
        <span
          className="p-strip__loop"
          style={{ left: pct(loop.start), width: pct(loop.end - loop.start) }}
        />
      )}
      {playhead != null && <span className="p-strip__head" style={{ left: pct(playhead) }} />}
    </div>
  );
}

export function TagFilter({
  index,
  tokens,
  onTokens,
  compact,
}: {
  index: Array<[string, number]>;
  tokens: string[];
  onTokens: (t: string[]) => void;
  compact?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [show, setShow] = useState(false);
  const sugg = draft.trim()
    ? index
        .filter(
          ([t]) =>
            t.toLowerCase().includes(draft.trim().toLowerCase()) &&
            !tokens.some((k) => k.toLowerCase() === t.toLowerCase()),
        )
        .slice(0, 6)
    : [];
  const commit = (raw?: string) => {
    const v = (raw ?? draft).trim();
    if (!v) return;
    if (!tokens.some((k) => k.toLowerCase() === v.toLowerCase())) onTokens([...tokens, v]);
    setDraft("");
    setShow(false);
  };
  return (
    <div className={"p-tf" + (compact ? " p-tf--compact" : "")}>
      {tokens.map((k) => (
        <span key={k} className="p-tf__tok">
          {k}
          <button onClick={() => onTokens(tokens.filter((x) => x !== k))} aria-label={`Remove ${k}`}>
            ✕
          </button>
        </span>
      ))}
      <span className="p-tf__box">
        <input
          value={draft}
          placeholder={tokens.length ? "" : "Filter by tag…"}
          onChange={(e) => {
            setDraft(e.target.value);
            setShow(true);
          }}
          onFocus={() => setShow(true)}
          onBlur={() => setTimeout(() => setShow(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commit();
            } else if (e.key === "Backspace" && !draft && tokens.length) {
              onTokens(tokens.slice(0, -1));
            }
          }}
        />
        {show && sugg.length > 0 && (
          <span className="p-tf__sugg">
            {sugg.map(([t, n]) => (
              <button
                key={t}
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(t);
                }}
              >
                {t} <em>{n}</em>
              </button>
            ))}
          </span>
        )}
      </span>
    </div>
  );
}

/** #8 placeholders: gear → Settings, + Download. Non-functional in the prototype. */
export function HeaderActions({ className = "" }: { className?: string }) {
  return (
    <span className={"p-actions " + className}>
      <button title="Download a video (issue #8)">+ Download</button>
      <button title="Settings (issue #8)" aria-label="Settings">
        ⚙
      </button>
    </span>
  );
}

/* ---------- widgets shared by the player views (not layout) ---------- */
export function useMedia(q: string) {
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const h = () => setM(mq.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, [q]);
  return m;
}

/** Stand-in for <video>: the still, a timecode, play/pause, loop badge. */
export function FakeFrame({ video, player }: { video: Video; player: FakePlayer }) {
  return (
    <div className="p-frame" style={video.still ? { background: video.still } : undefined}>
      <button className="p-frame__play" onClick={player.toggle} aria-label={player.playing ? "Pause" : "Play"}>
        {player.playing ? "❙❙" : "▶"}
      </button>
      <span className="p-frame__tc">
        {fmt(player.t)} <em>/ {fmt(player.duration)}</em>
      </span>
      {player.loop && (
        <span className="p-frame__loop">
          loop {fmt(player.loop.start)} → {fmt(player.loop.end)}
        </span>
      )}
      {!video.still && <span className="p-frame__missing">file missing on disk · {video.file}</span>}
    </div>
  );
}

export function MarkDeck({
  player,
  onSave,
  layout = "row",
}: {
  player: FakePlayer;
  onSave: (input: { startSeconds: number; endSeconds: number; tags: string[]; note: string }) => void;
  layout?: "row" | "stack";
}) {
  const [s, setS] = useState<number | null>(null);
  const [e, setE] = useState<number | null>(null);
  const [tags, setTags] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const save = () => {
    if (s == null || e == null) return setErr("Mark both IN and OUT before saving.");
    if (e <= s) return setErr("The clip has to end after it starts.");
    onSave({
      startSeconds: s, endSeconds: e, note: note.trim(),
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
    });
    setS(null); setE(null); setTags(""); setNote(""); setErr("");
  };
  return (
    <div className={"p-deck p-deck--" + layout}>
      <div className="p-deck__marks">
        <button className={"p-mark" + (s != null ? " is-set" : "")} onClick={() => setS(player.t)}>
          <small>IN</small>{fmt(s)}
        </button>
        <span className="p-deck__arrow">→</span>
        <button className={"p-mark" + (e != null ? " is-set" : "")} onClick={() => setE(player.t)}>
          <small>OUT</small>{fmt(e)}
        </button>
      </div>
      <div className="p-deck__fields">
        <input value={tags} onChange={(x) => setTags(x.target.value)} placeholder="Tags, comma separated" />
        <input value={note} onChange={(x) => setNote(x.target.value)} placeholder="Note" />
        <button className="p-save" onClick={save}>Save clip</button>
      </div>
      {err && <div className="p-deck__err">{err}</div>}
    </div>
  );
}
