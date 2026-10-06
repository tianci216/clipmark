# Video Source stored by Hash, captured at landing, no in-app backfill

A Download kept only the yt-dlp title, and only inside the filename. We decided a downloaded Video keeps its **Source** — page URL, title, description, channel, upload date, preview image and the site's id — in a `video_sources` table keyed by the Video's **Hash**, written by the Download queue when the file lands (the queue hashes the landed file with the scanner's function so the row exists before the next scan). Keying by Hash is why Hash identity exists at all (ADR-0004): the Source survives renames and moves exactly as Clips do.

Where a Video has a Source, its title is the Video's display name and its preview image replaces the mid-frame thumbnail in the library; Videos without one look as they do today. The player shows the Source under the clip strip with the description collapsed, and page links open in the default browser rather than navigating the app window.

Rejected: a sidecar `.info.json` next to the file read by the scanner (breaks on rename, and the scanner would carry a second source of truth); fetching Sources for videos downloaded before this ADR from inside the app, whether as a Settings action or during scans (a scan must never wait on the network, and it is a one-time need) — existing `Title [id].ext` files are back-filled once by a script run outside the app and not committed.
