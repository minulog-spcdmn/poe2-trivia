import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Pings and their answers (lib/rooms.ts signals) come as ICE candidates for
// connections that never come. PeerJS keeps each such candidate, in case its
// connection turns up, and rooms.ts takes it back out with _getMessages from
// a listener of its own on the peer's socket, which runs after PeerJS's.
// None of that is PeerJS's documented API: checked against the PeerJS
// installed, so an update that changes it shows here, not as a slow leak on
// long-lived hosts.

const code = readFileSync(join(import.meta.dirname, '..', 'node_modules/peerjs/dist/bundler.mjs'), 'utf8');
const between = (from: string, to: string) => {
  const start = code.indexOf(from);
  assert.ok(start >= 0, `PeerJS no longer has ${from}`);
  return code.slice(start, code.indexOf(to, start));
};

test("PeerJS keeps a candidate for a connection it doesn't know, under its connection id", () => {
  const handle = between('/** Handles messages from the server. */ _handleMessage(message) {', '/** Stores messages without a set up connection');
  const fallback = handle.slice(handle.indexOf('default:'));
  assert.match(fallback, /const connectionId = payload\.connectionId;/);
  assert.match(fallback, /else if \(connectionId\) \/\/ Store for possible later use\s*this\._storeMessage\(connectionId, message\);/);
});

test('_getMessages hands them back and forgets them', () => {
  const get = between('_getMessages(connectionId) {', '}\n    /**');
  assert.match(get, /this\._lostMessages\.delete\(connectionId\)/);
  const types = readFileSync(join(import.meta.dirname, '..', 'node_modules/peerjs/dist/types.d.ts'), 'utf8');
  assert.match(types, /_getMessages\(connectionId: string\): ServerMessage\[\];/);
  assert.match(types, /get socket\(\): Socket;/);
});

test("PeerJS's listener on its socket is there from the constructor, so it runs before any added later", () => {
  const create = between('_createServerConnection() {', 'return socket;');
  assert.match(create, /socket\.on\(\(0, [\w$]+\)\.Message, \(data\)=>\{\s*this\._handleMessage\(data\);/);
  const ctor = between('this._lostMessages = new Map()', '_createServerConnection() {');
  assert.match(ctor, /this\._socket = this\._createServerConnection\(\);/);
});
