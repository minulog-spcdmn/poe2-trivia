import type { PeerOptions } from 'peerjs';
import { CHANNEL, LOCAL, roomPrefix } from './channel';
import { QA_ROOM } from './storage';
import { QA_PEER_PATH, QA_PEER_PORT } from '../qa/live/signal';

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
export const PEER_OPTIONS: PeerOptions =
  QA_ROOM && LOCAL
    ? { host: location.hostname, port: QA_PEER_PORT, path: QA_PEER_PATH, secure: location.protocol === 'https:', config: { iceServers: [] } }
    : env.VITE_PEER_HOST
      ? {
          host: env.VITE_PEER_HOST,
          port: Number(env.VITE_PEER_PORT ?? 443),
          path: env.VITE_PEER_PATH ?? '/',
          secure: (env.VITE_PEER_SECURE ?? 'true') === 'true',
        }
      : {};
