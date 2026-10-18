// "Play from here": a scene's room made real. Each seat (the host, up to
// three guests, or the one device of a hot-seat game) gets the storage a
// device in that room would hold after a reload: the host its save (the
// room's state, each guest's secret for its seat), a guest its secret, name
// and the room it was in. App's resume() then reopens the room and rejoins
// it, the way the game does after any reload, so nothing new runs in the
// session (the live-network spike, FINDINGS.md on its branch, timed it).
// Players without a seat stay in the room, offline.

import { roomSecret } from '../../lib/guard.ts';
import { CODE_ALPHABET, randomCode, randomToken } from '../../lib/roomCode.ts';
import type { GameState } from '../../lib/game.ts';
import type { Built } from '../scene.ts';

export interface LiveSeat {
  /** The seat's name in the room's frames (`host`, `g1`...; storage.ts' QA_SEAT). */
  key: string;
  name: string;
  playerId: string | null;
  role: 'host' | 'guest' | 'local';
  /** Its storage, by name (each under the seat's own start). */
  seed: { local: Record<string, string>; session: Record<string, string> };
}

export interface LiveRoom {
  /** The room's own start for PeerJS ids (lib/peer.ts), new each time. */
  nonce: string;
  code: string;
  seats: LiveSeat[];
  /** Players in the room with no seat: they stay offline. */
  offline: string[];
}


/**
 * The state's moments (host clock, ms) by their names in lib/game.ts:
 * askedAt, clockAt, startedAt, dealAt, flaredAt, leftAt, graceUntil,
 * voteFrom, and the `at` of a revive, a strike or a reveal. A RecapItem's
 * `at` is a depth, so the name alone isn't enough: a moment is also a
 * moment's size (2001 to 2096).
 */
const MOMENT_NAME = /(At|Until)$|^(at|voteFrom)$/;
const isMoment = (key: string, v: unknown): v is number => MOMENT_NAME.test(key) && typeof v === 'number' && v > 1e12 && v < 4e12;

/** `state` with every moment in it moved on by `by` ms: the room picks up now, as it stood at the scene's moment. */
export function retime<T>(state: T, by: number): T {
  const move = (key: string, v: unknown): unknown =>
    isMoment(key, v) ? v + by : Array.isArray(v) ? v.map((x) => move(key, x)) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, move(k, x)])) : v;
  return move('', state) as T;
}

/** At most this many seats: four games side by side on one page run well (the spike's numbers). */
export const MAX_SEATS = 4;

/** The room for a scene's state as it stood at its moment, or null when it has none. */
export async function liveRoom(built: Built): Promise<LiveRoom | null> {
  const s0 = built.state;
  if (!s0) return null;
  const now = Date.now();
  const state: GameState = retime(s0, now - (built.at ?? s0.startedAt ?? now));
  // (Letters and digits only: storage.ts and peer.ts read it from the frame's name as \w+.)
  const nonce = randomToken(8, CODE_ALPHABET).toLowerCase();
  const code = randomCode();
  const common = { 'fullscreenTip.shown': '3' };
  const host = state.players.find((p) => p.id === state.hostId);
  if (!host) {
    // Hot-seat, or a run alone: one device, no room.
    const name = state.players[0]?.name ?? 'Kalguur';
    return { nonce, code, offline: [], seats: [{ key: 'local', name, playerId: null, role: 'local', seed: { local: { ...common, name }, session: { 'session.v4': JSON.stringify({ mode: 'local', state }) } } }] };
  }
  const guests = state.players.filter((p) => p.id !== host.id).slice(0, MAX_SEATS - 1);
  const seats: LiveSeat[] = [];
  const secrets: [string, string][] = [];
  for (const [i, g] of guests.entries()) {
    const secret = randomToken(32);
    secrets.push([await roomSecret(secret, code), g.id]);
    seats.push({
      key: `g${i + 1}`,
      name: g.name,
      playerId: g.id,
      role: 'guest',
      seed: { local: { ...common, secret, name: g.name }, session: { 'session.v4': JSON.stringify({ mode: 'client', code, name: g.name }) } },
    });
  }
  const priv = { myPlayerId: host.id, secrets, bannedSecrets: [], bannedPeers: [], bannedNames: [], blockedPeers: [] };
  seats.unshift({
    key: 'host',
    name: host.name,
    playerId: host.id,
    role: 'host',
    seed: { local: { ...common, name: host.name }, session: { 'session.v4': JSON.stringify({ mode: 'host', code, state, priv }), 'session.alive': String(now) } },
  });
  const seated = new Set(seats.map((x) => x.playerId));
  return { nonce, code, seats, offline: state.players.filter((p) => !seated.has(p.id)).map((p) => p.name) };
}

/** A seat's storage, for its address (#seed=, read by ./seat.ts): JSON in base64url. */
export function seedParam(seed: LiveSeat['seed']): string {
  const bytes = new TextEncoder().encode(JSON.stringify(seed));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
