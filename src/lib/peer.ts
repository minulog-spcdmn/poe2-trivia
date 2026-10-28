import type { PeerOptions } from 'peerjs';
import type * as PeerJsModule from 'peerjs';
import { CHANNEL, LOCAL, roomPrefix } from './channel';
import { QA, QA_ROOM } from './storage';
import { whenSettled } from './settled';
import { QA_PEER_PATH, QA_PEER_PORT } from '../qa/live/signal';
import { Relay } from './relay';
import { RELAY_URL } from './relayUrl';

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
 * A new peer's options: the signalling server, and the relay (lib/relay.ts)
 * when a login is held. PeerJS's own default lists its relays, which are gone.
 * PeerJS hands `config` to each RTCPeerConnection a peer makes, which reads
 * its servers then: a room's host or a device waiting to sync for hours gives
 * each connection the login held at the time, not the one it was made with.
 */
export function peerOptions(): PeerOptions {
  if (QA_LOCAL) return { ...SIGNALLING, config: { iceServers: [] } };
  return {
    ...SIGNALLING,
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
 * is made (or ahead, preloadPeerJs), and, unless `wait` is false, with the
 * relay's login (Relay.load, which never fails and waits 3 s at most). A
 * host doesn't wait: its connections come later, each reading the login then.
 */
export function loadPeerJs(wait = true): Promise<PeerJs> {
  goOnline();
  return wait ? Promise.all([loadPeerJsCode(), relay.load()]).then(([m]) => m) : loadPeerJsCode();
}

/** PeerJS for a page going online, when it is loaded already and (unless `wait` is false) the relay's login isn't worth waiting for, so a peer can be made right away (else loadPeerJs first). */
export function peerJsNow(wait = true): PeerJs | null {
  goOnline();
  return wait && relay.wanted() ? null : peerJs;
}

/** Loads PeerJS once the page has settled (lib/settled.ts: not over the start page's entrance), so hosting or joining doesn't wait for it; returns what takes that back if it hasn't run. */
export function preloadPeerJs(): () => void {
  return whenSettled(() => loadPeerJsCode().catch(() => {}));
}
