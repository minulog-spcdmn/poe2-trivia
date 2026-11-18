// The game's own matchmaking server: a Cloudflare Worker that speaks the
// PeerJS server's protocol (github.com/peers/peerjs-server), so the game's
// PeerJS meets on it as it did on the free PeerJS cloud (0.peerjs.com). That
// one turns away every player in Russia (it answers 403 there, and nowhere
// else), so none of them could host or join; README, "Matchmaking server".
//
// One Durable Object holds every peer's socket and passes their messages on,
// as the PeerJS server does in one process:
// - A peer connects (`/peerjs?key=peerjs&id=…&token=…`) and is told OPEN, or
//   ID-TAKEN while another holds its id. The same token again takes the id
//   back from the socket it had (a page's reconnect), told OPEN again.
// - An id whose socket was lost (a dropped network, not the page closing it)
//   is kept for its token RESERVE_MS more, so a host's blip doesn't hand its
//   room's id to whoever asks next. A page closing its socket frees it at once.
// - OFFER, ANSWER, CANDIDATE, LEAVE and EXPIRE go to their `dst`, with `src`
//   set to the sender. One for an id nobody holds waits for it (a host
//   reconnecting) and, if it hasn't come within EXPIRE_MS, its sender is told
//   EXPIRE: the room isn't there (PeerJS's peer-unavailable). The open rooms
//   list leans on that (lib/rooms.ts), as on the ping it sends as a CANDIDATE.
//   One that can't wait (too much waits already) is answered EXPIRE at once.
// - A socket silent for ALIVE_MS (the game's peers send a heartbeat every
//   25 s on this server, lib/peer.ts) is dropped. Heartbeats are echoed by
//   Cloudflare without waking the Object, so a page learns its socket has
//   stalled (lib/peer.ts keepFresh).
// - `/peerjs/id` hands a peer made without an id a fresh one.
//
// Only the game's own pages are answered, an address may connect only so
// often (PER_ADDRESS, wrangler.toml) and hold only so many sockets at once
// (MAX_PER_ADDRESS), and a socket may send only so much: no browser elsewhere
// can use it, and a script can't do more than spend the day's free allowance,
// after which the game meets on the PeerJS cloud again (lib/peer.ts). Nothing
// of matchmaking is stored or logged: the peers' ids, addresses and sockets
// live only in the Object's memory.
//
// It also keeps players' progress for them (`/keep/…`, Keep below): what a
// page encrypted, under a name made from the player's passkey, neither of
// which it can read back to anyone. And it adds up how every player's
// answers went, per item and the rules each was asked under (`/tally`,
// Tally below): the sums, and for a day each batch's random id with when
// it came (so a batch sent again is added once); nothing of who answered or
// from where.

import ITEM_IDS from './itemIds.json' with { type: 'json' };

/** How long a message waits for an id nobody holds before its sender is told EXPIRE (ms), and how often that's looked at: the PeerJS server's. */
export const EXPIRE_MS = 5000;
const EXPIRE_EVERY_MS = 1000;
/** A socket silent this long is dropped (ms): the PeerJS server's, which leaves room for a hidden tab's heartbeat, held back to once a minute. */
export const ALIVE_MS = 90_000;
const ALIVE_EVERY_MS = 15_000;
/** How long a lost socket's id is kept for its token (ms): a phone's network coming back, a host's reconnect. */
export const RESERVE_MS = 15_000;
/** Ids kept so at once, past which a lost one is freed as before. */
const MAX_RESERVED = 10_000;
/** Peers at once, as the PeerJS server's limit. */
export const MAX_PEERS = 5000;
/**
 * Sockets one address (rate limit's key: an IPv4 address, an IPv6 /56) holds
 * at once: a player's page holds a handful, and a carrier's shared IPv4
 * address has many phones behind it.
 */
export const MAX_PER_ADDRESS = 64;
/** The longest message passed on: an offer's description is a few kilobytes. */
export const MAX_TEXT = 64 * 1024;
/**
 * Messages a socket's passed on in BURST_MS (a room list's scan sends a few
 * dozen, a host many guests are joining at once a few hundred); past it, the
 * rest are let go, and past MAX_FLOOD (600 in 10 s) it's cut off.
 */
export const MAX_BURST = 300;
export const MAX_FLOOD = 600;
const BURST_MS = 10_000;
/** Messages kept for an id nobody holds, for all of them together, and their characters together (kept as the text to send, not parsed). */
export const MAX_WAITING = 100;
export const MAX_WAITING_ALL = 10_000;
export const MAX_WAITING_CHARS = 4_000_000;
/** The characters one address key (its sockets together) has waiting at once: a room's guests are each an address of their own, and one can't fill what all share. */
export const MAX_WAITING_FROM = 256 * 1024;
/** PeerJS's heartbeat, as its socket sends it: echoed as it is. */
export const HEARTBEAT = '{"type":"HEARTBEAT"}';
/** What PeerJS takes as an id (its util.validateId), and as long as a socket's tag could be. */
const ID = /^[A-Za-z0-9]+(?:[ _-][A-Za-z0-9]+)*$/;
const MAX_ID = 256;
const MAX_TOKEN = 128;
/** What a peer sends on, as the PeerJS server's handlers. */
const PASSED = new Set(['OFFER', 'ANSWER', 'CANDIDATE', 'LEAVE', 'EXPIRE']);
/** What waits for an id nobody holds: not a goodbye. */
const KEPT = new Set(['OFFER', 'ANSWER', 'CANDIDATE']);
/** The header the Worker hands the Object a socket's address key in. */
export const ADDRESS_HEADER = 'X-Signal-Address';
/** Close codes of a page letting its socket go: done (PeerJS's own close, which sends no code, arrives as 1005) or leaving the page. A page swapping its socket for a fresh one (lib/peer.ts keepFresh) closes it with 4000: lost, its id kept for it. */
const LET_GO = new Set([1000, 1001, 1005]);
const LIVE = 'https://poe2.quest';
/** The dev server, on this machine or another on the network (a phone trying a build): the relay's. */
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|[\w-]+\.localhost|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;

/**
 * A socket as the board uses it.
 * @typedef {{ send(text: string): void, close(code?: number, reason?: string): void, serializeAttachment?(value: unknown): void }} Socket
 * A peer on the board: its socket, id, token and address key, when it was last heard, and its recent messages.
 * @typedef {{ ws: Socket, id: string, token: string, address: string, heard: number, since: number, sent: number }} Peer
 * A message as passed on.
 * @typedef {{ type: string, src: string, dst: string, payload?: unknown }} Message
 * A socket on Cloudflare, which keeps what it's given across hibernation.
 * @typedef {Socket & { serializeAttachment(value: unknown): void, deserializeAttachment(): unknown, readyState: number }} CfSocket
 * The Durable Object's state, as far as it's used.
 * @typedef {{ acceptWebSocket(ws: CfSocket): void, getWebSockets(): CfSocket[], setWebSocketAutoResponse?(pair: unknown): void, getWebSocketAutoResponseTimestamp?(ws: CfSocket): Date | null }} State
 * The Worker's bindings (wrangler.toml).
 * @typedef {{
 *   SIGNAL: { idFromName(name: string): unknown, get(id: unknown, o?: { locationHint?: string }): { fetch(r: Request): Promise<Response> } },
 *   KEEP: { idFromName(name: string): unknown, get(id: unknown, o?: { locationHint?: string }): { fetch(r: Request): Promise<Response> } },
 *   TALLY: { idFromName(name: string): unknown, get(id: unknown, o?: { locationHint?: string }): { fetch(r: Request): Promise<Response> } },
 *   PER_ADDRESS: { limit(o: { key: string }): Promise<{ success: boolean }> },
 *   KEEP_WRITES: { limit(o: { key: string }): Promise<{ success: boolean }> },
 *   TALLY_WRITES: { limit(o: { key: string }): Promise<{ success: boolean }> },
 * }} Env
 */

/** @param {Socket} ws @param {string} text */
function say(ws, text) {
  try {
    ws.send(text);
  } catch {
    // (A socket already closing: its close is on its way.)
  }
}

/** @param {Socket} ws @param {object} message */
function tell(ws, message) {
  say(ws, JSON.stringify(message));
}

/**
 * Closes a socket, its attachment cleared first: Cloudflare may still list a
 * socket it's closing when the Object wakes, and would put it back on the board.
 * @param {Socket} ws @param {number} [code] @param {string} [reason]
 */
function hangUp(ws, code = 1000, reason = '') {
  try {
    ws.serializeAttachment?.(null);
    ws.close(code, reason);
  } catch {
    // (Closed already.)
  }
}

/**
 * Tells a socket what's wrong (PeerJS's server-error) and closes it: only one
 * not open yet, as PeerJS destroys a peer told so, and with it the games its
 * connections carry. @param {Socket} ws @param {string} msg
 */
function refuse(ws, msg) {
  tell(ws, { type: 'ERROR', payload: { msg } });
  hangUp(ws, 1008, msg);
}

/**
 * Every peer and what waits for an id nobody holds, apart from Cloudflare's
 * parts so tests can reach it. Each method is told the time.
 */
export class Board {
  /** @type {Map<string, Peer>} */
  peers = new Map();
  /** @type {Map<Socket, Peer>} */
  bySocket = new Map();
  /** Sockets each address key holds. @type {Map<string, number>} */
  perAddress = new Map();
  /** Ids of lost sockets, kept for their token a while. @type {Map<string, { token: string, until: number }>} */
  reserved = new Map();
  /** Messages for an id nobody holds, as the text to send (and whose share it's of), and when the first came (the PeerJS server's queues, expired whole). @type {Map<string, { at: number, messages: { src: string, text: string, from: string }[] }>} */
  waiting = new Map();
  waitingAll = 0;
  waitingChars = 0;
  /** The characters waiting by each address key (a socket's id where it has none). @type {Map<string, number>} */
  waitingFrom = new Map();
  /** When a socket's heartbeat was last echoed, without reaching the board (Signal: Cloudflare's), or 0. @type {(ws: Socket) => number} */
  echoed = () => 0;

  /** When a peer was last heard from: a message, or a heartbeat echoed. @param {Peer} peer */
  lastHeard(peer) {
    return Math.max(peer.heard, this.echoed(peer.ws));
  }

  /**
   * A socket for `id` with `token`, from `address` (its key; none counts no
   * limit). Taken in and told OPEN (with what waited for it), or refused.
   * Whether it was taken in.
   * @param {Socket} ws @param {string} id @param {string} token @param {number} now @param {string} [address]
   */
  join(ws, id, token, now, address = '') {
    const stale = this.peers.get(id);
    // Lost, as the sweep would find it, kept for its page from now (the page may not know yet).
    if (stale && now - this.lastHeard(stale) >= ALIVE_MS) this.lose(stale, now);
    const held = this.peers.get(id);
    const kept = this.reserved.get(id);
    if (kept && kept.until <= now) this.reserved.delete(id);
    const owner = held ? held.token : kept && kept.until > now ? kept.token : null;
    if (owner !== null && owner !== token) {
      tell(ws, { type: 'ID-TAKEN', payload: { msg: 'ID is taken' } });
      hangUp(ws);
      return false;
    }
    if (!held && this.peers.size >= MAX_PEERS) {
      refuse(ws, 'Server has reached its concurrent user limit');
      return false;
    }
    if (address && (this.perAddress.get(address) ?? 0) - (held?.address === address ? 1 : 0) >= MAX_PER_ADDRESS) {
      refuse(ws, 'Too many connections from this address');
      return false;
    }
    if (held) {
      // The same page again (PeerJS's reconnect keeps its token): the id moves to the new socket.
      this.forget(held);
      hangUp(held.ws);
    }
    this.reserved.delete(id);
    this.take(ws, id, token, address, now);
    tell(ws, { type: 'OPEN' });
    const waited = this.waiting.get(id);
    if (waited) {
      this.unqueue(id, waited);
      for (const m of waited.messages) say(ws, m.text);
    }
    return true;
  }

  /**
   * A socket taken back after the Object was evicted or woke from hibernation:
   * on the board again as its attachment says, nothing told.
   * @param {Socket} ws @param {string} id @param {string} token @param {number} now @param {string} [address]
   */
  adopt(ws, id, token, now, address = '') {
    this.take(ws, id, token, address, now);
  }

  /** @param {Socket} ws @param {string} id @param {string} token @param {string} address @param {number} now */
  take(ws, id, token, address, now) {
    /** @type {Peer} */
    const peer = { ws, id, token, address, heard: now, since: now, sent: 0 };
    this.peers.set(id, peer);
    this.bySocket.set(ws, peer);
    if (address) this.perAddress.set(address, (this.perAddress.get(address) ?? 0) + 1);
  }

  /**
   * Off the board, its id freed if it still held it. Whether it was on it
   * (a socket replaced or cut off already isn't). @param {Peer} peer
   */
  forget(peer) {
    if (this.bySocket.get(peer.ws) !== peer) return false;
    this.bySocket.delete(peer.ws);
    if (this.peers.get(peer.id) === peer) this.peers.delete(peer.id);
    if (peer.address) {
      const n = (this.perAddress.get(peer.address) ?? 1) - 1;
      if (n > 0) this.perAddress.set(peer.address, n);
      else this.perAddress.delete(peer.address);
    }
    return true;
  }

  /**
   * Text from a socket: a heartbeat, or a message passed on. Too long, junk,
   * or too many and the socket is cut off.
   * @param {Socket} ws @param {unknown} text @param {number} now
   */
  heard(ws, text, now) {
    const peer = this.bySocket.get(ws);
    if (!peer) return;
    peer.heard = now;
    if (now - peer.since >= BURST_MS) {
      peer.since = now;
      peer.sent = 0;
    }
    if (++peer.sent > MAX_FLOOD) return this.cutOff(peer, 'Too many messages', now);
    if (peer.sent > MAX_BURST) return;
    if (typeof text !== 'string' || text.length > MAX_TEXT) return this.cutOff(peer, 'Message too long', now);
    /** @type {{ type?: unknown, dst?: unknown, payload?: unknown } | null} */
    let m;
    try {
      m = JSON.parse(text);
    } catch {
      return this.cutOff(peer, 'Invalid message', now);
    }
    if (typeof m !== 'object' || m === null || typeof m.type !== 'string') return this.cutOff(peer, 'Invalid message', now);
    if (m.type === 'HEARTBEAT' || !PASSED.has(m.type)) return;
    if (m.type === 'LEAVE' && m.dst == null) return this.drop(peer);
    if (typeof m.dst !== 'string' || !m.dst || m.dst.length > MAX_ID) return;
    this.pass({ type: m.type, src: peer.id, dst: m.dst, payload: m.payload }, now);
  }

  /** @param {Message} m @param {number} now */
  pass(m, now) {
    const text = JSON.stringify(m);
    const to = this.peers.get(m.dst);
    if (to) return say(to.ws, text);
    // Waits for the id to be taken: a host reconnecting. A goodbye to nobody goes nowhere.
    if (!KEPT.has(m.type)) return;
    const w = this.waiting.get(m.dst);
    const sender = this.peers.get(m.src);
    const from = sender?.address || m.src;
    const its = this.waitingFrom.get(from) ?? 0;
    if (this.waitingAll >= MAX_WAITING_ALL || this.waitingChars + text.length > MAX_WAITING_CHARS || its + text.length > MAX_WAITING_FROM || (w && w.messages.length >= MAX_WAITING)) {
      // No room to wait: its sender hears at once what it would after EXPIRE_MS, not nothing.
      if (sender) tell(sender.ws, { type: 'EXPIRE', src: m.dst, dst: m.src });
      return;
    }
    if (w) w.messages.push({ src: m.src, text, from });
    else this.waiting.set(m.dst, { at: now, messages: [{ src: m.src, text, from }] });
    this.waitingAll++;
    this.waitingChars += text.length;
    this.waitingFrom.set(from, its + text.length);
  }

  /** @param {string} dst @param {{ messages: { text: string, from: string }[] }} w */
  unqueue(dst, w) {
    this.waiting.delete(dst);
    this.waitingAll -= w.messages.length;
    for (const m of w.messages) {
      this.waitingChars -= m.text.length;
      const n = (this.waitingFrom.get(m.from) ?? 0) - m.text.length;
      if (n > 0) this.waitingFrom.set(m.from, n);
      else this.waitingFrom.delete(m.from);
    }
  }

  /**
   * A socket that closed or failed: its id is free, unless a newer socket of
   * the same page took it. Let go by the page (`clean`), at once; lost, kept
   * for its token RESERVE_MS.
   * @param {Socket} ws @param {number} now @param {boolean} clean
   */
  left(ws, now, clean) {
    const peer = this.bySocket.get(ws);
    if (!peer) return;
    if (clean) this.drop(peer);
    else this.lose(peer, now);
  }

  /** A peer that let its id go: free at once. @param {Peer} peer */
  drop(peer) {
    this.forget(peer);
    hangUp(peer.ws);
  }

  /** A peer whose socket was lost (at `now`): its id kept for its token RESERVE_MS. @param {Peer} peer @param {number} now @param {number} [code] @param {string} [reason] */
  lose(peer, now, code, reason) {
    const held = this.peers.get(peer.id) === peer;
    if (this.forget(peer) && held && this.reserved.size < MAX_RESERVED) this.reserved.set(peer.id, { token: peer.token, until: now + RESERVE_MS });
    hangUp(peer.ws, code, reason);
  }

  /**
   * Hangs up on a peer that sent what no page does, saying why in the close
   * alone: told it as a server-error, PeerJS would destroy the peer and the
   * games its connections carry. Its id is kept as a lost one's.
   * @param {Peer} peer @param {string} msg @param {number} now
   */
  cutOff(peer, msg, now) {
    this.lose(peer, now, 1008, msg);
  }

  /** What waited EXPIRE_MS for an id nobody took: each sender told once, the rest let go. @param {number} now */
  expire(now) {
    for (const [dst, w] of this.waiting) {
      if (now - w.at < EXPIRE_MS) continue;
      this.unqueue(dst, w);
      const told = new Set();
      for (const m of w.messages) {
        if (told.has(m.src)) continue;
        told.add(m.src);
        const from = this.peers.get(m.src);
        if (from) tell(from.ws, { type: 'EXPIRE', src: dst, dst: m.src });
      }
    }
  }

  /** Drops the sockets silent for ALIVE_MS (lost, so their ids are kept a while from now), and the kept ids whose while is up. @param {number} now */
  sweep(now) {
    for (const peer of [...this.peers.values()]) if (now - this.lastHeard(peer) >= ALIVE_MS) this.lose(peer, now);
    for (const [id, kept] of this.reserved) if (kept.until <= now) this.reserved.delete(id);
  }
}

/**
 * The Durable Object every peer meets in. Its sockets go through Cloudflare's
 * hibernation API: each keeps its id, token and address key as its
 * attachment, so the board is put back together if the Object is moved or
 * wakes. The checks run on timers only while there's something to check, so
 * it can rest when nobody is connected.
 */
export class Signal {
  /** @param {State} ctx */
  constructor(ctx) {
    this.ctx = ctx;
    this.board = new Board();
    // Heartbeats echoed by Cloudflare, the Object left asleep, and heard as when they last were.
    const Pair = /** @type {{ WebSocketRequestResponsePair?: new (request: string, response: string) => unknown }} */ (/** @type {unknown} */ (globalThis)).WebSocketRequestResponsePair;
    if (Pair && ctx.setWebSocketAutoResponse) ctx.setWebSocketAutoResponse(new Pair(HEARTBEAT, HEARTBEAT));
    this.board.echoed = (ws) => ctx.getWebSocketAutoResponseTimestamp?.(/** @type {CfSocket} */ (ws))?.getTime() ?? 0;
    /** @type {ReturnType<typeof setTimeout> | null} */
    this.expiring = null;
    /** @type {ReturnType<typeof setTimeout> | null} */
    this.sweeping = null;
    const now = Date.now();
    for (const ws of ctx.getWebSockets()) {
      // Not one closing or closed: the board may have hung up on it, and it's still listed while it closes.
      if (ws.readyState === 2 || ws.readyState === 3) continue;
      const a = /** @type {{ id?: string, token?: string, address?: string } | null} */ (ws.deserializeAttachment());
      if (a?.id && a.token) this.board.adopt(ws, a.id, a.token, now, a.address ?? '');
    }
    this.arm();
  }

  /** @param {Request} request */
  async fetch(request) {
    const q = new URL(request.url).searchParams;
    const WebSocketPair = /** @type {{ WebSocketPair: new () => Record<0 | 1, CfSocket> }} */ (/** @type {unknown} */ (globalThis)).WebSocketPair;
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    const id = q.get('id') ?? '';
    const token = q.get('token') ?? '';
    // Set by the Worker, the only way here (answer()).
    const address = request.headers.get(ADDRESS_HEADER) ?? '';
    if (this.board.join(server, id, token, Date.now(), address)) server.serializeAttachment({ id, token, address });
    this.arm();
    return new Response(null, /** @type {ResponseInit} */ ({ status: 101, webSocket: client }));
  }

  /** @param {CfSocket} ws @param {string | ArrayBuffer} message */
  webSocketMessage(ws, message) {
    this.board.heard(ws, message, Date.now());
    this.arm();
  }

  /** @param {CfSocket} ws @param {number} code */
  webSocketClose(ws, code) {
    // By the code alone: what the page sent as it let go (a network lost sends none, 1006).
    this.board.left(ws, Date.now(), LET_GO.has(code));
    hangUp(ws);
    this.arm();
  }

  /** @param {CfSocket} ws */
  webSocketError(ws) {
    this.board.left(ws, Date.now(), false);
    this.arm();
  }

  /** The checks' timers, while each has something to look at. */
  arm() {
    if (!this.expiring && this.board.waiting.size)
      this.expiring = setTimeout(() => {
        this.expiring = null;
        this.board.expire(Date.now());
        this.arm();
      }, EXPIRE_EVERY_MS);
    if (!this.sweeping && (this.board.peers.size || this.board.reserved.size))
      this.sweeping = setTimeout(() => {
        this.sweeping = null;
        this.board.sweep(Date.now());
        this.arm();
      }, ALIVE_EVERY_MS);
  }
}

/**
 * Whom the rate limit and the sockets per address count as one: an IPv4
 * address, or an IPv6 one's /56 (what a home or a phone is often given whole,
 * so a /64 each would let one count as 256).
 * @param {string} ip
 */
export function addressKey(ip) {
  if (!ip.includes(':')) return ip;
  const [head, tail = ''] = ip.toLowerCase().split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const full = ip.includes('::') ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right] : left;
  const groups = full.slice(0, 4).map((g) => parseInt(g, 16) || 0);
  groups[3] &= 0xff00;
  return groups.map((g) => g.toString(16)).join(':') + '::/56';
}

// ---- keeping progress ---------------------------------------------------------
//
// A player's progress kept with their passkey (src/lib/backup/; README,
// "Keeping progress"). Each of their devices puts its own progress here,
// encrypted in the page, under a bucket: a name made from the passkey's
// secret, as the key is. Bringing it back takes every device's. Nobody can
// read it here or find whose it is: there's no account, address or name with
// it, only the bucket's name, the device's (random, the sync's), what it
// can't read, and when it came. One Object per bucket, so a bucket is only
// ever as busy as one player.
//
// Anyone may write to a bucket of their naming, so writes are held to fewer
// an address than matchmaking (KEEP_WRITES, wrangler.toml, on top of
// PER_ADDRESS): a page sends at most every few minutes, and a script filling
// the free plan's storage with made-up buckets would take days from one.
//
// - GET /keep/<bucket>: every device's, as frames (`pack`).
// - POST /keep/<bucket>/<device>: that device's, in place of what it had; an
//   empty body takes it out. Sent as text/plain, so a page's request needs no
//   preflight.
// - POST /keep/<bucket>/forget: the whole bucket deleted.
// A bucket nobody has written to for KEEP_MS is deleted (its alarm).

/** A bucket's name: 32 bytes of the page's making, in base64url. */
const BUCKET = /^[A-Za-z0-9_-]{43}$/;
/** A device's name, as sync makes it (src/lib/sync/store.ts deviceId). */
const DEVICE = /^[0-9a-z]{12}$/;
/** The most one device's entry may be: a full codex is a few hundred kilobytes, and gzipped much less. */
export const MAX_ENTRY = 512 * 1024;
/** The most entries a bucket keeps: past it, the one written longest ago goes. A browser whose data was cleared comes back as a new device. */
export const MAX_ENTRIES = 64;
/** How long a bucket nobody writes to is kept (ms): about eighteen months. */
export const KEEP_MS = 548 * 24 * 3600_000;

/**
 * A bucket's entries as one body: for each, the device's name (12 bytes), the
 * length of what it put (4, big-endian) and that.
 * @param {{ device: string, data: Uint8Array }[]} entries
 */
export function pack(entries) {
  const out = new Uint8Array(entries.reduce((n, e) => n + 16 + e.data.length, 0));
  const view = new DataView(out.buffer);
  let at = 0;
  for (const e of entries) {
    out.set(new TextEncoder().encode(e.device), at);
    view.setUint32(at + 12, e.data.length);
    out.set(e.data, at + 16);
    at += 16 + e.data.length;
  }
  return out;
}

/**
 * The SQL a Durable Object's storage runs, as far as Keep uses it.
 * @typedef {{ exec(query: string, ...bindings: unknown[]): { toArray(): Record<string, unknown>[] } }} Sql
 * @typedef {{ storage: { sql: Sql, setAlarm(at: number): Promise<void> | void, deleteAlarm(): Promise<void> | void, deleteAll(): Promise<void> | void } }} KeepState
 */

/** One bucket's entries. */
export class Keep {
  /** @param {KeepState} ctx */
  constructor(ctx) {
    this.ctx = ctx;
  }

  /** The table, made again after the bucket was deleted (deleteAll takes it too). */
  table() {
    this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS entries (device TEXT PRIMARY KEY, at INTEGER NOT NULL, data BLOB NOT NULL)');
  }

  /** @param {Request} request */
  async fetch(request) {
    const device = new URL(request.url).pathname.split('/')[3];
    if (request.method === 'GET') return new Response(this.read(), { headers: { 'Content-Type': 'application/octet-stream' } });
    if (device === 'forget') {
      await this.ctx.storage.deleteAlarm();
      await this.ctx.storage.deleteAll();
      return new Response(null, { status: 204 });
    }
    const data = await upTo(request.body, MAX_ENTRY);
    if (!data) return new Response(null, { status: 413 });
    await this.write(device, data, Date.now());
    return new Response(null, { status: 204 });
  }

  read() {
    // A bucket nobody wrote to stays without storage (it would have no alarm to delete it).
    if (!this.ctx.storage.sql.exec("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'entries'").toArray().length) return pack([]);
    const rows = this.ctx.storage.sql.exec('SELECT device, data FROM entries ORDER BY at').toArray();
    return pack(rows.map((r) => ({ device: String(r.device), data: new Uint8Array(/** @type {ArrayBuffer} */ (r.data)) })));
  }

  /** `device`'s entry from now on (none, for an empty one). @param {string} device @param {Uint8Array} data @param {number} now */
  async write(device, data, now) {
    this.table();
    const sql = this.ctx.storage.sql;
    if (!data.length) sql.exec('DELETE FROM entries WHERE device = ?', device);
    else {
      sql.exec('INSERT INTO entries (device, at, data) VALUES (?, ?, ?) ON CONFLICT(device) DO UPDATE SET at = excluded.at, data = excluded.data', device, now, data);
      sql.exec('DELETE FROM entries WHERE device NOT IN (SELECT device FROM entries ORDER BY at DESC LIMIT ?)', MAX_ENTRIES);
    }
    await this.ctx.storage.setAlarm(now + KEEP_MS);
  }

  /** Nobody has written for KEEP_MS: the bucket goes. */
  async alarm() {
    await this.ctx.storage.deleteAll();
  }
}

/**
 * A body read as it comes, or null once it's more than `max` bytes (one sent
 * without a length is counted, not read whole first).
 * @param {ReadableStream<Uint8Array> | null} body @param {number} max
 */
export async function upTo(body, max) {
  /** @type {Uint8Array[]} */
  const parts = [];
  let n = 0;
  if (body)
    for (const reader = body.getReader(); ; ) {
      const { done, value } = await reader.read();
      if (done) break;
      n += value.length;
      if (n > max) {
        await reader.cancel();
        return null;
      }
      parts.push(value);
    }
  const out = new Uint8Array(n);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/**
 * A request for a bucket, passed to its Object; null for any other path.
 * @param {Request} request @param {URL} url @param {Env} env @param {Record<string, string>} headers
 */
async function keep(request, url, env, headers) {
  const [, root, bucket, device, more] = url.pathname.split('/');
  if (root !== 'keep' || more !== undefined || !BUCKET.test(bucket ?? '')) return null;
  const read = request.method === 'GET' && device === undefined;
  const write = request.method === 'POST' && (device === 'forget' || DEVICE.test(device ?? ''));
  if (!read && !write) return new Response(null, { status: 404, headers });
  if (write && Number(request.headers.get('Content-Length') ?? 0) > MAX_ENTRY) return new Response(null, { status: 413, headers });
  const key = addressKey(request.headers.get('CF-Connecting-IP') ?? '');
  for (const limit of write ? [env.PER_ADDRESS, env.KEEP_WRITES] : [env.PER_ADDRESS])
    if (!(await limit.limit({ key })).success) return new Response(null, { status: 429, headers: { ...headers, 'Retry-After': '60' } });
  const r = await env.KEEP.get(env.KEEP.idFromName(bucket), { locationHint: 'weur' }).fetch(request);
  return new Response(r.body, { status: r.status, headers: { ...headers, ...(r.status === 200 ? { 'Content-Type': 'application/octet-stream' } : {}) } });
}

// ---- the item tally ------------------------------------------------------------
//
// How every player's answers went, per item (src/lib/itemTally.ts), so the
// items players miss can be told from those they know, each against others
// asked under the same rules. A page sends its answers in batches, each an
// item, the question's form, the rules it was asked under (its context:
// Delve alone or together by the band of ten depths its question came from,
// Take turns and Race by the room's difficulty, practice, today's unique),
// whether the item was new to the player, and right or wrong; here they're
// only added up. Nothing of who sent them is kept: no address or device;
// only the sums, and for a day each batch's random id with when it came, in
// one Object.
//
// - POST /tally: `{"v":1,"id":"9f2c04e1b7a3d865","a":[["4f588a87bc12","n","d3",0,"w"], …]}`
//   (as text/plain, so a page's request needs no preflight), added up.
//   Anything off in its shape refuses it whole. `v` is a version of the
//   tally's rules this Worker knows (TALLY_VERSION), so sums are kept only
//   under one the ranking reads. An answer for an item the game doesn't
//   have (itemIds.json, written with items.json by scripts/fetch-data.mjs;
//   from a page loaded before an item was renamed or removed) is dropped
//   alone, the rest of its batch kept, so sums are only of real items.
//   `id` is the batch's own, random, kept a day (TALLY_SEEN_MS): a page
//   sends a batch it heard nothing back for again, as it was, and one that
//   had arrived after all is added once. Held to fewer an address than
//   matchmaking (TALLY_WRITES, wrangler.toml), asked first, so a batch
//   turned away leaves the address's matchmaking allowance as it was.
// - GET /tally: every sum, as JSON (scripts/item-tally.mjs and the stats
//   page's Items view read them).
//
// The free plan's SQLite rows and Durable Object requests are the account's,
// a day's, which the matchmaking (Signal) and the passkey backups (Keep)
// need too; so the tally keeps to a share of each, leaving them the rest,
// counted in its storage, where an Object started afresh finds them:
// - Sums: past TALLY_ROWS a new one is dropped, those kept still added to.
// - Writes: TALLY_HOURLY rows a UTC hour, an hour's share of the day's, not
//   the day's at once, the batch ids kept and let go of counted with the
//   sums. Past them a batch is answered as taken and dropped (a page doesn't
//   send it again), and the Worker, told so, answers the rest of the hour's
//   batches itself, the Object left asleep.
// - Reads: the Object reads its rows only for a GET, then keeps them and
//   their JSON in memory, a write bringing them up to date, so a read
//   answered from memory reads nothing. Its full reads keep to TALLY_READS
//   rows a UTC day: past them a GET it can't answer from memory is answered
//   503, and it can be read again after midnight UTC.

/** The longest batch (bytes) and the most answers in it: a page sends forty at most. */
export const MAX_TALLY = 4096;
export const MAX_TALLIED = 40;
/** The most sums kept: items, forms, contexts and firsts under each version (about 100,000 today, more with each patch's items). */
export const TALLY_ROWS = 200_000;
/** The most rows the tally writes a UTC hour: about 20,000 a day, a fifth of the 100,000 the free plan gives the account. */
export const TALLY_HOURLY = 850;
/** The version of the tally's rules the pages send now (src/lib/itemTallyRank.ts TALLY_VERSION, held equal by tests/itemTally.test.ts): none past it is taken. */
export const TALLY_VERSION = 1;
/** Every item the tally keeps sums for. */
const KNOWN_ITEMS = new Set(ITEM_IDS);
/** A batch's id, as a page makes it: 16 hex characters from crypto.getRandomValues. */
const BATCH_ID = /^[0-9a-f]{16}$/;
/** How long a batch's id is kept (ms): a page sends a batch again only with its next send, as a rule well within a day. */
export const TALLY_SEEN_MS = 86_400_000;
/** The most ids past TALLY_SEEN_MS let go of with each batch: more than the one it brings, so they never pile up, and few, so a batch's writes stay bounded. */
export const TALLY_PRUNE = 2;
/** The most rows one batch writes: its sums, the counts' own row, its id and the ids let go of, each of those two rows (the id's own and its index's). */
export const TALLY_BATCH_ROWS = MAX_TALLIED + 1 + 2 * (1 + TALLY_PRUNE);
/** The most rows the tally's full reads go through a UTC day: a fifth of the 5 million the free plan gives the account. */
export const TALLY_READS = 1_000_000;
/** The header on the Object's answer to a batch once the hour's writes are spent: when the hour ends (ms). The Worker's alone; a page never sees it. */
export const TALLY_SPENT = 'Tally-Spent';
/** An item's id, as items.json has them. */
const ITEM = /^[0-9a-f]{12}$/;
/** Delve's bands of ten depths (src/lib/itemTally.ts BANDS). */
const BANDS = 20;
const PRESETS = ['cruel', 'merciless', 'eternal', 'custom'];
/** Every context an answer may be tallied under, as src/lib/itemTally.ts CONTEXTS has them: fifty. */
export const TALLY_CONTEXTS = new Set([
  ...['d', 'g'].flatMap((p) => Array.from({ length: BANDS }, (_, i) => `${p}${i + 1}`)),
  ...['t', 'r'].flatMap((p) => PRESETS.map((x) => `${p}-${x}`)),
  'practice',
  'daily',
]);
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/**
 * One answer: item, form ("n" name, "a" art), context (TALLY_CONTEXTS), first (0, 1), outcome ("r", "w").
 * @typedef {[string, 'n' | 'a', string, 0 | 1, 'r' | 'w']} Tallied
 */

/**
 * A batch as sent, or null when anything in its shape is off; its answers
 * for items the game doesn't have left out (none left: `a` empty).
 * @param {Uint8Array} body @returns {{ v: number, id: string, a: Tallied[] } | null}
 */
export function tallied(body) {
  /** @type {unknown} */
  let m;
  try {
    m = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
  } catch {
    return null;
  }
  if (typeof m !== 'object' || m === null || Array.isArray(m) || Object.keys(m).length !== 3) return null;
  const { v, id, a } = /** @type {{ v?: unknown, id?: unknown, a?: unknown }} */ (m);
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > TALLY_VERSION) return null;
  if (typeof id !== 'string' || !BATCH_ID.test(id)) return null;
  if (!Array.isArray(a) || a.length < 1 || a.length > MAX_TALLIED) return null;
  for (const x of a)
    if (
      !Array.isArray(x) ||
      x.length !== 5 ||
      typeof x[0] !== 'string' ||
      !ITEM.test(x[0]) ||
      (x[1] !== 'n' && x[1] !== 'a') ||
      typeof x[2] !== 'string' ||
      !TALLY_CONTEXTS.has(x[2]) ||
      (x[3] !== 0 && x[3] !== 1) ||
      (x[4] !== 'r' && x[4] !== 'w')
    )
      return null;
  return { v, id, a: /** @type {Tallied[]} */ (a).filter((x) => KNOWN_ITEMS.has(x[0])) };
}

/**
 * The SQL storage as Tally uses it: a cursor gives its rows one at a time
 * or all at once, and says how many rows it read and wrote, as they're
 * billed, where the runtime does (all it read once it has given every row).
 * @typedef {Iterable<Record<string, unknown>> & { toArray(): Record<string, unknown>[], rowsRead?: number, rowsWritten?: number }} TallyCursor
 * @typedef {{ exec(query: string, ...bindings: unknown[]): TallyCursor }} TallySql
 * @typedef {{ storage: { sql: TallySql, transactionSync?<T>(f: () => T): T } }} TallyState
 * What Tally keeps count of: its sums, the rows written in the UTC hour `hour` and those its full reads went through on the UTC day `day`.
 * @typedef {{ rows: number, hour: number, written: number, day: number, scanned: number }} TallyKept
 */

/**
 * A sum's key in memory, in the order the table keeps them (the version padded, so the keys sort as the rows do).
 * @param {number} v @param {string} item @param {string} form @param {string} ctx @param {number} first
 */
const sumKey = (v, item, form, ctx, first) => `${String(v).padStart(4, '0')} ${item} ${form} ${ctx} ${first}`;

/**
 * A sum as a read sends it.
 * @param {number} v @param {string} item @param {string} form @param {string} ctx @param {number} first @param {number} r @param {number} w
 */
const rowJson = (v, item, form, ctx, first, r, w) =>
  `{"v":${v},"item":${JSON.stringify(item)},"form":${JSON.stringify(form)},"ctx":${JSON.stringify(ctx)},"first":${first},"r":${r},"w":${w}}`;

/** A sum in memory as a read sends it. @param {string} key @param {[number, number]} rw */
function sumJson(key, [r, w]) {
  const [v, item, form, ctx, first] = key.split(' ');
  return rowJson(Number(v), item, form, ctx, Number(first), r, w);
}

/** Whether no more batches go in this hour: one more might not fit in what's left of its writes. @param {TallyKept} k */
const spent = (k) => k.written + TALLY_BATCH_ROWS > TALLY_HOURLY;

/** Every player's answers added up, per version, item, form, context and first. */
export class Tally {
  /** @param {TallyState} ctx */
  constructor(ctx) {
    this.ctx = ctx;
    // Keyed by the sum itself (no rowid beside it), so a sum written is one row written.
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS tally (v INTEGER NOT NULL, item TEXT NOT NULL, form TEXT NOT NULL, ctx TEXT NOT NULL, first INTEGER NOT NULL, r INTEGER NOT NULL DEFAULT 0, w INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (v, item, form, ctx, first)) WITHOUT ROWID',
    );
    // What it keeps count of (TallyKept), in one row.
    ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS kept (id INTEGER PRIMARY KEY CHECK (id = 1), rows INTEGER NOT NULL, hour INTEGER NOT NULL, written INTEGER NOT NULL, day INTEGER NOT NULL, scanned INTEGER NOT NULL)',
    );
    // The ids of the batches added up in the last TALLY_SEEN_MS, with when each came (ms): indexed by that, so letting go of the oldest reads only them.
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS seen (id TEXT PRIMARY KEY, at INTEGER NOT NULL) WITHOUT ROWID');
    ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS seen_at ON seen (at)');
    /** Every sum, right and wrong by its key (sumKey), once a read has loaded them; null until then. @type {Map<string, [number, number]> | null} */
    this.sums = null;
    /** Whether `sums` is in the table's order (a sum started goes at its end). */
    this.sorted = true;
    /** The sums as a read sends them, until a write changes one. @type {string | null} */
    this.json = null;
  }

  /** @param {Request} request */
  async fetch(request) {
    if (request.method === 'GET') {
      const json = this.read();
      return json === null ? new Response(null, { status: 503 }) : new Response(json, { headers: { 'Content-Type': 'application/json' } });
    }
    const batch = tallied(new Uint8Array(await request.arrayBuffer()));
    if (!batch) return new Response(null, { status: 400 });
    if (!batch.a.length) return new Response(null, { status: 204 });
    const now = Date.now();
    const { spent } = this.add(batch.v, batch.a, now, batch.id);
    // (Past the hour's writes too: the page has nothing to send again. The Worker hears when the hour ends.)
    return new Response(null, { status: 204, headers: spent ? { [TALLY_SPENT]: String((Math.floor(now / HOUR_MS) + 1) * HOUR_MS) } : {} });
  }

  /** What's kept count of, as stored (nought before anything is). @returns {TallyKept} */
  kept() {
    const k = this.ctx.storage.sql.exec('SELECT rows, hour, written, day, scanned FROM kept WHERE id = 1').toArray()[0];
    if (!k) return { rows: 0, hour: 0, written: 0, day: 0, scanned: 0 };
    return { rows: Number(k.rows), hour: Number(k.hour), written: Number(k.written), day: Number(k.day), scanned: Number(k.scanned) };
  }

  /** What's kept count of at `now`: the hour's writes and the day's reads begun afresh as each starts. @param {number} now */
  keptAt(now) {
    const k = this.kept();
    const hour = Math.floor(now / HOUR_MS);
    const day = Math.floor(now / DAY_MS);
    if (k.hour !== hour) [k.hour, k.written] = [hour, 0];
    if (k.day !== day) [k.day, k.scanned] = [day, 0];
    return k;
  }

  /** The counts stored, their own row counted with the writes. @param {TallyKept} k */
  store(k) {
    k.written++;
    this.ctx.storage.sql.exec(
      'INSERT INTO kept (id, rows, hour, written, day, scanned) VALUES (1, ?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET rows = excluded.rows, hour = excluded.hour, written = excluded.written, day = excluded.day, scanned = excluded.scanned',
      k.rows,
      k.hour,
      k.written,
      k.day,
      k.scanned,
    );
  }

  /**
   * Every sum, as JSON: from memory once loaded, else read through whole
   * and kept, unless that would take the UTC day of `now` past TALLY_READS
   * rows read: then null.
   * @param {number} [now]
   */
  read(now = Date.now()) {
    if (this.json !== null) return this.json;
    if (!this.sums) {
      const k = this.keptAt(now);
      if (k.scanned + k.rows > TALLY_READS) return null;
      // Row by row into memory and the JSON at once, in the table's order: no more than the sums and their text held together.
      const c = this.ctx.storage.sql.exec('SELECT v, item, form, ctx, first, r, w FROM tally ORDER BY v, item, form, ctx, first');
      /** @type {Map<string, [number, number]>} */
      const sums = new Map();
      let json = '[';
      let n = 0;
      for (const x of c) {
        const [v, item, form, ctx, first, r, w] = [Number(x.v), String(x.item), String(x.form), String(x.ctx), Number(x.first), Number(x.r), Number(x.w)];
        sums.set(sumKey(v, item, form, ctx, first), [r, w]);
        json += `${n++ ? ',' : ''}${rowJson(v, item, form, ctx, first, r, w)}`;
      }
      // (The cursor's count is whole once every row is given.)
      k.scanned += c.rowsRead ?? n;
      // (Its own row written whatever the hour's writes: every read through is counted.)
      this.store(k);
      this.sums = sums;
      this.sorted = true;
      this.json = `${json}]`;
      return this.json;
    }
    // A sum started since went at the end: put in the table's order, once.
    if (!this.sorted) {
      const sums = this.sums;
      this.sums = new Map([...sums.keys()].sort().map((key) => [key, /** @type {[number, number]} */ (sums.get(key))]));
      this.sorted = true;
    }
    let json = '[';
    let n = 0;
    for (const [key, rw] of this.sums) json += `${n++ ? ',' : ''}${sumJson(key, rw)}`;
    this.json = `${json}]`;
    return this.json;
  }

  /**
   * A batch's answers added to their sums, each sum written once however
   * often it comes in the batch, in the UTC hour of `now`; one past
   * TALLY_ROWS starts none, and once the hour's writes are spent (`spent`)
   * nothing is written. With the batch's `id`, one whose id came in the
   * last TALLY_SEEN_MS adds nothing; otherwise its id is kept with the sums,
   * in the same transaction, and the oldest past TALLY_SEEN_MS let go of
   * (TALLY_PRUNE at most). Whether it was added, and whether the hour's
   * writes are spent.
   * @param {number} v @param {Tallied[]} answers @param {number} [now] @param {string} [id]
   */
  add(v, answers, now = Date.now(), id) {
    const sql = this.ctx.storage.sql;
    const k = this.keptAt(now);
    if (spent(k)) return { added: false, spent: true };
    /** @type {Map<string, { key: [number, string, string, string, number], r: number, w: number }>} */
    const sums = new Map();
    for (const [item, form, ctx, first, outcome] of answers) {
      const name = sumKey(v, item, form, ctx, first);
      const s = sums.get(name) ?? { key: /** @type {[number, string, string, string, number]} */ ([v, item, form, ctx, first]), r: 0, w: 0 };
      s[outcome]++;
      sums.set(name, s);
    }
    /** Each sum written, as it now stands. @type {[string, [number, number]][]} */
    const done = [];
    /** Whether the batch is new, and so written. */
    const write = () => {
      if (id !== undefined) {
        if (sql.exec('SELECT 1 FROM seen WHERE id = ?', id).toArray().length) return false;
        k.written += sql.exec('INSERT INTO seen (id, at) VALUES (?, ?)', id, now).rowsWritten ?? 1;
        k.written += sql.exec('DELETE FROM seen WHERE id IN (SELECT id FROM seen WHERE at < ? ORDER BY at LIMIT ?)', now - TALLY_SEEN_MS, TALLY_PRUNE).rowsWritten ?? 0;
      }
      for (const [name, { key, r, w }] of sums) {
        // Under TALLY_ROWS a sum is added to or started; past it only added to.
        const open = k.rows < TALLY_ROWS;
        const c = open
          ? sql.exec(
              'INSERT INTO tally (v, item, form, ctx, first, r, w) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (v, item, form, ctx, first) DO UPDATE SET r = r + excluded.r, w = w + excluded.w RETURNING r, w',
              ...key,
              r,
              w,
            )
          : sql.exec('UPDATE tally SET r = r + ?, w = w + ? WHERE v = ? AND item = ? AND form = ? AND ctx = ? AND first = ? RETURNING r, w', r, w, ...key);
        const got = c.toArray()[0];
        k.written += c.rowsWritten ?? (got ? 1 : 0);
        if (!got) continue;
        /** @type {[number, number]} */
        const sum = [Number(got.r), Number(got.w)];
        // A sum started holds this batch's answers alone; one added to held some already (none is kept at nought).
        if (open && sum[0] === r && sum[1] === w) k.rows++;
        done.push([name, sum]);
      }
      this.store(k);
      return true;
    };
    const added = this.ctx.storage.transactionSync ? this.ctx.storage.transactionSync(write) : write();
    if (!added) return { added: false, spent: spent(k) };
    // Memory brought up to date once the writes are in (one that failed leaves it as it was).
    if (this.sums && done.length) {
      for (const [name, sum] of done) {
        if (!this.sums.has(name)) this.sorted = false;
        this.sums.set(name, sum);
      }
      this.json = null;
    }
    return { added: true, spent: spent(k) };
  }
}

/** Until when (ms) the tally's writes are spent, as its Object last said: this isolate's, to the end of that UTC hour. */
let tallySpentUntil = 0;

/**
 * A request for the tally, passed to its Object; null for any other path.
 * @param {Request} request @param {URL} url @param {Env} env @param {Record<string, string>} headers
 */
async function tally(request, url, env, headers) {
  if (url.pathname !== '/tally') return null;
  const write = request.method === 'POST';
  if (!write && request.method !== 'GET') return new Response(null, { status: 404, headers });
  if (write && Number(request.headers.get('Content-Length') ?? 0) > MAX_TALLY) return new Response(null, { status: 413, headers });
  // The hour's writes spent: taken and dropped here, as the Object would, without waking it or spending a limit.
  if (write && Date.now() < tallySpentUntil) return new Response(null, { status: 204, headers });
  const key = addressKey(request.headers.get('CF-Connecting-IP') ?? '');
  // The tally's own limit first: a batch it turns away leaves the address's matchmaking allowance alone.
  for (const limit of write ? [env.TALLY_WRITES, env.PER_ADDRESS] : [env.PER_ADDRESS])
    if (!(await limit.limit({ key })).success) return new Response(null, { status: 429, headers: { ...headers, 'Retry-After': '60' } });
  // Western Europe, as the matchmaking's.
  const store = env.TALLY.get(env.TALLY.idFromName('all'), { locationHint: 'weur' });
  if (!write) {
    const r = await store.fetch(new Request(request.url));
    return new Response(r.body, { status: r.status, headers: { ...headers, ...(r.status === 200 ? { 'Content-Type': 'application/json' } : {}) } });
  }
  const body = await upTo(request.body, MAX_TALLY);
  if (!body) return new Response(null, { status: 413, headers });
  const batch = tallied(body);
  if (!batch) return new Response(null, { status: 400, headers });
  // Nothing left once the answers for items the game doesn't have are dropped: taken, the Object left asleep.
  if (!batch.a.length) return new Response(null, { status: 204, headers });
  // Only what was checked goes on, as checked: nothing else of the request.
  const r = await store.fetch(new Request(request.url, { method: 'POST', body: JSON.stringify(batch) }));
  const until = Number(r.headers.get(TALLY_SPENT) ?? 0);
  if (until > tallySpentUntil) tallySpentUntil = until;
  return new Response(null, { status: r.status, headers });
}

/** @param {Request} request @param {Env} env */
export async function answer(request, env) {
  const origin = request.headers.get('Origin') ?? '';
  if (origin !== LIVE && !LOCAL.test(origin)) return new Response(null, { status: 403 });
  const headers = { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Cache-Control': 'no-store' };
  const url = new URL(request.url);
  const kept = (await keep(request, url, env, headers)) ?? (await tally(request, url, env, headers));
  if (kept) return kept;
  const socket = url.pathname === '/peerjs' && request.headers.get('Upgrade')?.toLowerCase() === 'websocket';
  const newId = url.pathname === '/peerjs/id' && request.method === 'GET';
  if (!socket && !newId) return new Response(null, { status: 404, headers });
  const key = addressKey(request.headers.get('CF-Connecting-IP') ?? '');
  const { success } = await env.PER_ADDRESS.limit({ key });
  if (!success) return new Response(null, { status: 429, headers: { ...headers, 'Retry-After': '60' } });
  if (newId) return new Response(crypto.randomUUID(), { headers: { ...headers, 'Content-Type': 'text/plain' } });
  const id = url.searchParams.get('id') ?? '';
  const token = url.searchParams.get('token') ?? '';
  if (url.searchParams.get('key') !== 'peerjs' || id.length > MAX_ID || !ID.test(id) || !token || token.length > MAX_TOKEN) return new Response(null, { status: 400, headers });
  // The address key for the Object, over any the page sent under that name.
  const forward = new Headers(request.headers);
  forward.set(ADDRESS_HEADER, key);
  // Western Europe: in the middle of the players, most of them in Europe, Russia and North America.
  return env.SIGNAL.get(env.SIGNAL.idFromName('all'), { locationHint: 'weur' }).fetch(new Request(request, { headers: forward }));
}

export default {
  /** @param {Request} request @param {Env} env */
  fetch: (request, env) => answer(request, env),
};
