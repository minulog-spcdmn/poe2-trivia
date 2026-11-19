#!/usr/bin/env node
// Is the live site up? Two checks with no Claude in them, where a failed run
// is the alarm (GitHub mails the owner):
//
// - `deploy`, the last step of the deploy job in .github/workflows/deploy.yml:
//   poe2.quest serves the index.html that deploy just put up (its hashed entry
//   scripts and styles are the built ones), and every script, style and file
//   it names answers 200. Tried again for a few minutes while the CDN catches
//   up.
// - `daily`, .github/workflows/live-check.yml, once a day: poe2.quest and every
//   file its index.html names answer 200, its TLS certificate has at least
//   CERT_DAYS days left, and the matchmaking server hands out a peer id
//   (GET /peerjs/id, signal/worker.js: a random UUID, nothing allocated, one
//   PER_ADDRESS count). Never reads /tally (it has a day's read budget) or
//   GoatCounter.
//
// Daily health (scripts/daily-health.mjs) can't see a site that's down: a day
// nothing is counted fires nothing. This is the check that can.
//
// Usage:
//   node scripts/live-check.mjs deploy --built <dist/index.html>
//   node scripts/live-check.mjs daily
// With GITHUB_STEP_SUMMARY set the outcome goes on the run's page too.
// Exits 0 when all is well, 1 when a check still fails after its tries or an
// option is wrong.

import { appendFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';

export const SITE = 'https://poe2.quest/';
/** The page's origin, the only one besides local ones the matchmaking server answers (signal/worker.js LIVE). */
export const ORIGIN = 'https://poe2.quest';
/** src/lib/signalHost.ts OWN_SIGNAL_HOST, kept here so the deploy job needs only this file (tests/liveCheck.test.ts holds the two together). */
export const SIGNAL_HOST = 'poe2-signal.poe2quest.workers.dev';
/** The fewest days a certificate may have left before the daily check fails. */
export const CERT_DAYS = 14;
/** After a deploy: tries and the wait between them, about six minutes in all. */
export const DEPLOY_TRIES = 19;
export const DEPLOY_WAIT = 20_000;
/** Once a day: a blip gets a few more minutes before it counts. */
export const DAILY_TRIES = 4;
export const DAILY_WAIT = 60_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What a tag's attribute holds, or undefined. @param {string} tag @param {string} name */
function attr(tag, name) {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  return m ? (m[1] ?? m[2] ?? m[3]) : undefined;
}

/** A reference to a file on the site itself (not another host, a data: URL or an anchor). @param {string | undefined} ref */
const own = (ref) => !!ref && !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(ref);

/**
 * The files an index.html names: `entries`, its module scripts and
 * stylesheets (their names carry the build's hash), and `files`, every file
 * on the site its scripts, links and images name, entries among them.
 * @param {string} html
 */
export function namesOf(html) {
  /** @type {Set<string>} */ const entries = new Set();
  /** @type {Set<string>} */ const files = new Set();
  for (const [tag, name] of html.matchAll(/<(script|link|img|source)\b[^>]*>/gi)) {
    const kind = name.toLowerCase();
    const ref = attr(tag, kind === 'link' ? 'href' : 'src');
    if (!own(ref)) continue;
    files.add(/** @type {string} */ (ref));
    const rel = (attr(tag, 'rel') ?? '').toLowerCase().split(/\s+/);
    if (kind === 'script' || (kind === 'link' && rel.includes('stylesheet'))) entries.add(/** @type {string} */ (ref));
  }
  return { entries: [...entries].sort(), files: [...files].sort() };
}

/** The page itself, past every cache on the way: a fresh query and no-cache. @param {typeof fetch} get */
async function page(get) {
  const url = new URL(SITE);
  url.searchParams.set('live-check', String(Date.now()));
  return get(url, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' }, signal: AbortSignal.timeout(30_000) });
}

/** One file's status, or the error that kept it from answering. @param {typeof fetch} get @param {string} ref */
async function statusOf(get, ref) {
  const url = new URL(ref, SITE);
  try {
    let r = await get(url, { method: 'HEAD', signal: AbortSignal.timeout(30_000) });
    if (r.status === 405) r = await get(url, { signal: AbortSignal.timeout(30_000) });
    return r.status;
  } catch (e) {
    return /** @type {Error} */ (e).message || String(e);
  }
}

/**
 * The site's page and the files it names: what's wrong, if anything. With
 * `built` (the deployed index.html), its entries must be the page's.
 * @param {typeof fetch} get @param {string} [built]
 * @returns {Promise<string[]>}
 */
export async function checkSite(get, built) {
  let r;
  try {
    r = await page(get);
  } catch (e) {
    return [`${SITE} didn't answer: ${/** @type {Error} */ (e).message || e}`];
  }
  if (r.status !== 200) return [`${SITE} answered ${r.status}.`];
  const live = namesOf(await r.text());
  if (!live.entries.length) return [`${SITE} names no entry script or style: not the game's index.html.`];
  /** @type {string[]} */ const problems = [];
  if (built !== undefined) {
    const want = namesOf(built).entries;
    if (want.join(' ') !== live.entries.join(' ')) problems.push(`${SITE} isn't the index.html just deployed: it names ${live.entries.join(', ')}, the build ${want.join(', ')}.`);
  }
  const statuses = await Promise.all(live.files.map((f) => statusOf(get, f)));
  live.files.forEach((f, n) => statuses[n] !== 200 && problems.push(`${new URL(f, SITE)} answered ${statuses[n]}.`));
  return problems;
}

/** When the certificate a host serves runs out. @param {string} host @returns {Promise<Date>} */
export function certEnd(host) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port: 443, servername: host, timeout: 30_000 }, () => {
      const end = new Date(socket.getPeerCertificate().valid_to);
      socket.end();
      if (Number.isNaN(end.getTime())) reject(new Error(`${host} sent no certificate end date`));
      else resolve(end);
    });
    socket.on('timeout', () => socket.destroy(new Error(`${host} didn't finish the TLS handshake in 30 seconds`)));
    socket.on('error', reject);
  });
}

/** What's wrong with a certificate that ends at `end`, if anything. @param {Date} end @param {Date} now */
export function certProblem(end, now) {
  const days = (end.getTime() - now.getTime()) / 86_400_000;
  return days < CERT_DAYS ? `The TLS certificate for ${new URL(SITE).host} ends ${end.toISOString()}, in ${days.toFixed(1)} days (the least allowed is ${CERT_DAYS}).` : null;
}

/**
 * Whether the matchmaking server hands out a peer id. A 429 (this address's
 * share of PER_ADDRESS spent) passes: the server answered.
 * @param {typeof fetch} get
 * @returns {Promise<{ problem: string | null, note?: string }>}
 */
export async function checkSignal(get) {
  const url = `https://${SIGNAL_HOST}/peerjs/id`;
  try {
    const r = await get(url, { headers: { Origin: ORIGIN }, cache: 'no-store', signal: AbortSignal.timeout(30_000) });
    if (r.status === 429) return { problem: null, note: `${url} answered 429 (too many requests from this address): it's up.` };
    if (r.status !== 200) return { problem: `${url} answered ${r.status}.` };
    const id = (await r.text()).trim();
    return UUID.test(id) ? { problem: null } : { problem: `${url} answered 200 but not with a peer id.` };
  } catch (e) {
    return { problem: `${url} didn't answer: ${/** @type {Error} */ (e).message || e}` };
  }
}

/**
 * Runs `check` until it finds nothing wrong or the tries run out.
 * @param {() => Promise<string[]>} check @param {number} tries @param {number} wait
 * @param {(ms: number) => Promise<unknown>} sleep @param {(line: string) => void} log
 */
export async function retrying(check, tries, wait, sleep, log) {
  /** @type {string[]} */ let problems = [];
  for (let n = 1; n <= tries; n++) {
    problems = await check();
    if (!problems.length) return { problems, tries: n };
    if (n < tries) {
      log(`Try ${n} of ${tries}: ${problems.length} problem${problems.length > 1 ? 's' : ''} (${problems[0]}${problems.length > 1 ? ' ...' : ''}); again in ${Math.round(wait / 1000)} s.`);
      await sleep(wait);
    }
  }
  return { problems, tries };
}

/**
 * @param {string[]} argv @param {NodeJS.ProcessEnv} env
 * @param {{ fetch?: typeof fetch, sleep?: (ms: number) => Promise<unknown>, certEnd?: (host: string) => Promise<Date>, now?: () => Date, log?: (line: string) => void, readFile?: (file: string) => Promise<string> }} [deps]
 * @returns {Promise<number>} the exit code
 */
export async function main(argv, env, deps = {}) {
  const get = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const log = deps.log ?? ((line) => console.log(line));
  const now = deps.now ?? (() => new Date());
  const read = deps.readFile ?? ((file) => readFile(file, 'utf8'));
  const [mode, ...rest] = argv;
  const builtAt = rest[0] === '--built' ? rest[1] : undefined;
  if (!(mode === 'deploy' && builtAt && rest.length === 2) && !(mode === 'daily' && !rest.length)) {
    log('::error::Usage: live-check.mjs deploy --built <index.html> | live-check.mjs daily');
    return 1;
  }

  /** @type {string[]} */ const notes = [];
  let result;
  if (mode === 'deploy') {
    const built = await read(/** @type {string} */ (builtAt));
    result = await retrying(() => checkSite(get, built), DEPLOY_TRIES, DEPLOY_WAIT, sleep, log);
  } else {
    const ownEnd = deps.certEnd ?? certEnd;
    result = await retrying(
      async () => {
        notes.length = 0;
        const problems = await checkSite(get);
        try {
          const p = certProblem(await ownEnd(new URL(SITE).host), now());
          if (p) problems.push(p);
        } catch (e) {
          problems.push(`Couldn't read the TLS certificate: ${/** @type {Error} */ (e).message || e}`);
        }
        const signal = await checkSignal(get);
        if (signal.problem) problems.push(signal.problem);
        if (signal.note) notes.push(signal.note);
        return problems;
      },
      DAILY_TRIES,
      DAILY_WAIT,
      sleep,
      log,
    );
  }

  const what = mode === 'deploy' ? 'The live site serves this deploy, and every file it names answers 200' : 'poe2.quest, its files, its certificate and the matchmaking server are fine';
  for (const n of notes) log(`::warning::${n}`);
  const summary = result.problems.length
    ? [`### Live check failed`, '', ...result.problems.map((p) => `- ${p}`), '', `(after ${result.tries} tries)`]
    : [`### Live check passed`, '', `${what} (try ${result.tries}).`, ...notes.map((n) => `\n${n}`)];
  for (const p of result.problems) log(`::error::${p}`);
  if (!result.problems.length) log(`${what} (try ${result.tries}).`);
  if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, `${summary.join('\n')}\n`);
  return result.problems.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2), process.env);
