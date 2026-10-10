// The pointers of the other players in the room, as last heard (cursors.ts),
// for PeerCursors.svelte to draw. Only which pointers there are is reactive:
// where they are changes ten times a second, and is read every frame instead.

import { SEND_EVERY_MS, type CursorAt } from './cursors.ts';

export interface PeerCursor {
  at: CursorAt;
  /** When it last moved (performance.now). */
  moved: number;
  /** The last few places it was heard to be, and when, oldest first: drawn along a curve through them (cursors.ts trailAt). */
  trail: { at: CursorAt; t: number }[];
}

/** How many places a pointer's trail keeps; heard again after this long (ms), it had been resting. */
const TRAIL = 4;
const REST_MS = 250;

class PeerCursors {
  /** Whose pointers there are (cursorKey of their ids). */
  keys = $state<string[]>([]);
  readonly at = new Map<string, PeerCursor>();

  set(key: string, at: CursorAt | null) {
    if (!at) {
      if (this.at.delete(key)) this.keys = this.keys.filter((k) => k !== key);
      return;
    }
    if (!this.at.has(key)) this.keys = [...this.keys, key];
    const now = performance.now();
    const before = this.at.get(key)?.trail ?? [];
    const last = before.at(-1);
    // After a rest, it stood where it was until just before this: it sets off now, not slowly all the while.
    const rested = last && now - last.t > REST_MS ? [{ at: last.at, t: now - SEND_EVERY_MS }] : [];
    const trail = [...before, ...rested, { at, t: now }].slice(-TRAIL);
    this.at.set(key, { at, moved: now, trail });
  }

  clear() {
    this.at.clear();
    if (this.keys.length) this.keys = [];
  }
}

export const peerCursors = new PeerCursors();
