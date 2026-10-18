// The game's items, for building scenes (src/qa). The scenes run in the
// desk, in its frames and in the tests (plain node, which can't load the
// session or Vite's JSON imports), so whoever builds them hands the engine
// over first: the frame and the desk the session's own, a test one made from
// src/data/items.json.

import type { Engine } from '../../lib/game.ts';

let current: Engine | null = null;

/** The engine scenes look their items up in, from now on. */
export function useEngine(engine: Engine) {
  current = engine;
}

/** The engine handed over by useEngine. */
export function sceneEngine(): Engine {
  if (!current) throw new Error('No engine for the scenes yet: call useEngine first.');
  return current;
}
