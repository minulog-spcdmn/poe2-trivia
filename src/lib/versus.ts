// Which games against others count for the achievements (lib/achievements.ts),
// and the one thing about them noted as a page goes away: a counted game
// walked away from while losing. A module of its own, small and with nothing
// heavy to import, as the session notes it synchronously when the page is
// hidden or a room is left (Session.recordLeaving), when the achievements'
// own chunk may never have loaded. Only a leave of their own marks it
// (Session.walkAway: leaving, or the page going), never one done to them.
//
// Walking away is what counts, nothing else: a room that closes under you,
// being removed, a rival quitting or a dropped connection leave no mark. The
// mark goes once the same game is seen again (a reload, a rejoin); a game
// seen next that is another one counts the one left as lost first, so a run
// of wins can't be kept by leaving the games it would lose.

import type { GameState } from './game.ts';
import { readStored, removeStored, writeStored } from './storage.ts';

/** Wins count to this target or more. */
export const TARGET_MIN = 5;

/** A game against others: online, this player seated, someone else seated, not Delve. */
export function versusGame(s: GameState, me: string | null, hotSeat: boolean): s is GameState & { startedAt: number } {
  return !hotSeat && !!me && !s.delve && !!s.startedAt && s.players.length >= 2 && s.players.some((p) => p.id === me);
}

/**
 * Losing a counted game still in play: to TARGET_MIN or more, behind a rival
 * still there (level is not losing), or out of its deathmatch.
 */
export function losing(s: GameState, me: string | null, hotSeat: boolean): boolean {
  if (!versusGame(s, me, hotSeat) || s.phase === 'lobby' || s.phase === 'over' || s.settings.targetScore < TARGET_MIN) return false;
  const rivals = s.players.filter((p) => p.id !== me && p.connected);
  if (!rivals.length) return false;
  if (s.deathmatch?.entrants.includes(me!) && !s.deathmatch.alive.includes(me!)) return true;
  const mine = s.players.find((p) => p.id === me)?.score ?? 0;
  return rivals.some((p) => p.score > mine);
}

const LEFT = 'achievements.left';
/** The game the mark was last settled for: it is read once a game, not on every change (settleLeft). */
let settledFor = 0;

/** As the page goes or the room is left: marks the game if this player walks away from it losing. */
export function noteLeaving(s: GameState | null, me: string | null, hotSeat: boolean) {
  if (!s || !losing(s, me, hotSeat)) return;
  writeStored(LEFT, JSON.stringify({ game: s.startedAt }));
  settledFor = 0;
}

/** The game last walked away from while losing (its start), if it is still marked. */
export function leftGame(): number | null {
  try {
    const v: unknown = JSON.parse(readStored(LEFT) ?? 'null');
    const game = typeof v === 'object' && v !== null ? (v as { game?: unknown }).game : undefined;
    return typeof game === 'number' && Number.isFinite(game) ? game : null;
  } catch {
    return null;
  }
}

/** Lets the mark go: its game came back, or was counted (or everything was erased). */
export const clearLeft = () => removeStored(LEFT);

/**
 * As game `game` comes in: back in the game walked away from (a reload, a
 * rejoin), the mark goes; in another, `lost` counts that one as lost first.
 */
export function settleLeft(game: number, lost: (left: number) => void) {
  if (settledFor === game) return;
  settledFor = game;
  const left = leftGame();
  if (left === null) return;
  if (left !== game) lost(left);
  clearLeft();
}
