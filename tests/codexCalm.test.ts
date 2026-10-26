// An answer written to the codex once the page is calm (codex.ts
// recordWhenCalm), as the game moves on: written as it would have been at
// once, never read without it (the end screen after a quick Next reads it
// first), and the achievements checked after it, with it in the codex.
import { test, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import './asVite.ts';
import { items, memoryStorage } from './helpers.ts';

const store = new Map<string, string>();
/** Each write to the codex, as it is set. */
let writes = 0;
mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
const { CODEX_KEY, emptyCodex, loadCodex, recordEncounter, recordWhenCalm, resetCodex } = await import('../src/lib/codex.ts');
const { CALM_MS } = await import('../src/lib/idle.ts');
type Encounter = Parameters<typeof recordEncounter>[0];
(globalThis as { localStorage?: unknown }).localStorage = memoryStorage(store, (k) => (k === CODEX_KEY && writes++, true));
beforeEach(() => {
  store.clear();
  writes = 0;
});

const tick = (ms: number) => mock.timers.tick(ms);
const enc = (at: number, itemId: string, ok: boolean): Encounter => ({
  at,
  itemId,
  mode: 'name',
  difficulty: 'merciless',
  race: false,
  answer: { ok, pickedId: null, pickedLabel: null, ms: 2000 + at },
});
const [a, b] = items;
const met = [enc(1, a.id, true), enc(2, b.id, false), enc(3, a.id, false)];

/** The codex as stored once `met` is written one by one, as soon as each is met. */
function atOnce() {
  store.clear();
  for (const e of met) recordEncounter(e);
  const stored = store.get(CODEX_KEY);
  store.clear();
  writes = 0;
  return stored;
}

test('written once the page is calm, as it would have been at once, and what follows it sees it', () => {
  const expected = atOnce();
  let seen: number | undefined;
  for (const e of met.slice(0, -1)) recordWhenCalm(e);
  recordWhenCalm(met.at(-1)!, () => (seen = JSON.parse(store.get(CODEX_KEY)!).log.length));
  tick(CALM_MS - 1);
  assert.equal(store.get(CODEX_KEY), undefined, 'nothing written among the frames of the reveal');
  tick(1);
  assert.equal(store.get(CODEX_KEY), expected);
  assert.equal(writes, 1, 'all that waited in one write');
  assert.equal(seen, met.length, 'the achievements checked with it in the codex');
});

test('read before the page is calm, the codex has it; nothing is written twice, and what follows still runs', () => {
  const expected = atOnce();
  let followed = 0;
  for (const e of met) recordWhenCalm(e, () => followed++);
  const read = loadCodex();
  assert.equal(store.get(CODEX_KEY), expected, 'written as the codex is read');
  assert.deepEqual(read.log.map((x) => x.t), [1, 2, 3]);
  assert.equal(writes, 1);
  tick(CALM_MS);
  assert.equal(store.get(CODEX_KEY), expected);
  assert.equal(writes, 1, 'not again once calm');
  assert.equal(followed, met.length);
});

test('a codex reset takes what was waiting with it', () => {
  recordWhenCalm(met[0]);
  resetCodex();
  tick(CALM_MS);
  assert.deepEqual(loadCodex(), emptyCodex());
});
