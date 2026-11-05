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
// - OFFER, ANSWER, CANDIDATE, LEAVE and EXPIRE go to their `dst`, with `src`
//   set to the sender. One for an id nobody holds waits for it (a host
//   reconnecting) and, if it hasn't come within EXPIRE_MS, its sender is told
//   EXPIRE: the room isn't there (PeerJS's peer-unavailable). The open rooms
//   list leans on that (lib/rooms.ts), as on the ping it sends as a CANDIDATE.
// - A socket silent for ALIVE_MS (PeerJS sends a heartbeat every 5 s) is
//   dropped, freeing its id.
// - `/peerjs/id` hands a peer made without an id a fresh one.
//
// Only the game's own pages are answered, an address may connect only so
// often (PER_ADDRESS, wrangler.toml), and a socket may send only so much: no
// browser elsewhere can use it, and a script can't do more than spend the
// day's free allowance, after which the game meets on the PeerJS cloud again
// (lib/peer.ts). Nothing is stored or logged: the peers' ids and sockets live
// only in the Object's memory.

/** How long a message waits for an id nobody holds before its sender is told EXPIRE (ms), and how often that's looked at: the PeerJS server's. */
export const EXPIRE_MS = 5000;
const EXPIRE_EVERY_MS = 1000;
/** A socket silent this long is dropped (ms): the PeerJS server's, which leaves room for a hidden tab's heartbeat, held back to once a minute. */
export const ALIVE_MS = 90_000;
const ALIVE_EVERY_MS = 15_000;
/** Peers at once, as the PeerJS server's limit. */
export const MAX_PEERS = 5000;
/** The longest message passed on: an offer's description is a few kilobytes. */
export const MAX_TEXT = 64 * 1024;
/** Messages a socket may send in BURST_MS before it's cut off: a room list's scan sends a few dozen. */
export const MAX_BURST = 200;
const BURST_MS = 10_000;
/** Messages kept for an id nobody holds, and for all of them together. */
export const MAX_WAITING = 100;
const MAX_WAITING_ALL = 10_000;
/** What PeerJS takes as an id (its util.validateId), and as long as a socket's tag could be. */
const ID = /^[A-Za-z0-9]+(?:[ _-][A-Za-z0-9]+)*$/;
const MAX_ID = 256;
const MAX_TOKEN = 128;
/** What a peer sends on, as the PeerJS server's handlers. */
const PASSED = new Set(['OFFER', 'ANSWER', 'CANDIDATE', 'LEAVE', 'EXPIRE']);
/** What waits for an id nobody holds: not a goodbye. */
const KEPT = new Set(['OFFER', 'ANSWER', 'CANDIDATE']);
const LIVE = 'https://poe2.quest';
/** The dev server, on this machine or another on the network (a phone trying a build): the relay's. */
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|[\w-]+\.localhost|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;

/**
 * A socket as the board uses it.
 * @typedef {{ send(text: string): void, close(code?: number, reason?: string): void }} Socket
 * A peer on the board: its socket, id and token, when it was last heard, and its recent messages.
 * @typedef {{ ws: Socket, id: string, token: string, heard: number, burst: number[] }} Peer
 * A message as passed on.
 * @typedef {{ type: string, src: string, dst: string, payload?: unknown }} Message
 * A socket on Cloudflare, which keeps what it's given across hibernation.
 * @typedef {Socket & { serializeAttachment(value: unknown): void, deserializeAttachment(): unknown }} CfSocket
 * The Durable Object's state, as far as it's used.
 * @typedef {{ acceptWebSocket(ws: CfSocket): void, getWebSockets(): CfSocket[] }} State
 * The Worker's bindings (wrangler.toml).
 * @typedef {{
 *   SIGNAL: { idFromName(name: string): unknown, get(id: unknown, o?: { locationHint?: string }): { fetch(r: Request): Promise<Response> } },
 *   PER_ADDRESS: { limit(o: { key: string }): Promise<{ success: boolean }> },
 * }} Env
 */

/** @param {Socket} ws @param {object} message */
function tell(ws, message) {
  try {
    ws.send(JSON.stringify(message));
  } catch {
    // (A socket already closing: its close is on its way.)
  }
}

/** @param {Socket} ws @param {number} [code] @param {string} [reason] */
function hangUp(ws, code = 1000, reason = '') {
  try {
    ws.close(code, reason);
  } catch {
    // (Closed already.)
  }
}

/** Tells a socket what's wrong (PeerJS's server-error) and closes it. @param {Socket} ws @param {string} msg */
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
  /** Messages for an id nobody holds, and when the first came (the PeerJS server's queues, expired whole). @type {Map<string, { at: number, messages: Message[] }>} */
  waiting = new Map();
  waitingAll = 0;

  /**
   * A socket for `id` with `token`. Taken in and told OPEN (with what
   * waited for it), or refused. Whether it was taken in.
   * @param {Socket} ws @param {string} id @param {string} token @param {number} now
   */
  join(ws, id, token, now) {
    const held = this.peers.get(id);
    if (held && now - held.heard >= ALIVE_MS) this.drop(held);
    else if (held && held.token !== token) {
      tell(ws, { type: 'ID-TAKEN', payload: { msg: 'ID is taken' } });
      hangUp(ws);
      return false;
    } else if (held) {
      // The same page again (PeerJS's reconnect keeps its token): the id moves to the new socket.
      this.bySocket.delete(held.ws);
      hangUp(held.ws);
    } else if (this.peers.size >= MAX_PEERS) {
      refuse(ws, 'Server has reached its concurrent user limit');
      return false;
    }
    /** @type {Peer} */
    const peer = { ws, id, token, heard: now, burst: [] };
    this.peers.set(id, peer);
    this.bySocket.set(ws, peer);
    tell(ws, { type: 'OPEN' });
    const waited = this.waiting.get(id);
    if (waited) {
      this.waiting.delete(id);
      this.waitingAll -= waited.messages.length;
      for (const m of waited.messages) tell(ws, m);
    }
    return true;
  }

  /**
   * A socket taken back after the Object was evicted or woke from hibernation:
   * on the board again as its attachment says, nothing told.
   * @param {Socket} ws @param {string} id @param {string} token @param {number} now
   */
  adopt(ws, id, token, now) {
    const peer = { ws, id, token, heard: now, burst: [] };
    this.peers.set(id, peer);
    this.bySocket.set(ws, peer);
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
    peer.burst = peer.burst.filter((t) => now - t < BURST_MS);
    peer.burst.push(now);
    if (peer.burst.length > MAX_BURST) return this.cutOff(peer, 'Too many messages');
    if (typeof text !== 'string' || text.length > MAX_TEXT) return this.cutOff(peer, 'Message too long');
    /** @type {{ type?: unknown, dst?: unknown, payload?: unknown } | null} */
    let m;
    try {
      m = JSON.parse(text);
    } catch {
      return this.cutOff(peer, 'Invalid message');
    }
    if (typeof m !== 'object' || m === null || typeof m.type !== 'string') return this.cutOff(peer, 'Invalid message');
    if (m.type === 'HEARTBEAT' || !PASSED.has(m.type)) return;
    if (m.type === 'LEAVE' && m.dst == null) return this.drop(peer);
    if (typeof m.dst !== 'string' || !m.dst || m.dst.length > MAX_ID) return;
    this.pass({ type: m.type, src: peer.id, dst: m.dst, payload: m.payload }, now);
  }

  /** @param {Message} m @param {number} now */
  pass(m, now) {
    const to = this.peers.get(m.dst);
    if (to) return tell(to.ws, m);
    // Waits for the id to be taken: a host reconnecting. A goodbye to nobody goes nowhere.
    if (!KEPT.has(m.type) || this.waitingAll >= MAX_WAITING_ALL) return;
    let w = this.waiting.get(m.dst);
    if (!w) this.waiting.set(m.dst, (w = { at: now, messages: [] }));
    if (w.messages.length >= MAX_WAITING) return;
    w.messages.push(m);
    this.waitingAll++;
  }

  /** A socket that closed or failed: its id is free, unless a newer socket of the same page took it. @param {Socket} ws */
  left(ws) {
    const peer = this.bySocket.get(ws);
    if (peer) this.drop(peer);
  }

  /** @param {Peer} peer */
  drop(peer) {
    this.bySocket.delete(peer.ws);
    if (this.peers.get(peer.id) === peer) this.peers.delete(peer.id);
    hangUp(peer.ws);
  }

  /** @param {Peer} peer @param {string} msg */
  cutOff(peer, msg) {
    this.bySocket.delete(peer.ws);
    if (this.peers.get(peer.id) === peer) this.peers.delete(peer.id);
    refuse(peer.ws, msg);
  }

  /** What waited EXPIRE_MS for an id nobody took: each sender told once, the rest let go. @param {number} now */
  expire(now) {
    for (const [dst, w] of this.waiting) {
      if (now - w.at < EXPIRE_MS) continue;
      this.waiting.delete(dst);
      this.waitingAll -= w.messages.length;
      const told = new Set();
      for (const m of w.messages) {
        if (told.has(m.src)) continue;
        told.add(m.src);
        const from = this.peers.get(m.src);
        if (from) tell(from.ws, { type: 'EXPIRE', src: dst, dst: m.src });
      }
    }
  }

  /** Drops the sockets silent for ALIVE_MS. @param {number} now */
  sweep(now) {
    for (const peer of [...this.peers.values()]) if (now - peer.heard >= ALIVE_MS) this.drop(peer);
  }
}

/**
 * The Durable Object every peer meets in. Its sockets go through Cloudflare's
 * hibernation API: each keeps its id and token as its attachment, so the
 * board is put back together if the Object is moved or wakes. The checks run
 * on timers only while there's something to check, so it can rest when nobody
 * is connected.
 */
export class Signal {
  /** @param {State} ctx */
  constructor(ctx) {
    this.ctx = ctx;
    this.board = new Board();
    /** @type {ReturnType<typeof setTimeout> | null} */
    this.expiring = null;
    /** @type {ReturnType<typeof setTimeout> | null} */
    this.sweeping = null;
    const now = Date.now();
    for (const ws of ctx.getWebSockets()) {
      const a = /** @type {{ id?: string, token?: string } | null} */ (ws.deserializeAttachment());
      if (a?.id && a.token) this.board.adopt(ws, a.id, a.token, now);
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
    if (this.board.join(server, id, token, Date.now())) server.serializeAttachment({ id, token });
    this.arm();
    return new Response(null, /** @type {ResponseInit} */ ({ status: 101, webSocket: client }));
  }

  /** @param {CfSocket} ws @param {string | ArrayBuffer} message */
  webSocketMessage(ws, message) {
    this.board.heard(ws, message, Date.now());
    this.arm();
  }

  /** @param {CfSocket} ws */
  webSocketClose(ws) {
    this.board.left(ws);
    hangUp(ws);
  }

  /** @param {CfSocket} ws */
  webSocketError(ws) {
    this.board.left(ws);
  }

  /** The checks' timers, while each has something to look at. */
  arm() {
    if (!this.expiring && this.board.waiting.size)
      this.expiring = setTimeout(() => {
        this.expiring = null;
        this.board.expire(Date.now());
        this.arm();
      }, EXPIRE_EVERY_MS);
    if (!this.sweeping && this.board.peers.size)
      this.sweeping = setTimeout(() => {
        this.sweeping = null;
        this.board.sweep(Date.now());
        this.arm();
      }, ALIVE_EVERY_MS);
  }
}

/**
 * Whom the rate limit counts as one: an IPv4 address, or an IPv6 one's /64
 * (the relay's, relay/worker.js).
 * @param {string} ip
 */
export function addressKey(ip) {
  if (!ip.includes(':')) return ip;
  const [head, tail = ''] = ip.toLowerCase().split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const full = ip.includes('::') ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right] : left;
  return full.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':') + '::/64';
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
  const { success } = await env.PER_ADDRESS.limit({ key: addressKey(request.headers.get('CF-Connecting-IP') ?? '') });
  if (!success) return new Response(null, { status: 429, headers: { ...headers, 'Retry-After': '60' } });
  if (newId) return new Response(crypto.randomUUID(), { headers: { ...headers, 'Content-Type': 'text/plain' } });
  const id = url.searchParams.get('id') ?? '';
  const token = url.searchParams.get('token') ?? '';
  if (url.searchParams.get('key') !== 'peerjs' || id.length > MAX_ID || !ID.test(id) || !token || token.length > MAX_TOKEN) return new Response(null, { status: 400, headers });
  // Western Europe: in the middle of the players, most of them in Europe, Russia and North America.
  return env.SIGNAL.get(env.SIGNAL.idFromName('all'), { locationHint: 'weur' }).fetch(request);
}

export default {
  /** @param {Request} request @param {Env} env */
  fetch: (request, env) => answer(request, env),
};
