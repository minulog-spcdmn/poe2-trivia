// The faces the start page doesn't draw with, loaded ahead once it has settled.
//
// A face loads the first time text set in it shows, and once it has loaded
// the browser lays the whole page out again ("fonts changed"), every box of
// it. On the codex, with its five hundred tiles, that was a 25 ms frame in
// the middle of an item opening (the tooltip's Fontin, the record's EB
// Garamond 500) or of the codex coming in (its title's Cinzel Black). Loaded
// while the start page shows, they are there before any of those screens
// (and the codex, opened sooner, waits a moment for them: App.svelte).
//
// Not nothing on the start page either, on a phone: all four at once were a
// 59 to 64 ms frame decoding them on the iPhone and a 44 ms one laying the
// page out again, and on the timer Safari had for an idle moment they came
// in the middle of today's circle drawing itself in. So they wait for the
// page to settle (lib/settled.ts: after the start page's entrance). And all
// four still come in one go: the laying out is the font set changing, not
// the faces in it (four faces no element used cost the iPhone the same 44
// ms), so one face at a time would lay the page out four times over.

import { whenSettled } from './settled';
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

/** Loads the faces other screens use ahead, all in one settled moment (a face the page already has costs nothing); not with Save-Data on. Returns what takes it back if it hasn't run. */
export function loadFontsAhead(): () => void {
  if (savingData()) return () => {};
  return whenSettled(loadFonts);
}
