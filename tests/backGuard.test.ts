import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BackGuard, PageLayers, layerDepth, memorySteps } from '../src/lib/backGuard.ts';

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

test('Back with nothing open asks before leaving, and the guard is back on top in the next tap, still the only one', async () => {
  const { steps, guard, asked, back } = room();
  guard.want(true);
  await back();
  assert.deepEqual(asked, ['leave?']);
  // Not from Back itself, which is no tap: iOS's swipe would pass over it from then on.
  assert.equal(steps.at, 0);
  steps.tap();
  assert.equal(steps.at, 1);
  assert.equal(steps.entries.length, 2);
  assert.ok(guarded(steps.state()));
  await back();
  assert.deepEqual(asked, ['leave?', 'leave?']);
  steps.tap();
  assert.equal(steps.entries.length, 2);
});

test('until that tap a second Back is the browser’s: it really leaves', async () => {
  const { steps, guard, asked, back } = room();
  guard.want(true);
  await back();
  await back();
  assert.deepEqual(asked, ['leave?']);
  // Several taps, one guard.
  steps.tap();
  steps.tap();
  assert.equal(steps.entries.length, 2);
  assert.equal(steps.at, 1);
});

test('a room gone before the tap puts no guard up', async () => {
  const { steps, guard, back } = room();
  guard.want(true);
  await back();
  guard.want(false);
  steps.tap();
  assert.equal(steps.at, 0);
  assert.equal(steps.state(), null);
});

test('Back closes the topmost layer first, one per Back, then asks', async () => {
  const { steps, guard, asked, back } = room();
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
  steps.tap();
  await back();
  assert.deepEqual(closed, ['leave', 'item']);
  assert.deepEqual(asked, []);
  steps.tap();
  await back();
  assert.deepEqual(asked, ['leave?']);
});

test('a modal dialog the browser left open is closed before any layer', async () => {
  const { steps, guard, asked, back } = room();
  const closed: string[] = [];
  guard.want(true);
  guard.layer(() => closed.push('item'));
  let open = true;
  guard.topDialog = () => (open ? () => ((open = false), closed.push('privacy')) : null);
  await back();
  assert.deepEqual(closed, ['privacy']);
  steps.tap();
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

test('a room opened while the last one’s guard is still being gone back from gets one guard, in the next tap once that’s done', async () => {
  const { steps, guard, asked } = room();
  guard.want(true);
  guard.want(false);
  guard.want(true);
  await settled();
  assert.equal(steps.at, 0);
  steps.tap();
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

test('a room resumed on a load, with no tap behind it, puts its guard up in the first tap', async () => {
  const { steps, guard, asked, back } = room();
  steps.inTap = () => false;
  guard.want(true);
  assert.equal(steps.at, 0);
  steps.inTap = () => true;
  steps.tap();
  assert.equal(steps.at, 1);
  assert.ok(guarded(steps.state()));
  await back();
  assert.deepEqual(asked, ['leave?']);
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

test('a room resumed on a page’s entry (a reload with #settings open) drops the page first: the guard goes over a plain entry', async () => {
  const steps = memorySteps({ settings: true }, '#settings');
  const guard = new BackGuard(steps);
  let dropped = 0;
  guard.dropPage = () => {
    dropped++;
    steps.replace(null);
  };
  const asked: string[] = [];
  guard.asked(() => asked.push('leave?'));
  guard.want(true);
  assert.equal(dropped, 1);
  assert.deepEqual(steps.entries, [null, { guard: true }]);
  assert.deepEqual(steps.hashes, ['', '']);
  // Back lands on the plain entry: it asks, and no page is opened under the game.
  steps.back();
  await settled();
  assert.deepEqual(asked, ['leave?']);
  assert.equal(steps.hashed(), false);
});

test('the guard itself never takes a page’s hash, and a page opened over it is gone back from to the guard', async () => {
  const { steps, guard, asked, back } = room();
  guard.want(true);
  assert.equal(steps.hashed(), false);
  steps.page({ settings: true }, '#settings');
  await back();
  assert.ok(guarded(steps.state()));
  assert.equal(steps.hashed(), false);
  assert.deepEqual(asked, []);
});

test('the guard’s own drop of a page is only for one under it: in a room with the guard up, opening a page drops nothing', () => {
  const { steps, guard } = room();
  let dropped = 0;
  guard.dropPage = () => dropped++;
  guard.want(true);
  steps.page({ settings: true }, '#settings');
  guard.want(true);
  assert.equal(dropped, 0);
});

// ---- a page's layers: the codex's item card, out of a room ----

/** The codex opened from the start page (HashRoute.show(): its entry marked, with its hash), its layers over it. */
function codexPage() {
  const steps = memorySteps();
  steps.page({ codex: true }, '#codex');
  const layers = new PageLayers(steps);
  const closed: string[] = [];
  const back = async () => {
    steps.back();
    await settled();
  };
  return { steps, layers, closed, back };
}

test('an item opened on the codex is one step over the codex’s own, at its address and marked as its entry is', () => {
  const { steps, layers } = codexPage();
  layers.layer(() => {});
  assert.equal(steps.entries.length, 3);
  assert.equal(steps.at, 2);
  assert.deepEqual(steps.state(), { codex: true, over: 1 });
  assert.equal(steps.hashes[2], '#codex');
  assert.equal(layerDepth(steps.state()), 1);
});

test('Back with an item open closes the item alone: the codex’s entry is where the page is', async () => {
  const { steps, layers, closed, back } = codexPage();
  layers.layer(() => closed.push('item'));
  await back();
  assert.deepEqual(closed, ['item']);
  assert.equal(steps.at, 1);
  assert.deepEqual(steps.state(), { codex: true });
  assert.equal(steps.hashed(), true);
  // The next Back is the codex’s: nothing of the item is left to close.
  await back();
  assert.deepEqual(closed, ['item']);
  assert.equal(steps.at, 0);
});

test('an item closed by its own close is gone back from, and never closed again by Back', async () => {
  const { steps, layers, closed } = codexPage();
  const off = layers.layer(() => closed.push('item'));
  off();
  await settled();
  assert.equal(steps.at, 1);
  assert.deepEqual(steps.state(), { codex: true });
  assert.deepEqual(closed, []);
});

test('taken off as Back closes it (the card’s teardown), it goes back no further', async () => {
  const { steps, layers, back } = codexPage();
  let off = () => {};
  off = layers.layer(() => off());
  await back();
  assert.equal(steps.at, 1);
});

test('two layers: Back closes the top one only', async () => {
  const { steps, layers, closed, back } = codexPage();
  layers.layer(() => closed.push('under'));
  layers.layer(() => closed.push('top'));
  assert.equal(layerDepth(steps.state()), 2);
  await back();
  assert.deepEqual(closed, ['top']);
  assert.equal(layerDepth(steps.state()), 1);
  await back();
  assert.deepEqual(closed, ['top', 'under']);
  assert.equal(steps.at, 1);
});

test('a layer’s entry left by a reload is counted: the next one goes over it, and Back still closes it', async () => {
  const steps = memorySteps({ codex: true, over: 1 }, '#codex');
  const layers = new PageLayers(steps);
  let closed = 0;
  layers.layer(() => closed++);
  assert.deepEqual(steps.state(), { codex: true, over: 2 });
  steps.back();
  await settled();
  assert.equal(closed, 1);
});

test('the guard and the layers hear one history together, each only what is its own', async () => {
  const { steps, layers, closed, back } = codexPage();
  const guard = new BackGuard(steps);
  const asked: string[] = [];
  guard.asked(() => asked.push('leave?'));
  layers.layer(() => closed.push('item'));
  await back();
  assert.deepEqual(closed, ['item']);
  assert.deepEqual(asked, []);
  assert.equal(steps.at, 1);
});
