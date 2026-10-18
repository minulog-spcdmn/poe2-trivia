import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pack } from 'peerjs-js-binarypack';
import {
  CursorOutbox,
  moveOn,
  trailAt,
  GAME_ANCHOR,
  GAME_DEPTH,
  fromAnchor,
  toAnchor,
  MAX_ANCHOR,
  SCALE,
  SEND_EVERY_MS,
  POINTER_BURST,
  POINTER_RATE,
  anchorCode,
  anchorName,
  cursorAt,
  hopsOf,
  SINGLE_ANCHORS,
  MAX_HOPS,
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
  OFF,
  type CursorAt,
  type CursorEntry,
} from '../src/lib/cursors.ts';
import { createGame, MAX_PLAYERS } from '../src/lib/game.ts';
import { FrameGuard, plausiblePack } from '../src/lib/guard.ts';
import { RateLimit, parseClientMsg, parseHostMsg } from '../src/lib/protocol.ts';
import { ART, type Art } from '../src/lib/pointerArt.ts';

const bytes = (m: Parameters<typeof pack>[0]) => {
  const b = pack(m) as ArrayBuffer | Uint8Array;
  return b instanceof ArrayBuffer ? new Uint8Array(b) : b;
};

test('every anchor has a code of its own, and back', () => {
  const names = [...SINGLE_ANCHORS, ...['opt', 'card', 'row'].flatMap((l) => Array.from({ length: 16 }, (_, i) => `${l}:${i}`))];
  const codes = names.map((n) => anchorCode(n));
  assert.equal(new Set(codes).size, names.length);
  for (const [i, n] of names.entries()) {
    assert.ok(codes[i] !== null && codes[i]! <= MAX_ANCHOR, n);
    assert.equal(anchorName(codes[i]!), n);
  }
  // The first ones keep their codes, as recorded hands have them.
  assert.deepEqual(['game', 'art', 'next', 'opt:0', 'card:0', 'row:0'].map(anchorCode), [0, 1, 2, 16, 32, 48]);
  // Every code is one byte on the wire.
  assert.ok(MAX_ANCHOR < 128);
  // A scoreboard row for every seat.
  assert.ok(MAX_PLAYERS <= 16);
  for (const n of ['', 'opt', 'opt:16', 'opt:-1', 'opt:01x', 'stage', 'row:1:2', 'toString', '__proto__']) assert.equal(anchorCode(n), null, n);
  for (const c of [3, 15, MAX_ANCHOR + 1, -1]) assert.equal(anchorName(c), null, String(c));
});

test('every anchor on the page is one there is', () => {
  const used = new Set<string>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith('.svelte')) for (const [, v] of readFileSync(path, 'utf8').matchAll(/data-cursor="([^"]*)"/g)) used.add(v);
    }
  };
  walk('src');
  // A list's index is written as an expression ({i}); PeerCursors looks them up by name (${name}).
  const names = [...used].filter((v) => v !== '${name}').map((v) => v.replace(/\{.*\}$/, '0'));
  assert.ok(names.length > 40, `${names.length} anchors`);
  for (const n of names) assert.notEqual(anchorCode(n), null, n);
});

test("a pointer goes with the anchors round its own, innermost first, and back", () => {
  const at = cursorAt([[anchorCode('lock')!, 500, 600], [anchorCode('access')!, 900, 400], [GAME_ANCHOR, 300, 200]], 3);
  assert.deepEqual(at, [anchorCode('lock'), 500, 600, 3, anchorCode('access'), 900, 400, GAME_ANCHOR, 300, 200]);
  assert.deepEqual(hopsOf(at), [[anchorCode('lock'), 500, 600], [anchorCode('access'), 900, 400], [GAME_ANCHOR, 300, 200]]);
  assert.deepEqual(parseCursorAt(at), at);
  // One anchor alone, as a bot sends it, is as it was.
  assert.deepEqual(cursorAt([[16, 1, 2]], 0), [16, 1, 2, 0]);
  assert.deepEqual(hopsOf([16, 1, 2, 0]), [[16, 1, 2]]);
  // Never more than MAX_HOPS.
  assert.equal(hopsOf(cursorAt(Array.from({ length: 5 }, () => [16, 1, 2]), 0)).length, MAX_HOPS);
  // In a batch, as from a guest.
  assert.deepEqual(entryAt(['abcdefgh', ...at]), at);
  assert.deepEqual(parseCursorBatch([['abcdefgh', ...at]]), [['abcdefgh', ...at]]);
  // Every anchor checked, as the first is.
  for (const bad of [
    [16, 1, 2, 0, 3, 0, 0], // no such anchor
    [16, 1, 2, 0, 16, 1], // half a spot
    [16, 1, 2, 0, GAME_ANCHOR, SCALE + 1, 0],
    [16, 1, 2, 0, 17, 5 * SCALE + 1, 0],
    [16, 1, 2, 0, 17, 0.5, 0],
    [16, 1, 2, 0, 16, 1, 2, 16, 1, 2, 16, 1, 2], // too many
  ])
    assert.equal(parseCursorAt(bad), undefined, JSON.stringify(bad));
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
  for (const bad of [null, {}, [[1]], [['x', 16, 10]], [['x', 3, 0, 0, 0]], [['x'.repeat(17)]], Array.from({ length: 33 }, () => ['x'])])
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
  // As far as a pointer goes: off its own anchor, with two more round it.
  const far: CursorAt = [anchorCode('lock')!, -OFF, SCALE + OFF, 5, anchorCode('access')!, SCALE, SCALE, GAME_ANCHOR, SCALE, GAME_DEPTH * SCALE];
  assert.deepEqual(parseCursorAt(far), far);
  const one = bytes({ t: 'cursor', at: far });
  assert.ok(plausiblePack(one));
  assert.ok(one.length <= 40, `${one.length} bytes`);
  // What every guest is sent twenty times a second at most, when all the others moved.
  const batch = bytes({ t: 'cursors', c: Array.from({ length: MAX_PLAYERS - 1 }, (_, i) => [cursorKey(`player${i}abcd`), ...far]) });
  assert.ok(batch.length <= 520, `${batch.length} bytes`);

  // A pointer at full speed, clicking ten times a second beside a key held down, for a minute:
  // never a flood, and no press or release dropped.
  let t = 0;
  const g = new FrameGuard(() => t);
  const pointer = new RateLimit(POINTER_RATE, POINTER_BURST, () => t);
  const answer = bytes({ t: 'action', action: { type: 'answer', index: 1, askedAt: 1 } });
  for (let i = 0; t < 60_000; t += SEND_EVERY_MS, i++) {
    const sent = i % 2 ? [one] : [one, one, one];
    for (const m of sent) {
      assert.equal(g.check(m), 'ok');
      assert.ok(pointer.take(), `pointer at ${t} ms`);
    }
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

test('a pointer drawn on another screen: a quick move is followed, a jump held', () => {
  // At sixty frames a second, drawn as PeerCursors.svelte draws it: gliding after its place, which it trails the
  // further the quicker it goes.
  const FRAME = 1000 / 60;
  const glide = (dt: number) => 1 - Math.exp(-dt / 35);
  const run = (place: (t: number) => [number, number, number], ms: number, dt = () => FRAME) => {
    let [px, py, code] = place(0);
    const was = { px, py, qx: px, qy: py, pdt: 0, code };
    let x = px;
    let y = py;
    let jumps = 0;
    for (let t = 0; t < ms; ) {
      const d = dt();
      t += d;
      [px, py, code] = place(t);
      if (moveOn(was, px, py, code, d)) jumps++;
      x += (px - x) * glide(d);
      y += (py - y) * glide(d);
    }
    return { jumps, lag: Math.hypot(px - x, py - y) };
  };
  // A quick reach (a flick, 8 px a ms at its peak, eased in and out), on one element and then onto another.
  const reach = (t: number): [number, number, number] => {
    const k = Math.min(1, t / 300);
    const e = k * k * (3 - 2 * k);
    return [100 + 1600 * e, 500, e < 0.8 ? 16 : 17];
  };
  assert.equal(run(reach, 600).jumps, 0);
  // Its place put onto another element 60 px apart on this screen, at rest: a jump; 20 px apart, not.
  assert.equal(run((t) => (t < 200 ? [500, 500, 16] : [560, 500, 17]), 400).jumps, 1);
  assert.equal(run((t) => (t < 200 ? [500, 500, 16] : [520, 500, 17]), 400).jumps, 0);
  // Leaping on the same element (made anew elsewhere): a jump.
  assert.equal(run((t) => (t < 200 ? [500, 500, 16] : [900, 500, 16]), 400).jumps, 1);
  // Across a frame long in coming (a tab held up), it can't be told: none.
  let n = 0;
  assert.equal(run((t) => (t < 230 ? [500, 500, 16] : [900, 500, 16]), 800, () => (++n === 14 ? 400 : FRAME)).jumps, 0);
  // A frame at no time gone by (the drawing loop begun anew), then a quick move onto another element: followed.
  let m = 0;
  assert.equal(run(reach, 600, () => (++m === 13 ? 0 : FRAME)).jumps, 0);
  // Just come in (nothing to tell its way by), a quick step onto another element: followed; a leap: held.
  const fresh = { px: 500, py: 500, qx: 500, qy: 500, pdt: 0, code: 16 };
  assert.equal(moveOn({ ...fresh }, 570, 500, 17, FRAME), false);
  assert.equal(moveOn({ ...fresh }, 700, 500, 17, FRAME), true);
});
