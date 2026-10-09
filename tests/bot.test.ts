import { test } from 'node:test';
import assert from 'node:assert/strict';
import { answerDelay, knowChance, makePersona, pickCategory, weighted, wrongPick, type Ask, type Persona } from '../src/bot/brain.ts';

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

const plain: Persona = { skill: 0, pace: 1, affinity: { Rings: 0.1, Flasks: -0.1 } };
const ask = (over: Partial<Ask> = {}): Ask => ({ difficulty: 'cruel', harder: false, category: 'Rings', veiled: false, clock: 32, race: false, ...over });

test('a persona rolls every category, within bounds', () => {
  const p = makePersona(['A', 'B', 'C'], seeded(1));
  assert.deepEqual(Object.keys(p.affinity), ['A', 'B', 'C']);
  for (const a of Object.values(p.affinity)) assert.ok(a >= -0.15 && a <= 0.12);
  assert.ok(p.pace >= 0.85 && p.pace <= 1.2);
});

test('harder questions are known less often', () => {
  const cruel = knowChance(plain, ask());
  const merciless = knowChance(plain, ask({ difficulty: 'merciless' }));
  const eternal = knowChance(plain, ask({ difficulty: 'eternal' }));
  assert.ok(cruel > merciless && merciless > eternal);
  // A deathmatch goes one step up the ladder.
  assert.equal(knowChance(plain, ask({ harder: true })), merciless);
  assert.ok(knowChance(plain, ask({ veiled: true })) < cruel);
  assert.ok(knowChance(plain, ask({ category: 'Flasks' })) < knowChance(plain, ask({ category: 'Rings' })));
});

test('the chance of knowing stays away from never and always', () => {
  assert.equal(knowChance({ ...plain, skill: 5 }, ask()), 0.95);
  assert.equal(knowChance({ ...plain, skill: -5 }, ask()), 0.15);
});

test('answers take a human time and come in before the clock ends', () => {
  const rng = seeded(7);
  for (let i = 0; i < 500; i++) {
    const d = answerDelay(plain, ask({ clock: 8 }), true, rng);
    assert.ok(d !== null && d >= 900 && d <= 8000 - 600, `delay ${d}`);
  }
});

test('unsure answers are slower', () => {
  const mean = (knows: boolean) => {
    const rng = seeded(3);
    let sum = 0;
    let n = 0;
    for (let i = 0; i < 2000; i++) {
      const d = answerDelay(plain, ask({ clock: 0 }), knows, rng);
      if (d !== null) (sum += d), n++;
    }
    return sum / n;
  };
  assert.ok(mean(false) > mean(true) * 1.3);
});

test('without a clock, a turn is always answered', () => {
  const rng = seeded(11);
  for (let i = 0; i < 500; i++) assert.notEqual(answerDelay(plain, ask({ clock: 0 }), false, rng), null);
});

test('in a race, an unsure bot mostly sits the question out', () => {
  const rng = seeded(5);
  let out = 0;
  for (let i = 0; i < 1000; i++) if (answerDelay(plain, ask({ race: true, clock: 16 }), false, rng) === null) out++;
  assert.ok(out > 500 && out < 700, `sat out ${out}`);
});

test('a wrong pick is never the answer nor ruled out, and favours look-alikes', () => {
  const names = ['Ventor\'s Gamble', 'Ventor\'s Gambit', 'Kaom\'s Heart', 'Andvarius'];
  const rng = seeded(9);
  const counts = [0, 0, 0, 0];
  for (let i = 0; i < 2000; i++) counts[wrongPick(names, 0, [], rng)!]++;
  assert.equal(counts[0], 0);
  assert.ok(counts[1] > counts[2] && counts[1] > counts[3], `${counts}`);
  for (let i = 0; i < 200; i++) assert.equal(wrongPick(names, 0, [1, 2], rng), 3);
  assert.equal(wrongPick(names, 0, [1, 2, 3], rng), null);
});

test('categories it knows best are picked most', () => {
  const rng = seeded(13);
  const counts: Record<string, number> = { Rings: 0, Flasks: 0 };
  for (let i = 0; i < 1000; i++) counts[pickCategory(plain, ['Rings', 'Flasks'], rng)]++;
  assert.ok(counts.Rings > counts.Flasks * 2, JSON.stringify(counts));
});

test('weighted picks follow the weights', () => {
  const rng = seeded(17);
  const counts = [0, 0, 0];
  for (let i = 0; i < 3000; i++) counts[weighted([1, 0, 3], rng)]++;
  assert.equal(counts[1], 0);
  assert.ok(counts[2] > counts[0] * 2);
});
