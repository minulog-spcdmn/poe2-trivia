import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANNOUNCED_DAY, countdown, dawn, dayIn, figure, launchWhen, progress, untilChange, LAUNCH_AT, LAUNCH_DAY, LAUNCH_WINDOW, OUT_FOR_DAYS } from '../src/lib/launch.ts';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** A moment in Pacific time, given as its UTC offset that day (-8 in winter, -7 in summer). */
const pacific = (iso: string, offset = -8) => Date.parse(`${iso}Z`) - offset * HOUR;
const LA = 'America/Los_Angeles';

test('the launch is as GGG announced it: December 11, 2026, Pacific time, the 12th in Japan, and its hour, once named, in that', () => {
  assert.equal(LAUNCH_DAY, '2026-12-11');
  // From Japan's midnight (07:00 in California) to the end of the 11th in California.
  assert.equal(LAUNCH_WINDOW.from, pacific('2026-12-11T07:00:00'));
  assert.equal(LAUNCH_WINDOW.to, pacific('2026-12-12T00:00:00'));
  // (Setting the hour needs no change here: written with the wrong zone, it falls outside.)
  assert.ok(LAUNCH_AT === null || (LAUNCH_AT >= LAUNCH_WINDOW.from && LAUNCH_AT < LAUNCH_WINDOW.to), `LAUNCH_AT ${LAUNCH_AT && new Date(LAUNCH_AT).toISOString()} is outside GGG's day`);
  // A Friday, as their launches are.
  assert.match(launchWhen(LAUNCH_DAY, null), /^Friday 11 December \(Pacific time\)$/);
});

test("with no hour, the days go by the player's own calendar, to the first day the launch can fall on there", () => {
  // November 5 in California: 36 days to December 11, from its first minute to its last.
  assert.deepEqual(countdown(pacific('2026-11-05T00:00:00'), null, LA), { kind: 'days', days: 36 });
  assert.deepEqual(countdown(pacific('2026-11-05T23:59:00'), null, LA), { kind: 'days', days: 36 });
  // Berlin, early on the 6th (still the 5th in California): 35 to the 11th there.
  assert.deepEqual(countdown(Date.parse('2026-11-06T05:00:00+01:00'), null, 'Europe/Berlin'), { kind: 'days', days: 35 });
  // Tokyo, all through the 6th (the 5th in California till 17:00): 36 to the 12th there, GGG's date for Japan.
  assert.deepEqual(countdown(Date.parse('2026-11-06T10:00:00+09:00'), null, 'Asia/Tokyo'), { kind: 'days', days: 36 });
  assert.deepEqual(countdown(Date.parse('2026-11-06T18:00:00+09:00'), null, 'Asia/Tokyo'), { kind: 'days', days: 36 });
  // Summer time ended on November 1 in California: October 31 is 41 days to go, November 1 40.
  assert.deepEqual(countdown(pacific('2026-10-31T23:59:00', -7), null, LA), { kind: 'days', days: 41 });
  assert.deepEqual(countdown(pacific('2026-11-01T00:00:00', -7), null, LA), { kind: 'days', days: 40 });
});

test('with no hour, the day before is tomorrow, the day itself today, then out once it can no longer be to come, for a week', () => {
  assert.deepEqual(countdown(pacific('2026-12-09T12:00:00'), null, LA), { kind: 'days', days: 2 });
  assert.deepEqual(countdown(pacific('2026-12-10T00:00:00'), null, LA), { kind: 'tomorrow' });
  assert.deepEqual(countdown(pacific('2026-12-10T23:59:59'), null, LA), { kind: 'tomorrow' });
  assert.deepEqual(countdown(pacific('2026-12-11T00:00:00'), null, LA), { kind: 'today' });
  assert.deepEqual(countdown(pacific('2026-12-11T23:59:59'), null, LA), { kind: 'today' });
  assert.deepEqual(countdown(pacific('2026-12-12T00:00:00'), null, LA), { kind: 'out' });
  assert.deepEqual(countdown(pacific('2026-12-18T23:59:59'), null, LA), { kind: 'out' });
  assert.equal(countdown(pacific('2026-12-19T00:00:00'), null, LA), null);
  // Tokyo: the evening of the 11th there is the day before; the 12th the day itself, till the 11th ends in California (17:00).
  assert.deepEqual(countdown(Date.parse('2026-12-11T17:30:00+09:00'), null, 'Asia/Tokyo'), { kind: 'tomorrow' });
  assert.deepEqual(countdown(Date.parse('2026-12-12T10:00:00+09:00'), null, 'Asia/Tokyo'), { kind: 'today' });
  assert.deepEqual(countdown(Date.parse('2026-12-12T17:00:00+09:00'), null, 'Asia/Tokyo'), { kind: 'out' });
  // Auckland likewise.
  assert.deepEqual(countdown(Date.parse('2026-12-11T21:30:00+13:00'), null, 'Pacific/Auckland'), { kind: 'tomorrow' });
});

test("with the hour, the days by the player's own calendar while two or more are left, then the time left, then out from the moment", () => {
  // 13:00 in California: 22:00 in Berlin on the 11th, 06:00 in Tokyo on the 12th.
  const at = pacific('2026-12-11T13:00:00');
  // Noon on November 5 in California: 36 days, in Berlin too; in Tokyo it's the 6th, and the launch the 12th.
  const nov5 = pacific('2026-11-05T12:00:00');
  assert.deepEqual(countdown(nov5, at, LA), { kind: 'days', days: 36 });
  assert.deepEqual(countdown(nov5, at, 'Europe/Berlin'), { kind: 'days', days: 36 });
  assert.deepEqual(countdown(nov5, at, 'Asia/Tokyo'), { kind: 'days', days: 36 });
  // Naming the hour changes no count there, at any hour of the day.
  for (const [zone, offset] of [[LA, -8], ['Europe/Berlin', 1], ['Asia/Tokyo', 9]] as const) {
    for (let h = 0; h < 24; h++) {
      const t = Date.parse(`2026-11-06T${String(h).padStart(2, '0')}:30:00Z`) - offset * HOUR;
      assert.deepEqual(countdown(t, at, zone), countdown(t, null, zone), `${zone} at ${h}:30`);
    }
  }
  // Two days and a minute before, in Berlin: the 9th at 21:59, two days by the calendar.
  assert.deepEqual(countdown(at - 2 * DAY - MINUTE, at, 'Europe/Berlin'), { kind: 'days', days: 2 });
  assert.deepEqual(countdown(at - 2 * DAY, at, 'Europe/Berlin'), { kind: 'days', days: 2 });
  assert.deepEqual(countdown(at - 2 * DAY + 1, at), { kind: 'left', ms: 2 * DAY - 1 });
  assert.deepEqual(countdown(at - 1, at), { kind: 'left', ms: 1 });
  assert.deepEqual(countdown(at, at), { kind: 'out' });
  assert.deepEqual(countdown(at + OUT_FOR_DAYS * DAY - 1, at), { kind: 'out' });
  assert.equal(countdown(at + OUT_FOR_DAYS * DAY, at), null);
});

test('the words give the time left in hours while two or more are left, then minutes, then seconds, rounded up, never 0 before the moment', () => {
  assert.deepEqual(figure({ kind: 'days', days: 36 }), { n: 36, until: 'days until' });
  assert.deepEqual(figure({ kind: 'days', days: 2 }), { n: 2, until: 'days until' });
  assert.deepEqual(figure({ kind: 'tomorrow' }), { n: 1, until: 'day until' });
  assert.deepEqual(figure({ kind: 'left', ms: 2 * DAY - 1 }), { n: 48, until: 'hours until' });
  assert.deepEqual(figure({ kind: 'left', ms: 2 * HOUR }), { n: 2, until: 'hours until' });
  // Never "1 hour" with nearly two to go: the minutes, from 119.
  assert.deepEqual(figure({ kind: 'left', ms: 2 * HOUR - 1000 }), { n: 119, until: 'minutes until' });
  assert.deepEqual(figure({ kind: 'left', ms: HOUR - 500 }), { n: 60, until: 'minutes until' });
  assert.deepEqual(figure({ kind: 'left', ms: 2 * MINUTE }), { n: 2, until: 'minutes until' });
  assert.deepEqual(figure({ kind: 'left', ms: 2 * MINUTE - 1000 }), { n: 119, until: 'seconds until' });
  assert.deepEqual(figure({ kind: 'left', ms: MINUTE - 1000 }), { n: 59, until: 'seconds until' });
  assert.deepEqual(figure({ kind: 'left', ms: 1 }), { n: 1, until: 'second until' });
  // On the day, and the week after, no number.
  assert.deepEqual(figure({ kind: 'today' }), { n: null, until: 'launches today' });
  assert.deepEqual(figure({ kind: 'out' }), { n: null, until: 'is out' });
});

test("its sand has run as far as it has come from GGG's announcement to the launch", () => {
  assert.equal(ANNOUNCED_DAY, '2026-08-25');
  // By the player's calendar with no hour: November 5 in California is 72 of the 108 days; in Tokyo, to the 12th, of 109.
  assert.equal(progress(pacific('2026-08-25T12:00:00', -7), null, LA), 0);
  assert.equal(progress(pacific('2026-11-05T23:59:00'), null, LA), 72 / 108);
  assert.equal(progress(Date.parse('2026-11-05T12:00:00+09:00'), null, 'Asia/Tokyo'), 72 / 109);
  assert.equal(progress(pacific('2026-12-11T00:00:00'), null, LA), 1);
  // Never past either end.
  assert.equal(progress(pacific('2026-08-01T12:00:00', -7), null, LA), 0);
  assert.equal(progress(pacific('2026-12-15T12:00:00'), null, LA), 1);
  // With the hour, by the clock from the announced day's midnight in California.
  const at = pacific('2026-12-11T13:00:00');
  const from = pacific('2026-08-25T00:00:00', -7);
  assert.equal(progress(from, at), 0);
  assert.equal(progress((from + at) / 2, at), 0.5);
  assert.equal(progress(at, at), 1);
});

test('it looks again just past each change: each minute of the clock, or in the last two days the next step of its figure', () => {
  const at = pacific('2026-12-11T13:00:00');
  // No hour: just past the next whole minute of the clock (the turn of a day in Pacific time falls on one).
  assert.equal(untilChange(pacific('2026-11-05T23:59:30'), null), 30_020);
  // The hour named, days to go: the same, the turn of a day on the player's own calendar falling on one too.
  assert.equal(untilChange(at - 5 * DAY - 15_000, at), 15_020);
  // The last two days: just past the figure's next step, 5 hours left going to 4 once under 5 hours, 42 minutes to 41, 3 seconds to 2.
  assert.equal(untilChange(at - 2 * HOUR - 30_000, at), 30_000 + 1_000 + 20);
  assert.equal(untilChange(at - 5 * HOUR - 12 * MINUTE - 7_250, at), 12 * MINUTE + 7_250 + 1_000 + 20);
  assert.equal(untilChange(at - 42 * MINUTE - 9_500, at), 9_500 + 1_000 + 20);
  assert.equal(untilChange(at - HOUR, at), 1_000 + 20);
  assert.equal(untilChange(at - 3_000, at), 1_020);
  // Out: each minute, till it goes.
  assert.equal(untilChange(at + 15_000, at), 45_020);
});

test("with the hour named, the note gives it in the player's own zone", () => {
  const at = pacific('2026-12-11T13:00:00');
  // (The test runner's zone and clock: the date and an hour, whichever way the clock shows it.)
  assert.match(launchWhen(LAUNCH_DAY, at), /^\w+day \d{1,2} December at \d{1,2}:00( [ap]m)?, your time$/i);
  assert.equal(dayIn(at, 'America/Los_Angeles'), Date.UTC(2026, 11, 11) / DAY);
  assert.equal(dayIn(at, 'Asia/Tokyo'), Date.UTC(2026, 11, 12) / DAY);
});

test('the Shadow comes out of the shadow over the last day, wholly at the launch', () => {
  assert.equal(dawn({ kind: 'days', days: 2 }), 0);
  assert.equal(dawn({ kind: 'left', ms: 2 * DAY - 1 }), 0);
  assert.equal(dawn({ kind: 'left', ms: DAY }), 0);
  assert.equal(dawn({ kind: 'left', ms: 6 * HOUR }), 0.75);
  assert.equal(dawn({ kind: 'out' }), 1);
  // With the day alone known: partly the day before, most of the way on the day.
  assert.ok(dawn({ kind: 'tomorrow' }) > 0 && dawn({ kind: 'tomorrow' }) < dawn({ kind: 'today' }) && dawn({ kind: 'today' }) < 1);
});
