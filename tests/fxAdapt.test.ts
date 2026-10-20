import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QualityAdapt } from '../src/lib/fx/adapt.ts';

// The effects lower their resolution only when that makes frames quicker
// (src/lib/fx/adapt.ts): slow frames from elsewhere (another app holding
// the GPU, the page's scripts, a slow CPU) leave it as it is.

const lower = (q: number) => (q < 2 ? q + 1 : null);

/**
 * Runs `seconds` of frames: each `ms(quality)` long (with a little noise),
 * the GPU's time `gpu(quality)` (null: it can't be timed). Returns the
 * qualities it went to, in order.
 */
function run(a: QualityAdapt, seconds: number, ms: (q: number) => number, gpu: (q: number) => number | null) {
  const went: number[] = [];
  let t = 0;
  let i = 0;
  while (t < seconds * 1000) {
    // (Every fourth frame twice as slow: a page's frames are never even.)
    const d = ms(a.quality) * (++i % 4 === 0 ? 2 : 0.67);
    t += d;
    const g = gpu(a.quality);
    if (a.frame(d, g === null ? null : { ms: g, frames: 1 })) went.push(a.quality);
  }
  return went;
}

test('a GPU too weak for the effects: the drop that helps stays', () => {
  const a = new QualityAdapt(0, lower);
  // Most of each frame is the effects' GPU work, which halves at each level.
  const went = run(a, 30, (q) => 12 + 30 / 2 ** q, (q) => 30 / 2 ** q);
  assert.deepEqual(went, [1, 2]);
  assert.equal(a.quality, 2);
});

test('another app holding the GPU, or a slow CPU: frames are slow, the effects cost little, the quality stays', () => {
  const a = new QualityAdapt(0, lower);
  assert.deepEqual(run(a, 60, () => 30, () => 0.6), []);
  assert.equal(a.quality, 0);
});

test('where the GPU cannot be timed: a drop that does not help is undone once and not tried again', () => {
  const a = new QualityAdapt(0, lower);
  assert.deepEqual(run(a, 120, () => 28, () => null), [1, 0]);
  assert.equal(a.quality, 0);
});

test('a drop that did not help is tried again only once frames get far slower', () => {
  const a = new QualityAdapt(0, lower);
  run(a, 20, () => 28, () => null);
  assert.equal(a.quality, 0);
  // Far slower now, and from the effects: the drop helps this time.
  assert.deepEqual(run(a, 20, (q) => (q === 0 ? 60 : 16.7), () => null), [1]);
});

test('frames quick enough: nothing changes, timed or not', () => {
  for (const gpu of [() => 10, () => null]) {
    const a = new QualityAdapt(0, lower);
    assert.deepEqual(run(a, 30, () => 16.7, gpu), []);
  }
});

test('no level below worth trying: nothing to drop to', () => {
  const a = new QualityAdapt(2, lower);
  assert.deepEqual(run(a, 30, () => 50, () => 40), []);
  // A level that draws as many pixels is skipped (see lowerQuality in core.ts).
  const b = new QualityAdapt(0, (q) => (q === 0 ? 2 : null));
  assert.deepEqual(run(b, 30, (q) => (q === 0 ? 50 : 20), () => 30), [2]);
});
