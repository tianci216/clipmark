# Clipmark frontend prototype — NOTES.md

**Question this prototype answers:** *What should Clipmark look like?*

Throwaway exploration of the aesthetic direction (see `docs/adr/0001`). Do not
promote directly to production; rewrite the winner properly when folding it in.

## How to run

```sh
npm install       # once, from the prototype/ dir
npm run prototype # from repo root — starts Vite on http://localhost:5199
```

Open http://localhost:5199 and flip between variants with the floating bottom
bar, `←` / `→` arrows, or `?variant=A|B|C`.

## The variants (shared IA, three themes)

All three share one information architecture and behaviour (the "Clipmark app"
in `src/lib/`), differing only through theme CSS variables + signature elements:

| Key | Theme | Signature |
| --- | ----- | --------- |
| **A** | paper — "the video is the page" | Fraunces / Public Sans / IBM Plex Mono, bone paper, hairline cards. Quiet frame timecode. |
| **B** | editor — "power-tool timeline" | Space Grotesk / Inter / JetBrains Mono, dark. Custom scrubber draws clips as segments; cyan transport; loop bracket; I/O/S keyboard hints (I=IN, O=OUT, S=save). |
| **C** | vinyl — "the record shelf" | Bodoni Moda / Archivo / Space Mono, midnight + brass. Turntable: spinning vinyl + tonearm drops on loop. Cards are mini record sleeves. |

**Current lean (2026-08-01):** the paper theme (A) is the favourite, but with
the editor theme's **clip-on-timeline visualization** added to its player —
the shared `ScrubberTrack` now renders in both paper and editor, styled per
theme (paper: quiet hairline track, rust segments; editor: gold segments +
transport bar).

## Locked decisions (grilling session, 2026-08-01)

1. **Library home replaces the file tree and header search** everywhere.
2. **Two tabs** — *Clips* (default, all saved clips) and *Videos* (the files).
3. **Tag filter input** (not chips): type-ahead autocomplete against a tag
   index (substring, case-insensitive, frequency-ranked); comma/Enter/click
   commits a removable token; tokens combine as **AND**; unknown tags commit
   anyway → honest empty state.
4. **Filter per tab:** Clips → clips matching all tokens; Videos → videos
   containing a clip matching all tokens.
5. **Two views** (state, no router): Library ⇄ Player. Back returns, preserving
   tab, tokens, and library scroll.
6. **Player = YouTube watch page:** player + mark deck left; right rail = this
   video's clips (loop/remove, by start) + "From your library" (other videos'
   clips sharing ≥1 tag, ranked by shared-tag count then start). Rail hidden if
   nothing shares a tag.
7. **Clip card:** frame + `MM:SS → MM:SS` badge, title = tags, subtitle = video
   name, note if present. Click → loads video & loops that clip.
8. **Video card:** frame + `n clips` badge, title = name, subtitle = "n clips ·
   first at MM:SS". Click → opens video, no loop.
9. **Behavior parity:** IN/OUT → save rejects `end ≤ start`; create/delete only;
   clip start loops; manual seek breaks loop; clip end plays once; substring
   case-insensitive tag search. Mobile: single-column grid, stacked player.

## Implementation notes

- `src/lib/ClipmarkApp.tsx` — state machine (view/tab/tokens/in-memory clips).
- `src/lib/LibraryView.tsx` + `TagFilter.tsx` + `Cards.tsx` — the library.
- `src/lib/PlayerView.tsx` — watch page + rail recipe (`railFor`).
- `src/lib/Signatures.tsx` — editor scrubber + vinyl turntable.
- `src/lib/clipmark.css` — structural CSS via CSS custom properties; themes in
  `src/themes/{paper,editor,vinyl}.css`.
- Data is the real `annotations.yaml` content frozen in `src/data.ts`; player is
  simulated (`src/useSimulatedPlayer.ts`); no backend needed.

## Verdict

**WINNER: Variant A — paper ("the video is the page"), with the editor theme's
clip-on-timeline visualization added to its player** (decided 2026-08-01).

Why: the paper aesthetic — bone paper, black ink, one rust signal, Fraunces /
Public Sans / IBM Plex Mono, hairline cards — was preferred over the editor and
vinyl themes. The one thing borrowed from B was the scrubber that draws clips as
segments on the timeline (already folded into A's player via `ScrubberTrack`).

Remaining work to fold the winner into the real port:

1. Record this ADR-style in the repo (`docs/adr/`).
2. Delete the losing themes (`src/themes/editor.css`, `src/themes/vinyl.css`),
   their signature components in `src/lib/Signatures.tsx` (Turntable,
   TransportScrubber), and the variant switcher.
3. Move mock data + simulated player out; wire real `/api/*` endpoints and a
   real `<video>` element.
