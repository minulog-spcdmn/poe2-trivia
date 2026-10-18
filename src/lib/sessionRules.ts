// The session's decisions about guests, saves and the state it is sent,
// apart from PeerJS and Svelte so tests can reach them (as delveSession.ts
// is for Delve's).

import { isGroupRun } from './delve.ts';
import { clockRuns, createGame, type Engine, type GameState } from './game.ts';
import { versionProblem, type HostMsg } from './protocol.ts';

/** Host-only data that must survive a page refresh but never reach guests. */
export interface HostPrivate {
  myPlayerId: string;
  secrets: [string, string][];
  bannedSecrets: string[];
  /** Peers of kicked players. */
  bannedPeers: string[];
  /** Name skeletons of kicked players, refused to newcomers. */
  bannedNames: string[];
  /**
   * Peers that sent something no real client sends. Kept apart from the
   * kicks, so a pile of these can't push a kick off the (capped) list.
   */
  blockedPeers: string[];
}

export const noPrivate = (myPlayerId = ''): HostPrivate => ({
  myPlayerId,
  secrets: [],
  bannedSecrets: [],
  bannedPeers: [],
  bannedNames: [],
  blockedPeers: [],
});

/** A saved HostPrivate as the host takes it up again: its own copies of each list, and those a build saved without as empty. */
export function privateFrom(p: HostPrivate): HostPrivate {
  return {
    ...p,
    secrets: [...p.secrets],
    bannedSecrets: [...p.bannedSecrets],
    bannedPeers: [...p.bannedPeers],
    // Saved by a build that didn't have these yet: start them empty.
    bannedNames: [...(p.bannedNames ?? [])],
    blockedPeers: [...(p.blockedPeers ?? [])],
  };
}

/** The most guests' tokens a host remembers (saved with the room). */
export const MAX_KNOWN = 400;

/**
 * Remembers a newcomer's token in `secrets`, forgetting the oldest one of
 * someone not in the room (`here`, by id) once there are more than `max`.
 * Returns the token forgotten, if any; with everyone remembered still here,
 * none is.
 */
export function rememberSecret(secrets: [string, string][], secret: string, playerId: string, here: Set<string>, max = MAX_KNOWN): string | null {
  secrets.push([secret, playerId]);
  if (secrets.length <= max) return null;
  const drop = secrets.findIndex(([, id]) => !here.has(id));
  if (drop < 0) return null;
  const [[gone]] = secrets.splice(drop, 1);
  return gone;
}

/**
 * How the host turns a hello down before seating it, in order: on another
 * version (said as such, so the guest's page can tell), unable to open
 * sealed pictures, kicked from this room, then out of the join budgets
 * (`admit`, asked only once the rest passed: every turn it's asked costs one;
 * guard.ts JoinGate). Null: on to its seat.
 */
export function helloRefusal(v: number, seal: boolean, kicked: boolean, admit: () => string | null, noSeal: string): HostMsg | null {
  const outdated = versionProblem(v);
  if (outdated) return { t: 'error', message: outdated, version: true };
  if (!seal) return { t: 'error', message: noSeal };
  if (kicked) return { t: 'kicked' };
  const busy = admit();
  // Not a refusal: the client tries again a little later.
  if (busy) return { t: 'busy', message: busy };
  return null;
}

/** Faster than this (after the question reached them: the key to its art, as its clock started) is not a human answer. */
export const MIN_HUMAN_MS = 200;

/**
 * Host: an answer (to the question asked at `askedAt`) that arrives before a
 * human could have seen the question. `artFailedFor`: the question whose art
 * couldn't be loaded; `mediaAt`: when the guest was sent the key to the
 * art; `clockAt`: when the question's clock was last seen starting (0 when
 * not this question's); `rtt`: the guest's link's round trip (honestRtt).
 */
export function tooFast(
  s: GameState | null,
  askedAt: number | undefined,
  o: { artFailedFor: number; mediaAt: { qid: number; at: number } | null; clockAt: number; rtt: number; now: number },
): boolean {
  const q = s?.question;
  // One for a question gone by, or come in as it was revealed, is the engine's to drop ("Too late!").
  if (!q || s!.phase !== 'question' || (askedAt !== undefined && askedAt !== q.askedAt)) return false;
  // Before its clock the engine turns every answer down by itself (too early, without a word).
  if (!clockRuns(q)) return false;
  // No art went out at all: don't hold answers back waiting for it.
  if (o.artFailedFor === q.askedAt) return false;
  // Counted from the key reaching them (it opens the art): the sealed bytes may have been there for a while.
  if (!o.mediaAt || o.mediaAt.qid !== q.askedAt) return true;
  // Nor before its clock started as this device last saw it (a Delve clock
  // the host's reload held still carries on later).
  return o.now - Math.max(o.mediaAt.at, o.clockAt) < o.rtt + MIN_HUMAN_MS;
}

/**
 * Guest: whether a state the host sent replaces the one shown. An older one
 * (messages can pass each other on a reconnect) is left, except a restart's,
 * whose count starts again at 0.
 */
export const takesState = (shown: GameState | null, sent: GameState) => !shown || sent.version >= shown.version || sent.version === 0;

export type Saved =
  | { mode: 'local'; state: GameState }
  | { mode: 'host'; code: string; state: GameState; priv: HostPrivate }
  /** `watch`: the guest chose to watch rather than play. */
  | { mode: 'client'; code: string; name: string; watch?: boolean };

/**
 * The save to pick up, from its text (`raw`), else from the one a build
 * before per-room guest tokens left (`old`). Of an old one only a hot-seat
 * game carries on: a hosted room's guests' tokens no longer match, and a
 * guest's room can't be reached by this version. Damaged text is no save.
 */
export function parseSaved(raw: string | null, old: string | null): Saved | null {
  try {
    if (raw) return JSON.parse(raw) as Saved;
    const saved = old ? (JSON.parse(old) as Saved) : null;
    return saved?.mode === 'local' ? saved : null;
  } catch {
    return null;
  }
}

/**
 * Hot-seat Delve is a run alone (together it is co-op, played online): a
 * group's hot-seat run saved by an older build goes back to its lobby
 * (`turned` is told, to say so), where the players can pick another game or
 * delve alone.
 */
export function soloHotSeat(s: GameState, engine: Engine, turned: () => void): GameState {
  if (!s.delve || s.hostId !== null || !isGroupRun(s) || s.phase === 'lobby' || s.phase === 'over') return s;
  try {
    const lobby = engine.apply(s, { type: 'restart' }, null);
    turned();
    return lobby;
  } catch {
    return createGame(null);
  }
}
