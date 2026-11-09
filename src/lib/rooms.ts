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
// slot, to everyone who asked, once the first of them has waited five seconds
// (and up to one more: it looks once a second), so a scan alone hears "free"
// after five or six seconds and one in company sooner (the PeerJS server's
// code, tests/peerServerFree.test.ts; ours does the same, signal/worker.js).
// A slot silent till then is asked once more. Silent twice, someone holds it
// without answering pings: a room asked too often (past its share,
// probeDesk.ts), or a page from before pings. The list takes it as held, goes
// on past it and hears nothing new of it (what it shows meanwhile:
// lib/roomRefresh.ts), and never connects to it: on a busy evening every list
// would, to every room past its share, several connections a second that a
// host's phone has to set up one by one beside the game it runs. Only an
// invite's screen connects to a room that answers no ping, the one room it's
// about to join.

import type Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import { PEER_PREFIX, alsoOn, chooseServer, loadPeerJsCode, newPeer, pageServer, type Server } from './peer';
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
 * tells everyone who asked after a free id at once, five seconds after the
 * first of them asked (a stretch that starts with the first to ask, not with
 * each), looking once a second: a free slot's word is in by six seconds, and
 * what's silent past this is mostly a room that let the first ping go, which
 * may answer the second. (Against the free server, a second ping 5.5 s after
 * one not told yet was told free in about 20 ms: the first's stretch ending.)
 */
const REPING_MS = 5500;
/** How long the second ping has before the slot is taken as silent: held by someone who answers no ping, as far as the room list goes. */
const LAST_PING_MS = 2000;
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
/** How long an invite's probe still waits on the other server for the room once the page's own says no room has the code (probeRoom). */
const GONE_GRACE_MS = 2500;
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
/** A room's id on the other server (Mirror): tried again this long after a try fails, twice as long each time up to the latest. */
const MIRROR_FIRST_MS = 2000;
const MIRROR_LATEST_MS = 60_000;
/** How long what an invite's probe heard of a room on each server is taken as still so (onlyOn). */
const HEARD_FOR_MS = 120_000;
/** A room looked for on a join's other server (watchForRoom) is pinged again no sooner than this after the last ping, and the server tried again this long after it failed, twice as long each time up to the latest. */
const WATCH_AGAIN_MS = 2000;
const WATCH_LATEST_MS = 16_000;

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
 * (or nothing that made sense); 'silent' when neither ping was answered, by
 * the room or by the server, and it wasn't connected to (someone holds it,
 * most likely); or null for no word at all (cut off from the server, or a
 * connection that came to nothing).
 */
type ProbeResult = RoomInfo | 'free' | 'held' | 'silent' | null;

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

  /**
   * Asks `id` what it is. Not answered by `connectAfter` ms, it's connected to
   * (which shares this browser's IP address with whoever holds it); with
   * null it never is, and one that answers neither ping is 'silent'.
   */
  probe(id: string, connectAfter: number | null): Promise<ProbeResult> {
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
        // (Cut off from the server meanwhile, the silence says nothing of the slot.)
        setTimeout(() => (connectAfter === null ? done(this.peer.disconnected || this.peer.destroyed ? null : 'silent') : connectNow()), connectAfter ?? REPING_MS + LAST_PING_MS),
      ];
      clear = () => [...timers, connTimer].forEach((t) => clearTimeout(t));
      this.waiting.set(id, done);
      this.pings.set(connectionId, { id, answered: told });
      send();
    });
  }

  /** Lets go of the probe of `id` under way, if there is one: it ends with no word, and asks nothing more. */
  drop(id: string) {
    this.waiting.get(id)?.(null);
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

/** A peer on `server` (the page's, chosen first), once it's on it. */
async function openPeer(id?: string, server?: Server): Promise<Peer> {
  const [{ default: Peer }] = await Promise.all([loadPeerJsCode(), chooseServer()]);
  return new Promise((resolve, reject) => {
    const peer = newPeer(Peer, id, server);
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
 * Scans the listing slots by ping alone, calling onRoom for every room found,
 * with the slot it holds. Resolves when the scan is done or `cancelled()`
 * returns true, with the slots that stayed silent: each held by someone who
 * answered neither ping (a room past its share of them, mostly), counted as
 * held, so the scan goes on past it, and never connected to.
 *
 * Fails where the server stopped answering on the way, so that silence isn't
 * read as rooms, nor as their end: cut off from it, or a batch in which no
 * slot said anything and neither did the server of an id nobody holds, asked
 * beside each batch (it says that one's free whenever it answers at all).
 * Asking on then would only send more into a line gone quiet.
 */
export async function scanRooms(onRoom: (room: RoomInfo, slot: number) => void, cancelled: () => boolean): Promise<number[]> {
  if (madeUp) {
    madeUp.rooms.forEach((r, i) => onRoom(r, i + 1));
    return [];
  }
  const peer = await openPeer();
  const prober = new Prober(peer);
  let listed = 0;
  const silent: number[] = [];
  try {
    for (let start = 1; start <= MAX_SLOTS; start += BATCH) {
      if (cancelled() || listed >= MAX_LISTED) break;
      if (start > FAST_SLOTS) await sleep(SLOW_BATCH_DELAY_MS);
      const slots = Array.from({ length: BATCH }, (_, i) => start + i);
      const nobody = `${PEER_PREFIX}nobody-${randomToken(12)}`;
      const ofNobody = prober.probe(nobody, null);
      let held = 0;
      let cutOff = false;
      const quiet: number[] = [];
      await Promise.all(
        slots.map(async (slot) => {
          const r = await prober.probe(slotId(slot), null);
          if (r === null) cutOff = true;
          else if (r === 'silent') quiet.push(slot);
          else if (r !== 'free') {
            held++;
            // Shown as it's found, not once its batch is through.
            if (r !== 'held' && listable(r) && !cancelled() && listed++ < MAX_LISTED) onRoom(r, slot);
          }
        }),
      );
      // The server's word on the id nobody holds is wanted only where no slot said anything.
      const answering = quiet.length < BATCH || (await ofNobody) === 'free';
      prober.drop(nobody);
      if (cutOff || !answering) throw new Error('The signalling server stopped answering');
      silent.push(...quiet);
      // Rooms always take the lowest free slot, so a batch nobody holds means we're past the end.
      if (held + quiet.length === 0) break;
    }
    return silent;
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
 * with its host (as joining it would). Asked on the other server at once too
 * (lib/peer.ts alsoOn), where a room whose host the cloud turns away is: the
 * first to find it answers, and it's gone only as the page's own server says.
 */
export async function probeRoom(code: string): Promise<RoomInfo | 'gone' | null> {
  if (madeUp) return madeUp.invite === undefined ? new Promise(() => {}) : madeUp.invite;
  // A signalling server that never answers (blocked, offline) gives no error
  // for a long while: past this, the room is taken as not answering. The wait
  // starts once PeerJS is loaded, so a slow first download doesn't use it up
  // (one that fails makes openPeer fail at once). A download that stalls is
  // given as long again, so the invite's screen isn't left asking for good.
  // (The page's server chosen first: that look has a while of its own, and ends.)
  await Promise.race([Promise.all([loadPeerJsCode(), chooseServer()]).catch(() => {}), sleep(PROBE_OPEN_TIMEOUT_MS)]);
  const here = probeOn(code, pageServer());
  const also = alsoOn(pageServer());
  if (!also) return here;
  // Pinged alone there, never connected to: the room's id on ours may be held by someone other than its host for a while (its Mirror lost it), who'd learn this browser's address.
  const there = probeOn(code, also, false);
  return new Promise((resolve) => {
    let left = 2;
    let ours: RoomInfo | 'gone' | null = null;
    const heard = (r: RoomInfo | 'gone' | null, page: boolean) => {
      if (r && r !== 'gone') return resolve(r);
      if (page) ours = r;
      if (--left === 0) resolve(ours);
      // The page's server says no room has the code: the other has a moment more (where it's slow to answer, not its whole while).
      else if (page && r === 'gone') setTimeout(() => resolve('gone'), GONE_GRACE_MS);
    };
    void here.then((r) => heard(r, true));
    void there.then((r) => heard(r, false));
  });
}

/** What probeRoom last heard of each room on each server: whether it was there ('gone': the server said it isn't), and when. */
const lately = new Map<string, { at: number } & Partial<Record<Server, boolean>>>();

/** A join found the room on `server`, and not on the other: a join again (another name, a reload) goes there at once (onlyOn). */
export function heardOnlyOn(code: string, server: Server) {
  lately.set(code, { at: Date.now(), [server]: true, [server === 'own' ? 'cloud' : 'own']: false });
}

/** The server an invite's probe found the room on, the other having said it isn't there, lately (HEARD_FOR_MS): where its join goes at once. */
export function onlyOn(code: string): Server | null {
  const h = lately.get(code);
  if (!h || Date.now() - h.at > HEARD_FOR_MS) return null;
  return h.own && h.cloud === false ? 'own' : h.cloud && h.own === false ? 'cloud' : null;
}

/** probeRoom on one server; connecting to a room that answers no ping only if `connect`. */
async function probeOn(code: string, server: Server, connect = true): Promise<RoomInfo | 'gone' | null> {
  const r = await probeOnce(code, server, connect);
  if (r !== null) {
    const h = lately.get(code);
    lately.set(code, { ...(h && Date.now() - h.at < HEARD_FOR_MS ? h : {}), at: Date.now(), [server]: r !== 'gone' });
  }
  return r;
}

async function probeOnce(code: string, server: Server, connect: boolean): Promise<RoomInfo | 'gone' | null> {
  const opening = openPeer(undefined, server);
  const peer = await Promise.race([opening.catch(() => null), sleep(PROBE_OPEN_TIMEOUT_MS).then(() => null)]);
  if (!peer) {
    void opening.then((late) => late.destroy(), () => {});
    return null;
  }
  try {
    const r = await new Prober(peer).probe(PEER_PREFIX + code, connect ? INVITE_CONNECT_MS : null);
    // Only this room's own listing: another room's, signed for the held name, passed on by this one, would show it as theirs.
    return r === 'free' ? 'gone' : r === 'held' || r === 'silent' || (r && r.code !== code) ? null : r;
  } finally {
    peer.destroy();
  }
}

/**
 * Looks for a room by its code on one server (a join's other one, lib/peer.ts
 * alsoOn), by ping alone, again and again until it's there (`found`, once) or
 * the stop it returns is called. Never connects to it: whether the join goes
 * on there is the session's to say.
 */
export function watchForRoom(code: string, server: Server, found: () => void): () => void {
  let stopped = false;
  let peer: Peer | null = null;
  const stop = () => {
    stopped = true;
    peer?.destroy();
    peer = null;
  };
  void (async () => {
    // Troubles with the server in a row: the next try waits longer, to WATCH_LATEST_MS.
    for (let troubles = 0; !stopped; troubles++) {
      const p = await openPeer(undefined, server).catch(() => null);
      if (stopped) return p?.destroy();
      peer = p;
      const prober = p && new Prober(p);
      while (prober && !stopped && !p.disconnected && !p.destroyed) {
        const at = Date.now();
        const r = await prober.probe(PEER_PREFIX + code, null);
        if (stopped) return;
        if (r && r !== 'free' && r !== 'held' && r !== 'silent' && r.code === code) {
          stop();
          return found();
        }
        // The server takes a few seconds to say it's free; no word, or a quicker one, isn't asked after again sooner than this.
        await sleep(at + WATCH_AGAIN_MS - Date.now());
        troubles = 0;
      }
      p?.destroy();
      if (!stopped) await sleep(Math.min(WATCH_LATEST_MS, WATCH_AGAIN_MS * 2 ** troubles));
    }
  })();
  return stop;
}

/**
 * Holds a room's id on the other server too (lib/peer.ts alsoOn), so a guest
 * on either finds it: what reaches it goes to `take`, as what reaches the
 * room's own peer does. Its troubles are its own: the room goes on without
 * it, and it tries again, later each time.
 */
export class Mirror {
  private peer: Peer | null = null;
  /** Peers whose id was lost, kept for the guests they carry until the room closes. */
  private retired: Peer[] = [];
  private stopped = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private tries = 0;

  constructor(
    private id: string,
    private server: Server,
    private take: (peer: Peer) => void,
  ) {}

  start() {
    void this.open();
  }

  /** Lets go of its id; `later`, the peer (and the connections it carries) only after that long, so a goodbye sent through them gets out first. */
  stop(later = 0) {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const peers = [this.peer, ...this.retired.splice(0)];
    this.peer = null;
    const destroy = () => peers.forEach((p) => p?.destroy());
    if (later) setTimeout(destroy, later);
    else destroy();
  }

  private async open() {
    this.timer = null;
    if (this.stopped) return;
    let peer: Peer;
    try {
      peer = await openPeer(this.id, this.server);
    } catch {
      return this.again();
    }
    if (this.stopped) return peer.destroy();
    this.peer = peer;
    this.tries = 0;
    this.take(peer);
    peer.on('open', () => (this.tries = 0));
    peer.on('disconnected', () => {
      if (this.peer === peer && !peer.destroyed) this.timer = setTimeout(() => !peer.destroyed && peer.disconnected && peer.reconnect(), this.wait());
    });
    // Cut off by the server (a server-error), PeerJS lets go of the server alone, and it's reconnected as above.
    peer.on('error', (err) => {
      // Its id lost (held by another while it was off): a fresh try, the guests it carries kept.
      if (this.peer !== peer || err.type !== 'unavailable-id') return;
      this.retired.push(peer);
      this.peer = null;
      this.again();
    });
  }

  private wait() {
    return Math.min(MIRROR_LATEST_MS, MIRROR_FIRST_MS * 2 ** this.tries++);
  }

  private again() {
    if (!this.stopped) this.timer = setTimeout(() => void this.open(), this.wait());
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
  /** Network troubles in a row, on the other server (`other`): each try after the last waits longer. */
  private troubles = 0;

  /** `server`: where it lists the room (lib/peer.ts), the page's unless named; `other`, beside the room's own server, which carries on without it. */
  constructor(
    private info: ListingInfo,
    private server?: Server,
    private other = false,
  ) {}

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
        // Network trouble: try again later from the start. On the other server, later each time (to 5 minutes), so a
        // server down or out of its allowance isn't asked again and again by every room listed on the page's.
        const wait = this.other ? Math.min(300_000, 10_000 * 2 ** this.troubles++) : 10_000;
        setTimeout(() => !this.stopped && !this.peer && void this.claimFrom(1), wait);
        return;
      }
    }
  }

  private async tryClaim(slot: number): Promise<Peer | 'taken' | null> {
    try {
      const peer = await openPeer(slotId(slot), this.server);
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
    this.troubles = 0;
    const old = this.peer;
    this.peer = peer;
    this.prober = new Prober(peer);
    this.slot = slot;
    old?.destroy();
    // A slot is only asked after, never joined: anything else is turned away.
    answerProbes(peer, new ProbeDesk(this.info));
    peer.on('open', () => (this.troubles = 0));
    peer.on('disconnected', () => {
      // On the other server, later each time while it's down (claimFrom).
      const wait = this.other ? Math.min(300_000, 2000 * 2 ** this.troubles++) : 2000;
      if (!peer.destroyed && this.peer === peer) setTimeout(() => !peer.destroyed && peer.reconnect(), wait);
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
