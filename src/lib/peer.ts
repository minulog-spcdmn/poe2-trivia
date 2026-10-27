import type { PeerOptions } from 'peerjs';
import type * as PeerJsModule from 'peerjs';
import { CHANNEL, LOCAL, roomPrefix } from './channel';
import { QA_ROOM } from './storage';
import { whenSettled } from './settled';
import { QA_PEER_PATH, QA_PEER_PORT } from '../qa/live/signal';
import { loadRelay, relayServers } from './relay';

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

/**
 * A new peer's options: the signalling server, and the relay (lib/relay.ts)
 * when a login is held. PeerJS's own default lists its relays, which are gone.
 */
export function peerOptions(): PeerOptions {
  if (QA_LOCAL) return { ...SIGNALLING, config: { iceServers: [] } };
  const relay = relayServers();
  return { ...SIGNALLING, config: { iceServers: relay.length ? relay : [STUN] } };
}

export type PeerJs = typeof PeerJsModule;
let peerJs: PeerJs | null = null;
let loading: Promise<PeerJs> | null = null;

/**
 * PeerJS, loaded the first time a peer is made (or once the start page has
 * settled, after the lobby's screens: preloadPeerJs, queued by App.svelte):
 * the start page doesn't wait for it. A load that fails (offline) is tried
 * again on the next call. The relay's login comes with it (loadRelay, which
 * never fails), so the first peer has it; a later call fetches a fresh one
 * once the login held runs low.
 */
export function loadPeerJs(): Promise<PeerJs> {
  const relay = QA_LOCAL ? Promise.resolve() : loadRelay();
  loading ??= import('peerjs').catch((err) => {
    loading = null;
    throw err;
  });
  return Promise.all([loading, relay]).then(([m]) => (peerJs = m));
}

/** PeerJS when it is loaded already, so a peer can be made right away. */
export const peerJsNow = (): PeerJs | null => peerJs;

/** Loads PeerJS once the page has settled (lib/settled.ts: not over the start page's entrance), so hosting or joining doesn't wait for it; returns what takes that back if it hasn't run. */
export function preloadPeerJs(): () => void {
  return whenSettled(() => loadPeerJs().catch(() => {}));
}
