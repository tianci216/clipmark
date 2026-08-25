// Variant C — "Deck". Keeps the Clips / Videos tabs and card grid, but clip cards are grouped
// under a sticky parent-video heading with a bracket; video cards carry their clips as ledger
// lines attached to the card. The player shows the parent's clips as a horizontal filmstrip
// with "clip 2 of 5" and prev/next — a phone-friendly idiom.
import "./c.css";
import {
  FakeFrame, HeaderActions, MarkDeck, Still, Strip, TagFilter, basename, dirname, fmt,
  matches, related, title, useFakePlayer, useProto, type Clip, type Proto, type Video,
} from "../shared";

export function VariantC() {
  const p = useProto();
  return p.target ? <Player p={p} /> : <Library p={p} />;
}

function Library({ p }: { p: Proto }) {
  const has = p.tokens.length > 0;
  const groups: Array<{ video: Video; clips: Clip[] }> = [];
  for (const c of p.filteredClips) {
    const v = p.videoOf(c);
    const g = groups.find((x) => x.video.hash === v.hash);
    if (g) g.clips.push(c);
    else groups.push({ video: v, clips: [c] });
  }
  groups.sort((a, b) => a.video.file.localeCompare(b.video.file));

  return (
    <main className="shell c">
      <header className="c-head">
        <div className="c-brand">Clipmark<span>.</span><small>a dance archive</small></div>
        <TagFilter index={p.index} tokens={p.tokens} onTokens={p.setTokens} />
        <HeaderActions />
      </header>
      <div className="c-scroll">
        <nav className="c-tabs">
          <button className={"c-tab" + (p.tab === "clips" ? " is-on" : "")} onClick={() => p.setTab("clips")}>
            Clips <span className="mono">{p.filteredClips.length}</span>
          </button>
          <button className={"c-tab" + (p.tab === "videos" ? " is-on" : "")} onClick={() => p.setTab("videos")}>
            Videos <span className="mono">{p.filteredVideos.length}</span>
          </button>
          {has && <button className="c-clear" onClick={() => p.setTokens([])}>Clear filter</button>}
        </nav>

        {p.tab === "clips" &&
          (groups.length === 0 ? (
            <div className="c-empty">No clips match these tags.</div>
          ) : (
            groups.map(({ video: v, clips: cs }) => {
              const total = p.clipsOf(v).length;
              return (
                <section className="c-group" key={v.hash}>
                  <button className="c-group__head" onClick={() => p.open(v)}>
                    <Still video={v} className="c-group__still" />
                    <span className="c-group__text">
                      <span className="eyebrow">{dirname(v.file)}</span>
                      <span className="c-group__name">{title(v.file)}</span>
                    </span>
                    <span className="c-group__n mono">
                      {has && cs.length !== total ? `${cs.length} of ${total}` : total} clip{total === 1 ? "" : "s"}
                      {v.durationSeconds == null && <em> · file missing</em>}
                    </span>
                  </button>
                  <div className="c-group__cards">
                    {cs.map((c) => (
                      <button className="c-card" key={c.id} onClick={() => p.open(v, c)}>
                        <Still video={v}>
                          <span className="c-card__range mono">{fmt(c.startSeconds)} → {fmt(c.endSeconds)}</span>
                        </Still>
                        <span className="c-card__title">{c.tags.join(" · ") || "Untitled"}</span>
                        {c.note && <span className="c-card__note">{c.note}</span>}
                      </button>
                    ))}
                  </div>
                </section>
              );
            })
          ))}

        {p.tab === "videos" && (
          <div className="c-grid">
            {p.filteredVideos.map((v) => {
              const own = p.clipsOf(v);
              const shown = own.slice(0, 4);
              return (
                <div className="c-deck" key={v.file}>
                  <button className="c-deck__top" onClick={() => p.open(v)}>
                    <Still video={v}>
                      <span className="c-card__range mono">{fmt(v.durationSeconds)}</span>
                    </Still>
                    <span className="c-card__title">{title(v.file)}</span>
                    <span className="c-deck__dir">{dirname(v.file)}</span>
                  </button>
                  <Strip className="c-deck__strip" video={v} clips={own} active={(c) => !has || matches(p.tokens, c.tags)} dim={has} onClip={(c) => p.open(v, c)} />
                  <ul className="c-ledger">
                    {shown.map((c) => (
                      <li key={c.id}>
                        <button className={"c-ledger__row" + (has && !matches(p.tokens, c.tags) ? " is-dim" : "")} onClick={() => p.open(v, c)}>
                          <span className="mono">{fmt(c.startSeconds)}</span>
                          <span className="c-ledger__tags">{c.tags.join(" · ") || "untitled"}</span>
                        </button>
                      </li>
                    ))}
                    {own.length > shown.length && (
                      <li><button className="c-ledger__row c-ledger__more" onClick={() => p.open(v)}>+ {own.length - shown.length} more</button></li>
                    )}
                    {own.length === 0 && <li className="c-ledger__none">no clips yet</li>}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
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
  const cur = own.findIndex((c) => player.isLooping(c.startSeconds, c.endSeconds));
  const go = (i: number) => {
    const c = own[(i + own.length) % own.length];
    player.startLoop(c.startSeconds, c.endSeconds);
  };
  const rel = related(video, p.clips, p.videoOf);

  return (
    <main className="shell c">
      <header className="c-head c-head--player">
        <button className="c-back" onClick={p.back}>‹ Back to library</button>
        <div className="c-brand">Clipmark<span>.</span></div>
        <HeaderActions />
      </header>
      <div className="c-scroll c-player">
        <div className="c-player__frame">
          <FakeFrame video={video} player={player} />
          <Strip
            className="c-player__strip"
            video={video}
            clips={own}
            active={(c) => player.isLooping(c.startSeconds, c.endSeconds)}
            dim={!!player.loop}
            onClip={(c) => player.startLoop(c.startSeconds, c.endSeconds)}
            onSeek={player.seek}
            playhead={player.t}
            loop={player.loop}
          />
        </div>

        <div className="c-parentbar">
          <span className="eyebrow">{dirname(video.file)}</span>
          <span className="c-parentbar__name">{basename(video.file)}</span>
          <span className="c-parentbar__pos mono">
            {own.length === 0 ? "no clips" : cur >= 0 ? `clip ${cur + 1} of ${own.length}` : `${own.length} clips`}
          </span>
          {own.length > 1 && (
            <span className="c-parentbar__nav">
              <button onClick={() => go(cur - 1)} aria-label="Previous clip">‹</button>
              <button onClick={() => go(cur + 1)} aria-label="Next clip">›</button>
            </span>
          )}
        </div>

        {own.length > 0 && (
          <div className="c-film">
            {own.map((c, i) => (
              <div className={"c-film__card" + (i === cur ? " is-on" : "")} key={c.id}>
                <button className="c-film__hit" onClick={() => player.startLoop(c.startSeconds, c.endSeconds)}>
                  <Still video={video}>
                    <span className="c-card__range mono">{fmt(c.startSeconds)} → {fmt(c.endSeconds)}</span>
                  </Still>
                  <span className="c-film__tags">{c.tags.join(" · ") || "Untitled"}</span>
                  {c.note && <span className="c-film__note">{c.note}</span>}
                </button>
                <span className="c-film__acts">
                  <button onClick={() => player.seekAndPlay(c.endSeconds)} title="Seek to end and play once">play end</button>
                  <button onClick={() => p.remove(c)}>Remove</button>
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="c-deckwrap">
          <div className="eyebrow">New clip on this video</div>
          <MarkDeck player={player} onSave={(i) => p.save(video, i)} />
        </div>

        {rel.length > 0 && (
          <>
            <div className="eyebrow c-relh">From your library · same tags</div>
            <div className="c-film c-film--rel">
              {rel.map(({ clip, video: rv }) => (
                <div className="c-film__card" key={clip.id}>
                  <button className="c-film__hit" onClick={() => p.open(rv, clip)}>
                    <Still video={rv}>
                      <span className="c-card__range mono">{fmt(clip.startSeconds)} → {fmt(clip.endSeconds)}</span>
                    </Still>
                    <span className="c-film__tags">{clip.tags.join(" · ")}</span>
                    <span className="c-film__note">{title(rv.file)}</span>
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
