import type { PeerOptions } from 'peerjs';
import { BETA } from './channel';

// Bump when the protocol or item data changes so old tabs can't join new rooms.
// The beta has rooms (and open-room listings) of its own, so live and beta tabs never meet.
export const PEER_PREFIX = BETA ? 'poe2-trivia-beta-v5-' : 'poe2-trivia-v5-';

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
