// The daily check whether the item tally holds enough answers to act on
// (scripts/tally-ready.mjs, .github/workflows/tally-ready.yml): each item
// clearly above the cut, clearly below or undecided, the floor for asking
// Claude, and what a day the tally can't be read does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CUT, FLOOR, main, readTally, summarize } from '../scripts/tally-ready.mjs';
import { TALLY_VERSION, type TallyRow } from '../src/lib/itemTallyRank.ts';

const ITEMS = [...'abcdefghij'].map((id, n) => ({ id, name: `Item ${id.toUpperCase()}`, group: n < 6 ? 'Rings' : 'Relics' }));
const row = (item: string, ctx: string, r: number, w: number, more: Partial<TallyRow> = {}): TallyRow => ({ v: TALLY_VERSION, item, form: 'n', ctx, first: 0, r, w, ...more });
const AT = new Date('2026-11-18T06:41:00Z');

/** Every item asked 200 times at depths 1-10, a fifth missed; item a missed four times in five. */
const dense = () => ITEMS.map((i) => (i.id === 'a' ? row('a', 'd1', 40, 160) : row(i.id, 'd1', 160, 40)));

test('summarize: with enough answers each item lands on a side, and the floor is met', () => {
  const s = summarize(dense(), ITEMS, AT);
  assert.equal(s.above, 1);
  assert.equal(s.below, 9);
  assert.equal(s.undecided, 0);
  assert.equal(s.answers, 2000);
  assert.equal(s.ask, true);
  // Expected of a: its 200 answers at depths 1-10's rate, 520 missed in 2,000.
  assert.match(s.text, /\| Item A \| Rings \| 200 \| 160 \| 3\.08 \|/);
  assert.match(s.text, /clearly above: 1\n/);
  assert.match(s.text, /Delve alone by depth: 1-10: 2,000\./);
  assert.match(s.text, /\| Relics \| 4 \| 0 \| 4 \| 0 \|/);
  assert.match(s.text, /: met\./);
});

test('summarize: few answers leave items undecided, and below the floor Claude isn’t asked', () => {
  const s = summarize(ITEMS.slice(0, 6).map((i) => row(i.id, 'd1', 2, 1)), ITEMS, AT);
  assert.equal(s.above, 0);
  assert.equal(s.undecided, 10);
  assert.ok(s.undecided > Math.floor(FLOOR * ITEMS.length));
  assert.equal(s.ask, false);
  assert.match(s.text, /4 with no answers yet/);
  assert.match(s.text, new RegExp(`No item is clearly above ${CUT} yet\\.`));
  assert.match(s.text, /: not met\./);
});

test('summarize: no answers at all never asks', () => {
  const s = summarize([], ITEMS, AT);
  assert.equal(s.answers, 0);
  assert.equal(s.ask, false);
});

test('summarize: ids items.json lacks and other versions stay out of the counts and the text', () => {
  const rows = [...dense(), row('made|up <b>', 'd1', 0, 5000), row('a', 'd1', 0, 9000, { v: TALLY_VERSION + 1 })];
  const s = summarize(rows, ITEMS, AT);
  assert.equal(s.unknown, 1);
  assert.equal(s.answers, 2000);
  assert.equal(s.above, 1);
  assert.doesNotMatch(s.text, /made|<b>/);
  assert.match(s.text, /1 of them for ids items\.json doesn't have/);
});

test('summarize: first meetings are counted on their own', () => {
  const rows = [...dense(), ...ITEMS.map((i) => row(i.id, 'd1', 1, 0, { first: 1 }))];
  const s = summarize(rows, ITEMS, AT);
  assert.equal(s.first.undecided, 10);
  assert.equal(s.first.unanswered, 0);
});

const answer = (body: BodyInit | null, status = 200) => (async () => new Response(body, { status })) as typeof fetch;

test('readTally: not on the server yet, busy, spent or unreachable pass; turned away or reshaped fail', async () => {
  assert.equal((await readTally(answer(null, 404))).status, 'off');
  assert.equal((await readTally(answer(null, 429))).status, 'later');
  assert.equal((await readTally(answer(null, 503))).status, 'later');
  assert.equal((await readTally((async () => Promise.reject(new TypeError('fetch failed'))) as typeof fetch)).status, 'later');
  assert.equal((await readTally(answer('[{'))).status, 'later');
  assert.equal((await readTally(answer(null, 403))).status, 'broken');
  assert.equal((await readTally(answer('[{"x":1}]'))).status, 'broken');
  const ok = await readTally(answer(JSON.stringify(dense())));
  assert.equal(ok.status, 'ok');
  assert.equal(ok.status === 'ok' && ok.rows.length, 10);
});

test('main: writes whether to ask Claude, and a day the tally is off passes with a notice', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'tally-ready-'));
  try {
    const lines: string[] = [];
    const output = path.join(dir, 'output');
    const env = { GITHUB_OUTPUT: output };
    assert.equal(await main([], env, { fetch: answer(null, 404), now: () => AT, log: (l) => lines.push(l) }), 0);
    assert.match(lines.join('\n'), /^::notice::/m);
    assert.equal(await readFile(output, 'utf8'), 'ask=false\n');

    assert.equal(await main([], env, { fetch: answer(null, 403), now: () => AT, log: (l) => lines.push(l) }), 1);
    assert.match(lines.join('\n'), /^::error::/m);

    // (main reads the real items.json: every item answered 200 times, the first missed most.)
    const real: { id: string }[] = JSON.parse(await readFile(new URL('../src/data/items.json', import.meta.url), 'utf8'));
    const file = path.join(dir, 'tally.json');
    await writeFile(file, JSON.stringify(real.map((i, n) => (n ? row(i.id, 'd1', 160, 40) : row(i.id, 'd1', 40, 160)))));
    await writeFile(output, '');
    const out = path.join(dir, 'summary.md');
    assert.equal(await main(['--file', file, '--out', out], env, { now: () => AT, log: (l) => lines.push(l) }), 0);
    assert.equal(await readFile(output, 'utf8'), 'ask=true\n');
    assert.match(await readFile(out, 'utf8'), /^## Item tally v\d+, read 2026-11-18 06:41 UTC/);

    assert.equal(await main(['--nope'], env, { log: (l) => lines.push(l) }), 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
