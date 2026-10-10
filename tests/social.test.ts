import { test } from 'node:test';
import assert from 'node:assert/strict';
import { approaching, awayFrom, react, toward, travelled, wave, waving, type Sample } from '../src/bot/social.ts';

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

/** A pointer going back and forth across `size` units, a turn every `every` ms, sampled ten times a second. */
const shaking = (size: number, every: number, until = 1400): Sample[] =>
  Array.from({ length: until / 100 + 1 }, (_, i) => {
    const t = i * 100;
    const leg = Math.floor(t / every);
    const k = (t % every) / every;
    const x = 500 + (leg % 2 ? size * (1 - k) : size * k);
    return { t, x, y: 400 };
  });

test('a wave is a few quick turns back and forth that get nowhere; a pointer going somewhere is not one', () => {
  assert.ok(waving(shaking(60, 200), 1400));
  // Too slow to be a wave, too small to see, or too wide: a stroll.
  assert.ok(!waving(shaking(60, 900), 1400));
  assert.ok(!waving(shaking(8, 200), 1400));
  assert.ok(!waving(shaking(400, 200), 1400));
  const going = Array.from({ length: 15 }, (_, i) => ({ t: i * 100, x: 100 + i * 40, y: 300 + i * 5 }));
  assert.ok(!waving(going, 1400));
  // An old wave is over.
  assert.ok(!waving(shaking(60, 200), 4000));
});

test('someone coming up to it is noticed, someone already about is not', () => {
  const me = { x: 500, y: 500 };
  const coming = Array.from({ length: 12 }, (_, i) => ({ t: i * 100, x: 200 + i * 26, y: 500 }));
  assert.ok(approaching(coming, me, 1100));
  const near = Array.from({ length: 12 }, (_, i) => ({ t: i * 100, x: 460 + i, y: 500 }));
  assert.ok(!approaching(near, me, 1100));
  // Long since stopped: not coming now.
  assert.ok(!approaching(coming, me, 3000));
  assert.ok(travelled(coming, 1100) > 250);
});

test('it answers in kind: a wave back, a step closer that stops short, a step away', () => {
  const rng = seeded(4);
  const me = { x: 300, y: 300 };
  const w = wave(me, rng);
  assert.ok(w.length >= 5 && w.every((p) => Math.abs(p.x - me.x) < 30 && Math.abs(p.y - me.y) < 10));
  assert.ok(Math.hypot(w.at(-1)!.x - me.x, w.at(-1)!.y - me.y) < 6);
  for (let i = 0; i < 50; i++) {
    const them = { x: 300 + 400 * rng(), y: 300 + 400 * rng() };
    const t = toward(me, them, rng);
    const before = Math.hypot(them.x - me.x, them.y - me.y);
    const after = Math.hypot(them.x - t.x, them.y - t.y);
    assert.ok(after < before + 12 && after > 15 && Math.hypot(t.x - me.x, t.y - me.y) < 275, JSON.stringify({ me, them, t }));
    const a = awayFrom(me, them, rng);
    assert.ok(Math.hypot(them.x - a.x, them.y - a.y) > before);
  }
});

test('a sociable bot answers most waves, a shy one few; never the same pointer again straight away', () => {
  const others = new Map([['abc', shaking(60, 200)]]);
  const tally = (sociable: number) => {
    const rng = seeded(9);
    let n = 0;
    for (let i = 0; i < 400; i++) if (react(others, { x: 600, y: 500 }, 1400, sociable, rng)?.kind === 'wave') n++;
    return n;
  };
  assert.ok(tally(1) > 300 && tally(0) < 160 && tally(0) > 70, `${tally(1)} ${tally(0)}`);
  assert.equal(react(others, { x: 600, y: 500 }, 1400, 1, () => 0, { lastFor: new Map([['abc', 0]]) }), null);
  // A wave far off is mostly for someone else.
  const far = (() => {
    const rng = seeded(9);
    let n = 0;
    for (let i = 0; i < 400; i++) if (react(others, { x: 950, y: 950 }, 1400, 1, rng)) n++;
    return n;
  })();
  assert.ok(far < 140, `${far}`);
  // Where where it points matters (someone's question), it waves where it is, and never follows anyone.
  const r = react(others, { x: 900, y: 900 }, 1400, 1, () => 0, { free: false });
  assert.deepEqual(r, { kind: 'wave', to: 'abc', go: false });
  const busy = new Map([['abc', Array.from({ length: 15 }, (_, i) => ({ t: i * 100, x: 100 + i * 50, y: 300 }))]]);
  for (let i = 0; i < 200; i++) assert.equal(react(busy, { x: 900, y: 900 }, 1400, 1, Math.random, { free: false }), null);
});
