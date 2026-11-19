#!/usr/bin/env node
// Whether solo Delve answers reach the item tally (signal/worker.js Tally,
// src/lib/itemTally.ts). Race, Delve together, Take turns and today's unique
// reached it when it went live on 18 Nov 2026; solo Delve hadn't by the next
// day, though a run had been played, likely from a tab opened before the
// deploy. This sets the two counts side by side: the answers the tally holds
// for Delve alone (its ctx d1..d20), and the solo Delve runs players started
// since SINCE (GoatCounter's event "size/delve-1p", count.ts, counted from the
// player's own device). Run once a day by the second job of
// .github/workflows/tally-ready.yml, with no Claude.
//
// Events are counted without a session (count.ts countEvent, `ns`), so every
// run counts, a visitor's several runs each: the number is runs started, not
// visitors.
//
// Verdict (soloVerdict): any solo answer at all is "works" (no tab from before
// the deploy could send one); MIN_RUNS runs or more and no answers is "lost";
// anything else is "wait".
//
// Usage: node --experimental-strip-types --no-warnings scripts/tally-solo.mjs
// Needs GOATCOUNTER_KEY in the environment (the stats page's read-only key).
// With GITHUB_OUTPUT set it writes verdict= (works, lost, wait; off when no
// key is set or the tally isn't on the server yet; later when either source
// couldn't be read today) and, for works and lost, title= and body= (the path
// of a file holding the issue's text). With GITHUB_STEP_SUMMARY the numbers go
// on the run's page. Exits 0 for every verdict, also when a source can't be
// read today; 1 when the tally's server or GoatCounter turns the check away or
// answers in a shape this doesn't know.

import { appendFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TALLY_VERSION } from '../src/lib/itemTallyRank.ts';
import { apiOf, CheckError, KeyRefused } from './daily-health.mjs';
import { readTally } from './tally-ready.mjs';

/** Runs counted before this (the first evening's, from tabs opened before the deploy) are left out. */
export const SINCE = '2026-11-19T00:00:00.000Z';
/** Solo runs started with no answer in the tally for them to be called lost. */
export const MIN_RUNS = 3;
/** The event path counted once per solo Delve run started (count.ts). */
export const RUN_PATH = 'size/delve-1p';
export const TITLE_WORKS = 'Item tally: solo Delve answers arrive';
export const TITLE_LOST = 'Item tally: solo Delve runs send no answers';

/**
 * @param {{ runs: number, answers: number }} n
 * @returns {'works' | 'lost' | 'wait'}
 */
export function soloVerdict({ runs, answers }) {
  if (answers > 0) return 'works';
  if (runs >= MIN_RUNS) return 'lost';
  return 'wait';
}

/** The answers the tally holds for Delve alone under this build's version. @param {readonly import('../src/lib/itemTallyRank.ts').TallyRow[]} rows */
export function soloAnswers(rows) {
  let n = 0;
  for (const x of rows) if (x.v === TALLY_VERSION && /^d\d+$/.test(x.ctx)) n += x.r + x.w;
  return n;
}

/** Why a read of GoatCounter's answer failed in shape. */
class Broken extends Error {}

/**
 * Solo Delve runs started from `since` to `now`, as GoatCounter's
 * /stats/hits counts the event's path.
 * @param {ReturnType<typeof apiOf>} api @param {string} since @param {Date} now
 */
async function readRuns(api, since, now) {
  // (Full times: a date alone for the end stops at the first hour of its day.)
  // (The path by its name, as the stats page asks: src/statsPage/api.ts pathsBy.)
  const r = await api.get('/stats/hits', { start: since, end: now.toISOString(), group: 'day', limit: '100', include_paths: RUN_PATH, path_by_name: 'true' });
  if (!r || !Array.isArray(r.hits)) throw new Broken('the answer came in a shape this check doesn’t know');
  let runs = 0;
  for (const h of r.hits) {
    if (!h || typeof h.path !== 'string' || typeof h.count !== 'number') throw new Broken('the answer came in a shape this check doesn’t know');
    if (h.path === RUN_PATH) runs += h.count;
  }
  // (The filter leaves little to page through; a path hidden on a later page can't be told from none.)
  if (!runs && r.more) throw new CheckError('GoatCounter gave the paths over more pages than this reads');
  return runs;
}

const fmt = (/** @type {number} */ n) => n.toLocaleString('en');

/** The issue's text. @param {'works' | 'lost'} verdict @param {{ runs: number, answers: number }} n */
function bodyOf(verdict, { runs, answers }) {
  const per = runs ? `${(answers / runs).toFixed(2)} answers per run` : 'no runs to set them against';
  const lines = [
    `The daily check, the \`solo\` job of .github/workflows/tally-ready.yml, set two numbers side by side.`,
    '',
    `- Answers in the item tally for Delve alone (version ${TALLY_VERSION}, every depth band): ${fmt(answers)}.`,
    `- Solo Delve runs started since ${SINCE}, as GoatCounter counted them (the event \`${RUN_PATH}\`, one for each run, a player's several runs each): ${fmt(runs)}.`,
    `- ${per[0].toUpperCase()}${per.slice(1)}.`,
    '',
  ];
  if (verdict === 'works') {
    lines.push(
      'Solo Delve answers arrive. A tab opened before the tally went live sends nothing to it, so every solo answer came from the new page.',
      '',
      'The check has nothing left to do and can be removed from the workflow.',
    );
  } else {
    lines.push(
      `At least ${MIN_RUNS} solo runs were started and the tally holds no solo answer, so something between a run and the tally drops them. Where to start:`,
      '',
      '- `src/lib/itemTally.ts`: what is counted and sent, and when.',
      '- `src/lib/session.svelte.ts`: `noteEncounter` and `sendTally`, whether a solo run reaches them.',
      '- `src/lib/codex.ts`: `take` and `onTaken`, whether a solo run’s answers pass through.',
      '',
      'The check stops once this issue exists. Its job can be removed from the workflow when the fault is fixed.',
    );
  }
  return lines.join('\n') + '\n';
}

/**
 * @param {Record<string, string | undefined>} env
 * @param {{ fetch?: typeof fetch, sleep?: (ms: number) => Promise<void>, now?: () => Date, log?: (line: string) => void }} [deps]
 * @returns {Promise<number>} the exit code
 */
export async function main(env, deps = {}) {
  const log = deps.log ?? ((/** @type {string} */ l) => console.log(l));
  const now = deps.now ?? (() => new Date());
  /** @param {string} line */
  const out = async (line) => {
    if (env.GITHUB_OUTPUT) await appendFile(env.GITHUB_OUTPUT, line + '\n');
  };
  /** @param {string} text */
  const onPage = async (text) => {
    if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, text + '\n');
  };
  /** Nothing to judge today. @param {'off' | 'later'} verdict @param {string} why @param {'notice' | 'warning'} level */
  const skip = async (verdict, why, level) => {
    log(`::${level}::Solo Delve check: ${why}.`);
    await out(`verdict=${verdict}`);
    await onPage(`## Solo Delve answers\n\nNot checked today: ${why}.`);
    return 0;
  };

  const key = (env.GOATCOUNTER_KEY ?? '').trim();
  if (!key) return skip('off', 'no GOATCOUNTER_KEY is set', 'notice');

  const got = await readTally(deps.fetch ?? fetch);
  if (got.status === 'broken') {
    log(`::error::Couldn't read the item tally today: ${got.why}.`);
    await out('verdict=later');
    return 1;
  }
  if (got.status !== 'ok') return skip(got.status, `the tally couldn't be read (${got.why})`, got.status === 'off' ? 'notice' : 'warning');
  const answers = soloAnswers(got.rows);

  const api = apiOf(key, { fetch: deps.fetch, sleep: deps.sleep, now: () => now().getTime() });
  let runs;
  try {
    runs = await readRuns(api, SINCE, now());
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    if (e instanceof KeyRefused || e instanceof Broken) {
      log(`::error::Solo Delve check: ${why}.`);
      await out('verdict=later');
      return 1;
    }
    if (e instanceof CheckError) return skip('later', `GoatCounter couldn't be read (${why.replace(/\.$/, '')})`, 'warning');
    throw e;
  }

  const verdict = soloVerdict({ runs, answers });
  const next = {
    works: 'An issue is opened for the owner, and the check stops.',
    lost: 'An issue is opened for the owner and this run fails, so GitHub mails them; the check then stops.',
    wait: `Fewer than ${MIN_RUNS} runs and no answers yet: asked again tomorrow.`,
  }[verdict];
  const text = [
    '## Solo Delve answers',
    '',
    `- Answers in the tally for Delve alone (version ${TALLY_VERSION}): ${fmt(answers)}.`,
    `- Solo Delve runs started since ${SINCE}, each one counted (a player’s several runs each): ${fmt(runs)}.`,
    `- Verdict: ${verdict}. ${next}`,
  ].join('\n');
  log(text);
  await onPage(text);
  await out(`verdict=${verdict}`);
  if (verdict !== 'wait') {
    const file = path.join(env.RUNNER_TEMP || tmpdir(), 'tally-solo-body.md');
    await writeFile(file, bodyOf(verdict, { runs, answers }));
    await out(`title=${verdict === 'works' ? TITLE_WORKS : TITLE_LOST}`);
    await out(`body=${file}`);
  }
  return 0;
}

// (Run as a script; the tests only import it.)
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main(process.env);
