import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  HUNTS,
  HUNTS_VERSION,
  QUICK_DEFAULT,
  QUICK_TARGET,
  QUICK_TIMER,
  addHunt,
  emptyHunts,
  initiateFlag,
  initiatesKept,
  isNewcomer,
  loadHunts,
  newReveal,
  parseHunts,
  parseTally,
  tallyHunt,
  type HuntTally,
  recordHunt,
  resetHunts,
  serializeHunts,
  setQuickDifficulty,
  type HuntRun,
  type Hunts,
  type RevealSeen,
} from '../src/lib/hunt.ts';
import { storeKey } from '../src/lib/storage.ts';
import { Engine, createGame, publicView, type GameState, type Item, type Settings } from '../src/lib/game.ts';

const store = new Map<string, string>();
/** Storage that throws on every use (blocked by the browser). */
let blocked = false;
const guard = () => {
  if (blocked) throw new Error('SecurityError');
};
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => (guard(), store.get(k) ?? null),
  setItem: (k: string, v: string) => (guard(), void store.set(k, String(v))),
  removeItem: (k: string) => (guard(), void store.delete(k)),
  key: (i: number) => (guard(), [...store.keys()][i] ?? null),
  get length() {
    guard();
    return store.size;
  },
};
beforeEach(() => {
  store.clear();
  blocked = false;
});

const HUNTS_KEY = storeKey(HUNTS);
const run = (o: Partial<HuntRun> = {}): HuntRun => ({ difficulty: 'cruel', right: 5, asked: 7, game: 1, at: 100, ...o });

test('hunts are read back as they were written; anything odd is dropped', () => {
  const h: Hunts = { games: 3, best: { cruel: { right: 5, asked: 6 }, eternal: { right: 5, asked: 11 } }, last: 'eternal', lastAt: 1700, game: 42 };
  assert.deepEqual(parseHunts(serializeHunts(h)), h);
  assert.deepEqual(parseHunts(serializeHunts(emptyHunts())), emptyHunts());
  for (const junk of [null, '', 'not json', '[]', 'null', '42', '{"v":1,"games":', JSON.stringify({ games: 3, best: {} })])
    assert.equal(parseHunts(junk), null, String(junk));
  assert.equal(parseHunts(JSON.stringify({ ...h, v: HUNTS_VERSION + 1 })), null, 'a newer version');
  assert.equal(parseHunts(JSON.stringify({ ...h, v: 0 })), null, 'another version');
  const odd = parseHunts(
    JSON.stringify({
      v: HUNTS_VERSION,
      games: -2,
      best: {
        cruel: { right: 6, asked: 5 },
        merciless: { right: -1, asked: 4 },
        eternal: { right: 5, asked: 5.5 },
        custom: { right: 5, asked: 8 },
        nonsense: { right: 5, asked: 8 },
      },
      last: 'custom',
      lastAt: -5,
      game: 'x',
    }),
  );
  assert.deepEqual(odd, emptyHunts());
  const some = parseHunts(JSON.stringify({ v: HUNTS_VERSION, games: 1.5, best: { merciless: { right: 5, asked: 9 }, cruel: { right: 0, asked: 3 } }, last: 'merciless' }));
  assert.deepEqual(some, { games: 0, best: { merciless: { right: 5, asked: 9 } }, last: 'merciless' });
});

test('addHunt: the first hunt, a better one, a worse one, per difficulty, and the same game twice', () => {
  const a = addHunt(emptyHunts(), run({ asked: 8, game: 1, at: 10 }));
  assert.equal(a.first, true);
  assert.equal(a.best, true);
  assert.equal(a.previousBest, null);
  assert.deepEqual(a.hunts, { games: 1, best: { cruel: { right: 5, asked: 8 } }, last: 'cruel', lastAt: 10, game: 1 });

  const b = addHunt(a.hunts, run({ asked: 6, game: 2, at: 20 }));
  assert.equal(b.first, false);
  assert.equal(b.best, true, 'fewer questions');
  assert.deepEqual(b.previousBest, { right: 5, asked: 8 });
  assert.deepEqual(b.hunts.best.cruel, { right: 5, asked: 6 });
  assert.equal(b.hunts.games, 2);

  const c = addHunt(b.hunts, run({ asked: 9, game: 3 }));
  assert.equal(c.best, false, 'more questions');
  assert.deepEqual(c.previousBest, { right: 5, asked: 6 });
  assert.deepEqual(c.hunts.best.cruel, { right: 5, asked: 6 }, 'the best stays');
  const tie = addHunt(c.hunts, run({ asked: 6, game: 4 }));
  assert.equal(tie.best, false, 'as many questions is no better');

  const d = addHunt(tie.hunts, run({ difficulty: 'eternal', asked: 12, game: 5 }));
  assert.equal(d.best, true, 'the first on its difficulty');
  assert.equal(d.previousBest, null);
  assert.deepEqual(d.hunts.best, { cruel: { right: 5, asked: 6 }, eternal: { right: 5, asked: 12 } });
  assert.equal(d.hunts.last, 'eternal');
  assert.equal(d.hunts.games, 5);

  const again = addHunt(d.hunts, run({ difficulty: 'eternal', asked: 5, game: 5 }));
  assert.equal(again.hunts, d.hunts, 'the same game changes nothing');
  assert.equal(again.first, false);
  assert.equal(again.best, false);
});

test('a newcomer is a browser with nothing in its codex and no hunt recorded', () => {
  assert.equal(isNewcomer(), true, 'empty');
  store.set(storeKey('codex2'), JSON.stringify({ v: 1, items: {}, log: [] }));
  assert.equal(isNewcomer(), false, 'a codex');
  store.clear();
  store.set(storeKey('codex'), '{}');
  assert.equal(isNewcomer(), false, 'a codex under its old name');
  store.clear();
  store.set(HUNTS_KEY, serializeHunts({ ...emptyHunts(), games: 1 }));
  assert.equal(isNewcomer(), false, 'a hunt recorded');
  store.clear();
  setQuickDifficulty('merciless');
  assert.equal(loadHunts().last, 'merciless');
  assert.equal(isNewcomer(), true, 'a difficulty chosen is not a game played');
  store.clear();
  blocked = true;
  assert.equal(isNewcomer(), false, 'storage that cannot be read never counts as new');
});

test('a join from a browser that has never played carries the Initiate flag', () => {
  assert.deepEqual(initiateFlag(), { initiate: true });
  store.set(storeKey('codex2'), JSON.stringify({ v: 1, items: {}, log: [] }));
  assert.deepEqual(initiateFlag(), {}, 'no undefined key either');
  store.clear();
  blocked = true;
  assert.deepEqual(initiateFlag(), {});
});

test('recordHunt stores through localStorage, once per game', () => {
  const first = recordHunt(run({ asked: 7, game: 1 }))!;
  assert.equal(first.first, true);
  assert.deepEqual(loadHunts(), first.hunts);
  assert.ok(store.has(HUNTS_KEY));
  const again = recordHunt(run({ asked: 7, game: 1 }))!;
  assert.equal(again.first, false);
  assert.equal(loadHunts().games, 1, 'the same game counted once');
  const next = recordHunt(run({ asked: 6, game: 2 }))!;
  assert.equal(next.best, true);
  assert.equal(loadHunts().games, 2);

  setQuickDifficulty('eternal');
  assert.deepEqual(loadHunts(), { ...next.hunts, last: 'eternal' }, 'the choice joins the record');

  blocked = true;
  assert.equal(recordHunt(run({ game: 3 })), null, 'blocked storage records nothing');
  setQuickDifficulty('cruel');
  assert.deepEqual(loadHunts(), emptyHunts());
});

test('recordHunt never writes over a newer build\'s record, and keeps an unreadable one aside', () => {
  const newer = JSON.stringify({ v: HUNTS_VERSION + 1, games: 9, shape: 'unknown' });
  store.set(HUNTS_KEY, newer);
  assert.deepEqual(loadHunts(), emptyHunts(), 'read as nothing');
  assert.equal(recordHunt(run()), null, 'not stored');
  setQuickDifficulty('eternal');
  assert.equal(store.get(HUNTS_KEY), newer, 'untouched');
  assert.equal([...store.keys()].some((k) => k.includes('.unread')), false, 'never kept aside: it is whole');

  store.clear();
  store.set(HUNTS_KEY, '{"v":1,"games":');
  const r = recordHunt(run({ asked: 9 }))!;
  assert.equal(r.first, true);
  const aside = [...store.keys()].filter((k) => k.includes('.unread'));
  assert.deepEqual(aside, [`${HUNTS_KEY}.unread`]);
  assert.equal(store.get(aside[0]), '{"v":1,"games":', 'kept as it was');
  assert.deepEqual(loadHunts().best.cruel, { right: 5, asked: 9 });
});

test('resetHunts forgets every hunt, and what was kept aside (the Codex\'s erase)', () => {
  recordHunt(run());
  store.set(`${HUNTS_KEY}.unread`, '{"v":1,"games":');
  store.set(storeKey('name'), 'Ash');
  assert.equal(isNewcomer(), false);
  resetHunts();
  assert.deepEqual([...store.keys()], [storeKey('name')], 'only the hunts are gone');
  assert.deepEqual(loadHunts(), emptyHunts());
  assert.equal(isNewcomer(), true, 'a new browser again, once the codex is erased too');
  blocked = true;
  assert.doesNotThrow(() => resetHunts());
});

test('initiatesKept: a host remembers Initiates seated with grace and watching, and forgets them once graduated', () => {
  const s = (players: { id: string; grace?: number }[], spectators: { id: string; initiate?: true }[] = []) =>
    ({ players: players.map((p) => ({ ...p, name: p.id, score: 0, recent: [], connected: true, hue: 0 })), spectators: spectators.map((o) => ({ ...o, name: o.id })) }) as unknown as GameState;
  const none: string[] = [];
  assert.equal(initiatesKept(none, s([{ id: 'host' }, { id: 'vet' }])), none, 'nothing to remember: the same array');
  const a = initiatesKept(none, s([{ id: 'host' }, { id: 'bea', grace: 3 }], [{ id: 'cyd', initiate: true }, { id: 'dan' }]));
  assert.deepEqual(a, ['bea', 'cyd']);
  // Bea dropped from the lobby, Cyd's link blipped (the host lets go of both): still remembered.
  const b = initiatesKept(a, s([{ id: 'host' }]));
  assert.equal(b, a, 'unchanged');
  // Back, and Bea spends her grace: 2 and 1 keep her; 0 (graduated) forgets her.
  assert.equal(initiatesKept(b, s([{ id: 'bea', grace: 1 }])), b);
  assert.deepEqual(initiatesKept(b, s([{ id: 'bea', grace: 0 }], [{ id: 'cyd', initiate: true }])), ['cyd']);
  assert.deepEqual(initiatesKept(b, s([{ id: 'bea' }, { id: 'cyd', grace: 3 }])), ['cyd']);
  // A long-lived room keeps the latest ones.
  const many = Array.from({ length: 400 }, (_, i) => `p${i}`);
  const more = initiatesKept(many, s([{ id: 'new', grace: 3 }]));
  assert.equal(more.length, 400);
  assert.deepEqual([more[0], more.at(-1)], ['p1', 'new']);
});

test('a quick hunt starts from a hot-seat lobby in one go, and its questions are its turns', () => {
  const items: Item[] = JSON.parse(readFileSync(new URL('../src/data/items.json', import.meta.url), 'utf8'));
  let seed = 7;
  const engine = new Engine(items, { rng: () => ((seed = (seed * 1664525 + 1013904223) >>> 0), seed / 2 ** 32), now: () => 1000 });
  // As Session.startHunt does it, all from this device (from = null).
  let s: GameState = createGame(null);
  s = engine.apply(s, { type: 'settings', settings: { mode: 'turns', targetScore: QUICK_TARGET, difficulty: QUICK_DEFAULT, timer: QUICK_TIMER } }, null);
  s = engine.apply(s, { type: 'join', playerId: 'me', name: 'Exile' }, null);
  s = engine.apply(s, { type: 'start' }, null);
  assert.equal(s.phase, 'choosing');
  assert.deepEqual([s.settings.mode, s.settings.targetScore, s.settings.difficulty, s.settings.timer], ['turns', 5, 'cruel', 16]);
  assert.deepEqual(s.players.map((p) => p.name), ['Exile']);
  let asked = 0;
  while (s.phase !== 'over') {
    s = engine.apply(s, { type: 'pick', category: s.offered[0] }, null);
    const q = s.question!;
    asked++;
    // Every third answer is wrong.
    const index = asked % 3 === 0 ? q.options.findIndex((o) => o !== q.itemId) : q.options.indexOf(q.itemId);
    s = engine.apply(s, { type: 'answer', index, askedAt: q.askedAt }, null);
    s = engine.apply(s, { type: 'next' }, null);
  }
  assert.equal(s.players[0].score, QUICK_TARGET);
  assert.equal(asked, 7);
  assert.equal(s.turnCount + 1, asked, 'what Session.noteHunt counts');
  assert.ok(s.startedAt, 'still known at the end');
});

test('newReveal: each turns reveal once, as it begins; none for a race, a Delve run or a reload into one', () => {
  const items: Item[] = JSON.parse(readFileSync(new URL('../src/data/items.json', import.meta.url), 'utf8'));
  let seed = 5;
  let clock = 1000;
  const engine = new Engine(items, { rng: () => ((seed = (seed * 1664525 + 1013904223) >>> 0), seed / 2 ** 32), now: () => (clock += 10) });
  const begin = (settings: Partial<Settings>, names = ['Ash', 'Bo']) => {
    let s: GameState = createGame('p0', { targetScore: 3, timer: 0, difficulty: 'cruel', public: false, locked: false, ...settings });
    names.forEach((name, i) => (s = engine.apply(s, { type: 'join', playerId: `p${i}`, name }, `p${i}`)));
    return engine.apply(s, { type: 'start' }, 'p0');
  };

  // Turns: followed state by state, as a device sees them.
  let s = begin({});
  let prev: GameState | null = null;
  const seen: RevealSeen[] = [];
  const see = (next: GameState) => {
    const r = newReveal(prev, next);
    if (r) seen.push(r);
    prev = next;
    return r;
  };
  see(s);
  const expected: RevealSeen[] = [];
  for (let n = 0; n < 4; n++) {
    const by = s.players[s.turn].id;
    assert.equal(see((s = engine.apply(s, { type: 'pick', category: s.offered[0] }, by))), null, 'no reveal while choosing or asking');
    const q = s.question!;
    // Right, wrong, right, wrong.
    const index = n % 2 ? q.options.findIndex((o) => o !== q.itemId) : q.options.indexOf(q.itemId);
    const r = see((s = engine.apply(s, { type: 'answer', index, askedAt: q.askedAt }, by)));
    expected.push({ at: q.askedAt, id: q.itemId, ok: n % 2 === 0, by });
    assert.deepEqual(r, expected[n]);
    // The same reveal again (someone joining, a guest's resent state): not a new one.
    assert.equal(see({ ...s, version: s.version + 1 }), null);
    assert.equal(see(publicView(s)), null, 'nor as a guest gets it');
    see((s = engine.apply(s, { type: 'next' }, by)));
  }
  assert.deepEqual(seen, expected);
  assert.deepEqual(new Set(seen.map((r) => r.by)), new Set(['p0', 'p1']), 'each player answering in turn');
  // A guest's copy says the same as the host's.
  const asked = engine.apply(s, { type: 'pick', category: s.offered[0] }, s.players[s.turn].id);
  const shown = engine.apply(asked, { type: 'answer', index: 0, askedAt: asked.question!.askedAt }, asked.players[asked.turn].id);
  assert.deepEqual(newReveal(publicView(asked), publicView(shown)), newReveal(asked, shown));
  // A reload into a reveal has no state before it: seen before the reload, if at all.
  assert.equal(newReveal(null, shown), null);

  // A race: none.
  let race = begin({ mode: 'race' });
  const rq = race.question!;
  const before = race;
  race = engine.apply(race, { type: 'answer', index: rq.options.indexOf(rq.itemId), askedAt: rq.askedAt }, 'p1');
  assert.equal(race.phase, 'reveal');
  assert.equal(newReveal(before, race), null);

  // A Delve run: none.
  let run = begin({ mode: 'delve' }, ['Ash']);
  run = structuredClone(run);
  run.delve!.finds = [];
  run = engine.apply(run, { type: 'pick', category: run.offered[0] }, 'p0');
  run = engine.apply(run, { type: 'clock', askedAt: run.question!.askedAt }, null);
  const dq = run.question!;
  const asking = run;
  run = engine.apply(run, { type: 'answer', index: dq.options.indexOf(dq.itemId), askedAt: dq.askedAt }, 'p0');
  assert.equal(run.phase, 'reveal');
  assert.equal(newReveal(asking, run), null);
});

test('tallyHunt: each reveal of a turns game once, in order, with each player\'s count and best run', () => {
  const items: Item[] = JSON.parse(readFileSync(new URL('../src/data/items.json', import.meta.url), 'utf8'));
  let seed = 11;
  let clock = 1000;
  const engine = new Engine(items, { rng: () => ((seed = (seed * 1664525 + 1013904223) >>> 0), seed / 2 ** 32), now: () => (clock += 10) });
  let s: GameState = createGame('p0', { targetScore: 4, timer: 0, difficulty: 'cruel', public: false, locked: false });
  for (const [i, name] of ['Ash', 'Bo'].entries()) s = engine.apply(s, { type: 'join', playerId: `p${i}`, name }, `p${i}`);
  // Seen in the lobby: nothing to tally yet.
  assert.equal(tallyHunt(null, null, s, false), null);
  s = engine.apply(s, { type: 'start' }, 'p0');

  let t: HuntTally | null = null;
  let prev: GameState | null = null;
  const see = (next: GameState, fresh = false) => {
    t = tallyHunt(t, prev, next, fresh);
    prev = next;
  };
  see(s);
  assert.deepEqual(t, { game: s.startedAt, seen: [], players: {} }, 'a new tally as the game starts');
  const expected: { at: number; id: string; by: string; ok: boolean; fresh: boolean }[] = [];
  const counts: Record<string, { right: number; asked: number; peak: number; run: number }> = {};
  let n = 0;
  while (s.phase !== 'over') {
    const by = s.players[s.turn].id;
    see((s = engine.apply(s, { type: 'pick', category: s.offered[0] }, by)));
    const q = s.question!;
    // Ash: right, right, wrong, then right; Bo: wrong and right in turn.
    const k = counts[by]?.asked ?? 0;
    const ok = by === 'p0' ? k !== 2 : k % 2 === 1;
    const index = ok ? q.options.indexOf(q.itemId) : q.options.findIndex((o) => o !== q.itemId);
    const fresh = n % 3 === 0;
    see((s = engine.apply(s, { type: 'answer', index, askedAt: q.askedAt }, by)), fresh);
    expected.push({ at: q.askedAt, id: q.itemId, by, ok, fresh });
    const c = (counts[by] ??= { right: 0, asked: 0, peak: 0, run: 0 });
    c.asked++;
    c.right += +ok;
    c.run = ok ? c.run + 1 : 0;
    c.peak = Math.max(c.peak, c.run);
    // The same reveal again (a guest joining, the room going public): counted once.
    const before = t;
    see({ ...s, version: s.version + 1 });
    assert.equal(t, before, 'unchanged, the same tally');
    see(publicView(s));
    assert.equal(t, before, 'nor as a guest gets it');
    see((s = engine.apply(s, { type: 'next' }, 'p0')));
    n++;
  }
  const tally = t as HuntTally | null;
  assert.ok(tally);
  assert.deepEqual(tally.seen, expected, 'every reveal, in order, with who answered and how');
  for (const [id, c] of Object.entries(counts)) {
    assert.deepEqual(tally.players[id], { right: c.right, asked: c.asked, peak: c.peak }, id);
    assert.equal(tally.players[id].right, s.players.find((p) => p.id === id)!.score, `${id}: the right answers are the score`);
  }
  assert.deepEqual([counts.p0.peak, counts.p1.peak], [2, 1], 'runs of their own');
  // Seen over: the same tally stays.
  const over = tally;
  see(s);
  assert.equal(t, over);
  assert.deepEqual(parseTally(JSON.stringify(over)), over, 'kept as it was through session storage');

  // Play again: a fresh tally for the new game.
  see((s = engine.apply(s, { type: 'restart', play: true }, 'p0')));
  const again = t as HuntTally | null;
  assert.ok(again && s.startedAt);
  assert.notEqual(again.game, over.game);
  assert.deepEqual(again, { game: s.startedAt, seen: [], players: {} });
  // Back to the lobby: none.
  see((s = engine.apply(s, { type: 'restart', play: false }, 'p0')));
  assert.equal(t, null);
});

test('tallyHunt: alone, the questions asked are the turns gone by (Session.noteHunt)', () => {
  const items: Item[] = JSON.parse(readFileSync(new URL('../src/data/items.json', import.meta.url), 'utf8'));
  let seed = 3;
  let clock = 1000;
  const engine = new Engine(items, { rng: () => ((seed = (seed * 1664525 + 1013904223) >>> 0), seed / 2 ** 32), now: () => (clock += 10) });
  let s: GameState = createGame(null);
  s = engine.apply(s, { type: 'settings', settings: { mode: 'turns', targetScore: QUICK_TARGET, difficulty: QUICK_DEFAULT, timer: QUICK_TIMER } }, null);
  s = engine.apply(s, { type: 'join', playerId: 'me', name: 'Exile' }, null);
  s = engine.apply(s, { type: 'start' }, null);
  let t: HuntTally | null = tallyHunt(null, null, s, false);
  let n = 0;
  while (s.phase !== 'over') {
    let next = engine.apply(s, { type: 'pick', category: s.offered[0] }, null);
    t = tallyHunt(t, s, next, false);
    s = next;
    const q = s.question!;
    next = engine.apply(s, { type: 'answer', index: n++ % 4 === 1 ? q.options.findIndex((o) => o !== q.itemId) : q.options.indexOf(q.itemId), askedAt: q.askedAt }, null);
    t = tallyHunt(t, s, next, true);
    s = next;
    next = engine.apply(s, { type: 'next' }, null);
    t = tallyHunt(t, s, next, false);
    s = next;
  }
  assert.deepEqual(t!.players.me, { right: QUICK_TARGET, asked: s.turnCount + 1, peak: 3 });
  assert.equal(t!.seen.filter((x) => x.fresh).length, s.turnCount + 1);
});

test('tallyHunt: a race and a Delve run have none', () => {
  const items: Item[] = JSON.parse(readFileSync(new URL('../src/data/items.json', import.meta.url), 'utf8'));
  let seed = 9;
  let clock = 1000;
  const engine = new Engine(items, { rng: () => ((seed = (seed * 1664525 + 1013904223) >>> 0), seed / 2 ** 32), now: () => (clock += 10) });
  const begin = (settings: Partial<Settings>, names: string[]) => {
    let s: GameState = createGame('p0', { targetScore: 3, timer: 0, difficulty: 'cruel', public: false, locked: false, ...settings });
    names.forEach((name, i) => (s = engine.apply(s, { type: 'join', playerId: `p${i}`, name }, `p${i}`)));
    return engine.apply(s, { type: 'start' }, 'p0');
  };
  const race = begin({ mode: 'race' }, ['Ash', 'Bo']);
  const rq = race.question!;
  const raced = engine.apply(race, { type: 'answer', index: rq.options.indexOf(rq.itemId), askedAt: rq.askedAt }, 'p1');
  assert.equal(raced.phase, 'reveal');
  assert.equal(tallyHunt(null, null, race, false), null);
  assert.equal(tallyHunt({ game: race.startedAt!, seen: [], players: {} }, race, raced, true), null);

  let run = structuredClone(begin({ mode: 'delve' }, ['Ash']));
  run.delve!.finds = [];
  run = engine.apply(run, { type: 'pick', category: run.offered[0] }, 'p0');
  run = engine.apply(run, { type: 'clock', askedAt: run.question!.askedAt }, null);
  const dq = run.question!;
  const fell = engine.apply(run, { type: 'answer', index: dq.options.indexOf(dq.itemId), askedAt: dq.askedAt }, 'p0');
  assert.equal(fell.phase, 'reveal');
  assert.equal(tallyHunt(null, run, fell, true), null);
});

test('parseTally: a kept tally comes back as it was; junk is nothing, and anything odd inside is dropped', () => {
  const t: HuntTally = {
    game: 1700,
    seen: [
      { at: 1710, id: 'abc', by: 'p0', ok: true, fresh: true },
      { at: 1720, id: 'def', by: 'p1', ok: false, fresh: false },
    ],
    players: { p0: { right: 1, asked: 1, peak: 1 }, p1: { right: 0, asked: 1, peak: 0 } },
    earned: ['prima-materia'],
    known: 40,
    result: { first: false, best: true, previousBest: { right: 5, asked: 8 }, right: 5, asked: 6 },
  };
  assert.deepEqual(parseTally(JSON.stringify(t)), t);
  const firstHunt = { ...t, result: { first: true, best: true, previousBest: null, right: 5, asked: 7 } };
  assert.deepEqual(parseTally(JSON.stringify(firstHunt)), firstHunt, 'no best before it');
  for (const result of [{ ...t.result, first: 'yes' }, { ...t.result, previousBest: { right: -1, asked: 2 } }, { ...t.result, asked: 2.5 }, { first: true, best: true, right: 5, asked: 5 }])
    assert.equal(parseTally(JSON.stringify({ ...t, result }))?.result, undefined, JSON.stringify(result));
  const { earned: _, result: __, known: ___, ...plain } = t;
  assert.deepEqual(parseTally(JSON.stringify(plain)), plain, 'no earned list until it was read');
  for (const junk of [null, '', 'not json', '[]', 'null', '42', '{"game":', JSON.stringify({ seen: [], players: {} }), JSON.stringify({ game: 'x', seen: [], players: {} }), JSON.stringify({ game: 0, seen: [], players: {} }), JSON.stringify({ game: 5, seen: {}, players: {} }), JSON.stringify({ game: 5, seen: [], players: [] })])
    assert.equal(parseTally(junk), null, String(junk));
  const odd = parseTally(
    JSON.stringify({
      game: 5,
      seen: [{ at: 6, id: 'abc', by: 'p0', ok: true, fresh: false }, { at: -1, id: 'x', by: 'p0', ok: true, fresh: false }, { at: 7, id: '', by: 'p0', ok: true, fresh: false }, { at: 8, id: 'y', by: 'p0', ok: 'yes', fresh: false }, 'nonsense'],
      players: { p0: { right: 1, asked: 1, peak: 1 }, p1: { right: 2, asked: 1, peak: 0 }, p2: { right: -1, asked: 1, peak: 0 }, p3: { right: 1, asked: 1.5, peak: 0 } },
      earned: ['a', 7, ''],
      known: -3,
    }),
  );
  assert.deepEqual(odd, { game: 5, seen: [{ at: 6, id: 'abc', by: 'p0', ok: true, fresh: false }], players: { p0: { right: 1, asked: 1, peak: 1 } }, earned: ['a'] });
});
