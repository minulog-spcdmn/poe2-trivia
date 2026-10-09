import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KICK_ARMED_MS, KICK_SETTLE_MS, kickConfirm, type KickClock } from '../src/lib/kick.ts';

/** A clock that only moves when told to, with its timers. */
function fakeClock() {
  let t = 0;
  let timers: { at: number; fn: () => void; id: number }[] = [];
  let next = 1;
  const clock: KickClock = {
    now: () => t,
    setTimeout(fn, ms) {
      const id = next++;
      timers.push({ at: t + ms, fn, id });
      return id;
    },
    clearTimeout(h) {
      timers = timers.filter((x) => x.id !== h);
    },
  };
  const advance = (ms: number) => {
    t += ms;
    const due = timers.filter((x) => x.at <= t);
    timers = timers.filter((x) => x.at > t);
    due.forEach((x) => x.fn());
  };
  return { clock, advance, pending: () => timers.length };
}

function setup() {
  const c = fakeClock();
  const shown: (string | null)[] = [];
  const k = kickConfirm((id) => shown.push(id), c.clock);
  return { ...c, k, shown };
}

test('the first click arms the button and kicks nobody', () => {
  const { k, shown } = setup();
  assert.equal(k.click('a'), false);
  assert.deepEqual(shown, ['a']);
});

test('a second click within the settle time is ignored, so a double click never confirms', () => {
  const { k, advance, shown } = setup();
  k.click('a');
  advance(KICK_SETTLE_MS - 1);
  assert.equal(k.click('a'), false);
  assert.deepEqual(shown, ['a'], 'still armed');
  advance(1);
  assert.equal(k.click('a'), true, 'once settled, the next click confirms');
  assert.deepEqual(shown, ['a', null]);
});

test('an armed kick lets go after a few seconds', () => {
  const { k, advance, shown, pending } = setup();
  k.click('a');
  advance(KICK_ARMED_MS);
  assert.deepEqual(shown, ['a', null]);
  assert.equal(pending(), 0);
  assert.equal(k.click('a'), false, 'arms again rather than confirming');
});

test("clicking another player's button moves the arming there, with its own settle time", () => {
  const { k, advance, shown, pending } = setup();
  k.click('a');
  advance(1000);
  assert.equal(k.click('b'), false);
  assert.deepEqual(shown, ['a', 'b']);
  assert.equal(pending(), 1, 'one timer, for b');
  advance(100);
  assert.equal(k.click('b'), false, 'b has only just armed');
  advance(KICK_SETTLE_MS);
  assert.equal(k.click('b'), true);
});

test('the time to confirm runs from the first click, not the ignored one', () => {
  const { k, advance, shown } = setup();
  k.click('a');
  advance(200);
  k.click('a');
  advance(KICK_ARMED_MS - 200);
  assert.equal(shown.at(-1), null);
});

test('dispose clears the pending timer', () => {
  const { k, pending } = setup();
  k.click('a');
  k.dispose();
  assert.equal(pending(), 0);
});
