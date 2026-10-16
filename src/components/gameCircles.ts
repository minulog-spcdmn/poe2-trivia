// The circles of a game (circles.ts): behind its questions, Delve's black
// sun in a Delve (loaded only with the game, never on the start page).
import type { GameState } from '../lib/game';
import BlackSunCircle from './BlackSunCircle.svelte';
import { circleAt, QUESTION_CIRCLES, type Circle } from './circles';

/** The circle behind a question: Delve's own black sun in a Delve, else the turn's, the same for every player. */
export const questionCircle = (s: GameState): Circle => (s.delve ? BlackSunCircle : circleAt(s.turnCount, QUESTION_CIRCLES, s.startedAt ?? 0));
