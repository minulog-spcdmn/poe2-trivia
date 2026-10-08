import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FLARE_RECEDE_MS, claimPressure, flareEase, flarePressure, pressing, pressureLevel, pressureOf, setPressure } from '../src/lib/darkness.ts';

test("the dark comes in with a question's clock: faint while there is time, closing in over the last seconds", () => {
  const span = 20000;
  let last = -1;
  for (let left = span; left >= 0; left -= 100) {
    const p = pressureOf(left, span, 5);
    assert.ok(p >= last && p >= 0 && p <= 1, `${p} with ${left} ms left`);
    last = p;
  }
  assert.equal(pressureOf(span, span), 0);
  assert.equal(pressureOf(0, span), 1);
  assert.ok(pressureOf(span / 2, span) < 0.25, 'subtle half way');
  assert.ok(pressureOf(3000, span) > 0.5, 'clearly felt in the last seconds');
  // A flare's extra time takes it back; nonsense gives none.
  assert.equal(pressureOf(span + 5000, span), 0);
  assert.equal(pressureOf(1000, 0), 0);
});

test('it eases in and lifts by itself, and only the latest ring drives it', () => {
  setPressure(0);
  let now = 0;
  const settle = () => {
    for (let i = 0; i < 300; i++) pressureLevel((now += 16));
    return pressureLevel(now);
  };
  settle();
  assert.equal(pressing(), false);
  const a = claimPressure();
  a.set(0.8);
  assert.ok(pressureLevel((now += 16)) < 0.8, 'no jump');
  assert.equal(settle(), 0.8);
  // A new question's ring takes over; the old one fading out no longer moves it, nor clears it.
  const b = claimPressure();
  b.set(0.1);
  a.set(1);
  a.release();
  assert.equal(settle(), 0.1);
  // The question ends: the dark lifts, over a second or so.
  b.set(1);
  settle();
  b.release();
  const lifting = [500, 1000, 2500].map((ms) => {
    const start = now;
    while (now < start + ms) pressureLevel((now += 16));
    return pressureLevel(now);
  });
  assert.ok(lifting[0] > 0.1 && lifting[0] < 0.7, `half a second on: ${lifting[0]}`);
  assert.equal(lifting[2], 0);
  assert.equal(pressing(), false);
  b.set(0.5);
  assert.equal(pressing(), false, 'a released ring moves nothing');
});

test("a flare's light holds the dark back as it catches, and it seeps back in as the flare burns down", () => {
  let last = -1;
  for (let left = 1; left >= 0; left -= 0.01) {
    const p = flarePressure(left);
    assert.ok(p >= last && p > 0 && p <= 1, `${p} with ${left} left`);
    last = p;
  }
  assert.ok(flarePressure(1) <= 0.15, 'pushed far back as it catches');
  assert.ok(flarePressure(0.5) < 0.4, 'still held back half way');
  assert.equal(flarePressure(0), 1);
  assert.equal(flarePressure(-1), 1);
});

test('as a flare catches the dark holds, then draws back smoothly, never in a jump', () => {
  const held = 1;
  const to = flarePressure(1);
  assert.equal(flareEase(held, to, 0), held, 'held as its light blooms');
  assert.equal(flareEase(held, to, FLARE_RECEDE_MS), to);
  assert.equal(flareEase(held, to, 10 * FLARE_RECEDE_MS), to);
  let last = held;
  for (let ms = 0; ms <= FLARE_RECEDE_MS; ms += 16) {
    const p = flareEase(held, to, ms);
    assert.ok(p <= last && last - p < 0.06, `${p} at ${ms} ms`);
    last = p;
  }
});

test('a loop waking after a long sleep eases from where the dark was', () => {
  const a = claimPressure();
  let now = 100000;
  pressureLevel(now);
  a.set(1);
  // (Nothing drew it for a long while.)
  now += 60000;
  assert.ok(pressureLevel(now) < 0.5, 'no jump');
  a.release();
  for (let i = 0; i < 400; i++) pressureLevel((now += 16));
});
