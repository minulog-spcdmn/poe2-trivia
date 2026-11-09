// Today's unique's rows (src/data/dailies.json, lib/dailyRows.ts, written by
// scripts/deal.mjs): a day once played never changes, the days still to come
// are dealt from the item data as it is, and a refresh moves only those.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TWINS, isFake, type Item, type Question } from '../src/lib/game.ts';
import { DAILY_LAUNCH, DAILY_NEW_WEEK, cutoffDay, dailyQuestion, dealFrom, dealLive, newWeek, repeatGap, utcDay } from '../src/lib/daily.ts';
import { RELEASES, dayNumber } from '../src/lib/releases.ts';
import { ROWS_FROM, ROWS_TO, ROW_ANSWERS, dailyRow } from '../src/lib/dailyRows.ts';
import { FILE, MARGIN_MS, deal, fileOf, rowsOf } from '../scripts/deal.mjs';
import { liveDailies } from '../scripts/live-dailies.mjs';
import { fakes, items } from './helpers.ts';

const DAY_MS = 86_400_000;
const text = readFileSync(FILE, 'utf8');
const { rows } = rowsOf(text);
const today = utcDay(Date.now());
const cutoff = dealFrom(Date.now(), items);
// A deal keeps the live rows a little further (deal.mjs MARGIN_MS): the days between are the live site's or dealt anew.
const dealtFrom = dealFrom(Date.now() + MARGIN_MS, items);
const parsed = (row: string) => JSON.parse(row) as Question;

test('the rows run from the first day, a day each, and a day with one asks it', () => {
  assert.equal(ROWS_FROM, utcDay(DAILY_LAUNCH));
  assert.equal(ROWS_TO, ROWS_FROM + rows.length - 1);
  assert.equal(dailyRow(ROWS_FROM - 1), null);
  assert.equal(dailyRow(ROWS_TO + 1), null);
  for (const day of [ROWS_FROM, today, ROWS_TO]) assert.equal(JSON.stringify(dailyQuestion(day)), rows[day - ROWS_FROM]);
  // Past the last row, each day is dealt from the item data and the answers before it.
  const next = dealLive(items, fakes, ROWS_TO + 1, ROW_ANSWERS);
  assert.deepEqual(dailyQuestion(ROWS_TO + 1), next);
  assert.deepEqual(dailyQuestion(ROWS_TO + 2), dealLive(items, fakes, ROWS_TO + 2, [...ROW_ANSWERS, next.itemId]));
});

test('the days still to come are dealt from the item data and code as they are (run `npm run deal`)', () => {
  // A deal forgotten after a refresh, or a change to how the daily deals, or a merge that kept another branch's rows.
  for (let day = dealtFrom; day <= ROWS_TO; day++) {
    const asked = ROW_ANSWERS.slice(0, day - ROWS_FROM);
    assert.equal(rows[day - ROWS_FROM], JSON.stringify(dealLive(items, fakes, day, asked)), `day ${day}: run \`npm run deal\``);
  }
});

test('no answer comes back from the cutoff on until repeatGap days have gone by', () => {
  // The days before the cutoff were dealt each on its own, and one came back after six days (2026-10-31).
  const gap = repeatGap(items);
  assert.ok(gap >= 300, `a gap of ${gap} days`);
  const last = new Map<string, number>();
  for (let day = ROWS_FROM; day <= ROWS_TO + 30; day++) {
    // Twins (the same picture turned or recoloured) count as one.
    const id = dailyQuestion(day).itemId;
    const name = items.find((it) => it.id === id)?.name ?? id;
    const key = TWINS.find((t) => t.names.includes(name))?.names[0] ?? id;
    const was = last.get(key);
    if (day >= cutoff && was !== undefined) assert.ok(day - was > gap, `day ${day} asks ${name} again after ${day - was} days`);
    last.set(key, day);
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
  const days = new Set([today, cutoff - 1]);
  for (const day of days) moved[day - ROWS_FROM] = JSON.stringify({ ...JSON.parse(moved[day - ROWS_FROM]), itemId: 'moved' });
  const { text: fixed, restored } = deal(fileOf(ROWS_FROM, moved), items, fakes, Date.now(), { live: text });
  assert.equal(restored, days.size);
  // (Over the days the file has: a deal reaches a year past the cutoff, a day further each day it moves on, from
  // 22:00 UTC, before the file is dealt again.)
  assert.deepEqual(rowsOf(fixed).rows.slice(0, rows.length), rows);
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
  assert.equal(dealt.length, cutoffDay(now) + 365 - ROWS_FROM + 1, 'a year past the week ahead');
  const ahead = dealt.slice(cutoff - ROWS_FROM).map(parsed);
  assert.ok(ahead.some((q) => added.some((it) => q.options.includes(it.id))), 'a new item is asked or offered');
  assert.ok(!ahead.some((q) => q.itemId === removed.id || q.options.includes(removed.id)), 'the removed item is gone');
  for (const q of ahead) {
    const i = q.options.indexOf(renamed.id);
    if (i >= 0) assert.equal(q.labels[i], 'Renamed Unique');
  }
});

test('the refresh that brings a release’s items deals from the next day, so their week starts then', () => {
  // A release's items as its refresh stamps them, a few of each kind (but gems), on items stamped by none yet.
  const release = RELEASES.at(-1)!;
  const came = (it: Item, i: number) => it.kind !== 'gem' && i % 8 === 0;
  const after = items.map(({ added: _, ...it }, i) => (came(it, i) ? { ...it, added: release.from } : it));
  const day = dayNumber(release.from);
  const at = (d: number, hour: number) => (d * 24 + hour) * 3_600_000;
  assert.equal(dealFrom(at(day, 12), after), day + 1, 'the refresh’s day: from the next');
  assert.equal(dealFrom(at(day, 22.5), after), day + 1, 'an hour and a half before its end: still from the next');
  assert.equal(dealFrom(at(day, 23), after), day + 2, 'in its last hour: the next may be played already');
  assert.equal(dealFrom(at(day + 3, 12), after), day + 4, 'a refresh again in their week: still from the next day');
  assert.equal(dealFrom(at(day + DAILY_NEW_WEEK + 1, 12), after), day + DAILY_NEW_WEEK + 2, 'a late deal’s week runs on a little');
  assert.equal(dealFrom(at(day + DAILY_NEW_WEEK + 2, 12), after), cutoffDay(at(day + DAILY_NEW_WEEK + 2, 12)), 'their week dealt: a week ahead again');
  assert.equal(dealFrom(at(day - 1, 12), after), cutoffDay(at(day - 1, 12)), 'before they came: a week ahead');
  assert.equal(dealFrom(at(day, 12), items.map(({ added: _, ...it }) => it)), cutoffDay(at(day, 12)), 'no release’s items: a week ahead');
  // The rows as that refresh's deal leaves them (dealt from the rows there are, which end a year past today).
  if (day + 1 + DAILY_NEW_WEEK > ROWS_TO) return;
  const ids = newWeek(after)!.ids;
  const dealt = rowsOf(deal(text, after, fakes, at(day, 12)).text).rows.map(parsed);
  for (let d = day + 1; d < day + 1 + DAILY_NEW_WEEK; d++) assert.ok(ids.has(dealt[d - ROWS_FROM].itemId), `day ${d - day} after the refresh`);
  for (let d = ROWS_FROM; d <= day; d++) assert.equal(JSON.stringify(dealt[d - ROWS_FROM]), rows[d - ROWS_FROM], `day ${d} kept`);
});
