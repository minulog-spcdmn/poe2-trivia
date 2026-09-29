# Project notes

- Never use em dashes anywhere in the project (UI text, HTML, docs, comments). Use a bullet (•) instead. `tests/style.test.ts` enforces this.
- The display font is Maragsâ Display (`src/assets/fonts/maragsa-display.woff2`). Its license only allows serving it as WOFF/WOFF2 through `@font-face`, so don't add the OTF. Its digits don't fit the UI, so its `@font-face` leaves 0-9 out and digits render in Cinzel.
