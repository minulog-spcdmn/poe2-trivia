import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEGACY_VERSION_TEXT, parseClientMsg, parseHostMsg, PROTOCOL_VERSION, RateLimit, versionProblem, versionRefusal } from '../src/lib/protocol.ts';

const secret = 'abcdefghijklmnopqrstuvwxyz012345';

test('accepts well-formed guest messages', () => {
  assert.deepEqual(parseClientMsg({ t: 'hello', secret, name: 'Dori', v: 3 }), { t: 'hello', secret, name: 'Dori', v: 3 });
  const tab = 'Ab3_x-9Zq1';
  assert.deepEqual(parseClientMsg({ t: 'hello', secret, name: 'Dori', v: 3, tab }), { t: 'hello', secret, name: 'Dori', v: 3, tab });
  assert.deepEqual(parseClientMsg({ t: 'action', action: { type: 'answer', index: 2, askedAt: 123 } }), {
    t: 'action',
    action: { type: 'answer', index: 2, askedAt: 123 },
  });
  assert.deepEqual(parseClientMsg({ t: 'action', action: { type: 'pick', category: 'Rings' } }), {
    t: 'action',
    action: { type: 'pick', category: 'Rings' },
  });
  assert.deepEqual(parseClientMsg({ t: 'pong', n: 4 }), { t: 'pong', n: 4 });
  // Delve co-op: a vote for a card, and a life given to a teammate.
  assert.deepEqual(parseClientMsg({ t: 'action', action: { type: 'vote', category: 'Rings' } }), { t: 'action', action: { type: 'vote', category: 'Rings' } });
  assert.deepEqual(parseClientMsg({ t: 'action', action: { type: 'revive', target: 'p-1' } }), { t: 'action', action: { type: 'revive', target: 'p-1' } });
});

test('rejects anything a real client would never send', () => {
  const bad: unknown[] = [
    null,
    'hello',
    [],
    { t: 'hello', secret: 'short', name: 'x', v: 3 },
    { t: 'hello', secret, name: 'x', v: 3, tab: 'no spaces!' },
    { t: 'hello', secret, name: 'x', v: 3, tab: 42 },
    { t: 'hello', secret, name: 'x'.repeat(5000), v: 3 },
    { t: 'action', action: { type: 'settings', settings: { targetScore: 1 } } }, // host only
    { t: 'action', action: { type: 'start' } },
    { t: 'action', action: { type: 'settings', settings: { mode: 'delve' } } },
    { t: 'action', action: { type: 'clock', askedAt: 1 } }, // Delve: the host's alone
    { t: 'action', action: { type: 'expire' } },
    { t: 'action', action: { type: 'resumed' } },
    { t: 'action', action: { type: 'skip' } },
    { t: 'action', action: { type: 'reask' } },
    { t: 'action', action: { type: 'restart' } },
    { t: 'action', action: { type: 'join', playerId: 'someone', name: 'x' } },
    { t: 'action', action: { type: 'remove', playerId: 'someone' } },
    { t: 'action', action: { type: 'answer', index: 'x' } },
    { t: 'action', action: { type: 'answer', index: 1.5 } },
    { t: 'action', action: { type: 'answer', index: 99 } },
    { t: 'action', action: { type: 'pick', category: { toString: 1 } } },
    { t: 'action', action: { type: 'vote' } },
    { t: 'action', action: { type: 'vote', category: '' } },
    { t: 'action', action: { type: 'vote', category: 3 } },
    { t: 'action', action: { type: 'vote', category: 'x'.repeat(81) } },
    { t: 'action', action: { type: 'revive' } },
    { t: 'action', action: { type: 'revive', target: '' } },
    { t: 'action', action: { type: 'revive', target: ['p1'] } },
    { t: 'action', action: { type: 'revive', target: 'x'.repeat(65) } },
    { t: 'action', action: { type: 'flare', askedAt: 1 } },
    { t: 'action', action: { type: 'dynamite', askedAt: 1 } },
    { t: 'state', state: {} },
  ];
  for (const m of bad) assert.equal(parseClientMsg(m), null, JSON.stringify(m)?.slice(0, 80));
  // Extra fields are dropped, not passed through.
  const cleaned = parseClientMsg({ t: 'action', action: { type: 'next', evil: true }, extra: 1 });
  assert.deepEqual(cleaned, { t: 'action', action: { type: 'next' } });
  // A vote can't name its voter, nor a revive its giver: the host takes those from the connection.
  assert.deepEqual(parseClientMsg({ t: 'action', action: { type: 'vote', category: 'Rings', playerId: 'p0' } }), { t: 'action', action: { type: 'vote', category: 'Rings' } });
  assert.deepEqual(parseClientMsg({ t: 'action', action: { type: 'revive', target: 'p1', by: 'p0' } }), { t: 'action', action: { type: 'revive', target: 'p1' } });
});

test('rate limit allows bursts but not floods', () => {
  const r = new RateLimit(10, 20);
  let ok = 0;
  for (let i = 0; i < 100; i++) if (r.take()) ok++;
  assert.equal(ok, 20);
  assert.equal(r.strikes, 80);
});

test('veiled art patches carry their edges, in whole (x, y, patch) triples', () => {
  const patch = { t: 'patch', qid: 5, i: 3, x: 10, y: 20, w: 30, h: 40, data: new ArrayBuffer(8) };
  assert.ok(parseHostMsg({ ...patch, edges: new Uint16Array([1, 2, 4, 3, 2, 4]).buffer }));
  assert.ok(parseHostMsg({ ...patch, edges: new Uint8Array(12) }), 'a view of the bytes is fine');
  assert.ok(parseHostMsg({ ...patch, edges: new ArrayBuffer(0) }), 'a patch may touch nothing');
  assert.equal(parseHostMsg(patch), null);
  assert.equal(parseHostMsg({ ...patch, edges: new ArrayBuffer(7) }), null);
  assert.equal(parseHostMsg({ ...patch, edges: [1, 2, 3] }), null);
  assert.equal(parseHostMsg({ ...patch, edges: new ArrayBuffer(6 * 20000) }), null);
  const veil = { t: 'veil', qid: 5, w: 100, h: 120, burn: 900, count: 12, box: [4, 6, 90, 108] };
  assert.ok(parseHostMsg(veil));
  assert.equal(parseHostMsg({ ...veil, box: undefined }), null);
  assert.equal(parseHostMsg({ ...veil, box: [1, 2, 3] }), null);
  assert.equal(parseHostMsg({ ...veil, count: undefined }), null);
  assert.equal(parseHostMsg({ t: 'veil', qid: 5, w: 100, h: 120 }), null);
});

test('a version mismatch says which side has to reload', () => {
  assert.equal(versionProblem(PROTOCOL_VERSION), null);
  assert.match(versionProblem(PROTOCOL_VERSION - 1)!, /^Your game is out of date/);
  assert.match(versionProblem(PROTOCOL_VERSION + 1)!, /host's game is out of date/);
  // What hosts before version 10 send, whichever side is behind.
  assert.equal(LEGACY_VERSION_TEXT, 'Your game version is out of date. Please reload the page.');
  assert.match(versionRefusal(LEGACY_VERSION_TEXT), /different versions/);
  assert.equal(versionRefusal('The lobby is full.'), 'The lobby is full.');
});

test('veiled "find the art" pictures say which option they belong to', () => {
  const veil = { t: 'veil', qid: 5, w: 100, h: 80, burn: 900, count: 16, box: [0, 0, 100, 80] };
  const patch = { t: 'patch', qid: 5, i: 3, x: 0, y: 0, w: 20, h: 20, data: new ArrayBuffer(8), edges: new ArrayBuffer(6) };
  assert.ok(parseHostMsg(veil), 'the art of a name question has no tile');
  assert.ok(parseHostMsg({ ...veil, tile: 7 }));
  assert.ok(parseHostMsg({ ...patch, tile: 0 }));
  assert.equal(parseHostMsg({ ...veil, tile: 17 }), null);
  assert.equal(parseHostMsg({ ...patch, tile: -1 }), null);
  assert.equal(parseHostMsg({ ...patch, tile: '2' }), null);
});
