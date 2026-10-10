import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pack } from 'peerjs-js-binarypack';
import {
  CursorOutbox,
  MAX_ANCHOR,
  SCALE,
  SEND_EVERY_MS,
  anchorCode,
  anchorName,
  cursorKey,
  cursorsLive,
  entryAt,
  parseCursorAt,
  parseCursorBatch,
  type CursorEntry,
} from '../src/lib/cursors.ts';
import { createGame, MAX_PLAYERS } from '../src/lib/game.ts';
import { FrameGuard, plausiblePack } from '../src/lib/guard.ts';
import { parseClientMsg, parseHostMsg } from '../src/lib/protocol.ts';

const bytes = (m: unknown) => {
  const b = pack(m) as ArrayBuffer | Uint8Array;
  return b instanceof ArrayBuffer ? new Uint8Array(b) : b;
};

test('every anchor has a code of its own, and back', () => {
  const names = ['game', 'art', ...['opt', 'card', 'row'].flatMap((l) => Array.from({ length: 16 }, (_, i) => `${l}:${i}`))];
  const codes = names.map((n) => anchorCode(n));
  assert.equal(new Set(codes).size, names.length);
  for (const [i, n] of names.entries()) {
    assert.ok(codes[i] !== null && codes[i]! <= MAX_ANCHOR, n);
    assert.equal(anchorName(codes[i]!), n);
  }
  // A scoreboard row for every seat.
  assert.ok(MAX_PLAYERS <= 16);
  for (const n of ['', 'opt', 'opt:16', 'opt:-1', 'opt:01x', 'stage', 'row:1:2']) assert.equal(anchorCode(n), null, n);
  for (const c of [2, 15, MAX_ANCHOR + 1, -1]) assert.equal(anchorName(c), null, String(c));
});

test('a pointer from a guest is checked like any message', () => {
  assert.deepEqual(parseClientMsg({ t: 'cursor', at: [16, 0, SCALE, 0] }), { t: 'cursor', at: [16, 0, SCALE, 0] });
  assert.deepEqual(parseClientMsg({ t: 'cursor', at: [0, 500, 500, 1] }), { t: 'cursor', at: [0, 500, 500, 1] });
  assert.deepEqual(parseClientMsg({ t: 'cursor', at: null }), { t: 'cursor', at: null });
  const bad = [
    undefined,
    [16, 0, 0],
    [16, 0, 0, 0, 0],
    [2, 0, 0, 0], // no such anchor
    [MAX_ANCHOR + 1, 0, 0, 0],
    [16, -1, 0, 0],
    [16, 0, SCALE + 1, 0],
    [16, 0.5, 0, 0],
    [16, 0, 0, 2],
    [16, '1', 0, 0],
    { 0: 16 },
  ];
  for (const at of bad) assert.equal(parseClientMsg({ t: 'cursor', at }), null, JSON.stringify(at));
  assert.equal(parseCursorAt([16, 0, 0, true]), undefined);
});

test("a host's batch is checked, and read back", () => {
  const c: CursorEntry[] = [['abcdefgh', 16, 10, 20, 0], ['ijklmnop']];
  assert.deepEqual(parseHostMsg({ t: 'cursors', c }), { t: 'cursors', c });
  assert.deepEqual(entryAt(c[0]), [16, 10, 20, 0]);
  assert.equal(entryAt(c[1]), null);
  for (const bad of [null, {}, [[1]], [['x', 16, 10]], [['x', 99, 0, 0, 0]], [['x'.repeat(17)]], Array.from({ length: 33 }, () => ['x'])])
    assert.equal(parseCursorBatch(bad), null, JSON.stringify(bad));
});

test('pointers show in turns and Delve, never while players race for the same answer', () => {
  const s = createGame('a');
  assert.equal(cursorsLive(null), false);
  assert.equal(cursorsLive(s), false, 'lobby');
  for (const phase of ['choosing', 'question', 'reveal'] as const) assert.equal(cursorsLive({ ...s, phase }), true, phase);
  assert.equal(cursorsLive({ ...s, phase: 'over' }), false);
  assert.equal(cursorsLive({ ...s, phase: 'question', settings: { ...s.settings, mode: 'delve' } }), true);
  assert.equal(cursorsLive({ ...s, phase: 'choosing', settings: { ...s.settings, mode: 'race' } }), false);
  const dm = { ...s, deathmatch: {} as NonNullable<typeof s.deathmatch> };
  assert.equal(cursorsLive({ ...dm, phase: 'question' }), false);
  assert.equal(cursorsLive({ ...dm, phase: 'reveal' }), true);
});

test('the outbox keeps only the newest of each pointer, for each guest', () => {
  const box = new CursorOutbox<string>();
  assert.equal(box.waiting, false);
  box.put(['a', 16, 1, 1, 0], ['g1', 'g2']);
  box.put(['a', 16, 2, 2, 0], ['g1', 'g2']);
  box.put(['b', 17, 3, 3, 0], ['g1']);
  assert.ok(box.waiting);
  assert.deepEqual(box.take('g1'), [['a', 16, 2, 2, 0], ['b', 17, 3, 3, 0]]);
  assert.equal(box.take('g1'), null);
  // Held back (a busy link): what comes meanwhile replaces it.
  box.put(['a'], ['g2']);
  assert.deepEqual(box.take('g2'), [['a']]);
  box.put(['a', 16, 1, 1, 0], ['g3']);
  box.drop('g3');
  assert.equal(box.waiting, false);
});

test('a full room of moving pointers stays small, and within the frame budget', () => {
  const key = cursorKey('Xq3vB9kLm2Pz');
  assert.equal(key.length, 8);
  const one = bytes({ t: 'cursor', at: [anchorCode('row:11'), SCALE, SCALE, 0] });
  assert.ok(plausiblePack(one));
  assert.ok(one.length <= 32, `${one.length} bytes`);
  // What every guest is sent ten times a second at most, when all the others moved.
  const batch = bytes({ t: 'cursors', c: Array.from({ length: MAX_PLAYERS - 1 }, (_, i) => [cursorKey(`player${i}abcd`), 47, 999, 999, 0]) });
  assert.ok(batch.length <= 240, `${batch.length} bytes`);

  // A pointer at full speed beside a key held down, for a minute: never a flood.
  let t = 0;
  const g = new FrameGuard(() => t);
  const answer = bytes({ t: 'action', action: { type: 'answer', index: 1, askedAt: 1 } });
  for (; t < 60_000; t += SEND_EVERY_MS) {
    assert.equal(g.check(one), 'ok');
    assert.equal(g.check(answer), 'ok');
  }
});
