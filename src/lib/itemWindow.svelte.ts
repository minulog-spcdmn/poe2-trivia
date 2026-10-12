import type { DrawnItem } from './game';
import { readStored, writeStored } from './storage';

/**
 * The item a player opened from a question once it was answered (its art,
 * clicked), shown in a window of its own over the game (ItemWindow.svelte)
 * until they close it: only on their screen, and the game goes on under it.
 * Opening another item shows that one in the same window.
 */
export const itemWindow = $state<{ item: DrawnItem | null }>({ item: null });

export function inspect(item: DrawnItem) {
  itemWindow.item = item;
}
export function closeItemWindow() {
  itemWindow.item = null;
}

/** Where the window was last left: its top left corner, as shares of the room the screen leaves round it. */
export interface WindowPlace {
  x: number;
  y: number;
}

const KEY = 'itemWindow';

export function readPlace(): WindowPlace | null {
  try {
    const p = JSON.parse(readStored(KEY) ?? 'null');
    return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: Math.min(Math.max(p.x, 0), 1), y: Math.min(Math.max(p.y, 0), 1) } : null;
  } catch {
    return null;
  }
}

export const writePlace = (p: WindowPlace) => writeStored(KEY, JSON.stringify(p));
