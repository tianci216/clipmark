# SQLite schema: videos, clips, clip_tags

The store is normalized around the hash-keyed Video. Schema:

- `videos(hash TEXT PK, file TEXT NOT NULL)` — hash is the stable identity (content hash of first 64KB); `file` is display-only.
- `clips(id INTEGER PK AUTOINCREMENT, video_hash FK CASCADE, start_seconds REAL, end_seconds REAL, note TEXT)` — times stored as seconds (REAL), formatted `MM:SS` only at render time; `id` preserves YAML append order.
- `clip_tags(clip_id FK CASCADE, tag TEXT, PK(clip_id, tag))` — tags normalized so tag search is an indexed join, not a LIKE scan.
- Indexes on `clips(video_hash)` and `clip_tags(tag)`.
- Search becomes SQL (`JOIN clip_tags WHERE tag = ?`) instead of an in-memory scan.

Search semantics preserved from the original: substring, case-insensitive match over **tags only** (notes excluded), implemented as `WHERE tag LIKE '%query%'` — so "swing" still finds "swing out". The exact-match index is not used for leading-wildcard LIKE; acceptable at this scale.

Migration from YAML is mechanical: `MM:SS` → seconds, insert video → clips → tags.

A `CHECK (end_seconds > start_seconds)` enforces valid time ranges at the schema level; the API rejects `end <= start` with a friendly message. Clips are create/delete only — no in-place editing (delete + re-create), preserving the original model.

**Amended by ADR-0005:** `videos.file` is now an absolute path (migrated once on first run), and a fourth table `settings(key TEXT PK, value TEXT)` holds the server-owned Library Folder.

**Amended by ADR-0008:** Clips are now editable in place (times, Dancers, Tags, Note); "create/delete only" no longer holds. Dancers live in their own `clip_dancers` table beside `clip_tags`, and `clip_tags.tag` is stored lowercase.

**Amended by ADR-0009:** a `video_sources` table keyed by `videos.hash` holds a downloaded Video's Source.
