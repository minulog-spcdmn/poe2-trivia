// A tab open since an earlier day loads again when the live site's rows ask another question today (src/lib/staleRows.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { liveRow, reloadedUnseen, rowsChecked, watchRows } from '../src/lib/staleRows.ts';
import { LIVE_ROWS } from '../src/lib/liveRows.ts';
import { ROWS_FROM, ROWS_TO, dailyRow } from '../src/lib/dailyRows.ts';
import { memoryStorage } from './helpers.ts';

const DAY_MS = 86_400_000;
const text = readFileSync(new URL('../src/data/dailies.json', import.meta.url), 'utf8');

test('the live rows’ row for a day, as the file writes it, or none', () => {
  assert.equal(liveRow(text, ROWS_FROM), JSON.stringify(dailyRow(ROWS_FROM)));
  assert.equal(liveRow(text, ROWS_TO), JSON.stringify(dailyRow(ROWS_TO)));
  assert.equal(liveRow(text, ROWS_TO + 1), null);
  assert.equal(liveRow(text, ROWS_FROM - 1), null);
  for (const bad of ['', 'not json', '{}', '{"from":"soon","days":[]}', '{"from":"2026-10-09","days":[{"itemId":3}]}']) assert.equal(liveRow(bad, ROWS_FROM), null, bad);
});

test('the build puts the rows beside the page, where a tab looks for them', () => {
  assert.match(readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8'), /fileName: LIVE_ROWS, source: readFileSync\(new URL\('\.\/src\/data\/dailies\.json'/);
  assert.equal(LIVE_ROWS, 'dailies.json');
});

/** A tab watching from the middle of `day`, with the live rows `live` (a status for a failing fetch, `slow` ms in coming) and the tab `hidden` or not. */
function tab(day: number, live: string | number, opts: { idle?: () => boolean; hidden?: boolean; slow?: number } = {}) {
  const g = globalThis as Record<string, unknown>;
  let seen = () => {};
  let minute = () => {};
  const doc = { visibilityState: opts.hidden ? 'hidden' : 'visible', addEventListener: (_: string, f: () => void) => (seen = f) };
  g.document = doc;
  g.sessionStorage ??= memoryStorage();
  const state = { now: (day + 0.5) * DAY_MS, reloads: 0, fetched: 0 };
  watchRows(opts.idle ?? (() => true), () => state.now, {
    rows: async () => {
      state.fetched++;
      if (opts.slow) await new Promise((done) => setTimeout(done, opts.slow));
      return typeof live === 'number' ? new Response('', { status: live }) : new Response(live);
    },
    reload: () => void state.reloads++,
    later: (f) => void (minute = f),
  });
  return {
    state,
    doc,
    /** The tab comes into sight or goes (its listener), then the looks settle. */
    async turn(hidden: boolean) {
      doc.visibilityState = hidden ? 'hidden' : 'visible';
      seen();
      await new Promise((done) => setTimeout(done, 5));
    },
    /** A minute's turn as it stands, then the looks settle. */
    async tick() {
      minute();
      await new Promise((done) => setTimeout(done, 5));
    },
  };
}

test('a tab open since an earlier day looks at today’s row, holds an answer to it, and loads again only out of sight, coming back into sight or in place of that answer', async (t) => {
  const g = globalThis as Record<string, unknown>;
  const was = { document: g.document, sessionStorage: g.sessionStorage };
  t.after(() => Object.assign(g, was));
  const day = Math.min(ROWS_TO - 2, Math.max(ROWS_FROM + 1, Math.floor(Date.now() / DAY_MS)));
  /** The live rows with tomorrow's options in another order: another question, the same answer. */
  const changed = (() => {
    const f = JSON.parse(text);
    f.days[day + 1 - ROWS_FROM].options.reverse();
    return JSON.stringify(f);
  })();

  const same = tab(day, text);
  assert.equal(rowsChecked(day), null, 'the day it loaded on: nothing to wait for');
  same.state.now += DAY_MS;
  assert.equal(await rowsChecked(day + 1), true, 'the same row: answered as it is');
  await same.turn(true);
  assert.deepEqual([same.state.reloads, same.state.fetched], [0, 1], 'one look a day');

  g.sessionStorage = memoryStorage();
  const seen = tab(day, changed);
  seen.state.now += DAY_MS;
  await seen.tick();
  assert.equal(seen.state.reloads, 0, 'in sight: not under the player');
  assert.equal(await rowsChecked(day + 1), false, 'another row: the answer is held back');
  assert.equal(seen.state.reloads, 1, 'and the tab loads again in its place');

  g.sessionStorage = memoryStorage();
  const back = tab(day, changed, { hidden: true });
  back.state.now += DAY_MS;
  await back.turn(false);
  assert.equal(back.state.reloads, 1, 'coming back into sight (a phone looks only then): loads again before anything is tapped');

  g.sessionStorage = memoryStorage();
  const away = tab(day, changed);
  away.state.now += DAY_MS;
  await away.turn(true);
  assert.equal(away.state.reloads, 1, 'out of sight: loads again');
  assert.ok(reloadedUnseen() && !reloadedUnseen(), 'and the load it comes to counts as no visit, once');

  g.sessionStorage = memoryStorage();
  let idle = false;
  const busy = tab(day, changed, { idle: () => idle, hidden: true });
  busy.state.now += DAY_MS;
  await busy.turn(true);
  assert.equal(busy.state.reloads, 0, 'not in a room or a game');
  assert.equal(await rowsChecked(day + 1), true, 'where it can’t load again, the answer stands');
  assert.equal(busy.state.reloads, 0);
  idle = true;
  await busy.turn(true);
  assert.equal(busy.state.reloads, 1, 'but once out of it');

  // Loaded again and served the old page all the same (a stale copy): not over and over.
  const again = tab(day, changed);
  again.state.now += DAY_MS;
  await again.turn(true);
  assert.equal(again.state.reloads, 0, 'once a day at most');
  assert.equal(await rowsChecked(day + 1), true, 'and then the answer stands');

  // A device's clock a few minutes ahead, loaded a minute before the day turns: the next day is looked at all the same.
  g.sessionStorage = memoryStorage();
  const ahead = tab(day + 1, changed);
  ahead.state.now = (day + 1) * DAY_MS - 60_000;
  await ahead.turn(true);
  assert.equal(ahead.state.fetched, 0, 'its own day: nothing to look at');
  ahead.state.now += 120_000;
  await ahead.turn(true);
  assert.equal(ahead.state.reloads, 1, 'the day it showed first, once it has come');

  g.sessionStorage = memoryStorage();
  const down = tab(day, 503);
  down.state.now += DAY_MS;
  assert.equal(await rowsChecked(day + 1), true, 'the site down: the tab’s own row stands');
  await down.turn(true);
  assert.equal(down.state.fetched, 2, 'and the next look asks again');
  const none = tab(day, 404);
  none.state.now += DAY_MS;
  await none.turn(true);
  await none.turn(true);
  assert.equal(none.state.fetched, 1, 'no file there (the dev server): asked once');
});

test('an answer waits for the look only so long, and a tab that can’t note its loading again never loads again by itself', async (t) => {
  const g = globalThis as Record<string, unknown>;
  const was = { document: g.document, sessionStorage: g.sessionStorage };
  t.after(() => Object.assign(g, was));
  const day = Math.min(ROWS_TO - 2, Math.max(ROWS_FROM + 1, Math.floor(Date.now() / DAY_MS)));
  const changed = (() => {
    const f = JSON.parse(text);
    f.days[day + 1 - ROWS_FROM].options.reverse();
    return JSON.stringify(f);
  })();

  g.sessionStorage = memoryStorage();
  const slow = tab(day, changed, { slow: 100 });
  slow.state.now += DAY_MS;
  assert.equal(await rowsChecked(day + 1, 20), true, 'past the wait: the answer stands');
  await new Promise((done) => setTimeout(done, 150));
  assert.equal(slow.state.reloads, 0, 'and the look, come late, loads nothing over it');

  // Session storage full or blocked: it couldn't tell it had loaded again for the day, so it doesn't.
  g.sessionStorage = memoryStorage(new Map(), () => false);
  const blocked = tab(day, changed, { hidden: true });
  blocked.state.now += DAY_MS;
  await blocked.turn(true);
  assert.equal(blocked.state.reloads, 0, 'out of sight: not');
  assert.equal(await rowsChecked(day + 1), true, 'and the answer stands');
  assert.equal(blocked.state.reloads, 0);
});
