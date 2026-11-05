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
// is stored or logged: the peers' ids, addresses and sockets live only in the
// Object's memory.

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
 *   PER_ADDRESS: { limit(o: { key: string }): Promise<{ success: boolean }> },
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

/** @param {Request} request @param {Env} env */
export async function answer(request, env) {
  const origin = request.headers.get('Origin') ?? '';
  if (origin !== LIVE && !LOCAL.test(origin)) return new Response(null, { status: 403 });
  const headers = { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Cache-Control': 'no-store' };
  const url = new URL(request.url);
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
