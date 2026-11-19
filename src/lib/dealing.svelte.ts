// Delve: going down into a new zone, its cards are dealt as the plunge into
// it lands (DelveState.dealAt, on the host's clock, the same moment on every
// screen). Until then the header keeps the depth before and Game.svelte's
// stage stands empty over the plunging scene; then the depth and its cards
// come in together. App.svelte follows the state (followDeal).

import { dealIn, RUSH_LAND_MS, rushEnded, rushStep, zoneEntered } from './delve.ts';
import type { GameState } from './game.ts';

let held = $state(false);
let timer: ReturnType<typeof setTimeout> | null = null;
/** A Sulphite rush's end: its ride has landed (RUSH_LAND_MS into it), so the depth it reached shows before the cards come. */
let landed = $state(false);
let landTimer: ReturnType<typeof setTimeout> | null = null;

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
  // (A rush ending in the zone it was in: its landing, in step with Game.svelte's banner.)
  const end = held && s ? rushEnded(s) : null;
  if (landTimer) clearTimeout(landTimer);
  landTimer = null;
  if (end && end.at !== undefined && zoneEntered(end.last, s!.round) === null) {
    const left = end.at + RUSH_LAND_MS - now;
    landed = left <= 0;
    if (left > 0) landTimer = setTimeout(() => (landed = true), left);
  } else landed = false;
}

/**
 * The depth (round) the screens show: the one before while a new zone's
 * cards are on their way (a Sulphite rush's question, its step down; the
 * first offer after a rush, the depth its last question was asked at).
 */
export function shownRound(s: GameState) {
  if (!held || !s.delve) return s.round;
  if (s.phase === 'question' && s.question?.rush) return s.round - rushStep(s);
  const end = rushEnded(s);
  return end ? (landed ? s.round : end.last) : s.round - 1;
}
