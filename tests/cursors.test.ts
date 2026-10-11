import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pack } from 'peerjs-js-binarypack';
import {
  CursorOutbox,
  trailAt,
  GAME_ANCHOR,
  GAME_DEPTH,
  fromAnchor,
  toAnchor,
  MAX_ANCHOR,
  SCALE,
  SEND_EVERY_MS,
  anchorCode,
  anchorName,
  cursorKey,
  clickableFor,
  actionOf,
  litOf,
  MOUSE,
  PRESSED,
  cursorsLive,
  entryAt,
  parseCursorAt,
  parseCursorBatch,
  type CursorEntry,
} from '../src/lib/cursors.ts';
import { createGame, MAX_PLAYERS } from '../src/lib/game.ts';
import { FrameGuard, plausiblePack } from '../src/lib/guard.ts';
import { parseClientMsg, parseHostMsg } from '../src/lib/protocol.ts';
import { ART, type Art } from '../src/lib/pointerArt.ts';

const bytes = (m: unknown) => {
  const b = pack(m) as ArrayBuffer | Uint8Array;
  return b instanceof ArrayBuffer ? new Uint8Array(b) : b;
};

test('every anchor has a code of its own, and back', () => {
  const names = ['game', 'art', 'next', ...['opt', 'card', 'row'].flatMap((l) => Array.from({ length: 16 }, (_, i) => `${l}:${i}`))];
  const codes = names.map((n) => anchorCode(n));
  assert.equal(new Set(codes).size, names.length);
  for (const [i, n] of names.entries()) {
    assert.ok(codes[i] !== null && codes[i]! <= MAX_ANCHOR, n);
    assert.equal(anchorName(codes[i]!), n);
  }
  // A scoreboard row for every seat.
  assert.ok(MAX_PLAYERS <= 16);
  for (const n of ['', 'opt', 'opt:16', 'opt:-1', 'opt:01x', 'stage', 'row:1:2']) assert.equal(anchorCode(n), null, n);
  for (const c of [3, 15, MAX_ANCHOR + 1, -1]) assert.equal(anchorName(c), null, String(c));
});

test('a pointer from a guest is checked like any message', () => {
  assert.deepEqual(parseClientMsg({ t: 'cursor', at: [16, 0, SCALE, 0] }), { t: 'cursor', at: [16, 0, SCALE, 0] });
  assert.deepEqual(parseClientMsg({ t: 'cursor', at: [0, 500, 500, 1] }), { t: 'cursor', at: [0, 500, 500, 1] });
  // The button held.
  assert.deepEqual(parseClientMsg({ t: 'cursor', at: [16, 1, 2, 2] }), { t: 'cursor', at: [16, 1, 2, 2] });
  // Over something its player can click, held or not.
  assert.deepEqual(parseClientMsg({ t: 'cursor', at: [16, 1, 2, 5] }), { t: 'cursor', at: [16, 1, 2, 5] });
  assert.deepEqual([actionOf(5), litOf(5), actionOf(3), litOf(2)], [PRESSED, true, MOUSE, false]);
  assert.deepEqual(parseClientMsg({ t: 'cursor', at: null }), { t: 'cursor', at: null });
  const bad = [
    undefined,
    [16, 0, 0],
    [16, 0, 0, 0, 0],
    [3, 0, 0, 0], // no such anchor
    [MAX_ANCHOR + 1, 0, 0, 0],
    [16, -5 * SCALE - 1, 0, 0],
    [16, 0, 5 * SCALE + 1, 0],
    [0, -1, 0, 0],
    [0, SCALE + 1, 0, 0],
    [16, 0.5, 0, 0],
    [16, 0, 0, 6],
    [16, 0, 0, -1],
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

test('pointers show in the lobby, in turns and Delve and at the end, never while players race for the same answer', () => {
  const s = createGame('a');
  assert.equal(cursorsLive(null), false);
  assert.equal(cursorsLive(s), true, 'lobby');
  // The lobby has nothing to give away, whatever the mode.
  assert.equal(cursorsLive({ ...s, settings: { ...s.settings, mode: 'race' } }), true, 'lobby, race picked');
  for (const phase of ['choosing', 'question', 'reveal'] as const) assert.equal(cursorsLive({ ...s, phase }), true, phase);
  // The end of a game, whatever the mode: the winners are crowned together.
  assert.equal(cursorsLive({ ...s, phase: 'over' }), true);
  assert.equal(cursorsLive({ ...s, phase: 'over', settings: { ...s.settings, mode: 'race' } }), true);
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
  // A click quicker than a batch: the press goes, then the letting go, in the batch after (over a button, as over anything).
  box.put(['b', 16, 5, 5, 3], ['g1']);
  box.put(['b', 16, 5, 5, 5], ['g1']);
  box.put(['b', 16, 5, 5, 3], ['g1']);
  assert.deepEqual(box.take('g1'), [['b', 16, 5, 5, 5]]);
  assert.deepEqual(box.take('g1'), [['b', 16, 5, 5, 3]]);
  box.put(['a', 16, 5, 5, 0], ['g1']);
  box.put(['a', 16, 5, 5, 2], ['g1']);
  box.put(['a', 16, 6, 5, 0], ['g1']);
  box.put(['a', 16, 9, 5, 0], ['g1']);
  assert.deepEqual(box.take('g1'), [['a', 16, 5, 5, 2]]);
  assert.ok(box.waiting);
  assert.deepEqual(box.take('g1'), [['a', 16, 9, 5, 0]]);
  assert.equal(box.waiting, false);
  // Held down a while, it moves pressed: the newest of that.
  box.put(['a', 16, 1, 1, 2], ['g1']);
  box.put(['a', 16, 2, 2, 2], ['g1']);
  assert.deepEqual(box.take('g1'), [['a', 16, 2, 2, 2]]);
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

test("every cursor's picture fits its image, the hot spot inside it", () => {
  for (const [name, art] of Object.entries(ART) as [string, Art][]) {
    const [w, h] = art.size;
    assert.ok(art.hot[0] >= 0 && art.hot[0] <= w && art.hot[1] >= 0 && art.hot[1] <= h, name);
    // Browsers drop (or misplace near the edges) cursors over 32 px.
    assert.ok(w <= 32 && h <= 32, name);
    const ds = [art.ground, ...art.lines.map((l) => l.d)].join(' ');
    // Every point (written with two decimals, lib/arcane.ts; an arc's flags are bare digits), with room for the dark rim (1.5 px) round it.
    for (const [, x, y] of ds.matchAll(/(-?\d+\.\d+) (-?\d+\.\d+)/g)) {
      const [px, py] = [Number(x) + art.hot[0], Number(y) + art.hot[1]];
      assert.ok(px >= 1.5 && px <= w - 1.5 && py >= 1.5 && py <= h - 1.5, `${name}: ${x} ${y}`);
    }
  }
});

test('a pointer on the game as a whole holds still while the game grows or shrinks below it', () => {
  const screenH = 800;
  const before = { left: 0, top: 60, width: 1200, height: 900 };
  // Cards dealt, a question come in: the game is taller now, its top where it was.
  const after = { ...before, height: 1500 };
  const at = toAnchor(GAME_ANCHOR, 300, 500, before, screenH);
  assert.deepEqual(fromAnchor(GAME_ANCHOR, ...at, after, screenH), fromAnchor(GAME_ANCHOR, ...at, before, screenH));
  assert.deepEqual(fromAnchor(GAME_ANCHOR, ...at, before, screenH).map(Math.round), [300, 500]);
  // Further down than a screen is fine, up to GAME_DEPTH screens.
  const deep = toAnchor(GAME_ANCHOR, 10, 60 + 2.5 * screenH, { ...before, height: 4000 }, screenH);
  assert.equal(deep[1], 2500);
  assert.deepEqual(parseCursorAt([GAME_ANCHOR, 10, GAME_DEPTH * SCALE, 0]), [GAME_ANCHOR, 10, GAME_DEPTH * SCALE, 0]);
  assert.equal(parseCursorAt([GAME_ANCHOR, 10, GAME_DEPTH * SCALE + 1, 0]), undefined);
  // Anything else goes by its own box: a player's on it; a bot's may lie off it, as far as four times its size.
  const card = anchorCode('card:1')!;
  assert.deepEqual(toAnchor(card, 150, 75, { left: 100, top: 50, width: 100, height: 50 }, screenH), [500, 500]);
  assert.deepEqual(parseCursorAt([card, -400, SCALE + 600, 0]), [card, -400, SCALE + 600, 0]);
  assert.deepEqual(parseCursorAt([card, -3000, 4200, 0]), [card, -3000, 4200, 0]);
  assert.equal(parseCursorAt([card, 10, 5 * SCALE + 1, 0]), undefined);
});

test('a pointer is drawn along a curve through where it was heard to be, held at both ends', () => {
  const ps: [number, number][] = [[0, 0], [100, 0], [100, 100], [0, 100]];
  const ts = [0, 100, 200, 300];
  assert.deepEqual(trailAt(ps, ts, -50), [0, 0]);
  assert.deepEqual(trailAt(ps, ts, 400), [0, 100]);
  // Through every place, at its time.
  for (let i = 0; i < 4; i++) assert.deepEqual(trailAt(ps, ts, ts[i]).map((v) => Math.round(v * 1e6) / 1e6), ps[i]);
  // Round the corner rather than into it: between two places it bulges out past the straight line.
  const [x] = trailAt(ps, ts, 150);
  assert.ok(x > 100, `${x}`);
  assert.deepEqual(trailAt([], [], 5), [0, 0]);
});

test("a pointer over something shows whether its player can click it: their answers, their cards, Next on their turn or in their room", () => {
  const base = createGame('a');
  const s = { ...base, players: [{ ...base.players[0] }, { ...base.players[0], id: 'b' }, { ...base.players[0], id: 'c' }], turn: 1 };
  assert.equal(clickableFor({ ...s, phase: 'question' }, 'b', 'opt:2'), true);
  assert.equal(clickableFor({ ...s, phase: 'question' }, 'c', 'opt:2'), false);
  assert.equal(clickableFor({ ...s, phase: 'reveal' }, 'b', 'opt:2'), false);
  assert.equal(clickableFor({ ...s, phase: 'choosing' }, 'b', 'card:0'), true);
  assert.equal(clickableFor({ ...s, phase: 'choosing' }, 'a', 'card:0'), false);
  // Next: the one whose turn it was, or the host; nobody else.
  assert.equal(clickableFor({ ...s, phase: 'reveal' }, 'b', 'next'), true);
  assert.equal(clickableFor({ ...s, phase: 'reveal' }, 'a', 'next'), true);
  assert.equal(clickableFor({ ...s, phase: 'reveal' }, 'c', 'next'), false);
  // In the lobby only the host picks the mode.
  assert.equal(clickableFor({ ...s, phase: 'lobby' }, 'a', 'card:1'), true);
  assert.equal(clickableFor({ ...s, phase: 'lobby' }, 'c', 'card:1'), false);
  // Delve together: everyone standing answers.
  const group = { ...s, phase: 'question' as const, delve: { entrants: ['a', 'b', 'c'] } as unknown as NonNullable<typeof s.delve> };
  assert.equal(clickableFor(group, 'c', 'opt:0'), true);
  // Not a button at all.
  assert.equal(clickableFor({ ...s, phase: 'question' }, 'c', 'row:1'), null);
  assert.equal(clickableFor({ ...s, phase: 'question' }, 'c', 'game'), null);
});
