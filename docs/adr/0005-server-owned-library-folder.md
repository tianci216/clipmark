# Server-owned Library Folder setting with absolute file paths

The Library Folder used to be a launch-time argument (hardcoded default, `argv`, or the macOS shell's UserDefaults), which cannot be changed from a browser or a phone over Tailscale. We decided the **server owns the setting**: it is stored in a `settings` table in `clipmark.db`, exposed over the API, and applied live (the next scan reads the new folder) — no relaunch, and the Swift shell no longer holds its own copy. An env var seeds the setting only on first run.

Because the folder can now change at runtime, `videos.file` is stored as an **absolute path** instead of a path relative to the folder (amends ADR-0004, which called `file` display-only). With relative paths, a same-named file in a different folder would hit the mtime cache and skip hashing — the wrong video would inherit the right Hash. Absolute paths make the cache invalidate by construction; Clips still bind to Videos by Hash, so moving files within a folder keeps working via reuse-by-hash.

Clips whose Video is outside the current Library Folder are hidden everywhere the library is shown, never deleted: switching folders is reversible, deletion is not.

Accepted trade-off: the server binds `0.0.0.0` so anything on the tailnet can change the folder or start a Download. This is a single-user tool and pasting links from a phone is a wanted feature; no auth is added.

Testing follows from the design: `createApp` takes the Store plus injected `scanDeps`, `networkInterfaces`, `env` and `port`, so the HTTP suite (`test/app.test.ts`) drives a real listener with an in-memory Store, temp folders and no ffmpeg or real network — the seam is the API, not the internals.
