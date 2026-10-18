// Where a live room of the QA desk meets on the dev server: the local
// signalling server qaServer.ts starts (PeerJS's own server, the `peer`
// package), on loopback. No imports, so the Vite config can read it too.

export const QA_PEER_PORT = 9000;
export const QA_PEER_PATH = '/qa';
