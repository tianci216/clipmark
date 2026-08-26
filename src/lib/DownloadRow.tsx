import { useEffect, useState } from "react";
import type { Download } from "./api";
import type { DownloadControls } from "./downloadControls";

/** A running Download with no progress for this long is probably waiting on the Mac's Keychain prompt. */
const STALLED_AFTER_MS = 10_000;

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

/**
 * One Download inside its folder — the same row on the desktop tree and the phone
 * folder list. Progress bar while running, "landed — scanning" once the file is on
 * disk, the error with Dismiss on failure.
 */
export function DownloadRow({
  download: job,
  controls,
}: {
  download: Download;
  controls: DownloadControls;
}) {
  const scanning = controls.scanning.has(job.id);
  const onRemove = controls.onRemove;
  const running = job.state === "running";
  const now = useNow(running && job.progress === 0);
  const stalled =
    running && job.progress === 0 && job.startedAt !== null && now - job.startedAt > STALLED_AFTER_MS;
  const name = job.title ?? job.url.replace(/^https?:\/\//, "");

  let status: string;
  if (job.state === "queued") status = "queued";
  else if (job.state === "cancelled") status = "cancelling…";
  else if (job.state === "failed") status = "failed";
  else if (job.state === "done" || scanning) status = "landed — scanning";
  else status = `downloading · ${Math.floor(job.progress)}%`;

  return (
    <div className={`cm-dl cm-dl--${job.state}`}>
      <div className="cm-dl__head">
        <span className="cm-dl__name" title={job.url}>
          ↓ {name}
        </span>
        {(job.state === "running" || job.state === "queued") && (
          <button className="cm-dl__act" type="button" onClick={() => onRemove(job)}>
            Cancel
          </button>
        )}
        {job.state === "failed" && (
          <button className="cm-dl__act" type="button" onClick={() => onRemove(job)}>
            Dismiss
          </button>
        )}
      </div>
      <div className="cm-dl__status cm-mono">{status}</div>
      {running && (
        <div className="cm-dl__bar">
          <div className="cm-dl__fill" style={{ width: `${Math.max(1, Math.min(100, job.progress))}%` }} />
        </div>
      )}
      {stalled && (
        <div className="cm-dl__hint">
          No progress yet — it may be waiting on a Keychain prompt on the Mac (Chrome cookies).
        </div>
      )}
      {job.state === "failed" && job.error && <pre className="cm-dl__err">{job.error}</pre>}
    </div>
  );
}
