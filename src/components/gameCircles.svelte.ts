// The circles of a game (circles.ts, where each stands: lib/circlePlaces.ts),
// each built ahead, away from the page, before it's shown.
import { isGroupRun } from '../lib/delve';
import type { GameState } from '../lib/game';
import type { PlateName } from '../lib/plates/index.ts';
import { circleAt, circleNamed, circleOf, circlesAt, warmCircle, type Circle } from './circles';

const QUESTION_CIRCLES = circlesAt('question');
const END_CIRCLES = circlesAt('end');

/** The turn's circle (`ahead` turns on), as in every mode, the same for every player. */
const turnCircle = (s: GameState, ahead = 0): Circle => circleAt(s.turnCount + ahead, QUESTION_CIRCLES, s.startedAt ?? 0);
/** The circle behind a question: a Delve find's own, else the turn's. */
export const questionCircle = (s: GameState): Circle => (s.delve && s.question?.find ? circleOf('find') : turnCircle(s));

/** A circle put behind every game's end instead (null: none). Only the end screen's test page sets it, to see each in place there. */
const endInstead = $state<{ name: PlateName | null }>({ name: null });
export const putEndCircle = (name: PlateName | null) => void (endInstead.name = name);

/** The circle behind a game's end: after a Delve, where everyone perished, its own; else one of the end's, by the game, the same for every player. */
export const endCircle = (s: GameState): Circle =>
  endInstead.name ? circleNamed(endInstead.name) : s.delve ? circleOf('perished') : circleAt(0, END_CIRCLES, s.startedAt ?? 0);
/** Whether the end's circle is hollow, round one avatar: all but a Delve together's, whose delvers share the heart round its middle. */
export const endHollow = (s: GameState) => !(s.delve && isGroupRun(s));

/** Builds ahead the circles behind this turn's question and the next one's (and in a Delve a find's), the one at the game's end, and the item window's. */
export function warmGame(s: GameState) {
  // (This turn's too: a game that starts with its question up, or one joined midway, never had it warmed.)
  warmCircle(turnCircle(s));
  warmCircle(turnCircle(s, 1));
  // (In a Delve, a find may be dealt any turn.)
  if (s.delve) warmCircle(circleOf('find'));
  warmCircle(endCircle(s), endHollow(s));
  warmCircle(circleOf('item'));
}
