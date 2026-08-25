// Variant A — "Reel". The Video is the row; its Clips are segments on the video's own time strip
// and a line of chips beneath it. The library has no Clips/Videos tabs: one list of videos, each
// carrying its clips. Filtering dims non-matching clips and hides videos with no matches.
import "./a.css";
import {
  FakeFrame, HeaderActions, MarkDeck, Still, Strip, TagFilter, basename, dirname, fmt,
  matches, related, title, useFakePlayer, useProto, type Clip, type Proto,
} from "../shared";

export function VariantA() {
  const p = useProto();
  return p.target ? <Player p={p} /> : <Library p={p} />;
}

function Library({ p }: { p: Proto }) {
  const has = p.tokens.length > 0;
  // orphan clips (video missing) get a synthetic row at the end
  const orphanVideos = [...new Set(p.clips.filter((c) => !p.videos.some((v) => v.hash === c.videoHash)).map((c) => c.videoHash))]
    .map((h) => p.videoOf(p.clips.find((c) => c.videoHash === h)!));
  const rows = [...p.filteredVideos, ...orphanVideos.filter((v) => !has || p.clipsOf(v).some((c) => matches(p.tokens, c.tags)))]
    .sort((a, b) => b.clipCount - a.clipCount || a.file.localeCompare(b.file));
  const nClips = p.filteredClips.length;

  return (
    <main className="shell a">
      <header className="a-head">
        <div className="a-brand">Clipmark<span>.</span></div>
        <TagFilter index={p.index} tokens={p.tokens} onTokens={p.setTokens} />
        <HeaderActions />
      </header>
      <div className="a-scroll">
        <div className="a-summary">
          <span className="a-summary__n">{rows.length}</span> videos ·{" "}
          <span className="a-summary__n">{nClips}</span> clips
          {has && <button className="a-clear" onClick={() => p.setTokens([])}>Clear filter</button>}
        </div>
        {rows.length === 0 && (
          <div className="a-empty">No clips match these tags. <button onClick={() => p.setTokens([])}>Clear filter</button></div>
        )}
        {rows.map((v) => {
          const own = p.clipsOf(v);
          const on = (c: Clip) => !has || matches(p.tokens, c.tags);
          return (
            <section className="reel" key={v.file}>
              <button className="reel__still" onClick={() => p.open(v)}>
                <Still video={v}>
                  <span className="reel__dur">{fmt(v.durationSeconds)}</span>
                </Still>
              </button>
              <div className="reel__body">
                <div className="reel__title">
                  <span className="eyebrow">{dirname(v.file)}</span>
                  <button className="reel__name" onClick={() => p.open(v)}>{title(v.file)}</button>
                  <span className="reel__count mono">
                    {own.length === 0 ? "no clips" : `${has ? own.filter(on).length + " of " : ""}${own.length} clip${own.length === 1 ? "" : "s"}`}
                  </span>
                </div>
                <Strip video={v} clips={own} active={on} dim={has} onClip={(c) => p.open(v, c)} />
                {own.length > 0 && (
                  <div className="reel__chips">
                    {own.map((c) => (
                      <button
                        key={c.id}
                        className={"chip" + (on(c) ? "" : " is-dim")}
                        onClick={() => p.open(v, c)}
                      >
                        <span className="chip__t mono">{fmt(c.startSeconds)}–{fmt(c.endSeconds)}</span>
                        <span className="chip__tags">{c.tags.join(" · ") || "untitled"}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}

function Player({ p }: { p: Proto }) {
  const { video, loopClip } = p.target!;
  const own = p.clipsOf(video);
  const player = useFakePlayer(
    video.durationSeconds ?? Math.max(60, ...own.map((c) => c.endSeconds)),
    loopClip ? { start: loopClip.startSeconds, end: loopClip.endSeconds } : null,
  );
  const rel = related(video, p.clips, p.videoOf);

  return (
    <main className="shell a">
      <header className="a-head a-head--player">
        <button className="a-back" onClick={p.back}>‹ Library</button>
        <div className="a-crumb">
          <span className="eyebrow">{dirname(video.file)}</span>
          <span className="a-crumb__name">{title(video.file)}</span>
        </div>
        <HeaderActions />
      </header>
      <div className="a-scroll a-player">
        <div className="a-player__main">
          <FakeFrame video={video} player={player} />
          <Strip
            className="a-player__strip"
            video={video}
            clips={own}
            active={(c) => player.isLooping(c.startSeconds, c.endSeconds)}
            dim={!!player.loop}
            onClip={(c) => player.startLoop(c.startSeconds, c.endSeconds)}
            onSeek={player.seek}
            playhead={player.t}
            loop={player.loop}
          />
          <MarkDeck player={player} onSave={(i) => p.save(video, i)} />
        </div>

        <aside className="a-side">
          <div className="a-parent">
            <Still video={video} className="a-parent__still" />
            <div>
              <div className="eyebrow">Video</div>
              <div className="a-parent__name">{basename(video.file)}</div>
              <div className="a-parent__meta mono">{fmt(video.durationSeconds)} · {own.length} clip{own.length === 1 ? "" : "s"}</div>
            </div>
          </div>
          <ol className="a-tree">
            {own.map((c) => (
              <li key={c.id} className={"a-tree__row" + (player.isLooping(c.startSeconds, c.endSeconds) ? " is-looping" : "")}>
                <span className="a-tree__times mono">
                  <button onClick={() => player.startLoop(c.startSeconds, c.endSeconds)} title="Loop">{fmt(c.startSeconds)}</button>
                  <i>→</i>
                  <button onClick={() => player.seekAndPlay(c.endSeconds)} title="Seek and play once">{fmt(c.endSeconds)}</button>
                </span>
                <span className="a-tree__tags">{c.tags.join(" · ") || "untitled"}</span>
                {c.note && <span className="a-tree__note">{c.note}</span>}
                <button className="a-tree__rm" onClick={() => p.remove(c)}>Remove</button>
              </li>
            ))}
            {own.length === 0 && <li className="a-tree__none">No clips yet — mark IN and OUT to add one.</li>}
          </ol>
          {rel.length > 0 && (
            <>
              <div className="eyebrow a-side__h">Elsewhere with these tags</div>
              <ul className="a-rel">
                {rel.map(({ clip, video: rv, shared }) => (
                  <li key={clip.id}>
                    <button className="a-rel__row" onClick={() => p.open(rv, clip)}>
                      <Still video={rv} className="a-rel__still" />
                      <span className="a-rel__body">
                        <span className="a-rel__tags">{clip.tags.join(" · ")}</span>
                        <span className="a-rel__file">{title(rv.file)} · <em className="mono">{fmt(clip.startSeconds)}</em></span>
                      </span>
                      <span className="a-rel__n mono">{shared}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </aside>
      </div>
    </main>
  );
}

