import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, dayIn, midnight, zoneOf } from '../src/statsPage/zone.ts';
import { axis, labelled } from '../src/statsPage/chart.ts';
import { change, countsOf, dailyAverage, dailyDays, daysBetween, descentOf, deviceOf, grouped, hardestAndEasiest, medianRange, modesOf, percent, pointsChange, sharePerDay, sizeName, sizesOf, type PathCount } from '../src/statsPage/model.ts';

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
  // Modes nobody played aren't listed.
  assert.deepEqual(
    l.games.rows.map((r) => `${r.mode}-${r.where}`),
    ['race-online', 'delve-hotseat'],
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

test('a mode adds up both places it is played', () => {
  const l = countsOf(
    [path('play/delve-online', [2, 0, 0]), path('play/delve-hotseat', [5, 0, 0]), path('end/delve-hotseat', [4, 0, 0])],
    DAYS,
  );
  const delve = modesOf(l.games.rows).find((m) => m.mode === 'delve')!;
  assert.deepEqual([delve.started, delve.finished, delve.online, delve.hotseat], [7, 4, 2, 5]);
  // Every mode is there, played or not.
  assert.deepEqual(
    modesOf(l.games.rows).map((m) => [m.mode, m.started]),
    [
      ['turns', 0],
      ['race', 0],
      ['delve', 7],
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

test('weeks are summed back from the last day, so the newest week is whole', () => {
  const days = daysBetween('2026-10-01', '2026-10-10');
  const g = grouped(days, [1, 1, 1, 1, 1, 1, 1, 1, 1, 1], 7);
  assert.deepEqual(g, { days: ['2026-10-01', '2026-10-04'], values: [3, 7] });
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

test('dates along an axis: as many as fit, the last always among them', () => {
  assert.deepEqual(labelled(30, 660, 66), [2, 5, 8, 11, 14, 17, 20, 23, 26, 29]);
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
  assert.deepEqual(
    hardest.map((x) => x.day),
    ['2026-10-14', '2026-10-12'],
  );
  assert.deepEqual(
    easiest.map((x) => x.day),
    ['2026-10-11', '2026-10-13'],
  );
});

test('daily players on average count only the days it asked', () => {
  const l = countsOf([path('daily/right', [0, 4, 1]), path('daily/wrong', [0, 2, 0])], DAYS);
  // The 16th is still going: left out.
  assert.equal(dailyAverage(l), 3);
  assert.equal(dailyAverage(l, '2026-10-15'), 6);
  // Its only day the one still going: nothing whole to average, so nothing to compare.
  assert.equal(dailyAverage(l, '2026-10-16'), null);
});
