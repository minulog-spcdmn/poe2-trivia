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

/** The circle behind a game's end: after a Delve, where everyone perished, the moth; else the monad or the eye, as the game falls, the same for every player. */
export const endCircle = (s: GameState): Circle => (s.delve ? PERISHED_CIRCLE : circleAt(0, END_CIRCLES, s.startedAt ?? 0));

/** Builds ahead the circles behind this turn's question and the next one's, the one at the game's end, and the item window's eye. */
export function warmGame(s: GameState) {
  // (This turn's too: a game that starts with its question up, or one joined midway, never had it warmed.)
  warmCircle(questionCircle(s));
  warmCircle(questionCircle(s, 1));
  warmCircle(endCircle(s));
  warmCircle(ITEM_CIRCLE);
}
