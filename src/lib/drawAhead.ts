// Race draws its next question ahead (docs/far-links.md, phase 3). A race
// has no choosing phase, so the next question is known as soon as the
// reveal starts: the host takes the step to it then, on a copy of the state
// (the engine never touches the state it's given), and prepares, seals and
// sends its art while the reveal plays. At 'next', the copy is taken if the
// room is just as it was when it was drawn (the same state version: nobody
// joined, left or was kicked, no settings changed, no restart); else it is
// thrown away and the step taken as before. Until then nothing of it is in
// the live state: what the draw marks used, the art lean, the question
// count and lastAskedAt (so a late answer to the question revealed still
// reads "Too late!"). Kept free of the session so it can be tested on its
// own (tests/drawAhead.test.ts).

import type { GameState } from './game.ts';

/** A next question drawn ahead: the state it was drawn from (its version), the question's id, and the state the step led to. */
export interface Ahead {
  from: number;
  qid: number;
  state: GameState;
}

/**
 * Whether the next question may be drawn ahead from this state: a race's
 * reveal. Not Delve (its dig: the art's size would tell the team how hard
 * the next depth is before they choose to leave), nor taking turns (three
 * cards, and a deathmatch's draw follows who is left).
 */
export function mayDrawAhead(s: GameState): boolean {
  return s.settings.mode === 'race' && !s.delve && !s.deathmatch && s.phase === 'reveal' && !!s.question;
}

/**
 * Draws the next question ahead: `step` is the engine's 'next' (which
 * works on a copy of what it's given). Null where none may be drawn, or
 * where the step leads to no new question (the race is won, it throws).
 */
export function drawAhead(s: GameState, step: (s: GameState) => GameState): Ahead | null {
  if (!mayDrawAhead(s)) return null;
  let next: GameState;
  try {
    next = step(s);
  } catch {
    return null;
  }
  const q = next.phase === 'question' ? next.question : null;
  if (!q || q.askedAt === s.question?.askedAt) return null;
  return { from: s.version, qid: q.askedAt, state: next };
}

/**
 * At 'next': the question drawn ahead, if the live state is still the very
 * reveal it was drawn from; null otherwise (draw it now, as before). Its
 * askedAt stays as drawn: it's the id its sealed art carries, it is later
 * than any question asked before (lastAskedAt), and nothing in a race times
 * from it but from the clock, which hasn't started.
 */
export function takeAhead(live: GameState, ahead: Ahead | null): GameState | null {
  if (!ahead || live.version !== ahead.from || !mayDrawAhead(live)) return null;
  return ahead.state;
}
