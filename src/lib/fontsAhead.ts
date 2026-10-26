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
//
// The lobby draws with one of them, though: its room code and the players'
// avatars are set in Cinzel Black. So on the way into a room that one comes
// at once, at the tap, and downloads while the room connects (App.svelte),
// rather than as the code's letters drop in, swapped mid-fall; the other
// three still wait for the page to settle.

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

/** Loads these faces, resolving when they're in or have failed; false when no family was found. */
function load(faces: readonly (typeof LATER)[number][]): Promise<void> | false {
  const root = getComputedStyle(document.documentElement);
  // Each one's first family only: the fallbacks after it would load faces of their own.
  const fonts = faces.map(([face, family]) => [face, root.getPropertyValue(family).split(',')[0].trim()] as const).filter(([, first]) => first);
  if (!fonts.length) return false;
  return Promise.all(fonts.map(([face, first]) => document.fonts.load(`${face} 16px ${first}`).catch(() => {}))).then(() => {});
}

/** Loads the faces now (once), resolving when they're in or have failed. */
export function loadFonts(): Promise<void> {
  if (loading || typeof document === 'undefined' || !document.fonts) return loading ?? Promise.resolve();
  const all = load(LATER);
  // (None found: the stylesheet isn't in yet, so not this time.)
  if (!all) return Promise.resolve();
  return (loading = all);
}

let lobbyFace = false;

/**
 * On the way into a room: the lobby's own face (Cinzel Black), once, unless
 * the four are on their way already. Only that one: the other three are for
 * the item windows and the codex, and at the tap they would share the link
 * with what the room waits for (the lobby, PeerJS), and their decoding would
 * land on the swap into the lobby. They are left to the settled queue
 * (loadFontsAhead), which takes all four in one moment, this one costing
 * nothing again.
 */
export function loadRoomFonts() {
  if (lobbyFace || loading || typeof document === 'undefined' || !document.fonts) return;
  lobbyFace = load([LATER[0]]) !== false;
}

/** Loads the faces other screens use ahead, all in one settled moment (a face the page already has costs nothing); not with Save-Data on. Returns what takes it back if it hasn't run. */
export function loadFontsAhead(): () => void {
  if (savingData()) return () => {};
  return whenSettled(loadFonts);
}
