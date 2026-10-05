# Project notes

- Never use em dashes anywhere in the project (UI text, HTML, docs, comments). Use a bullet (•) instead, or a semicolon in sentences set in the body font (EB Garamond), where bullets look out of place. `tests/style.test.ts` enforces this.
- The display font is Maragsâ Display (`src/assets/fonts/maragsa-display.woff2`). Its license only allows serving it as WOFF/WOFF2 through `@font-face`, so don't add the OTF. Its digits don't fit the UI, so its `@font-face` leaves out 0-9, + and − and they render in Cinzel. The name PoE2.Quest (start page title, header button) keeps Maragsâ digits (`--font-title`). Room codes, the in-game header and avatars use Cinzel (`--font-cinzel`).
- Phones down to 375px wide are supported (the in-game layout is tuned for that); narrower screens such as 320px aren't a target.
- Arcane or alchemical visuals (rune circles, seals, sigils, ornaments) follow `docs/arcane-style.md`; read it, and the reference `src/components/ArcaneCircle.svelte`, before drawing or animating anything in that style.
- Write `:hover` styles plainly: a PostCSS step in `vite.config.ts` moves every `:hover` selector into `@media (hover: hover)`, so touch screens never get a sticky hover after a tap. JS hover effects check `pointerType === 'mouse'` instead.
