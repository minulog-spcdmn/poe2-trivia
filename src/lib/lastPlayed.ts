// What the game's save says about the player's play, as a visit is counted
// with it (count.ts countVisit): when they first and last had a question
// answered, from the codex, which every game and the Daily write to. This
// device's own and the copies its paired devices passed on (lib/sync), so
// it speaks for the player rather than the device: one who moves from their
// computer to their phone neither looks new there nor starts a cohort of
// their own. (Copies are as fresh as the last sync: near enough by the day.)
// Read as the start page reads it (loadCodex, its combining kept until the
// copies change), so a paired player's costs nothing more; a whole codex at
// its largest (every item, a full log: about 400 KB) takes a few ms to read.

import type { Played } from './count.ts';
import { loadCodex, type Codex } from './codex.ts';

/** How far ahead a time may be and still count: a guest's entries carry the host's clock. */
const AHEAD_MS = 3_600_000;

/** When the codexes first and last had a question answered, leaving out times from a clock far ahead of `now`; null for none. */
export function playedIn(codexes: (Codex | null)[], now: number): Played | null {
  let p: Played | null = null;
  for (const c of codexes)
    for (const e of Object.values(c?.items ?? {})) {
      // An entry whose last answer came from a clock ahead (its devices' combined, or a guest's) still holds its first.
      const last = e.last <= now + AHEAD_MS ? e.last : e.first;
      if (last > now + AHEAD_MS) continue;
      p = p ? { first: Math.min(p.first, e.first), last: Math.max(p.last, last) } : { first: e.first, last };
    }
  return p;
}

export const lastPlayed = () => playedIn([loadCodex()], Date.now());
