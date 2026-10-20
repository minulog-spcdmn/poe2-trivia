// The game's items, for building scenes (src/qa). The scenes run in the
// desk, in its frames and in the tests (plain node, which can't load the
// session or Vite's JSON imports), so whoever builds them hands the items
// over first: the frame and the desk the game's own data, a test the same
// read from src/data.

import { Engine, type Item } from '../../lib/game.ts';

let data: { items: Item[]; fakes: Record<string, string[]> } | null = null;
let shared: Engine | null = null;

/** The items (and made-up names) scenes are built from, from now on. */
export function useItems(items: Item[], fakes: Record<string, string[]>) {
  data = { items, fakes };
  shared = null;
}

function given() {
  if (!data) throw new Error('No items for the scenes yet: call useItems first.');
  return data;
}

/** The `n` items with the longest names (one each), longest first: the most a question's answers, and the plate's name once answered, ever have to fit. */
export function longestNamed(n: number): Item[] {
  const seen = new Set<string>();
  const items = given().items.filter((it) => !seen.has(it.name) && seen.add(it.name));
  return items.sort((a, b) => b.name.length - a.name.length || a.name.localeCompare(b.name)).slice(0, n);
}

/** An engine to look items up in. */
export function sceneEngine(): Engine {
  return (shared ??= new Engine(given().items, { fakes: given().fakes }));
}

/**
 * An engine to play a scene's game on, the same every time: its dice from
 * `seed`, its clock what `clock.now` says, every question's clock started
 * as it is asked (no art has to reach anyone first).
 */
export function playEngine(seed: number, clock: { now: number }): Engine {
  let x = seed >>> 0 || 1;
  const rng = () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
  return new Engine(given().items, { fakes: given().fakes, rng, now: () => clock.now, autoClock: true });
}
