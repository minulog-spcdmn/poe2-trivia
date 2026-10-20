// The faces the start page doesn't draw with, loaded ahead in an idle moment.
//
// A face loads the first time text set in it shows, and once it has loaded
// the browser lays the whole page out again ("fonts changed"), every box of
// it. On the start page that is next to nothing; on the codex, with its five
// hundred tiles, it was a 25 ms frame in the middle of an item opening (the
// tooltip's Fontin, the record's EB Garamond 500) or of the codex coming in
// (its title's Cinzel Black). Loaded while the start page shows, they are
// there before any of those screens (and the codex, opened sooner, waits a
// moment for them: App.svelte).

import { whenIdle } from './idle';
import { savingData } from './saveData';

/** The faces, as `document.fonts.load` takes them: a weight and style, and the app.css variable naming the family (the codex's title, the tooltips (ItemDetails) and the record). */
const LATER = [
  ['900', '--font-cinzel'],
  ['400', '--font-tooltip'],
  ['italic 400', '--font-tooltip-italic'],
  ['500', '--font-body'],
] as const;

let loading: Promise<void> | null = null;

/** Loads the faces now (once), resolving when they're in or have failed. */
export function loadFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve();
  return (loading ??= (() => {
    const root = getComputedStyle(document.documentElement);
    return Promise.all(
      LATER.map(([face, family]) => {
        // Its first family only: the fallbacks after it would load faces of their own.
        const first = root.getPropertyValue(family).split(',')[0].trim();
        return first ? document.fonts.load(`${face} 16px ${first}`).catch(() => {}) : undefined;
      }),
    ).then(() => {});
  })());
}

/** Loads the faces other screens use once the page is idle (a face the page already has costs nothing); not with Save-Data on. */
export function loadFontsAhead() {
  if (savingData()) return;
  whenIdle(() => void loadFonts(), { timeout: 3000, fallback: 1000 });
}
