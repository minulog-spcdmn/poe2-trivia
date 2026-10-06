// The session's Delve decisions, apart from PeerJS and Svelte so tests can reach them.

import {
  ITEM_KINDS,
  REVIVE_FROM,
  blastAtMs,
  blastClears,
  dynamiteOf,
  fellAt,
  flaresOf,
  holdersOf,
  inventoryOf,
  isGroupRun,
  itemsWorkOn,
  livesOf,
  standingIds,
  teamItemReady,
  voteClosesAt,
  voteDone,
  type ItemKind,
} from './delve.ts';
import type { GameState, Grayscale } from './game.ts';

/** The longest the host waits for the art to reach the player answering before their clock starts anyway. */
export const DELVE_CLOCK_CAP_MS = 3000;

/** How often the host checks whether the art has left for the player answering. */
export const DRAIN_POLL_MS = 50;

/**
 * Delve together: how long after the vote closes the clock may start at the
 * earliest (ms), so the draw that plays on the cards first (ChooseCategory:
 * a light hopping over them for 1.3 s, then 0.65 s as the drawn card flares,
 * Game.svelte holding the question back meanwhile) costs no answer time.
 */
export const COOP_DRAW_MS = 2000;

/**
 * Delve together: the earliest the clock of the question `next` asks may
 * start (host clock), when the team's vote just drew it: COOP_DRAW_MS after
 * it was asked. Null for any other question (alone, re-asked, resumed).
 */
export function drawHoldUntil(prev: GameState | null, next: GameState): number | null {
  const q = next.question;
  if (!next.delve || !q || next.phase !== 'question' || !isGroupRun(next) || prev?.phase !== 'choosing') return null;
  return q.askedAt + COOP_DRAW_MS;
}

/**
 * When the answering player's clock starts (host clock): once the host's send
 * queue to them is empty (or the cap ran out), plus the half round trip the
 * last bytes and the state carrying the deadline still need to arrive.
 */
export function clockStart(drainedAt: number | null, releasedAt: number, rtt: number): number {
  return Math.min(drainedAt ?? Infinity, releasedAt + DELVE_CLOCK_CAP_MS) + Math.min(Math.max(0, rtt) / 2, 500);
}

/**
 * Art that failed to load is asked again by itself after these waits: at
 * once, then 2 s, 5 s and 10 s. After that (null) it stops trying by itself:
 * the art isn't coming (the device is offline, say), so the question waits,
 * its clock not started and nothing lost, until the host asks another by
 * hand or the browser is back online.
 */
const REASK_WAITS = [0, 2000, 5000, 10_000];
export const AUTO_REASKS = REASK_WAITS.length;
export function reaskDelay(failures: number): number | null {
  return REASK_WAITS[failures] ?? null;
}

/** A Delve question whose art failed may be asked again by itself while its clock hasn't started. */
export function mayAutoReask(s: GameState | null, qid: number): boolean {
  return !!s?.delve && s.phase === 'question' && s.question?.askedAt === qid && s.question.deadline === null;
}

/**
 * Co-op: milliseconds until the vote closes by the clock (the host then sends
 * 'expire'), or null when nothing runs: nobody has voted yet (the vote waits
 * for as long as it takes), or not voting. Moves when the first vote comes.
 */
export function expireIn(s: GameState, now: number): number | null {
  const at = voteClosesAt(s);
  if (at === null) return null;
  // Everyone it waits for has voted (the engine closes it on the vote itself; this covers the rest).
  return voteDone(s, now) ? 0 : Math.max(0, at - now);
}

/**
 * Delve: who is sent the question's art before its clock starts, and whom
 * the clock waits for to have it: the player answering, or in co-op everyone
 * standing. Spectators and those who perished get it once the clock runs.
 */
export function artFirst(s: GameState): string[] {
  if (!s.delve) return [];
  if (isGroupRun(s)) return standingIds(s);
  const p = s.players[s.turn];
  return p ? [p.id] : [];
}

/**
 * Delve: the question's plain art is worth making ahead, as a stick of
 * dynamite may go off on it: someone who could use one holds one (alone the
 * player, together anyone standing), it is no find's, none went off yet, and
 * the blast would clear something from its art (delve.ts blastClears).
 */
export function cleanArtWanted(s: GameState, grayscale: Grayscale): boolean {
  const q = s.question;
  if (!s.delve || !q || q.blasted || !itemsWorkOn(q) || !blastClears(q, grayscale)) return false;
  if (isGroupRun(s)) return holdersOf(s, 'dynamite').length > 0;
  const p = s.players[s.turn];
  return !!p && dynamiteOf(s, p.id) > 0;
}

/**
 * The question in play was set aside by the host's reload (back to the same
 * cards, on the same turn): the engine put back what it cost, which is no
 * news to anyone.
 */
export function setAside(prev: GameState | null, next: GameState): boolean {
  return (
    !!prev?.delve &&
    !!next.delve &&
    prev.delve.startedAt === next.delve.startedAt &&
    prev.phase === 'question' &&
    next.phase === 'choosing' &&
    prev.turnCount === next.turnCount
  );
}

/** A send queue to a guest is empty: PeerJS's own, and the data channel's. */
export function drained(conn: { bufferSize?: number; dataChannel?: { bufferedAmount?: number } | null }): boolean {
  return (conn.bufferSize ?? 0) === 0 && (conn.dataChannel?.bufferedAmount ?? 0) === 0;
}

export type DelveNotice =
  /** The host reloaded and the question was set aside; whose it was ('' for a co-op run's, the team's). */
  | { kind: 'setAside'; playerId: string }
  /** Co-op: `by` gave one of their lives to bring back `playerId`. */
  | { kind: 'revived'; playerId: string; by: string }
  /** Co-op: a wrong pick struck its option for everyone, at the cost of `lives` and `wards` (the player still stands). */
  | { kind: 'struck'; playerId: string; lives: number; wards: number }
  /** Co-op: a player lost their last life, at `depth`; `revivable`: a teammate standing has lives to spare. */
  | { kind: 'perished'; playerId: string; depth: number; revivable: boolean }
  /** Co-op: a flare from `playerId`'s pack burnt for everyone. */
  | { kind: 'flare'; playerId: string };

/**
 * What a state change tells everyone in words: a question was set aside
 * because the host reloaded; together, also a teammate's wrong pick, a
 * teammate perishing, a life given to bring someone back, and a flare
 * burning from someone's pack (alone, the player's own screen says all of
 * that; dynamite going off, the question says on every screen).
 */
export function delveNotices(prev: GameState | null, next: GameState): DelveNotice[] {
  if (!prev?.delve || !next.delve || prev.delve.startedAt !== next.delve.startedAt) return [];
  const out: DelveNotice[] = [];
  const group = isGroupRun(next);
  if (setAside(prev, next)) {
    const active = prev.players[prev.turn];
    if (group) out.push({ kind: 'setAside', playerId: '' });
    else if (active) out.push({ kind: 'setAside', playerId: active.id });
    // What it cost was put back: nothing more to tell.
    return out;
  }
  if (!group) return out;
  const [pq, nq] = [prev.question, next.question];
  const sameQ = !!pq && !!nq && pq.askedAt === nq.askedAt;
  const perished = new Set(next.players.filter((p) => livesOf(prev, p.id) > 0 && livesOf(next, p.id) === 0).map((p) => p.id));
  if (sameQ) {
    for (const x of (nq.struck ?? []).slice(pq.struck?.length ?? 0))
      if (!perished.has(x.by)) out.push({ kind: 'struck', playerId: x.by, lives: x.lives, wards: x.wards });
    if (!pq.flared && nq.flared && nq.flaredBy) out.push({ kind: 'flare', playerId: nq.flaredBy });
  }
  for (const id of perished) {
    const revivable = standingIds(next).some((o) => livesOf(next, o) >= REVIVE_FROM);
    out.push({ kind: 'perished', playerId: id, depth: fellAt(next, id) ?? next.round, revivable });
  }
  for (const r of (next.delve.revives ?? []).slice(prev.delve.revives?.length ?? 0)) out.push({ kind: 'revived', playerId: r.to, by: r.by });
  return out;
}

/**
 * Lives lost by this change, per player, for sounds and effects (a reveal, or
 * a wrong answer in co-op): how many (two when an Azurite Vein caves in) and
 * how many are left. A life given to a teammate is not one lost.
 */
export function livesLost(prev: GameState | null, next: GameState): { playerId: string; left: number; lost: number }[] {
  if (!prev?.delve || !next.delve || prev.delve.startedAt !== next.delve.startedAt) return [];
  return next.players.flatMap((p) => {
    const lost = (next.delve!.losses[p.id]?.length ?? 0) - (prev.delve!.losses[p.id]?.length ?? 0);
    return lost > 0 && prev.players.some((o) => o.id === p.id) ? [{ playerId: p.id, left: livesOf(next, p.id), lost }] : [];
  });
}

/**
 * Items gained or used up by this change, per player and item, for the phial,
 * sounds and effects: a find answered right (two shards forging a ward show
 * as a shard used and a ward gained), a ward breaking, a flare burning, a
 * stick of dynamite going off, everything dropped by a player who perished.
 * Nothing for a question set aside. `left`: how many they hold now.
 */
export function inventoryChanges(prev: GameState | null, next: GameState): { playerId: string; item: ItemKind; change: 'gained' | 'used'; left: number }[] {
  if (!prev?.delve || !next.delve || prev.delve.startedAt !== next.delve.startedAt) return [];
  // A question set aside gives back what it took (a flare, dynamite, a pack
  // dropped by perishing): put back quietly, not found.
  if (setAside(prev, next)) return [];
  return next.players.flatMap((p) => {
    const [before, after] = [inventoryOf(prev, p.id), inventoryOf(next, p.id)];
    return ITEM_KINDS.flatMap((item) =>
      after[item] === before[item] ? [] : [{ playerId: p.id, item, change: after[item] > before[item] ? ('gained' as const) : ('used' as const), left: after[item] }],
    );
  });
}

/**
 * Milliseconds until the host burns a flare (as the clock hits 0, before the
 * time-out is taken, so an answer at any time before keeps it), or null when
 * none will: the clock isn't running, a flare already burnt on this question,
 * it is a find's, or nobody can use one. Alone: the player holds none or is
 * away. Together: nobody standing holds one, or nobody here still has an
 * answer to give (delve.ts teamItemReady).
 */
export function flareIn(s: GameState, now: number): number | null {
  const q = s.question;
  if (!s.delve || s.phase !== 'question' || !q || q.deadline === null || q.flared || !itemsWorkOn(q)) return null;
  if (isGroupRun(s)) return teamItemReady(s, 'flares') ? Math.max(0, q.deadline - now) : null;
  const p = s.players[s.turn];
  if (!p?.connected || flaresOf(s, p.id) <= 0) return null;
  return Math.max(0, q.deadline - now);
}

/**
 * Milliseconds until a stick of dynamite goes off (at half the clock,
 * delve.ts blastAt), or null when none will: the clock isn't running,
 * dynamite already went off on this question, it is a find's, or nobody can
 * use one (as for flareIn). Read on every screen too, for the fuse before it.
 */
export function dynamiteIn(s: GameState, now: number): number | null {
  const q = s.question;
  if (!s.delve || s.phase !== 'question' || !q || q.deadline === null || q.clockAt === undefined || q.blasted || !itemsWorkOn(q)) return null;
  if (isGroupRun(s)) return teamItemReady(s, 'dynamite') ? Math.max(0, q.clockAt + blastAtMs(s) - now) : null;
  const p = s.players[s.turn];
  if (!p?.connected || dynamiteOf(s, p.id) <= 0) return null;
  return Math.max(0, q.clockAt + blastAtMs(s) - now);
}
