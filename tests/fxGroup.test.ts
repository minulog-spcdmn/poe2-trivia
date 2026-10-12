// The effects' particle pool ending a group (lib/fx/core.ts fxGroup): the
// category cards' sparks and embers fade out with the cards rather than
// flying on over the question. Only the group's own particles go; those
// still waiting to appear never do; the fade is quick, not a cut.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INSTANCE_FLOATS, ParticlePool } from '../src/lib/fx/particles.ts';

const DT = 1 / 60;
const spark = { x: 0, y: 0, life: 2, size: 1, color: [1, 1, 1] as const, fadeIn: 0 };

/** The brightness (red) of each particle drawn this step. */
const reds = (pool: ParticlePool, n: number) => Array.from({ length: n }, (_, i) => pool.instances[i * INSTANCE_FLOATS + 8]);

test("a group's particles fade out over the time given, the rest play on", () => {
  const pool = new ParticlePool(16);
  pool.spawn(spark, true, 1);
  pool.spawn(spark, true, 2);
  pool.spawn(spark, true, 0);
  pool.step(DT);
  const before = reds(pool, 3);
  pool.fadeGroup(1, 0.2);
  pool.step(DT);
  const [faded, ...rest] = reds(pool, 3);
  assert.ok(faded < before[0] && faded > before[0] * 0.8, 'it dims, from about where it was');
  assert.ok(rest.every((r, i) => Math.abs(r - before[i + 1]) < 0.02), 'the others go on as they were');
  for (let t = 0; t < 0.2; t += DT) pool.step(DT);
  assert.equal(pool.step(DT), 2);
});

test('a particle of the group still waiting to appear never does', () => {
  const pool = new ParticlePool(16);
  pool.spawn({ ...spark, delay: 0.5 }, true, 1);
  pool.spawn(spark, true, 0);
  pool.fadeGroup(1, 0.2);
  assert.equal(pool.step(DT), 1);
  for (let t = 0; t < 1; t += DT) pool.step(DT);
  assert.equal(pool.count, 1);
});

test('ending a group again never slows a fade already under way', () => {
  const pool = new ParticlePool(16);
  pool.spawn(spark, true, 1);
  pool.step(DT);
  pool.fadeGroup(1, 0.1);
  pool.fadeGroup(1, 1);
  for (let t = 0; t < 0.15; t += DT) pool.step(DT);
  assert.equal(pool.count, 0);
});
