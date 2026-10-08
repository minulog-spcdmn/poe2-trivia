// The session's Delve decisions, apart from PeerJS and Svelte so tests can reach them.

import {
  DELVE_RULESET,
  ITEM_KINDS,
  fellAt,
  flaresOf,
  inventoryOf,
  isGroupRun,
  itemsWorkOn,
  livesOf,
  standingIds,
  teamItemReady,
  veinWindowMs,
  voteClosesAt,
  voteDone,
  type ItemKind,
} from './delve.ts';
import type { Blast, GameState } from './game.ts';
import type { DarkOutcome } from './darkness.ts';

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
 * it was asked. A question asked again in its place (its art failed) while
 * the draw still plays keeps the hold it had (`held`, for the question it
 * replaces). Null for any other question (alone, resumed, re-asked on a
 * question that had none, or asked as dynamite blasted the last away).
 */
export function drawHoldUntil(prev: GameState | null, next: GameState, held: { qid: number; until: number } | null = null): number | null {
  const q = next.question;
  if (!next.delve || !q || next.phase !== 'question' || !isGroupRun(next) || !prev?.delve) return null;
  if (prev.phase === 'choosing') return q.askedAt + COOP_DRAW_MS;
  const reasked =
    prev.phase === 'question' &&
    prev.delve.startedAt === next.delve.startedAt &&
    prev.turnCount === next.turnCount &&
    !!prev.question &&
    held?.qid === prev.question.askedAt &&
    // Dynamite blasting it away is no re-ask: its new question has no draw to wait for.
    q.blast?.was.at !== prev.question.askedAt;
  return reasked ? held.until : null;
}

/** Half a round trip (ms), as far as the host waits for one: never more than 500 ms. */
export const halfTrip = (rtt: number) => Math.min(Math.max(0, rtt) / 2, 500);

/**
 * When the answering player's clock starts (host clock): once the host's send
 * queue to them is empty (or the cap ran out), plus the half round trip the
 * last bytes and the state carrying the deadline still need to arrive.
 */
export function clockStart(drainedAt: number | null, releasedAt: number, rtt: number): number {
  return Math.min(drainedAt ?? Infinity, releasedAt + DELVE_CLOCK_CAP_MS) + halfTrip(rtt);
}

/**
 * Delve together: the earliest the clock may start after the draw (host
 * clock): the draw's end (`until`, drawHoldUntil), plus the half round trip
 * the slowest standing guest's draw started late by, as the state that
 * began it reached them that much after the host.
 */
export const drawClockFrom = (until: number, rtt: number) => until + halfTrip(rtt);

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
 * What the host's vote timer is armed for (expireIn's `left` at `now`): a
 * new key sets it again. Keyed on the close time itself, so a vote that
 * closes sooner (someone the reload cut off came back) is not left waiting
 * for the end of the grace. '' when nothing runs.
 */
export function expireKey(s: GameState, left: number | null): string {
  return left === null ? '' : `${s.delve?.startedAt}:${s.turnCount}:${voteClosesAt(s)}:${left === 0 ? 'now' : ''}`;
}

/**
 * The host reopened its room after a reload: everyone but the host (`me`)
 * is marked away, with nothing else changed. Unlike a drop reported as the
 * 'connection' action, it closes no vote: the 'resumed' that follows
 * excuses them for a while instead, so the votes cast stand.
 */
export function markAway(s: GameState, me: string): GameState {
  return { ...s, players: s.players.map((p) => (p.id === me || !p.connected ? p : { ...p, connected: false })), version: s.version + 1 };
}

/**
 * Who the host's own answers are held back for (a race for the right
 * answer): everyone seated, or in a Delve run together everyone standing
 * (those who perished answer nothing).
 */
export function racerIds(s: GameState): string[] {
  return s.delve && isGroupRun(s) ? standingIds(s) : s.players.map((p) => p.id);
}

/** How far ahead of a moment that counts the host's held answer lands (ms), for timers that fire a little late. */
export const HOST_HOLD_MARGIN_MS = 50;

/**
 * Delve together: how long the host's own answer at `now` is held back
 * (host clock): `handicap`, a typical guest's one-way trip, but never past
 * the moment that judges it, as the engine judges the host's answers by
 * when they arrive with no allowance: before the clock hits 0 (where a
 * flare would burn) and, on an Azurite Vein, before its fast window closes.
 * Anywhere else, `handicap` as it is.
 */
export function hostAnswerHold(s: GameState, now: number, handicap: number): number {
  const q = s.question;
  if (handicap <= 0) return 0;
  if (!s.delve || !isGroupRun(s) || s.phase !== 'question' || !q || q.deadline === null) return handicap;
  let cap = q.deadline - now;
  const fastEnd = q.clockAt === undefined ? null : q.clockAt + veinWindowMs(s);
  if (fastEnd !== null && q.find === 'azurite' && now <= fastEnd) cap = Math.min(cap, fastEnd - now);
  return Math.max(0, Math.min(handicap, cap - HOST_HOLD_MARGIN_MS));
}

/**
 * A Delve run saved by a build with other rules plays on, but never counts
 * as a best. A run already decided stays as it ended (its record is final):
 * over, or with nobody standing (alone: the player perished; together: the
 * last of them), the end only a step away.
 */
export function underRuleset(s: GameState): GameState {
  if (!s.delve || s.phase === 'over' || s.delve.ruleset === DELVE_RULESET || s.delve.mixed) return s;
  if (s.phase !== 'lobby' && !standingIds(s).length) return s;
  return { ...s, delve: { ...s.delve, mixed: true } };
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
 * Delve: this change blasted the question in play away for a new one at the
 * same depth (its Blast), or null: the new question names the one `prev`
 * had in play. Not for a question asked again in its place (its art
 * failed), which keeps the blast that asked it.
 */
export function blastedAway(prev: GameState | null, next: GameState): Blast | null {
  const b = next.question?.blast;
  if (!b || !prev?.delve || !next.delve || prev.delve.startedAt !== next.delve.startedAt || next.phase !== 'question') return null;
  return prev.phase === 'question' && prev.question?.askedAt === b.was.at ? b : null;
}

/**
 * Delve: the fuse's sound started for question `qid` (`sound`, which ends at
 * `until`, Date.now() time) is still heard at `now`. One that has ended is
 * as good as none: after a Detonate the host turned down, the fuse can sound
 * again for that question (a second press, or the clock's last seconds).
 */
export function fuseHeard(sound: { qid: number; until: number } | null, qid: number, now: number): boolean {
  return !!sound && sound.qid === qid && now < sound.until;
}

/**
 * This change starts a game (from the lobby, or again after one ended): the
 * Delve run's start (its id) when it is one, or null. A screen that comes in
 * later (a reload, a rejoin) never sees it, so it plays nothing a start does.
 */
export function runSeenStarting(prev: GameState | null, next: GameState): number | null {
  if (!prev || !next.delve) return null;
  const started = (prev.phase === 'lobby' || prev.phase === 'over') && (next.phase === 'choosing' || next.phase === 'question');
  return started ? next.delve.startedAt : null;
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
  /** Co-op: a player lost their last life, at `depth`. */
  | { kind: 'perished'; playerId: string; depth: number };

/**
 * What a state change tells every screen beyond what it draws: a question
 * was set aside because the host reloaded (a toast), and together, a player
 * perishing (heard). A teammate's wrong pick, a revive and a flare burning
 * the game screen says itself; alone, the player's own screen says all of it.
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
  for (const p of next.players)
    if (livesOf(prev, p.id) > 0 && livesOf(next, p.id) === 0) out.push({ kind: 'perished', playerId: p.id, depth: fellAt(next, p.id) ?? next.round });
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
 * What Dynamite Caches' blasts destroyed in this change, per player, for the
 * phial, sounds and effects: alone, at the reveal of a miss; together, with
 * each wrong pick as it comes in, and the time-out's at the reveal. Nothing
 * for a question set aside (what it took is given back). `prev` needs only
 * its phase, its turnCount and its question's askedAt and struck.
 */
export function itemsBlown(prev: GameState | null, next: GameState): { playerId: string; item: ItemKind }[] {
  if (!prev?.delve || !next.delve || prev.delve.startedAt !== next.delve.startedAt || setAside(prev, next)) return [];
  const q = next.question;
  if (!q) return [];
  const reveals = prev.phase !== 'reveal' && next.phase === 'reveal' && !!next.reveal;
  if (!isGroupRun(next)) {
    const p = next.players[next.turn];
    return reveals && next.reveal!.blown && p ? [{ playerId: p.id, item: next.reveal!.blown }] : [];
  }
  const seen = prev.question?.askedAt === q.askedAt ? (prev.question.struck?.length ?? 0) : 0;
  const out = (q.struck ?? []).slice(seen).flatMap((x) => (x.blown ? [{ playerId: x.by, item: x.blown }] : []));
  if (reveals) for (const h of next.reveal!.hits ?? []) if (h.timedOut && h.blown) out.push({ playerId: h.playerId, item: h.blown });
  return out;
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
 * Delve: how the question `s` reveals ended for the player on this device
 * (`me`; null for none, as hot-seat), as the dark closing in with its clock
 * settles (darkness.ts resolveDark), or null for no reveal. Alone, the
 * answer's own outcome. Together, your own: your right answer, or a loss
 * you took (your wrong pick, or the time-out while you stood); with no
 * answer of yours (a teammate's came first, or you watch or lie perished),
 * the team's. A ward that took the whole loss rescues; the last life lost,
 * or the whole team fallen, holds the dark until the reveal is over.
 */
export function darkOutcome(s: GameState, me: string | null): DarkOutcome | null {
  const r = s.phase === 'reveal' ? s.reveal : null;
  if (!s.delve || !r) return null;
  if (isGroupRun(s)) {
    if (me && r.winnerId === me) return 'right';
    const hit = me ? r.hits?.find((h) => h.playerId === me) : undefined;
    if (me && hit) {
      if (hit.lives > 0 && livesOf(s, me) === 0) return 'perish';
      return hit.lives === 0 && hit.wards > 0 ? 'ward' : 'miss';
    }
    if (r.winnerId) return 'right';
    return standingIds(s).length ? 'miss' : 'perish';
  }
  if (r.correct) return 'right';
  const id = s.players[s.turn]?.id;
  if (id && fellAt(s, id) === s.round) return 'perish';
  return r.warded ? 'ward' : 'miss';
}
