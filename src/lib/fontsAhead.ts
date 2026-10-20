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
import { savingData } from './saveData';

/** The faces, as `document.fonts.load` takes them: a weight and style, and the app.css variable naming the family (the codex's title, the tooltips (ItemDetails) and the record). */
const LATER = [
  ['900', '--font-cinzel'],
  ['400', '--font-tooltip'],
  ['italic 400', '--font-tooltip-italic'],
  ['500', '--font-body'],
] as const;

/** Loads the faces other screens use once the page is idle (a face the page already has costs nothing); not with Save-Data on. */
export function loadFontsAhead() {
  if (typeof document === 'undefined' || !document.fonts || savingData()) return;
  whenIdle(
    () => {
      const root = getComputedStyle(document.documentElement);
      for (const [face, family] of LATER) {
        // Its first family only: the fallbacks after it would load faces of their own.
        const first = root.getPropertyValue(family).split(',')[0].trim();
        if (first) void document.fonts.load(`${face} 16px ${first}`).catch(() => {});
      }
    },
    { timeout: 3000, fallback: 1000 },
  );
}
