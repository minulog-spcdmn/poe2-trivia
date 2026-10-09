import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MAX_COUNT, addGame, emptyLedger, ledgerEvent, loadLedger, parseLedger, recordLedger, serializeLedger, type VaalLedger } from '../src/lib/vaalRecord.ts';
import { Engine, createGame, type GameState, type Item, type Question } from '../src/lib/game.ts';
import { storeKey } from '../src/lib/storage.ts';

const items: Item[] = JSON.parse(readFileSync(new URL('../src/data/items.json', import.meta.url), 'utf8'));

const KEY = storeKey('vaalLedger');
const store = new Map<string, string>();
/** Storage can't be read at all (blocked): every access throws. */
let blocked = false;
const guard = () => {
  if (blocked) throw new Error('SecurityError');
};
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => (guard(), store.get(k) ?? null),
  setItem: (k: string, v: string) => (guard(), void store.set(k, String(v))),
  removeItem: (k: string) => (guard(), void store.delete(k)),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() {
    return store.size;
  },
};
beforeEach(() => {
  store.clear();
  blocked = false;
});

const ledger = (o: Partial<VaalLedger>): VaalLedger => ({ ...emptyLedger(), ...o });
const game = (game: number, held = 0, bricked = 0, altar = 0) => ({ held, bricked, altar, game });

test('parseLedger reads junk and other versions as none, and a ledger round-trips', () => {
  for (const raw of [null, '', '{', '[]', 'null', '42', '{"games":3}', '{"v":2,"games":3}', '{"v":"1","games":3}'])
    assert.equal(parseLedger(raw), null, String(raw));
  const l = ledger({ games: 7, held: 9, bricked: 4, bestAltar: 4, last: 1_700_000_000_000 });
  assert.deepEqual(parseLedger(serializeLedger(l)), l);
  // Junk stored reads as an empty ledger.
  store.set(KEY, '{"v":1,');
  assert.deepEqual(loadLedger(), emptyLedger());
  // Counts that make no sense read as 0; counts past any game's are capped.
  const odd = parseLedger(JSON.stringify({ v: 1, games: -2, held: 1.5, bricked: 'x', bestAltar: 1e12, last: -5 }));
  assert.deepEqual(odd, ledger({ bestAltar: MAX_COUNT }));
});

test('addGame adds the totals; a biggest Altar only when beaten and at least 2; the same game twice changes nothing', () => {
  let l = emptyLedger();
  let r = addGame(l, game(100, 2, 1, 0));
  assert.deepEqual(r.rec, ledger({ games: 1, held: 2, bricked: 1, last: 100 }));
  assert.equal(r.bestAltar, false, 'no Altar taken');
  l = r.rec;
  r = addGame(l, game(200, 1, 0, 1));
  assert.equal(r.bestAltar, false, 'an Altar of 1 is no story');
  assert.equal(r.rec.bestAltar, 1, 'but it is the biggest yet');
  l = r.rec;
  r = addGame(l, game(300, 1, 2, 3));
  assert.equal(r.bestAltar, true, 'beats 1, and at least 2');
  assert.deepEqual(r.rec, ledger({ games: 3, held: 4, bricked: 3, bestAltar: 3, last: 300 }));
  l = r.rec;
  const again = addGame(l, game(300, 1, 2, 3));
  assert.equal(again.rec, l, 'the same game twice: the same ledger');
  assert.equal(again.bestAltar, false);
  r = addGame(l, game(400, 1, 0, 3));
  assert.equal(r.bestAltar, false, 'equal is not beaten');
  assert.equal(r.rec.bestAltar, 3);
  r = addGame(r.rec, game(500, 0, 0, 0));
  assert.deepEqual(r.rec, ledger({ games: 5, held: 5, bricked: 3, bestAltar: 3, last: 500 }), 'a game without a corruption still counts');
});

test('recordLedger goes through localStorage and counts a game once', () => {
  assert.deepEqual(recordLedger(game(100, 2, 1, 2)), { rec: ledger({ games: 1, held: 2, bricked: 1, bestAltar: 2, last: 100 }), bestAltar: true });
  assert.ok(store.has(KEY));
  assert.deepEqual(loadLedger(), ledger({ games: 1, held: 2, bricked: 1, bestAltar: 2, last: 100 }));
  const twice = recordLedger(game(100, 2, 1, 2));
  assert.equal(twice?.bestAltar, false, 'a reload of the end screen announces nothing');
  assert.equal(loadLedger().games, 1, 'and counts nothing');
  assert.equal(recordLedger(game(200, 0, 3, 0))?.rec.bricked, 4);
  assert.equal(loadLedger().games, 2);
});

test("recordLedger never writes over a newer build's ledger; a damaged one is kept aside; blocked storage records nothing", () => {
  const newer = JSON.stringify({ v: 2, games: 12, shape: 'unknown' });
  store.set(KEY, newer);
  assert.deepEqual(loadLedger(), emptyLedger(), 'read as nothing');
  assert.equal(recordLedger(game(100, 1, 0, 0)), null, 'not stored');
  assert.equal(store.get(KEY), newer, 'untouched');
  assert.deepEqual([...store.keys()], [KEY], 'nothing kept aside');

  store.clear();
  store.set(KEY, '{"v":1,"games":');
  assert.equal(recordLedger(game(100, 1, 0, 0))?.rec.games, 1);
  assert.equal(store.get(`${KEY}.unread`), '{"v":1,"games":', 'kept as it was');
  assert.equal(loadLedger().held, 1);

  store.clear();
  blocked = true;
  assert.equal(recordLedger(game(100, 1, 0, 0)), null);
  assert.deepEqual(loadLedger(), emptyLedger());
  blocked = false;
  assert.equal(store.size, 0);
});

/** A turns game just over: `seats` seated, a spectator, each player's ledger. */
function over(seats: string[], ledgers: Record<string, { held: number; bricked: number; altar: number }> = {}, settings: Partial<GameState['settings']> = {}): GameState {
  const s = createGame('a', { ...createGame('a').settings, ...settings });
  s.players = seats.map((id, hue) => ({ id, name: id, score: 0, recent: [], connected: true, hue, ...(ledgers[id] ? { ledger: ledgers[id] } : {}) }));
  s.spectators = [{ id: 'watcher', name: 'watcher' }];
  s.phase = 'over';
  s.startedAt = 1234;
  return s;
}
const playing = (s: GameState): GameState => ({ ...s, phase: 'reveal' });

test("ledgerEvent: the game just over, as this browser's player played it; nothing for anyone else", () => {
  const l = { held: 2, bricked: 1, altar: 3 };
  const s = over(['a', 'b'], { a: l, b: { held: 0, bricked: 4, altar: 0 } });
  assert.deepEqual(ledgerEvent(playing(s), s, 'a'), { ...l, game: 1234 }, 'online: this device seat');
  assert.deepEqual(ledgerEvent(playing(s), s, 'b'), { held: 0, bricked: 4, altar: 0, game: 1234 });
  assert.deepEqual(ledgerEvent(null, s, 'a'), { ...l, game: 1234 }, 'coming in on the end screen (the ledger keeps it to once)');
  assert.equal(ledgerEvent(s, s, 'a'), null, 'already over');
  assert.equal(ledgerEvent(playing(s), playing(s), 'a'), null, 'still on');
  assert.equal(ledgerEvent(playing(s), s, 'watcher'), null, 'a spectator');
  assert.equal(ledgerEvent(playing(s), s, null), null, 'nobody seated');
  assert.equal(ledgerEvent(playing(s), s, 'a', true), null, 'hot-seat of several');
  const solo = over(['a'], { a: l });
  assert.deepEqual(ledgerEvent(playing(solo), solo, null, true), { ...l, game: 1234 }, 'hot-seat alone');
  const plain = over(['a']);
  assert.deepEqual(ledgerEvent(playing(plain), plain, 'a'), { held: 0, bricked: 0, altar: 0, game: 1234 }, 'no ledger (joined late): a game all the same');
  const race = over(['a', 'b'], { a: l }, { mode: 'race' });
  assert.equal(ledgerEvent(playing(race), race, 'a'), null, 'race');
  const delve = over(['a'], { a: l }, { mode: 'delve' });
  assert.equal(ledgerEvent(playing(delve), delve, null, true), null, 'Delve');
  const unstarted = over(['a'], { a: l });
  delete unstarted.startedAt;
  assert.equal(ledgerEvent(playing(unstarted), unstarted, 'a'), null, 'no game to tell apart');
});

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

test('a solo hot-seat game played to its end adds its corruptions to the ledger, once', () => {
  const engine = new Engine(items, { rng: seeded(42) });
  let s: GameState = createGame('p0', { ...createGame('p0').settings, targetScore: 5, timer: 0, difficulty: 'cruel' });
  s = engine.apply(s, { type: 'join', playerId: 'p0', name: 'Ash' }, 'p0');
  s = engine.apply(s, { type: 'start' }, 'p0');
  // A brick first, then plain right answers to the end.
  const answer = (q: Question, right: boolean) => (right ? q.options.indexOf(q.itemId) : q.options.findIndex((o) => o !== q.itemId));
  const events = [];
  for (let turn = 0; s.phase !== 'over' && turn < 20; turn++) {
    const vaal = turn === 0;
    s = engine.apply(s, { type: 'pick', category: s.offered[0], ...(vaal ? { vaal: true } : {}) }, 'p0');
    s = engine.apply(s, { type: 'answer', index: answer(s.question!, !vaal) }, 'p0');
    const prev = s;
    s = engine.apply(s, { type: 'next' }, 'p0');
    const e = ledgerEvent(prev, s, null, true);
    if (e) events.push(recordLedger(e));
  }
  assert.equal(s.phase, 'over');
  assert.equal(events.length, 1, 'counted as it ends');
  assert.deepEqual(events[0]?.rec, ledger({ games: 1, held: 0, bricked: 1, bestAltar: 0, last: s.startedAt }));
  // A reload of the end screen (no state before it) counts nothing more.
  assert.equal(recordLedger(ledgerEvent(null, s, null, true)!)?.rec.games, 1);
});
