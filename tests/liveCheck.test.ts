// The checks that the live site is up (scripts/live-check.mjs): after each
// deploy (.github/workflows/deploy.yml) and once a day
// (.github/workflows/live-check.yml). Fetch is stubbed: nothing here reaches
// the site.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CERT_DAYS, COUNTS_HOST, DAILY_TRIES, DEPLOY_TRIES, SIGNAL_HOST, SITE, certProblem, checkCounts, checkSignal, checkSite, main, namesOf } from '../scripts/live-check.mjs';
import { COUNTS_ORIGIN } from '../src/lib/counter.ts';
import { OWN_SIGNAL_HOST } from '../src/lib/signalHost.ts';

const index = (main = 'main-AAAA1111', style = 'main-BBBB2222') => `<!doctype html><html><head>
<link rel="icon" type="image/svg+xml" href="./favicon.svg" />
<link rel="canonical" href="https://poe2.quest/" />
<!-- <link rel="preload" as="image" href="./gone.png"> -->
<meta property="og:image" content="https://poe2.quest/og.jpg?v=7" />
<script type="module" crossorigin src="./assets/${main}.js"></script>
<link rel="modulepreload" crossorigin href="./assets/core-CCCC3333.js">
<link rel="stylesheet" crossorigin href="./assets/${style}.css">
<link rel="preload" as="font" type="font/woff2" crossorigin href="./assets/cinzel-DDDD4444.woff2">
<script>/* inline */</script>
</head><body><div id="app"></div></body></html>`;

const FILES = ['./assets/cinzel-DDDD4444.woff2', './assets/core-CCCC3333.js', './assets/main-AAAA1111.js', './assets/main-BBBB2222.css', './favicon.svg'];
const PEER_ID = '3f0e1d6a-5b2c-4c8e-9a71-0d2b6e4f8a10';

type Answer = { status?: number; body?: string; error?: string; errors?: string[]; bodyError?: string };
/**
 * A fetch that answers from a table by path (the page itself as '/', the
 * matchmaking server as 'signal', the counts Worker as 'counts'), and
 * records what was asked. An error is thrown as Node's fetch throws it: "fetch
 * failed", the reason in its cause; `errors`, one for each of a host's
 * addresses, in an AggregateError with no message. A body error breaks off
 * reading the body.
 */
function site(table: Record<string, Answer | (() => Answer)>) {
  const asked: { url: URL; init?: RequestInit }[] = [];
  const get = (async (input: string | URL, init?: RequestInit) => {
    const url = new URL(input);
    asked.push({ url, init });
    const key = url.host === SIGNAL_HOST ? 'signal' : url.host === COUNTS_HOST ? 'counts' : url.pathname;
    const row = table[key] ?? { status: 404 };
    const a = typeof row === 'function' ? row() : row;
    if (a.error) throw new TypeError('fetch failed', { cause: new Error(a.error) });
    if (a.errors) throw new TypeError('fetch failed', { cause: new AggregateError(a.errors.map((m) => new Error(m))) });
    const broken = a.bodyError ? new ReadableStream({ start: (c) => c.error(new TypeError(a.bodyError)) }) : null;
    return new Response(init?.method === 'HEAD' || a.status === 204 ? null : (broken ?? a.body ?? ''), { status: a.status ?? 200 });
  }) as typeof fetch;
  return { get, asked };
}
const healthy = (page = index()): Record<string, Answer> => ({
  '/': { body: page },
  ...Object.fromEntries(namesOf(page).files.map((f) => [new URL(f, SITE).pathname, {}])),
  signal: { body: PEER_ID },
  counts: { status: 400 },
});

test('namesOf: entries are the module scripts and stylesheets; files are all the site’s own', () => {
  const n = namesOf(index());
  assert.deepEqual(n.entries, ['./assets/main-AAAA1111.js', './assets/main-BBBB2222.css']);
  assert.deepEqual(n.files, FILES);
});

test('checkSite: the game’s own index.html passes for the game’s page', async () => {
  // Its root and entry are what tell the game's page from any other: renamed, every check would fail.
  const own = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.deepEqual(await checkSite(site(healthy(own)).get), []);
});

test('checkSite: the page past the caches, every file it names asked for', async () => {
  const { get, asked } = site(healthy());
  assert.deepEqual(await checkSite(get, index()), []);
  const first = asked[0];
  assert.equal(first.url.origin + first.url.pathname, SITE);
  assert.ok(first.url.search, 'a fresh query, so no cache along the way answers');
  assert.equal(new Headers(first.init?.headers).get('Cache-Control'), 'no-cache');
  assert.deepEqual(asked.slice(1).map((a) => a.url.pathname).sort(), FILES.map((f) => new URL(f, SITE).pathname).sort());
});

test('checkSite: a page with other entries than the build is the one before', async () => {
  const { get, asked } = site(healthy(index('main-OLD00000')));
  const problems = await checkSite(get, index());
  assert.equal(problems.length, 1);
  assert.match(problems[0], /isn't the index\.html just deployed/);
  assert.equal(asked.length, 1, 'the deploy before’s files go unasked');
  // Once a day there's no build to hold it to.
  assert.deepEqual(await checkSite(site(healthy(index('main-OLD00000'))).get), []);
});

test('checkSite: a file that’s missing or doesn’t answer, the page down or not the game', async () => {
  const missing = healthy();
  missing['/assets/core-CCCC3333.js'] = { status: 404 };
  missing['/favicon.svg'] = { error: 'read ECONNRESET' };
  const p = await checkSite(site(missing).get, index());
  assert.equal(p.length, 2);
  assert.match(p.join('\n'), /core-CCCC3333\.js answered 404/);
  assert.match(p.join('\n'), /favicon\.svg didn't answer: fetch failed \(read ECONNRESET\)/);
  assert.match((await checkSite(site({ '/': { status: 503 } }).get))[0], /answered 503/);
  assert.match((await checkSite(site({ '/': { error: 'getaddrinfo ENOTFOUND poe2.quest' } }).get))[0], /didn't answer: fetch failed \(getaddrinfo ENOTFOUND/);
  const refused = await checkSite(site({ '/': { errors: ['connect ECONNREFUSED 2606:50c0::153:443', 'connect ECONNREFUSED 185.199.108.153:443'] } }).get);
  assert.match(refused[0], /didn't answer: fetch failed \(connect ECONNREFUSED 2606/);
  // Cut off halfway through the page: a problem to try again, not a crash.
  assert.match((await checkSite(site({ '/': { bodyError: 'terminated' } }).get))[0], /didn't answer: terminated/);
  assert.match((await checkSite(site({ '/': { body: '<html>Site not found</html>' } }).get))[0], /isn't the game's index\.html/);
  // A parked domain's page with a script of its own isn't the game either.
  assert.match((await checkSite(site({ '/': { body: '<html><script src="/park.js"></script></html>' } }).get))[0], /isn't the game's index\.html/);
});

test('certProblem: fails under the days allowed', () => {
  const now = new Date('2026-11-19T00:00:00Z');
  const in_ = (days: number) => new Date(now.getTime() + days * 86_400_000);
  assert.equal(certProblem(in_(CERT_DAYS + 1), now), null);
  assert.match(certProblem(in_(CERT_DAYS - 1), now) ?? '', /in 13\.0 days/);
  assert.match(certProblem(in_(-2), now) ?? '', /in -2\.0 days/);
});

test('checkSignal: a peer id passes, sent from the page’s origin; a 429 is up; anything else fails', async () => {
  const ok = site({ signal: { body: PEER_ID } });
  assert.deepEqual(await checkSignal(ok.get), { problem: null });
  assert.equal(ok.asked[0].url.href, `https://${SIGNAL_HOST}/peerjs/id`);
  assert.equal(new Headers(ok.asked[0].init?.headers).get('Origin'), 'https://poe2.quest');
  const busy = await checkSignal(site({ signal: { status: 429 } }).get);
  assert.equal(busy.problem, null);
  assert.match(busy.note ?? '', /429/);
  assert.match((await checkSignal(site({ signal: { status: 403 } }).get)).problem ?? '', /answered 403/);
  assert.match((await checkSignal(site({ signal: { body: 'hello' } }).get)).problem ?? '', /not with a peer id/);
  assert.match((await checkSignal(site({ signal: { error: 'connect ETIMEDOUT' } }).get)).problem ?? '', /didn't answer: fetch failed \(connect ETIMEDOUT\)/);
});

test('the matchmaking host is the game’s own', () => {
  assert.equal(SIGNAL_HOST, OWN_SIGNAL_HOST);
});

const quiet = { sleep: async () => {}, log: () => {} };
const fineCert = async () => new Date(Date.now() + 60 * 86_400_000);

test('main deploy: passes once the CDN catches up; fails after its tries', async () => {
  let pageAsks = 0;
  const table: Record<string, Answer | (() => Answer)> = { ...healthy(), '/': () => ({ body: ++pageAsks < 3 ? index('main-OLD00000') : index() }) };
  const deps = { ...quiet, fetch: site(table).get, readFile: async () => index() };
  assert.equal(await main(['deploy', '--built', 'dist/index.html'], {}, deps), 0);
  assert.equal(pageAsks, 3);

  const lines: string[] = [];
  const stale = { ...quiet, log: (l: string) => lines.push(l), fetch: site(healthy(index('main-OLD00000'))).get, readFile: async () => index() };
  assert.equal(await main(['deploy', '--built', 'dist/index.html'], {}, stale), 1);
  assert.equal(lines.filter((l) => l.startsWith('Try ')).length, DEPLOY_TRIES - 1);
  assert.ok(lines.some((l) => l.startsWith('::error::') && l.includes("isn't the index.html just deployed")));

  const lost = { ...quiet, fetch: site(healthy()).get, readFile: async () => Promise.reject(new Error('ENOENT: no such file')) };
  assert.equal(await main(['deploy', '--built', 'dist/index.html'], {}, lost), 1);
});

test('checkCounts: a batch that isn’t JSON, from the page’s origin, answers 400; a 429 is up; a 404 or anything else fails with the fix', async () => {
  const ok = site({ counts: { status: 400 } });
  assert.deepEqual(await checkCounts(ok.get), { problem: null });
  assert.equal(ok.asked.length, 1);
  assert.equal(ok.asked[0].url.href, `https://${COUNTS_HOST}/counts`);
  const init = ok.asked[0].init;
  assert.equal(init?.method, 'POST');
  assert.equal(init?.body, 'not json');
  const headers = new Headers(init?.headers);
  assert.equal(headers.get('Origin'), 'https://poe2.quest');
  assert.equal(headers.get('Content-Type'), 'text/plain');
  assert.equal(headers.get('User-Agent'), 'poe2-health-check');
  const busy = await checkCounts(site({ counts: { status: 429 } }).get);
  assert.equal(busy.problem, null);
  assert.match(busy.note ?? '', /429/);
  const keyless = (await checkCounts(site({ counts: { status: 404 } }).get)).problem ?? '';
  assert.match(keyless, /answered 404: the counts Worker has no GOATCOUNTER_KEY/);
  assert.match(keyless, /--config counts\/wrangler\.toml/);
  // A 204 would mean the junk was taken as a batch: changed, not healthy.
  for (const status of [204, 403, 500, 503]) assert.match((await checkCounts(site({ counts: { status } }).get)).problem ?? '', new RegExp(`answered ${status} to a batch that isn't JSON`));
  const gone = (await checkCounts(site({ counts: { error: 'getaddrinfo ENOTFOUND' } }).get)).problem ?? '';
  assert.match(gone, /didn't answer: fetch failed \(getaddrinfo ENOTFOUND\)/);
  assert.match(gone, /wrangler@4\.158\.0 deploy/);
});

test('the counts host is the game’s own', () => {
  assert.equal(`https://${COUNTS_HOST}`, COUNTS_ORIGIN);
});

test('main daily: all well passes; a short certificate fails; a refused option fails', async () => {
  assert.equal(await main(['daily'], {}, { ...quiet, fetch: site(healthy()).get, certEnd: fineCert }), 0);

  let tries = 0;
  const short = async () => (tries++, new Date(Date.now() + 3 * 86_400_000));
  const lines: string[] = [];
  assert.equal(await main(['daily'], {}, { ...quiet, log: (l: string) => lines.push(l), fetch: site(healthy()).get, certEnd: short }), 1);
  assert.equal(tries, DAILY_TRIES);
  assert.ok(lines.some((l) => l.startsWith('::error::The TLS certificate')));

  const down = healthy();
  down.signal = { status: 500 };
  assert.equal(await main(['daily'], {}, { ...quiet, fetch: site(down).get, certEnd: fineCert }), 1);
  assert.equal(await main(['daily', '--built', 'x'], {}, quiet), 1);
  assert.equal(await main(['deploy'], {}, quiet), 1);
});

test('main daily: the counts Worker gets the usual tries; a keyless one fails the run with the fix; a deploy never asks it', async () => {
  const lines: string[] = [];
  const all: string[] = [];
  const keyless = healthy();
  keyless.counts = { status: 404 };
  const { get, asked } = site(keyless);
  assert.equal(await main(['daily'], {}, { ...quiet, log: (l: string) => lines.push(l), fetch: get, certEnd: fineCert }), 1);
  assert.equal(asked.filter((a) => a.url.host === COUNTS_HOST).length, DAILY_TRIES);
  const errors = lines.filter((l) => l.startsWith('::error::'));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^::error::https:\/\/poe2-counts\.poe2quest\.workers\.dev\/counts answered 404: the counts Worker has no GOATCOUNTER_KEY/);

  // A blip that passes on the next try.
  let asks = 0;
  const blip: Record<string, Answer | (() => Answer)> = { ...healthy(), counts: () => (++asks < 2 ? { error: 'connect ETIMEDOUT' } : { status: 400 }) };
  assert.equal(await main(['daily'], {}, { ...quiet, log: (l: string) => all.push(l), fetch: site(blip).get, certEnd: fineCert }), 0);
  assert.equal(all.at(-1), 'poe2.quest, its files, its certificate, the matchmaking server and the counts Worker are fine (try 2).');

  const deploy = site(healthy());
  assert.equal(await main(['deploy', '--built', 'dist/index.html'], {}, { ...quiet, fetch: deploy.get, readFile: async () => index() }), 0);
  assert.ok(!deploy.asked.some((a) => a.url.host === COUNTS_HOST), 'a page deploy leaves the Worker alone');
});
