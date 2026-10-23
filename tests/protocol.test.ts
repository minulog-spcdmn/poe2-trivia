import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isMedia, LEGACY_VERSION_TEXT, parseClientMsg, parseHostMsg, PROTOCOL_VERSION, RateLimit, versionProblem, versionRefusal } from '../src/lib/protocol.ts';
import { keyMsg, makeSealKey, openSealed, sealMsg } from '../src/lib/seal.ts';

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
    { t: 'action', action: { type: 'dynamite', askedAt: 1 } }, // gone: dynamite is a blast now
    { t: 'action', action: { type: 'blast' } },
    { t: 'action', action: { type: 'blast', askedAt: 'x' } },
    { t: 'action', action: { type: 'blast', askedAt: -1 } },
    { t: 'action', action: { type: 'blast', askedAt: 1.5 } },
    { t: 'state', state: {} },
  ];
  for (const m of bad) assert.equal(parseClientMsg(m), null, JSON.stringify(m)?.slice(0, 80));
  // Extra fields are dropped, not passed through.
  const cleaned = parseClientMsg({ t: 'action', action: { type: 'next', evil: true }, extra: 1 });
  assert.deepEqual(cleaned, { t: 'action', action: { type: 'next' } });
  // A vote can't name its voter, nor a revive its giver: the host takes those from the connection.
  assert.deepEqual(parseClientMsg({ t: 'action', action: { type: 'vote', category: 'Rings', playerId: 'p0' } }), { t: 'action', action: { type: 'vote', category: 'Rings' } });
  assert.deepEqual(parseClientMsg({ t: 'action', action: { type: 'revive', target: 'p1', by: 'p0' } }), { t: 'action', action: { type: 'revive', target: 'p1' } });
  // Watching rather than playing is only ever the sender's own choice.
  assert.deepEqual(parseClientMsg({ t: 'action', action: { type: 'watch', watch: true, playerId: 'p1' } }), { t: 'action', action: { type: 'watch', watch: true } });
  assert.equal(parseClientMsg({ t: 'action', action: { type: 'watch' } }), null);
  assert.equal(parseClientMsg({ t: 'action', action: { type: 'watch', watch: 1 } }), null);
  // A guest who'd rather watch says so in the hello, so the host never seats them by mistake.
  assert.deepEqual(parseClientMsg({ t: 'hello', secret, name: 'Dori', v: 3, watch: true }), { t: 'hello', secret, name: 'Dori', v: 3, watch: true });
  assert.deepEqual(parseClientMsg({ t: 'hello', secret, name: 'Dori', v: 3, watch: false }), { t: 'hello', secret, name: 'Dori', v: 3 });
  assert.equal(parseClientMsg({ t: 'hello', secret, name: 'Dori', v: 3, watch: 'yes' }), null);
  // A guest that opened its end of the art lane says so; anything but a flag is no real client.
  assert.deepEqual(parseClientMsg({ t: 'hello', secret, name: 'Dori', v: 3, lane: true }), { t: 'hello', secret, name: 'Dori', v: 3, lane: true });
  assert.deepEqual(parseClientMsg({ t: 'hello', secret, name: 'Dori', v: 3, lane: false }), { t: 'hello', secret, name: 'Dori', v: 3 });
  assert.equal(parseClientMsg({ t: 'hello', secret, name: 'Dori', v: 3, lane: 1 }), null);
  // The Delve start lines a guest's device has shown: anything off is dropped, never the guest (a newer build's pool may be longer).
  assert.deepEqual(parseClientMsg({ t: 'hello', secret, name: 'Dori', v: 3, lines: [4, 1] }), { t: 'hello', secret, name: 'Dori', v: 3, lines: [4, 1] });
  assert.deepEqual(parseClientMsg({ t: 'hello', secret, name: 'Dori', v: 3, lines: [4, 4, 9999, 'x'] }), { t: 'hello', secret, name: 'Dori', v: 3, lines: [4] });
  assert.deepEqual(parseClientMsg({ t: 'hello', secret, name: 'Dori', v: 3, lines: 'x' }), { t: 'hello', secret, name: 'Dori', v: 3 });
  // A guest that can open sealed pictures says so (the host lets in nobody else); again, only a flag.
  assert.deepEqual(parseClientMsg({ t: 'hello', secret, name: 'Dori', v: 3, seal: true }), { t: 'hello', secret, name: 'Dori', v: 3, seal: true });
  assert.deepEqual(parseClientMsg({ t: 'hello', secret, name: 'Dori', v: 3, seal: false }), { t: 'hello', secret, name: 'Dori', v: 3 });
  assert.equal(parseClientMsg({ t: 'hello', secret, name: 'Dori', v: 3, seal: 'yes' }), null);
});

test("a question's pictures come sealed, and their key on its own; neither carries more than seal.ts lets it", async () => {
  const key = await makeSealKey('17-abc');
  const sealed = await sealMsg({ t: 'art', qid: 17, w: 2, h: 3, data: new ArrayBuffer(8) }, key);
  // The host's own copy goes through as a clean one, nothing added.
  assert.deepEqual(parseHostMsg({ ...sealed, extra: 1 }), sealed);
  assert.deepEqual(parseHostMsg(keyMsg(key)), keyMsg(key));
  assert.equal(parseHostMsg({ ...sealed, kid: 'not a kid!' }), null);
  assert.equal(parseHostMsg({ ...sealed, iv: new ArrayBuffer(4) }), null);
  assert.equal(parseHostMsg({ t: 'key', kid: '17-abc', key: new ArrayBuffer(16) }), null, 'a key of the wrong size');
  // Sealed pictures and their keys are not media: nothing shows them before they're opened.
  assert.equal(isMedia(parseHostMsg(sealed)!), false);
  assert.equal(isMedia(parseHostMsg(keyMsg(key))!), false);
  // Opened, what's inside goes through the same checks as a picture sent plain.
  const opened = await openSealed(sealed, key.key);
  const msg = parseHostMsg(opened);
  assert.ok(msg && isMedia(msg) && msg.t === 'art' && msg.qid === 17);
});

test('rate limit allows bursts but not floods, and fills up again at its rate', () => {
  let now = 0;
  const r = new RateLimit(10, 20, () => now);
  let ok = 0;
  for (let i = 0; i < 100; i++) if (r.take()) ok++;
  assert.equal(ok, 20);
  assert.equal(r.strikes, 80);
  // Ten a second: one more after 100 ms, and never past the burst however long it waits.
  now += 99;
  assert.equal(r.take(), false);
  now += 1;
  assert.equal(r.take(), true);
  now += 60_000;
  ok = 0;
  for (let i = 0; i < 100; i++) if (r.take()) ok++;
  assert.equal(ok, 20);
  // A cost spends that many at once.
  now += 60_000;
  assert.equal(r.take(15), true);
  assert.equal(r.take(6), false);
  assert.equal(r.take(5), true);
});

test('a veiled picture goes out whole with its labels, and a patch only says which one is uncovered', () => {
  const veil = { t: 'veil', qid: 5, w: 100, h: 120, burn: 900, count: 12, box: [4, 6, 90, 108], data: new ArrayBuffer(8), labels: new Uint16Array([1, 12000]).buffer };
  assert.ok(parseHostMsg(veil));
  assert.ok(parseHostMsg({ ...veil, labels: new Uint8Array(8) }), 'a view of the bytes is fine');
  assert.equal(parseHostMsg({ ...veil, data: undefined }), null);
  assert.equal(parseHostMsg({ ...veil, labels: undefined }), null);
  assert.equal(parseHostMsg({ ...veil, labels: new ArrayBuffer(6) }), null, 'whole (patch, length) pairs');
  assert.equal(parseHostMsg({ ...veil, labels: new ArrayBuffer(4 * 300000) }), null);
  assert.equal(parseHostMsg({ ...veil, box: undefined }), null);
  assert.equal(parseHostMsg({ ...veil, box: [1, 2, 3] }), null);
  assert.equal(parseHostMsg({ ...veil, count: undefined }), null);
  assert.equal(parseHostMsg({ t: 'veil', qid: 5, w: 100, h: 120 }), null);
  const patch = { t: 'patch', qid: 5, i: 3 };
  assert.deepEqual(parseHostMsg(patch), patch);
  assert.equal(parseHostMsg({ ...patch, i: 255 }), null);
  assert.equal(parseHostMsg({ ...patch, i: -1 }), null);
  assert.equal(parseHostMsg({ t: 'patch', qid: 5 }), null);
});

test('a version mismatch says which side has to reload', () => {
  assert.equal(versionProblem(PROTOCOL_VERSION), null);
  assert.match(versionProblem(PROTOCOL_VERSION - 1)!, /^Your game is out of date/);
  assert.match(versionProblem(PROTOCOL_VERSION + 1)!, /host’s game is out of date/);
  // What hosts before version 10 send, whichever side is behind.
  assert.equal(LEGACY_VERSION_TEXT, 'Your game version is out of date. Please reload the page.');
  assert.match(versionRefusal(LEGACY_VERSION_TEXT), /different versions/);
  assert.equal(versionRefusal('The lobby is full.'), 'The lobby is full.');
});

test('veiled "find the art" pictures say which option they belong to', () => {
  const veil = { t: 'veil', qid: 5, w: 100, h: 80, burn: 900, count: 16, box: [0, 0, 100, 80], data: new ArrayBuffer(8), labels: new ArrayBuffer(4) };
  const patch = { t: 'patch', qid: 5, i: 3 };
  assert.ok(parseHostMsg(veil), 'the art of a name question has no tile');
  assert.ok(parseHostMsg({ ...veil, tile: 7 }));
  assert.ok(parseHostMsg({ ...patch, tile: 0 }));
  assert.equal(parseHostMsg({ ...veil, tile: 17 }), null);
  assert.equal(parseHostMsg({ ...patch, tile: -1 }), null);
  assert.equal(parseHostMsg({ ...patch, tile: '2' }), null);
});

test('an answer turned down names its question, so the guest can answer it again; a guest without that just shows the message', () => {
  const message = 'Too quick to count: the question had only just reached you. Answer again.';
  assert.deepEqual(parseHostMsg({ t: 'error', message, askedAt: 123 }), { t: 'error', message, askedAt: 123 });
  assert.deepEqual(parseHostMsg({ t: 'error', message }), { t: 'error', message });
  assert.equal(parseHostMsg({ t: 'error', message, askedAt: 'x' }), null);
  assert.equal(parseHostMsg({ t: 'error', message, askedAt: -1 }), null);
  assert.equal(parseHostMsg({ t: 'error', message, askedAt: 1.5 }), null);
});

test('the protocol version moves only on purpose (its note in protocol.ts says what each changed)', () => {
  assert.equal(PROTOCOL_VERSION, 33);
});

test("an option's picture comes with its size in art pixels", () => {
  const pic = new ArrayBuffer(8);
  assert.ok(parseHostMsg({ t: 'option', qid: 1, index: 0, w: 120, h: 120, data: pic }));
  assert.equal(parseHostMsg({ t: 'option', qid: 1, index: 0, data: pic }), null, 'an option picture without its size');
});

test("the state passes as the host sent it, a blast's struck answers and all", () => {
  const was = { at: 1, itemId: 'x', mode: 'name', struck: [{ by: 'p1', index: 2, lives: 1, wards: 0 }] };
  const state = { players: [], settings: {}, question: { blast: { stick: 'p0', side: 1, was } } };
  assert.deepEqual(parseHostMsg({ t: 'state', state, now: 5 }), { t: 'state', state, now: 5 });
});

test('co-op actions pass; a blast names only its question; retired messages are no messages', () => {
  assert.deepEqual(parseClientMsg({ t: 'action', action: { type: 'vote', category: 'Rings' } }), { t: 'action', action: { type: 'vote', category: 'Rings' } });
  assert.deepEqual(parseClientMsg({ t: 'action', action: { type: 'revive', target: 'p2' } }), { t: 'action', action: { type: 'revive', target: 'p2' } });
  // Who set a blast off the host takes from the connection.
  assert.deepEqual(parseClientMsg({ t: 'action', action: { type: 'blast', askedAt: 42, by: 'p0' } }), { t: 'action', action: { type: 'blast', askedAt: 42 } });
  // No fuse is lit by anyone (14's host-only 'fuse' action is gone).
  assert.equal(parseClientMsg({ t: 'action', action: { type: 'fuse', askedAt: 42 } }), null);
  // The plain art the dynamite before it laid bare.
  assert.equal(parseHostMsg({ t: 'clean', qid: 5, w: 120, h: 160, data: new ArrayBuffer(8) }), null);
});

test('presence: a guest says only how it is, and the host lists only those not simply ready', () => {
  for (const p of ['here', 'idle', 'away']) assert.deepEqual(parseClientMsg({ t: 'presence', p }), { t: 'presence', p });
  for (const p of ['slow', 'gone', 1, null, undefined]) assert.equal(parseClientMsg({ t: 'presence', p }), null);
  assert.deepEqual({ ...(parseHostMsg({ t: 'standing', s: { a1: 'away', b2: 'slow', c3: 'idle' } }) as { s: object }).s }, { a1: 'away', b2: 'slow', c3: 'idle' });
  assert.deepEqual({ ...(parseHostMsg({ t: 'standing', s: {} }) as { s: object }).s }, {});
  assert.equal(parseHostMsg({ t: 'standing', s: { a1: 'here' } }), null);
  assert.equal(parseHostMsg({ t: 'standing', s: [] }), null);
  assert.equal(parseHostMsg({ t: 'standing', s: Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`p${i}`, 'away'])) }), null);
});

test("a host's state with a clock that isn't a time is dropped", () => {
  const state = { players: [], settings: {} };
  assert.ok(parseHostMsg({ t: 'state', state, now: 1790642896195 }));
  for (const now of [NaN, Infinity, -Infinity, '1'])
    assert.equal(parseHostMsg({ t: 'state', state, now }), null);
});

test("the host's challenge, and a hello's signature over it, pass only in shape", () => {
  const c = 'c'.repeat(22);
  assert.deepEqual(parseHostMsg({ t: 'hi', c }), { t: 'hi', c });
  assert.equal(parseHostMsg({ t: 'hi', c: '<script>' }), null);
  const hello = { t: 'hello', secret: 'abcdefghijklmnopqrstuvwxyz012345', name: 'Zoe Arcana', v: PROTOCOL_VERSION };
  assert.equal(parseClientMsg({ ...hello, owner: 's'.repeat(86) })?.t, 'hello');
  assert.equal(parseClientMsg({ ...hello, owner: 'x' }), null);
});
