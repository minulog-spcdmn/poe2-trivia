// npm run deal: writes src/data/dailies.json, Today's unique's question for
// every day from its first to a year ahead (lib/dailyRows.ts). The days
// before the cutoff (lib/daily.ts cutoffDay, a week ahead) keep their rows as
// the live site has them (scripts/live-dailies.mjs): they may be played
// already, or open in a tab. Every row from the cutoff on is dealt again from
// the item data and the code as they are now, so new items reach the days to
// come. Run it last in a refresh, and after any change that changes how the
// daily deals (tests/dailies.test.ts says when).
//
//   npm run deal             # the rows from the cutoff on, dealt again
//   npm run deal -- --fill   # also deal days before the cutoff that have no row (see below)

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DAILY_LAUNCH, cutoffDay, dealLive, utcDay } from '../src/lib/daily.ts';
import { liveDailies } from './live-dailies.mjs';

const DAY_MS = 86_400_000;
/** Days dealt past the cutoff (a year, the cutoff's own day besides). */
export const AHEAD = 365;
export const FILE = fileURLToPath(new URL('../src/data/dailies.json', import.meta.url));

/** The file's rows, each the text of one day's question, from its first day. */
export function rowsOf(/** @type {string} */ text) {
  const { from, days } = JSON.parse(text);
  return { from: utcDay(Date.parse(`${from}T00:00:00Z`)), rows: /** @type {unknown[]} */ (days).map((d) => JSON.stringify(d)) };
}

/** The file for these rows: one row a line, so a diff shows which days changed. */
export function fileOf(/** @type {number} */ from, /** @type {string[]} */ rows) {
  const day = new Date(from * DAY_MS).toISOString().slice(0, 10);
  return `{\n "from": "${day}",\n "days": [\n${rows.map((r) => `  ${r}`).join(',\n')}\n ]\n}\n`;
}

/**
 * The rows dealt again at `now` from these items and made-up names: those
 * before the cutoff as `live` (the live site's file) has them, or for a day
 * it has none `text`; every one from the cutoff on dealt anew. Days before
 * the cutoff with no row in either stop it, unless `fill`: the site dealt
 * those live with the data it had, which only this data before any change
 * to it deals again.
 * @param {string} text
 * @param {import('../src/lib/game.ts').Item[]} items
 * @param {Record<string, string[]>} fakes
 * @param {number} now
 * @param {{ live?: string, fill?: boolean }} [opts]
 */
export function deal(text, items, fakes, now, { live = '', fill = false } = {}) {
  const first = utcDay(DAILY_LAUNCH);
  const cutoff = cutoffDay(now);
  const old = rowsOf(text);
  const shown = live ? rowsOf(live) : { from: first, rows: [] };
  for (const f of [old, shown]) if (f.from !== first) throw new Error(`dailies.json starts on day ${f.from}, not on the first day (${first})`);
  const kept = [];
  for (let i = 0; i < cutoff - first; i++) {
    const row = shown.rows[i] ?? old.rows[i];
    if (row === undefined) break;
    kept.push(row);
  }
  if (kept.length < cutoff - first && !fill) {
    throw new Error(
      `The rows end ${cutoff - first - kept.length} days before the cutoff: the site dealt those days live. ` +
        'Deal them with `npm run deal -- --fill` on the commit that is live, before changing any item data, and commit that first.',
    );
  }
  const rows = [...kept];
  for (let day = first + rows.length; day <= cutoff + AHEAD; day++) rows.push(JSON.stringify(dealLive(items, fakes, day)));
  const was = (/** @type {number} */ i) => old.rows[i] && JSON.parse(old.rows[i]).itemId;
  let answers = 0;
  for (let i = cutoff - first; i < rows.length; i++) if (was(i) !== JSON.parse(rows[i]).itemId) answers++;
  const restored = kept.filter((row, i) => old.rows[i] !== undefined && row !== old.rows[i]).length;
  return { text: fileOf(first, rows), cutoff, kept: kept.length, dealt: rows.length - kept.length, answers, restored };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const read = (/** @type {string} */ f) => JSON.parse(readFileSync(fileURLToPath(new URL(f, import.meta.url)), 'utf8'));
  const live = liveDailies();
  console.log(`Live rows from ${live.from}${live.text ? '' : ': none yet'}.`);
  const result = deal(readFileSync(FILE, 'utf8'), read('../src/data/items.json'), read('../src/data/fakes.json'), Date.now(), { live: live.text, fill: process.argv.includes('--fill') });
  writeFileSync(FILE, result.text);
  const date = (/** @type {number} */ day) => new Date(day * DAY_MS).toISOString().slice(0, 10);
  const from = utcDay(DAILY_LAUNCH) + result.kept;
  if (result.restored) console.log(`Put ${result.restored} days before the cutoff back as the live site has them.`);
  console.log(`Kept ${result.kept} days as they were; dealt ${result.dealt} from ${date(from)} on, ${result.answers} of them from the cutoff (${date(result.cutoff)}) with another answer than before.`);
}
