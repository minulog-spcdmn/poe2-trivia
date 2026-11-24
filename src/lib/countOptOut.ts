// The visitor counts' opt-out: a flag in this browser's storage that keeps
// count.ts from sending anything. Set by the privacy page's "Stop counting"
// (datenschutz.html, src/legal/countToggle.ts) and by opening
// poe2.quest/#toggle-goatcounter (count.ts onCountToggle). Its own module so
// the privacy page needn't load the game to read or set it. A browser sending
// Global Privacy Control is counted all the same (the owner's call, 24 Nov
// 2026): this switch is how to object, and the privacy page promises nothing
// about the signal.

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

/** Whether nothing may be counted from this browser. */
export const notCounted = () => countOptedOut();

export type Lang = 'de' | 'en';

const TEXT = {
  de: {
    counted: 'Ihre Besuche werden gezählt.',
    notCounted: 'Ihre Besuche werden nicht mehr gezählt.',
    stop: 'Zählung abschalten',
    start: 'Zählung wieder einschalten',
    failed: 'Ihr Browser erlaubt dieser Seite nicht, etwas zu speichern. Die Zählung lässt sich hier daher nicht abschalten.',
  },
  en: {
    counted: 'Your visits are counted.',
    notCounted: 'Your visits are no longer counted.',
    stop: 'Stop counting',
    start: 'Count again',
    failed: "Your browser doesn’t let this page save anything, so counting can’t be switched off here.",
  },
};

/** What the privacy page's switch says: its state, and its button's label. */
export function switchText(lang: Lang, s: { out: boolean; failed: boolean }): { state: string; button: string } {
  const t = TEXT[lang];
  return { state: s.failed ? t.failed : s.out ? t.notCounted : t.counted, button: s.out ? t.start : t.stop };
}
