// Craft's pictures. Like a question's art (media.svelte.ts), an item's
// picture never goes out as its file while it is in play: the host draws it
// as it looks now (the art a Chaos Orb swapped in, the patches a veil hides
// cut out) and sends it to the one player meant to see it, the item's maker
// or its guesser, under a key that says nothing of the item. A look stays
// up until the next one is here, so a picture never blinks out as it
// changes. At the reveal the real art takes over.

import { SvelteMap } from 'svelte/reactivity';
import { lookKey } from './craft';

export interface Look {
  url: string;
  w: number;
  h: number;
}

/** The pictures this device has, by key. */
class Looks {
  readonly byKey = new SvelteMap<string, Look>();

  take(key: string, w: number, h: number, data: ArrayBuffer) {
    if (this.byKey.has(key)) return;
    this.byKey.set(key, { url: URL.createObjectURL(new Blob([data], { type: 'image/webp' })), w, h });
  }

  /** Throws away every look but those of round `round` (the earlier rounds' are done with). */
  keepRound(round: number) {
    for (const [key, look] of this.byKey) {
      if (key.startsWith(`${round}.`)) continue;
      URL.revokeObjectURL(look.url);
      this.byKey.delete(key);
    }
  }

  clear() {
    for (const look of this.byKey.values()) URL.revokeObjectURL(look.url);
    this.byKey.clear();
  }

  /**
   * The picture to show for a piece: its look as it is now, or until that
   * is here, the newest of its earlier ones.
   */
  of(round: number, maker: string, look: number): Look | null {
    for (let k = look; k >= 0; k--) {
      const got = this.byKey.get(lookKey(round, maker, k));
      if (got) return got;
    }
    return null;
  }
}

export const looks = new Looks();
