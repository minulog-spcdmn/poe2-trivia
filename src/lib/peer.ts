import type { PeerOptions } from 'peerjs';
import type * as PeerJsModule from 'peerjs';
import { CHANNEL, LOCAL, roomPrefix } from './channel';
import { QA_ROOM } from './storage';
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
/** Google's STUN server, for a peer without the relay (whose own login brings Cloudflare's). */
const STUN: RTCIceServer = { urls: 'stun:stun.l.google.com:19302' };
/** The relay's logins (lib/relay.ts). None on the QA desk's local server, nor in tests (a live build, as tests/asVite.ts makes them), which would reach the real Worker. */
const RELAY = QA_LOCAL || env.MODE === 'test' ? '' : RELAY_URL;
const relay = new Relay(RELAY);
/**
 * How often a page looks whether its login runs low, so it's renewed even
 * while nothing asks for one: a room's host waiting hours for a guest still
 * has a valid login for the connection that guest brings.
 */
const RENEW_CHECK_MS = 10 * 60_000;
if (RELAY) setInterval(() => relay.start(), RENEW_CHECK_MS);

/**
 * A new peer's options: the signalling server, and the relay (lib/relay.ts)
 * when a login is held. PeerJS's own default lists its relays, which are gone.
 * PeerJS hands `config` to each RTCPeerConnection a peer makes, which reads
 * its servers then: a room's host or a device waiting to sync for hours gives
 * each connection the login held at the time, not the one it was made with,
 * and asks for a fresh one when it runs low, for the connections after.
 */
export function peerOptions(): PeerOptions {
  if (QA_LOCAL) return { ...SIGNALLING, config: { iceServers: [] } };
  relay.start();
  return {
    ...SIGNALLING,
    config: {
      get iceServers() {
        relay.start();
        const servers = relay.iceServers();
        return servers.length ? servers : [STUN];
      },
    },
  };
}

export type PeerJs = typeof PeerJsModule;
let peerJs: PeerJs | null = null;
let loading: Promise<PeerJs> | null = null;

/**
 * PeerJS's code, loaded once (a load that fails, offline, is tried again on
 * the next call), with the relay's login asked for on the side but not
 * waited for: what only gets PeerJS ahead (preloadPeerJs, App.svelte)
 * isn't held up by a slow Worker.
 */
export function loadPeerJsCode(): Promise<PeerJs> {
  relay.start();
  return (loading ??= import('peerjs').then(
    (m) => (peerJs = m),
    (err) => {
      loading = null;
      throw err;
    },
  ));
}

/**
 * PeerJS, ready for a peer: loaded the first time one is made (or ahead,
 * preloadPeerJs), with the relay's login (Relay.load, which never fails and
 * waits 3 s at most). A call when the login held runs low, has run out or
 * couldn't be had a while ago fetches a fresh one.
 */
export function loadPeerJs(): Promise<PeerJs> {
  return Promise.all([loadPeerJsCode(), relay.load()]).then(([m]) => m);
}

/** PeerJS when it is loaded already and the relay's login isn't worth waiting for, so a peer can be made right away (else loadPeerJs first). */
export const peerJsNow = (): PeerJs | null => (relay.wanted() ? null : peerJs);

/** Loads PeerJS once the page has settled (lib/settled.ts: not over the start page's entrance), so hosting or joining doesn't wait for it; returns what takes that back if it hasn't run. */
export function preloadPeerJs(): () => void {
  return whenSettled(() => loadPeerJsCode().catch(() => {}));
}
