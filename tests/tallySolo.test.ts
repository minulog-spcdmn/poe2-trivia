// The daily check whether solo Delve answers reach the item tally
// (scripts/tally-solo.mjs, the `solo` job of .github/workflows/tally-ready.yml):
// the verdict from the two counts, which tally rows are solo answers, and what
// main writes when either source can't be read. No real key is used anywhere.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MIN_RUNS, RUN_PATH, SINCE, TITLE_LOST, TITLE_WORKS, main, soloAnswers, soloVerdict } from '../scripts/tally-solo.mjs';
import { TALLY_VERSION, type TallyRow } from '../src/lib/itemTallyRank.ts';

const row = (ctx: string, r: number, w: number, more: Partial<TallyRow> = {}): TallyRow => ({ v: TALLY_VERSION, item: 'a', form: 'n', ctx, first: 0, r, w, ...more });
const AT = new Date('2026-11-20T06:41:00Z');
const FAKE_KEY = 'not-a-real-key';

test('soloVerdict: any answer works, enough runs with none are lost, the rest wait', () => {
  assert.equal(soloVerdict({ runs: 0, answers: 1 }), 'works');
  assert.equal(soloVerdict({ runs: 50, answers: 1 }), 'works');
  assert.equal(soloVerdict({ runs: MIN_RUNS, answers: 0 }), 'lost');
  assert.equal(soloVerdict({ runs: MIN_RUNS + 10, answers: 0 }), 'lost');
  assert.equal(soloVerdict({ runs: MIN_RUNS - 1, answers: 0 }), 'wait');
  assert.equal(soloVerdict({ runs: 0, answers: 0 }), 'wait');
});

test('soloAnswers: Delve alone’s bands only, this version only', () => {
  const rows = [
    row('d1', 2, 1),
    row('d20', 4, 0),
    row('g1', 100, 100),
    row('race', 50, 50),
    row('d1', 0, 900, { v: TALLY_VERSION + 1 }),
    row('d1x', 7, 7),
    row('xd1', 7, 7),
  ];
  assert.equal(soloAnswers(rows), 7);
  assert.equal(soloAnswers([]), 0);
});

type Reply = Response | Error;
/** A fetch that answers the tally and GoatCounter's hits as given, noting the addresses asked. */
function stub(tally: Reply, hits: Reply, asked: string[] = []): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    asked.push(url);
    const r = url.includes('/api/v0/') ? hits : tally;
    if (r instanceof Error) throw r;
    return r.clone();
  }) as typeof fetch;
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const hitsOf = (count: number) => json({ hits: [{ path_id: 1, path: RUN_PATH, event: true, count, stats: [] }], more: false });
const noSleep = async () => {};

async function run(tally: Reply, hits: Reply, key: string | null = FAKE_KEY) {
  const dir = await mkdtemp(path.join(tmpdir(), 'tally-solo-'));
  try {
    const lines: string[] = [];
    const asked: string[] = [];
    const output = path.join(dir, 'output');
    const summary = path.join(dir, 'summary');
    await writeFile(output, '');
    await writeFile(summary, '');
    const env = { GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary, RUNNER_TEMP: dir, ...(key === null ? {} : { GOATCOUNTER_KEY: key }) };
    const code = await main(env, { fetch: stub(tally, hits, asked), sleep: noSleep, now: () => AT, log: (l) => lines.push(l) });
    const outputs = Object.fromEntries((await readFile(output, 'utf8')).split('\n').filter(Boolean).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
    const body = outputs.body ? await readFile(outputs.body, 'utf8') : '';
    return { code, outputs, body, log: lines.join('\n'), summary: await readFile(summary, 'utf8'), asked };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('main: a solo answer in the tally opens the works issue', async () => {
  const r = await run(json([row('d1', 2, 1), row('g1', 9, 9)]), hitsOf(4));
  assert.equal(r.code, 0);
  assert.equal(r.outputs.verdict, 'works');
  assert.equal(r.outputs.title, TITLE_WORKS);
  assert.match(r.body, /Delve alone[^\n]*: 3\./);
  assert.match(r.body, /since 2026-11-19T00:00:00\.000Z[^\n]*: 4\./);
  assert.match(r.body, /0\.75 answers per run/);
  assert.match(r.summary, /Verdict: works/);
  // The span asked of GoatCounter starts at SINCE and ends at the moment of asking, both in full.
  const url = new URL(r.asked.find((u) => u.includes('/api/v0/'))!);
  assert.equal(url.searchParams.get('start'), SINCE);
  assert.equal(url.searchParams.get('end'), AT.toISOString());
});

test('main: runs and no solo answers is lost, with where to look', async () => {
  const r = await run(json([row('g1', 9, 9)]), hitsOf(5));
  assert.equal(r.code, 0);
  assert.equal(r.outputs.verdict, 'lost');
  assert.equal(r.outputs.title, TITLE_LOST);
  assert.match(r.body, /src\/lib\/itemTally\.ts/);
  assert.match(r.body, /noteEncounter/);
  assert.match(r.body, /onTaken/);
  assert.match(r.body, /0\.00 answers per run/);
});

test('main: too few runs waits, with no issue', async () => {
  const r = await run(json([]), hitsOf(MIN_RUNS - 1));
  assert.equal(r.code, 0);
  assert.equal(r.outputs.verdict, 'wait');
  assert.equal(r.outputs.title, undefined);
  assert.equal(r.outputs.body, undefined);
  assert.match(r.summary, /Verdict: wait/);
  // A path with no hits at all counts as no runs.
  const none = await run(json([]), json({ hits: [], more: false }));
  assert.equal(none.outputs.verdict, 'wait');
});

test('main: other paths in GoatCounter’s answer aren’t counted as runs', async () => {
  const other = json({ hits: [{ path_id: 2, path: 'size/delve-2p', event: true, count: 9, stats: [] }], more: false });
  assert.equal((await run(json([]), other)).outputs.verdict, 'wait');
});

test('main: a day a source can’t be read passes, off or later', async () => {
  const nokey = await run(json([]), hitsOf(9), null);
  assert.equal(nokey.code, 0);
  assert.equal(nokey.outputs.verdict, 'off');
  assert.deepEqual(nokey.asked, []);

  const noTally = await run(new Response(null, { status: 404 }), hitsOf(9));
  assert.equal(noTally.code, 0);
  assert.equal(noTally.outputs.verdict, 'off');

  assert.equal((await run(new Response(null, { status: 429 }), hitsOf(9))).outputs.verdict, 'later');
  assert.equal((await run(new Response(null, { status: 503 }), hitsOf(9))).outputs.verdict, 'later');
  assert.equal((await run(new TypeError('fetch failed'), hitsOf(9))).outputs.verdict, 'later');

  const busy = await run(json([]), new Response(null, { status: 503 }));
  assert.equal(busy.code, 0);
  assert.equal(busy.outputs.verdict, 'later');
  assert.match(busy.log, /^::warning::/m);
  assert.equal((await run(json([]), new TypeError('fetch failed'))).outputs.verdict, 'later');
});

test('main: a turned-away or reshaped answer fails the run, and the key stays out of the log', async () => {
  const forbidden = await run(new Response(null, { status: 403 }), hitsOf(1));
  assert.equal(forbidden.code, 1);
  assert.match(forbidden.log, /^::error::/m);

  assert.equal((await run(json([{ x: 1 }]), hitsOf(1))).code, 1);

  const refused = await run(json([]), new Response(null, { status: 401 }));
  assert.equal(refused.code, 1);
  const reshaped = await run(json([]), json({ nope: true }));
  assert.equal(reshaped.code, 1);
  const wrongCount = await run(json([]), json({ hits: [{ path: RUN_PATH, count: 'many' }], more: false }));
  assert.equal(wrongCount.code, 1);

  for (const r of [forbidden, refused, reshaped, wrongCount, await run(json([row('d1', 1, 0)]), hitsOf(2))]) {
    assert.ok(!r.log.includes(FAKE_KEY) && !r.summary.includes(FAKE_KEY) && !r.body.includes(FAKE_KEY));
  }
});
