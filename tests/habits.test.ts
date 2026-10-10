import { test } from 'node:test';
import assert from 'node:assert/strict';
import { circle, fidgets, readCards, readQuestion, restSpot, rollHandStyle, type HandStyle, type Hands } from '../src/bot/habits.ts';
import { NAMES, identityOf } from '../src/bot/identities.ts';
import type { Box } from '../src/bot/reach.ts';

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

const options = Array.from({ length: 6 }, (_, i) => `opt:${i}`);
const boxes: Box[] = options.map((_, i) => [511, 306 + i * 80, 844, 374 + i * 80]);
const hands = (habit: HandStyle['habit'], rest: HandStyle['rest'] = 'side'): Hands => ({ style: { habit, deft: 0.5, curve: 0.5, rest }, pace: 1, dither: 0.2 });

test('most bots park their pointer, fewer trace, hover or fidget; each its own for good', () => {
  const rng = seeded(5);
  const counts = { park: 0, trace: 0, hover: 0, fidget: 0 };
  for (let i = 0; i < 4000; i++) counts[rollHandStyle(rng).habit]++;
  assert.ok(counts.park > 1600 && counts.park < 2000, JSON.stringify(counts));
  assert.ok(counts.trace > 650 && counts.fidget > 250 && counts.fidget < 550, JSON.stringify(counts));
  // The named bots: every habit among them, always the same hand for the same name.
  const habits = new Set(NAMES.map((n) => identityOf(n, ['A']).persona.hand.habit));
  assert.equal(habits.size, 4);
  for (const n of NAMES.slice(0, 10)) assert.deepEqual(identityOf(n, ['A']).persona.hand, identityOf(n, ['A']).persona.hand);
});

test('parked, the pointer goes aside once and waits; it reads nothing, leaning toward an answer at most once, near the end', () => {
  for (let seed = 1; seed < 60; seed++) {
    const g = readQuestion(hands('park'), options, true, boxes, 0, 8000, true, seeded(seed));
    assert.ok(g.length >= 1 && g.length <= 2, JSON.stringify(g));
    assert.ok(g[0].spot && g[0].spot.x > 844, 'beside the answers');
    if (g[1]) assert.ok(g[1].anchor?.startsWith('opt:') && g[1].at > 8000 - 1400);
  }
  // Staying put: nothing to go to at all, when sure.
  assert.deepEqual(readQuestion(hands('park', 'stay'), options, true, boxes, 0, 8000, false, seeded(1)), []);
  assert.ok(restSpot(hands('park', 'low').style, boxes, seeded(2))!.y > 786);
});

test('tracing, it follows the reading: the answers top to bottom, then back and forth when unsure', () => {
  const g = readQuestion(hands('trace'), options, true, boxes, 0, 12000, true, seeded(3));
  const read = g.map((x) => x.anchor).filter((a) => a?.startsWith('opt:'));
  assert.deepEqual(read.slice(0, 6), options);
  assert.ok(read.length > 6);
  // Times go forward, and all before it sets off to answer.
  for (let i = 1; i < g.length; i++) assert.ok(g[i].at > g[i - 1].at);
  assert.ok(g.every((x) => x.at < 12000 - 250));
});

test('hovering, it rests on what it is torn between, a while on each', () => {
  const sure = readQuestion(hands('hover'), options, true, boxes, 0, 9000, false, seeded(4));
  assert.equal(new Set(sure.map((x) => x.anchor).filter((a) => a !== 'art')).size, 1);
  const torn = readQuestion(hands('hover'), options, true, boxes, 0, 9000, true, seeded(4));
  const on = new Set(torn.map((x) => x.anchor).filter((a) => a !== 'art'));
  assert.ok(on.size >= 2 && on.size <= 3, [...on].join());
});

test('cards: a tracer looks them over left to right first, a parker goes aside', () => {
  const cards = ['card:0', 'card:1', 'card:2'];
  const cardBoxes: Box[] = cards.map((_, i) => [253 + i * 170, 277, 407 + i * 170, 610]);
  const t = readCards(hands('trace'), cards, cardBoxes, 0, 6000, seeded(2));
  assert.deepEqual(t.slice(0, 3).map((x) => x.anchor), cards);
  const p = readCards(hands('park'), cards, cardBoxes, 0, 6000, seeded(2));
  assert.ok(p.length === 1 && p[0].spot);
});

test("a nervous hand grows jittery as the clock runs out; a calm one doesn't; a fidget circles", () => {
  const style = hands('trace').style;
  assert.deepEqual(fidgets(style, 0.9, true), fidgets(style, 0.9, false));
  const calm = fidgets(style, 0.2, false);
  const shaky = fidgets(style, 0.2, true);
  assert.ok(shaky.every[1] < calm.every[1] && shaky.size[1] > calm.size[1]);
  assert.ok(fidgets(hands('fidget').style, 0.5, false).every[1] < fidgets(hands('park').style, 0.5, false).every[1]);
  const c = circle({ x: 500, y: 500 }, seeded(8));
  assert.ok(c.length >= 5 && c.every((p) => Math.hypot(p.x - 500, p.y - 500) < 45));
});
