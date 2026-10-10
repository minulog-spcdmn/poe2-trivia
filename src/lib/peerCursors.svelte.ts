// The pointers of the other players in the room, as last heard (cursors.ts),
// for PeerCursors.svelte to draw. Only which pointers there are is reactive:
// where they are changes ten times a second, and is read every frame instead.

import type { CursorAt } from './cursors.ts';

export interface PeerCursor {
  at: CursorAt;
  /** When it last moved (performance.now). */
  moved: number;
}

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
    this.at.set(key, { at, moved: performance.now() });
  }

  clear() {
    this.at.clear();
    if (this.keys.length) this.keys = [];
  }
}

export const peerCursors = new PeerCursors();
