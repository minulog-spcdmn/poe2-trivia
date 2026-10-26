// An answer written to the codex once the page is calm (codex.ts
// recordWhenCalm), as the game moves on: written as it would have been at
// once, never read without it (the end screen after a quick Next reads it
// first, and so does a Delve run recorded as it ends or is left, for its
// wards), and the achievements checked after it, with it in the codex.
import { test, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import './asVite.ts';
import { items, memoryStorage } from './helpers.ts';
import type { GameState } from '../src/lib/game.ts';

const store = new Map<string, string>();
/** Each write to the codex, as it is set. */
let writes = 0;
mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
const { CODEX_KEY, emptyCodex, loadCodex, recordEncounter, recordWhenCalm, resetCodex } = await import('../src/lib/codex.ts');
const { CALM_MS } = await import('../src/lib/idle.ts');
const { findsMet, leftEvent, runEvent } = await import('../src/lib/delveRecord.ts');
const { createGame } = await import('../src/lib/game.ts');
const { DELVE_RULESET } = await import('../src/lib/delve.ts');
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

/** A run together of a and b (startedAt 500), at depth 15 with the lives each lost there. */
function team(phase: GameState['phase'], losses: Record<string, number[]>): GameState {
  const s = createGame('a');
  s.players = ['a', 'b'].map((id, hue) => ({ id, name: id, score: 0, recent: [], connected: true, hue }));
  s.phase = phase;
  s.round = 15;
  s.delve = { entrants: ['a', 'b'], losses, ruleset: DELVE_RULESET, startedAt: 500, excused: [], graceUntil: 0 };
  return s;
}
/** a's wrong answer in that run at `depth`, a ward broken in place of a life (`find`: the question came from one). */
const warded = (at: number, depth: number, find?: 'azurite'): Encounter => ({
  ...enc(at, a.id, false),
  delve: { depth, run: 500, team: true, who: 'a', ...(find ? { find } : {}), lost: { lives: 1, wards: 1 } },
});

test('a Delve run recorded before the page is calm counts the wards of the answers still waiting', () => {
  // The last answer of a run together, then nobody standing after a quick Next: the run ends before calm.
  const over = team('over', { a: [3, 9, 15], b: [4, 10, 15] });
  const last = team('reveal', { a: [3, 9, 15], b: [4, 10, 15] });
  recordEncounter(warded(9, 9));
  const before = store.get(CODEX_KEY);
  let followed = 0;
  recordWhenCalm(warded(15, 15, 'azurite'), () => followed++);
  assert.equal(store.get(CODEX_KEY), before, 'still waiting');
  assert.equal(runEvent(last, over, 'a')!.wards, 2, 'the last answer\'s ward too');
  // So is a run left (the room left, the tab closed) with an answer waiting.
  recordWhenCalm(warded(16, 16));
  const going = team('choosing', { a: [3, 9], b: [] });
  assert.equal(leftEvent({ ...going, round: 16 }, 'a')!.wards, 3);
  recordWhenCalm(warded(17, 17, 'azurite'));
  assert.ok(findsMet().has('azurite'), 'and the finds met, for the lobby');
  // Written as it would have been at once, and nothing again at calm; what follows still runs.
  const written = store.get(CODEX_KEY);
  store.clear();
  for (const e of [warded(9, 9), warded(15, 15, 'azurite'), warded(16, 16), warded(17, 17, 'azurite')]) recordEncounter(e);
  assert.equal(written, store.get(CODEX_KEY));
  store.set(CODEX_KEY, written!);
  writes = 0;
  tick(CALM_MS);
  assert.equal(writes, 0);
  assert.equal(followed, 1);
});

test('a codex reset takes what was waiting with it', () => {
  recordWhenCalm(met[0]);
  resetCodex();
  tick(CALM_MS);
  assert.deepEqual(loadCodex(), emptyCodex());
});
