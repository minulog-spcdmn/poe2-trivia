// Which games against others count for the achievements (lib/achievements.ts),
// and the one thing about them noted as a page goes away: a counted game
// walked away from while losing. A module of its own, small and with nothing
// heavy to import, as the session notes it synchronously as this player
// walks away (Session.walkAway: leaving the room, or the page going), when
// the achievements' own chunk may never have loaded.
//
// Walking away is what counts, nothing else: a room that closes under you,
// being removed, a rival quitting or a dropped connection leave no mark. The
// mark goes once the same game is seen again (a reload, a rejoin), or when
// it turns out it can't be (a reload whose room closed meanwhile), or when
// another tab is still in it; a game seen next that is another one counts the
// one left as lost first, so a run of wins can't be kept by leaving the games
// it would lose.

import type { GameState } from './game.ts';
import { readStored, removeStored, storeKey, writeStored } from './storage.ts';

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
/** The whole key, as storage events name it (another tab still in the game lets the mark go: Session.stillHere). */
export const LEFT_KEY = storeKey(LEFT);

/** The game walked away from while losing, and its room: stored as `${game}:${room}`. */
export interface Left {
  game: number;
  room: string;
}

/**
 * As this player walks away (Session.walkAway): marks the game in room `room`
 * if they leave it losing. Offline, nothing is marked: the game may be gone.
 */
export function noteLeaving(s: GameState | null, me: string | null, hotSeat: boolean, room: string) {
  if (!s || !losing(s, me, hotSeat) || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
  writeStored(LEFT, `${s.startedAt}:${room}`);
}

/** The game last walked away from while losing, if it is still marked. */
export function leftGame(): Left | null {
  const raw = readStored(LEFT);
  const at = raw?.indexOf(':') ?? -1;
  if (!raw || at < 0) return null;
  const game = Number(raw.slice(0, at));
  return Number.isFinite(game) && game > 0 ? { game, room: raw.slice(at + 1) } : null;
}

/** Lets the mark go: its game came back, or was counted (or everything was erased). */
export const clearLeft = () => removeStored(LEFT);

/**
 * As game `game` comes in: back in the game walked away from (a reload, a
 * rejoin), the mark goes; in another, `lost` counts that one as lost first,
 * and the mark goes only once it has (storage that can't be written keeps it
 * for the next game).
 */
export function settleLeft(game: number, lost: (left: number) => boolean) {
  const left = leftGame();
  if (left && (left.game === game || lost(left.game))) clearLeft();
}

/**
 * Lets the mark go if it is for `game` (this player is still in it, in
 * another tab) or for room `room`, which couldn't be got back into (it closed,
 * or never reopened): neither is walking away.
 */
export function forgiveLeaving({ game, room }: { game?: number | null; room?: string }) {
  const left = leftGame();
  if (left && ((game && left.game === game) || (room && left.room === room))) clearLeft();
}
