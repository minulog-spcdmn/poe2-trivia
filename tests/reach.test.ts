import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aimIn, along, layout, placeOf, reach, reachTime, stroke, sweep, sweepTime, veer } from '../src/bot/reach.ts';
import { NAMES, identityOf } from '../src/bot/identities.ts';
import type { GameState } from '../src/lib/game.ts';

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

const players = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const choosing = { phase: 'choosing', players, offered: ['Rings', 'Belts', 'Flasks'] } as unknown as GameState;
const question = (mode: 'name' | 'art', n: number) => ({ phase: 'question', players, offered: [], question: { mode, labels: Array.from({ length: n }, (_, i) => `x${i}`) } }) as unknown as GameState;

test('the layout has what the screen shows: rows, then the cards or the art and answers', () => {
  const c = layout(choosing);
  assert.deepEqual([...c.keys()].sort(), ['card:0', 'card:1', 'card:2', 'row:0', 'row:1', 'row:2']);
  // As measured on a desktop: the cards side by side across the middle.
  assert.ok(c.get('card:0')![2] < c.get('card:1')![0] && c.get('card:1')![2] < c.get('card:2')![0]);
  const q = layout(question('name', 6));
  assert.ok(q.has('art') && q.has('opt:5') && !q.has('opt:6'));
  // Answers stacked to the right of the art, and none overlapping.
  for (let i = 0; i < 5; i++) assert.ok(q.get(`opt:${i}`)![3] <= q.get(`opt:${i + 1}`)![1]);
  assert.ok(q.get('art')![2] < q.get('opt:0')![0]);
  // A question of pictures to pick from shows no art of its own; ten answers still fit.
  assert.ok(!layout(question('art', 6)).has('art'));
  assert.ok(layout(question('name', 10)).get('opt:9')![3] <= 1000);
});

test("a spot lands on the anchor the hand went to, in that anchor's terms, else on the game", () => {
  const c = layout(choosing);
  const rng = seeded(3);
  for (let i = 0; i < 3; i++) {
    const spot = aimIn(c.get(`card:${i}`)!, rng);
    const p = placeOf(spot, c, `card:${i}`);
    assert.equal(p.anchor, `card:${i}`);
    // Around the middle across, a little below it down (as a recorded hand clicked).
    assert.ok(p.x >= 300 && p.x <= 750 && p.y >= 400 && p.y <= 780, JSON.stringify(p));
    // Only over it by chance (cards may still be flying in on the others' screens): the game as a whole.
    assert.equal(placeOf(spot, c).anchor, 'game');
    // Gone from where it went: the game too.
    assert.equal(placeOf({ x: 20, y: 950 }, c, `card:${i}`).anchor, 'game');
  }
  assert.deepEqual(placeOf({ x: 20, y: 950 }, c), { anchor: 'game', x: 20, y: 950 });
  assert.deepEqual(placeOf({ x: -5, y: 1200 }, c), { anchor: 'game', x: 0, y: 1000 });
});

test('a hand takes longer the further it goes and the smaller the target, and by its pace', () => {
  const mid = () => 0.5;
  assert.ok(reachTime(600, 70, 1, mid) > reachTime(100, 70, 1, mid));
  assert.ok(reachTime(400, 30, 1, mid) > reachTime(400, 150, 1, mid));
  assert.ok(reachTime(400, 70, 1.3, mid) > reachTime(400, 70, 0.8, mid));
  const t = reachTime(400, 70, 1, mid);
  assert.ok(t > 300 && t < 900, `${t}`);
});

test('a stroke starts and ends where it should, quick in the middle and slow at the ends', () => {
  const s = stroke({ x: 100, y: 100 }, { x: 700, y: 500 }, 1000, 600, seeded(9));
  assert.deepEqual(along(s, 900), { x: 100, y: 100 });
  const end = along(s, 1700);
  assert.ok(Math.abs(end.x - 700) < 1e-9 && Math.abs(end.y - 500) < 1e-9);
  const d = (a: number, b: number) => {
    const p = along(s, a);
    const q = along(s, b);
    return Math.hypot(q.x - p.x, q.y - p.y);
  };
  assert.ok(d(1270, 1330) > 3 * d(1000, 1060) && d(1270, 1330) > 3 * d(1540, 1600));
});

test('about one in four plays on a phone, always the same ones', () => {
  const touch = NAMES.filter((n) => identityOf(n, ['A']).persona.touch);
  assert.ok(touch.length > NAMES.length * 0.12 && touch.length < NAMES.length * 0.4, `${touch.length}`);
  assert.deepEqual(touch, NAMES.filter((n) => identityOf(n, ['A']).persona.touch));
});

test("the lobby has the party's rows down a column and the three modes; a host's sits lower", () => {
  const lobby = { phase: 'lobby', players, hostId: 'a', offered: [] } as unknown as GameState;
  const guest = layout(lobby, 'b');
  const host = layout(lobby, 'a');
  assert.deepEqual([...guest.keys()].sort(), ['card:0', 'card:1', 'card:2', 'row:0', 'row:1', 'row:2']);
  for (let i = 0; i < 2; i++) assert.ok(guest.get(`row:${i}`)![3] <= guest.get(`row:${i + 1}`)![1]);
  assert.ok(guest.get('card:0')![2] < guest.get('card:1')![0]);
  assert.equal(host.get('row:0')![1] - guest.get('row:0')![1], host.get('card:0')![1] - guest.get('card:0')![1]);
  assert.ok(host.get('row:0')![1] > guest.get('row:0')![1]);
});

test('a long reach misses a little and corrects, ending right on its target; a short one goes straight there', () => {
  let lifted = 0;
  for (let seed = 1; seed < 200; seed++) {
    const rng = seeded(seed);
    const from = { x: 100, y: 800 };
    const to = { x: 700, y: 300 };
    const strokes = reach(from, to, 1000, 700, rng);
    assert.ok(strokes.length === 2 || strokes.length === 3, `${strokes.length}`);
    // A long way across, now and then it stalls partway (the mouse lifted and set down): three strokes, a pause between.
    if (strokes.length === 3) lifted++;
    // Each starts where the last ended, never before it; the last but one ends near the target, but not on it; the last lands on it.
    for (let i = 1; i < strokes.length; i++) {
      assert.ok(strokes[i].start >= strokes[i - 1].end);
      assert.deepEqual(along(strokes[i], strokes[i].start), along(strokes[i - 1], strokes[i - 1].end));
    }
    const miss = along(strokes.at(-2)!, strokes.at(-2)!.end);
    const off = Math.hypot(miss.x - to.x, miss.y - to.y);
    assert.ok(off > 0 && off < 70, `${off}`);
    const end = along(strokes.at(-1)!, strokes.at(-1)!.end);
    assert.ok(Math.abs(end.x - to.x) < 1e-9 && Math.abs(end.y - to.y) < 1e-9);
  }
  assert.ok(lifted > 10 && lifted < 70, `${lifted}`);
  assert.equal(reach({ x: 100, y: 100 }, { x: 150, y: 120 }, 0, 300, seeded(1)).length, 1);
});

test('a change of mind sets off for one, veers off partway, and lands on the other', () => {
  const s = veer({ x: 100, y: 100 }, { x: 800, y: 300 }, { x: 600, y: 700 }, 0, 900, seeded(4));
  const turn = along(s[0], s[0].end);
  // Partway toward the decoy, then on to the target.
  assert.ok(turn.x > 300 && turn.x < 650 && turn.y < 300, JSON.stringify(turn));
  const end = along(s.at(-1)!, s.at(-1)!.end);
  assert.ok(Math.abs(end.x - 600) < 1e-9 && Math.abs(end.y - 700) < 1e-9);
});

test('a sweep runs through every spot on its way without stopping, quickest midway, and ends on the last', () => {
  const from = { x: 500, y: 300 };
  const spots = [{ x: 560, y: 400 }, { x: 540, y: 500 }, { x: 570, y: 600 }];
  const ms = sweepTime(from, spots, 0.45);
  // About 300 units down a 900 high screen, at 0.45 px a millisecond: well over half a second.
  assert.ok(ms > 600 && ms < 900, `${ms}`);
  const s = sweep(from, spots, 1000, ms);
  assert.deepEqual(along(s, 900), from);
  assert.deepEqual(along(s, 1000 + ms + 5), spots[2]);
  const ps = Array.from({ length: 41 }, (_, i) => along(s, 1000 + (ms * i) / 40));
  // Through each spot (near enough, sampled), and moving at every step but the ends.
  for (const p of spots) assert.ok(ps.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 12), JSON.stringify(p));
  const steps = ps.slice(1).map((p, i) => Math.hypot(p.x - ps[i].x, p.y - ps[i].y));
  assert.ok(steps.slice(3, -3).every((d) => d > 0.5), JSON.stringify(steps));
  assert.ok(steps[20] > 3 * steps[0] && steps[20] > 3 * steps[39]);
});

test('reaches take as long as a recorded hand took: Fitts, widely spread, slow now and then', () => {
  const rng = seeded(4);
  const ts = Array.from({ length: 2000 }, () => reachTime(300, 100, 1, rng)).sort((a, b) => a - b);
  // log2(1 + 3) = 2 bits: about 630 ms as fitted; the middle half from about 470 to 760.
  const q = (f: number) => ts[Math.floor(ts.length * f)];
  assert.ok(q(0.5) > 540 && q(0.5) < 660, `${q(0.5)}`);
  assert.ok(q(0.25) > 400 && q(0.75) < 820 && q(0.75) - q(0.25) > 200, `${q(0.25)} ${q(0.75)}`);
  assert.ok(ts[0] >= 370 && ts.at(-1)! <= 950);
});
