import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, dayIn, midnight, zoneOf } from '../src/statsPage/zone.ts';
import { axis, labelled } from '../src/statsPage/chart.ts';
import { demoRead, demoSlices, demoUpdate } from '../src/statsPage/demo.ts';
import { anyNew, changesOf, freshOf, keptChanges } from '../src/statsPage/changes.ts';
import { countsIn, groupPaths, hashOf, modeLink, profileOf, segments, selOf, sliceCalls, whereOf, type Slices } from '../src/statsPage/slices.ts';
import { busiest, seatsOf, visitsCameTo, weekAverage, weekHours, weekday, change, countsOf, dailyAverage, dailyDays, finishedShare, utcPerDay, daysBetween, descentOf, deviceOf, grouped, hardestAndEasiest, medianRange, modesOf, percent, pointsChange, sharePerDay, sizeName, sizesOf, type PathCount } from '../src/statsPage/model.ts';

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
  // Two Mondays and one Tuesday.
  const avg = weekAverage(grid, ['2026-10-05', '2026-10-06', '2026-10-12']);
  assert.deepEqual([avg[0][10], avg[1][10], avg[2][10]], [3, 6, 0]);
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

test('what a visit comes to: the counts set against each other', () => {
  const c = countsOf(
    [
      path('/', [10, 10, 20], false),
      path('play/race-online', [2, 2, 0]),
      path('size/race-online-3p', [2, 2, 0]),
      path('daily/right', [1, 2, 3]),
      path('daily/wrong', [1, 0, 1]),
      path('join/code', [2, 1, 0]),
      path('joined/code', [1, 1, 0]),
      path('error/join-no-answer', [1, 0, 2]),
    ],
    DAYS,
  );
  const v = visitsCameTo(c);
  assert.equal(v.seats, 12);
  assert.equal(v.perGame, 3);
  assert.equal(v.perVisitor, 12 / 40);
  assert.equal(v.daily, (100 * 8) / 40);
  assert.deepEqual(c.joinsPerDay, { tried: [2, 1, 0], joined: [1, 1, 0] });
  assert.deepEqual(c.failuresPerDay, [1, 0, 2]);
  // Nothing to divide by: nothing said.
  assert.deepEqual(visitsCameTo(countsOf([], DAYS)), { seats: 0, perGame: null, perVisitor: null, daily: null });
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
  assert.deepEqual(g.race, ['play/race-online']);
  assert.deepEqual(g.delve, ['play/delve-hotseat']);
  assert.deepEqual(g.turns, []);
  assert.deepEqual(g.daily, ['daily/right']);
  assert.deepEqual(g.join, ['join/code']);
  assert.deepEqual(g.joined, ['joined/code']);
  assert.deepEqual(g.failed, ['error/join-no-answer']);
  // Two calls (country, system) for each group with paths: no call for Take turns.
  assert.equal(sliceCalls(c).length, 14);
});

const SLICES: Slices = {
  v: 1,
  span: 7,
  from: '2026-10-10',
  at: 0,
  locations: {
    visit: [{ name: 'Germany', count: 40 }, { name: 'France', count: 50 }, { name: '', count: 10 }],
    delve: [{ name: 'Germany', count: 20 }, { name: 'France', count: 5 }],
    race: [{ name: 'France', count: 15 }],
    daily: [{ name: 'Germany', count: 10 }, { name: 'France', count: 10 }],
    join: [{ name: 'Germany', count: 10 }, { name: 'France', count: 10 }],
    joined: [{ name: 'Germany', count: 9 }, { name: 'France', count: 5 }],
  },
  systems: {
    visit: [{ name: 'Windows', count: 70 }, { name: 'iOS', count: 20 }, { name: 'Android', count: 12 }],
    delve: [{ name: 'Windows', count: 15 }, { name: 'iOS', count: 10 }],
  },
};

test("a country's players, set against everyone", () => {
  const de = profileOf(countsIn(SLICES, { kind: 'place', name: 'Germany' }));
  assert.equal(de.visitors, 40);
  assert.equal(de.games, 20);
  assert.equal(de.perVisitor, 0.5);
  assert.deepEqual(de.modes.map((m) => m.share), [0, 0, 100]);
  assert.equal(de.daily, 25);
  assert.equal(de.joins, 90);
  const all = profileOf(countsIn(SLICES, null));
  assert.equal(all.visitors, 100);
  assert.equal(all.games, 40);
  // Everyone by system: its own list's total.
  assert.equal(countsIn(SLICES, null, 'systems').visit, 102);
  // Those GoatCounter couldn't place are a group too.
  assert.equal(countsIn(SLICES, { kind: 'place', name: 'Unknown' }).visit, 10);
  // A kind of device is its systems together.
  assert.equal(countsIn(SLICES, { kind: 'device', name: 'Phone or tablet' }).visit, 32);
  assert.deepEqual(
    segments(SLICES, 'place').map((r) => r.sel.name),
    ['France', 'Germany', 'Unknown'],
  );
});

test('where the players of a mode come from, against where visitors do', () => {
  const rows = whereOf(SLICES, 'delve', 'locations');
  assert.deepEqual(rows.map((r) => r.name), ['Germany', 'France']);
  assert.equal(rows[0].share, 80);
  assert.equal(rows[0].visitShare, 40);
  const kinds = whereOf(SLICES, 'delve', 'systems', true);
  assert.deepEqual(kinds.map((r) => [r.name, r.count]), [['Computer', 15], ['Phone or tablet', 10]]);
});

test('a group is kept in the address, and read back from it', () => {
  for (const sel of [{ kind: 'place', name: 'Korea, Republic of' }, { kind: 'device', name: 'Phone or tablet' }, { kind: 'did', group: 'delve' }] as const)
    assert.deepEqual(selOf(hashOf(sel)), sel);
  assert.equal(hashOf(null), '#groups');
  assert.equal(selOf('#groups'), null);
  assert.equal(selOf('#groups/did/nothing'), null);
  assert.equal(selOf('#groups/place/%E0%A4%A'), null);
  assert.equal(modeLink('Delve'), '#groups/did/delve');
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

test('made-up groups add up to the made-up totals', () => {
  const read = demoRead(30, new Date('2026-10-16T18:30:00Z'));
  const s = demoSlices(read);
  const sum = (g: keyof Slices['locations']) => (s.locations[g] ?? []).reduce((n, x) => n + x.count, 0);
  assert.equal(sum('visit'), read.now.visitors.total);
  assert.ok(Math.abs(sum('delve') - modesOf(read.now.games.rows).find((m) => m.mode === 'delve')!.started) <= 12);
  assert.ok(sum('joined') <= sum('join'));
});
