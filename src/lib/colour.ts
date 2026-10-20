// The avatar colour this browser's player would like (a seat's colour,
// lib/palette.ts, never ruby), kept in localStorage and sent as they join.
// A room gives it to them between games unless someone who asked for it
// first has it; otherwise they get the first free one, as without one.

import { isChoosableHue } from './palette.ts';
import { readStored, removeStored, storeKey, writeStored } from './storage.ts';

const NAME = 'colour';
/** The whole key, as storage events name it. */
export const COLOUR_KEY = storeKey(NAME);

/** The colour picked, if any (a PALETTE index). Always read fresh: another tab may have changed it. */
export function loadColour(): number | null {
  const raw = readStored(NAME);
  const h = raw === null ? NaN : Number(raw);
  return isChoosableHue(h) ? h : null;
}

/** Picks `h` (null: none, the seat's own). */
export const saveColour = (h: number | null) => (h === null ? removeStored(NAME) : writeStored(NAME, String(h)));
