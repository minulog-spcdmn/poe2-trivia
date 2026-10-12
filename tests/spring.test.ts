import { test } from 'node:test';
import assert from 'node:assert/strict';
import { springAtRest, stepSpring, type Spring } from '../src/lib/spring.ts';
import { CURSOR_SPRING } from '../src/lib/startMenu.ts';

/** Runs a spring from 0 to `to` at `hz`, and says when it settled and how far past it went. */
function run(hz: number, to = 324) {
  const s: Spring = { x: 0, v: 0 };
  let t = 0;
  let peak = 0;
  const path: number[] = [];
  while (!springAtRest(s, to) && t < 3) {
    stepSpring(s, to, 1 / hz, CURSOR_SPRING);
    t += 1 / hz;
    peak = Math.max(peak, s.x);
    path.push(s.x);
  }
  return { settled: t, over: (peak - to) / to, path };
}

test("the menu's cursor settles in about a quarter second, barely past its mark", () => {
  const { settled, over } = run(240);
  assert.ok(settled > 0.15 && settled < 0.5, `settled in ${settled.toFixed(3)} s`);
  assert.ok(over >= 0 && over < 0.03, `${(over * 100).toFixed(1)}% past`);
});

test('it moves the same on a 60 Hz and a 240 Hz screen', () => {
  const slow = run(60).path;
  const fast = run(240).path;
  for (let i = 0; i < slow.length && i * 4 + 3 < fast.length; i++) assert.ok(Math.abs(slow[i] - fast[i * 4 + 3]) < 0.5, `frame ${i}: ${slow[i]} vs ${fast[i * 4 + 3]}`);
});

test('it eases out of where it was: the first frames move little, the middle ones most', () => {
  const p = run(240).path;
  const step = (i: number) => p[i] - (p[i - 1] ?? 0);
  assert.ok(step(1) < step(12), 'speeds up');
  assert.ok(step(60) < step(12), 'slows down');
});

test('sent elsewhere mid-way, it carries on a moment and turns, instead of jolting back', () => {
  const s: Spring = { x: 0, v: 0 };
  for (let i = 0; i < 20; i++) stepSpring(s, 324, 1 / 240, CURSOR_SPRING);
  const x0 = s.x;
  stepSpring(s, 0, 1 / 240, CURSOR_SPRING);
  assert.ok(s.x > x0, 'still on its way the next frame');
  let turnedAt = 0;
  for (let i = 1; i < 240 && !turnedAt; i++) {
    stepSpring(s, 0, 1 / 240, CURSOR_SPRING);
    if (s.v < 0) turnedAt = i;
  }
  assert.ok(turnedAt > 2, `turned after ${turnedAt} frames`);
});

test('a stalled frame does not fling it', () => {
  const s: Spring = { x: 0, v: 0 };
  stepSpring(s, 324, 2, CURSOR_SPRING);
  assert.ok(s.x <= 324 * 1.05);
});
