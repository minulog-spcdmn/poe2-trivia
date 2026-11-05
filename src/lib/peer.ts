import type { PeerOptions } from 'peerjs';
import type * as PeerJsModule from 'peerjs';
import { CHANNEL, LOCAL, roomPrefix } from './channel';
import { QA, QA_ROOM } from './storage';
import { whenSettled } from './settled';
import { QA_PEER_PATH, QA_PEER_PORT } from '../qa/live/signal';
import { Relay } from './relay';
import { RELAY_URL } from './relayUrl';
import { OWN_SIGNAL_HOST } from './signalHost';

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
 * host's room and its listing are on both (alsoOn), so a guest finds it on
 * either; a guest whose room isn't on its page's server looks on the other.
 * Everyone the cloud answers meets there as before: nothing that worked
 * before leans on ours. None beside a self-hosted server, nor on the QA desk
 * or in tests (as the relay, which ours would be reached by), unless a test
 * asks for it (useServers).
 */
export type Server = 'cloud' | 'own';
/** Its heartbeat every 25 s, not PeerJS's 5: each wakes the server, whose free allowance counts them, and it waits 90 s for one (signal/worker.js ALIVE_MS). */
const OWN: PeerOptions = { host: OWN_SIGNAL_HOST, port: 443, path: '/', secure: true, pingInterval: 25_000 };
let own = !!OWN_SIGNAL_HOST && !QA && env.MODE !== 'test' && !env.VITE_PEER_HOST;
/** The page's server, once a look found one that answers (null: not looked yet, or neither answered). */
let chosen: Server | null = own ? null : 'cloud';
let choosing: Promise<Server> | null = null;
/** When the last look ended that found neither server (0: none since one did). */
let failedAt = 0;
/** How long a server's answer is waited for, as the page decides where to meet (ms). */
const LOOK_MS = 4000;
/** How long after a look that found neither peers are made on the cloud regardless, before the next one looks again (ms): not a look for every peer while offline, nor one from long ago. */
const LOOK_AGAIN_MS = 10_000;
/** Where peers can be made: the page's server found, or a look that found neither just ended. */
const ready = () => chosen !== null || Date.now() - failedAt < LOOK_AGAIN_MS;

/**
 * Whether a server answers this page, at the address PeerJS gets a fresh id
 * from, which the cloud refuses in Russia: 'yes', 'no' (refused, or no
 * network), or 'slow' (no word in LOOK_MS: a slow link, or the server).
 */
async function answers(o: PeerOptions): Promise<'yes' | 'no' | 'slow'> {
  const url = `https://${o.host ?? '0.peerjs.com'}${o.path ?? '/'}peerjs/id?ts=${Date.now()}${Math.random()}`;
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), LOOK_MS);
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
 * Looks, once a page goes online, where it meets: the cloud if it answers,
 * else, if it said no, ours if that answers. A cloud only slow to answer is
 * no reason to leave it (PeerJS would wait for it, as it did before ours):
 * as with neither (offline), the page meets on the cloud and looks again
 * before a peer is made once LOOK_AGAIN_MS has passed (peerJsNow).
 */
export function chooseServer(): Promise<Server> {
  if (chosen) return Promise.resolve(chosen);
  return (choosing ??= (async () => {
    const cloud = await answers(SIGNALLING);
    const found: Server | null = cloud === 'yes' ? 'cloud' : cloud === 'no' && (await answers(OWN)) === 'yes' ? 'own' : null;
    if (own) chosen = found;
    failedAt = found ? 0 : Date.now();
    choosing = null;
    return found ?? 'cloud';
  })());
}

/** Where this page's peers meet: guests, the open rooms list, syncing, and a host's room first. */
export const pageServer = (): Server => chosen ?? 'cloud';

/** The other server a host's room (and its listing) is on too, and that a guest looks on for a room not on its page's server: ours beside the cloud; none for a page the cloud turned away. */
export const alsoOn = (): Server | null => (own && chosen === 'cloud' ? 'own' : null);

/** Tests: whether ours is there, and which a page meets on (null: looked for as a page does, chooseServer). */
export function useServers(withOwn: boolean, page: Server | null = 'cloud') {
  own = withOwn;
  chosen = withOwn ? page : 'cloud';
  choosing = null;
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

/**
 * A new peer on `server` (the page's unless named), under `id` or a fresh
 * one: on ours made here, which saves the request PeerJS makes for one (the
 * free allowance counts it); on the cloud the cloud's, as before. On a page
 * that meets on ours, kept on a fresh socket (keepFresh).
 */
export function newPeer(Peer: PeerJs['default'], id?: string, server: Server = pageServer()): PeerJsModule.Peer {
  const options = peerOptions(server);
  const name = id ?? (server === 'own' && !QA_LOCAL ? crypto.randomUUID() : undefined);
  const peer = name ? new Peer(name, options) : new Peer(options);
  if (server === 'own' && chosen === 'own') keepFresh(peer);
  return peer;
}

/** What a socket to ours carries before it's swapped for a fresh one (keepFresh), and how long it's to be quiet first, so nothing is on its way. */
const FRESH_CHARS = 8 * 1024;
const QUIET_MS = 1000;

/**
 * Russian networks are reported to stall a connection to Cloudflare once
 * about 16 KB have gone over it (Cloudflare, June 2025), as a room's host's
 * would after a few guests. A peer on ours from a page there takes a fresh
 * socket under the same id and token once it has carried FRESH_CHARS and
 * gone quiet: the server hands the id over (what reaches it meanwhile waits
 * there), and PeerJS keeps the peer and its connections as they are.
 */
export function keepFresh(peer: PeerJsModule.Peer) {
  const socket = peer.socket as unknown as {
    send(data: object): void;
    on(event: 'message', f: (data: unknown) => void): unknown;
    close?(): void;
    start?(id: string, token: string): void;
  };
  if (!socket?.start || !socket.close) return;
  let carried = 0;
  let quiet: ReturnType<typeof setTimeout> | null = null;
  const swap = () => {
    quiet = null;
    const token = peer.options.token;
    if (peer.destroyed || !peer.open || !token || carried < FRESH_CHARS) return;
    carried = 0;
    socket.close!();
    socket.start!(peer.id, token);
  };
  const add = (data: unknown) => {
    carried += JSON.stringify(data)?.length ?? 0;
    if (carried < FRESH_CHARS) return;
    if (quiet) clearTimeout(quiet);
    quiet = setTimeout(swap, QUIET_MS);
  };
  const send = socket.send.bind(socket);
  socket.send = (data) => {
    add(data);
    send(data);
  };
  socket.on('message', add);
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

/** Loads PeerJS, and looks where the page meets (chooseServer), once the page has settled (lib/settled.ts: not over the start page's entrance), so hosting or joining doesn't wait for either; returns what takes that back if it hasn't run. */
export function preloadPeerJs(): () => void {
  return whenSettled(() => {
    loadPeerJsCode().catch(() => {});
    void chooseServer();
  });
}
