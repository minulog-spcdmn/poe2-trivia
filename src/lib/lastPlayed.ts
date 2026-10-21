// What the game's own save on this device says about its play, as a visit
// is counted with it (count.ts countVisit): when it first and last had a
// question answered, from the codex, which every game and the Daily write
// to. This device's own codex only, not what paired devices passed on.

import type { Played } from './count.ts';
import { ownCodexRaw, parseCodex } from './codex.ts';

/** How far ahead a time may be and still count: a guest's entries carry the host's clock. */
const AHEAD_MS = 3_600_000;

/** When this device's codex first and last had a question answered, leaving out times from a clock far ahead of `now`; null for none. */
export function playedIn(raw: string | null, now: number): Played | null {
  const items = parseCodex(raw)?.items ?? {};
  let p: Played | null = null;
  for (const e of Object.values(items)) {
    if (e.last > now + AHEAD_MS) continue;
    p = p ? { first: Math.min(p.first, e.first), last: Math.max(p.last, e.last) } : { first: e.first, last: e.last };
  }
  return p;
}

export const lastPlayed = () => playedIn(ownCodexRaw(), Date.now());
