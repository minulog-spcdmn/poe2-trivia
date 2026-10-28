// A peer's options (lib/peer.ts) as PeerJS hands them to each connection,
// through the wrapper PeerJS's webrtc-adapter puts around RTCPeerConnection
// on Safari and every iOS browser, which writes the servers back onto them.
import './asVite.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { peerOptions } = await import('../src/lib/peer.ts');
const { shimRTCIceServerUrls } = createRequire(import.meta.url)('webrtc-adapter/dist/safari/safari_shim.js');

test("Safari's wrapped RTCPeerConnection takes a peer's options and reads its servers", () => {
  const made: RTCIceServer[][] = [];
  const window = {
    RTCPeerConnection: class {
      constructor(config: RTCConfiguration) {
        made.push(config.iceServers ?? []);
      }
    },
  };
  shimRTCIceServerUrls(window);
  const { config } = peerOptions();
  new window.RTCPeerConnection(config);
  new window.RTCPeerConnection(config);
  assert.deepEqual(made, [[{ urls: 'stun:stun.l.google.com:19302' }], [{ urls: 'stun:stun.l.google.com:19302' }]]);
});
