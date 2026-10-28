// Public room listing without a server.
//
// A public room also registers under a numbered "listing slot" peer id
// (…-pub-1, …-pub-2, …), always taking the lowest free number. Browsers find
// rooms by probing slots in batches and stop after a batch that is entirely
// empty. Probes past slot 30 are spaced out so a busy site doesn't get us
// throttled by the free signalling server.
//
// A probe is a ping over the signalling server (probeDesk.ts), which a room
// answers with its info, so the room list doesn't connect to anyone: a
// browser's first WebRTC connection holds up its page for half a second or
// more, and the list mostly finds nobody. The server says when nobody holds a
// slot, but only once per id in five seconds, whoever asks (another browser
// scanning just before gets told), so a slot that stays silent is asked again
// once that has passed. Silent twice, someone holds it without answering
// pings (an older version, or a room asked too often): that one is connected to.

import type Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import { PEER_PREFIX, loadPeerJsCode, peerOptions } from './peer';
import { randomToken } from './roomCode';
import { frameFits, hookFrames, MAX_PROBE_BYTES } from './guard';
import { isHeldName } from './names';
import { checkRoom, newChallenge } from './ownerKey';

export { parseRoomInfo, wireRoomInfo, type RoomInfo } from './roomInfo';
export { ProbeDesk, isProbe } from './probeDesk';
import { listable, parseRoomInfo, type RoomInfo } from './roomInfo';
import { ProbeDesk, answerOf, isProbe, ping, pingAnswer, pingOf, turnAway, type ListingInfo } from './probeDesk';

const BATCH = 10;
/** Slots up to this are scanned at full speed; later batches wait a little. */
const FAST_SLOTS = 30;
const SLOW_BATCH_DELAY_MS = 800;
/**
 * A slot that hasn't answered a ping by then is pinged again. The server
 * tells one asker per id that it's free in each five-second stretch (fixed
 * stretches, not five seconds from the last told), so this lands in the next
 * one, and the answer comes at once (measured against the free server, a
 * second ping 5.5s after one that went untold: told free in about 20ms).
 */
const REPING_MS = 5500;
/** How long the second ping has before the room list takes the slot as held by someone who doesn't answer pings, and connects. */
const LAST_PING_MS = 2000;
const SCAN_CONNECT_MS = REPING_MS + LAST_PING_MS;
/**
 * An invite's screen connects to a room that hasn't answered by then: it's
 * about to be joined anyway, so the connection costs little, and it shouldn't
 * wait out the second ping first.
 */
const INVITE_CONNECT_MS = 2000;
/** How long a connection to a slot that answers no ping has to open. */
const CONNECT_TIMEOUT_MS = 6000;
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

/**
 * The QA desk's frames (src/qa) have no network: a scene hands in the rooms
 * the list finds and what an invite's room answers (undefined: it never
 * does), and nothing goes out.
 */
let madeUp: { rooms: RoomInfo[]; invite?: RoomInfo | 'gone' | null } | null = null;
export function useMadeUpRooms(rooms: RoomInfo[], invite?: RoomInfo | 'gone' | null) {
  madeUp = { rooms, invite };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * What a probe found: a room; 'free'; 'held' by someone with nothing to list
 * (or nothing that made sense); or null for no word at all.
 */
type ProbeResult = RoomInfo | 'free' | 'held' | null;

type Ping = NonNullable<ReturnType<typeof pingOf>>;
type Answer = NonNullable<ReturnType<typeof answerOf>>;

/**
 * Pings and their answers reaching a peer, handed on by one listener on its
 * socket from the peer's start (openPeer). PeerJS keeps each as a candidate
 * for a connection that never comes; it's taken back out here. Pings that
 * come before anyone answers them (a slot still being claimed, Beacon) wait,
 * a few of them.
 */
type Signals = {
  pinged: ((p: Ping) => void) | null;
  early: Ping[];
  answered: ((a: Answer) => void) | null;
  /** When this peer last answered a ping from each id, lately (whose answer may come back undelivered, Prober). */
  answeredTo: Map<string, number>;
};
const signalsOf = new WeakMap<Peer, Signals>();
const MAX_EARLY_PINGS = 8;
/** How long an answer to a ping may take to come back undelivered, as far as Prober is concerned. */
const ANSWER_BOUNCE_MS = 10000;

function signals(peer: Peer): Signals {
  let s = signalsOf.get(peer);
  if (s) return s;
  const fresh: Signals = { pinged: null, early: [], answered: null, answeredTo: new Map() };
  signalsOf.set(peer, fresh);
  // PeerJS's own listener, which keeps the candidate, comes first: it's set
  // up in Peer's constructor (both checked, tests/peerjsLostMessages.test.ts).
  peer.socket.on('message', (msg: unknown) => {
    const p = pingOf(msg);
    const a = p ? null : answerOf(msg);
    if (!p && !a) return;
    peer._getMessages?.((p ?? a)!.connectionId);
    if (p && fresh.pinged) fresh.pinged(p);
    else if (p) fresh.early.length < MAX_EARLY_PINGS && fresh.early.push(p);
    else if (a) fresh.answered?.(a);
  });
  return fresh;
}

/**
 * Tracks outstanding probes on one peer so "peer-unavailable" errors (which
 * PeerJS reports on the peer, not the connection) reach the right probe.
 */
class Prober {
  private waiting = new Map<string, (r: ProbeResult) => void>();
  /** Pings out, by connection id: the id each went to, and what to do with its answer. */
  private pings = new Map<string, { id: string; answered: (room: unknown) => void }>();

  constructor(readonly peer: Peer) {
    const s = signals(peer);
    peer.on('error', (err) => {
      if (err.type !== 'peer-unavailable') return;
      // The message ends with the peer id ("Could not connect to peer <id>");
      // match it exactly so pub-1 doesn't also catch pub-10.
      const id = err.message.trim().split(/\s+/).pop() ?? '';
      // The same error comes back for an answer to a ping from `id` that
      // didn't reach it (a Beacon that has moved on, compact): no telling
      // which, so it says nothing of whether `id` is free. Claiming tells.
      if (Date.now() - (s.answeredTo.get(id) ?? -Infinity) < ANSWER_BOUNCE_MS) return;
      this.waiting.get(id)?.('free');
    });
    s.answered = (a) => {
      const out = this.pings.get(a.connectionId);
      if (out?.id === a.src) out.answered(a.room);
    };
  }

  /** Settles every probe still out with no word, so none goes on to connect (a scan that was left, or has listed all it will). */
  stop() {
    for (const done of [...this.waiting.values()]) done(null);
  }

  /**
   * Asks `id` what it is. Not answered by `connectAfter` ms, it's connected to
   * (which shares this browser's IP address with whoever holds it), and
   * `connecting` is told; with null, a slot that answers neither ping is left
   * at no word.
   */
  probe(id: string, connectAfter: number | null, connecting?: () => void): Promise<ProbeResult> {
    // Cut off from the server, PeerJS can't ping or connect (connect()
    // returns nothing): no answer, as if the probe timed out.
    if (this.peer.disconnected || this.peer.destroyed) return Promise.resolve(null);
    return new Promise((resolve) => {
      let conn: DataConnection | null = null;
      let settled = false;
      let clear = () => {};
      const connectionId = `dc_${randomToken(11)}`;
      // Every probe settles once, on its own; it takes itself off the
      // waiting list only if it's still the one there (a later probe of the
      // same id may have taken its place, and stays waiting).
      const done = (r: ProbeResult) => {
        if (settled) return;
        settled = true;
        if (this.waiting.get(id) === done) this.waiting.delete(id);
        this.pings.delete(connectionId);
        clear();
        conn?.close();
        resolve(r);
      };
      // A fresh challenge, which a host under the held name signs its listing over (ownerKey.ts roomProof).
      const challenge = newChallenge();
      // Whoever holds a slot is a stranger: what it says is checked first.
      const told = (raw: unknown) => {
        const room = parseRoomInfo(raw);
        // A host under the held name is listed only with the owner key's signature for its room.
        if (room && isHeldName(room.host)) void checkRoom(PEER_PREFIX + room.code, challenge, room.owner).then((ok) => done(ok ? room : 'held'));
        else done(room ?? 'held');
      };
      const connectNow = () => {
        // Cut off from the server since, PeerJS can't connect (connect() returns nothing).
        if (settled) return;
        if (this.peer.disconnected || this.peer.destroyed) return done(null);
        const c = this.peer.connect(id, { reliable: true, metadata: { probe: true, challenge } });
        if (!c) return done(null);
        conn = c;
        connecting?.();
        connTimer = setTimeout(() => done(null), CONNECT_TIMEOUT_MS);
        // Checked before PeerJS decodes it, and a probe's answer is never split.
        hookFrames(c, (data) => frameFits(data, MAX_PROBE_BYTES) || (done('held'), false), () => (done('held'), false));
        c.on('data', (raw) => {
          const msg = raw as { t?: string; room?: unknown };
          if (msg?.t === 'info') told(msg.room);
        });
        c.on('open', () => {
          if (settled) return;
          clearTimeout(connTimer);
          connTimer = setTimeout(() => done('held'), PROBE_ANSWER_MS);
        });
        // Hung up on unanswered (turned away, or past the room's limits): held, and saying nothing.
        c.on('close', () => done('held'));
        c.on('error', () => done(null));
      };
      const send = () => !this.peer.disconnected && this.peer.socket.send(ping(id, connectionId, challenge));
      // Either ping's answer counts, however late, until the probe settles
      // (a connection made meanwhile carries on beside the second ping).
      let connTimer: ReturnType<typeof setTimeout> | undefined;
      const timers = [
        setTimeout(send, REPING_MS),
        setTimeout(() => (connectAfter === null ? done(null) : connectNow()), connectAfter ?? REPING_MS + LAST_PING_MS),
      ];
      clear = () => [...timers, connTimer].forEach((t) => clearTimeout(t));
      this.waiting.set(id, done);
      this.pings.set(connectionId, { id, answered: told });
      send();
    });
  }
}

/**
 * Takes the connections reaching `peer`, and answers probes through `desk`:
 * pings, and connections that say they're probes (from an older version, or
 * one whose pings went unanswered) in PeerJS's default serialization, as
 * every version's are. Whoever `allow` says no to is told there's nothing
 * (a ping) or turned away (a connection); any other connection goes to
 * `others`, or is turned away.
 */
export function answerProbes(
  peer: Peer,
  desk: ProbeDesk,
  { allow = () => true, others = turnAway }: { allow?: (peerId: string) => boolean; others?: (conn: DataConnection) => void } = {},
) {
  const s = signals(peer);
  s.pinged = (p) => {
    const reply = (room: RoomInfo | null) => {
      if (peer.destroyed) return;
      const now = Date.now();
      for (const [id, at] of s.answeredTo) if (now - at >= ANSWER_BOUNCE_MS) s.answeredTo.delete(id);
      s.answeredTo.set(p.src, now);
      peer.socket.send(pingAnswer(p.src, p.connectionId, room));
    };
    desk.answerPing(p.src, p.challenge, reply, !allow(p.src));
  };
  for (const p of s.early.splice(0)) s.pinged(p);
  peer.on('connection', (conn) => {
    if (!isProbe(conn)) others(conn);
    else if (allow(conn.peer) && conn.serialization === 'binary') desk.answer(conn);
    else turnAway(conn);
  });
}

async function openPeer(id?: string): Promise<Peer> {
  const { default: Peer } = await loadPeerJsCode();
  return new Promise((resolve, reject) => {
    const peer = id ? new Peer(id, peerOptions()) : new Peer(peerOptions());
    // Listening from the start, so a ping that comes before anyone answers it isn't kept by PeerJS for good.
    signals(peer);
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
  if (madeUp) {
    for (const r of madeUp.rooms) onRoom(r);
    return;
  }
  const peer = await openPeer();
  const prober = new Prober(peer);
  /** Probes still connecting to slots that answered no ping, finished before the scan is. */
  const connecting: Promise<void>[] = [];
  let listed = 0;
  try {
    for (let start = 1; start <= MAX_SLOTS; start += BATCH) {
      if (cancelled() || listed >= MAX_LISTED) return;
      if (start > FAST_SLOTS) await sleep(SLOW_BATCH_DELAY_MS);
      const ids = Array.from({ length: BATCH }, (_, i) => slotId(start + i));
      let found = 0;
      await Promise.all(
        ids.map(
          (id) =>
            new Promise<void>((next) => {
              // A slot connected to is held: the next batch needn't wait for what it says.
              let held = false;
              const hold = () => {
                if (!held) found++;
                held = true;
                next();
              };
              const probe = prober.probe(id, SCAN_CONNECT_MS, hold).then((r) => {
                if (r && r !== 'free') {
                  hold();
                  if (r !== 'held' && listable(r) && !cancelled() && listed++ < MAX_LISTED) onRoom(r);
                }
                next();
              });
              connecting.push(probe);
            }),
        ),
      );
      // Rooms always take the lowest free slot, so a batch nobody holds means we're past the end.
      if (found === 0) return;
    }
  } finally {
    // Left, or listed all it will: what's still out has nothing to add, and shouldn't connect to anyone.
    if (cancelled() || listed >= MAX_LISTED) prober.stop();
    await Promise.all(connecting);
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
  if (madeUp) return madeUp.invite === undefined ? new Promise(() => {}) : madeUp.invite;
  // A signalling server that never answers (blocked, offline) gives no error
  // for a long while: past this, the room is taken as not answering. The wait
  // starts once PeerJS is loaded, so a slow first download doesn't use it up
  // (one that fails makes openPeer fail at once). A download that stalls is
  // given as long again, so the invite's screen isn't left asking for good.
  await Promise.race([loadPeerJsCode().catch(() => {}), sleep(PROBE_OPEN_TIMEOUT_MS)]);
  const opening = openPeer();
  const peer = await Promise.race([opening.catch(() => null), sleep(PROBE_OPEN_TIMEOUT_MS).then(() => null)]);
  if (!peer) {
    void opening.then((late) => late.destroy(), () => {});
    return null;
  }
  try {
    const r = await new Prober(peer).probe(PEER_PREFIX + code, INVITE_CONNECT_MS);
    // Only this room's own listing: another room's, signed for the held name, passed on by this one, would show it as theirs.
    return r === 'free' ? 'gone' : r === 'held' || (r && r.code !== code) ? null : r;
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
    // A slot is only asked after, never joined: anything else is turned away.
    answerProbes(peer, new ProbeDesk(this.info));
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
      // The lower slots a batch at a time; the lowest one the server says is
      // free is claimed. One that answers neither ping (the second gets the
      // server's word on a free one) is held, and passed over.
      for (let start = 1; start < this.slot && !this.stopped; start += BATCH) {
        // Cut off from the server, every probe would come back as no word at once: next time.
        if (prober.peer.disconnected) return;
        const slots = Array.from({ length: Math.min(BATCH, this.slot - start) }, (_, i) => start + i);
        const results = await Promise.all(slots.map((n) => prober.probe(slotId(n), null)));
        if (prober.peer.disconnected || this.stopped) return;
        for (const [i, r] of results.entries()) {
          if (r !== 'free') continue;
          const peer = await this.tryClaim(slots[i]);
          if (peer === 'taken') continue;
          if (peer) this.adopt(peer, slots[i]);
          return;
        }
      }
    } catch (err) {
      // Runs in the background: try again next time.
      console.warn('compact', err);
    } finally {
      this.compacting = false;
    }
  }
}
