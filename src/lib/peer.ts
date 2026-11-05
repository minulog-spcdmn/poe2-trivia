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
const OWN: PeerOptions = { host: OWN_SIGNAL_HOST, port: 443, path: '/', secure: true };
let own = !!OWN_SIGNAL_HOST && !QA && env.MODE !== 'test' && !env.VITE_PEER_HOST;
/** The page's server, once a look found one that answers (null: not looked yet, or neither answered). */
let chosen: Server | null = own ? null : 'cloud';
let choosing: Promise<Server> | null = null;
/** A look has ended, whatever it found: peers are made on, the cloud's if it found neither. */
let looked = !own;
/** How long a server's answer is waited for, as the page decides where to meet (ms). */
const LOOK_MS = 4000;

/** Whether a server answers this page: the address PeerJS gets a fresh id from, which the cloud refuses in Russia. */
async function answers(o: PeerOptions): Promise<boolean> {
  const url = `https://${o.host ?? '0.peerjs.com'}${o.path ?? '/'}peerjs/id?ts=${Date.now()}${Math.random()}`;
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), LOOK_MS);
  try {
    return (await fetch(url, { signal: stop.signal, cache: 'no-store' })).ok;
  } catch {
    // (Refused, the cloud's 403 has nothing that lets the page read it, so it fails as a lost network would.)
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Looks, once a page goes online, where it meets: the cloud if it answers,
 * else ours if that does. Neither (offline): the cloud, looked at again the
 * next time a peer is made.
 */
export function chooseServer(): Promise<Server> {
  if (chosen) return Promise.resolve(chosen);
  return (choosing ??= (async () => {
    const found: Server | null = (await answers(SIGNALLING)) ? 'cloud' : (await answers(OWN)) ? 'own' : null;
    if (own) chosen = found;
    looked = true;
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
  looked = chosen !== null;
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

/** PeerJS for a page going online, when it is loaded already, its server chosen, and (unless `wait` is false) the relay's login isn't worth waiting for, so a peer can be made right away (else loadPeerJs first). */
export function peerJsNow(wait = true): PeerJs | null {
  goOnline();
  // A look that found neither server (offline) is had again, for the peers after this one.
  if (!chosen && looked && !choosing) void chooseServer();
  return (wait && relay.wanted()) || !looked ? null : peerJs;
}

/** Loads PeerJS once the page has settled (lib/settled.ts: not over the start page's entrance), so hosting or joining doesn't wait for it; returns what takes that back if it hasn't run. */
export function preloadPeerJs(): () => void {
  return whenSettled(() => loadPeerJsCode().catch(() => {}));
}
