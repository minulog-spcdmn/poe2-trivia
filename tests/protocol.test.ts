import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseClientMsg, RateLimit } from '../src/lib/protocol.ts';

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
    { t: 'action', action: { type: 'join', playerId: 'someone', name: 'x' } },
    { t: 'action', action: { type: 'remove', playerId: 'someone' } },
    { t: 'action', action: { type: 'answer', index: 'x' } },
    { t: 'action', action: { type: 'answer', index: 1.5 } },
    { t: 'action', action: { type: 'answer', index: 99 } },
    { t: 'action', action: { type: 'pick', category: { toString: 1 } } },
    { t: 'state', state: {} },
  ];
  for (const m of bad) assert.equal(parseClientMsg(m), null, JSON.stringify(m)?.slice(0, 80));
  // Extra fields are dropped, not passed through.
  const cleaned = parseClientMsg({ t: 'action', action: { type: 'next', evil: true }, extra: 1 });
  assert.deepEqual(cleaned, { t: 'action', action: { type: 'next' } });
});

test('rate limit allows bursts but not floods', () => {
  const r = new RateLimit(10, 20);
  let ok = 0;
  for (let i = 0; i < 100; i++) if (r.take()) ok++;
  assert.equal(ok, 20);
  assert.equal(r.strikes, 80);
});
