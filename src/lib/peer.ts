import type { PeerOptions } from 'peerjs';
import { BETA, LOCAL } from './channel';

// Bump when the protocol or item data changes so old tabs can't join new rooms.
const PROTOCOL = 'v5';
// The beta and localhost have rooms (and open-room listings) of their own, so live, beta and local tabs never meet.
export const PEER_PREFIX = `poe2-trivia-${BETA ? 'beta-' : LOCAL ? 'local-' : ''}${PROTOCOL}-`;

// Signalling server. Defaults to the free PeerJS cloud; set VITE_PEER_HOST (and
// optionally VITE_PEER_PORT / VITE_PEER_PATH / VITE_PEER_SECURE) to self-host.
const env = import.meta.env;
export const PEER_OPTIONS: PeerOptions = env.VITE_PEER_HOST
  ? {
      host: env.VITE_PEER_HOST,
      port: Number(env.VITE_PEER_PORT ?? 443),
      path: env.VITE_PEER_PATH ?? '/',
      secure: (env.VITE_PEER_SECURE ?? 'true') === 'true',
    }
  : {};
