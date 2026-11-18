// The item tally (lib/itemTally.ts): which answers count (every one this
// device's player gives: right or wrong, a time-out, a ward's save and a
// question they blasted away wrong), under which context, and that each goes
// once, where the codex takes it in (codex.ts onTaken), with what the
// encounter can't hold said beside it (blastAside, screenAside, the daily's).
// Here the page isn't the live game's, so nothing counts and nothing is
// started; what goes out where it counts is in itemTallySend.test.ts.
import { test, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import './asVite.ts';
import { items, memoryStorage } from './helpers.ts';
import type { Blast, GameState } from '../src/lib/game.ts';

const store = new Map<string, string>();
let full = false;
(globalThis as { localStorage?: unknown }).localStorage = memoryStorage(store, () => !full);
mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
const fetched: unknown[] = [];
(globalThis as { fetch?: unknown }).fetch = async (...args: unknown[]) => (fetched.push(args), new Response(null, { status: 204 }));
const { blastAside, onTaken, recordEncounter, recordSeen, recordWhenCalm, resetCodex, screenAside } = await import('../src/lib/codex.ts');
const { CALM_MS } = await import('../src/lib/idle.ts');
const { findDepth } = await import('../src/lib/delve.ts');
const { CONTEXTS, MAX_BATCH, RETRIES, TALLY_VERSION, Tallier, bandOf, batchId, ctxOf, startTally, sendTally, tallyBody, tallyEntry } = await import('../src/lib/itemTally.ts');
const { MAX_TALLIED, TALLY_CONTEXTS, TALLY_ROWS: WORKER_ROWS, TALLY_VERSION: WORKER_VERSION } = await import('../signal/worker.js');
const { loadTally, tallyAsked } = await import('../src/lib/tallyLoader.ts');
const { TALLY_ROWS } = await import('../src/lib/itemTallyRank.ts');
const { counting } = await import('../src/lib/count.ts');
type Encounter = Parameters<typeof recordEncounter>[0];
type Taken = Parameters<Parameters<typeof onTaken>[0]>[0];

const [a, b] = items;
/** A Delve answer at `depth`: right or wrong (`ok`), or seen only (null). */
function delve(at: number, itemId: string, depth: number, ok: boolean | null, more: Partial<NonNullable<Encounter['delve']>> = {}, mode: 'name' | 'art' = 'name'): Encounter {
  return {
    at,
    itemId,
    mode,
    difficulty: 'merciless',
    race: false,
    delve: { depth, run: 500, ...more },
    ...(ok === null ? {} : { answer: { ok, pickedId: ok ? itemId : null, pickedLabel: null } }),
  };
}
/** An answer in a room's game: Take turns or Race, at `difficulty`. */
function room(at: number, itemId: string, ok: boolean | null, difficulty: Encounter['difficulty'], race = false): Encounter {
  return { at, itemId, mode: 'art', difficulty, race, ...(ok === null ? {} : { answer: { ok, pickedId: null, pickedLabel: null } }) };
}
const entry = (e: Encounter, first = false, aside?: Taken['aside']) => tallyEntry({ e, first, aside });
const ctx = (e: Encounter) => entry(e)?.[2];

let told: Taken[] = [];
beforeEach(() => {
  store.clear();
  full = false;
  told = [];
  onTaken((t) => told.push(t));
  resetCodex();
});

test('the fifty contexts, the batch and the cap on sums, the same on the page and the Worker', () => {
  assert.equal(CONTEXTS.length, 50);
  assert.deepEqual([...CONTEXTS].sort(), [...TALLY_CONTEXTS].sort());
  // And the batch's size, the sums kept and the version sent, as each side has them.
  assert.equal(MAX_BATCH, MAX_TALLIED);
  assert.equal(TALLY_ROWS, WORKER_ROWS);
  assert.equal(TALLY_VERSION, WORKER_VERSION, 'the Worker takes the version the pages send');
});

test('each answer’s context: Delve by the band of the depth its rules came from, rooms by their difficulty', () => {
  assert.equal(ctx(delve(1, a.id, 1, true)), 'd1');
  assert.equal(ctx(delve(1, a.id, 10, false)), 'd1');
  assert.equal(ctx(delve(1, a.id, 11, true)), 'd2');
  assert.equal(ctx(delve(1, a.id, 200, true)), 'd20');
  assert.equal(ctx(delve(1, a.id, 4000, true)), 'd20', 'every depth past 190 in the last band');
  assert.deepEqual([bandOf(1), bandOf(10), bandOf(11), bandOf(191), bandOf(200), bandOf(201)], [1, 1, 2, 20, 20, 20]);
  // A find's question from deeper down; a vein's later strikes deeper still.
  assert.equal(ctx(delve(1, a.id, 5, true, { find: 'azurite' })), `d${bandOf(findDepth('azurite', 5))}`);
  assert.equal(ctx(delve(1, a.id, 5, true, { find: 'azurite' })), 'd3');
  assert.equal(ctx(delve(1, a.id, 5, false, { find: 'azurite', strike: 3 })), `d${bandOf(findDepth('azurite', 5, 3))}`);
  assert.notEqual(bandOf(findDepth('azurite', 5, 3)), bandOf(findDepth('azurite', 5)));
  assert.equal(ctx(delve(1, a.id, 50, true, { find: 'flare' })), `d${bandOf(findDepth('flare', 50))}`);
  assert.equal(ctx(delve(1, a.id, 50, true, { find: 'dynamite' })), `d${bandOf(findDepth('dynamite', 50))}`);
  // Together: the same bands under g.
  assert.equal(ctx(delve(1, a.id, 1, true, { team: true })), 'g1');
  assert.equal(ctx(delve(1, a.id, 15, false, { team: true })), 'g2');
  assert.equal(ctx(delve(1, a.id, 5, true, { team: true, find: 'azurite' })), 'g3');
  // Take turns and Race, by the room's preset.
  for (const d of ['cruel', 'merciless', 'eternal', 'custom'] as const) {
    assert.equal(ctx(room(1, a.id, true, d)), `t-${d}`);
    assert.equal(ctx(room(1, a.id, false, d, true)), `r-${d}`);
  }
  // Today's unique, said beside it.
  assert.equal(ctxOf(room(1, a.id, null, 'custom'), true), 'daily');
  assert.deepEqual(entry(room(1, a.id, null, 'custom'), true, { ok: false, daily: true }), [a.id, 'a', 'daily', 1, 'w']);
});

test('right or wrong; a time-out and a ward’s save are wrong; no answer of this player’s, nothing', () => {
  assert.deepEqual(entry(delve(1, a.id, 3, true), true), [a.id, 'n', 'd1', 1, 'r']);
  assert.deepEqual(entry(delve(1, a.id, 3, false, {}, 'art')), [a.id, 'a', 'd1', 0, 'w'], 'a time-out: wrong, nothing picked');
  assert.deepEqual(entry(delve(1, a.id, 3, false, { warded: true })), [a.id, 'n', 'd1', 0, 'w']);
  assert.equal(entry(delve(1, a.id, 5, null)), null, 'seen only (watched, a race lost before a guess, a teammate first)');
  assert.equal(entry(room(1, a.id, null, 'cruel', true)), null);
  assert.equal(entry({ ...delve(1, a.id, 5, true), itemId: 'nope' }), null, 'not an item’s id');
});

/** A Delve state, alone (one entrant) or together, with `players`. */
function delveState(entrants: string[], players = entrants): GameState {
  return { players: players.map((id) => ({ id })), turn: 0, phase: 'question', settings: { mode: 'delve' }, delve: { entrants, startedAt: 500 } } as unknown as GameState;
}
const blast = (by?: string, struck: string[] = []): Blast => ({
  ...(by ? { by } : {}),
  stick: by ?? 'p1',
  side: 1,
  was: { at: 7, itemId: a.id, mode: 'name', ...(struck.length ? { struck: struck.map((x) => ({ by: x, index: 0, lives: 1, wards: 0 })) } : {}) },
});

test('a question blasted away: wrong for whoever set it off, alone also when the clock set it off; a teammate’s none of mine', () => {
  const seen = delve(7, a.id, 4, null);
  const together = delve(7, a.id, 4, null, { team: true });
  const struck = delve(7, a.id, 4, false, { team: true });
  const outcome = (e: Encounter, aside: ReturnType<typeof blastAside>) => entry(e, false, aside ?? undefined)?.[4] ?? null;
  // Alone, online and at one screen.
  assert.equal(outcome(seen, blastAside(delveState(['me']), blast('me'), 'me', false, seen)), 'w', 'by me');
  assert.equal(outcome(seen, blastAside(delveState(['me']), blast(), 'me', false, seen)), 'w', 'by itself alone: my time-out');
  assert.equal(outcome(seen, blastAside(delveState(['p1']), blast(), null, true, seen)), 'w', 'by itself at one screen');
  assert.equal(outcome(seen, blastAside(delveState(['p1']), blast('p1'), null, true, seen)), 'w');
  assert.equal(outcome(seen, blastAside(delveState(['p1']), blast('p1'), 'watcher', false, seen)), null, 'a run only watched');
  // Together.
  assert.equal(outcome(together, blastAside(delveState(['me', 'mate']), blast('me'), 'me', false, together)), 'w', 'by me');
  assert.equal(outcome(together, blastAside(delveState(['me', 'mate']), blast('mate'), 'me', false, together)), null, 'by a teammate');
  assert.equal(outcome(together, blastAside(delveState(['me', 'mate']), blast(), 'me', false, together)), null, 'by itself together');
  // A wrong answer struck on it first stands, whoever blasted it.
  assert.equal(blastAside(delveState(['me', 'mate']), blast('mate', ['me']), 'me', false, struck), null);
  assert.equal(outcome(struck, null), 'w');
});

test('hot-seat with several players: the turn’s answer from the reveal; alone it is the encounter’s own', () => {
  const at = (players: number, correct: boolean, hotSeat = true, mode = 'turns', delve?: object) =>
    screenAside(
      { players: Array.from({ length: players }, (_, i) => ({ id: `p${i}` })), turn: 0, phase: 'reveal', settings: { mode }, delve: delve ?? null, reveal: { correct } } as unknown as GameState,
      hotSeat,
    );
  assert.deepEqual(at(3, true), { ok: true });
  assert.deepEqual(at(2, false), { ok: false });
  assert.equal(at(1, true), null, 'one player: the codex counts it');
  assert.equal(at(3, true, false), null, 'online: each device its own');
  assert.equal(at(3, true, true, 'delve', { entrants: ['p0'] }), null);
});

test('a race the clock ended with nobody right: a miss for a player in it who never guessed, nobody else', () => {
  const race = (reveal: object) =>
    ({ players: [{ id: 'me' }, { id: 'other' }], turn: 0, phase: 'reveal', settings: { mode: 'race' }, delve: null, reveal: { correct: false, ...reveal } }) as unknown as GameState;
  const none = { itemId: a.id } as unknown as Parameters<typeof screenAside>[3];
  const guessed = { itemId: a.id, answer: { ok: false, pickedId: b.id, pickedLabel: null } } as unknown as Parameters<typeof screenAside>[3];
  assert.deepEqual(screenAside(race({ timedOut: true, winnerId: null }), false, 'me', none), { ok: false }, 'ran out of time');
  assert.equal(screenAside(race({ timedOut: true, winnerId: null }), false, 'me', guessed), null, 'a wrong guess is its own answer');
  assert.equal(screenAside(race({ timedOut: false, winnerId: 'other' }), false, 'me', none), null, 'beaten to it: no answer');
  assert.equal(screenAside(race({ timedOut: true, winnerId: null }), false, 'watcher', none), null, 'a spectator');
});

test('told once, where the codex takes it in: a rejoin’s question again is not, nor one storage refused', () => {
  recordEncounter(delve(1, a.id, 2, false));
  recordEncounter(delve(1, a.id, 2, false));
  assert.equal(told.length, 1, 'the same question once');
  assert.equal(told[0].first, true);
  recordEncounter(delve(2, a.id, 3, true));
  assert.equal(told.length, 2);
  assert.equal(told[1].first, false, 'the item had an entry by then');
  full = true;
  recordEncounter(delve(3, b.id, 4, true));
  assert.equal(told.length, 2, 'not written, not told');
  full = false;
  recordEncounter(delve(4, b.id, 4, true));
  assert.equal(told.at(-1)?.first, true);
});

test('waiting for calm, in one write: each told with whether it was new then and what was said beside it, not stored', () => {
  // Hot-seat with several players: the codex counts no answer, the tally the turn's.
  const turn = room(1, a.id, null, 'eternal');
  recordWhenCalm(turn, undefined, { ok: false });
  recordWhenCalm(turn, undefined, { ok: false });
  recordWhenCalm(delve(2, a.id, 3, false));
  recordWhenCalm(delve(3, b.id, 4, null), undefined, { ok: false });
  assert.equal(told.length, 0, 'not before the page is calm');
  mock.timers.tick(CALM_MS + 10);
  assert.deepEqual(
    told.map((t) => entry(t.e, t.first, t.aside)),
    [
      [a.id, 'a', 't-eternal', 1, 'w'],
      [a.id, 'n', 'd1', 0, 'w'],
      [b.id, 'n', 'd1', 1, 'w'],
    ],
    'the hot-seat turn once, though met twice (a rejoin)',
  );
  assert.ok(![...store.values()].some((v) => v.includes('"aside"') || v.includes('"daily"')), 'nothing of it in the save');
  const codex = JSON.parse([...store.values()].find((v) => v.includes('"items"'))!);
  assert.equal(codex.items[a.id].art.n, 0, 'the hot-seat answer is not the codex’s');
});

test('today’s unique: its answer said of the item asked for, not of a wrong art pick seen with it', () => {
  recordSeen(10, 'art', [a.id, b.id], false);
  assert.deepEqual(
    told.map((t) => entry(t.e, t.first, t.aside)),
    [[a.id, 'a', 'daily', 1, 'w'], null],
  );
  recordSeen(11, 'name', [b.id]);
  assert.equal(entry(told[2].e, told[2].first, told[2].aside), null, 'seen only');
});

/** A batch id as the tests' Tallier makes them: 1, 2, 3… in hex. */
const idOf = (n: number) => n.toString(16).padStart(16, '0');
/** A Tallier posting into `posted`, each message answered with the next of `answers` (204 when they run out), its batches numbered (idOf). */
function tallier(answers: (number | null)[] = []) {
  const posted: string[] = [];
  let allowed = true;
  let made = 0;
  const t = new Tallier(
    () => allowed,
    async (body) => (posted.push(body), answers.length ? answers.shift()! : 204),
    () => idOf(++made),
  );
  const take = (e: Encounter, first = false, aside?: Taken['aside']) => t.note({ e, first, aside });
  return { t, posted, take, allow: (x: boolean) => (allowed = x) };
}
const settle = () => new Promise((done) => setImmediate(done));

test('held until a batch is full or sent; nothing goes once the player has opted out, held ones dropped', async () => {
  const { t, posted, take, allow } = tallier();
  take(delve(1, a.id, 2, true), true);
  take(delve(2, a.id, 40, null));
  assert.equal(t.size, 1, 'only what counts');
  t.send();
  assert.deepEqual(
    posted.map((x) => JSON.parse(x)),
    [{ v: TALLY_VERSION, id: idOf(1), a: [[a.id, 'n', 'd1', 1, 'r']] }],
  );
  t.send();
  assert.equal(posted.length, 1, 'nothing more to send');
  for (let i = 0; i < MAX_BATCH; i++) take(delve(10 + i, b.id, 15, false));
  assert.equal(posted.length, 2, 'a full batch goes at once');
  assert.equal(JSON.parse(posted[1]).a.length, MAX_BATCH);
  assert.ok(posted[1].length <= 4096);
  take(delve(100, a.id, 2, false));
  allow(false);
  t.send();
  assert.equal(posted.length, 2, 'opted out after it was held: not sent');
  allow(true);
  t.send();
  assert.equal(posted.length, 2, 'and not kept for later');
  allow(false);
  take(delve(101, a.id, 2, false));
  assert.equal(t.size, 0, 'not held either');
  allow(true);
  t.practice(a.id, 'art', true);
  t.send();
  assert.deepEqual(JSON.parse(posted[2]).a, [[a.id, 'a', 'practice', 0, 'r']], 'practice: not known to be a first meeting');
  assert.equal(JSON.parse(posted[1]).id, idOf(2), 'each batch its own id');
  assert.equal(tallyBody(idOf(9), [[a.id, 'a', 'g2', 0, 'w']]), `{"v":${TALLY_VERSION},"id":"${idOf(9)}","a":[["${a.id}","a","g2",0,"w"]]}`);
  // The longest a message gets: forty of the longest context.
  assert.ok(tallyBody(batchId(), Array(MAX_BATCH).fill([a.id, 'n', 'r-merciless', 1, 'w'])).length <= 4096);
});

test('a batch’s id: 16 random hex characters, a new one each time', () => {
  const ids = Array.from({ length: 50 }, batchId);
  for (const id of ids) assert.match(id, /^[0-9a-f]{16}$/);
  assert.equal(new Set(ids).size, ids.length);
});

test('a batch the network or a busy server turned down goes again with the next send, as it was, twice more at most; one refused is let go', async () => {
  for (const status of [null, 429, 500, 503]) {
    const { t, posted, take } = tallier([status, status, status, status]);
    take(delve(1, a.id, 2, true));
    t.send();
    await settle();
    assert.equal(t.size, 1, `${status}: kept to go again`);
    assert.equal(posted.length, 1, 'not sent again by itself');
    take(delve(2, b.id, 2, false));
    t.send();
    await settle();
    assert.equal(posted[1], posted[0], 'the batch again as it was, its id and all');
    assert.deepEqual(JSON.parse(posted[2]), { v: TALLY_VERSION, id: idOf(2), a: [[b.id, 'n', 'd1', 0, 'w']] }, 'the new answers in a batch of their own');
    t.send();
    await settle();
    t.send();
    await settle();
    assert.equal(posted.filter((x) => x === posted[0]).length, 1 + RETRIES, 'tried three times in all');
    assert.equal(posted.length, 1 + RETRIES + 2, 'the other let go of once it went');
    assert.equal(t.size, 0, 'then let go of');
  }
  for (const status of [400, 403, 413]) {
    const { t, posted, take } = tallier([status]);
    take(delve(1, a.id, 2, true));
    t.send();
    await settle();
    assert.equal(t.size, 0, `${status}: let go of`);
    t.send();
    assert.equal(posted.length, 1);
  }
  // Opted out while it was on its way: not taken back.
  const { t, take, allow } = tallier([503]);
  take(delve(1, a.id, 2, true));
  t.send();
  allow(false);
  await settle();
  assert.equal(t.size, 0);
  // Opted out after: what was to go again dropped too.
  const later = tallier([503]);
  later.take(delve(1, a.id, 2, true));
  later.t.send();
  await settle();
  assert.equal(later.t.size, 1);
  later.allow(false);
  later.take(delve(2, a.id, 2, true));
  assert.equal(later.t.size, 0);
  later.allow(true);
  later.t.send();
  assert.equal(later.posted.length, 1);
});

test('where visits aren’t counted, nothing is started or sent', async () => {
  assert.equal(counting, false);
  assert.equal(await loadTally(), null, 'the loader loads nothing');
  assert.equal(tallyAsked(), loadTally(), 'and asks once');
  startTally();
  recordEncounter(delve(1, a.id, 2, false));
  assert.equal(told.length, 1, 'the codex’s listener is still the test’s');
  sendTally();
  assert.equal(fetched.length, 0);
});
