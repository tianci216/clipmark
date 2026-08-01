# Node.js + Express TypeScript backend

The Flask backend is ported to a single Node.js (≥20) + Express + TypeScript process that serves all three jobs the Flask app did: static frontend, `/video/<path>` with HTTP range streaming, and the clip CRUD/search API. Kept on port 8899 so the `clipmark()` shell alias and Tailscale setup are unchanged. TypeScript compiled with `tsc` (or run via `tsx` in dev); Express chosen over Bun/Deno/Fastify for the most well-trodden range-streaming path and boring, portable runtime.

Route shape stays the same as the Flask app (`/api/tree`, `/video/<path>`, `/api/annotations`, `/api/search`), but all annotation CRUD paths are renamed `annotations` → `clips` (`GET /api/clips`, `POST /api/clips`, `DELETE /api/clips`) to match the canonical domain term. Internally the backend is restructured around SQLite.

CLI contract is preserved byte-identical: `node server/index.js [video_dir]` with the `/Users/tianci/Documents/Swing & Jazz` default, `0.0.0.0` bind for Tailscale, port 8899.

A small test layer (vitest) covers the deterministic backend logic — the SQLite store, `MM:SS`↔seconds conversion, and the migration importer — since the importer converts real data once. No frontend component or E2E tests for now; the UI churns in the prototype session.

Dev workflow: Vite dev server proxies `/api` and `/video` to Express; production runs Express serving the built `dist/` plus the API from the single port 8899. Video streaming fixes a latent bug — MIME types are served by extension (`video/quicktime` for `.mov`), not hardcoded to `video/mp4`.
