import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Engine, TWINS, allArt, answerDrawn, isFake, type Question } from '../src/lib/game.ts';
import { DAILY_LAUNCH, GRACE_DAYS, GRACE_SINCE, TOO_THIN, dailyEngine, graceOn, aTopic, answerDaily, answerLog, askOne, daysOf, dailyGame, answeredOn, dailyQuestion, hoursLeft, minutesLeft, nextIn, parseDaily, parseLog, replay, streakOn, untilNextMinute, upTo, utcDay, type DailyRecord } from '../src/lib/daily.ts';
import { fakes, items, seeded } from './helpers.ts';

const HOUR = 3_600_000;
const at = (iso: string) => Date.parse(iso);

test('the day turns over at midnight UTC, wherever the player is', () => {
  assert.equal(utcDay(at('2026-10-09T23:59:59.999Z')) + 1, utcDay(at('2026-10-10T00:00:00Z')));
  assert.equal(utcDay(at('2026-10-10T00:00:00+02:00')), utcDay(at('2026-10-09T22:00:00Z')));
});

test('the next one is counted in whole hours, rounded up, then minutes in the last hour, and the word is spelled out', () => {
  assert.equal(hoursLeft(at('2026-10-09T13:00:00Z')), 11);
  assert.equal(hoursLeft(at('2026-10-09T12:30:00Z')), 12);
  assert.equal(hoursLeft(at('2026-10-09T00:00:00Z')), 24);
  assert.equal(hoursLeft(at('2026-10-09T23:59:00Z')), 1);
  assert.equal(nextIn(at('2026-10-09T13:00:00Z')), 'next in 11 hours');
  assert.equal(nextIn(at('2026-10-09T23:00:00Z')), 'next in 1 hour');
  assert.equal(nextIn(at('2026-10-09T22:59:30Z')), 'next in 2 hours');
  assert.equal(minutesLeft(at('2026-10-09T23:34:30Z')), 26);
  assert.equal(nextIn(at('2026-10-09T23:00:01Z')), 'next in 1 hour');
  assert.equal(nextIn(at('2026-10-09T23:01:00Z')), 'next in 59 minutes');
  assert.equal(nextIn(at('2026-10-09T23:30:00Z')), 'next in 30 minutes');
  assert.equal(nextIn(at('2026-10-09T23:59:30Z')), 'next in 1 minute');
  assert.equal(nextIn(at('2026-10-09T23:50:00Z'), 'daily'), 'next daily in 10 minutes');
  assert.equal(nextIn(at('2026-10-09T13:00:00Z'), 'daily'), 'next daily in 11 hours');
  assert.doesNotMatch(nextIn(at('2026-10-09T13:00:00Z')), /\dh\b/);
});

test('the countdown is ticked on just as a minute ends', () => {
  assert.equal(untilNextMinute(at('2026-10-09T23:12:59.000Z')), 1000);
  assert.equal(untilNextMinute(at('2026-10-09T23:12:00.000Z')), 60_000);
  assert.equal(untilNextMinute(at('2026-10-09T23:12:00.001Z')), 59_999);
  // Where it ticks, the minutes left have just gone down.
  const t = at('2026-10-09T23:12:34.567Z');
  assert.equal(minutesLeft(t + untilNextMinute(t)), minutesLeft(t) - 1);
});

test("the day's question is the same every time it is dealt", () => {
  for (const day of [utcDay(DAILY_LAUNCH), utcDay(DAILY_LAUNCH) + 1, utcDay(DAILY_LAUNCH) + 213]) {
    const a = dailyQuestion(items, fakes, day);
    const b = dailyQuestion(items, fakes, day);
    assert.equal(a.itemId, b.itemId);
    assert.deepEqual(a.options, b.options);
    assert.deepEqual(a.labels, b.labels);
  }
});

/** A day's question, in short. */
const dealt = (day: number) => {
  const q = dailyQuestion(items, fakes, day);
  return createHash('sha256').update(JSON.stringify([q.itemId, q.options, q.labels])).digest('hex').slice(0, 8);
};

test("a day's question never changes, twins and all", () => {
  // The year from launch, each day as it was first dealt: a change to how
  // questions are dealt (game.ts makeQuestion) must leave the daily's be,
  // as twins (game.ts TWINS) do.
  const first = utcDay(DAILY_LAUNCH);
  const year = createHash('sha256')
    .update(Array.from({ length: 366 }, (_, i) => dealt(first + i)).join())
    .digest('hex')
    .slice(0, 16);
  assert.equal(year, '1b1d51fb22411642');
});

test('practice asks as the daily does: twins may meet', () => {
  const byName = new Map(items.map((it) => [it.name, it.id]));
  const engine = dailyEngine(items, fakes, { rng: seeded(1) });
  const game = dailyGame();
  const rng = seeded(2);
  let met = 0;
  for (let i = 0; i < 4000; i++) {
    const q = askOne(engine, game, rng);
    if (TWINS.some((t) => t.names.filter((n) => q.options.includes(byName.get(n)!)).length > 1)) met++;
  }
  assert.ok(met > 0, 'twins met');
});

test('each day asks a named item among four names, one of them made up, never a gem', () => {
  const start = utcDay(DAILY_LAUNCH);
  const seen = new Set<string>();
  for (let d = start; d < start + 60; d++) {
    const q = dailyQuestion(items, fakes, d);
    seen.add(q.itemId);
    const item = items.find((it) => it.id === q.itemId)!;
    assert.notEqual(item.kind, 'gem');
    assert.equal(q.mode, 'name');
    assert.equal(q.options.length, 4);
    assert.ok(q.options.includes(q.itemId));
    assert.equal(q.options.filter(isFake).length, 1, `day ${d}: one made-up name`);
    assert.ok(q.labels.every((l) => typeof l === 'string' && l.length > 0));
    assert.equal(new Set(q.labels).size, 4, 'four different names');
  }
  assert.ok(seen.size > 45, `the days ask many items (${seen.size} in 60 days)`);
});

test('the pictures too thin for the start page are real items\' pictures, and never shown there', () => {
  // By the art's id: an item's own, or one of its variants'.
  const byArt = new Map(items.flatMap((it) => allArt(it).map((a) => [a.art, a])));
  const byId = new Map(items.map((it) => [it.id, it]));
  assert.ok(TOO_THIN.size > 0);
  for (const id of TOO_THIN) assert.equal(byArt.get(id)?.kind, 'unique', `${id} is an item's picture`);
  const shown = (q: Question) => answerDrawn(byId.get(q.itemId)!, q).art;
  const start = utcDay(DAILY_LAUNCH);
  for (let d = start; d < start + 400; d++) assert.ok(!TOO_THIN.has(shown(dailyQuestion(items, fakes, d))), `day ${d}`);
  const engine = new Engine(items, { autoClock: true, fakes, rng: seeded(3) });
  const game = dailyGame();
  const rng = seeded(4);
  for (let i = 0; i < 1500; i++) assert.ok(!TOO_THIN.has(shown(askOne(engine, game, rng))), `practice question ${i}`);
});

test('a right answer starts or carries on a streak; two days skipped start it over', () => {
  const d = GRACE_SINCE;
  let rec = answerDaily(null, d, 2, true);
  assert.equal(rec.streak, 1);
  rec = answerDaily(rec, d + 1, 0, true);
  rec = answerDaily(rec, d + 2, 1, true);
  assert.equal(rec.streak, 3);
  assert.equal(streakOn(rec, d + 2), 3, 'today');
  assert.equal(streakOn(rec, d + 3), 3, 'still alive the next day, until answered');
  assert.equal(streakOn(rec, d + 4), 3, 'a day forgotten is forgiven');
  assert.equal(streakOn(rec, d + 5), 0, 'two in a row end it');
  assert.equal(answerDaily(rec, d + 5, 0, true).streak, 1);
});

test('a forgotten day is forgiven once, then again after seven right answers', () => {
  const d = GRACE_SINCE + 100;
  let rec = answerDaily(answerDaily(null, d, 0, true), d + 1, 0, true);
  assert.ok(!graceOn(rec, d + 2), 'not needed the next day');
  assert.ok(graceOn(rec, d + 3));
  // Yesterday forgotten: today's answer carries the run on, the forgiven day uncounted.
  rec = answerDaily(rec, d + 3, 0, true);
  assert.equal(rec.streak, 3);
  assert.equal(rec.grace, GRACE_DAYS - 1, "today's is the first of the seven");
  // Another day forgotten before the grace is back ends the run.
  assert.ok(!graceOn(rec, d + 5));
  assert.equal(streakOn(rec, d + 5), 0);
  // Six more right in a row and it's back.
  for (let day = d + 4; day < d + 3 + GRACE_DAYS; day++) rec = answerDaily(rec, day, 0, true);
  assert.equal(rec.grace, 0);
  assert.equal(streakOn(rec, rec.day + 2), rec.streak);
});

test("the grace is for a day away, not for a wrong answer, and a new run starts with it", () => {
  const d = GRACE_SINCE;
  let rec = answerDaily(null, d, 0, true);
  assert.equal(answerDaily(rec, d + 2, 3, false).ended, 1, 'a miss on the forgiven day ends the run');
  rec = answerDaily(rec, d + 2, 0, true);
  rec = answerDaily(rec, d + 3, 3, false);
  assert.equal(rec.grace, 0);
  rec = answerDaily(rec, d + 4, 0, true);
  assert.ok(graceOn(rec, d + 6));
});

test('a day forgotten before the grace came in ended the run, as the rules then did', () => {
  const rec = answerDaily(answerDaily(null, GRACE_SINCE - 3, 0, true), GRACE_SINCE - 2, 0, true);
  assert.ok(!graceOn(rec, GRACE_SINCE));
  assert.equal(answerDaily(rec, GRACE_SINCE, 0, true).streak, 1);
  // The first day it forgives is the day it came in.
  assert.ok(graceOn(answerDaily(rec, GRACE_SINCE - 1, 0, true), GRACE_SINCE + 1));
});

test('a miss ends the streak and remembers how long it was', () => {
  let rec: DailyRecord = answerDaily(null, 10, 0, true);
  rec = answerDaily(rec, 11, 0, true);
  rec = answerDaily(rec, 12, 3, false);
  assert.deepEqual(rec, { day: 12, picked: 3, ok: false, streak: 0, ended: 2, grace: 0 });
  assert.equal(streakOn(rec, 12), 0);
  assert.equal(answerDaily(rec, 13, 1, true).streak, 1);
});

test("today's question is answered once: a second answer (another tab, a reload) changes nothing", () => {
  const rec = answerDaily(null, 5, 1, true);
  assert.equal(answerDaily(rec, 5, 2, false), rec);
  assert.equal(answeredOn(rec, 5), rec);
  assert.equal(answeredOn(rec, 6), null);
});

test("an older build's stored record is checked before use, and stands for the days of its run", () => {
  const older = { day: 5, picked: 1, ok: true, streak: 1, ended: 0 };
  assert.deepEqual(parseDaily(JSON.stringify(older)), { ...older, grace: 0 });
  assert.equal(parseDaily(null), null);
  assert.equal(parseDaily('{'), null);
  assert.equal(parseDaily('null'), null);
  assert.equal(parseDaily(JSON.stringify({ ...older, picked: 7 })), null);
  assert.equal(parseDaily(JSON.stringify({ ...older, streak: -1 })), null);
  assert.equal(parseDaily(JSON.stringify({ ...older, ok: 'yes' })), null);
  // A run of 3 to day 12: right on 10 and 11 (the option not known), and 12 as picked.
  assert.deepEqual(daysOf({ ...older, day: 12, streak: 3, grace: 0 }), { from: 10, days: '881' });
  // A miss that ended a run of 2.
  assert.deepEqual(daysOf({ day: 12, picked: 3, ok: false, streak: 0, ended: 2, grace: 0 }), { from: 10, days: '887' });
  // Its run comes out as it counted it; the days before it as answered right, the option not known.
  const rec: DailyRecord = { day: 400, picked: 2, ok: true, streak: 30, ended: 0, grace: 0 };
  assert.deepEqual(replay(daysOf(rec)), rec);
  assert.deepEqual(replay(daysOf(rec), 399), { day: 399, picked: -1, ok: true, streak: 29, ended: 0, grace: 0 });
  // A day past any clock's, or a run longer than the days a log holds: no further than they reach.
  assert.equal(parseDaily(JSON.stringify({ ...older, day: 1e12 })), null);
  assert.equal(daysOf({ ...rec, day: 90_000, streak: 1e9 }).days.length, 40_000);
});

test('stored days are checked before use, and kept in one shape', () => {
  assert.deepEqual(parseLog(JSON.stringify({ from: 10, days: '..01.5..' })), { from: 12, days: '01.5' });
  assert.equal(parseLog(JSON.stringify({ from: 10, days: '....' })), null);
  assert.equal(parseLog(JSON.stringify({ from: 10, days: '019' })), null);
  assert.equal(parseLog(JSON.stringify({ from: -1, days: '0' })), null);
  assert.equal(parseLog(JSON.stringify({ from: 10 })), null);
  assert.equal(parseLog('[1]'), null);
  assert.equal(parseLog(null), null);
  // A version this build knows (or none, as first kept); a newer build's isn't read.
  assert.deepEqual(parseLog(JSON.stringify({ v: 1, from: 10, days: '0' })), { from: 10, days: '0' });
  assert.equal(parseLog(JSON.stringify({ v: 2, from: 10, days: '0' })), null);
  // No more days than a century's, and none past any clock's.
  assert.equal(parseLog(JSON.stringify({ from: 10, days: '0'.repeat(40_001) })), null);
  assert.equal(parseLog(JSON.stringify({ from: 99_999, days: '000' })), null);
});

test("an answer to a day still to come (a clock that ran ahead, a device past midnight) waits for its day", () => {
  const d = GRACE_SINCE + 100;
  // Answered on d - 3 and d - 2, then on d + 1 by a clock running ahead.
  const log = answerLog(answerLog(answerLog(null, d - 3, 0, true), d - 2, 1, true), d + 1, 2, true);
  assert.deepEqual(replay(log, d), { day: d - 2, picked: 1, ok: true, streak: 2, ended: 0, grace: 0 });
  // On this device's clock alone, d takes no answer (the clock may have been put back, and d be a day gone by).
  assert.equal(answerLog(log, d, 0, true), log);
  // Once the server has said it is d, it does: d - 1 forgotten, the grace carries the run on.
  const sure = answerLog(log, d, 0, true, true);
  assert.equal(replay(sure, d)?.streak, 3);
  // And d + 1's answer counts then, its question's day: not answered again, not moved onto a forgotten day.
  assert.equal(answerLog(sure, d + 1, 3, false, true), sure);
  assert.deepEqual(replay(sure, d + 1), { day: d + 1, picked: 2, ok: true, streak: 4, ended: 0, grace: GRACE_DAYS - 2 });
  assert.equal(replay(sure, d + 1)?.grace, replay(sure)?.grace);
});

test('days more than a day ahead go, nothing else', () => {
  const log = answerLog(answerLog(answerLog(null, 97, 0, true), 101, 1, true), 103, 2, true);
  assert.deepEqual(upTo(log, 100), answerLog(answerLog(null, 97, 0, true), 101, 1, true));
  assert.equal(upTo(log, 102), log);
  assert.equal(upTo(null, 100), null);
  // An older build's run reaching past that keeps the days of it up to then.
  assert.deepEqual(upTo(daysOf({ day: 104, picked: 1, ok: true, streak: 6, ended: 0, grace: 0 }), 100), { from: 99, days: '888' });
});

test("the legend names the item's kind with its article, by the sound, and none for the pairs", () => {
  assert.equal(aTopic('Shield'), 'A shield');
  assert.equal(aTopic('One-Handed Weapon'), 'A one-handed weapon');
  assert.equal(aTopic('Amulet or Belt'), 'An amulet or belt');
  assert.equal(aTopic('Off-Hand'), 'An off-hand');
  assert.equal(aTopic('Flask, Charm, Jewel, Relic or Tablet'), 'A flask, charm, jewel, relic or tablet');
  assert.equal(aTopic('Gloves'), 'Gloves');
  assert.equal(aTopic('Boots'), 'Boots');
  assert.equal(aTopic('Gloves or Boots'), 'Gloves or boots');
  assert.equal(aTopic('Helmet'), 'A helmet');
});
