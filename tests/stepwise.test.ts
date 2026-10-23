import { test } from 'node:test';
import assert from 'node:assert/strict';
import './asVite.ts';

const { stepwise } = await import('../src/lib/idle.ts');

/** Work of `n` steps, counting how often it's begun. */
const counted = (n: number) => {
  const run = { begun: 0 };
  function* make() {
    run.begun++;
    for (let i = 0; i < n; i++) yield;
    return run.begun;
  }
  return { run, make };
};

test('steps taken in idle moments are gone on from by now, and the work is done once', () => {
  const { run, make } = counted(5);
  const w = stepwise(make);
  const steps = w.steps();
  steps.next();
  steps.next();
  assert.equal(w.now(), 1);
  assert.equal(steps.next().done, true);
  assert.equal(w.now(), 1);
  assert.equal(run.begun, 1);
});

test('a step that throws starts the work over when next wanted', () => {
  let fail = true;
  const w = stepwise(function* () {
    yield;
    if (fail) throw new Error('boom');
    return 'made';
  });
  assert.throws(() => w.now(), /boom/);
  fail = false;
  assert.equal(w.now(), 'made');
});

test('what turned out stale is made anew, by now or in steps', () => {
  const { make } = counted(1);
  let lost = false;
  const w = stepwise(make, () => lost);
  assert.equal(w.now(), 1);
  lost = true;
  assert.equal(w.now(), 2);
  lost = false;
  assert.equal(w.now(), 2);
  lost = true;
  [...w.steps()];
  lost = false;
  assert.equal(w.now(), 3);
});
