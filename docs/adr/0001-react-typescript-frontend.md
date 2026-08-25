# React + TypeScript frontend built with Vite

We're rebuilding Clipmark's frontend from scratch in React, bundled with Vite. React's component model fits the UI's shape (file tree, player controls, clip cards, search results), and the aesthetic rebuild — custom timeline, animated transitions — is where declarative rendering pays off. We keep it lean: no Redux, no router, one page, local component state plus a couple of context hooks. The existing custom CSS design language (dark/gold, Instrument Serif + DM Sans) carries over rather than switching to Tailwind.

Note: The aesthetic direction (visual identity, custom player/scrubber, layout) is deliberately NOT decided here — it will be explored in a separate frontend prototype session after the port. Feature parity is preserved meanwhile.

---

**Amendment (2026-08-25, issue #12 / spec #11):** the "one page with two views" shape (Library ⇄ Player state machine) is replaced by a persistent Explorer shell: a sidebar holding the Folder › Video › Clip tree beside a main pane that shows either the folder-grouped index or the player; on phones (≤ 860px) the same tree becomes a Finder-style drill-down. Selection state (tag filter, target Video + loop Clip, drilled-into folder, scroll positions) still lives at the app root in local state — there is still no router and no URL-addressable views. The pure library tree model (`src/lib/libraryTree.ts`) drives every layout. The design was chosen from the prototype comparison on issue #9 (Variant B).
