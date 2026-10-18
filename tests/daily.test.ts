import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Engine, TWINS, allArt, answerDrawn, isFake, type Item, type Question } from '../src/lib/game.ts';
import { DAILY_LAUNCH, TOO_THIN, dailyEngine, aTopic, answerDaily, askOne, fromClockAhead, dailyGame, answeredOn, dailyQuestion, dayNumber, hoursLeft, minutesLeft, nextIn, parseDaily, streakOn, untilNextMinute, utcDay, type DailyRecord } from '../src/lib/daily.ts';

const items: Item[] = JSON.parse(readFileSync(new URL('../src/data/items.json', import.meta.url), 'utf8'));
const fakes: Record<string, string[]> = JSON.parse(readFileSync(new URL('../src/data/fakes.json', import.meta.url), 'utf8'));

const HOUR = 3_600_000;
const at = (iso: string) => Date.parse(iso);

test('the day turns over at midnight UTC, wherever the player is', () => {
  assert.equal(utcDay(at('2026-10-09T23:59:59.999Z')) + 1, utcDay(at('2026-10-10T00:00:00Z')));
  assert.equal(utcDay(at('2026-10-10T00:00:00+02:00')), utcDay(at('2026-10-09T22:00:00Z')));
});

test('day numbers count from the launch, which is No. 1', () => {
  assert.equal(dayNumber(DAILY_LAUNCH), 1);
  assert.equal(dayNumber(DAILY_LAUNCH + 23 * HOUR), 1);
  assert.equal(dayNumber(DAILY_LAUNCH + 24 * HOUR), 2);
  assert.equal(dayNumber(DAILY_LAUNCH + 213 * 24 * HOUR + 5 * HOUR), 214);
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
  const engine = dailyEngine(items, fakes);
  const game = dailyGame();
  let met = 0;
  for (let i = 0; i < 4000; i++) {
    const q = askOne(engine, game);
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
  for (let d = start; d < start + 1500; d++) assert.ok(!TOO_THIN.has(shown(dailyQuestion(items, fakes, d))), `day ${d}`);
  const engine = new Engine(items, { autoClock: true, fakes });
  const game = dailyGame();
  for (let i = 0; i < 1500; i++) assert.ok(!TOO_THIN.has(shown(askOne(engine, game))), `practice question ${i}`);
});

test('a right answer starts or carries on a streak; a day skipped starts it over', () => {
  const d = 1000;
  let rec = answerDaily(null, d, 2, true);
  assert.equal(rec.streak, 1);
  rec = answerDaily(rec, d + 1, 0, true);
  rec = answerDaily(rec, d + 2, 1, true);
  assert.equal(rec.streak, 3);
  assert.equal(streakOn(rec, d + 2), 3, 'today');
  assert.equal(streakOn(rec, d + 3), 3, 'still alive the next day, until answered');
  assert.equal(streakOn(rec, d + 4), 0, 'a day missed ends it');
  assert.equal(answerDaily(rec, d + 4, 0, true).streak, 1);
});

test('a miss ends the streak and remembers how long it was', () => {
  let rec: DailyRecord = answerDaily(null, 10, 0, true);
  rec = answerDaily(rec, 11, 0, true);
  rec = answerDaily(rec, 12, 3, false);
  assert.deepEqual(rec, { day: 12, picked: 3, ok: false, streak: 0, ended: 2 });
  assert.equal(streakOn(rec, 12), 0);
  assert.equal(answerDaily(rec, 13, 1, true).streak, 1);
});

test("today's question is answered once: a second answer (another tab, a reload) changes nothing", () => {
  const rec = answerDaily(null, 5, 1, true);
  assert.equal(answerDaily(rec, 5, 2, false), rec);
  assert.equal(answeredOn(rec, 5), rec);
  assert.equal(answeredOn(rec, 6), null);
});

test('stored records are checked before use', () => {
  const rec = answerDaily(null, 5, 1, true);
  assert.deepEqual(parseDaily(JSON.stringify(rec)), rec);
  assert.equal(parseDaily(null), null);
  assert.equal(parseDaily('{'), null);
  assert.equal(parseDaily(JSON.stringify({ ...rec, picked: 7 })), null);
  assert.equal(parseDaily(JSON.stringify({ ...rec, streak: -1 })), null);
  assert.equal(parseDaily(JSON.stringify({ ...rec, ok: 'yes' })), null);
});

test("a record from a day still to come (a clock that ran ahead) stands as yesterday's once the server has said the day", () => {
  const ahead: DailyRecord = { day: 101, picked: 2, ok: true, streak: 4, ended: 0 };
  const mended = fromClockAhead(ahead, 100)!;
  assert.deepEqual(mended, { ...ahead, day: 99 });
  // Today's can be answered, and its run goes on.
  assert.equal(answeredOn(mended, 100), null);
  assert.equal(streakOn(mended, 100), 4);
  assert.equal(answerDaily(mended, 100, 0, true).streak, 5);
  // Nothing to mend in a record from today or before.
  assert.equal(fromClockAhead({ ...ahead, day: 100 }, 100), null);
  assert.equal(fromClockAhead(null, 100), null);
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
