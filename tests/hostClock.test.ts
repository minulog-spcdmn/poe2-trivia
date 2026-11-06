// A guest's reckoning of its host's clock (lib/hostClock.ts): the closest
// sample kept, until either clock is set.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLOCK_SET_MS, sampleHostClock, type HostClock } from '../src/lib/hostClock.ts';

/** The host's clock 5 s ahead of this device's; the steady clocks start at 0. */
const AHEAD = 5000;
const START = 1_790_000_000_000;

/**
 * A message arriving at `steady` on this device's steady clock, `late` ms
 * after the host sent it; either device's clock set by `mineSet` or `hostSet`
 * since the room began.
 */
function sample(was: HostClock | null, at: { steady: number; late: number; mineSet?: number; hostSet?: number }) {
  const now = START + at.steady + (at.mineSet ?? 0);
  const sent = START + AHEAD + at.steady - at.late + (at.hostSet ?? 0);
  return sampleHostClock(was, sent, START + AHEAD + (at.hostSet ?? 0), now, at.steady);
}

test('the closest sample is kept: one late message moves nothing', () => {
  let c = sample(null, { steady: 1000, late: 40 });
  assert.equal(c.offset, AHEAD - 40);
  c = sample(c, { steady: 2000, late: 1500 });
  assert.equal(c.offset, AHEAD - 40, 'queued behind pictures');
  c = sample(c, { steady: 3000, late: 10 });
  assert.equal(c.offset, AHEAD - 10, 'a quicker one is closer');
});

test("this device's clock set forward (or back) mid-room: the countdowns follow it at the next message", () => {
  let c = sample(null, { steady: 1000, late: 20 });
  c = sample(c, { steady: 2000, late: 20, mineSet: 60_000 });
  assert.equal(c.offset, AHEAD - 60_000 - 20, 'set forward a minute: the host is a minute nearer');
  c = sample(c, { steady: 3000, late: 20, mineSet: -3_600_000 });
  assert.equal(c.offset, AHEAD + 3_600_000 - 20, 'set back an hour');
});

test("the host's clock set back mid-room: its next message says so, and the reckoning starts again", () => {
  let c = sample(null, { steady: 1000, late: 20 });
  c = sample(c, { steady: 2000, late: 20, hostSet: -30_000 });
  assert.equal(c.offset, AHEAD - 30_000 - 20);
  // A late one after it doesn't take it back.
  c = sample(c, { steady: 3000, late: 900, hostSet: -30_000 });
  assert.equal(c.offset, AHEAD - 30_000 - 20);
});

test('a clock drifting under CLOCK_SET_MS between two messages is the same clock; a host that says no base is taken as steady', () => {
  let c = sample(null, { steady: 1000, late: 20 });
  c = sample(c, { steady: 2000, late: 20, mineSet: CLOCK_SET_MS - 1 });
  assert.equal(c.offset, AHEAD - 20, 'the closer of the two kept');
  // (Sent 500 ms before it came: later than the one kept.)
  const unsaid = sampleHostClock(c, START + AHEAD + 3000 - 500, undefined, START + 3000 + CLOCK_SET_MS - 1, 3000);
  assert.equal(unsaid.offset, c.offset);
});
