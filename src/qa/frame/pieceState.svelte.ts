// What a piece's frame holds (./piece.ts): its controls as the desk sets
// them, the actions pressed, and a count that draws it in again.

import { onDestroy } from 'svelte';
import type { Values } from '../bench.ts';

export const piece = $state({ values: {} as Values, replay: 0 });

const actions = new Map<string, Set<() => void>>();

/** Runs `fn` whenever the action `key` is pressed in the panel: a piece's view calls it as it's made, and it's let go as the view goes. */
export function onAction(key: string, fn: () => void) {
  const all = actions.get(key) ?? new Set();
  all.add(fn);
  actions.set(key, all);
  onDestroy(() => all.delete(fn));
}

export const fire = (key: string) => {
  for (const fn of actions.get(key) ?? []) fn();
};
