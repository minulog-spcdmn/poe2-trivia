// Whether this player has started a game here: one past its lobby on this
// device (hosted, joined, watched, at one screen or a run alone), or on a
// device paired with it (lib/sync passes it on). The start page tells a
// newcomer by it (Home.svelte): Today's unique, which writes the codex,
// starts no game. Set once and never cleared.

import { readStored, storeKey, writeStored } from './storage.ts';

/** The name it is stored under. */
export const STARTED = 'started';
export const STARTED_KEY = storeKey(STARTED);

/** As stored: '1' once a game has started, null before. */
export const ownStartedRaw = () => readStored(STARTED);
/** Kept once read true: a game's every new state asks. */
let known = false;
export const hasStarted = () => known || (known = ownStartedRaw() === '1');

/** A game here is past its lobby. */
export function markStarted() {
  if (hasStarted()) return;
  known = writeStored(STARTED, '1');
}

/** Another device's (lib/sync): whether it changed this one's. */
export function absorbStarted(raw: string): boolean {
  if (raw !== '1' || hasStarted()) return false;
  markStarted();
  return known;
}
