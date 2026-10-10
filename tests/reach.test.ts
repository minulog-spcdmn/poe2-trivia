import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aimIn, layout } from '../src/bot/reach.ts';
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

test('on a reveal the button that moves on sits under it all, at the right, as measured', () => {
  const reveal = (mode: 'name' | 'art', n: number) => ({ ...question(mode, n), phase: 'reveal' }) as unknown as GameState;
  const near = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]) <= 4);
  assert.ok(!layout(question('name', 6)).has('next'));
  assert.ok(near(layout(reveal('name', 6)).get('next')!, [759, 822, 844, 867]));
  const art = layout(reveal('art', 6));
  assert.ok(near(art.get('next')!, [759, 872, 844, 917]), JSON.stringify(art.get('next')));
  // The pictures to pick from, under the name to find: as measured with six.
  assert.ok(near(art.get('opt:0')!, [153, 379, 382, 601]) && near(art.get('opt:5')!, [615, 602, 843, 824]), JSON.stringify([...art]));
});

test("at the end, the winner's circle and the standings down a column, best first", () => {
  const over = { phase: 'over', players: [{ id: 'a', score: 3 }, { id: 'b', score: 9 }, { id: 'c', score: 5 }], offered: [] } as unknown as GameState;
  const l = layout(over);
  assert.ok(l.has('art'));
  assert.ok(l.get('row:1')![1] < l.get('row:2')![1] && l.get('row:2')![1] < l.get('row:0')![1]);
  assert.deepEqual(l.get('row:1'), [348, 541, 652, 591]);
});
