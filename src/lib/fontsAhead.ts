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
  if (loading || typeof document === 'undefined' || !document.fonts) return loading ?? Promise.resolve();
  const root = getComputedStyle(document.documentElement);
  // Each one's first family only: the fallbacks after it would load faces of their own.
  const fonts = LATER.map(([face, family]) => [face, root.getPropertyValue(family).split(',')[0].trim()] as const).filter(([, first]) => first);
  // (None found: the stylesheet isn't in yet, so not this time.)
  if (!fonts.length) return Promise.resolve();
  return (loading = Promise.all(fonts.map(([face, first]) => document.fonts.load(`${face} 16px ${first}`).catch(() => {}))).then(() => {}));
}

/** Loads the faces other screens use once the page is idle (a face the page already has costs nothing); not with Save-Data on. */
export function loadFontsAhead() {
  if (savingData()) return;
  whenIdle(() => void loadFonts(), { timeout: 3000, fallback: 1000 });
}
