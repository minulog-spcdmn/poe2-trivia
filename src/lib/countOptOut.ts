// The visitor counts' opt-out: a flag in this browser's storage that keeps
// count.ts from sending anything, as does a browser sending Global Privacy
// Control. Set by the privacy page's "Stop counting" (datenschutz.html,
// src/legal/countToggle.ts) and by opening poe2.quest/#toggle-goatcounter
// (count.ts onCountToggle). Its own module so the privacy page needn't load
// the game to read or set it.

import { readKey, removeKey, writeKey } from './storage.ts';

/**
 * A whole key, the same in every channel (the beta's privacy page shares the
 * live game's origin, and an opt-out set there must hold for the live game),
 * and apart from every channel's own keys (`poe2trivia.` and the rest, see
 * storage.ts), so nothing that clears a channel's keys clears it.
 */
export const OPT_OUT_KEY = 'poe2trivia-shared.noCount';

/** Where #toggle-goatcounter kept it before it moved here: still honoured, and cleared with it. */
const OLD_KEY = 'poe2trivia.skipCount';

/** Whether this browser asked not to be counted. */
export const countOptedOut = () => readKey(OPT_OUT_KEY) !== null || readKey(OLD_KEY) !== null;

/** Sets it; whether it held. */
export function setCountOptedOut(out: boolean): boolean {
  if (out) return writeKey(OPT_OUT_KEY, '1');
  removeKey(OPT_OUT_KEY);
  removeKey(OLD_KEY);
  return !countOptedOut();
}

/** The browser sends Global Privacy Control: the visitor asked every site not to track them. */
export const privacySignal = (nav: Navigator | undefined = typeof navigator === 'undefined' ? undefined : navigator): boolean =>
  (nav as (Navigator & { globalPrivacyControl?: boolean }) | undefined)?.globalPrivacyControl === true;

/** Whether nothing may be counted from this browser. */
export const notCounted = () => countOptedOut() || privacySignal();

export type Lang = 'de' | 'en';

const TEXT = {
  de: {
    counted: 'Ihre Besuche werden gezählt.',
    notCounted: 'Ihre Besuche werden nicht mehr gezählt.',
    signal: 'Ihre Besuche werden nicht gezählt: Ihr Browser sendet das Signal „Global Privacy Control“.',
    stop: 'Zählung abschalten',
    start: 'Zählung wieder einschalten',
    failed: 'Ihr Browser erlaubt dieser Seite nicht, etwas zu speichern. Die Zählung lässt sich hier daher nicht abschalten.',
  },
  en: {
    counted: 'Your visits are counted.',
    notCounted: 'Your visits are no longer counted.',
    signal: 'Your visits are not counted: your browser sends Global Privacy Control.',
    stop: 'Stop counting',
    start: 'Count again',
    failed: "Your browser doesn't let this page save anything, so counting can't be switched off here.",
  },
};

/** What the privacy page's switch says: its state, and its button's label (none when the browser's signal settles it). */
export function switchText(lang: Lang, s: { out: boolean; signal: boolean; failed: boolean }): { state: string; button: string | null } {
  const t = TEXT[lang];
  if (s.signal) return { state: t.signal, button: null };
  return { state: s.failed ? t.failed : s.out ? t.notCounted : t.counted, button: s.out ? t.start : t.stop };
}
