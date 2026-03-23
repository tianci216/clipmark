# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Clipmark is a dance video bookmark/annotation tool. Users browse a directory of videos, play them, mark time ranges as clips, and tag/annotate clips. Data persists in a local `annotations.yaml` file (gitignored).

## Running the App

```bash
python server.py [video_directory]
```

- Default video directory: `/Users/tianci/Documents/Swing & Jazz`
- Runs on `http://127.0.0.1:8899`
- Dependencies: `flask`, `pyyaml` (no requirements.txt — install manually via pip)
- No test suite, linter, or build step configured

## Architecture

**Single-page Flask app with two files:**

- `server.py` — Flask backend with REST API and YAML-based persistence
- `templates/index.html` — Entire frontend (HTML + CSS + vanilla JS) in one file

**API endpoints:**
- `GET /api/tree` — directory tree of `.mp4`/`.mov` files
- `GET /video/<path>` — serves video with HTTP range requests (206)
- `GET /api/annotations` — all saved annotations
- `POST /api/annotations` — create clip (body: file, start, end, tags, note)
- `DELETE /api/annotations` — remove clip (body: file, start, end)
- `GET /api/search?tag=<query>` — search clips by tag

**Data format** (`annotations.yaml`):
```yaml
videos:
  - file: "path/to/video.mp4"
    clips:
      - start: "MM:SS"
        end: "MM:SS"
        tags: ["tag1"]
        note: "text"
```
