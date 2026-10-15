import { test } from 'node:test';
import assert from 'node:assert/strict';

(globalThis as { localStorage?: unknown }).localStorage = { getItem: () => null, setItem() {} };
const { screenX, travel, roomPlan, hoverStep, HOVER_SWEEP, HOVER_STEP, HOVER_STEPS } = await import('../src/lib/spatialPlan.ts');

const SCREEN = { left: 0, width: 1000 };
const box = (left: number, width: number, height = 40) => ({ left, width, height });
const near = (a: number | null, b: number) => assert.ok(a !== null && Math.abs(a - b) < 1e-9, `${a} vs ${b}`);

test('a sound sits at its element’s middle, across the screen from -1 to 1', () => {
  near(screenX(box(0, 200), undefined, SCREEN), -0.8);
  near(screenX(box(450, 100), undefined, SCREEN), 0);
  near(screenX(box(800, 200), undefined, SCREEN), 0.8);
  // The screen may be only part of the window (the lab's panel beside it).
  near(screenX(box(400, 200), undefined, { left: 200, width: 600 }), 0);
});

test('a hovered control sounds half way between its middle and the pointer, so a wide one differs side to side', () => {
  const wide = box(200, 600);
  near(screenX(wide, 200, SCREEN), -0.3);
  near(screenX(wide, 800, SCREEN), 0.3);
  near(screenX(wide, 500, SCREEN), 0);
});

test('a control with no box is placed by the pointer; with neither, a sound has no place; never past the edges', () => {
  near(screenX(box(0, 0, 0), 750, SCREEN), 0.5);
  assert.equal(screenX(box(0, 0, 0), undefined, SCREEN), null);
  assert.equal(screenX(null, undefined, SCREEN), null);
  near(screenX(null, 1500, SCREEN), 1);
  near(screenX(null, -300, SCREEN), -1);
});

test('a sound travels from where it starts to where it lands, eased, when sounds move', () => {
  const x = travel(-0.5, 0.5, 1, true);
  near(x(0), -0.5);
  near(x(0.5), 0);
  near(x(1), 0.5);
  near(x(3), 0.5);
  assert.ok(x(0.25) < -0.25, 'slow to start');
});

test('not moving, a sound sits where it lands, a blast where it bursts in; one place is enough', () => {
  near(travel(-0.5, 0.5, 1, false)(0), 0.5);
  near(travel(-1, -0.3, 0.42, false, true)(0.2), -1);
  // Its start gone (no box), it sits where it lands; with no end, where it starts.
  near(travel(null, 0.4, 1, true)(0), 0.4);
  near(travel(-0.2, null, 0, true)(1), -0.2);
  near(travel(null, null, 0, true)(0), 0);
});

test('no rooms outside Delve or with rooms off', () => {
  for (const [d, on] of [[0, true], [0.5, true], [30, false]] as const) {
    const p = roomPlan(d, on);
    assert.deepEqual([p.wanted, p.next, p.kept.size], [[], null, 0]);
  }
});

test('in Delve the places sounding share the reverb (as the beds do), and the next place is kept ahead', () => {
  for (let d = 1; d <= 200; d += 0.5) {
    const p = roomPlan(d, true);
    assert.ok(p.wanted.length >= 1, `nothing sounding at ${d}`);
    const share = p.wanted.reduce((s, w) => s + w.weight * w.weight, 0);
    assert.ok(Math.abs(share - 1) < 1e-6, `shares at ${d} come to ${share}`);
    assert.ok(p.next && p.kept.has(p.next), `no next place at ${d}`);
    for (const w of p.wanted) assert.ok(p.kept.has(w.place));
  }
});

test('every room a depth needs was already kept a step before: it is worked out ahead, never as it starts to sound', () => {
  for (let d = 1.5; d <= 200; d += 0.5) {
    const before = roomPlan(d - 0.5, true).kept;
    for (const w of roomPlan(d, true).wanted) assert.ok(before.has(w.place), `${w.place} at ${d} wasn't kept at ${d - 0.5}`);
  }
});

test('a sweep across controls steps each hover quieter, down to a floor; after a pause the next is back to full', () => {
  let h = hoverStep(null, 10);
  assert.equal(h.db, 0);
  const steps = [h.db];
  for (let i = 1; i <= HOVER_STEPS + 2; i++) {
    h = hoverStep(h, 10 + i * 0.1);
    steps.push(h.db);
  }
  assert.deepEqual(steps.slice(0, 3), [0, -HOVER_STEP, -2 * HOVER_STEP]);
  assert.equal(Math.min(...steps), -HOVER_STEP * HOVER_STEPS);
  // A pause, then a deliberate hover sounds as ever.
  assert.equal(hoverStep(h, h.at + HOVER_SWEEP + 0.01).db, 0);
});
