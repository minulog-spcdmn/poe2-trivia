// How a room answers probes (lib/rooms.ts): browsers that only ask after it,
// the room list's scan on a public room's listing slot and an invite link's
// screen on the room's own id. They ask over the signalling server (a ping),
// and connect only to a room that answers no ping (an older version, or one
// past its share of pings).
// Apart from rooms.ts, which needs PeerJS, so tests can reach it.

import type { DataConnection } from 'peerjs';
import { hookFrames } from './guard.ts';
import { isChallenge } from './ownerKey.ts';
import { wireRoomInfo, type RoomInfo } from './roomInfo.ts';

/** Probes that connect answered at once / per 10 seconds before refusing more. */
const MAX_OPEN = 8;
const MAX_PER_10S = 60;
/**
 * Pings answered per 10 seconds, and from any one sender. They have a share
 * of their own: a flood of pings, which cost only a message, leaves probes
 * that connect theirs (which a ping gone unanswered falls back on, rooms.ts).
 */
const MAX_PINGS_PER_10S = 60;
const MAX_PINGS_PER_SENDER = 3;
/** A probe is hung up on this long after its answer, and this long at most whatever happens (ms). */
const ANSWERED_MS = 2000;
const LONGEST_MS = 4000;

/** A connection that only asks after the room (a probe), not one that comes to play. */
export const isProbe = (conn: DataConnection) => !!(conn.metadata as { probe?: unknown } | undefined)?.probe;

/** The room's info for a probe, given the challenge it brought (for a listing under the held name to be signed over, ownerKey.ts). */
export type ListingInfo = (challenge: string | null) => RoomInfo | null | Promise<RoomInfo | null>;

/**
 * Answers probes: the room's info, then it hangs up. A few at once and so
 * many per 10 seconds; past that a probe is hung up on unanswered. Used on a
 * public room's listing slot (Beacon) and on the room's own id, which an
 * invite link's screen asks whose room it is (probeRoom).
 */
export class ProbeDesk {
  private open = 0;
  private recent: number[] = [];
  /** When each ping answered in the last 10 seconds came, and from whom. */
  private pings: { at: number; from: string }[] = [];
  private info: ListingInfo;

  constructor(info: ListingInfo) {
    this.info = info;
  }

  /** Answers a ping (pingOf) from `from` through `reply`: the room's info, or null when it has none. Past the limits it goes unanswered. */
  answerPing(from: string, challenge: string | null, reply: (room: RoomInfo | null) => void) {
    const now = Date.now();
    this.pings = this.pings.filter((p) => now - p.at < 10000);
    if (this.pings.length >= MAX_PINGS_PER_10S || this.pings.filter((p) => p.from === from).length >= MAX_PINGS_PER_SENDER) return;
    this.pings.push({ at: now, from });
    const room = this.info(challenge);
    if (room instanceof Promise) void room.then(reply, () => reply(null));
    else reply(room);
  }

  answer(conn: DataConnection) {
    // Probes only listen: anything one sends hangs it up, before PeerJS decodes it.
    const hangUp = () => (conn.close(), false);
    hookFrames(conn, hangUp, hangUp);
    const now = Date.now();
    this.recent = this.recent.filter((t) => now - t < 10000);
    if (this.open >= MAX_OPEN || this.recent.length >= MAX_PER_10S) {
      conn.on('open', () => conn.close());
      return;
    }
    this.open++;
    this.recent.push(now);
    let counted = true;
    const release = () => {
      if (counted) this.open--;
      counted = false;
    };
    conn.on('close', release);
    conn.on('error', release);
    // Never keep a probe around for long, even if it never opens.
    setTimeout(() => {
      conn.close();
      release();
    }, LONGEST_MS);
    conn.on('open', () => {
      const challenge = (conn.metadata as { challenge?: unknown } | undefined)?.challenge;
      const tell = (room: RoomInfo | null) => {
        if (room) conn.send({ t: 'info', room: wireRoomInfo(room) });
        setTimeout(() => conn.close(), ANSWERED_MS);
      };
      const room = this.info(isChallenge(challenge) ? challenge : null);
      if (room instanceof Promise) void room.then(tell, () => tell(null));
      else tell(room);
    });
  }
}

/**
 * A ping or its answer, as the signalling server carries it. The free server
 * passes on only what looks like WebRTC's own messages (anything else gets
 * the sender cut off), so both go as an ICE candidate, whose payload may
 * carry more: `probe` (the challenge) asks, `room` answers. PeerJS keeps a
 * candidate for a connection it doesn't know, in case that turns up; whoever
 * reads one takes it back out (rooms.ts).
 */
type Signal = {
  type: 'CANDIDATE';
  dst: string;
  payload: { candidate: { candidate: ''; sdpMid: '0'; sdpMLineIndex: 0 }; type: 'data'; connectionId: string; probe?: string; room?: unknown };
};

const signal = (dst: string, connectionId: string, extra: { probe: string } | { room: unknown }): Signal => ({
  type: 'CANDIDATE',
  dst,
  payload: { candidate: { candidate: '', sdpMid: '0', sdpMLineIndex: 0 }, type: 'data', connectionId, ...extra },
});

/** A ping to `dst` under a connection id of its own, with a challenge for a listing under the held name to be signed over. */
export const ping = (dst: string, connectionId: string, challenge: string): Signal => signal(dst, connectionId, { probe: challenge });

/** The answer to a ping from `src`: the room's info, or null for none. */
export const pingAnswer = (src: string, connectionId: string, room: RoomInfo | null): Signal =>
  signal(src, connectionId, { room: room ? wireRoomInfo(room) : null });

/** A candidate from the signalling server, which sets `src` itself, so it says who sent it. */
function heard(msg: unknown): { src: string; connectionId: string; payload: Record<string, unknown> } | null {
  const m = msg as { type?: unknown; src?: unknown; payload?: unknown } | null;
  if (m?.type !== 'CANDIDATE' || typeof m.src !== 'string' || typeof m.payload !== 'object' || m.payload === null) return null;
  const payload = m.payload as Record<string, unknown>;
  return typeof payload.connectionId === 'string' ? { src: m.src, connectionId: payload.connectionId, payload } : null;
}

/** A ping, if `msg` is one: who sent it, its connection id and its challenge (null for none, or junk). */
export function pingOf(msg: unknown): { src: string; connectionId: string; challenge: string | null } | null {
  const h = heard(msg);
  if (!h || !('probe' in h.payload)) return null;
  return { src: h.src, connectionId: h.connectionId, challenge: isChallenge(h.payload.probe) ? h.payload.probe : null };
}

/** An answer to a ping, if `msg` is one: who sent it, the ping's connection id and the room as sent (unchecked; null for none). */
export function answerOf(msg: unknown): { src: string; connectionId: string; room: unknown } | null {
  const h = heard(msg);
  return h && 'room' in h.payload ? { src: h.src, connectionId: h.connectionId, room: h.payload.room } : null;
}
