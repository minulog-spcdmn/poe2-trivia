// A night of games in one room: what carries from one game to the next. Online,
// guests vote for another at the end of a game, and once every guest still
// connected is ready the next one starts by itself (the host's timer, see
// session.svelte.ts scheduleRematch). Only types come from game.ts, so the
// engine can import this module without a cycle.

import type { GameState } from './game.ts';

/** How long the room counts down once every connected guest is ready for another game. */
export const REMATCH_MS = 10_000;

/**
 * Settles the rematch vote after any change (a vote, someone leaving,
 * dropping out or coming back): the countdown runs while every guest still
 * connected is ready, from the moment the last of them got there. A vote
 * stays while its guest is away (a refresh, the host's reload), but only
 * those connected are counted. Online turns and race games only.
 */
export function settleRematch(s: GameState, now: number) {
  const r = s.rematch;
  if (!r || s.phase !== 'over' || s.hostId === null || s.delve) return;
  const seated = new Set(s.players.filter((p) => p.id !== s.hostId).map((p) => p.id));
  const ready = r.ready.filter((id) => seated.has(id));
  const { guests, ready: here } = rematchCount({ ...s, rematch: { ready } });
  s.rematch = guests.length && here.length === guests.length ? { ready, at: r.at ?? now + REMATCH_MS } : { ready };
}

/** The guests the vote waits for (connected, seated, not the host) and those of them who are ready, by id. */
export function rematchCount(s: GameState): { guests: string[]; ready: string[] } {
  const guests = s.players.filter((p) => p.connected && p.id !== s.hostId).map((p) => p.id);
  const votes = new Set(s.rematch?.ready ?? []);
  return { guests, ready: guests.filter((id) => votes.has(id)) };
}
