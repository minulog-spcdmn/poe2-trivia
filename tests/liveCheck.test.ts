// The checks that the live site is up (scripts/live-check.mjs): after each
// deploy (.github/workflows/deploy.yml) and once a day
// (.github/workflows/live-check.yml). Fetch is stubbed: nothing here reaches
// the site.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CERT_DAYS, DAILY_TRIES, DEPLOY_TRIES, SIGNAL_HOST, SITE, certProblem, checkSignal, checkSite, main, namesOf } from '../scripts/live-check.mjs';
import { OWN_SIGNAL_HOST } from '../src/lib/signalHost.ts';

const index = (main = 'main-AAAA1111', style = 'main-BBBB2222') => `<!doctype html><html><head>
<link rel="icon" type="image/svg+xml" href="./favicon.svg" />
<link rel="canonical" href="https://poe2.quest/" />
<meta property="og:image" content="https://poe2.quest/og.jpg?v=7" />
<script type="module" crossorigin src="./assets/${main}.js"></script>
<link rel="modulepreload" crossorigin href="./assets/core-CCCC3333.js">
<link rel="stylesheet" crossorigin href="./assets/${style}.css">
<link rel="preload" as="font" type="font/woff2" crossorigin href="./assets/cinzel-DDDD4444.woff2">
<script>/* inline */</script>
</head><body><div id="app"></div></body></html>`;

const FILES = ['./assets/cinzel-DDDD4444.woff2', './assets/core-CCCC3333.js', './assets/main-AAAA1111.js', './assets/main-BBBB2222.css', './favicon.svg'];
const PEER_ID = '3f0e1d6a-5b2c-4c8e-9a71-0d2b6e4f8a10';

type Answer = { status?: number; body?: string; error?: string };
/** A fetch that answers from a table by path (the page itself as '/'), and records what was asked. */
function site(table: Record<string, Answer | (() => Answer)>) {
  const asked: { url: URL; init?: RequestInit }[] = [];
  const get = (async (input: string | URL, init?: RequestInit) => {
    const url = new URL(input);
    asked.push({ url, init });
    const key = url.host === SIGNAL_HOST ? 'signal' : url.pathname;
    const row = table[key] ?? { status: 404 };
    const a = typeof row === 'function' ? row() : row;
    if (a.error) throw new TypeError(a.error);
    return new Response(init?.method === 'HEAD' ? null : (a.body ?? ''), { status: a.status ?? 200 });
  }) as typeof fetch;
  return { get, asked };
}
const healthy = (page = index()): Record<string, Answer> => ({
  '/': { body: page },
  ...Object.fromEntries(namesOf(page).files.map((f) => [new URL(f, SITE).pathname, {}])),
  signal: { body: PEER_ID },
});

test('namesOf: entries are the module scripts and stylesheets; files are all the site’s own', () => {
  const n = namesOf(index());
  assert.deepEqual(n.entries, ['./assets/main-AAAA1111.js', './assets/main-BBBB2222.css']);
  assert.deepEqual(n.files, FILES);
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
  const { get } = site(healthy(index('main-OLD00000')));
  const problems = await checkSite(get, index());
  assert.equal(problems.length, 1);
  assert.match(problems[0], /isn't the index\.html just deployed/);
  // Once a day there's no build to hold it to.
  assert.deepEqual(await checkSite(site(healthy(index('main-OLD00000'))).get), []);
});

test('checkSite: a file that’s missing or doesn’t answer, the page down or not the game', async () => {
  const missing = healthy();
  missing['/assets/core-CCCC3333.js'] = { status: 404 };
  missing['/favicon.svg'] = { error: 'fetch failed' };
  const p = await checkSite(site(missing).get, index());
  assert.equal(p.length, 2);
  assert.match(p.join('\n'), /core-CCCC3333\.js answered 404/);
  assert.match(p.join('\n'), /favicon\.svg answered fetch failed/);
  assert.match((await checkSite(site({ '/': { status: 503 } }).get))[0], /answered 503/);
  assert.match((await checkSite(site({ '/': { error: 'getaddrinfo ENOTFOUND' } }).get))[0], /didn't answer: getaddrinfo/);
  assert.match((await checkSite(site({ '/': { body: '<html>Site not found</html>' } }).get))[0], /names no entry/);
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
  assert.match((await checkSignal(site({ signal: { error: 'fetch failed' } }).get)).problem ?? '', /didn't answer/);
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
