// How a room answers probes (lib/rooms.ts): browsers that only ask after it,
// the room list's scan on a public room's listing slot and an invite link's
// screen on the room's own id. Apart from rooms.ts, which needs PeerJS, so
// tests can reach it.

import type { DataConnection } from 'peerjs';
import { wireRoomInfo, type RoomInfo } from './roomInfo.ts';

/** Probes answered at once / per 10 seconds before refusing more. */
const MAX_OPEN = 8;
const MAX_PER_10S = 60;
/** A probe is hung up on this long after its answer, and this long at most whatever happens (ms). */
const ANSWERED_MS = 2000;
const LONGEST_MS = 4000;

/** A connection that only asks after the room (a probe), not one that comes to play. */
export const isProbe = (conn: DataConnection) => !!(conn.metadata as { probe?: unknown } | undefined)?.probe;

/**
 * Answers probes: the room's info, then it hangs up. A few at once and so
 * many per 10 seconds; past that a probe is hung up on unanswered. Used on a
 * public room's listing slot (Beacon) and on the room's own id, which an
 * invite link's screen asks whose room it is (probeRoom).
 */
export class ProbeDesk {
  private open = 0;
  private recent: number[] = [];
  private info: () => RoomInfo | null;

  constructor(info: () => RoomInfo | null) {
    this.info = info;
  }

  answer(conn: DataConnection) {
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
    // Probes only need to listen; anything they send is ignored.
    conn.on('open', () => {
      const room = this.info();
      if (room) conn.send({ t: 'info', room: wireRoomInfo(room) });
      setTimeout(() => conn.close(), ANSWERED_MS);
    });
  }
}
