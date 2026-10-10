import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aimIn, along, layout, placeOf, reachTime, stroke } from '../src/bot/reach.ts';
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
    assert.ok(p.x >= 300 && p.x <= 700 && p.y >= 300 && p.y <= 700, JSON.stringify(p));
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
