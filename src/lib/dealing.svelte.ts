// Delve: going down into a new zone, its cards are dealt as the plunge into
// it lands (DelveState.dealAt, on the host's clock, the same moment on every
// screen). Until then the header keeps the depth before and Game.svelte's
// stage stands empty over the plunging scene; then the depth, its gate and
// its cards come in together. App.svelte follows the state (followDeal).

import { dealIn } from './delve.ts';
import type { GameState } from './game.ts';

let held = $state(false);
let timer: ReturnType<typeof setTimeout> | null = null;

/** Whether a new zone's cards are still on their way. */
export const dealing = {
  get held() {
    return held;
  },
};

/** Follows the game's state `s` at host-clock time `now`: held for as long as its cards are on their way. */
export function followDeal(s: GameState | null, now: number) {
  const wait = s ? dealIn(s, now) : 0;
  if (timer) clearTimeout(timer);
  timer = wait > 0 ? setTimeout(() => (held = false), wait) : null;
  held = wait > 0;
}

/** The depth (round) the screens show: the one before while a new zone's cards are on their way. */
export const shownRound = (s: GameState) => (held && s.delve ? s.round - 1 : s.round);
