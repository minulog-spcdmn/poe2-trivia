import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BackGuard, memorySteps } from '../src/lib/backGuard.ts';

/** The browser's popstate comes a moment after a back. */
const settled = () => new Promise((r) => setTimeout(r));
const guarded = (state: unknown) => !!(state as Record<string, unknown> | null)?.guard;

/** A guard on a history of its own, telling what Back did with nothing open. */
function room() {
  const steps = memorySteps();
  const guard = new BackGuard(steps);
  const asked: string[] = [];
  guard.asked(() => asked.push('leave?'));
  /** The player presses Back. */
  const back = async () => {
    steps.back();
    await settled();
  };
  return { steps, guard, asked, back };
}

test('a room puts up one guard, however often it is asked for', () => {
  const { steps, guard } = room();
  guard.want(true);
  guard.want(true);
  assert.equal(steps.entries.length, 2);
  assert.equal(steps.at, 1);
  assert.ok(guarded(steps.state()));
});

test('Back with nothing open asks before leaving, and the guard is back on top, still the only one', async () => {
  const { steps, guard, asked, back } = room();
  guard.want(true);
  await back();
  assert.deepEqual(asked, ['leave?']);
  assert.equal(steps.at, 1);
  assert.equal(steps.entries.length, 2);
  assert.ok(guarded(steps.state()));
  await back();
  assert.deepEqual(asked, ['leave?', 'leave?']);
  assert.equal(steps.entries.length, 2);
});

test('Back closes the topmost layer first, one per Back, then asks', async () => {
  const { guard, asked, back } = room();
  const closed: string[] = [];
  guard.want(true);
  const off: Record<string, () => void> = {};
  off.item = guard.layer(() => {
    closed.push('item');
    off.item();
  });
  off.leave = guard.layer(() => {
    closed.push('leave');
    off.leave();
  });
  await back();
  assert.deepEqual(closed, ['leave']);
  await back();
  assert.deepEqual(closed, ['leave', 'item']);
  assert.deepEqual(asked, []);
  await back();
  assert.deepEqual(asked, ['leave?']);
});

test('a modal dialog the browser left open is closed before any layer', async () => {
  const { guard, asked, back } = room();
  const closed: string[] = [];
  guard.want(true);
  guard.layer(() => closed.push('item'));
  let open = true;
  guard.topDialog = () => (open ? () => ((open = false), closed.push('privacy')) : null);
  await back();
  assert.deepEqual(closed, ['privacy']);
  await back();
  assert.deepEqual(closed, ['privacy', 'item']);
  assert.deepEqual(asked, []);
});

test('outside a room Back is the browser’s: nothing is asked or closed', async () => {
  const { steps, guard, asked, back } = room();
  steps.push({ settings: true });
  let closed = 0;
  guard.layer(() => closed++);
  await back();
  assert.equal(steps.at, 0);
  assert.equal(closed, 0);
  assert.deepEqual(asked, []);
});

test('leaving goes back off the guard, without asking, and leaves no step behind', async () => {
  const { steps, guard, asked } = room();
  guard.want(true);
  guard.want(false);
  await settled();
  assert.equal(steps.at, 0);
  assert.equal(steps.state(), null);
  assert.deepEqual(asked, []);
  // The next room's guard goes over the old one, not after it.
  guard.want(true);
  assert.equal(steps.entries.length, 2);
});

test('a room opened while the last one’s guard is still being gone back from gets one guard, once that’s done', async () => {
  const { steps, guard, asked } = room();
  guard.want(true);
  guard.want(false);
  guard.want(true);
  await settled();
  assert.equal(steps.at, 1);
  assert.equal(steps.entries.length, 2);
  assert.ok(guarded(steps.state()));
  assert.deepEqual(asked, []);
});

test('Back from a page over the game (#settings) lands on the guard and is the page’s alone', async () => {
  const { steps, guard, asked, back } = room();
  guard.want(true);
  steps.push({ settings: true });
  await back();
  assert.ok(guarded(steps.state()));
  assert.deepEqual(asked, []);
  // And the next Back is the game's again.
  await back();
  assert.deepEqual(asked, ['leave?']);
});

test('a guard left behind under a page when the room ended is passed over', async () => {
  const { steps, guard, asked, back } = room();
  guard.want(true);
  steps.push({ settings: true });
  // The room ends with the settings open: they are dropped where they stand (HashRoute.drop()).
  guard.want(false);
  steps.replace(null);
  await settled();
  assert.equal(steps.at, 2);
  await back();
  assert.equal(steps.at, 0);
  await settled();
  assert.deepEqual(asked, []);
});

test('a guard from an earlier load of the page is made a plain step, and this load’s goes over it', () => {
  const steps = memorySteps({ guard: true });
  const guard = new BackGuard(steps);
  guard.adopt();
  assert.equal(steps.state(), null);
  guard.want(true);
  assert.equal(steps.entries.length, 2);
  assert.ok(guarded(steps.state()));
});

test('a layer taken off is never closed by Back', async () => {
  const { guard, asked, back } = room();
  guard.want(true);
  let closed = 0;
  guard.layer(() => closed++)();
  await back();
  assert.equal(closed, 0);
  assert.deepEqual(asked, ['leave?']);
});

test('the history it was moved off is no longer heard', async () => {
  const first = memorySteps();
  const guard = new BackGuard(first);
  let asked = 0;
  guard.asked(() => asked++);
  const own = memorySteps();
  guard.use(own);
  guard.want(true);
  first.push({});
  first.back();
  await settled();
  assert.equal(asked, 0);
  own.back();
  await settled();
  assert.equal(asked, 1);
});
