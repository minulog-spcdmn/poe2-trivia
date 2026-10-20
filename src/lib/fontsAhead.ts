// The faces the start page doesn't draw with, loaded ahead in an idle moment.
//
// A face loads the first time text set in it shows, and once it has loaded
// the browser lays the whole page out again ("fonts changed"), every box of
// it. On the start page that is next to nothing; on the codex, with its five
// hundred tiles, it was a 25 ms frame in the middle of an item opening (the
// tooltip's Fontin, the record's EB Garamond 500) or of the codex coming in
// (its title's Cinzel Black). Loaded while the start page shows, they are
// there before any of those screens.

import { whenIdle } from './idle';

/** As `document.fonts.load` takes them: the faces the codex, the tooltips (ItemDetails) and the record use. */
const LATER = ['400 16px "Fontin SmallCaps"', 'italic 400 16px Fontin', '900 16px Cinzel', '500 16px "EB Garamond"'];

/** Loads the faces other screens use once the page is idle (a face the page already has costs nothing). */
export function loadFontsAhead() {
  if (typeof document === 'undefined' || !document.fonts) return;
  whenIdle(
    () => {
      for (const font of LATER) void document.fonts.load(font).catch(() => {});
    },
    { timeout: 3000, fallback: 1000 },
  );
}
