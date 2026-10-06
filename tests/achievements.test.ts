import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Engine, createGame, isFake, publicView, type GameMode, type GameState, type Item, type Question } from '../src/lib/game.ts';
import { emptyCodex, encounterAt, recordEncounter, resetCodex, type Answer, type Codex } from '../src/lib/codex.ts';
import { emptyRecords, recordRun, type DelveRecords, type DelveRun } from '../src/lib/delveRecord.ts';
import {
  ACHIEVEMENTS,
  ACHIEVEMENTS_KEY,
  ACHIEVEMENTS_VERSION,
  CLEAN_DEPTHS,
  GROUPS,
  checkAchievements,
  emptyStore,
  emptyTally,
  gameEnded,
  isDone,
  loadAchievements,
  newlyEarned,
  parseStore,
  resetAchievements,
  serializeStore,
  summarize,
  tallyGame,
  type GameResult,
} from '../src/lib/achievements.ts';
import { storeKey } from '../src/lib/storage.ts';

const items: Item[] = JSON.parse(readFileSync(new URL('../src/data/items.json', import.meta.url), 'utf8'));
const fakes: Record<string, string[]> = JSON.parse(readFileSync(new URL('../src/data/fakes.json', import.meta.url), 'utf8'));

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() {
    return store.size;
  },
};
beforeEach(() => store.clear());

const right = (q: Question) => q.options.indexOf(q.itemId);
const wrongIdx = (q: Question) => q.options.findIndex((o) => o !== q.itemId && !isFake(o));

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

/** A codex where `ids` were answered, right or not, in that order. */
function codexOf(answers: [id: string, ok: boolean][], over: Partial<Codex> = {}): Codex {
  const c = emptyCodex();
  answers.forEach(([id, ok], i) => {
    const e = (c.items[id] ??= { seen: 0, first: i, last: i, name: { n: 0, ok: 0 }, art: { n: 0, ok: 0 }, mixed: {} });
    e.seen++;
    e.name = { n: e.name.n + 1, ok: e.name.ok + (ok ? 1 : 0) };
    c.log.push({ t: i + 1, id, mode: 'name', ok, difficulty: 'cruel', race: false });
  });
  return { ...c, ...over };
}

const sum = (c: Codex, r: DelveRecords = emptyRecords(), g = emptyTally()) => summarize(c, r, g, items);
const earnedIds = (c: Codex, r?: DelveRecords, g?: ReturnType<typeof emptyTally>) => newlyEarned(sum(c, r, g), emptyStore()).map((a) => a.id);

test('every achievement has its own id, a group that is listed, and something to earn', () => {
  const ids = ACHIEVEMENTS.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const a of ACHIEVEMENTS) {
    assert.ok(GROUPS.some((g) => g.key === a.group), a.id);
    assert.ok(a.title && a.text.endsWith('.'), a.id);
    assert.ok(a.progress(sum(emptyCodex())).need > 0, a.id);
  }
  // Nothing is earned before anything was played.
  assert.deepEqual(earnedIds(emptyCodex()), []);
});

test('the collection counts the items of the game discovered, and the category nearest to done', () => {
  const rings = items.filter((it) => it.category === 'Rings');
  const s = sum(codexOf(rings.slice(0, 10).map((it) => [it.id, true])));
  assert.equal(s.seen, 10);
  assert.equal(s.total, items.length);
  assert.deepEqual(s.catSeen, { have: 10, need: rings.length, note: 'Rings' });
  assert.deepEqual(earnedIds(codexOf([[rings[0].id, false]])), ['discover-1']);

  // A whole category discovered, but one of its items never answered right.
  const all = codexOf(rings.map((it, i) => [it.id, i > 0]));
  const done = earnedIds(all);
  assert.ok(done.includes('category-seen'));
  assert.ok(!done.includes('category-known'));
  assert.deepEqual(sum(all).catKnown, { have: rings.length - 1, need: rings.length, note: 'Rings' });
  assert.ok(earnedIds(codexOf(rings.map((it) => [it.id, true]))).includes('category-known'));
});

test('items the game no longer has never count as discovered', () => {
  assert.equal(sum(codexOf([['gone-item', true]])).seen, 0);
  // Its right answer still counts.
  assert.equal(sum(codexOf([['gone-item', true]])).right, 1);
});

test('knowledge: right answers, streaks, speed and Eternal come from the codex', () => {
  const id = items[0].id;
  const c = codexOf(
    Array.from({ length: 25 }, () => [id, true] as [string, boolean]),
    { best: 15, fastest: { ms: 1400, id }, byDifficulty: { eternal: { n: 120, ok: 100 } } },
  );
  const done = earnedIds(c);
  for (const id of ['right-25', 'streak-5', 'streak-15', 'quick', 'eternal-100']) assert.ok(done.includes(id), id);
  assert.ok(!done.includes('streak-40'));
  assert.ok(!done.includes('right-250'));
  const slow = ACHIEVEMENTS.find((a) => a.id === 'quick')!.progress(sum({ ...c, fastest: { ms: 2300, id } }));
  assert.equal(isDone(slow), false);
  assert.equal(slow.note, 'your fastest: 2.3 s');
});

test('a nemesis is slain by a right answer after three wrong ones to the same item', () => {
  const [a, b] = items;
  assert.equal(sum(codexOf([[a.id, false], [a.id, false], [a.id, true]])).nemesis, false);
  assert.equal(sum(codexOf([[a.id, false], [b.id, false], [a.id, false], [a.id, false], [a.id, true]])).nemesis, true);
  // Three wrong answers, but spread over two items.
  assert.equal(sum(codexOf([[a.id, false], [a.id, false], [b.id, false], [b.id, true], [a.id, true]])).nemesis, false);
});

test('falling for a made-up name is a secret until it happens', () => {
  const fooled = ACHIEVEMENTS.find((a) => a.id === 'fooled')!;
  assert.equal(fooled.secret, true);
  assert.ok(earnedIds(codexOf([], { fooled: { 'Fake Name': { of: items[0].id, n: 1, last: 1 } } })).includes('fooled'));
});

const solo = (o: Partial<DelveRun>): DelveRun => ({ id: o.id ?? 1, at: 1, depth: 10, players: 1, ruleset: 1, mixed: false, ...o });

function recordsOf(runs: DelveRun[]): DelveRecords {
  for (const run of runs) recordRun(run);
  return JSON.parse(store.get(storeKey('delve2'))!) as DelveRecords;
}

test('Delve: depths, runs and what was given and brought back come from the records', () => {
  const r = recordsOf([
    solo({ id: 1, depth: 12, losses: [4, 9, 12] }),
    solo({ id: 2, depth: 26, losses: [22, 25, 26] }),
    { id: 3, at: 1, depth: 27, players: 3, ruleset: 1, mixed: false, losses: [5, 20], perished: [20], given: 1, revived: 1, who: 'me' },
  ]);
  const s = sum(emptyCodex(), r);
  assert.equal(s.deepestAlone, 26);
  assert.equal(s.deepestTogether, 27);
  assert.equal(s.runs, 3);
  assert.equal(s.runsTogether, 1);
  assert.equal(s.given, 1);
  assert.equal(s.revived, 1);
  // The second run went 21 depths before its first loss.
  assert.equal(s.clean, 21);
  const done = earnedIds(emptyCodex(), r);
  for (const id of ['delve-1', 'depth-10', 'depth-25', 'together-1', 'together-25', 'lifeline', 'revived', 'clean']) assert.ok(done.includes(id), id);
  assert.ok(!done.includes('depth-50'));
  assert.ok(CLEAN_DEPTHS <= 21);
});

test('Delve: a run left before its end, or under other rules, is never a depth reached', () => {
  const r = recordsOf([solo({ id: 1, depth: 30, left: true, losses: [] }), solo({ id: 2, depth: 40, mixed: true, losses: [35, 38, 40] })]);
  const s = sum(emptyCodex(), r);
  assert.equal(s.deepestAlone, 0);
  assert.equal(s.runs, 0);
  // Left at 30 with no life lost: the 29 depths before it were cleared.
  assert.equal(s.clean, 29);
});

test('Delve: finds are read off the codex log and its items', () => {
  const id = items[0].id;
  const c = codexOf([]);
  const log: Answer[] = [
    { t: 1, id, mode: 'name', ok: true, difficulty: 'cruel', race: false, depth: 30, run: 1, flared: true },
    { t: 2, id, mode: 'name', ok: false, difficulty: 'cruel', race: false, depth: 31, run: 1, find: 'azurite', lives: 1, wards: 1 },
  ];
  c.log = log;
  c.items[id] = { seen: 2, first: 1, last: 2, name: { n: 2, ok: 1 }, art: { n: 0, ok: 0 }, mixed: {}, delve: { n: 2, ok: 1, deepest: 30, lostAt: 31, blasted: 1, warded: 1 } };
  const s = sum(c);
  assert.deepEqual([s.flares, s.caveIns, s.blasts, s.warded], [1, 1, 1, 1]);
  const done = earnedIds(c);
  for (const a of ['flare', 'cave-in', 'dynamite', 'warded']) assert.ok(done.includes(a), a);
});

// ---- games against others ----

function setup(names: string[], mode: GameMode = 'turns', targetScore = 1, now = () => 5000) {
  const engine = new Engine(items, { rng: seeded(3), fakes, now });
  let s: GameState = createGame('p0', { targetScore, timer: 0, difficulty: 'eternal', mode, public: false, locked: false });
  names.forEach((name, i) => (s = engine.apply(s, { type: 'join', playerId: `p${i}`, name }, `p${i}`)));
  return { engine, s: engine.apply(s, { type: 'start' }, 'p0') };
}

/** Turns mode: the active player picks and answers, then the reveal moves on. */
function turn(engine: Engine, s: GameState, answer: (q: Question) => number | null) {
  const who = s.players[s.turn].id;
  s = engine.apply(s, { type: 'pick', category: s.offered[0] }, who);
  s = engine.apply(s, { type: 'answer', index: answer(s.question!) }, who);
  return { revealed: s, next: engine.apply(s, { type: 'next' }, 'p0') };
}

test('a game started records when, and a restart back to the lobby forgets it', () => {
  const { engine, s } = setup(['Ash', 'Bram']);
  assert.equal(s.startedAt, 5000);
  assert.equal(publicView(s).startedAt, 5000, 'guests get it too');
  let t = turn(engine, s, right);
  t = turn(engine, t.next, wrongIdx);
  assert.equal(t.next.phase, 'over');
  const lobby = engine.apply(t.next, { type: 'restart', play: false }, 'p0');
  assert.equal(lobby.startedAt, undefined);
});

test('an online game played to its end: the win is tallied once, flawless from its own answers', () => {
  const { engine, s } = setup(['Ash', 'Bram']);
  const winner = s.players[s.turn].id;
  const loser = s.players[1 - s.turn].id;
  let t = turn(engine, s, right);
  // Each device records its own answers into its codex (here, the winner's).
  recordEncounter(encounterAt(t.revealed, winner, false)!);
  const last = t.next;
  t = turn(engine, last, wrongIdx);
  const over = t.next;
  assert.equal(over.phase, 'over');
  assert.deepEqual(over.winners, [winner]);

  const won = gameEnded(publicView(last), publicView(over), winner, false)!;
  assert.deepEqual({ ...won, id: 0 }, { id: 0, since: 5000, delve: false, won: true, race: false, duel: false, eternal: true, players: 2, creator: false });
  assert.equal(gameEnded(last, over, loser, false)!.won, false);
  // Not on one device, not for someone watching, not twice, not before the end.
  assert.equal(gameEnded(last, over, null, true), null);
  assert.equal(gameEnded(last, over, 'spectator', false), null);
  assert.equal(gameEnded(over, over, winner, false), null);
  assert.equal(gameEnded(null, over, winner, false), null);

  const first = checkAchievements(items, won);
  assert.equal(first.first, true, 'the first check is quiet');
  const ids = first.earned.map((a) => a.id);
  for (const id of ['discover-1', 'win-1', 'flawless', 'win-eternal']) assert.ok(ids.includes(id), id);
  assert.ok(!ids.includes('win-race'));
  assert.equal(loadAchievements().games.won, 1);
  // The same game again (a second tab, a rejoin) changes nothing.
  assert.deepEqual(checkAchievements(items, won), { earned: [], first: false });
  assert.equal(loadAchievements().games.won, 1);
});

test('one player alone, or two on one device, is not a game against others', () => {
  const alone = setup(['Ash']);
  let t = turn(alone.engine, alone.s, right);
  assert.equal(t.next.phase, 'over');
  assert.equal(gameEnded(t.revealed, t.next, 'p0', false), null);
  const duo = setup(['Ash', 'Bram']);
  t = turn(duo.engine, duo.s, right);
  t = turn(duo.engine, t.next, wrongIdx);
  assert.equal(gameEnded(t.revealed, t.next, null, true), null);
});

const result = (o: Partial<GameResult> = {}): GameResult => ({
  id: 100,
  since: 100,
  delve: false,
  won: true,
  race: false,
  duel: false,
  eternal: false,
  players: 2,
  creator: false,
  ...o,
});
const answer = (t: number, ok: boolean, o: Partial<Answer> = {}): Answer => ({ t, id: items[0].id, mode: 'name', ok, difficulty: 'cruel', race: true, ...o });

test('flawless and comeback only look at the answers of the game that ended', () => {
  // A wrong answer from an earlier game doesn't spoil this one.
  let g = tallyGame(emptyStore(), result(), [answer(50, false), answer(120, true), answer(130, true)]).games;
  assert.equal(g.flawless, 1);
  g = tallyGame(emptyStore(), result(), [answer(120, true), answer(125, false, { depth: 3, run: 9 }), answer(130, false)]).games;
  assert.equal(g.flawless, 0);
  // A win without an answer of one's own isn't flawless; an older host (no start) gives neither.
  assert.equal(tallyGame(emptyStore(), result(), [answer(50, true)]).games.flawless, 0);
  assert.equal(tallyGame(emptyStore(), result({ since: null }), [answer(120, true)]).games.flawless, 0);

  // A race: down to −1, then up to the target.
  const race = result({ race: true });
  g = tallyGame(emptyStore(), race, [answer(110, false), answer(120, true), answer(130, true)]).games;
  assert.deepEqual([g.race, g.comeback, g.flawless], [1, 1, 0]);
  // Never below zero.
  g = tallyGame(emptyStore(), race, [answer(110, true), answer(120, false), answer(130, true)]).games;
  assert.equal(g.comeback, 0);
  // A turns game never comes back from below zero: its scores don't go down.
  assert.equal(tallyGame(emptyStore(), result(), [answer(110, false), answer(120, true)]).games.comeback, 0);
});

test('losses, crowds, deathmatches and the creator', () => {
  let g = tallyGame(emptyStore(), result({ won: false, players: 6 }), []).games;
  assert.deepEqual([g.played, g.won, g.crowd], [1, 0, 0]);
  g = tallyGame(emptyStore(), result({ players: 5, duel: true }), []).games;
  assert.deepEqual([g.won, g.crowd, g.duel], [1, 1, 1]);
  // A run together counts the creator's company and nothing else.
  g = tallyGame(emptyStore(), result({ delve: true, creator: true }), []).games;
  assert.deepEqual([g.played, g.won, g.creator], [0, 0, 1]);

  const { s } = setup(['Ash', 'zoe_arcana']);
  const over: GameState = { ...s, phase: 'over', winners: ['p1'] };
  assert.equal(gameEnded(s, over, 'p0', false)!.creator, true);
  assert.equal(gameEnded(s, over, 'p1', false)!.creator, false, 'not for the creator herself');
});

test('only the last games are remembered against counting one twice', () => {
  let st = emptyStore();
  for (let i = 1; i <= 30; i++) st = tallyGame(st, result({ id: i }), []);
  assert.equal(st.games.won, 30);
  assert.equal(st.counted.length, 20);
  assert.equal(st.counted[0], 11);
});

// ---- storage ----

test('a codex from before achievements earns quietly, and what comes after is announced', () => {
  const rings = items.filter((it) => it.category === 'Rings');
  store.set(storeKey('codex2'), JSON.stringify({ v: 1, ...codexOf([[rings[0].id, true]]) }));
  const first = checkAchievements(items);
  assert.deepEqual(first.earned.map((a) => a.id), ['discover-1']);
  assert.equal(first.first, true);
  assert.equal(typeof loadAchievements().earned['discover-1'], 'number');
  assert.deepEqual(checkAchievements(items), { earned: [], first: false });

  store.set(storeKey('codex2'), JSON.stringify({ v: 1, ...codexOf([[rings[0].id, true]], { best: 5 }) }));
  assert.deepEqual(
    checkAchievements(items).earned.map((a) => a.id),
    ['streak-5'],
  );
});

test('an achievement once earned stays earned', () => {
  store.set(storeKey('codex2'), JSON.stringify({ v: 1, ...codexOf([[items[0].id, true]]) }));
  checkAchievements(items);
  resetCodex();
  assert.deepEqual(checkAchievements(items), { earned: [], first: false });
  assert.ok(loadAchievements().earned['discover-1']);
});

test('erasing leaves an empty list, so the next achievement is announced', () => {
  store.set(storeKey('codex2'), JSON.stringify({ v: 1, ...codexOf([[items[0].id, true]]) }));
  checkAchievements(items);
  resetAchievements();
  assert.deepEqual(loadAchievements(), emptyStore());
  const after = checkAchievements(items);
  assert.deepEqual(after.earned.map((a) => a.id), ['discover-1']);
  assert.equal(after.first, false);
});

test('a list a newer build wrote is never written over; a damaged one is kept aside', () => {
  const newer = JSON.stringify({ v: ACHIEVEMENTS_VERSION + 1, earned: { 'discover-1': 1 }, shape: 'new' });
  store.set(ACHIEVEMENTS_KEY, newer);
  store.set(storeKey('codex2'), JSON.stringify({ v: 1, ...codexOf([[items[0].id, true]]) }));
  assert.deepEqual(checkAchievements(items), { earned: [], first: false });
  assert.equal(store.get(ACHIEVEMENTS_KEY), newer);

  store.set(ACHIEVEMENTS_KEY, '{broken');
  checkAchievements(items);
  assert.equal(store.get(storeKey('achievements.unread')), '{broken');
  assert.ok(loadAchievements().earned['discover-1']);
});

test('a stored list is cleaned up as it is read', () => {
  assert.equal(parseStore(null), null);
  assert.equal(parseStore('[]'), null);
  assert.equal(parseStore(JSON.stringify({ v: 99, earned: {} })), null);
  const s = parseStore(
    JSON.stringify({
      v: ACHIEVEMENTS_VERSION,
      earned: { 'win-1': 10, 'from-a-newer-build': 20, bad: 'x' },
      games: { won: 3.7, race: -2, played: 'many', extra: 5 },
      counted: [1, 'x', 2],
    }),
  )!;
  assert.deepEqual(s.earned, { 'win-1': 10, 'from-a-newer-build': 20 });
  assert.deepEqual(s.games, { ...emptyTally(), won: 3 });
  assert.deepEqual(s.counted, [1, 2]);
  assert.deepEqual(parseStore(serializeStore(s)), s);
});
