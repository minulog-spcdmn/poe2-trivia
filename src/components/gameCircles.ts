// The circles of a game (circles.ts): behind its questions, Delve's black
// sun in a Delve (loaded only with the game, never on the start page), and
// each built ahead, away from the page, before it's shown.
import type { GameState } from '../lib/game';
import BlackSunCircle from './BlackSunCircle.svelte';
import { ITEM_CIRCLE, circleAt, END_CIRCLES, PERISHED_CIRCLE, plateNamed, QUESTION_CIRCLES, warmCircle, type Circle } from './circles';

plateNamed(BlackSunCircle, 'blackSun');

/** The circle behind a question: Delve's own black sun in a Delve, else the turn's (`ahead` turns on), the same for every player. */
export const questionCircle = (s: GameState, ahead = 0): Circle =>
  s.delve ? BlackSunCircle : circleAt(s.turnCount + ahead, QUESTION_CIRCLES, s.startedAt ?? 0);

/** Builds ahead the circle behind the coming question, those that may stand at the game's end, and the item window's eye. */
export function warmGame(s: GameState) {
  // (This turn's while a category is chosen, the next one's once a question is up.)
  warmCircle(questionCircle(s, s.question ? 1 : 0));
  for (const c of s.delve ? [PERISHED_CIRCLE] : END_CIRCLES) warmCircle(c);
  warmCircle(ITEM_CIRCLE);
}
