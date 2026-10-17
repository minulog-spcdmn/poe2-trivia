// The circles of a game (circles.ts, where each stands: lib/circlePlaces.ts),
// each built ahead, away from the page, before it's shown.
import type { GameState } from '../lib/game';
import { circleAt, circleOf, circlesAt, warmCircle, type Circle } from './circles';

const QUESTION_CIRCLES = circlesAt('question');
const END_CIRCLES = circlesAt('end');

/** The turn's circle (`ahead` turns on), as in every mode, the same for every player. */
const turnCircle = (s: GameState, ahead = 0): Circle => circleAt(s.turnCount + ahead, QUESTION_CIRCLES, s.startedAt ?? 0);
/** The circle behind a question: a Delve find's own, else the turn's. */
export const questionCircle = (s: GameState): Circle => (s.delve && s.question?.find ? circleOf('find') : turnCircle(s));

/** The circle behind a game's end: after a Delve, where everyone perished, its own; else one of the end's, by the game, the same for every player. */
export const endCircle = (s: GameState): Circle => (s.delve ? circleOf('perished') : circleAt(0, END_CIRCLES, s.startedAt ?? 0));

/** Builds ahead the circles behind this turn's question and the next one's (and in a Delve a find's), the one at the game's end, and the item window's. */
export function warmGame(s: GameState) {
  // (This turn's too: a game that starts with its question up, or one joined midway, never had it warmed.)
  warmCircle(turnCircle(s));
  warmCircle(turnCircle(s, 1));
  // (In a Delve, a find may be dealt any turn.)
  if (s.delve) warmCircle(circleOf('find'));
  warmCircle(endCircle(s));
  warmCircle(circleOf('item'));
}
