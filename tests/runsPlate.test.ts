import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runsPlate } from '../src/lib/runsPlate.ts';

const accent = () => 'rgb(200, 150, 90)';
const runs = (...depths: number[]) => depths.map((depth) => ({ depth, accent: accent() }));

test('the runs go down from the ground: a deeper run reaches further down, its star on its floor', () => {
  const p = runsPlate(runs(16, 27, 12, 22), 1, 180, 190, accent);
  assert.equal(p.h, 190);
  for (const s of p.shafts) assert.ok(s.y > p.y0, 'below the ground');
  const ys = p.shafts.map((s) => s.y);
  assert.ok(ys[1] > ys[0] && ys[0] > ys[2] && ys[3] > ys[0], 'deeper runs lower');
  // The best's star gold, this run's red, each on its own floor, its depth under it.
  assert.deepEqual(
    p.stars.map((s) => [s.kind, s.num.text]),
    [
      ['gold', '27'],
      ['red', '22'],
    ],
  );
  assert.equal(p.stars[0].c[1], ys[1]);
  for (const s of p.stars) assert.ok(s.num.y <= p.h, 'its depth within the drawing');
  // The shafts stay within the width, in order, none wider than a shaft should be.
  const xs = p.shafts.map((s) => s.x);
  assert.ok(xs.every((x, i) => i === 0 || x > xs[i - 1]));
  assert.ok(xs.at(-1)! + 18 <= p.x0 + 180 + 1e-9);
});

test('a new best is one gold star; the zones lie across as strata, a seal in the margin where there is room', () => {
  const p = runsPlate(runs(9, 12, 44), 2, 180, 190, accent);
  assert.deepEqual(
    p.stars.map((s) => s.kind),
    ['gold'],
  );
  // Boundaries at 10, 20, 30 and 40 (shown depths), each within the rock.
  assert.equal(p.strata.length, 4);
  assert.ok(p.seals.length >= 3);
  assert.equal(p.usual.depth, 12);
});
