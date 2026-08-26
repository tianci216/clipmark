# ClipMark

ClipMark exists to fulfill a very simple purpose: clipping videos with tags, and searching clips by tags. I'm a Lindy Hopper and I've collected hundreds of dance videos that fascinate me. Sometimes when I see a really cool move that I want to save for later practice (or never practice), I have to manually trim the video and save it as a new file. This not only wastes disk space, but searching for the clips I want is like looking for a needle in a haystack.

ClipMark marks and tags time ranges in dance videos so they can be searched and re-watched for practice. It's a single-user web app: a React + TypeScript frontend with a paper-and-ink aesthetic, a Node/Express backend, and a SQLite database.

- **Clip** any part of a video by pressing IN and OUT at the current playback position.
- **Tag** each clip (comma-separated) and add an optional note.
- **Search** clips by tag from the library — substring, case-insensitive, with type-ahead autocomplete and AND-combined filter tokens.
- **Loop** a clip from its start, or jump to a specific time. Manual seeking breaks the loop.
- Clips are tracked by a content hash, so you can rename or move files freely without breaking them.

## Demo

[![ClipMark Demo](https://img.youtube.com/vi/P4Rupk7zbEU/maxresdefault.jpg)](https://youtu.be/P4Rupk7zbEU)

## Requirements

- Node.js >= 20
- `ffmpeg` / `ffprobe` on your `PATH` (used to extract video durations and thumbnails)
- `yt-dlp` (optional, for **+ Download**) in `/opt/homebrew/bin`, `/usr/local/bin` or `/usr/bin` — `brew install yt-dlp`. Settings shows the detected version, or the install hint.
- A folder of `.mp4` / `.mov` dance videos

## Installation

Clone this repo and install dependencies:

```bash
git clone https://github.com/tianci216/clipmark.git
cd clipmark
npm install
```

## Migrating existing data

If you have a legacy `annotations.yaml` file in the repo root (from the old ClipMark), migrate it into the SQLite database before your first run:

```bash
npm run migrate
```

The migration is a one-shot, non-destructive import: it converts `MM:SS` times to seconds and inserts your videos, clips, and tags. It skips if the database already contains clips, and it leaves `annotations.yaml` in place as a safety net.

## Running

Start the server:

```bash
node server/index.js
```

Then open http://127.0.0.1:8899 in your browser.

The **Library Folder** (the folder of videos the app scans) is a setting the server owns. On first run the app opens Settings and asks for it — type the absolute path and save; it is validated (must exist and be a directory), stored in the SQLite database, and applied immediately, no restart needed. You can change it later from the gear button in the sidebar (or the phone header), from any browser including your phone over Tailscale.

To pre-fill the folder on a fresh database (for scripts or the macOS app), set `CLIPMARK_VIDEO_DIR`; it is used once as the first-run seed and never overrides a saved setting:

```bash
CLIPMARK_VIDEO_DIR="$HOME/Videos/Dance" node server/index.js
```

Upgrading an existing install: databases created before the Library Folder became a setting hold folder-relative video paths. They are migrated to absolute paths the first time a folder that actually contains those files is saved (or seeded), so either set `CLIPMARK_VIDEO_DIR` to your old folder for the first launch, or type it into Settings.

The server binds `0.0.0.0:8899` so it works over Tailscale on your phone; Settings shows the `http://<Tailscale IP>:8899` address to type there, with a LAN fallback.

Notes:

- `node server/index.js` runs the compiled server. If the `server/*.js` build output isn't present yet (it's gitignored), build it first with `npm run build`, which compiles both the server and the client (`dist/`). `npm start` is a shortcut that builds the server and runs it — on a fresh checkout run `npm run build` once first so the client is served too.
- For development with hot reload (Vite dev server proxying to Express), use `npm run dev`.

## Quick Use

Add a function to your `~/.zshrc` (or `~/.bashrc`) so you can launch ClipMark from anywhere:

```bash
clipmark() {
    node /path/to/clipmark/server/index.js &
    open "http://127.0.0.1:8899"
}
```

Replace `/path/to/clipmark` with the actual path where you cloned the repo. Then reload your profile:

```bash
source ~/.zshrc   # or source ~/.bashrc
```

Now you can launch ClipMark from anywhere with `clipmark`. The Library Folder is remembered between launches; change it from Settings.

## Features

- **Library home** — the app opens on a library of all your saved clips, in two tabs:
  - **Clips** — every saved clip, filterable by tag.
  - **Videos** — every video on disk, with its duration, thumbnail, and clip count.
- **Tag filter** — type to get autocomplete suggestions (substring, case-insensitive, frequency-ranked). Committed tags become removable pills that combine as AND. Unknown tags commit too, with an honest "no clips match" empty state.
- **Clip cards** — a real frame thumbnail, the `MM:SS → MM:SS` time range, the tags as title, the video name, and the note. Click a clip card to jump straight into that clip, looping.
- **Video cards** — a frame thumbnail, duration, and `n clips · first at MM:SS`. Click a video card to open it normally, no loop.
- **Player page** — the video with a mark deck. Press IN and OUT at the current playback position, add comma-separated tags and a note, and save. Saving rejects an end time at or before the start time. The timeline draws your saved clips as segments; clicking a clip's start loops it, clicking its end seeks and plays once.
- **Related rail** — the player shows this video's other clips (loop or remove each), then clips from other videos that share a tag, ranked by how many tags they share.
- **State preserved** — going back from the player returns you to your exact spot: tab, filter, and scroll position.
- **Mobile** — works on a phone over Tailscale: single-column grid and a stacked player.

- **+ Download** — paste a link, pick the top level or any existing subfolder, press Download. yt-dlp fetches the video in the background (one at a time, in order) as `<title> [<id>].mp4` — H.264/AAC so the player can scrub it, one video even from a playlist link. The in-flight Download shows as a row inside its folder with a progress bar, Cancel (removes any `.part`/`.ytdl` leftovers) or, on failure, yt-dlp's error and Dismiss. When it lands the library refreshes and a toast offers Open. Downloads are in-memory: a restart forgets the queue.
- **Cookies from browser** — yt-dlp reads Chrome's cookies by default (Settings: none / Chrome / Safari / Firefox) so links that fail anonymously succeed. The first read triggers a one-time macOS Keychain prompt on the Mac — press **Test cookie access** in Settings to grant it up front; a Download started from your phone that shows no progress is probably waiting on that prompt. Chrome may need to be closed while its cookies are read.
- **Settings** — the Library Folder field with a readback of the resolved path and how many videos were found, plus the Tailscale and LAN addresses to type on your phone (with Copy). Clips on videos outside the current Library Folder are hidden, not deleted, so switching folders is reversible.

All clip data is saved locally in a SQLite database at `data/clipmark.db` (or `$CLIPMARK_DATA_DIR/clipmark.db`). Videos are tracked by a content hash, so renaming or moving files within the Library Folder won't break your clips.

## Development

- `npm run dev` — Vite dev server (with hot reload) proxying `/api`, `/video`, and `/thumbnails` to a `tsx watch` Express process.
- `npm run build` — builds both the server (`server/*.js`) and the client (`dist/`).
- `npm test` — vitest suite covering the SQLite store, the scanner, the YAML migration importer, the library tree model, and an HTTP-level suite over the Express app (settings, live folder apply, hidden clips, address derivation, the Download queue with a scripted fake downloader: order, progress, completion, cancel cleanup, failure, folder validation, cookie test, yt-dlp status).
- `npm run typecheck` — type-checks both client and server.
