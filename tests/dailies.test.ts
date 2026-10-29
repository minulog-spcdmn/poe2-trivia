// Today's unique's rows (src/data/dailies.json, lib/dailyRows.ts, written by
// scripts/deal.mjs): a day once played never changes, the days still to come
// are dealt from the item data as it is, and a refresh moves only those.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isFake, type Item, type Question } from '../src/lib/game.ts';
import { DAILY_LAUNCH, cutoffDay, dailyQuestion, dealLive, utcDay } from '../src/lib/daily.ts';
import { ROWS_FROM, ROWS_TO, dailyRow } from '../src/lib/dailyRows.ts';
import { FILE, deal, fileOf, rowsOf } from '../scripts/deal.mjs';
import { liveDailies } from '../scripts/live-dailies.mjs';
import { fakes, items } from './helpers.ts';

const DAY_MS = 86_400_000;
const text = readFileSync(FILE, 'utf8');
const { rows } = rowsOf(text);
const today = utcDay(Date.now());
const cutoff = cutoffDay(Date.now());
const parsed = (row: string) => JSON.parse(row) as Question;

test('the rows run from the first day, a day each, and a day with one asks it', () => {
  assert.equal(ROWS_FROM, utcDay(DAILY_LAUNCH));
  assert.equal(ROWS_TO, ROWS_FROM + rows.length - 1);
  assert.equal(dailyRow(ROWS_FROM - 1), null);
  assert.equal(dailyRow(ROWS_TO + 1), null);
  for (const day of [ROWS_FROM, today, ROWS_TO]) assert.equal(JSON.stringify(dailyQuestion(day)), rows[day - ROWS_FROM]);
  // Past the last row, the day is dealt from the item data.
  assert.deepEqual(dailyQuestion(ROWS_TO + 1), dealLive(items, fakes, ROWS_TO + 1));
});

test('the days still to come are dealt from the item data and code as they are (run `npm run deal`)', () => {
  // A deal forgotten after a refresh, or a change to how the daily deals, or a merge that kept another branch's rows.
  for (let day = cutoff; day <= ROWS_TO; day++) {
    assert.equal(rows[day - ROWS_FROM], JSON.stringify(dealLive(items, fakes, day)), `day ${day}: run \`npm run deal\``);
  }
});

test('every id the rows name from yesterday on is an item', () => {
  // Days gone by may name an item the game has since let go of: only their names are read again (the stats page).
  const ids = new Set(items.map((it) => it.id));
  for (let day = today - 1; day <= ROWS_TO; day++) {
    const q = parsed(rows[day - ROWS_FROM]);
    for (const id of [q.itemId, ...q.options.filter((o) => !isFake(o))]) assert.ok(ids.has(id), `day ${day} names ${id}, not an item`);
  }
});

test("no day before the cutoff differs from the live site's (run `npm run deal`, which puts them back)", (t) => {
  // In CI the live site's file is found before the tests run; the beta's run leaves this out (a beta never goes live).
  const live = liveDailies();
  if (!live.text) return t.skip(`no live rows to compare with (from ${live.from})`);
  const shown = rowsOf(live.text).rows;
  // Every day the live site may be asking by the time this goes live: a row is never edited, and a deal never reaches back.
  for (let i = 0; i < Math.min(shown.length, cutoff - ROWS_FROM); i++) {
    assert.ok(i < rows.length, `the rows end on day ${ROWS_TO}, before the live site's`);
    assert.equal(rows[i], shown[i], `day ${ROWS_FROM + i} (${new Date((ROWS_FROM + i) * DAY_MS).toISOString().slice(0, 10)}) differs from ${live.from}`);
  }
});

test('a deal puts the days before the cutoff back as the live site has them (a merge that slipped past it)', () => {
  // The rows as a refresh merged too late left them: two days before the cutoff dealt again.
  const moved = [...rows];
  for (const day of [today + 1, cutoff - 1]) moved[day - ROWS_FROM] = JSON.stringify({ ...JSON.parse(moved[day - ROWS_FROM]), itemId: 'moved' });
  const { text: fixed, restored } = deal(fileOf(ROWS_FROM, moved), items, fakes, Date.now(), { live: text });
  assert.equal(restored, 2);
  assert.equal(fixed, text);
});

test('a refresh that adds, removes and renames an item moves no day before the cutoff, and new items reach the days to come', () => {
  const now = Date.now();
  const at = (day: number) => parsed(rows[day - ROWS_FROM]);
  const byId = new Map(items.map((it) => [it.id, it]));
  // Today's answer renamed (its id kept), a later day's answer gone, and new items: a few, as one alone may
  // go unasked for a year (each is asked or offered about three times in one), in the kinds later days ask.
  const renamed = byId.get(at(today).itemId)!;
  const removed = byId.get([...Array(30).keys()].map((i) => at(cutoff + 10 + i).itemId).find((id) => id !== renamed.id)!)!;
  const added: Item[] = [...Array(8).keys()].map((i) => ({ ...byId.get(at(cutoff + 1 + i).itemId)!, id: `feedface000${i}`, name: `Pretend Unique ${i}` }));
  const after = [...items.filter((it) => it !== removed).map((it) => (it === renamed ? { ...it, name: 'Renamed Unique' } : it)), ...added];
  const afterFakes: Record<string, string[]> = { ...fakes, 'Renamed Unique': fakes[renamed.name] };
  for (const it of added) afterFakes[it.name] = [`${it.name} Feigned`, `${it.name} Forged`];
  delete afterFakes[renamed.name];

  const dealt = rowsOf(deal(text, after, afterFakes, now).text).rows;
  for (let day = ROWS_FROM; day < cutoff; day++) assert.equal(dealt[day - ROWS_FROM], rows[day - ROWS_FROM], `day ${day}`);
  assert.equal(parsed(dealt[today - ROWS_FROM]).labels[parsed(dealt[today - ROWS_FROM]).options.indexOf(renamed.id)], renamed.name, 'today keeps the name it was asked by');
  assert.equal(dealt.length, cutoff + 365 - ROWS_FROM + 1, 'a year past the cutoff');
  const ahead = dealt.slice(cutoff - ROWS_FROM).map(parsed);
  assert.ok(ahead.some((q) => added.some((it) => q.options.includes(it.id))), 'a new item is asked or offered');
  assert.ok(!ahead.some((q) => q.itemId === removed.id || q.options.includes(removed.id)), 'the removed item is gone');
  for (const q of ahead) {
    const i = q.options.indexOf(renamed.id);
    if (i >= 0) assert.equal(q.labels[i], 'Renamed Unique');
  }
});
