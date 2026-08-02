# React + TypeScript frontend built with Vite

We're rebuilding Clipmark's frontend from scratch in React, bundled with Vite. React's component model fits the UI's shape (file tree, player controls, clip cards, search results), and the aesthetic rebuild — custom timeline, animated transitions — is where declarative rendering pays off. We keep it lean: no Redux, no router, one page, local component state plus a couple of context hooks. The existing custom CSS design language (dark/gold, Instrument Serif + DM Sans) carries over rather than switching to Tailwind.

Note: The aesthetic direction (visual identity, custom player/scrubber, layout) is deliberately NOT decided here — it will be explored in a separate frontend prototype session after the port. Feature parity is preserved meanwhile.
