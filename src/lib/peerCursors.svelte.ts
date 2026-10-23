// The pointers of the other players in the room, as last heard (cursors.ts),
// for PeerCursors.svelte to draw. Only which pointers there are is reactive:
// where they are changes twenty times a second, and is read every frame instead.

import { SEND_EVERY_MS, paced, type CursorAt, type Pace } from './cursors.ts';

export interface PeerCursor {
  at: CursorAt;
  /** When it last moved (performance.now). */
  moved: number;
  /** The last few places it was heard to be, and when each was sent (on this clock: cursors.ts paced), oldest first: drawn along a curve through them (cursors.ts trailAt). */
  trail: { at: CursorAt; t: number }[];
  /** Its sender's clock, as this screen keeps it (cursors.ts paced); none while its places come unstamped. */
  pace?: Pace;
}

/** How many places a pointer's trail keeps (more than BEHIND_MS's worth, PeerCursors.svelte, with clicks among them); heard again after this long (ms), it had been resting. */
const TRAIL = 8;
const REST_MS = 250;

class PeerCursors {
  /** Whose pointers there are (cursorKey of their ids). */
  keys = $state<string[]>([]);
  readonly at = new Map<string, PeerCursor>();
  /** Told of every pointer heard, as it is (lib/recorder.ts). */
  private listeners = new Set<(key: string, at: CursorAt | null) => void>();

  /** Hears every pointer as it comes; returns how to stop. */
  listen(fn: (key: string, at: CursorAt | null) => void) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  /** Where the pointer `key` is now, sent at `ms` on its sender's clock (its stamp, cursors.ts STAMP), if it says; null when it's gone. */
  set(key: string, at: CursorAt | null, ms?: number) {
    for (const fn of this.listeners) fn(key, at);
    if (!at) {
      if (this.at.delete(key)) this.keys = this.keys.filter((k) => k !== key);
      return;
    }
    if (!this.at.has(key)) this.keys = [...this.keys, key];
    const now = performance.now();
    const was = this.at.get(key);
    const before = was?.trail ?? [];
    const last = before.at(-1);
    // When it was sent, by its stamp; never before the place before it (the link at its quickest just got quicker).
    const sent = ms === undefined ? null : paced(was?.pace, ms, now);
    const t = Math.max(sent?.t ?? now, (last?.t ?? -Infinity) + 1);
    // After a rest, it stood where it was until just before this: it sets off now, not slowly all the while.
    const rested = last && was && now - was.moved > REST_MS && t - SEND_EVERY_MS > last.t ? [{ at: last.at, t: t - SEND_EVERY_MS }] : [];
    const trail = [...before, ...rested, { at, t }].slice(-TRAIL);
    this.at.set(key, { at, moved: now, trail, pace: sent?.pace });
  }

  clear() {
    this.at.clear();
    if (this.keys.length) this.keys = [];
  }
}

export const peerCursors = new PeerCursors();
