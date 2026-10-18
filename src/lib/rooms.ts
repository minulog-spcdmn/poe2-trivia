// Public room listing without a server.
//
// A public room also registers under a numbered "listing slot" peer id
// (…-pub-1, …-pub-2, …), always taking the lowest free number. Browsers find
// rooms by probing slots in batches and stop after a batch that is entirely
// empty. Probes past slot 30 are spaced out so a busy site doesn't get us
// throttled by the free signalling server.
//
// A probe is a ping over the signalling server (probeDesk.ts), which a room
// answers with its info, so the room list never connects to anyone: a
// browser's first WebRTC connection holds up its page for half a second or
// more, and the list mostly finds nobody. The server says when nobody holds a
// slot, but only once per id in five seconds, whoever asks (another browser
// scanning just before gets told): a ping met with silence is as good as free.

import Peer, { type DataConnection } from 'peerjs';
import { PEER_OPTIONS, PEER_PREFIX } from './peer';
import { frameFits, hookFrames, MAX_PROBE_BYTES } from './guard';
import { isHeldName } from './names';
import { checkRoom, newChallenge } from './ownerKey';

export { parseRoomInfo, wireRoomInfo, type RoomInfo } from './roomInfo';
export { ProbeDesk, isProbe } from './probeDesk';
import { listable, parseRoomInfo, type RoomInfo } from './roomInfo';
import { ProbeDesk, answerOf, ping, pingAnswer, pingOf, type ListingInfo } from './probeDesk';

const BATCH = 10;
/** Slots up to this are scanned at full speed; later batches wait a little. */
const FAST_SLOTS = 30;
const SLOW_BATCH_DELAY_MS = 800;
/**
 * How long a room has to answer a ping. Past it the room list takes the slot
 * as having nothing to list, and an invite's probe connects instead (an older
 * version answers only that way).
 */
const PING_ANSWER_MS = 2000;
// A signalling server may report a free slot to a connection only after its
// message expiry (~5s), so give real rooms comfortably longer than that to answer.
const PROBE_TIMEOUT_MS = 9000;
/** How long an invite's probe waits for the signalling server before it gives up (probeRoom). */
const PROBE_OPEN_TIMEOUT_MS = 8000;
/**
 * Once connected, how long a room has to answer a probe: one that knows
 * probes (ProbeDesk) answers at once. An older one never does, and would
 * hold the probe as someone about to join, taking a joiner's place, until it
 * gives up: the probe lets go of it well before.
 */
const PROBE_ANSWER_MS = 2500;
/** Hard stop, even if someone fills every slot with junk. */
const MAX_SLOTS = 300;
/** Most rooms we'll list. */
export const MAX_LISTED = 60;
const COMPACT_EVERY_MS = 30000;

export const slotId = (n: number) => `${PEER_PREFIX}pub-${n}`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type ProbeResult = RoomInfo | 'free' | null;

/**
 * Tracks outstanding probes on one peer so "peer-unavailable" errors (which
 * PeerJS reports on the peer, not the connection) reach the right probe.
 */
class Prober {
  private waiting = new Map<string, (r: ProbeResult) => void>();
  /** Pings out, by connection id: the id each went to, and what to do with its answer. */
  private pings = new Map<string, { id: string; answered: (room: unknown) => void }>();

  constructor(readonly peer: Peer) {
    peer.on('error', (err) => {
      if (err.type !== 'peer-unavailable') return;
      // The message ends with the peer id ("Could not connect to peer <id>");
      // match it exactly so pub-1 doesn't also catch pub-10.
      const id = err.message.trim().split(/\s+/).pop() ?? '';
      this.waiting.get(id)?.('free');
    });
    peer.socket.on('message', (msg: unknown) => {
      const a = answerOf(msg);
      if (!a) return;
      // PeerJS kept it for a connection that never comes.
      peer._getMessages(a.connectionId);
      const out = this.pings.get(a.connectionId);
      if (out?.id === a.src) out.answered(a.room);
    });
  }

  /** Asks `id` what it is; one that doesn't answer the ping is connected to only if `connect` (it shares this browser's IP address with the room). */
  probe(id: string, connect = false): Promise<ProbeResult> {
    // Cut off from the server, PeerJS can't ping or connect (connect()
    // returns nothing): no answer, as if the probe timed out.
    if (this.peer.disconnected || this.peer.destroyed) return Promise.resolve(null);
    return new Promise((resolve) => {
      let conn: DataConnection | null = null;
      let settled = false;
      const connectionId = `dc_${Math.random().toString(36).slice(2)}`;
      // Every probe settles once, on its own; it takes itself off the
      // waiting list only if it's still the one there (a later probe of the
      // same id may have taken its place, and stays waiting).
      const done = (r: ProbeResult) => {
        if (settled) return;
        settled = true;
        if (this.waiting.get(id) === done) this.waiting.delete(id);
        this.pings.delete(connectionId);
        clearTimeout(timer);
        conn?.close();
        resolve(r);
      };
      // A fresh challenge, which a host under the held name signs its listing over (ownerKey.ts roomProof).
      const challenge = newChallenge();
      // Whoever holds a slot is a stranger: what it says is checked first.
      const told = (raw: unknown) => {
        const room = parseRoomInfo(raw);
        // A host under the held name is listed only with the owner key's signature for its room.
        if (room && isHeldName(room.host)) void checkRoom(PEER_PREFIX + room.code, challenge, room.owner).then((ok) => done(ok ? room : null));
        else done(room ?? null);
      };
      const connectNow = () => {
        timer = setTimeout(() => done(null), PROBE_TIMEOUT_MS);
        conn = this.peer.connect(id, { reliable: true, metadata: { probe: true, challenge } });
        // Checked before PeerJS decodes it, and a probe's answer is never split.
        hookFrames(conn, (data) => frameFits(data, MAX_PROBE_BYTES) || (done(null), false), () => (done(null), false));
        conn.on('data', (raw) => {
          const msg = raw as { t?: string; room?: unknown };
          if (msg?.t === 'info') told(msg.room);
        });
        conn.on('open', () => {
          if (settled) return;
          clearTimeout(timer);
          timer = setTimeout(() => done(null), PROBE_ANSWER_MS);
        });
        conn.on('error', () => done(null));
      };
      let timer = setTimeout(() => (connect ? connectNow() : done(null)), PING_ANSWER_MS);
      this.waiting.set(id, done);
      this.pings.set(connectionId, { id, answered: told });
      this.peer.socket.send(ping(id, connectionId, challenge));
    });
  }
}

/** Answers pings that reach `peer` (probeDesk.ts) through `desk`, as it answers probes that connect. */
export function hearPings(peer: Peer, desk: ProbeDesk) {
  peer.socket.on('message', (msg: unknown) => {
    const p = pingOf(msg);
    if (!p) return;
    // PeerJS kept it for a connection that never comes.
    peer._getMessages(p.connectionId);
    desk.answerPing(p.challenge, (room) => {
      if (!peer.destroyed) peer.socket.send(pingAnswer(p.src, p.connectionId, room));
    });
  });
}

function openPeer(id?: string): Promise<Peer> {
  return new Promise((resolve, reject) => {
    const peer = id ? new Peer(id, PEER_OPTIONS) : new Peer(PEER_OPTIONS);
    const fail = (err: unknown) => {
      peer.destroy();
      reject(err);
    };
    peer.once('open', () => {
      peer.off('error', fail);
      resolve(peer);
    });
    peer.once('error', fail);
  });
}

/**
 * Scans the listing slots, calling onRoom for every room found. Resolves when
 * the scan is done or `cancelled()` returns true.
 */
export async function scanRooms(onRoom: (room: RoomInfo) => void, cancelled: () => boolean): Promise<void> {
  const peer = await openPeer();
  const prober = new Prober(peer);
  try {
    let listed = 0;
    for (let start = 1; start <= MAX_SLOTS; start += BATCH) {
      if (cancelled() || listed >= MAX_LISTED) return;
      if (start > FAST_SLOTS) await sleep(SLOW_BATCH_DELAY_MS);
      const ids = Array.from({ length: BATCH }, (_, i) => slotId(start + i));
      let found = 0;
      await Promise.all(
        ids.map(async (id) => {
          const r = await prober.probe(id);
          if (r && r !== 'free') {
            found++;
            if (listable(r) && !cancelled() && listed++ < MAX_LISTED) onRoom(r);
          }
        }),
      );
      // Rooms always take the lowest free slot, so an empty batch means we're past the end.
      if (found === 0) return;
    }
  } finally {
    peer.destroy();
  }
}

/**
 * Asks a room, by its code, what it is (an invite link's screen: whose room,
 * how many are in, and whether it can be joined): its info, 'gone' when no
 * room has the code, or null when it doesn't answer (a host on a version
 * that doesn't answer probes yet, or no connection). A room that doesn't
 * answer the ping is connected to, which shares this browser's IP address
 * with its host (as joining it would).
 */
export async function probeRoom(code: string): Promise<RoomInfo | 'gone' | null> {
  // A signalling server that never answers (blocked, offline) gives no error
  // for a long while: past this, the room is taken as not answering.
  const opening = openPeer();
  const peer = await Promise.race([opening.catch(() => null), sleep(PROBE_OPEN_TIMEOUT_MS).then(() => null)]);
  if (!peer) {
    void opening.then((late) => late.destroy(), () => {});
    return null;
  }
  try {
    const r = await new Prober(peer).probe(PEER_PREFIX + code, true);
    // Only this room's own listing: another room's, signed for the held name, passed on by this one, would show it as theirs.
    return r === 'free' ? 'gone' : r && r.code !== code ? null : r;
  } finally {
    peer.destroy();
  }
}

/**
 * Keeps a hosted room listed: holds the lowest free listing slot, answers
 * probes with fresh room info and moves down when a lower slot frees up.
 */
export class Beacon {
  private peer: Peer | null = null;
  private slot = 0;
  private stopped = false;
  private compactTimer: ReturnType<typeof setInterval> | null = null;
  private compacting = false;
  private prober: Prober | null = null;

  constructor(private info: ListingInfo) {}

  start() {
    this.stopped = false;
    void this.claimFrom(1);
    this.compactTimer = setInterval(() => void this.compact(), COMPACT_EVERY_MS + Math.random() * 5000);
  }

  stop() {
    this.stopped = true;
    if (this.compactTimer) clearInterval(this.compactTimer);
    this.compactTimer = null;
    this.peer?.destroy();
    this.peer = null;
    this.prober = null;
    this.slot = 0;
  }

  /** Claims the lowest free slot from n, trying a few slots at a time. */
  private async claimFrom(n: number) {
    const PARALLEL = 5;
    for (let start = n; start <= MAX_SLOTS && !this.stopped; start += PARALLEL) {
      if (start > FAST_SLOTS) await sleep(SLOW_BATCH_DELAY_MS);
      const slots = Array.from({ length: PARALLEL }, (_, i) => start + i);
      const results = await Promise.all(slots.map((slot) => this.tryClaim(slot)));
      // Keep the lowest slot we got and let go of the others (all of them if
      // the room was set to private, or closed, while claiming).
      const won = this.stopped ? -1 : results.findIndex((r) => r && r !== 'taken');
      results.forEach((r, i) => i !== won && r && r !== 'taken' && r.destroy());
      if (this.stopped) return;
      if (won >= 0) {
        this.adopt(results[won] as Peer, slots[won]);
        return;
      }
      if (results.some((r) => r === null)) {
        // Network trouble: try again later from the start.
        setTimeout(() => !this.stopped && !this.peer && void this.claimFrom(1), 10000);
        return;
      }
    }
  }

  private async tryClaim(slot: number): Promise<Peer | 'taken' | null> {
    try {
      const peer = await openPeer(slotId(slot));
      if (this.stopped) {
        peer.destroy();
        return null;
      }
      return peer;
    } catch (err) {
      return (err as { type?: string })?.type === 'unavailable-id' ? 'taken' : null;
    }
  }

  private adopt(peer: Peer, slot: number) {
    const old = this.peer;
    this.peer = peer;
    this.prober = new Prober(peer);
    this.slot = slot;
    old?.destroy();
    const desk = new ProbeDesk(this.info);
    hearPings(peer, desk);
    peer.on('connection', (conn) => desk.answer(conn));
    peer.on('disconnected', () => {
      if (!peer.destroyed && this.peer === peer) setTimeout(() => !peer.destroyed && peer.reconnect(), 2000);
    });
    peer.on('error', (err) => {
      // Lost our id (e.g. after a long disconnect): claim a slot again.
      if (this.peer === peer && (err.type === 'unavailable-id' || err.type === 'server-error')) {
        peer.destroy();
        this.peer = null;
        void this.claimFrom(1);
      }
    });
  }

  /**
   * Moves to a lower free slot so that closed rooms don't leave gaps big
   * enough (a whole empty batch) to hide rooms further up from scanners.
   */
  private async compact() {
    if (this.stopped || this.compacting || !this.prober || this.slot <= BATCH) return;
    this.compacting = true;
    try {
      const prober = this.prober;
      for (let n = 1; n < this.slot && !this.stopped; n++) {
        if ((await prober.probe(slotId(n))) !== 'free') continue;
        const peer = await this.tryClaim(n);
        if (peer && peer !== 'taken') this.adopt(peer, n);
        return;
      }
    } catch (err) {
      // Runs in the background: try again next time.
      console.warn('compact', err);
    } finally {
      this.compacting = false;
    }
  }
}
