// Today's unique's days (lib/daily.ts DailyLog): the run they come to is the
// one answering each in turn makes, and they merge the same whichever way
// round, however often, from however many devices.

import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { DAILY_KEY, DAYS_KEY, GRACE_DAYS, GRACE_SINCE, absorbDaily, absorbDays, answerDaily, answerLog, daysOf, dropAhead, graceOn, loadLog, mergeLogs, ownDaysRaw, parseLog, replay, saveLog, settleDays, streakOn, upTo, type DailyLog, type DailyRecord } from '../src/lib/daily.ts';
import { memoryStorage, seeded } from './helpers.ts';

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = memoryStorage(store);
beforeEach(() => store.clear());

const D = GRACE_SINCE + 1000;
/** Where an older build's record is noted as taken into the days (lib/daily settleDays). */
const TAKEN_KEY = `${DAILY_KEY}.taken`;
/** The record this device's days come to, every day held counted. */
const loadDaily = () => replay(loadLog());
/** A run of right answers on each day from `from` to `to`, as a device answering them makes it. */
function rightDays(from: number, to: number, log: DailyLog | null = null): DailyLog | null {
  for (let day = from; day <= to; day++) log = answerLog(log, day, 0, true);
  return log;
}

test('on one device the days come to what answering each in turn made', () => {
  for (let trial = 0; trial < 400; trial++) {
    const rng = seeded(trial + 1);
    let rec: DailyRecord | null = null;
    let log: DailyLog | null = null;
    let day = D;
    for (let step = 0; step < 60; step++) {
      // Most days answered, some skipped (one or two), now and then the same day again or a day gone by (a clock put back).
      const r = rng();
      day += r < 0.06 ? 0 : r < 0.1 ? -3 : r < 0.25 ? 2 : r < 0.32 ? 3 : 1;
      const picked = Math.floor(rng() * 4);
      const ok = rng() < 0.85;
      rec = answerDaily(rec, day, picked, ok);
      log = answerLog(log, day, picked, ok);
      assert.deepEqual(replay(log), rec, `trial ${trial}, step ${step}`);
      for (const later of [day, day + 1, day + 2, day + 3]) {
        assert.equal(streakOn(replay(log), later), streakOn(rec, later));
        assert.equal(graceOn(replay(log), later), graceOn(rec, later));
      }
      day = Math.max(day, rec.day);
    }
  }
});

test("once the server has said the day, today's is answered beside days still to come, each counted on its own day", () => {
  for (let trial = 0; trial < 300; trial++) {
    const rng = seeded(9000 + trial);
    let log: DailyLog | null = null;
    /** Each day's answer, as given, to count in day order. */
    const given = new Map<number, [number, boolean]>();
    const answer = (on: number, sure: boolean, step: string) => {
      const picked = Math.floor(rng() * 4);
      const ok = rng() < 0.85;
      const next = answerLog(log, on, picked, ok, sure);
      // A day takes an answer while it has none, and on the device's own clock only while no later day has one.
      const open = !given.has(on) && (sure || ![...given.keys()].some((day) => day > on));
      assert.equal(next !== log, open, `trial ${trial}, ${step}`);
      if (open) given.set(on, [picked, ok]);
      log = next;
    };
    for (let day = D; day < D + 60; day++) {
      // Tomorrow's now and then on a clock a day ahead (before or after today's, with the server's day known), today's mostly.
      const ahead = rng() < 0.2;
      const first = rng() < 0.5;
      if (ahead && first) answer(day + 1, false, `${day} ahead first`);
      if (rng() < 0.8) answer(day, true, `${day}`);
      if (ahead && !first) answer(day + 1, false, `${day} ahead after`);
      let rec: DailyRecord | null = null;
      for (const d of [...given.keys()].sort((a, b) => a - b)) if (d <= day) rec = answerDaily(rec, d, ...given.get(d)!);
      assert.deepEqual(replay(log, day), rec, `trial ${trial}, day ${day}`);
    }
  }
});

/** Days a device might hold: any answers (right with or without the option known, wrong) on any of 40 days. */
function anyLog(rng: () => number): DailyLog | null {
  let days = '';
  for (let i = 0; i < 40; i++) days += rng() < 0.45 ? '.' : '012345678'[Math.floor(rng() * 9)];
  return parseLog(JSON.stringify({ from: D + Math.floor(rng() * 10), days }));
}

test('days merge the same whichever way round, grouped however, and taking the same days again changes nothing', () => {
  for (let trial = 0; trial < 500; trial++) {
    const rng = seeded(1000 + trial);
    const [a, b, c] = [anyLog(rng), anyLog(rng), anyLog(rng)];
    assert.deepEqual(mergeLogs(a, b), mergeLogs(b, a), `commutes, trial ${trial}`);
    assert.deepEqual(mergeLogs(mergeLogs(a, b), c), mergeLogs(a, mergeLogs(b, c)), `associates, trial ${trial}`);
    assert.deepEqual(mergeLogs(a, a), a, `idempotent, trial ${trial}`);
    assert.deepEqual(mergeLogs(mergeLogs(a, b), b), mergeLogs(a, b), `absorbs, trial ${trial}`);
  }
});

test('one day answered on two devices: a miss over a right answer, a known option over an unknown one', () => {
  const right = answerLog(null, D, 2, true);
  const wrong = answerLog(null, D, 1, false);
  assert.deepEqual(replay(mergeLogs(right, wrong)), { day: D, picked: 1, ok: false, streak: 0, ended: 0, grace: 0 });
  assert.deepEqual(replay(mergeLogs(daysOf({ day: D, picked: 0, ok: true, streak: 2, ended: 0, grace: 0 }), answerLog(null, D - 1, 3, true))), { day: D, picked: 0, ok: true, streak: 2, ended: 0, grace: 0 });
  // The run a miss ends counts the days the other device answered right.
  const before = rightDays(D - 4, D - 1);
  assert.equal(replay(mergeLogs(before, wrong))?.ended, 4);
});

test('a phone and a computer never online together, each answering every other day, come to the whole run when they meet', () => {
  const both = rightDays(D - 9, D);
  let phone = both;
  let computer = both;
  for (let day = D + 1; day <= D + 5; day++) {
    if (day % 2) phone = answerLog(phone, day, 0, true);
    else computer = answerLog(computer, day, 0, true);
  }
  // Apart, each saw days forgotten: the grace, then a run broken.
  assert.equal(replay(phone)?.streak, 1);
  assert.equal(replay(computer)?.streak, 1);
  const met = mergeLogs(phone, computer);
  assert.deepEqual(replay(met), { day: D + 5, picked: 0, ok: true, streak: 15, ended: 0, grace: 0 });
  assert.deepEqual(met, mergeLogs(computer, phone));
});

test('devices meeting at random come to the run of every answer once all have met', () => {
  for (let trial = 0; trial < 200; trial++) {
    const rng = seeded(5000 + trial);
    const devices: (DailyLog | null)[] = [null, null, null];
    let all: DailyLog | null = null;
    for (let day = D; day < D + 50; day++) {
      // Devices answer today, or none does: one that hasn't heard of another's answer gives its own (a second
      // guess, maybe the other way), one that holds today's answer already gives none.
      for (let tries = 0; tries < 2 && rng() < 0.85; tries++) {
        const who = Math.floor(rng() * 3);
        const picked = Math.floor(rng() * 4);
        const ok = rng() < 0.8;
        const next = answerLog(devices[who], day, picked, ok);
        if (next === devices[who]) continue;
        devices[who] = next;
        all = mergeLogs(all, answerLog(null, day, picked, ok));
      }
      // Now and then two meet, and each takes the other's days.
      if (rng() < 0.3) {
        const [x, y] = [Math.floor(rng() * 3), Math.floor(rng() * 3)];
        devices[x] = devices[y] = mergeLogs(devices[x], devices[y]);
      }
    }
    // A relay: the first meets the second, the second the third, the third the first.
    devices[1] = mergeLogs(devices[0], devices[1]);
    devices[2] = mergeLogs(devices[1], devices[2]);
    devices[0] = mergeLogs(devices[2], devices[0]);
    devices[1] = mergeLogs(devices[0], devices[1]);
    for (const d of devices) {
      assert.deepEqual(d, all, `trial ${trial}`);
      assert.deepEqual(replay(d), replay(all));
    }
  }
});

test('a grace once forgiven comes back after seven right answers, whichever device gave them', () => {
  let phone = rightDays(D - 2, D);
  // D + 1 forgotten; the computer, which has the phone's days, answers D + 2 by the grace.
  let computer = answerLog(phone, D + 2, 0, true);
  assert.equal(replay(computer)?.grace, GRACE_DAYS - 1);
  // Then they take turns, meeting each time, through D + 8: the grace is back.
  for (let day = D + 3; day <= D + 8; day++) {
    if (day % 2) phone = answerLog(mergeLogs(phone, computer), day, 0, true);
    else computer = answerLog(mergeLogs(phone, computer), day, 0, true);
  }
  assert.equal(replay(mergeLogs(phone, computer))?.grace, 0);
  assert.equal(replay(mergeLogs(phone, computer))?.streak, 10);
});

test("before the days were kept, the record stands for its run: it comes out the same, and the days are kept from it", () => {
  const old = JSON.stringify({ day: D, picked: 2, ok: true, streak: 30, ended: 0 });
  store.set(DAILY_KEY, old);
  assert.deepEqual(loadDaily(), { day: D, picked: 2, ok: true, streak: 30, ended: 0, grace: 0 });
  // Sync passes it on as days before the start page has kept them.
  assert.deepEqual(parseLog(ownDaysRaw()), daysOf({ day: D, picked: 2, ok: true, streak: 30, ended: 0, grace: 0 }));
  assert.ok(settleDays());
  assert.deepEqual(parseLog(store.get(DAYS_KEY) ?? null), daysOf({ day: D, picked: 2, ok: true, streak: 30, ended: 0, grace: 0 }));
  // The record stays as it was, for an older build should the site go back to one; noted as taken in, it isn't again.
  assert.equal(store.get(DAILY_KEY), old);
  assert.equal(store.get(TAKEN_KEY), old);
  assert.ok(!settleDays(), 'kept once');
  // Never written again: an older build reading it would count the grace's days as days in a row.
  saveLog(answerLog(loadLog(), D + 2, 1, true));
  assert.equal(store.get(DAILY_KEY), old);
  assert.deepEqual(loadDaily(), { day: D + 2, picked: 1, ok: true, streak: 31, ended: 0, grace: GRACE_DAYS - 1 });
  // An older build answering since (the site gone back to one, or a tab of it left open): taken in.
  store.set(DAILY_KEY, JSON.stringify({ day: D + 3, picked: 0, ok: true, streak: 1, ended: 0 }));
  assert.ok(settleDays());
  assert.equal(loadDaily()?.streak, 32);
});

test('a record taken in stands for its run again once the days it went into are damaged', () => {
  store.set(DAILY_KEY, JSON.stringify({ day: D, picked: 2, ok: true, streak: 30, ended: 0 }));
  settleDays();
  store.set(DAYS_KEY, '{"from":');
  assert.equal(loadDaily()?.streak, 30);
  // Kept again, the damaged days aside.
  assert.ok(settleDays());
  assert.equal(store.get(`${DAYS_KEY}.unread`), '{"from":');
  assert.equal(loadDaily()?.streak, 30);
});

test('the days more than a day ahead go from what is stored, and nothing else', () => {
  saveLog(answerLog(answerLog(rightDays(D - 3, D - 1), D + 1, 0, true), D + 4, 0, true));
  assert.ok(dropAhead(D));
  assert.deepEqual(loadLog(), answerLog(rightDays(D - 3, D - 1), D + 1, 0, true));
  assert.ok(!dropAhead(D), 'once');
});

test('the record stays, not noted as taken in, until the days could be kept (storage full)', () => {
  const real = (globalThis as { localStorage?: unknown }).localStorage;
  (globalThis as { localStorage?: unknown }).localStorage = memoryStorage(store, (key) => key !== DAYS_KEY);
  try {
    store.set(DAILY_KEY, JSON.stringify({ day: D, picked: 2, ok: true, streak: 30, ended: 0 }));
    assert.ok(!settleDays());
    assert.ok(store.has(DAILY_KEY));
    assert.ok(!store.has(TAKEN_KEY));
    assert.equal(loadDaily()?.streak, 30);
  } finally {
    (globalThis as { localStorage?: unknown }).localStorage = real;
  }
});

test("days a newer build kept are never written over; damaged ones are kept aside first; none that couldn't be read back", () => {
  const newer = JSON.stringify({ v: 2, from: D, days: '0x' });
  store.set(DAYS_KEY, newer);
  assert.ok(!saveLog(answerLog(null, D, 0, true)));
  assert.equal(store.get(DAYS_KEY), newer);
  store.set(DAYS_KEY, '{"from":');
  assert.ok(saveLog(answerLog(null, D, 0, true)));
  assert.equal(store.get(`${DAYS_KEY}.unread`), '{"from":');
  assert.equal(loadDaily()?.day, D);
  // A clock far past any real one: not kept, so the days already kept aren't lost on the next load.
  assert.ok(!saveLog(answerLog(loadLog(), 200_000, 0, true)));
  assert.equal(loadDaily()?.day, D);
});

test("two older builds' records that each lost the other's miss, taken in once the grace came in: the day between isn't forgiven", () => {
  // Before the grace: the phone's run of 20 to E - 30; the computer took it, missed E - 29, and has 28 right since.
  const E = GRACE_SINCE - 1;
  const phone = daysOf({ day: E - 30, picked: 0, ok: true, streak: 20, ended: 0, grace: 0 });
  const computer = daysOf({ day: E - 1, picked: 0, ok: true, streak: 28, ended: 0, grace: 0 });
  assert.equal(replay(mergeLogs(phone, computer))?.streak, 28);
});

test("this device's own record from a clock a day ahead: its run counts up to today, its own day waits", () => {
  store.set(DAILY_KEY, JSON.stringify({ day: D + 1, picked: 2, ok: true, streak: 30, ended: 0 }));
  settleDays();
  assert.deepEqual(replay(loadLog(), D), { day: D, picked: -1, ok: true, streak: 29, ended: 0, grace: 0 });
  assert.deepEqual(replay(loadLog(), D + 1), { day: D + 1, picked: 2, ok: true, streak: 30, ended: 0, grace: 0 });
  // Further ahead, once the server has said the day: the days past tomorrow go, the run up to then stays, and isn't taken in again.
  store.clear();
  store.set(DAILY_KEY, JSON.stringify({ day: D + 5, picked: 2, ok: true, streak: 30, ended: 0 }));
  settleDays();
  saveLog(upTo(loadLog(), D));
  settleDays();
  assert.equal(replay(loadLog(), D)?.streak, 25);
  assert.equal(loadLog()!.from + loadLog()!.days.length - 1, D + 1);
});

test("a paired device's answer just past its midnight, before this one's, stays on its day", () => {
  saveLog(rightDays(D - 5, D - 1));
  assert.ok(absorbDays(JSON.stringify(answerLog(rightDays(D - 5, D - 1), D + 1, 3, true)), D));
  // Still D here: today's answer is open, and the run as it was.
  assert.equal(replay(loadLog(), D)?.day, D - 1);
  saveLog(answerLog(loadLog(), D, 1, true, true));
  assert.deepEqual(replay(loadLog(), D + 1), { day: D + 1, picked: 3, ok: true, streak: 7, ended: 0, grace: 0 });
});

test('answers given ahead on a clock set forward fill no forgotten day', () => {
  // D - 3 and D - 2 forgotten: the run is over. On D, offline, the clock set to D + 1 and D + 2 and both answered.
  const log = answerLog(answerLog(rightDays(D - 10, D - 4), D + 1, 0, true), D + 2, 0, true);
  assert.equal(streakOn(replay(log, D), D), 0);
  // Back online, today's is answered too: one new run, each answer on its own question's day.
  const all = answerLog(log, D, 0, true, true);
  assert.equal(replay(all, D)?.streak, 1);
  assert.equal(replay(all, D + 2)?.streak, 3);
});

test('an older build in another tab answering is taken as its days, its run worked out here (with the grace)', () => {
  store.set(DAILY_KEY, JSON.stringify({ day: D, picked: 0, ok: true, streak: 10, ended: 0 }));
  settleDays();
  // D + 1 forgotten. The old tab still has its record from D: to it D + 2 starts a new run.
  store.set(DAILY_KEY, JSON.stringify({ day: D + 2, picked: 3, ok: true, streak: 1, ended: 0 }));
  assert.deepEqual(loadDaily(), { day: D + 2, picked: 3, ok: true, streak: 11, ended: 0, grace: GRACE_DAYS - 1 });
});

test("another device's days are taken in; an older build's record as its run's days; nothing from more than a day ahead", () => {
  saveLog(rightDays(D - 4, D - 1));
  assert.ok(absorbDays(JSON.stringify(answerLog(null, D, 1, true)), D));
  assert.equal(loadDaily()?.streak, 5);
  assert.ok(!absorbDays(JSON.stringify(answerLog(null, D, 1, true)), D), 'the same again changes nothing');
  assert.ok(!absorbDays(JSON.stringify(answerLog(null, D + 2, 1, true)), D), 'not yet');
  // Days still to come in them don't keep out the rest: they go, and an older build's run stays up to tomorrow.
  store.clear();
  const ahead = mergeLogs(rightDays(D - 3, D - 2), daysOf({ day: D + 4, picked: 1, ok: true, streak: 5, ended: 0, grace: 0 }));
  assert.ok(absorbDays(JSON.stringify(ahead), D));
  assert.deepEqual(loadLog(), parseLog(JSON.stringify({ from: D - 3, days: '00.88' })));
  saveLog(rightDays(D - 4, D));
  assert.ok(!absorbDays('{"from":1,"days":"x"}', D));
  // An older build's record, its run of 7 reaching D + 1: the days of it not known here count too.
  assert.ok(absorbDaily(JSON.stringify({ day: D + 1, picked: 0, ok: true, streak: 7, ended: 0 }), D + 1));
  assert.deepEqual(loadDaily(), { day: D + 1, picked: 0, ok: true, streak: 7, ended: 0, grace: 0 });
  assert.ok(!absorbDaily(JSON.stringify({ day: D + 3, picked: 0, ok: true, streak: 9, ended: 0 }), D + 1), 'not yet');
  // A miss elsewhere on a day answered right here: the miss stands.
  assert.ok(absorbDaily(JSON.stringify({ day: D + 1, picked: 2, ok: false, streak: 0, ended: 6 }), D + 1));
  assert.deepEqual(loadDaily(), { day: D + 1, picked: 2, ok: false, streak: 0, ended: 6, grace: 0 });
});
