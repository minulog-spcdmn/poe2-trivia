// What the player chose, the same on all their devices: the name they play
// under and the colour they'd like (lib/sync/shared.ts passes them on). Each
// device keeps when each was last chosen there, and the latest choice
// stands everywhere. A name this device can't play under (the held one,
// without the owner key: lib/names.ts) is never taken in.

import { COLOUR_NAME } from '../colour.ts';
import { NAME_STORED, cleanName, nameUsable } from '../names.ts';
import { isChoosableHue } from '../palette.ts';
import { onStoredHere, readStored, removeStored, writeStored } from '../storage.ts';

export type Choice = 'name' | 'colour';

/** Each choice: the entry it is stored under, and whether a value from another device may be kept here. */
const CHOICES: Record<Choice, { stored: string; fits: (v: string) => boolean }> = {
  name: { stored: NAME_STORED, fits: (v) => v === cleanName(v) && nameUsable(v) },
  colour: { stored: COLOUR_NAME, fits: (v) => /^\d+$/.test(v) && isChoosableHue(Number(v)) },
};
const choiceOf = (stored: string) => (Object.keys(CHOICES) as Choice[]).find((c) => CHOICES[c].stored === stored);

/** How far ahead of this device's clock a choice may be stamped (a day: past that it could never be changed back). */
const AHEAD_MS = 24 * 3600_000;

const STAMPS = 'sync.chosen';
type Stamps = Partial<Record<Choice, number>>;
const isStamp = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

function readStamps(): Stamps {
  try {
    const v: unknown = JSON.parse(readStored(STAMPS) ?? 'null');
    if (typeof v !== 'object' || v === null) return {};
    const out: Stamps = {};
    for (const c of Object.keys(CHOICES) as Choice[]) {
      const at = (v as Record<string, unknown>)[c];
      if (isStamp(at)) out[c] = at;
    }
    return out;
  } catch {
    return {};
  }
}
const stamp = (c: Choice, at: number) => writeStored(STAMPS, JSON.stringify({ ...readStamps(), [c]: at }));

/** Taking another device's in: its own time stands, not this write's. */
let taking = false;

/**
 * Stamps each choice as it is made in this browser (bootSync installs it,
 * paired or not, so the first pairing knows which is newer); returns what
 * stops it.
 */
export function stampChoices(): () => void {
  return onStoredHere((name) => {
    const c = choiceOf(name);
    if (c && !taking) stamp(c, Date.now());
  });
}

/** This device's choice, to send: its value (null: none) and when it was made (0: before that was kept); null when there is nothing to say. */
export function chosenNow(c: Choice): string | null {
  const v = readStored(CHOICES[c].stored);
  const at = readStamps()[c] ?? 0;
  return v === null && !at ? null : JSON.stringify({ v, at });
}

/**
 * Takes in another device's choice when it was made later than this one's
 * (or this one has none, and never chose: a new device). Whether it
 * changed anything.
 */
export function takeChosen(c: Choice, raw: string, now = Date.now()): boolean {
  let theirs: { v: string | null; at: number };
  try {
    const t: unknown = JSON.parse(raw);
    if (typeof t !== 'object' || t === null) return false;
    const { v, at } = t as Record<string, unknown>;
    if (!isStamp(at) || at > now + AHEAD_MS || (v !== null && typeof v !== 'string')) return false;
    theirs = { v, at };
  } catch {
    return false;
  }
  const { stored, fits } = CHOICES[c];
  if (theirs.v !== null && !fits(theirs.v)) return false;
  const mine = readStored(stored);
  const mineAt = readStamps()[c] ?? 0;
  const newer = theirs.at > mineAt || (!mineAt && mine === null && theirs.v !== null);
  if (!newer || theirs.v === mine) return false;
  taking = true;
  const ok = theirs.v === null ? removeStored(stored) : writeStored(stored, theirs.v);
  taking = false;
  if (ok && theirs.at > mineAt) stamp(c, theirs.at);
  return ok;
}
