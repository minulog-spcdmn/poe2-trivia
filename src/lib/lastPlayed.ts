// What the game's save says about the player's play, as a visit is counted
// with it (count.ts countVisit): when they first and last had a question
// answered, from the codex, which every game and the Daily write to. This
// device's own and the copies its paired devices passed on (lib/sync), so
// it speaks for the player rather than the device: one who moves from their
// computer to their phone neither looks new there nor starts a cohort of
// their own. (Copies are as fresh as the last sync: near enough by the day.)

import type { Played } from './count.ts';
import { ownCodexRaw, parseCodex, type Codex } from './codex.ts';
import { copiesOf } from './sync/store.ts';

/** How far ahead a time may be and still count: a guest's entries carry the host's clock. */
const AHEAD_MS = 3_600_000;

/** When the codexes first and last had a question answered, leaving out times from a clock far ahead of `now`; null for none. */
export function playedIn(codexes: (Codex | null)[], now: number): Played | null {
  let p: Played | null = null;
  for (const c of codexes)
    for (const e of Object.values(c?.items ?? {})) {
      if (e.last > now + AHEAD_MS) continue;
      p = p ? { first: Math.min(p.first, e.first), last: Math.max(p.last, e.last) } : { first: e.first, last: e.last };
    }
  return p;
}

export const lastPlayed = () => playedIn([parseCodex(ownCodexRaw()), ...copiesOf('codex', parseCodex)], Date.now());
