import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aimIn, layout } from '../src/bot/reach.ts';
import { NAMES, identityOf } from '../src/bot/identities.ts';
import type { GameState } from '../src/lib/game.ts';

const players = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const choosing = { phase: 'choosing', players, offered: ['Rings', 'Belts', 'Flasks'] } as unknown as GameState;
const question = (mode: 'name' | 'art', n: number, tall = false) => ({ phase: 'question', players, offered: [], question: { mode, tall, labels: Array.from({ length: n }, (_, i) => `x${i}`) } }) as unknown as GameState;

const near = (a: readonly number[], b: readonly number[], by = 1) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= by);
const reveal = (mode: 'name' | 'art', n: number, tall = false) => ({ ...question(mode, n, tall), phase: 'reveal' }) as unknown as GameState;

test('the layout has what the screen shows: rows, then the cards or the art and answers', () => {
  const c = layout(choosing);
  assert.deepEqual([...c.keys()].sort(), ['card:0', 'card:1', 'card:2', 'row:0', 'row:1', 'row:2']);
  // As measured at a 1440p window: the cards side by side across the middle.
  assert.ok(near(c.get('card:0')!, [251, 241.8, 406.5, 659.4]) && near(c.get('card:2')!, [593.5, 241.8, 749, 659.4]), JSON.stringify([...c]));
  const q = layout(question('name', 6));
  assert.ok(q.has('art') && q.has('opt:5') && !q.has('opt:6'));
  // Answers stacked to the right of the art, and none overlapping.
  for (let i = 0; i < 5; i++) assert.ok(q.get(`opt:${i}`)![3] <= q.get(`opt:${i + 1}`)![1]);
  assert.ok(q.get('art')![2] < q.get('opt:0')![0]);
  assert.ok(near(q.get('opt:5')!, [508.3, 612.2, 754.5, 674]) && near(q.get('art')!, [246, 308.4, 491.2, 673]));
  // A question of pictures to pick from shows no art of its own; ten answers still fit.
  assert.ok(!layout(question('art', 6)).has('art'));
  assert.ok(layout(question('name', 10)).get('opt:9')![3] <= 1000);
});

test('more than six names go two to a row, as measured', () => {
  const q8 = layout(question('name', 8));
  assert.ok(near(q8.get('opt:0')!, [508.3, 241.8, 628.9, 328.1]) && near(q8.get('opt:1')!, [633.9, 241.8, 754.5, 328.1]) && near(q8.get('opt:7')!, [633.9, 530.1, 754.5, 616.4]));
  const q10 = layout(question('name', 10));
  assert.ok(near(q10.get('opt:9')!, [633.9, 549.4, 754.5, 616.4]), JSON.stringify(q10.get('opt:9')));
});

test('the pictures to pick from: in rows as wide as the column, a tall item\'s in one row', () => {
  assert.ok(near(layout(question('art', 4)).get('opt:3')!, [627.4, 320.6, 754, 576.5]));
  const six = layout(question('art', 6));
  assert.ok(near(six.get('opt:0')!, [246, 320.6, 415, 525.3]) && near(six.get('opt:5')!, [585, 526.4, 754, 731.1]), JSON.stringify([...six]));
  assert.ok(near(layout(question('art', 8)).get('opt:7')!, [627.4, 526.4, 754, 731.1]));
  assert.ok(near(layout(question('art', 10)).get('opt:9')!, [652.8, 526.4, 754, 731.1]));
  // Tall art (staves, bows): one row of tall tiles, up to eight; ten as any.
  assert.ok(near(layout(question('art', 6, true)).get('opt:5')!, [669.8, 320.6, 754, 730.1]));
  assert.ok(near(layout(question('art', 8, true)).get('opt:7')!, [691, 320.6, 754, 730.1]));
  assert.ok(near(layout(question('art', 10, true)).get('opt:9')!, [652.8, 526.4, 754, 731.1]));
});

test("the lobby has the party's rows two to a row and the three modes; a host's rows sit lower", () => {
  const lobby = { phase: 'lobby', players, hostId: 'a', offered: [] } as unknown as GameState;
  const guest = layout(lobby, 'b');
  const host = layout(lobby, 'a');
  assert.deepEqual([...guest.keys()].sort(), ['card:0', 'card:1', 'card:2', 'row:0', 'row:1', 'row:2']);
  assert.ok(near(guest.get('row:0')!, [188.3, 363.8, 300.5, 413.3]) && near(guest.get('row:1')!, [304.7, 363.8, 416.9, 413.3]) && near(guest.get('row:2')!, [188.3, 421.5, 300.5, 471]));
  assert.ok(near(host.get('row:0')!, [188.3, 411.1, 300.5, 460.7]));
  assert.ok(near(guest.get('card:0')!, [512.2, 153.9, 605.2, 248]) && near(host.get('card:2')!, [706.5, 153.9, 799.5, 248]));
});

test("at the end, the winner's circle and the standings down a column, best first", () => {
  const over = { phase: 'over', players: [{ id: 'a', score: 3 }, { id: 'b', score: 9 }, { id: 'c', score: 5 }], offered: [] } as unknown as GameState;
  const l = layout(over);
  assert.ok(l.has('art'));
  assert.ok(l.get('row:1')![1] < l.get('row:2')![1] && l.get('row:2')![1] < l.get('row:0')![1]);
  assert.ok(near(l.get('row:1')!, [387.7, 498.6, 612.3, 546]) && near(l.get('row:2')!, [387.7, 551.8, 612.3, 597.2], 2));
});
