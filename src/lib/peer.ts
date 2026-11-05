import type { PeerOptions } from 'peerjs';
import type * as PeerJsModule from 'peerjs';
import { CHANNEL, LOCAL, roomPrefix } from './channel';
import { QA, QA_ROOM } from './storage';
import { whenSettled } from './settled';
import { QA_PEER_PATH, QA_PEER_PORT } from '../qa/live/signal';
import { Relay } from './relay';
import { RELAY_URL } from './relayUrl';
import { OWN_SIGNAL_HOST } from './signalHost';
import { randomToken } from './roomCode';

// Bump when the protocol or item data changes so old tabs can't join new rooms.
const PROTOCOL = 'v5';
// Each channel (live, beta, this machine's local one) has rooms (and open-room listings) of its own, so their tabs never meet.
// A live room on the QA desk (QA_ROOM, lib/storage.ts) has its own again: it never meets a real one, and lists only its own.
export const PEER_PREFIX = `${roomPrefix(CHANNEL, import.meta.env.VITE_LOCAL_ID)}${QA_ROOM ? `qa-${QA_ROOM}-` : ''}${PROTOCOL}-`;

// Signalling server. Defaults to the free PeerJS cloud; set VITE_PEER_HOST (and
// optionally VITE_PEER_PORT / VITE_PEER_PATH / VITE_PEER_SECURE) to self-host.
// The QA desk's live rooms on the dev server meet on the local server it
// starts (qaServer.ts), with no ICE servers: on one machine the host
// candidates are enough, offline too.
const env = import.meta.env;
const QA_LOCAL = !!QA_ROOM && LOCAL;
const SIGNALLING: PeerOptions = QA_LOCAL
  ? { host: location.hostname, port: QA_PEER_PORT, path: QA_PEER_PATH, secure: location.protocol === 'https:' }
  : env.VITE_PEER_HOST
    ? {
        host: env.VITE_PEER_HOST,
        port: Number(env.VITE_PEER_PORT ?? 443),
        path: env.VITE_PEER_PATH ?? '/',
        secure: (env.VITE_PEER_SECURE ?? 'true') === 'true',
      }
    : {};

/**
 * Where a page's peers meet: the PeerJS cloud (`cloud`, or whatever
 * VITE_PEER_HOST names), or the game's own server (`own`, signal/worker.js),
 * which speaks its protocol. The cloud turns every player in Russia away, so
 * a page it doesn't answer, where ours does, meets on ours (pageServer). A
 * room on the cloud, and its listing, are on ours too (alsoOn), so a guest
 * finds it on either; a guest whose room isn't on the cloud looks on ours.
 * Everyone the cloud answers meets there as before: nothing that worked
 * before leans on ours. A page whose server fails it looks again (relook),
 * so either stands in for the other while it's down. None beside a
 * self-hosted server, nor on the QA desk or in tests (as the relay, which
 * ours would be reached by), unless a test asks for it (useServers).
 */
export type Server = 'cloud' | 'own';
/** Its heartbeat every 25 s, not PeerJS's 5: each wakes the server, whose free allowance counts them, and it waits 90 s for one (signal/worker.js ALIVE_MS). */
const OWN: PeerOptions = { host: OWN_SIGNAL_HOST, port: 443, path: '/', secure: true, pingInterval: 25_000 };
let own = !!OWN_SIGNAL_HOST && !QA && env.MODE !== 'test' && !env.VITE_PEER_HOST;
/** Where the page meets, once a look found a server that answers it (null: not looked yet, or neither answered). */
let chosen: Server | null = own ? null : 'cloud';
/** The look on its way, and when the last one began. */
let looking: Promise<Server | null> | null = null;
let lookedAt = 0;
/** When the last look ended that found neither server, the page having none yet (0: none since one did). */
let failedAt = 0;
/** How long a peer waits for a look, after which it's made on the cloud, as before ours, while the look goes on (ms). */
const LOOK_MS = 4000;
/** How long a look waits for the cloud's word: none by then is taken as a no, as from a network that drops what goes to it (ms). */
const CLOUD_MS = 15_000;
/** How long a look waits for ours (ms). */
const OWN_MS = 8000;
/** A no from the cloud is asked again after this (beside ours): one error, or the network changing, is no reason to leave it (ms). */
const ASK_AGAIN_MS = 1000;
/** Not another look within this of the last (ms): not one for every peer while offline. */
const LOOK_AGAIN_MS = 10_000;
/** A page on ours looks again, without waiting for it, as a peer is made once this has passed: the cloud may answer it by now (an outage over, a VPN on) (ms). */
const RELOOK_MS = 5 * 60_000;
/** Whether a peer can be made now: the page's server found, a look past its wait (made on the cloud meanwhile), or one that found neither just ended. */
const ready = () => chosen !== null || (looking ? Date.now() - lookedAt >= LOOK_MS : Date.now() - failedAt < LOOK_AGAIN_MS);
const after = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

/**
 * Whether a server answers this page, at the address PeerJS gets a fresh id
 * from, which the cloud refuses in Russia: 'yes', 'no' (refused, or no
 * network), or 'slow' (no word in `ms`: a slow link, or the server).
 */
async function answers(o: PeerOptions, ms: number): Promise<'yes' | 'no' | 'slow'> {
  const url = `https://${o.host ?? '0.peerjs.com'}${o.path ?? '/'}peerjs/id?ts=${Date.now()}${Math.random()}`;
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), ms);
  try {
    // (No `cache` option: WebKit sends it as headers, which need a preflight neither server answers. The address is new each time.)
    return (await fetch(url, { signal: stop.signal })).ok ? 'yes' : 'no';
  } catch {
    // (Refused, the cloud's 403 has nothing that lets the page read it, so it fails as a lost network would.)
    return stop.signal.aborted ? 'slow' : 'no';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Looks where the page meets: the cloud if it answers, else ours if that
 * does. A no from the cloud is asked again ASK_AGAIN_MS later, ours asked
 * meanwhile; a cloud slow to answer is waited for (PeerJS would wait for it,
 * as before ours) to CLOUD_MS. What it finds is where peers are made from
 * then on; finding neither, the page stays where it was.
 */
function look(): Promise<Server | null> {
  return (looking ??= (async () => {
    lookedAt = Date.now();
    const cloud = await answers(SIGNALLING, CLOUD_MS);
    let found: Server | null = cloud === 'yes' ? 'cloud' : null;
    if (!found) {
      const [again, ours] = await Promise.all([cloud === 'no' ? after(ASK_AGAIN_MS).then(() => answers(SIGNALLING, LOOK_MS)) : cloud, answers(OWN, OWN_MS)]);
      found = again === 'yes' ? 'cloud' : ours === 'yes' ? 'own' : null;
    }
    if (found) chosen = found;
    failedAt = chosen ? 0 : Date.now();
    looking = null;
    return found;
  })());
}

/**
 * Where the page meets, looked for once it goes online, for LOOK_MS at most:
 * past that (a slow link), and a while after a look that found neither
 * (offline), on the cloud, as before ours, the look going on meanwhile.
 */
export function chooseServer(): Promise<Server> {
  if (ready()) return Promise.resolve(pageServer());
  const looked = look();
  return new Promise((done) => {
    const t = setTimeout(() => done(pageServer()), lookedAt + LOOK_MS - Date.now());
    void looked.then(() => {
      clearTimeout(t);
      done(pageServer());
    });
  });
}

/** Looks again without anyone waiting for it: the page meets where it did meanwhile, and if the look finds neither. */
function relook() {
  if (own && !looking && Date.now() - lookedAt >= LOOK_AGAIN_MS) void look();
}

/** Where this page's peers meet: guests, the open rooms list, syncing, and a host's room first. */
export const pageServer = (): Server => chosen ?? 'cloud';

/** The other server a room on `server` (and its listing) is on too, and that a guest on it looks on for a room it hasn't got: ours beside the cloud; none beside ours, as the cloud turns its pages away. */
export const alsoOn = (server: Server): Server | null => (own && server === 'cloud' ? 'own' : null);

/** The server each peer newPeer made is on. */
const peerServers = new WeakMap<object, Server>();
export const serverOf = (peer: object): Server => peerServers.get(peer) ?? 'cloud';

/** Tests: whether ours is there, and which a page meets on (null: looked for as a page does, chooseServer). */
export function useServers(withOwn: boolean, page: Server | null = 'cloud') {
  own = withOwn;
  chosen = withOwn ? page : 'cloud';
  looking = null;
  // (As if just looked: a page given its server isn't due to look again.)
  lookedAt = page ? Date.now() : 0;
  failedAt = 0;
}
/** Google's STUN server, as before the relay: beside Cloudflare's (the relay's login), so a direct link gets through wherever it did. */
const STUN: RTCIceServer = { urls: 'stun:stun.l.google.com:19302' };
/**
 * The relay's logins (lib/relay.ts). None on the QA desk (its frames would
 * each take one, and its live rooms are on one machine), nor in tests (a live
 * build, as tests/asVite.ts makes them), which would reach the real Worker.
 */
const relay = new Relay(QA || env.MODE === 'test' ? '' : RELAY_URL);
/**
 * How often a page gone online looks whether its login runs low, so it's
 * renewed even while nothing asks for one: a room's host waiting hours for a
 * guest still has a good login for the connection that guest brings.
 */
const RENEW_CHECK_MS = 10 * 60_000;
let online = false;

/**
 * The relay's login, asked for once the page goes online (hosts, joins or
 * syncs; not for the start page's room list, whose pings need none) and kept
 * renewed from then on. A page woken from sleep, shown again or back on the
 * network asks at once, as the interval can lag behind.
 */
function goOnline() {
  relay.start();
  if (online || !relay.on) return;
  online = true;
  setInterval(() => relay.start(), RENEW_CHECK_MS);
  for (const type of ['online', 'pageshow']) addEventListener(type, () => relay.start());
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && relay.start());
}

/** The servers one connection gets: read once, as Safari's wrapper reads them again and again (below). */
let servers: RTCIceServer[] | null = null;

/**
 * A new peer's options: the signalling server (the page's, unless another is
 * named), and the relay (lib/relay.ts) when a login is held. PeerJS's own default lists its relays, which are gone.
 * PeerJS hands `config` to each RTCPeerConnection a peer makes, which reads
 * its servers then: a room's host or a device waiting to sync for hours gives
 * each connection the login held at the time, not the one it was made with.
 */
export function peerOptions(server: Server = pageServer()): PeerOptions {
  if (QA_LOCAL) return { ...SIGNALLING, config: { iceServers: [] } };
  return {
    ...(server === 'own' ? OWN : SIGNALLING),
    config: {
      get iceServers() {
        if (!servers) {
          if (online) relay.start();
          servers = [...relay.iceServers(), STUN];
          queueMicrotask(() => (servers = null));
        }
        return servers;
      },
      // On Safari and every iOS browser, PeerJS's webrtc-adapter wraps
      // RTCPeerConnection and writes the servers back onto the config
      // (shimRTCIceServerUrls), which throws on a getter alone. What it
      // writes is what it read, so it's let go of.
      set iceServers(_: RTCIceServer[]) {},
    },
  };
}

export type PeerJs = typeof PeerJsModule;
let peerJs: PeerJs | null = null;
let loading: Promise<PeerJs> | null = null;

/** What a peer that loses its server does: looks where the page meets again (relook). */
const LOST = new Set(['network', 'server-error', 'socket-error', 'socket-closed']);

/**
 * A new peer on `server` (the page's unless named), under `id` or a fresh
 * one: on ours made here (from getRandomValues, which unlike randomUUID
 * works on plain http and older Safari), which saves the request PeerJS
 * makes for one (the free allowance counts it); on the cloud the cloud's, as
 * before. On a page that meets on ours, kept on a fresh socket (keepFresh).
 * One on the page's server that loses it has the page look again (relook),
 * and on ours one now and then anyway, so a page that's met on one while
 * the other was down goes back.
 */
export function newPeer(Peer: PeerJs['default'], id?: string, server: Server = pageServer()): PeerJsModule.Peer {
  const options = peerOptions(server);
  const name = id ?? (server === 'own' && !QA_LOCAL ? randomToken(24) : undefined);
  const peer = name ? new Peer(name, options) : new Peer(options);
  peerServers.set(peer, server);
  if (server === 'own' && chosen === 'own') keepFresh(peer);
  if (own && server === chosen) peer.on('error', (err) => LOST.has(err.type) && relook());
  if (chosen === 'own' && Date.now() - lookedAt >= RELOOK_MS) relook();
  return peer;
}

/**
 * What a socket to ours carries before it's swapped for a fresh one
 * (keepFresh): its messages' text, each with what it adds on the way (its
 * frame and TLS record), heartbeats too. Swapped once it's quiet (nothing on
 * its way), and not while a connection is being set up unless it has carried
 * FRESH_MOST.
 */
const FRESH_CHARS = 6 * 1024;
const FRESH_MOST = 8 * 1024;
const WIRE_CHARS = 40;
const QUIET_MS = 1000;
/** How long ours has to echo a heartbeat (signal/worker.js) before the socket is taken as stalled and swapped (ms). */
const ECHO_MS = 10_000;
const HEARTBEAT = '{"type":"HEARTBEAT"}';
/** What the server says of an id: the fresh socket's word ends a swap. */
const SAYS = new Set(['OPEN', 'ERROR', 'ID-TAKEN', 'INVALID-KEY']);

/** What keepFresh reaches of PeerJS's socket (peerjs Socket). */
type FreshSocket = {
  send(data: object): void;
  emit(event: string, ...args: unknown[]): boolean;
  close(): void;
  start(id: string, token: string): void;
  _sendHeartbeat(): void;
  _socket?: { readyState: number };
  _disconnected: boolean;
  _messagesQueue: object[];
};

/**
 * Russian networks are reported to stall a connection to Cloudflare once
 * about 16 KB have gone over it (Cloudflare, June 2025), as a room's host's
 * would after a few guests. A peer on ours from a page there takes a fresh
 * socket under the same id and token once it has carried FRESH_CHARS, or as
 * soon as ours doesn't echo a heartbeat (stalled sooner): the server hands
 * the id over (what reaches it meanwhile waits there), and PeerJS keeps the
 * peer and its connections as they are. What the page sends while the fresh
 * socket opens is kept for it (PeerJS would let it go), and the server's
 * OPEN on it is kept from the peer, which is open all along: an 'open' again
 * would begin over what's under way (a join's attempt, a sync's link).
 */
export function keepFresh(peer: PeerJsModule.Peer) {
  const socket = peer.socket as unknown as FreshSocket;
  if (!socket?.start || !socket.close || !socket._sendHeartbeat) return;
  let carried = 0;
  let quiet: ReturnType<typeof setTimeout> | null = null;
  let echo: ReturnType<typeof setTimeout> | null = null;
  /** From a swap until the server's word on the fresh socket, or its loss. */
  let swapping = false;
  const settling = () => Object.values((peer.connections ?? {}) as Record<string, { open: boolean }[]>).some((list) => list.some((c) => !c.open));
  const swap = (stalled = false) => {
    quiet = null;
    const token = peer.options.token;
    if (peer.destroyed || !peer.open || !token || swapping) return;
    if (!stalled && carried < FRESH_CHARS) return;
    if (!stalled && carried < FRESH_MOST && settling()) return void (quiet = setTimeout(swap, QUIET_MS));
    carried = 0;
    swapping = true;
    heard();
    socket.close();
    socket.start(peer.id, token);
    // No word on the fresh socket within ECHO_MS (its handshake stalled too): lost, as PeerJS takes a socket that closes, and reconnected as after any.
    echo = setTimeout(() => socket.emit('disconnected'), ECHO_MS);
  };
  const heard = () => {
    if (echo) clearTimeout(echo);
    echo = null;
  };
  const add = (chars: number) => {
    carried += chars + WIRE_CHARS;
    if (carried < FRESH_CHARS) return;
    if (quiet) clearTimeout(quiet);
    quiet = setTimeout(swap, QUIET_MS);
  };
  const send = socket.send.bind(socket);
  socket.send = (data) => {
    if (swapping && socket._socket?.readyState !== 1 && !socket._disconnected) return void socket._messagesQueue.push(data);
    add(JSON.stringify(data)?.length ?? 0);
    send(data);
  };
  const beat = socket._sendHeartbeat.bind(socket);
  socket._sendHeartbeat = () => {
    const sent = socket._socket?.readyState === 1;
    beat();
    if (!sent) return;
    add(HEARTBEAT.length);
    if (!echo && !swapping) echo = setTimeout(() => swap(true), ECHO_MS);
  };
  const emit = socket.emit.bind(socket);
  socket.emit = (event, ...args) => {
    if (event !== 'message') {
      // The socket lost or failed: PeerJS takes it from here (the peer disconnected, and reconnected later).
      swapping = false;
      heard();
      return emit(event, ...args);
    }
    const type = (args[0] as { type?: unknown } | null)?.type;
    heard();
    add(JSON.stringify(args[0])?.length ?? 0);
    // Its echo, for this alone.
    if (type === 'HEARTBEAT') return true;
    if (swapping && typeof type === 'string' && SAYS.has(type)) {
      swapping = false;
      if (type === 'OPEN' && peer.open) return true;
    }
    return emit(event, ...args);
  };
}

/**
 * Destroys a peer. One made without an id that's still getting it from its
 * server opens its socket anyway once the id comes (PeerJS), with nobody
 * listening, and keeps it up with heartbeats as long as the page is open:
 * not any more.
 */
export function letGo(peer: PeerJsModule.Peer) {
  peer.destroy();
  // (A stand-in peer in tests may have no socket.)
  if (peer.socket) peer.socket.start = () => {};
}

/** PeerJS's code, loaded once (a load that fails, offline, is tried again on the next call). */
export function loadPeerJsCode(): Promise<PeerJs> {
  return (loading ??= import('peerjs').then(
    (m) => (peerJs = m),
    (err) => {
      loading = null;
      throw err;
    },
  ));
}

/**
 * PeerJS, ready for a peer of a page going online: loaded the first time one
 * is made (or ahead, preloadPeerJs), with the page's server chosen
 * (chooseServer), and, unless `wait` is false, with the relay's login
 * (Relay.load, which never fails and waits 3 s at most). A host doesn't
 * wait: its connections come later, each reading the login then.
 */
export function loadPeerJs(wait = true): Promise<PeerJs> {
  goOnline();
  return Promise.all([loadPeerJsCode(), chooseServer(), wait && relay.load()]).then(([m]) => m);
}

/** PeerJS for a page going online, when it is loaded already, its server chosen (or a look that found neither just ended), and (unless `wait` is false) the relay's login isn't worth waiting for, so a peer can be made right away (else loadPeerJs first, which looks again). */
export function peerJsNow(wait = true): PeerJs | null {
  goOnline();
  return (wait && relay.wanted()) || !ready() ? null : peerJs;
}

/**
 * Loads PeerJS once the page has settled (lib/settled.ts: not over the start
 * page's entrance), so hosting or joining doesn't wait for it; returns what
 * takes that back if it hasn't run. Where the page meets is looked for only
 * once it goes online (chooseServer): a page that never does (the codex, a
 * game on one screen) asks neither server anything.
 */
export function preloadPeerJs(): () => void {
  return whenSettled(() => void loadPeerJsCode().catch(() => {}));
}
