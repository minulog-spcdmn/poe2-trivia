// The circles of a game (circles.ts): behind its questions, Delve's black
// sun in a Delve, and those at its end, each built ahead in an idle moment
// before it's shown.
import type { GameState } from '../lib/game';
import BlackSunCircle, { warm } from './BlackSunCircle.svelte';
import { circleAt, END_CIRCLES, PERISHED_CIRCLE, QUESTION_CIRCLES, warmCircle, canWarm, type Circle } from './circles';

canWarm(BlackSunCircle, warm);

/** The circle behind a question: Delve's own black sun in a Delve, else the turn's (`ahead` turns on), the same for every player. */
export const questionCircle = (s: GameState, ahead = 0): Circle =>
  s.delve ? BlackSunCircle : circleAt(s.turnCount + ahead, QUESTION_CIRCLES, s.startedAt ?? 0);

/** Builds ahead the circle behind the coming question, and those that may stand at the game's end. */
export function warmGame(s: GameState) {
  // (This turn's while a category is chosen, the next one's once a question is up.)
  warmCircle(questionCircle(s, s.question ? 1 : 0));
  for (const c of s.delve ? [PERISHED_CIRCLE] : END_CIRCLES) warmCircle(c);
}
