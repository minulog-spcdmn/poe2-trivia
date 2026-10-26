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
// in the middle of today's circle drawing itself in. So one face at a time,
// each once the page has settled (lib/settled.ts: after the start page's
// entrance, the next after the last is in), a quarter of the work each.

import { whenSettled } from './settled';
import { savingData } from './saveData';

/** The faces, as `document.fonts.load` takes them: a weight and style, and the app.css variable naming the family (the codex's title, the tooltips (ItemDetails) and the record). */
const LATER = [
  ['900', '--font-cinzel'],
  ['400', '--font-tooltip'],
  ['italic 400', '--font-tooltip-italic'],
  ['500', '--font-body'],
] as const;

/** Each face's load once asked for, by its place in LATER. */
const faces = new Map<number, Promise<void>>();

/** Loads LATER's `i`th face now (once), resolving when it's in or has failed; not yet if the stylesheet isn't in. */
function loadFace(i: number): Promise<void> {
  const had = faces.get(i);
  if (had || typeof document === 'undefined' || !document.fonts) return had ?? Promise.resolve();
  const [face, family] = LATER[i];
  // Its first family only: the fallbacks after it would load faces of their own.
  const first = getComputedStyle(document.documentElement).getPropertyValue(family).split(',')[0].trim();
  // (None found: the stylesheet isn't in yet, so not this time.)
  if (!first) return Promise.resolve();
  const loaded = document.fonts.load(`${face} 16px ${first}`).then(
    () => {},
    () => {},
  );
  faces.set(i, loaded);
  return loaded;
}

/** Loads the faces now (those not in yet, all at once), resolving when they're in or have failed. */
export function loadFonts(): Promise<void> {
  return Promise.all(LATER.map((_, i) => loadFace(i))).then(() => {});
}

/** Loads the faces other screens use ahead, one each time the page has settled (a face the page already has costs nothing); not with Save-Data on. */
export function loadFontsAhead() {
  if (savingData()) return;
  LATER.forEach((_, i) => whenSettled(() => loadFace(i)));
}
