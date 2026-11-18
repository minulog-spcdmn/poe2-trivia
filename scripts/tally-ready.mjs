#!/usr/bin/env node
// Whether the item tally (signal/worker.js Tally, src/lib/itemTally.ts) holds
// enough answers to tell which items players miss far more than the rest:
// the ones a balance change would keep out of Delve's shallow depths. Run
// once a day by .github/workflows/tally-ready.yml, which asks Claude for the
// verdict only once these numbers pass a floor (FLOOR), so a day short of it
// costs nothing.
//
// Items are ranked as the stats page's Items view ranks them by default
// (src/lib/itemTallyRank.ts rank(): this build's tally version, every mode,
// first meetings and repeats together). Each of items.json's items is then
// clearly above the cut (CUT: its score's 90% interval wholly above it),
// clearly below (wholly below) or undecided (the interval holds the cut, or
// no answers yet). Sums for ids items.json doesn't have are left out and
// counted: anyone can send the tally ids, so nothing of theirs reaches
// Claude's prompt or the issue, only items.json's names and the numbers.
//
// Usage: node --experimental-strip-types scripts/tally-ready.mjs [--file <tally.json>] [--out <summary.md>]
// --file reads the sums from a file (GET /tally's answer) instead of the
// server; --out writes the summary there too. With GITHUB_OUTPUT set it
// writes ask=true when the floor is met (ask=false otherwise), and with
// GITHUB_STEP_SUMMARY the summary goes on the run's page.
// Exits 0, also when the tally can't be read today (not on the server yet: a
// notice; busy, its day's reads spent or no answer: a warning); 1 when the
// server turns the check away (a 403 or another 4xx), answers in a shape it
// doesn't know, or an option is wrong.

import { appendFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TALLY_MODES, rank } from '../src/lib/itemTallyRank.ts';
import { OWN_SIGNAL_HOST } from '../src/lib/signalHost.ts';
import { tallyRowsOf } from '../src/statsPage/tally.ts';

/** @typedef {import('../src/lib/itemTallyRank.ts').TallyRow} TallyRow */
/** @typedef {import('../src/lib/itemTallyRank.ts').Ranked} Ranked */
/** @typedef {{ id: string, name: string, group: string }} Item */
/** @typedef {'above' | 'below' | 'undecided'} Side */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The score an item counts as obscure from: missed at least half again as often as the rest under the same rules. */
export const CUT = 1.5;
/** Claude is asked once at most this share of items.json's items is undecided. */
export const FLOOR = 0.25;
/** The most items listed clearly above the cut. */
export const LISTED = 60;

/** @type {Record<keyof typeof TALLY_MODES, string>} */
const MODE_NAMES = { delve: 'Delve alone', together: 'Delve together', turns: 'Take turns', race: 'Race', practice: 'practice', daily: 'daily' };

const fmt = (/** @type {number} */ n) => n.toLocaleString('en');
const fixed = (/** @type {number} */ n) => (Number.isFinite(n) ? n.toFixed(2) : 'inf');
const cell = (/** @type {string} */ s) => s.replace(/\|/g, '\\|');

/** @param {Ranked | undefined} s @returns {Side} */
const sideOf = (s) => (!s || s.score === null ? 'undecided' : s.low > CUT ? 'above' : s.high < CUT ? 'below' : 'undecided');

/** How many of `items` the ranking puts on each side of the cut. @param {readonly Item[]} items @param {Ranked[]} list */
function sides(items, list) {
  const scored = new Map(list.map((s) => [s.item, s]));
  const out = { above: 0, below: 0, undecided: 0, unanswered: 0, leaning: 0 };
  for (const i of items) {
    const s = scored.get(i.id);
    const side = sideOf(s);
    out[side]++;
    if (!s) out.unanswered++;
    else if (side === 'undecided' && s.score !== null && s.score >= CUT) out.leaning++;
  }
  return out;
}

/**
 * The tally's sums against items.json's items: how many answers, from
 * which modes and depths, how many items sit clearly on each side of the
 * cut, per group too, the items clearly above it, and whether the floor for
 * asking Claude is met, with all of it as Markdown.
 * @param {readonly TallyRow[]} rows @param {readonly Item[]} items @param {Date} [now]
 */
export function summarize(rows, items, now = new Date()) {
  const byId = new Map(items.map((i) => [i.id, i]));
  const known = rows.filter((x) => byId.has(x.item));
  const unknown = rows.length - known.length;
  const { v, list } = rank(known);
  const all = sides(items, list);
  const first = sides(items, rank(known, { first: true }).list);

  const counted = known.filter((x) => x.v === v);
  const answers = counted.reduce((n, x) => n + x.r + x.w, 0);
  /** @type {[string, number][]} */
  const modes = Object.entries(TALLY_MODES).map(([m, keeps]) => [MODE_NAMES[/** @type {keyof typeof TALLY_MODES} */ (m)], counted.filter((x) => keeps(x.ctx)).reduce((n, x) => n + x.r + x.w, 0)]);
  /** Answers per depth band (d1..d20 or g1..g20), those with any. @param {'d' | 'g'} p */
  const bands = (p) => {
    /** @type {Map<number, number>} */
    const by = new Map();
    for (const x of counted) {
      const m = new RegExp(`^${p}(\\d+)$`).exec(x.ctx);
      if (m) by.set(Number(m[1]), (by.get(Number(m[1])) ?? 0) + x.r + x.w);
    }
    return [...by].sort((a, b) => a[0] - b[0]).map(([b, n]) => `${(b - 1) * 10 + 1}-${b * 10}: ${fmt(n)}`).join('; ') || 'none';
  };

  const scored = new Map(list.map((s) => [s.item, s]));
  /** @type {Map<string, { items: number, above: number, below: number, undecided: number }>} */
  const groups = new Map();
  for (const i of items) {
    const g = groups.get(i.group) ?? { items: 0, above: 0, below: 0, undecided: 0 };
    g.items++;
    g[sideOf(scored.get(i.id))]++;
    groups.set(i.group, g);
  }
  const above = list.filter((s) => sideOf(s) === 'above');
  const most = Math.floor(FLOOR * items.length);
  const ask = answers > 0 && all.undecided <= most;

  const text = [
    `## Item tally v${v}, read ${now.toISOString().slice(0, 16).replace('T', ' ')} UTC`,
    '',
    `- Answers: ${fmt(answers)}. By mode: ${modes.map(([m, n]) => `${m} ${fmt(n)}`).join('; ')}.`,
    `- Delve alone by depth: ${bands('d')}.`,
    `- Delve together by depth: ${bands('g')}.`,
    `- Sums kept: ${fmt(rows.length)}; ${fmt(unknown)} of them for ids items.json doesn't have, left out.`,
    `- The ${fmt(items.length)} items against a score of ${CUT} (missed ${CUT} times as often as the rest under the same rules), by their 90% intervals:`,
    `  - clearly above: ${fmt(all.above)}`,
    `  - clearly below: ${fmt(all.below)}`,
    `  - undecided: ${fmt(all.undecided)} (${fmt(all.unanswered)} with no answers yet; ${fmt(all.leaning)} scoring ${CUT} or more but not yet clearly above)`,
    `- First meetings only: ${fmt(first.above)} clearly above, ${fmt(first.below)} clearly below, ${fmt(first.undecided)} undecided (${fmt(first.unanswered)} never met first here).`,
    `- Floor for asking Claude: at most ${fmt(most)} undecided (${FLOOR * 100}% of the items): ${ask ? 'met' : 'not met'}.`,
    '',
    '| Group | Items | Clearly above | Clearly below | Undecided |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...[...groups].sort((a, b) => a[0].localeCompare(b[0])).map(([name, g]) => `| ${cell(name)} | ${g.items} | ${g.above} | ${g.below} | ${g.undecided} |`),
    '',
    above.length
      ? `Clearly above ${CUT}, surely missed most first${above.length > LISTED ? ` (the first ${LISTED} of ${fmt(above.length)})` : ''}:`
      : `No item is clearly above ${CUT} yet.`,
    ...(above.length
      ? [
          '',
          '| Item | Group | Answers | Missed | Score | 90% interval |',
          '| --- | --- | ---: | ---: | ---: | --- |',
          ...above.slice(0, LISTED).map((s) => {
            const i = /** @type {Item} */ (byId.get(s.item));
            return `| ${cell(i.name)} | ${cell(i.group)} | ${fmt(s.n)} | ${fmt(s.miss)} | ${fixed(/** @type {number} */ (s.score))} | ${fixed(s.low)} to ${fixed(s.high)} |`;
          }),
        ]
      : []),
  ].join('\n');
  return { v, answers, unknown, ...all, first, ask, text };
}

/**
 * GET /tally from the game's own server, as scripts/item-tally.mjs reads it.
 * @param {typeof fetch} get
 * @returns {Promise<{ status: 'ok', rows: TallyRow[] } | { status: 'off' | 'later' | 'broken', why: string }>}
 */
export async function readTally(get) {
  if (!OWN_SIGNAL_HOST) return { status: 'broken', why: 'src/lib/signalHost.ts names no server of the game’s own' };
  /** @type {Response} */
  let r;
  try {
    r = await get(`https://${OWN_SIGNAL_HOST}/tally`, { headers: { Origin: 'https://poe2.quest', 'User-Agent': 'poe2-tally-ready' }, signal: AbortSignal.timeout(60_000) });
  } catch (err) {
    return { status: 'later', why: `the server couldn't be reached (${err instanceof Error ? err.message : String(err)})` };
  }
  // (A Worker from before the tally answers any path it doesn't know so.)
  if (r.status === 404) return { status: 'off', why: 'the server has no tally yet' };
  // (Busy, or its day's share of reads spent: signal/worker.js TALLY_READS.)
  if (r.status === 429 || r.status >= 500) return { status: 'later', why: `the server answered ${r.status}` };
  if (!r.ok) return { status: 'broken', why: `the server answered ${r.status}` };
  /** @type {unknown} */
  let json;
  try {
    json = await r.json();
  } catch {
    return { status: 'later', why: 'the answer was cut short (not JSON)' };
  }
  try {
    return { status: 'ok', rows: tallyRowsOf(json) };
  } catch {
    return { status: 'broken', why: 'the answer came in a shape this check doesn’t know' };
  }
}

/**
 * @param {string[]} argv @param {Record<string, string | undefined>} env
 * @param {{ fetch?: typeof fetch, now?: () => Date, log?: (line: string) => void }} [deps]
 * @returns {Promise<number>} the exit code
 */
export async function main(argv, env, deps = {}) {
  const log = deps.log ?? ((/** @type {string} */ l) => console.log(l));
  /** @type {string | undefined} */ let file;
  /** @type {string | undefined} */ let out;
  for (let i = 0; i < argv.length; i += 2) {
    if (argv[i] === '--file' && argv[i + 1]) file = argv[i + 1];
    else if (argv[i] === '--out' && argv[i + 1]) out = argv[i + 1];
    else {
      log(`::error::Unknown option ${argv[i]}; options: --file <tally.json>, --out <summary.md>.`);
      return 1;
    }
  }
  const setAsk = async (/** @type {boolean} */ ask) => {
    if (env.GITHUB_OUTPUT) await appendFile(env.GITHUB_OUTPUT, `ask=${ask}\n`);
  };
  /** @type {TallyRow[]} */
  let rows;
  if (file) rows = tallyRowsOf(JSON.parse(await readFile(file, 'utf8')));
  else {
    const got = await readTally(deps.fetch ?? fetch);
    if (got.status !== 'ok') {
      const level = { off: 'notice', later: 'warning', broken: 'error' }[got.status];
      log(`::${level}::Couldn't read the item tally today: ${got.why}.`);
      await setAsk(false);
      return got.status === 'broken' ? 1 : 0;
    }
    rows = got.rows;
  }
  /** @type {Item[]} */
  const items = JSON.parse(await readFile(path.join(ROOT, 'src', 'data', 'items.json'), 'utf8'));
  const s = summarize(rows, items, deps.now?.());
  log(s.text);
  if (out) await writeFile(out, s.text + '\n');
  if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, s.text + '\n');
  await setAsk(s.ask);
  return 0;
}

// (Run as a script; the tests only import it.)
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2), process.env);
