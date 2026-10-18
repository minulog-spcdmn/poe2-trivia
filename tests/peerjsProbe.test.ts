import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { withoutProbe } from '../peerjsProbe.ts';

// The build's peerjs-probe plugin (peerjsProbe.ts) takes out the peer
// connection PeerJS makes on import. Checked against the PeerJS installed:
// the probe is found, and what's left makes no peer connection before a
// Peer asks for one.

const code = readFileSync(join(import.meta.dirname, '..', 'node_modules/peerjs/dist/bundler.mjs'), 'utf8');

test("PeerJS's probe is found and taken out", () => {
  const out = withoutProbe(code);
  assert.ok(out, "peerjsProbe.ts doesn't find the probe in this PeerJS");
  const supports = out.slice(out.indexOf('this.supports = function()'), out.indexOf('this.validateId'));
  assert.ok(supports.length > 0);
  assert.doesNotMatch(supports, /new RTCPeerConnection|createDataChannel\(/);
  for (const key of ['audioVideo', 'data', 'reliable', 'binaryBlob']) assert.match(supports, new RegExp(`supported\\.${key} =`));
});

test('the rest of PeerJS is left as it was', () => {
  const out = withoutProbe(code)!;
  const before = code.split('new RTCPeerConnection(').length;
  assert.equal(out.split('new RTCPeerConnection(').length, before - 1);
  assert.equal(out.slice(0, code.indexOf('this.supports')), code.slice(0, code.indexOf('this.supports')));
  assert.equal(out.slice(out.indexOf('this.validateId')), code.slice(code.indexOf('this.validateId')));
});
