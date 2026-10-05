// The session's Delve decisions, apart from PeerJS and Svelte so tests can reach them.

import { DELVE_LIVES, ITEM_KINDS, blastAtMs, dynamiteOf, flaresOf, inventoryOf, itemsWorkOn, livesOf, wardsOf, type ItemKind } from './delve.ts';
import type { GameState } from './game.ts';

/** The longest the host waits for the art to reach the player answering before their clock starts anyway. */
export const DELVE_CLOCK_CAP_MS = 3000;

/** How often the host checks whether the art has left for the player answering. */
export const DRAIN_POLL_MS = 50;

/**
 * When the answering player's clock starts (host clock): once the host's send
 * queue to them is empty (or the cap ran out), plus the half round trip the
 * last bytes and the state carrying the deadline still need to arrive.
 */
export function clockStart(drainedAt: number | null, releasedAt: number, rtt: number): number {
  return Math.min(drainedAt ?? Infinity, releasedAt + DELVE_CLOCK_CAP_MS) + Math.min(Math.max(0, rtt) / 2, 500);
}

/** Art that failed to load is asked again after these waits: at once, then 2 s, 5 s, then every 10 s. */
export function reaskDelay(failures: number): number {
  return [0, 2000, 5000][failures] ?? 10_000;
}

/** A Delve question whose art failed may be asked again by itself while its clock hasn't started. */
export function mayAutoReask(s: GameState | null, qid: number): boolean {
  return !!s?.delve && s.phase === 'question' && s.question?.askedAt === qid && s.question.deadline === null;
}

/** Milliseconds until the time to pick runs out, or null when nothing runs. */
export function expireIn(s: GameState, now: number): number | null {
  const by = s.delve?.pickBy;
  return s.phase === 'choosing' && by !== null && by !== undefined ? Math.max(0, by - now) : null;
}

/** A send queue to a guest is empty: PeerJS's own, and the data channel's. */
export function drained(conn: { bufferSize?: number; dataChannel?: { bufferedAmount?: number } | null }): boolean {
  return (conn.bufferSize ?? 0) === 0 && (conn.dataChannel?.bufferedAmount ?? 0) === 0;
}

export interface DelveNotice {
  kind: 'missed' | 'setAside';
  playerId: string;
  /** missed: an Azurite Ward took the loss, not a life. */
  warded?: boolean;
}

/**
 * What a state change tells everyone in words: a player lost a life without
 * a question (their turn ran out while they were away), or a question was set
 * aside because the host reloaded.
 */
export function delveNotices(prev: GameState | null, next: GameState): DelveNotice[] {
  if (!prev?.delve || !next.delve || prev.delve.startedAt !== next.delve.startedAt) return [];
  const out: DelveNotice[] = [];
  if (!next.reveal) {
    for (const p of next.players) {
      if (livesOf(next, p.id) < livesOf(prev, p.id)) out.push({ kind: 'missed', playerId: p.id });
      else if (wardsOf(next, p.id) < wardsOf(prev, p.id)) out.push({ kind: 'missed', playerId: p.id, warded: true });
    }
  }
  const active = prev.players[prev.turn];
  if (prev.phase === 'question' && next.phase === 'choosing' && prev.turnCount === next.turnCount && active) {
    out.push({ kind: 'setAside', playerId: active.id });
  }
  return out;
}

/**
 * Lives lost by this change, per player, for sounds and effects (a reveal or a
 * missed turn): how many (two when an Azurite Vein caves in) and how many are left.
 */
export function livesLost(prev: GameState | null, next: GameState): { playerId: string; left: number; lost: number }[] {
  if (!prev?.delve || !next.delve || prev.delve.startedAt !== next.delve.startedAt) return [];
  return next.players.flatMap((p) => {
    const before = livesOf(prev, p.id);
    const after = livesOf(next, p.id);
    return after < before && before <= DELVE_LIVES ? [{ playerId: p.id, left: after, lost: before - after }] : [];
  });
}

/**
 * Items gained or used up by this change, per player and item, for the phial,
 * sounds and effects: a find answered right (two shards forging a ward show
 * as a shard used and a ward gained), a ward breaking (a reveal, or a turn
 * missed while away), a flare burning, a stick of dynamite going off.
 * `left`: how many they hold now.
 */
export function inventoryChanges(prev: GameState | null, next: GameState): { playerId: string; item: ItemKind; change: 'gained' | 'used'; left: number }[] {
  if (!prev?.delve || !next.delve || prev.delve.startedAt !== next.delve.startedAt) return [];
  return next.players.flatMap((p) => {
    const [before, after] = [inventoryOf(prev, p.id), inventoryOf(next, p.id)];
    return ITEM_KINDS.flatMap((item) =>
      after[item] === before[item] ? [] : [{ playerId: p.id, item, change: after[item] > before[item] ? ('gained' as const) : ('used' as const), left: after[item] }],
    );
  });
}

/**
 * Milliseconds until the host burns a flare for the player answering (as their
 * clock hits 0, before the time-out is taken, so an answer at any time before
 * keeps it), or null when none will: the clock isn't running, a flare already
 * burnt on this question, it is a find's, or the player holds none or is away
 * (a flare can't help someone who can't answer).
 */
export function flareIn(s: GameState, now: number): number | null {
  const q = s.question;
  const p = s.players[s.turn];
  if (!s.delve || s.phase !== 'question' || !q || q.deadline === null || q.flared || !itemsWorkOn(q) || !p?.connected || flaresOf(s, p.id) <= 0) return null;
  return Math.max(0, q.deadline - now);
}

/**
 * Milliseconds until a stick of the answering player's dynamite goes off (at
 * half their clock, delve.ts blastAt), or null when none will: the clock
 * isn't running, dynamite already went off on this question, it is a find's,
 * or the player holds none or is away. Read on every screen too, for the fuse
 * before it.
 */
export function dynamiteIn(s: GameState, now: number): number | null {
  const q = s.question;
  const p = s.players[s.turn];
  if (!s.delve || s.phase !== 'question' || !q || q.deadline === null || q.clockAt === undefined || q.blasted || !itemsWorkOn(q) || !p?.connected || dynamiteOf(s, p.id) <= 0) return null;
  return Math.max(0, q.clockAt + blastAtMs(s) - now);
}
