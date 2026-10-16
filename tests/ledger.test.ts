import { test } from 'node:test';
import assert from 'node:assert/strict';
import { change, daysBetween, descentOf, deviceOf, grouped, ledgerOf, medianRange, modesOf, percent, pointsChange, type PathCount } from '../src/statsPage/model.ts';

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
  const l = ledgerOf(
    [
      path('/', [10, 20, 30], false),
      path('play/race-online', [2, 3, 1]),
      path('end/race-online', [1, 3, 1]),
      path('size/race-online-3-4p', [2, 2, 0]),
      path('size/race-online-2p', [0, 1, 1]),
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
  assert.deepEqual([race.started, race.finished, race.sizes['3-4p'], race.sizes['2p'], race.sizes['1p']], [6, 5, 4, 2, 0]);
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
  const l = ledgerOf([path('delve/depth-0-9', [5, 0, 0]), path('delve/depth-20-29', [1, 0, 0]), path('delve/depth-40-49', [0, 0, 0])], DAYS);
  assert.deepEqual(l.delve.ranges, [
    { from: 0, count: 5 },
    { from: 10, count: 0 },
    { from: 20, count: 1 },
  ]);
  assert.equal(l.delve.total, 6);
  assert.deepEqual(ledgerOf([], DAYS).delve.ranges, []);
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
  const l = ledgerOf(
    [path('play/delve-online', [2, 0, 0]), path('play/delve-hotseat', [5, 0, 0]), path('end/delve-hotseat', [4, 0, 0]), path('size/delve-hotseat-1p', [5, 0, 0]), path('size/delve-online-2p', [2, 0, 0])],
    DAYS,
  );
  const delve = modesOf(l.games.rows).find((m) => m.mode === 'delve')!;
  assert.deepEqual([delve.started, delve.finished, delve.online, delve.hotseat, delve.sizes['1p'], delve.sizes['2p']], [7, 4, 2, 5, 5, 2]);
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
