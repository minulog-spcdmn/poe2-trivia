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

// What is never claimed (a candidate for a connection that never comes, sent
// by anybody who knows a peer's id) would stay as long as the peer does:
// lib/peer.ts keeps only the newest few, and hangs up a call offered, which
// PeerJS keeps too and nothing in the game answers.
await import('./asVite.ts');
const { KEPT_SIGNALS, newPeer, trimKept } = await import('../src/lib/peer.ts');

test('PeerJS keeps them in a Map by connection id, and keeps a call offered until it is closed', () => {
  assert.match(code, /this\._lostMessages = new Map\(\)/);
  const handle = between('/** Handles messages from the server. */ _handleMessage(message) {', '/** Stores messages without a set up connection');
  assert.match(handle, /this\._addConnection\(peerId, connection\);\s*this\.emit\("call", mediaConnection\);/);
});

test('only the newest few signals are kept: the ones longest there go first, whole connections at a time', () => {
  const kept = new Map<string, unknown[]>();
  for (let i = 0; i < 10; i++) kept.set(`c${i}`, [1, 2, 3]);
  trimKept(kept, 12);
  assert.deepEqual([...kept.keys()], ['c6', 'c7', 'c8', 'c9']);
  // One connection's alone past the most: gone too.
  const one = new Map<string, unknown[]>([['flood', Array(KEPT_SIGNALS + 1).fill(0)]]);
  trimKept(one);
  assert.equal(one.size, 0);
  // Within it, nothing goes.
  const few = new Map<string, unknown[]>([['a', [1]], ['b', [2, 3]]]);
  trimKept(few);
  assert.equal(few.size, 2);
});

test('a new peer trims what PeerJS kept as each message comes, and closes a call as it is offered', () => {
  const heard = new Map<string, ((...a: unknown[]) => void)[]>();
  const hear = (type: string, f: (...a: unknown[]) => void) => void heard.set(type, [...(heard.get(type) ?? []), f]);
  class Peer {
    _lostMessages = new Map<string, unknown[]>();
    socket = { on: (type: string, f: () => void) => hear(`socket:${type}`, f) };
    on = hear;
    constructor(..._: unknown[]) {}
  }
  const peer = newPeer(Peer as never, 'someone', 'cloud') as unknown as Peer;
  // A stream of candidates for connections that never come, as PeerJS stores each before any other listener hears of it.
  for (let i = 0; i < 1000; i++) {
    peer._lostMessages.set(`never-${i}`, [{ type: 'CANDIDATE' }]);
    heard.get('socket:message')!.forEach((f) => f());
  }
  assert.equal(peer._lostMessages.size, KEPT_SIGNALS);
  assert.ok(peer._lostMessages.has('never-999'), 'the newest is kept: the one that may yet be claimed');
  let closed = 0;
  heard.get('call')!.forEach((f) => f({ close: () => closed++ }));
  assert.equal(closed, 1);
});
