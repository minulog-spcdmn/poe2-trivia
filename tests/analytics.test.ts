import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, dayIn, midnight, zoneOf } from '../src/statsPage/zone.ts';
import { axis, labelled } from '../src/statsPage/chart.ts';
import { demoRead, demoSlices, demoUpdate } from '../src/statsPage/demo.ts';
import { appShare, backShare, beforeShare, beyondChanceOf, comersOf, failureRate, firstStepsOf, rateBeyondChance, recentCohorts, toldFromStart, journeyOf, moversOf, reachedOf, reachedShare, sameSites, spikeSource, spikesOf, stepsOf, troubleOf } from '../src/statsPage/insights.ts';
import { dayRefsOf, dayRefsToKeep } from '../src/statsPage/dayRefs.ts';
import { anyNew, changesOf, freshOf, keptChanges } from '../src/statsPage/changes.ts';
import { apartFrom, countsIn, depthCalls, depthsIn, groupPaths, hashOf, knowsPlayed, modeLink, phoneShare, profileIn, profileOf, segments, selOf, sliceCalls, standouts, whereOf, type Sel, type Slices } from '../src/statsPage/slices.ts';
import { currentName, isoWeek, underNamesNow, weekMonday, busiest, seatsOf, weekAverage, weekHours, weekday, change, countsOf, dailyAverage, dailyDays, dayAverageHours, dayAverages, firstCounted, finishedShare, utcPerDay, daysBetween, descentOf, deviceOf, grouped, hardestAndEasiest, medianRange, modesOf, percent, pointsChange, sharePerDay, sizeName, sizesOf, usualByNow, usualByNowUtc, wholeDayAverage, type Counts, type PathCount } from '../src/statsPage/model.ts';

const DAYS = daysBetween('2026-10-14', '2026-10-16');
const path = (p: string, perDay: number[], event = true): PathCount => ({
  path: p,
  event,
  count: perDay.reduce((n, v) => n + v, 0),
  days: Object.fromEntries(DAYS.map((d, i) => [d, perDay[i] ?? 0])),
});

test('days run from the first to the last, both included, across a month', () => {
  assert.deepEqual(daysBetween('2026-09-29', '2026-10-02'), ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
  assert.deepEqual(daysBetween('2026-10-16', '2026-10-16'), ['2026-10-16']);
});

test('the counts land where the page shows them', () => {
  const l = countsOf(
    [
      path('/', [10, 20, 30], false),
      path('play/race-online', [2, 3, 1]),
      path('end/race-online', [1, 3, 1]),
      path('size/race-online-3-4p', [2, 2, 0]),
      path('size/race-online-2p', [0, 1, 1]),
      path('size/race-online-7p', [0, 0, 0]),
      path('play/delve-hotseat', [1, 0, 0]),
      path('daily/right', [3, 0, 1]),
      path('daily/wrong', [1, 1, 0]),
      path('open/invite-link', [4, 0, 0]),
      path('join/invite-link', [3, 0, 0]),
      path('joined/invite-link', [2, 0, 0]),
      path('error/join-no-answer', [1, 0, 0]),
      path('error/host-no-connection', [0, 1, 0]),
      path('error/something-new', [0, 0, 2]),
    ],
    DAYS,
  );
  assert.deepEqual(l.visitors, { total: 60, perDay: [10, 20, 30] });
  assert.equal(l.games.started, 7);
  assert.equal(l.games.finished, 5);
  assert.deepEqual(l.games.perDay, [3, 3, 1]);
  const race = l.games.rows.find((r) => r.mode === 'race')!;
  assert.deepEqual([race.started, race.finished], [6, 5]);
  // Exact sizes first, an older range after; none counted, none listed.
  assert.deepEqual(race.sizes, [
    { from: 2, to: 2, count: 2 },
    { from: 3, to: 4, count: 4 },
  ]);
  // Modes nobody played aren't listed; each knows the names its games were counted under.
  assert.deepEqual(
    l.games.rows.map((r) => [r.mode, r.paths]),
    [
      ['race', ['play/race-online']],
      ['delve', ['play/delve-hotseat']],
    ],
  );
  assert.deepEqual([l.daily.right, l.daily.wrong], [4, 2]);
  assert.deepEqual(l.joins.find((j) => j.via === 'invite-link'), { via: 'invite-link', tried: 3, joined: 2 });
  assert.equal(l.links.invite, 4);
  // Failures by count, host ones marked, an unknown one by its own name.
  assert.deepEqual(
    l.failures.map((f) => [f.key, f.host, f.count]),
    [
      ['something-new', false, 2],
      ['join-no-answer', false, 1],
      ['host-no-connection', true, 1],
    ],
  );
  assert.equal(l.failures[0].label, 'something-new');
});

test('Delve ranges run from the top to the deepest one reached, gaps as zero', () => {
  const l = countsOf([path('delve/depth-0-9', [5, 0, 0]), path('delve/depth-20-29', [1, 0, 0]), path('delve/depth-40-49', [0, 0, 0])], DAYS);
  assert.deepEqual(l.delve.ranges, [
    { from: 0, count: 5 },
    { from: 10, count: 0 },
    { from: 20, count: 1 },
  ]);
  assert.equal(l.delve.total, 6);
  assert.deepEqual(countsOf([], DAYS).delve.ranges, []);
});

test('half the runs end by the median range', () => {
  assert.equal(
    medianRange([
      { from: 0, count: 4 },
      { from: 10, count: 3 },
      { from: 20, count: 3 },
    ]),
    10,
  );
  assert.equal(medianRange([{ from: 0, count: 1 }]), 0);
  assert.equal(medianRange([]), null);
});

test('systems sort into phones and computers', () => {
  assert.equal(deviceOf('iOS'), 'Phone or tablet');
  assert.equal(deviceOf('Android'), 'Phone or tablet');
  assert.equal(deviceOf('Windows'), 'Computer');
  assert.equal(deviceOf('macOS'), 'Computer');
  assert.equal(deviceOf('Linux'), 'Computer');
  assert.equal(deviceOf('PlayStation'), 'Other');
});

test('shares and changes', () => {
  assert.equal(percent(1, 3), '33%');
  assert.equal(percent(0, 0), '–');
  assert.equal(change(150, 100), 50);
  assert.equal(change(50, 100), -50);
  assert.equal(change(10, 0), null);
});

test('games counted online and hot-seat apart, under their older names, count as their mode with those counted since', () => {
  assert.equal(currentName('play/delve-online'), 'play/delve');
  assert.equal(currentName('size/race-hotseat-3p'), 'size/race-3p');
  assert.equal(currentName('size/race-online-5-8p'), 'size/race-5-8p');
  assert.equal(currentName('end/turns-hotseat'), 'end/turns');
  assert.equal(currentName('play/race'), 'play/race');
  // Only a mode's games: anything else keeps its name.
  assert.equal(currentName('end/foo-online'), 'end/foo-online');
  assert.equal(currentName('reach/played'), 'reach/played');
  const l = countsOf(
    [
      path('play/delve-online', [2, 0, 0]),
      path('play/delve-hotseat', [5, 0, 0]),
      path('play/delve', [0, 1, 3]),
      path('end/delve-hotseat', [4, 0, 0]),
      path('end/delve', [0, 1, 2]),
      path('size/delve-online-2p', [2, 0, 0]),
      path('size/delve-2p', [0, 1, 1]),
      path('size/delve-hotseat-1p', [5, 0, 0]),
      path('screen/turns', [0, 0, 1]),
      path('play/turns', [0, 0, 2]),
    ],
    DAYS,
  );
  const delve = modesOf(l.games.rows).find((m) => m.mode === 'delve')!;
  // Its hot-seat games were all at one screen, before "screen/…" was counted (the third day).
  assert.deepEqual([delve.started, delve.finished, delve.screen], [11, 7, 5]);
  assert.deepEqual(l.games.perDay, [7, 1, 5]);
  assert.deepEqual(l.games.finishedPerDay, [4, 1, 2]);
  assert.deepEqual(l.games.rows.find((r) => r.mode === 'delve')!.sizes, [
    { from: 1, to: 1, count: 5 },
    { from: 2, to: 2, count: 4 },
  ]);
  // Asked for by every name it was counted under.
  assert.deepEqual(groupPaths(l).delve, ['play/delve-online', 'play/delve-hotseat', 'play/delve']);
  // Games with players at the host's own screen; hot-seat games only before that was counted.
  assert.equal(modesOf(l.games.rows).find((m) => m.mode === 'turns')!.screen, 1);
  const both = countsOf([path('play/turns-hotseat', [3, 0, 2]), path('screen/turns', [0, 1, 1]), path('play/turns', [0, 2, 2])], DAYS);
  assert.equal(both.games.rows[0].screen, 5);
  // Every mode is there, played or not.
  assert.deepEqual(
    modesOf(l.games.rows).map((m) => [m.mode, m.started]),
    [
      ['turns', 2],
      ['race', 0],
      ['delve', 11],
    ],
  );
});

test('the descent: how many got each ten depths deep, and ended there', () => {
  assert.deepEqual(
    descentOf([
      { from: 0, count: 5 },
      { from: 10, count: 0 },
      { from: 20, count: 2 },
    ]),
    [
      { from: 0, reached: 7, ended: 5 },
      { from: 10, reached: 2, ended: 0 },
      { from: 20, reached: 2, ended: 2 },
    ],
  );
});

test('weeks are summed back from the last day, so the newest week is whole, and a short first one left out', () => {
  const days = daysBetween('2026-10-01', '2026-10-10');
  const g = grouped(days, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1], 7);
  // The 1st to the 3rd, three days among weeks, would read as a slump.
  assert.deepEqual(g, { days: ['2026-10-04'], values: [7] });
  // A series shorter than a week is that short week alone.
  assert.deepEqual(grouped(days.slice(0, 3), [1, 2, 3], 7), { days: ['2026-10-01'], values: [6] });
  assert.deepEqual(grouped(days.slice(0, 2), [4, 5], 1), { days: days.slice(0, 2), values: [4, 5] });
});

test('a rate moves in percentage points', () => {
  assert.equal(pointsChange(70, 100, 75, 100), -5);
  assert.equal(pointsChange(1, 2, 0, 0), null);
});

test("days are cut at the GoatCounter account's midnight, in its zone", () => {
  assert.equal(zoneOf('DE.Europe/Berlin'), 'Europe/Berlin');
  assert.equal(zoneOf('.UTC'), 'UTC');
  assert.equal(zoneOf('XX.Not/AZone'), 'UTC');
  assert.equal(zoneOf(undefined), 'UTC');
  // Berlin in summer is two hours ahead, in winter one; the day a clock change falls on still starts at its own midnight.
  assert.equal(midnight('Europe/Berlin', '2026-07-01').toISOString(), '2026-06-30T22:00:00.000Z');
  assert.equal(midnight('Europe/Berlin', '2026-01-15').toISOString(), '2026-01-14T23:00:00.000Z');
  assert.equal(midnight('Europe/Berlin', '2026-10-25').toISOString(), '2026-10-24T22:00:00.000Z');
  assert.equal(midnight('America/New_York', '2026-03-08').toISOString(), '2026-03-08T05:00:00.000Z');
  assert.equal(midnight('UTC', '2026-10-16').toISOString(), '2026-10-16T00:00:00.000Z');
  // 23:30 UTC is already the next day in Berlin.
  assert.equal(dayIn('Europe/Berlin', new Date('2026-10-16T23:30:00Z')), '2026-10-17');
  assert.equal(dayIn('UTC', new Date('2026-10-16T23:30:00Z')), '2026-10-16');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('an axis climbs in round steps past its peak', () => {
  assert.deepEqual(axis(0), { top: 1, ticks: [0, 1] });
  assert.deepEqual(axis(37), { top: 40, ticks: [0, 20, 40] });
  assert.deepEqual(axis(112, 4), { top: 150, ticks: [0, 50, 100, 150] });
});

test('dates along an axis: as many as fit, the last always among them, the first where it has room', () => {
  assert.deepEqual(labelled(30, 660, 66), [2, 5, 8, 11, 14, 17, 20, 23, 26, 29]);
  // A phone's room for two: the end, the middle, and the start, which the step from the end leaves a gap for.
  assert.deepEqual(labelled(30, 280, 96), [0, 14, 29]);
  assert.deepEqual(labelled(3, 1000), [0, 1, 2]);
  assert.deepEqual(labelled(0, 500), []);
});

test('a day whose midnight the clocks jump past begins at its first hour', () => {
  // Chile moves its clocks from 00:00 to 01:00 on the first Sunday of September.
  const start = midnight('America/Santiago', '2026-09-06');
  assert.equal(dayIn('America/Santiago', start), '2026-09-06');
  assert.equal(dayIn('America/Santiago', new Date(start.getTime() - 1)), '2026-09-05');
});

test('a share per day carries over a day with nothing to share', () => {
  assert.deepEqual(sharePerDay([1, 0, 0, 3], [2, 0, 4, 3]), [50, 50, 0, 100]);
  assert.deepEqual(sharePerDay([0, 1], [0, 4]), [0, 25]);
});

test('games finished per day count the modes the page knows', () => {
  const l = countsOf([path('play/race-online', [2, 2, 0]), path('end/race-online', [1, 2, 0]), path('end/foo-online', [5, 5, 5])], DAYS);
  assert.deepEqual(l.games.finishedPerDay, [1, 2, 0]);
});

test('a share per day stops at 100, with more finished than started', () => {
  assert.deepEqual(sharePerDay([3], [1]), [100]);
});

test('games by how many played, every mode and place together, exactly', () => {
  const l = countsOf(
    [
      path('play/delve-hotseat', [5, 0, 0]),
      path('size/delve-hotseat-1p', [5, 0, 0]),
      path('play/delve-online', [2, 0, 0]),
      path('size/delve-online-2p', [2, 0, 0]),
      path('play/race-online', [9, 0, 0]),
      path('size/race-online-2p', [1, 0, 0]),
      path('size/race-online-11p', [3, 0, 0]),
      path('size/race-online-9-12p', [5, 0, 0]),
    ],
    DAYS,
  );
  assert.deepEqual(
    sizesOf(l.games.rows).map((r) => [sizeName(r), r.modes.turns, r.modes.race, r.modes.delve, r.total]),
    [
      ['1', 0, 0, 5, 5],
      ['2', 0, 1, 2, 3],
      ['11', 0, 3, 0, 3],
      ['9–12', 0, 5, 0, 5],
    ],
  );
});

test("Today's unique by day: the hardest and easiest items, today left out", () => {
  const days = daysBetween('2026-10-10', '2026-10-16');
  const l = countsOf(
    [
      { path: 'daily/right', event: true, count: 0, days: { '2026-10-10': 1, '2026-10-11': 9, '2026-10-12': 2, '2026-10-13': 5, '2026-10-14': 0, '2026-10-16': 0 } },
      { path: 'daily/wrong', event: true, count: 0, days: { '2026-10-10': 0, '2026-10-11': 1, '2026-10-12': 8, '2026-10-13': 5, '2026-10-14': 4, '2026-10-16': 9 } },
    ],
    days,
  );
  const d = dailyDays(l);
  assert.deepEqual(
    d.map((x) => [x.answers, x.named]),
    [
      [1, 100],
      [10, 90],
      [10, 20],
      [10, 50],
      [4, 0],
      [0, null],
      [9, 0],
    ],
  );
  const { hardest, easiest } = hardestAndEasiest(d, 3, 2);
  // The 10th has a single answer, under the 3 the rest have: not ranked. Nor today (the 16th).
  // Against the usual 47%, 9 of 10 is beyond chance; 2 of 10 (1.7 standard deviations under) and 0 of 4 aren't.
  assert.deepEqual(hardest, []);
  assert.deepEqual(
    easiest.map((x) => x.day),
    ['2026-10-11'],
  );
});

test("Today's unique's hardest item is weighed by how many answered, and a day too few answered is never ranked", () => {
  const days = daysBetween('2026-10-10', '2026-10-13');
  const daily = (right: number[], wrong: number[]) =>
    dailyDays(
      countsOf(
        [
          { path: 'daily/right', event: true, count: 0, days: Object.fromEntries(days.map((d, i) => [d, right[i]])) },
          { path: 'daily/wrong', event: true, count: 0, days: Object.fromEntries(days.map((d, i) => [d, wrong[i]])) },
        ],
        days,
      ),
    );
  // None of 3 named on the 10th, 2 of 20 on the 11th: 3 answers say less than 20, so the 11th is the hardest.
  const { hardest, easiest } = hardestAndEasiest(daily([0, 2, 18, 0], [3, 18, 2, 0]), 3, 1);
  assert.deepEqual(hardest.map((x) => x.day), ['2026-10-11']);
  assert.deepEqual(easiest.map((x) => x.day), ['2026-10-12']);
  // Every day under the 3 answers it takes: none ranked, rather than days that say nothing.
  assert.deepEqual(hardestAndEasiest(daily([1, 0, 2, 0], [1, 2, 0, 0]), 3), { hardest: [], easiest: [] });
});

test('daily players on average count only the days it asked', () => {
  const l = countsOf([path('daily/right', [0, 4, 1]), path('daily/wrong', [0, 2, 0])], DAYS);
  // The 16th is still going: left out.
  assert.equal(dailyAverage(l), 3);
  assert.equal(dailyAverage(l, '2026-10-15'), 6);
  // Its only day the one still going: nothing whole to average, so nothing to compare.
  assert.equal(dailyAverage(l, '2026-10-16'), null);
});

test("Today's unique counts by the game's UTC days, its hours moved from the account's zone", () => {
  const hours = (at: Record<number, number>) => Array.from({ length: 24 }, (_, h) => at[h] ?? 0);
  // Berlin is two hours ahead in October: its 00:00 and 01:00 belong to the UTC day before.
  const answers: PathCount = {
    path: 'daily/right',
    event: true,
    count: 9,
    days: { '2026-10-15': 5, '2026-10-16': 4 },
    hours: { '2026-10-15': hours({ 0: 1, 1: 1, 2: 3 }), '2026-10-16': hours({ 1: 2, 23: 2 }) },
  };
  // The 14th's two (Berlin's first hours of the 15th) stay out, as the 14th isn't among the days.
  assert.deepEqual(utcPerDay(answers, ['2026-10-15', '2026-10-16'], 'Europe/Berlin'), [5, 2]);
  assert.deepEqual(utcPerDay(answers, ['2026-10-14', '2026-10-15', '2026-10-16'], 'Europe/Berlin'), [2, 5, 2]);
  // Without a zone, or without hours, by GoatCounter's own days.
  assert.deepEqual(utcPerDay(answers, ['2026-10-15', '2026-10-16']), [5, 4]);
  assert.deepEqual(utcPerDay({ ...answers, hours: undefined }, ['2026-10-15', '2026-10-16'], 'Europe/Berlin'), [5, 4]);
  const l = countsOf([answers], ['2026-10-15', '2026-10-16'], 'Europe/Berlin');
  assert.deepEqual([l.daily.right, l.daily.rightPerDay], [7, [5, 2]]);
});

test('games played to the end are at most all of them', () => {
  assert.equal(finishedShare(3, 4), '75%');
  // Games started late the period before, ending in this one.
  assert.equal(finishedShare(11, 10), '100%');
  assert.equal(finishedShare(0, 0), '–');
});

test('hours land on their weekday, Monday first, only the days asked for', () => {
  const hours = (at: Record<number, number>) => Array.from({ length: 24 }, (_, h) => at[h] ?? 0);
  // The 14th is a Wednesday (2), the 16th a Friday (4).
  assert.deepEqual([weekday('2026-10-12'), weekday('2026-10-14'), weekday('2026-10-18')], [0, 2, 6]);
  const visits: PathCount = {
    path: '/',
    event: false,
    count: 7,
    days: { '2026-10-13': 1, '2026-10-14': 2, '2026-10-16': 4 },
    hours: { '2026-10-13': hours({ 5: 1 }), '2026-10-14': hours({ 20: 2 }), '2026-10-16': hours({ 20: 1, 21: 3 }) },
  };
  const grid = weekHours([visits], DAYS)!;
  assert.equal(grid.length, 7);
  assert.equal(grid[2][20], 2);
  assert.deepEqual([grid[4][20], grid[4][21]], [1, 3]);
  // The 13th isn't among the days.
  assert.equal(grid[1][5], 0);
  assert.deepEqual(busiest(grid), { day: 4, hour: 21, value: 3 });
  // A path with counts but no hours: no grid, rather than one missing them.
  assert.equal(weekHours([{ ...visits, hours: undefined }], DAYS), null);
  assert.equal(weekHours([{ ...visits, count: 0, hours: undefined }], DAYS)?.flat().every((n) => n === 0), true);
  assert.equal(busiest(weekHours([], DAYS)!), null);
  // countsOf keeps the grid for visits and for games started.
  const l = countsOf([visits, { ...visits, path: 'play/race-online', event: true }], DAYS);
  assert.equal(l.week.visitors?.[4][21], 3);
  assert.equal(l.week.games?.[4][21], 3);
});

test("an hour's average is over how many of the days fell on its weekday", () => {
  const grid = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  grid[0][10] = 6;
  grid[1][10] = 6;
  // Two Mondays and one Tuesday; no Wednesday had, so none of its hours.
  const avg = weekAverage(grid, ['2026-10-05', '2026-10-06', '2026-10-12']);
  assert.deepEqual([avg[0][10], avg[1][10], avg[2][10]], [3, 6, null]);
  // The last day still going, at 09:00: its hours from then on aren't had yet, so a Monday's 10:00 is over the one Monday before.
  const sofar = weekAverage(grid, ['2026-10-05', '2026-10-06', '2026-10-12'], 9);
  assert.deepEqual([sofar[0][8], sofar[0][10], sofar[1][10]], [0, 6, 6]);
  // A week's today, later than now: no day has had it.
  assert.equal(weekAverage(grid, ['2026-10-12'], 9)[0][10], null);
});

test("a usual day's hours average every day together, the last only up to now", () => {
  const grid = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  grid[0][10] = 6;
  grid[1][10] = 3;
  // A Monday, a Tuesday and today (a Monday) at 09:00: 10:00 is over the two days that had it.
  const day = dayAverageHours(grid, ['2026-10-05', '2026-10-06', '2026-10-12'], 9);
  assert.deepEqual([day[8], day[10]], [0, 4.5]);
  assert.equal(dayAverageHours(grid, ['2026-10-12'], 9)[10], null);
});

test('counting began on the first day anything was counted', () => {
  const p = (days: Record<string, number>): PathCount => ({ path: '/', event: false, count: 0, days });
  assert.equal(firstCounted([p({ '2026-10-14': 0, '2026-10-15': 0, '2026-10-16': 3 }), p({ '2026-10-17': 1 })]), '2026-10-16');
  assert.equal(firstCounted([p({ '2026-10-14': 0 })]), null);
  assert.equal(firstCounted([]), null);
});

test("the week's hours take the last day only up to the hour it's reached", () => {
  const hours = (at: Record<number, number>) => Array.from({ length: 24 }, (_, h) => at[h] ?? 0);
  const visits: PathCount = { path: '/', event: false, count: 5, days: { '2026-10-15': 2, '2026-10-16': 3 }, hours: { '2026-10-15': hours({ 20: 2 }), '2026-10-16': hours({ 8: 1, 9: 2 }) } };
  // At 09:something on the 16th: its 08:00 is whole, its 09:00 still going.
  const grid = weekHours([visits], DAYS, 9)!;
  assert.deepEqual([grid[3][20], grid[4][8], grid[4][9]], [2, 1, 0]);
  assert.equal(countsOf([visits], DAYS, undefined, 9).week.until, 9);
});

test("seats add every game's players, an older range by its middle", () => {
  const rows = countsOf(
    [path('play/race-online', [3, 0, 0]), path('size/race-online-2p', [2, 0, 0]), path('size/race-online-5-8p', [1, 0, 0]), path('play/delve-hotseat', [1, 0, 0]), path('size/delve-hotseat-1p', [1, 0, 0])],
    DAYS,
  ).games.rows;
  // 2 + 2 + 6.5 + 1
  assert.deepEqual(seatsOf(rows), { seats: 12, games: 4 });
  assert.deepEqual(seatsOf([]), { seats: 0, games: 0 });
});

test('how far a visit gets: played, finished, answered, of the visitors since the game marked it', () => {
  const c = countsOf(
    [
      path('/', [10, 10, 20], false),
      path('reach/played', [0, 4, 10]),
      path('reach/finished', [0, 3, 6]),
      path('daily/right', [1, 2, 3]),
      path('daily/wrong', [1, 0, 1]),
      path('join/code', [2, 1, 0]),
      path('joined/code', [1, 1, 0]),
      path('error/join-no-answer', [1, 0, 2]),
    ],
    DAYS,
  );
  const s = stepsOf(c);
  // Marked from the second day: the first day's visitors aren't counted against it.
  assert.equal(s.from, DAYS[1]);
  assert.deepEqual([s.visitors, s.played, s.finished], [30, 14, 9]);
  assert.deepEqual([s.answered, s.askedVisitors], [8, 40]);
  assert.deepEqual(c.joinsPerDay, { tried: [2, 1, 0], joined: [1, 1, 0] });
  assert.deepEqual(c.failuresPerDay, [1, 0, 2]);
  // Never marked: nothing to say yet.
  assert.equal(stepsOf(countsOf([path('/', [5, 5, 5], false)], DAYS)).from, null);
});

test('joining is called worse only when its failures are well above the usual rate', () => {
  // 100 games and tries a day; the period before failed 2 in 100.
  const counts = (games: number[], failures: number[]) => countsOf([path('play/race-online', games), path('error/join-no-answer', failures)], DAYS);
  const before = counts([100, 100, 100], [2, 2, 2]);
  // As many again failing 3 in 100: chance could do that.
  assert.equal(troubleOf(counts([100, 100, 100], [3, 3, 3]), before), null);
  // Failing 10 in 100: worse, against the 6 the usual rate gives.
  const bad = troubleOf(counts([100, 100, 100], [10, 10, 10]), before);
  assert.deepEqual(bad?.period, { failed: 30, expected: 6 });
  // Twice the games and twice the failures is the same rate: not worse.
  assert.equal(troubleOf(counts([200, 200, 200], [4, 4, 4]), before), null);
  // Today far above the rest of the period, which was as usual.
  const today = troubleOf(counts([100, 100, 100], [2, 2, 20]), before);
  assert.equal(today?.today?.failed, 20);
  assert.equal(today?.today?.expected, 2);
  // Nothing before to go by, and an ordinary today: nothing to say.
  assert.equal(troubleOf(counts([100, 100, 100], [2, 2, 2]), countsOf([], DAYS)), null);
});

test('a day far busier than usual stands out, a day chance could make does not', () => {
  const days = daysBetween('2026-10-01', '2026-10-10');
  const values = [40, 42, 38, 41, 95, 39, 44, 52, 40, 30];
  assert.deepEqual(spikesOf(days, values).map((s) => s.day), ['2026-10-05']);
  assert.equal(spikesOf(days, values)[0].usual, 41);
  // At a handful a day, even double is chance.
  assert.deepEqual(spikesOf(days.slice(0, 5), [2, 3, 2, 6, 2]), []);
  assert.deepEqual(spikesOf(days, days.map(() => 0)), []);
});

test("a spike's source: the site far above its usual share that day", () => {
  const period = [{ name: '(unknown)', count: 500 }, { name: 'https://www.reddit.com', count: 100 }, { name: 'https://www.google.com', count: 100 }];
  const day = [{ name: '(unknown)', count: 30 }, { name: 'https://www.reddit.com', count: 60 }, { name: 'https://www.google.com', count: 5 }];
  const s = spikeSource(day, period)!;
  assert.equal(s.name, 'https://www.reddit.com');
  assert.equal(Math.round(s.share), 63);
  // The usual mix, or most typed in: no site to name.
  assert.equal(spikeSource([{ name: '(unknown)', count: 90 }, { name: 'https://www.reddit.com', count: 14 }], period), null);
  assert.equal(spikeSource([], period), null);
});

test('who brought far more or fewer than before, only beyond chance', () => {
  const m = moversOf(
    [{ name: 'Brazil', count: 117 }, { name: 'Germany', count: 300 }, { name: 'France', count: 9 }, { name: '', count: 400 }],
    [{ name: 'Brazil', count: 35 }, { name: 'Germany', count: 290 }, { name: 'France', count: 4 }, { name: 'Poland', count: 80 }, { name: '', count: 10 }],
  );
  assert.deepEqual(m.up, { name: 'Brazil', now: 117, before: 35 });
  assert.deepEqual(m.down, { name: 'Poland', now: 0, before: 80 });
  assert.deepEqual(moversOf([{ name: 'France', count: 9 }], [{ name: 'France', count: 4 }]), { up: null, down: null });
  // Every site bringing twice as many is no news; one bringing far more than that is.
  const doubled = [{ name: 'reddit', count: 200 }, { name: 'google', count: 100 }, { name: 'discord', count: 100 }];
  assert.deepEqual(moversOf(doubled, [{ name: 'reddit', count: 100 }, { name: 'google', count: 50 }, { name: 'discord', count: 50 }]), { up: null, down: null });
  assert.equal(moversOf(doubled, [{ name: 'reddit', count: 100 }, { name: 'google', count: 50 }, { name: 'discord', count: 10 }]).up?.name, 'discord');
  // One big site trebling doesn't drag the rest along: it's the news, not the others falling behind it.
  const surge = moversOf(
    [{ name: 'reddit', count: 300 }, { name: 'google', count: 20 }, { name: 'youtube', count: 20 }],
    [{ name: 'reddit', count: 100 }, { name: 'google', count: 20 }, { name: 'youtube', count: 20 }],
  );
  assert.deepEqual(surge, { up: { name: 'reddit', now: 300, before: 100 }, down: null });
});

test('the made-up numbers read the same for a day in any period, and add up', () => {
  const at = new Date('2026-10-18T15:30:00Z');
  const week = demoRead(7, at);
  const month = demoRead(30, at);
  assert.equal(week.to, '2026-10-18');
  assert.equal(week.now.days.length, 7);
  assert.deepEqual(week.now.visitors.perDay.slice(0, -1), month.now.visitors.perDay.slice(-7, -1));
  assert.equal(
    week.now.visitors.perDay.reduce((n, v) => n + v, 0),
    week.now.visitors.total,
  );
  for (const j of month.now.joins) assert.ok(j.joined <= j.tried);
  assert.ok(month.now.games.started > 0 && month.now.week.visitors !== null);
});

test('each thing people do is read by the paths counted for it, and only those', () => {
  const c = countsOf(
    [
      path('/', [10, 20, 30], false),
      path('reach/played', [4, 5, 6]),
      path('play/race-online', [2, 3, 1]),
      path('play/delve-hotseat', [1, 0, 0]),
      path('daily/right', [1, 1, 0]),
      path('join/code', [2, 0, 0]),
      path('joined/code', [1, 0, 0]),
      path('error/join-no-answer', [1, 0, 0]),
    ],
    DAYS,
  );
  const g = groupPaths(c);
  assert.deepEqual(g.visit, ['/']);
  // Those who played a game, guests too.
  assert.deepEqual(g.played, ['reach/played']);
  assert.deepEqual(g.race, ['play/race-online']);
  assert.deepEqual(g.delve, ['play/delve-hotseat']);
  assert.deepEqual(g.turns, []);
  assert.deepEqual(g.daily, ['daily/right']);
  assert.deepEqual(g.join, ['join/code']);
  assert.deepEqual(g.joined, ['joined/code']);
  assert.deepEqual(g.failed, ['error/join-no-answer']);
  // What those who played are a share of: visits here, as page loads weren't counted; and the visits of the days Today's unique asked.
  assert.deepEqual([g.loads, g.asked], [['/'], ['/']]);
  // Two calls (country, system) for each group with paths: no call for Take turns.
  assert.equal(sliceCalls(c).length, 20);
  assert.ok(sliceCalls(c).every((x) => x.from === DAYS[0]));
});

test("the groups' shares cover the overview's days: page loads from the day they were counted, Today's unique from its first", () => {
  const days = daysBetween('2026-10-07', '2026-10-12');
  const at = (p: string, vs: number[], event = true): PathCount => ({ path: p, event, count: vs.reduce((a, b) => a + b, 0), days: Object.fromEntries(days.map((d, i) => [d, vs[i] ?? 0])) });
  const c = countsOf([at('/', [5, 5, 5, 5, 5, 5], false), at('reach/page', [0, 0, 0, 6, 6, 6]), at('reach/played', [0, 0, 0, 3, 3, 3]), at('daily/right', [0, 0, 2, 2, 2, 2])], days);
  assert.deepEqual(groupPaths(c).loads, ['reach/page']);
  const from = Object.fromEntries(sliceCalls(c).map((x) => [x.group, x.from]));
  // Page loads were first counted on the 10th; Today's unique first asked on the 9th.
  assert.deepEqual([from.played, from.loads, from.asked, from.visit, from.daily], ['2026-10-10', '2026-10-10', '2026-10-09', '2026-10-07', '2026-10-07']);
});

const SLICES: Slices = {
  v: 4,
  span: 7,
  from: '2026-10-10',
  at: 0,
  locations: {
    visit: [{ name: 'Germany', count: 40 }, { name: 'France', count: 50 }, { name: '', count: 10 }],
    loads: [{ name: 'Germany', count: 40 }, { name: 'France', count: 50 }, { name: '', count: 10 }],
    asked: [{ name: 'Germany', count: 40 }, { name: 'France', count: 50 }, { name: '', count: 10 }],
    played: [{ name: 'Germany', count: 30 }, { name: 'France', count: 20 }],
    delve: [{ name: 'Germany', count: 20 }, { name: 'France', count: 5 }],
    race: [{ name: 'France', count: 15 }],
    daily: [{ name: 'Germany', count: 10 }, { name: 'France', count: 10 }],
    join: [{ name: 'Germany', count: 10 }, { name: 'France', count: 10 }],
    joined: [{ name: 'Germany', count: 9 }, { name: 'France', count: 5 }],
    failed: [{ name: 'Germany', count: 2 }],
  },
  systems: {
    visit: [{ name: 'Windows', count: 70 }, { name: 'iOS', count: 20 }, { name: 'Android', count: 12 }],
    delve: [{ name: 'Windows', count: 15 }, { name: 'iOS', count: 10 }],
  },
};

test("a country's visitors, set against everyone", () => {
  const de = profileOf(countsIn(SLICES, { kind: 'place', name: 'Germany' }));
  assert.equal(de.visitors, 40);
  assert.equal(de.games, 20);
  assert.equal(de.perVisitor, 0.5);
  assert.deepEqual(de.modes.map((m) => m.share), [0, 0, 100]);
  assert.equal(de.daily, 25);
  assert.equal(de.joins, 90);
  assert.equal(de.played, 75);
  assert.equal(de.failures, 5);
  const all = profileOf(countsIn(SLICES, null));
  assert.equal(all.visitors, 100);
  assert.equal(all.games, 40);
  assert.equal(all.played, 50);
  // Before those who played were counted, nobody's share is made up.
  assert.equal(knowsPlayed(SLICES), true);
  assert.equal(profileIn({ ...SLICES, locations: { ...SLICES.locations, played: undefined } }, null).played, null);
  // A system's group against everyone's in the systems' list.
  assert.equal(profileIn(SLICES, null, 'systems').visitors, 102);
  // Everyone by system: its own list's total.
  assert.equal(countsIn(SLICES, null, 'systems').visit, 102);
  // Those GoatCounter couldn't place are a group too.
  assert.equal(countsIn(SLICES, { kind: 'place', name: 'Unknown' }).visit, 10);
  // A kind of device is its systems together.
  assert.equal(countsIn(SLICES, { kind: 'device', name: 'Phone or tablet' }).visit, 32);
  assert.deepEqual(
    segments(SLICES, 'place').map((r) => r.who.name),
    ['France', 'Germany', 'Unknown'],
  );
});

test('where the games of a mode are started, against where visitors are', () => {
  const rows = whereOf(SLICES, 'delve', 'locations');
  assert.deepEqual(rows.map((r) => r.name), ['Germany', 'France']);
  assert.equal(rows[0].share, 80);
  assert.equal(rows[0].visitShare, 40);
  const kinds = whereOf(SLICES, 'delve', 'systems', true);
  assert.deepEqual(kinds.map((r) => [r.name, r.count]), [['Computer', 15], ['Phone or tablet', 10]]);
  // Of Delve's games, those started on a phone or tablet; every mode's, with none.
  assert.equal(phoneShare(SLICES, 'delve'), 40);
  assert.equal(phoneShare(SLICES, null), 40);
  assert.equal(phoneShare(SLICES, 'race'), 0);
});

test('a group is kept in the address, and read back from it', () => {
  const sels: Sel[] = [
    { who: { kind: 'place', name: 'Korea, Republic of' }, mode: null },
    { who: { kind: 'device', name: 'Phone or tablet' }, mode: null },
    { who: null, mode: 'delve' },
    // A country and a mode together.
    { who: { kind: 'place', name: 'Germany' }, mode: 'race' },
  ];
  for (const sel of sels) assert.deepEqual(selOf(hashOf(sel)), sel);
  assert.equal(hashOf({ who: { kind: 'system', name: 'iOS' }, mode: 'turns' }), '#groups/system/iOS/mode/turns');
  assert.equal(hashOf(null), '#groups');
  assert.equal(selOf('#groups'), null);
  // The way a mode was once kept still opens it.
  assert.deepEqual(selOf('#groups/did/delve'), { who: null, mode: 'delve' });
  assert.equal(selOf('#groups/did/nothing'), null);
  assert.equal(selOf('#groups/place/%E0%A4%A'), null);
  // Never a country and a device together, nor half a pair.
  assert.equal(selOf('#groups/place/Germany/device/Computer'), null);
  assert.equal(selOf('#groups/place/Germany/mode'), null);
  assert.equal(modeLink('Delve'), '#groups/mode/delve');
  assert.equal(modeLink('Something else'), null);
});

test('an update keeps what it brought in, and where from', () => {
  const at = new Date('2026-10-16T18:30:00Z');
  const was = demoRead(7, new Date(at.getTime() - 3_600_000));
  const now = demoRead(7, at);
  const c = changesOf(was, now)!;
  assert.ok(c);
  assert.equal(c.visitors, now.now.visitors.total - was.now.visitors.total);
  assert.equal(c.since, was.at);
  assert.ok(c.countries.every((n) => n.count > 0));
  assert.ok(anyNew(c));
  // Nothing today's box would show (a try to join, a failure: their own line) isn't an update of its own.
  assert.equal(anyNew({ ...c, visitors: 0, games: 0, answers: 0, modes: [], countries: [], systems: [] }), false);
  // Another period, or one read the day before, isn't compared.
  assert.equal(changesOf(demoRead(30, at), now), null);
  assert.equal(changesOf(demoRead(7, new Date(at.getTime() - 86_400_000)), now), null);
  // Nothing new: the last update that brought something stays, lit no more.
  const kept = { ...now, changes: c };
  const later = { ...now, at: now.at + 60_000 };
  assert.equal(keptChanges(kept, later), c);
  assert.equal(freshOf(c, later.at, 'countries'), undefined);
  assert.equal(freshOf(c, now.at, 'countries')?.size, c.countries.length);
  assert.ok(demoUpdate(7, at).changes);
});

test("the busy days' sites are kept for one time zone, as far back as a period reaches, and a broken store is none", () => {
  const refs = { '2025-09-01': [{ name: 'reddit.com', count: 9 }], '2026-10-10': [{ name: 'youtube.com', count: 4 }] };
  const stored = dayRefsToKeep(refs, 'Europe/Berlin', '2025-10-19');
  assert.deepEqual(dayRefsOf(stored, 'Europe/Berlin'), { '2026-10-10': [{ name: 'youtube.com', count: 4 }] });
  assert.deepEqual(dayRefsOf(stored, 'America/Chicago'), {});
  assert.deepEqual(dayRefsOf('{"zone":"Europe/Berl', 'Europe/Berlin'), {});
  assert.deepEqual(dayRefsOf(null, 'Europe/Berlin'), {});
});

test('made-up groups add up to the made-up totals', () => {
  const read = demoRead(30, new Date('2026-10-16T18:30:00Z'));
  const s = demoSlices(read);
  const sum = (g: keyof Slices['locations']) => (s.locations[g] ?? []).reduce((n, x) => n + x.count, 0);
  assert.equal(sum('visit'), read.now.visitors.total);
  assert.ok(Math.abs(sum('delve') - modesOf(read.now.games.rows).find((m) => m.mode === 'delve')!.started) <= 12);
  assert.ok(sum('joined') <= sum('join'));
});

test("a group's figure is apart from the rest's only beyond chance", () => {
  const of = (us: [number, number], de: [number, number]): Slices => ({
    v: 4,
    span: 30,
    from: '2026-10-16',
    at: 0,
    locations: {
      visit: [{ name: 'United States', count: us[0] * 4 }, { name: 'Germany', count: de[0] * 4 }],
      loads: [{ name: 'United States', count: us[0] }, { name: 'Germany', count: de[0] }],
      played: [{ name: 'United States', count: us[1] }, { name: 'Germany', count: de[1] }],
    },
    systems: {},
  });
  const us = { kind: 'place', name: 'United States' } as const;
  // 2 of 10 who loaded it played, against 3 of 9: what chance does with so few.
  assert.equal(apartFrom(of([10, 2], [9, 3]), us).played, false);
  // 100 of 500 against 300 of 500 is no chance.
  assert.equal(apartFrom(of([500, 100], [500, 300]), us).played, true);
});

test('what stands out among the groups: big enough to tell, a mix, the largest first', () => {
  const s = demoSlices(demoRead(30, new Date('2026-10-16T18:30:00Z')));
  const found = standouts(s);
  assert.ok(found.length > 0 && found.length <= 6);
  // The made-up Germans lean to Delve.
  assert.ok(found.some((f) => f.who.name === 'Germany' && f.what === 'mode' && f.mode === 'delve'));
  for (const what of ['mode', 'played', 'games', 'daily', 'back', 'joins', 'failures']) assert.ok(found.filter((f) => f.what === what).length <= 2);
  assert.deepEqual(found.map((f) => f.score), [...found.map((f) => f.score)].sort((a, b) => b - a));
  // Groups too small to tell apart say nothing.
  assert.deepEqual(standouts(SLICES, 6, 1000), []);
  // A problem is never left out for its group's other findings: the made-up Brazilians meet far more failures.
  const quarter = standouts(demoSlices(demoRead(90, new Date('2026-10-16T18:30:00Z'))));
  assert.ok(quarter.some((f) => f.who.name === 'Brazil' && f.what === 'failures' && f.tone === 'down'));
});

test("a game's hours under an older name and its name now are added up, so the week's hours read across the change", () => {
  const hours = (at: Record<number, number>) => Array.from({ length: 24 }, (_, h) => at[h] ?? 0);
  const old: PathCount = { path: 'play/race-online', event: true, count: 3, days: { '2026-10-14': 3 }, hours: { '2026-10-14': hours({ 20: 3 }) } };
  const now: PathCount = { path: 'play/race', event: true, count: 2, days: { '2026-10-14': 1, '2026-10-16': 1 }, hours: { '2026-10-14': hours({ 20: 1 }), '2026-10-16': hours({ 9: 1 }) } };
  const [race] = underNamesNow([old, now]);
  assert.equal(race.path, 'play/race');
  assert.equal(race.count, 5);
  assert.deepEqual(race.days, { '2026-10-14': 4, '2026-10-16': 1 });
  assert.equal(race.hours!['2026-10-14'][20], 4);
  // The paths given are left as they were.
  assert.equal(old.days['2026-10-14'], 3);
  const l = countsOf([old, now], DAYS);
  assert.equal(l.week.games?.[2][20], 4);
  // One without hours that counted something: no hours rather than some missing.
  assert.equal(underNamesNow([old, { ...now, hours: undefined }])[0].hours, undefined);
  assert.deepEqual(underNamesNow([old, { ...now, count: 0, days: {}, hours: undefined }])[0].hours, old.hours);
});

test('how far a visit gets, from the day page loads were counted; before it, its first steps alone', () => {
  const c = countsOf(
    [
      path('/', [10, 20, 30], false),
      path('reach/page', [0, 25, 25]),
      path('reach/played', [5, 8, 12]),
      path('reach/finished', [4, 6, 9]),
      path('reach/lobby', [0, 12, 15]),
      path('reach/games-2', [0, 4, 6]),
      path('reach/games-5', [0, 1, 1]),
    ],
    DAYS,
  );
  const j = journeyOf(c);
  // Counted whole from the second day: the first's aren't counted against it.
  assert.equal(j.from, DAYS[1]);
  assert.equal(j.visitors, 50);
  assert.deepEqual(j.counts, { lobby: 27, played: 20, finished: 15, 'games-2': 10, 'games-5': 2 });
  assert.equal(reachedShare(j, 'lobby'), 54);
  assert.equal(reachedShare(j, 'games-5'), 4);
  // Before page loads were counted: the first two steps, against visits, the rest not counted at all.
  assert.equal(journeyOf(countsOf([path('/', [10, 10, 10], false), path('reach/lobby', [4, 4, 4])], DAYS)).from, null);
  const early = journeyOf(countsOf([path('/', [10, 10, 10], false), path('reach/played', [4, 5, 6]), path('reach/finished', [3, 3, 3])], DAYS));
  assert.equal(early.from, DAYS[0]);
  assert.equal(reachedShare(early, 'played'), 50);
  assert.equal(reachedShare(early, 'lobby'), null);
  // Nothing counted: nothing to say.
  assert.equal(journeyOf(countsOf([path('/', [5, 5, 5], false)], DAYS)).from, null);
  // A share never runs past every visitor.
  const late = reachedOf(countsOf([path('reach/page', [2, 0, 0]), path('reach/time-2m', [3, 0, 0])], DAYS), ['time-2m']);
  assert.equal(reachedShare(late, 'time-2m'), 100);
  // A rare step is read from when page loads were counted, not from the day it first happened: one codex in 30 loads.
  const rare = reachedOf(countsOf([path('reach/page', [10, 10, 10]), path('reach/codex', [0, 0, 1])], DAYS), ['codex']);
  assert.deepEqual([rare.from, rare.visitors, Math.round(10 * reachedShare(rare, 'codex')!)], [DAYS[0], 30, 33]);
});

test('a share is set against the period before only where both are of the same, page loads or visits', () => {
  const now = journeyOf(countsOf([path('reach/page', [10, 10, 10]), path('reach/played', [5, 5, 5])], DAYS));
  const wasVisits = journeyOf(countsOf([path('/', [10, 10, 10], false), path('reach/played', [6, 6, 6])], DAYS));
  const wasPages = journeyOf(countsOf([path('reach/page', [10, 10, 10]), path('reach/played', [6, 6, 6])], DAYS));
  assert.equal(beforeShare(now, wasVisits, 'played'), null);
  assert.equal(beforeShare(now, wasPages, 'played'), 60);
  // The overview's figure knows which it is too.
  assert.equal(stepsOf(countsOf([path('reach/page', [10, 10, 10]), path('reach/played', [5, 5, 5])], DAYS)).paged, true);
  assert.equal(stepsOf(countsOf([path('/', [10, 10, 10], false), path('reach/played', [5, 5, 5])], DAYS)).paged, false);
});

test('who came: with no save on the device or back to one after so long, of those told apart; and the installed app, of every visitor', () => {
  const c = countsOf(
    [
      path('/', [10, 20, 30], false),
      path('visit/new', [0, 12, 18]),
      path('visit/back-1d', [0, 4, 6]),
      path('visit/back-7d', [0, 2, 3]),
      path('visit/back-30d', [0, 1, 1]),
      path('visit/back-later', [0, 1, 1]),
      path('visit/app', [0, 2, 3]),
    ],
    DAYS,
  );
  const w = comersOf(c);
  assert.equal(w.from, DAYS[1]);
  assert.equal(w.visitors, 50);
  assert.deepEqual([w.fresh, w.returned, w.app], [30, 19, 5]);
  assert.deepEqual(w.back, { 'back-1d': 10, 'back-7d': 5, 'back-30d': 2, 'back-later': 2 });
  // 19 of the 49 told apart came back to a save (the rest of the 50 played within 8 hours, and said neither); 5 of the 50 opened the installed app.
  assert.equal(Math.round(backShare(w)!), 39);
  assert.equal(Math.round(appShare(w)!), 10);
  // Before they were told apart: nothing to say, not 0%.
  const none = comersOf(countsOf([path('/', [10, 10, 10], false)], DAYS));
  assert.deepEqual([none.from, backShare(none), appShare(none)], [null, null, null]);
});

test("the game's own script errors are listed with the failures, but aren't joining's", () => {
  const c = countsOf(
    [path('play/race', [100, 100, 100]), path('error/join-no-answer', [2, 2, 2]), path('error/script', [0, 0, 40]), path('sync/paired', [1, 0, 2])],
    DAYS,
  );
  const script = c.failures.find((f) => f.key === 'script')!;
  assert.deepEqual([script.script, script.host, script.count, script.label], [true, false, 40, "An error in the game's own scripts"]);
  assert.deepEqual(c.failuresPerDay, [2, 2, 2]);
  // Forty of them today don't make joining look worse.
  assert.equal(troubleOf(c, c), null);
  assert.deepEqual(groupPaths(c).failed, ['error/join-no-answer']);
  assert.equal(c.sync.paired, 3);
});

test('visitors new, back and in the installed app are groups too, their shares of those told apart', () => {
  const c = countsOf([path('/', [10, 0, 0], false), path('visit/new', [6, 0, 0]), path('visit/back-1d', [3, 0, 0]), path('visit/back-later', [1, 0, 0]), path('visit/app', [2, 0, 0])], DAYS);
  const g = groupPaths(c);
  assert.deepEqual([g.new, g.back, g.app], [['visit/new'], ['visit/back-1d', 'visit/back-later'], ['visit/app']]);
  const s: Slices = {
    ...SLICES,
    locations: {
      ...SLICES.locations,
      new: [{ name: 'Germany', count: 10 }, { name: 'France', count: 30 }],
      back: [{ name: 'Germany', count: 30 }, { name: 'France', count: 10 }],
      app: [{ name: 'Germany', count: 4 }],
    },
  };
  // The groups' installed app is of every visitor in the period: a share only where visits were told apart from its first day.
  assert.equal(toldFromStart(c), true);
  assert.equal(toldFromStart(countsOf([path('/', [10, 5, 0], false), path('visit/new', [0, 3, 0])], DAYS)), false);
  const de = profileIn(s, { kind: 'place', name: 'Germany' });
  assert.deepEqual([de.back, de.app, de.told], [75, 10, 40]);
  assert.equal(profileIn(s, null).back, 50);
  // Not counted in the groups read: no share made up.
  assert.equal(profileIn(SLICES, null).back, null);
  assert.equal(profileIn(SLICES, null).app, null);
});

test('the made-up numbers have every new count, and games under both their names', () => {
  const at = new Date('2026-10-18T15:30:00Z');
  const month = demoRead(30, at);
  const l = month.now;
  // The made-up game dropped hot seat on the 14th: both names, read as one.
  const race = l.games.rows.find((r) => r.mode === 'race')!;
  assert.ok(race.paths.includes('play/race') && race.paths.includes('play/race-online') && race.paths.includes('play/race-hotseat'));
  assert.ok(l.games.rows.find((r) => r.mode === 'turns')!.screen > 0);
  const j = journeyOf(l);
  assert.equal(j.from, month.from);
  for (const step of ['lobby', 'played', 'finished', 'games-2', 'games-5'] as const) assert.ok((j.counts[step] ?? 0) > 0, step);
  // Each step no more than the one before it.
  assert.ok(j.counts.lobby! >= j.counts.played! && j.counts.played! >= j.counts['games-2']! && j.counts['games-2']! >= j.counts['games-5']!);
  const w = comersOf(l);
  assert.ok(w.fresh > 0 && w.returned > 0 && w.app > 0);
  assert.ok(backShare(w)! > 20 && backShare(w)! < 60);
  assert.ok(month.campaigns.length > 0 && l.sync.paired > 0);
  assert.ok(l.failures.some((f) => f.script));
  const f = firstStepsOf(l);
  assert.ok(f.visits > 0 && f.counts.lobby >= f.counts.played && f.counts.played >= f.counts.finished && f.counts.finished > 0);
  // Every cohort of the last weeks knows how many started, and keeps fewer of them each week.
  const recent = l.cohorts.filter((c) => c.started !== null);
  assert.ok(recent.length >= 3);
  const long = recent.filter((c) => c.weeks.length >= 3);
  assert.ok(long.length >= 2);
  for (const c of long) assert.ok(c.weeks[0]! > c.weeks[2]!, c.week);
  // The groups have them too.
  const s = demoSlices(month);
  assert.ok((s.systems.app ?? []).length > 0 && (s.locations.back ?? []).length > 0);
});

test('steps are a share of page loads once those were counted, reloads included, over the days together', () => {
  // Visits leave reloads out; the steps and page loads don't.
  const c = countsOf(
    [
      path('/', [10, 10, 10], false),
      path('reach/page', [0, 14, 16]),
      path('reach/played', [4, 12, 12]),
      path('reach/finished', [3, 8, 9]),
      path('reach/lobby', [0, 13, 14]),
    ],
    DAYS,
  );
  const j = journeyOf(c);
  // From the day page loads were counted, against them: 24 of 30 played, where visits would say 24 of 20.
  assert.equal(j.from, DAYS[1]);
  assert.equal(j.visitors, 30);
  assert.equal(reachedShare(j, 'played'), 80);
  const s = stepsOf(c);
  assert.deepEqual([s.from, s.visitors, s.played, s.finished], [DAYS[1], 30, 24, 17]);
  // Before page loads were counted: against visits, from the first step counted.
  const old = stepsOf(countsOf([path('/', [10, 10, 10], false), path('reach/played', [4, 4, 4])], DAYS));
  assert.deepEqual([old.from, old.visitors, old.played], [DAYS[0], 30, 12]);
});

test("a first visit's steps, of the visits that found no save", () => {
  const c = countsOf(
    [path('/', [10, 20, 30], false), path('visit/new', [5, 10, 15]), path('new/lobby', [0, 6, 8]), path('new/played', [0, 4, 6]), path('new/finished', [0, 3, 4])],
    DAYS,
  );
  const f = firstStepsOf(c);
  // From the first day visits with no save were counted, not the first day one got a step along.
  assert.equal(f.from, DAYS[0]);
  assert.equal(f.visits, 30);
  assert.deepEqual(f.counts, { lobby: 14, played: 10, finished: 7 });
  assert.equal(firstStepsOf(countsOf([path('new/played', [5, 5, 5])], DAYS)).from, null);
});

test('ISO weeks, and those who first played in one coming back the weeks after', () => {
  assert.equal(isoWeek('2026-10-19'), '2026-W43');
  assert.equal(isoWeek('2026-10-25'), '2026-W43');
  // The first days of a year can belong to the last week of the one before, and the other way round.
  assert.equal(isoWeek('2027-01-01'), '2026-W53');
  assert.equal(isoWeek('2025-12-29'), '2026-W01');
  assert.equal(weekMonday('2026-W43'), '2026-10-19');
  assert.equal(weekMonday('2026-W01'), '2025-12-29');
  assert.equal(weekMonday('nonsense'), null);
  const days = daysBetween('2026-10-12', '2026-10-28');
  const at = (vs: Record<string, number>): PathCount => ({ path: '', event: false, count: Object.values(vs).reduce((a, b) => a + b, 0), days: vs });
  const c = countsOf(
    [
      { ...at({ '2026-10-12': 30, '2026-10-20': 20 }), path: 'visit/new' },
      { ...at({ '2026-10-13': 10, '2026-10-20': 2 }), path: 'new/played' },
      { ...at({ '2026-10-14': 4, '2026-10-21': 3, '2026-10-27': 1 }), path: 'cohort/2026-W42' },
      { ...at({ '2026-10-22': 2 }), path: 'cohort/2026-W43' },
      // A week begun long before the period: no count of who started, its first weeks not in it.
      { ...at({ '2026-10-12': 1 }), path: 'cohort/2026-W40' },
      { ...at({ '2026-10-12': 1 }), path: 'cohort/garbage' },
    ],
    days,
  );
  assert.deepEqual(
    c.cohorts.map((x) => [x.week, x.started, x.weeks]),
    [
      ['2026-W40', null, [null, null, 1, 0, 0]],
      ['2026-W42', 10, [4, 3, 1]],
      ['2026-W43', 2, [2, 0]],
    ],
  );
  // Counting began after a week's Monday: who started that week isn't known, rather than far too few.
  const late = countsOf(
    [
      { ...at({ '2026-10-14': 30 }), path: 'visit/new' },
      { ...at({ '2026-10-14': 10 }), path: 'new/played' },
      { ...at({ '2026-10-15': 4 }), path: 'cohort/2026-W42' },
    ],
    days,
  );
  assert.equal(late.cohorts[0].started, null);
  // A week over before visits were told apart has nothing counted: not none.
  const later = countsOf(
    [
      { ...at({ '2026-10-21': 30 }), path: 'visit/new' },
      { ...at({ '2026-10-22': 1 }), path: 'cohort/2026-W41' },
    ],
    days,
  );
  assert.deepEqual(later.cohorts[0].weeks, [null, null, 1, 0]);
  // The table's rows: the weeks its columns reach, none after the period (a clock years off).
  const odd = [...c.cohorts, { week: '2031-W05', monday: weekMonday('2031-W05')!, started: null, weeks: [] }];
  assert.deepEqual(recentCohorts(odd, '2026-10-28', 3).map((x) => x.week), ['2026-W42', '2026-W43']);
  assert.deepEqual(recentCohorts(odd, '2026-10-28').map((x) => x.week), ['2026-W40', '2026-W42', '2026-W43']);
});

test('a site listed twice, its referrer once cleaned and once not, is one', () => {
  assert.deepEqual(
    sameSites([
      { name: 'https://www.reddit.com', count: 10 },
      { name: '(unknown)', count: 30 },
      { name: 'www.reddit.com', count: 4 },
      { name: 'https://discord.com', count: 5 },
      { name: '', count: 2 },
    ]),
    [
      { name: '(unknown)', count: 30 },
      { name: 'reddit.com', count: 14 },
      { name: 'discord.com', count: 5 },
      { name: '', count: 2 },
    ],
  );
  // The made-up referrers have one too.
  const refs = demoRead(30, new Date('2026-10-18T15:30:00Z')).refs;
  assert.equal(refs.filter((r) => r.name === 'reddit.com').length, 1);
});

test('a change is called sure only beyond what chance would make: counts by themselves, percents by what they are of', () => {
  assert.equal(beyondChanceOf(30, 10), true);
  assert.equal(beyondChanceOf(12, 10), false);
  // 50% against 40%: of 10 each, chance; of 2,000 each, not.
  assert.equal(rateBeyondChance(50, 10, 40, 10), false);
  assert.equal(rateBeyondChance(50, 2000, 40, 2000), true);
  // One against one, all against none: still chance. Of nothing, never sure.
  assert.equal(rateBeyondChance(100, 1, 0, 1), false);
  assert.equal(rateBeyondChance(50, 0, 40, 10), false);
});

test("a usual day by now: the whole days' counts up to the hour it is, on average", () => {
  const hours = (at: Record<number, number>) => Array.from({ length: 24 }, (_, h) => at[h] ?? 0);
  const visits: PathCount = {
    path: '/',
    event: false,
    count: 18,
    days: { '2026-10-14': 7, '2026-10-15': 4, '2026-10-16': 7 },
    hours: { '2026-10-14': hours({ 3: 2, 10: 5 }), '2026-10-15': hours({ 8: 4 }), '2026-10-16': hours({ 3: 7 }) },
  };
  // At 09:00 on the 16th: the 14th had 2 by then and the 15th 4; the 16th itself is what's set against them.
  assert.equal(usualByNow([visits], DAYS, 9), 3);
  // At 08:30, half of the hour it's in: the 15th's 4 at 08:00 count as 2.
  assert.equal(usualByNow([visits], DAYS, 8.5), 2);
  assert.equal(usualByNow([visits], DAYS, null), null);
  // A path counted without its hours can't be cut at an hour.
  assert.equal(usualByNow([visits, path('play/race', [1, 1, 1])], DAYS, 9), null);
});

test("a usual day by now in UTC days, as Today's unique counts them", () => {
  const hours = (at: Record<number, number>) => Array.from({ length: 24 }, (_, h) => at[h] ?? 0);
  // Berlin is two hours ahead: its 01:00 on the 14th is the 13th's 23:00 in UTC, its 03:00 the 14th's 01:00.
  const right: PathCount = {
    path: 'daily/right',
    event: true,
    count: 22,
    days: {},
    hours: { '2026-10-14': hours({ 1: 7, 3: 2, 10: 5 }), '2026-10-15': hours({ 8: 4 }), '2026-10-16': hours({ 3: 9 }) },
  };
  // 09:00 in Berlin on the 16th is 07:00 UTC: by then the 14th (UTC) had 2 and the 15th 4.
  assert.equal(usualByNowUtc(right, DAYS, 'Europe/Berlin', 9), 3);
  // Only the days from the one it began.
  assert.equal(usualByNowUtc(right, DAYS, 'Europe/Berlin', 9, '2026-10-15'), 4);
  assert.equal(usualByNowUtc(undefined, DAYS, 'Europe/Berlin', 9), 0);
});

test('a day on average over the whole days, the last one still going left out', () => {
  assert.equal(wholeDayAverage([4, 6, 100]), 5);
  assert.equal(wholeDayAverage([3]), null);
});

test('failures for every 100 games and tries to join', () => {
  const c = countsOf([path('play/race-online', [40, 40, 20]), path('error/join-no-answer', [1, 1, 2])], DAYS);
  assert.equal(failureRate(c), 4);
  assert.equal(failureRate(countsOf([], DAYS)), null);
});

test("a group's Delve runs by depth, and the calls that read them", () => {
  const s: Slices = { ...SLICES, depths: { locations: { 0: [{ name: 'Germany', count: 5 }, { name: 'France', count: 3 }], 20: [{ name: 'Germany', count: 1 }] } } };
  // From 0 to the deepest anyone got, a depth nobody ended in as none.
  assert.deepEqual(depthsIn(s, { kind: 'place', name: 'Germany' }), [
    { from: 0, count: 5 },
    { from: 10, count: 0 },
    { from: 20, count: 1 },
  ]);
  assert.deepEqual(depthsIn(s, null)?.map((r) => r.count), [8, 0, 1]);
  // Systems' depths weren't read.
  assert.equal(depthsIn(s, { kind: 'system', name: 'Windows' }), null);
  assert.equal(depthsIn(SLICES, null), null);
  const c = { days: ['2026-10-10', '2026-10-11'], delve: { ranges: [{ from: 0, count: 3 }, { from: 10, count: 0 }, { from: 20, count: 1 }] } } as unknown as Counts;
  // Each ten depths some run ended in, by country and by system, from the period's first day.
  assert.deepEqual(
    depthCalls(c).map((x) => `${x.dim} ${x.paths.join()} ${x.start}`),
    ['locations delve/depth-0-9 2026-10-10', 'systems delve/depth-0-9 2026-10-10', 'locations delve/depth-20-29 2026-10-10', 'systems delve/depth-20-29 2026-10-10'],
  );
});

test("a usual day in UTC days counts only those read from their start, and the game's day is the UTC day it is now", () => {
  const hours = (at: Record<number, number>) => Array.from({ length: 24 }, (_, h) => at[h] ?? 0);
  // New York is four hours behind: the read starts at 04:00 UTC on the 14th, so that UTC day isn't whole.
  const right: PathCount = { path: 'daily/right', event: true, count: 21, days: {}, hours: { '2026-10-14': hours({ 0: 9, 21: 2 }), '2026-10-15': hours({ 5: 3, 12: 7 }) } };
  // 09:00 in New York on the 16th is 13:00 UTC: the 15th (UTC) had its 01:00 and 09:00 answers by then, 2 and 3.
  assert.equal(usualByNowUtc(right, DAYS, 'America/New_York', 9), 5);
  // At 22:00 there on the 16th it's 02:00 UTC on the 17th: the game's day is the 17th, its answers those since UTC midnight.
  const daily = (path: string, at: Record<number, number>): PathCount => ({ path, event: true, count: 0, days: { '2026-10-16': 0 }, hours: { '2026-10-16': hours(at) } });
  const late = countsOf([daily('daily/right', { 19: 4, 21: 3 }), daily('daily/wrong', { 21: 1 })], DAYS, 'America/New_York', 22);
  assert.deepEqual(late.gameDay, { day: '2026-10-17', right: 3, wrong: 1 });
  // Berlin at 01:30 on the 16th is 23:30 UTC on the 15th: yesterday's item, still being answered.
  assert.equal(countsOf([daily('daily/right', { 0: 2 })], DAYS, 'Europe/Berlin', 1.5).gameDay?.day, '2026-10-15');
  // Without the hours, nothing to sort by the game's days.
  assert.equal(countsOf([path('daily/right', [1, 1, 1])], DAYS, 'Europe/Berlin', 9).gameDay, null);
});

test('a percent past 100, as failures for every 100 games can run, is still weighed', () => {
  assert.equal(rateBeyondChance(300, 10, 5, 100), true);
});

test('a day on average now and before, with the counts behind both over as many days', () => {
  assert.deepEqual(dayAverages([4, 6, 100], [2, 2, 9]), { now: 5, before: 2, of: { now: 10, before: 4 } });
  assert.deepEqual(dayAverages([3], [1]), { now: null, before: null });
});
