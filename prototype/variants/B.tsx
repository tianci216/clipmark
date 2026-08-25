// Variant B — "Explorer". The relation is a persistent tree: Folder › Video › Clip, in a left
// sidebar on desktop. Picking a video plays it in the main pane; the tree stays in view so the
// parent/children are always visible. On the phone the tree becomes a drill-down (Finder-style).
import { useEffect, useMemo, useState } from "react";
import "./b.css";
import {
  FakeFrame, MarkDeck, Still, Strip, TagFilter, basename, dirname, fmt,
  matches, related, title, useFakePlayer, useMedia, useProto, type Proto, type Video,
} from "../shared";

interface Job { id: number; url: string; folder: string; pct: number }

export function VariantB() {
  const p = useProto();
  const [jobs, setJobs] = useState<Job[]>([]);
  // fake progress: each job gains ~7%/tick; done jobs linger as a "landed" row
  useEffect(() => {
    if (!jobs.some((j) => j.pct < 100)) return;
    const id = setInterval(() => setJobs((js) => js.map((j) => ({ ...j, pct: Math.min(100, j.pct + 7) }))), 400);
    return () => clearInterval(id);
  }, [jobs]);
  const allFolders = useMemo(() => [...new Set(p.videos.map((v) => dirname(v.file)))].sort(), [p.videos]);
  const actions = (
    <Actions folders={allFolders} jobs={jobs} onStart={(url, folder) => setJobs((js) => [...js, { id: js.length + 1, url, folder, pct: 0 }])} />
  );
  const jobsIn = (d: string) => jobs.filter((j) => j.folder === d);
  const isPhone = useMedia("(max-width: 860px)");
  const [folder, setFolder] = useState<string | null>(null);
  const has = p.tokens.length > 0;

  // folder → videos (incl. orphans under their saved path)
  const folders = useMemo(() => {
    const m = new Map<string, Video[]>();
    const all = [...p.videos];
    for (const c of p.clips) if (!all.some((v) => v.hash === c.videoHash)) all.push(p.videoOf(c));
    for (const v of all) {
      const d = dirname(v.file);
      if (has && !p.clipsOf(v).some((c) => matches(p.tokens, c.tags))) continue;
      m.set(d, [...(m.get(d) ?? []), v]);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [p, has]);

  const visibleClips = (v: Video) => p.clipsOf(v).filter((c) => !has || matches(p.tokens, c.tags));

  if (isPhone) {
    // drill-down: folders → videos → player
    if (p.target) return <Pane p={p} phone onBack={p.back} />;
    return (
      <main className="shell b b--phone">
        <header className="b-phead">
          {folder ? (
            <button className="b-back" onClick={() => setFolder(null)}>‹ Library</button>
          ) : (
            <div className="b-brand">Clipmark<span>.</span></div>
          )}
          {actions}
        </header>
        <div className="b-pfilter"><TagFilter index={p.index} tokens={p.tokens} onTokens={p.setTokens} compact /></div>
        <div className="b-scroll">
          {!folder ? (
            <ul className="b-list">
              {folders.map(([d, vs]) => (
                <li key={d}>
                  <button className="b-row b-row--folder" onClick={() => setFolder(d)}>
                    <span className="b-row__glyph">▸</span>
                    <span className="b-row__main">
                      <span className="b-row__name">{d}</span>
                      <span className="b-row__meta mono">{vs.length} video{vs.length === 1 ? "" : "s"} · {vs.reduce((n, v) => n + visibleClips(v).length, 0)} clips</span>
                    </span>
                  </button>
                </li>
              ))}
              {folders.length === 0 && <li className="b-none">No clips match these tags.</li>}
              <li className="b-foot mono">{p.videos.length} videos · {p.clips.length} clips</li>
            </ul>
          ) : (
            <>
              <div className="b-crumb eyebrow">{folder}</div>
              <ul className="b-list">
                {jobsIn(folder).map((j) => <li key={j.id}><JobRow job={j} phone /></li>)}
                {(folders.find(([d]) => d === folder)?.[1] ?? []).map((v) => (
                  <li key={v.file} className="b-vgroup">
                    <button className="b-row b-row--video" onClick={() => p.open(v)}>
                      <Still video={v} className="b-row__still" />
                      <span className="b-row__main">
                        <span className="b-row__name">{title(v.file)}</span>
                        <span className="b-row__meta mono">{fmt(v.durationSeconds)} · {p.clipsOf(v).length} clips</span>
                      </span>
                    </button>
                    <ul className="b-sub">
                      {visibleClips(v).map((c) => (
                        <li key={c.id}>
                          <button className="b-row b-row--clip" onClick={() => p.open(v, c)}>
                            <span className="b-row__t mono">{fmt(c.startSeconds)}</span>
                            <span className="b-row__name">{c.tags.join(" · ") || "untitled"}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </main>
    );
  }

  // desktop: sidebar tree + main pane
  return (
    <main className="shell b">
      <div className="b-cols">
        <aside className="b-side">
          <div className="b-side__top">
            <div className="b-brand">Clipmark<span>.</span></div>
            <TagFilter index={p.index} tokens={p.tokens} onTokens={p.setTokens} compact />
          </div>
          <div className="b-tree">
            {folders.map(([d, vs]) => (
              <div className="b-folder" key={d}>
                <div className="b-folder__name eyebrow">{d}</div>
                {jobsIn(d).map((j) => <JobRow key={j.id} job={j} />)}
                {vs.map((v) => {
                  const sel = p.target?.video.hash === v.hash;
                  const cs = visibleClips(v);
                  return (
                    <div className={"b-node" + (sel ? " is-sel" : "")} key={v.file}>
                      <button className="b-node__video" onClick={() => p.open(v)}>
                        <span className="b-node__name">{title(v.file)}</span>
                        <span className="b-node__n mono">{cs.length}{has ? `/${p.clipsOf(v).length}` : ""}</span>
                      </button>
                      {(sel || has) && cs.length > 0 && (
                        <ul className="b-node__clips">
                          {cs.map((c) => (
                            <li key={c.id}>
                              <button
                                className={"b-node__clip" + (p.target?.loopClip?.id === c.id ? " is-sel" : "")}
                                onClick={() => p.open(v, c)}
                              >
                                <span className="mono">{fmt(c.startSeconds)}</span>
                                <span>{c.tags.join(" · ") || "untitled"}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
            {folders.length === 0 && <div className="b-none">No clips match these tags.</div>}
          </div>
          <div className="b-side__foot">{actions}</div>
        </aside>
        {p.target ? (
          <Pane p={p} />
        ) : (
          <Index p={p} folders={folders} />
        )}
      </div>
    </main>
  );
}

function Index({ p, folders }: { p: Proto; folders: Array<[string, Video[]]> }) {
  const has = p.tokens.length > 0;
  return (
    <section className="b-main">
      <div className="b-main__scroll">
        <h1 className="b-h1">Library</h1>
        {folders.map(([d, vs]) => (
          <div className="b-sec" key={d}>
            <div className="b-sec__h eyebrow">{d}</div>
            <table className="b-table">
              <tbody>
                {vs.map((v) => {
                  const own = p.clipsOf(v);
                  return (
                    <tr key={v.file} onClick={() => p.open(v)}>
                      <td className="b-table__still"><Still video={v} /></td>
                      <td className="b-table__name">{basename(v.file)}</td>
                      <td className="mono b-table__dur">{fmt(v.durationSeconds)}</td>
                      <td className="b-table__strip"><Strip video={v} clips={own} active={(c) => !has || matches(p.tokens, c.tags)} dim={has} onClip={(c) => p.open(v, c)} /></td>
                      <td className="mono b-table__n">{own.length}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
        <p className="b-foot mono">{p.videos.length} videos · {folders.length} folders · {p.clips.length} clips{has ? ` · ${p.filteredClips.length} match the filter` : ""}</p>
      </div>
    </section>
  );
}

function Pane({ p, phone, onBack }: { p: Proto; phone?: boolean; onBack?: () => void }) {
  const { video, loopClip } = p.target!;
  const own = p.clipsOf(video);
  const player = useFakePlayer(
    video.durationSeconds ?? Math.max(60, ...own.map((c) => c.endSeconds)),
    loopClip ? { start: loopClip.startSeconds, end: loopClip.endSeconds } : null,
  );
  const rel = related(video, p.clips, p.videoOf);
  const body = (
    <div className="b-main__scroll">
      <div className="b-path mono">
        {dirname(video.file)} <i>›</i> <b>{basename(video.file)}</b>
        {loopClip && <> <i>›</i> clip at {fmt(loopClip.startSeconds)}</>}
      </div>
      <FakeFrame video={video} player={player} />
      <Strip
        className="b-strip"
        video={video}
        clips={own}
        active={(c) => player.isLooping(c.startSeconds, c.endSeconds)}
        dim={!!player.loop}
        onClip={(c) => player.startLoop(c.startSeconds, c.endSeconds)}
        onSeek={player.seek}
        playhead={player.t}
        loop={player.loop}
      />
      <MarkDeck player={player} onSave={(i) => p.save(video, i)} layout={phone ? "stack" : "row"} />

      <div className="b-clips">
        <div className="eyebrow">Clips on this video · {own.length}</div>
        <table className="b-table b-table--clips">
          <tbody>
            {own.map((c) => (
              <tr key={c.id} className={player.isLooping(c.startSeconds, c.endSeconds) ? "is-looping" : ""}>
                <td className="mono"><button onClick={() => player.startLoop(c.startSeconds, c.endSeconds)}>{fmt(c.startSeconds)}</button></td>
                <td className="mono"><button onClick={() => player.seekAndPlay(c.endSeconds)}>{fmt(c.endSeconds)}</button></td>
                <td className="b-table__name">{c.tags.join(" · ") || "untitled"}</td>
                <td className="b-table__note">{c.note}</td>
                <td className="b-table__rm"><button onClick={() => p.remove(c)}>Remove</button></td>
              </tr>
            ))}
            {own.length === 0 && <tr><td className="b-none">No clips yet — mark IN and OUT to add one.</td></tr>}
          </tbody>
        </table>
      </div>
      {rel.length > 0 && (
        <div className="b-clips">
          <div className="eyebrow">Same tags, other videos · {rel.length}</div>
          <table className="b-table b-table--clips">
            <tbody>
              {rel.map(({ clip, video: rv }) => (
                <tr key={clip.id} onClick={() => p.open(rv, clip)} className="is-link">
                  <td className="mono">{fmt(clip.startSeconds)}</td>
                  <td className="mono">{fmt(clip.endSeconds)}</td>
                  <td className="b-table__name">{clip.tags.join(" · ")}</td>
                  <td className="b-table__note">{dirname(rv.file)} › {basename(rv.file)}</td>
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
  if (phone) {
    return (
      <main className="shell b b--phone">
        <header className="b-phead">
          <button className="b-back" onClick={onBack}>‹ {dirname(video.file).split("/").pop()}</button>
        </header>
        <section className="b-main">{body}</section>
      </main>
    );
  }
  return <section className="b-main">{body}</section>;
}


/** #8: "+ Download" — URL plus a pick of which subfolder of the Library Folder the file lands in. */
function Actions({ folders, jobs, onStart }: { folders: string[]; jobs: Job[]; onStart: (url: string, folder: string) => void }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [folder, setFolder] = useState(folders[0] ?? "");
  const active = jobs.filter((j) => j.pct < 100).length;
  return (
    <span className="b-actions">
      <button className="b-actions__btn" data-dl-toggle onClick={() => setOpen((o) => !o)}>
        + Download{active > 0 && <em>{active}</em>}
      </button>
      <button className="b-actions__btn" title="Settings (issue #8)" aria-label="Settings">⚙</button>
      {open && (
        <div className="b-dl">
          <div className="eyebrow">Download into the library</div>
          <input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a video link" />
          <label className="b-dl__label">
            <span className="eyebrow">Folder</span>
            <select value={folder} onChange={(e) => setFolder(e.target.value)}>
              <option value="">Library Folder (top level)</option>
              {folders.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
          <div className="b-dl__row">
            <button className="b-dl__cancel" onClick={() => setOpen(false)}>Cancel</button>
            <button
              className="p-save"
              disabled={!url.trim()}
              onClick={() => { onStart(url.trim(), folder || "—"); setUrl(""); setOpen(false); }}
            >
              Download
            </button>
          </div>
        </div>
      )}
    </span>
  );
}

function JobRow({ job, phone }: { job: Job; phone?: boolean }) {
  const done = job.pct >= 100;
  const name = job.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 34);
  return (
    <div className={"b-job" + (phone ? " b-job--phone" : "") + (done ? " is-done" : "")}>
      <span className="b-job__glyph">{done ? "✓" : "↓"}</span>
      <span className="b-job__main">
        <span className="b-job__name">{name}</span>
        <span className="b-job__meta mono">{done ? "landed — scanning" : `downloading · ${job.pct}%`}</span>
        {!done && <span className="b-job__bar"><i style={{ width: `${job.pct}%` }} /></span>}
      </span>
    </div>
  );
}
