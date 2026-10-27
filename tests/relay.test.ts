import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRelay } from '../src/lib/relay.ts';

const login = { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'], username: 'u', credential: 'c' };

test("the Worker's answer: STUN and TURN servers with their login, and how long it lasts", () => {
  assert.deepEqual(parseRelay({ iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }, login], ttl: 86400 }), {
    iceServers: [{ urls: ['stun:stun.cloudflare.com:3478'] }, login],
    ttl: 86400,
  });
});

test('an answer that is anything else gives no relay', () => {
  for (const raw of [
    null,
    'x',
    { iceServers: [login] },
    { iceServers: [login], ttl: 0 },
    { iceServers: 'turn:x', ttl: 60 },
    { iceServers: [{ urls: [] }], ttl: 60 },
    { iceServers: [{ urls: 'https://example.com' }], ttl: 60 },
    { iceServers: [{ ...login, credential: 7 }], ttl: 60 },
    { iceServers: [null], ttl: 60 },
  ])
    assert.equal(parseRelay(raw), null, JSON.stringify(raw));
});
