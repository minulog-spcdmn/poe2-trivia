import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Engine, createGame, isFake, publicView, type GameMode, type GameState, type Item, type Question } from '../src/lib/game.ts';
import {
  CODEX_KEY,
  LOG_LIMIT,
  RECENT,
  emptyCodex,
  encounterAt,
  loadCodex,
  parseCodex,
  record,
  recordEncounter,
  loadPractice,
  recordPractice,
  resetCodex,
  serializeCodex,
  type Codex,
  type Encounter,
} from '../src/lib/codex.ts';
import { codexStats, median } from '../src/lib/codexStats.ts';
import { storeKey } from '../src/lib/storage.ts';

const items: Item[] = JSON.parse(readFileSync(new URL('../src/data/items.json', import.meta.url), 'utf8'));
const fakes: Record<string, string[]> = JSON.parse(readFileSync(new URL('../src/data/fakes.json', import.meta.url), 'utf8'));
const categories = [...new Set(items.map((it) => it.category))].sort();

const store = new Map<string, string>();
let full = false;
/** A key no write to fits (storage too full for it). */
let refuse: string | null = null;
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => {
    if ((full && v.length > 2000) || k === refuse) throw new Error('QuotaExceededError');
    store.set(k, String(v));
  },
  removeItem: (k: string) => void store.delete(k),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() {
    return store.size;
  },
};
beforeEach(() => {
  store.clear();
  full = false;
  refuse = null;
});

const right = (q: Question) => q.options.indexOf(q.itemId);
const wrongIdx = (q: Question) => q.options.findIndex((o) => o !== q.itemId && !isFake(o));

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

function setup(names: string[], mode: GameMode = 'turns') {
  const engine = new Engine(items, { rng: seeded(7), fakes });
  let s: GameState = createGame('p0', { targetScore: 50, timer: 0, difficulty: 'cruel', mode });
  names.forEach((name, i) => (s = engine.apply(s, { type: 'join', playerId: `p${i}`, name }, `p${i}`)));
  return { engine, s: engine.apply(s, { type: 'start' }, 'p0') };
}

/** Turns mode: the active player picks a category and answers. */
function turn(engine: Engine, s: GameState, answer: (q: Question) => number | null) {
  const who = s.players[s.turn].id;
  s = engine.apply(s, { type: 'pick', category: s.offered[0] }, who);
  return engine.apply(s, { type: 'answer', index: answer(s.question!) }, who);
}

test('turns mode: your own answer counts, watching someone else only adds "seen"', () => {
  let { engine, s } = setup(['Ash', 'Bram']);
  // Seats are shuffled at the start.
  const first = s.players[s.turn].id;
  const second = s.players[1 - s.turn].id;
  s = turn(engine, s, right);
  const q = s.question!;
  const mine = encounterAt(s, first, false, 1234)!;
  assert.deepEqual(mine, {
    at: q.askedAt,
    itemId: q.itemId,
    mode: q.mode,
    difficulty: 'cruel',
    race: false,
    answer: { ok: true, pickedId: q.itemId, pickedLabel: q.labels[right(q)], ms: 1234 },
  });
  // The other player saw it, and guests only get the public copy.
  const theirs = encounterAt(publicView(s), second, false)!;
  assert.equal(theirs.itemId, q.itemId);
  assert.equal(theirs.answer, undefined);

  s = engine.apply(s, { type: 'next' }, first);
  s = turn(engine, s, wrongIdx);
  const q2 = s.question!;
  const wrong = encounterAt(publicView(s), second, false, 900)!;
  assert.equal(wrong.answer!.ok, false);
  assert.equal(wrong.answer!.pickedId, q2.options[wrongIdx(q2)], 'the guest learns what they picked');
  assert.equal(wrong.answer!.ms, undefined, 'only right answers keep a time');
});

test('running out of time on your turn counts as wrong', () => {
  let { engine, s } = setup(['Ash']);
  s = turn(engine, s, () => null);
  const e = encounterAt(s, 'p0', false)!;
  assert.deepEqual(e.answer, { ok: false, pickedId: null, pickedLabel: null });
});

test('nothing to record outside a reveal', () => {
  let { engine, s } = setup(['Ash']);
  assert.equal(encounterAt(s, 'p0', false), null);
  s = engine.apply(s, { type: 'pick', category: s.offered[0] }, 'p0');
  assert.equal(encounterAt(s, 'p0', false), null);
});

test('hot-seat: answers only count when one person plays alone', () => {
  let solo = setup(['Ash']);
  let s = turn(solo.engine, solo.s, right);
  assert.equal(encounterAt(s, null, true)!.answer!.ok, true);

  const duo = setup(['Ash', 'Bram']);
  s = turn(duo.engine, duo.s, right);
  const e = encounterAt(s, null, true)!;
  assert.equal(e.itemId, s.question!.itemId);
  assert.equal(e.answer, undefined);
});

test('race mode: the winner and those who missed answered, the rest only saw it', () => {
  let { engine, s } = setup(['Ash', 'Bram', 'Cora'], 'race');
  const q = s.question!;
  s = engine.apply(s, { type: 'answer', index: wrongIdx(q), askedAt: q.askedAt }, 'p1');
  s = engine.apply(s, { type: 'answer', index: right(q), askedAt: q.askedAt }, 'p2');
  const view = publicView(s);
  assert.equal(encounterAt(view, 'p2', false)!.answer!.ok, true);
  const missed = encounterAt(view, 'p1', false)!;
  assert.equal(missed.race, true);
  assert.deepEqual([missed.answer!.ok, missed.answer!.pickedId], [false, q.options[wrongIdx(q)]]);
  assert.equal(encounterAt(view, 'p0', false)!.answer, undefined);
  assert.equal(encounterAt(view, 'spectator', false)!.answer, undefined);
});

const enc = (at: number, itemId: string, answer?: Encounter['answer'], mode: 'name' | 'art' = 'name'): Encounter => ({
  at,
  itemId,
  mode,
  difficulty: 'merciless',
  race: false,
  ...(answer ? { answer } : {}),
});
const ok = (ms?: number) => ({ ok: true, pickedId: null, pickedLabel: null, ...(ms ? { ms } : {}) });
const miss = (pickedId: string | null, pickedLabel: string | null = null) => ({ ok: false, pickedId, pickedLabel });
const [a, b, c] = items;

test('records encounters, answers, streaks and confusions', () => {
  let x = emptyCodex();
  x = record(x, enc(1, a.id));
  assert.deepEqual(x.items[a.id], { seen: 1, first: 1, last: 1, name: { n: 0, ok: 0 }, art: { n: 0, ok: 0 }, mixed: {} });
  assert.equal(x.log.length, 0, 'watching is not an answer');

  x = record(x, enc(2, a.id, ok(1500)));
  x = record(x, enc(3, b.id, ok(900), 'art'));
  x = record(x, enc(4, a.id, miss(c.id)));
  x = record(x, enc(5, a.id, miss(c.id)));
  x = record(x, enc(6, c.id, ok(2000)));
  assert.deepEqual(x.items[a.id], { seen: 4, first: 1, last: 5, name: { n: 3, ok: 1 }, art: { n: 0, ok: 0 }, mixed: { [c.id]: 2 } });
  assert.deepEqual(x.items[b.id].art, { n: 1, ok: 1 });
  assert.deepEqual([x.streak, x.best], [1, 2]);
  assert.deepEqual(x.fastest, { ms: 900, id: b.id });
  assert.deepEqual(x.byDifficulty, { merciless: { n: 5, ok: 3 } });
  assert.deepEqual(
    x.log.map((l) => [l.t, l.ok, l.ms]),
    [
      [2, true, 1500],
      [3, true, 900],
      [4, false, undefined],
      [5, false, undefined],
      [6, true, 2000],
    ],
  );
});

test('a mix-up reads "the art of one taken for the other\'s name" both ways', () => {
  // Name question: a's art shown, b's name picked, so a's art was taken for b.
  let x = record(emptyCodex(), enc(1, a.id, miss(b.id)));
  assert.deepEqual(x.items[a.id].mixed, { [b.id]: 1 });
  assert.equal(x.items[b.id], undefined, 'a name picked is not an item seen');
  // Find the art: a's name shown, c's art picked, so c's art was taken for a.
  x = record(x, enc(2, a.id, miss(c.id), 'art'));
  assert.deepEqual(x.items[a.id].mixed, { [b.id]: 1 });
  assert.deepEqual(x.items[c.id], { seen: 1, first: 2, last: 2, name: { n: 0, ok: 0 }, art: { n: 0, ok: 0 }, mixed: { [a.id]: 1 } });
  // Again, with c already seen: one more sighting and one more mix-up.
  x = record(x, enc(3, a.id, miss(c.id), 'art'));
  assert.deepEqual([x.items[c.id].seen, x.items[c.id].last, x.items[c.id].mixed], [2, 3, { [a.id]: 2 }]);
  assert.deepEqual(
    codexStats(x, items, categories).confusions.map((cf) => [cf.answer.id, cf.picked.id, cf.n]),
    [
      [c.id, a.id, 2],
      [a.id, b.id, 1],
    ],
  );
});

test('the same question is only recorded once', () => {
  const once = record(emptyCodex(), enc(10, a.id, ok()));
  assert.equal(record(once, enc(10, a.id, ok())), once);
  assert.equal(record(once, enc(11, a.id)).items[a.id].seen, 2);
});

test('made-up names you fell for are kept by name', () => {
  let x = record(emptyCodex(), enc(1, a.id, miss(`fake:${b.id}:0`, 'Bogus Name')));
  x = record(x, enc(2, a.id, miss(`fake:${b.id}:0`, 'Bogus Name')));
  assert.deepEqual(x.fooled, { 'Bogus Name': { of: b.id, n: 2, last: 2 } });
  assert.deepEqual(x.items[a.id].mixed, {}, 'a made-up name is not a real item mixed up');
});

test('a timed-out turn breaks the streak without a confusion', () => {
  let x = record(emptyCodex(), enc(1, a.id, ok()));
  x = record(x, enc(2, b.id, miss(null)));
  assert.equal(x.streak, 0);
  assert.equal(x.best, 1);
  assert.deepEqual(x.items[b.id].name, { n: 1, ok: 0 });
});

test('the log keeps only the latest answers', () => {
  let x = emptyCodex();
  for (let i = 0; i < LOG_LIMIT + 5; i++) x = record(x, enc(i + 1, items[i % items.length].id, ok()));
  assert.equal(x.log.length, LOG_LIMIT);
  assert.equal(x.log[0].t, 6);
  assert.equal(x.best, LOG_LIMIT + 5, 'lifetime numbers are not capped');
});

test('stored codex round-trips and malformed entries are dropped', () => {
  let x = record(emptyCodex(), enc(1, a.id, miss(b.id)));
  x = record(x, enc(2, b.id, ok(700), 'art'));
  x = record(x, enc(3, c.id, miss(`fake:${a.id}:1`, 'Fake')));
  assert.deepEqual(parseCodex(serializeCodex(x)), x);

  for (const bad of [null, '', 'nope', '[]', '{}', JSON.stringify({ v: 999, items: {} }), JSON.stringify({ v: 1, items: [] })])
    assert.equal(parseCodex(bad), null, String(bad));

  const messy = parseCodex(
    JSON.stringify({
      v: 1,
      items: { [a.id]: { seen: 2, first: 1, last: 2, name: { n: 2, ok: 9 }, art: 'x', mixed: { [b.id]: -1, [c.id]: 2 } }, broken: 5 },
      log: [{ t: 1, id: a.id, mode: 'name', ok: true, difficulty: 'toString', ms: -4 }, { t: 2, id: a.id, mode: 'chaos', ok: true }, 'junk'],
      byDifficulty: { eternal: { n: 3, ok: 1 }, hard: { n: 1, ok: 1 } },
      fooled: { Fake: { of: a.id, n: 0 }, Real: { of: a.id, n: 1, last: 3 } },
      streak: 4,
      best: 2,
      fastest: { ms: 'quick', id: a.id },
    }),
  )!;
  assert.deepEqual(messy.items[a.id], { seen: 2, first: 1, last: 2, name: { n: 2, ok: 2 }, art: { n: 0, ok: 0 }, mixed: { [c.id]: 2 } });
  assert.equal(messy.items.broken, undefined);
  assert.deepEqual(messy.log, [{ t: 1, id: a.id, mode: 'name', ok: true, difficulty: 'merciless', race: false }]);
  assert.deepEqual(messy.byDifficulty, { eternal: { n: 3, ok: 1 } });
  assert.deepEqual(Object.keys(messy.fooled), ['Real']);
  assert.deepEqual([messy.streak, messy.best, messy.fastest], [4, 4, null]);
});

test('storage: records, reloads, resets, and makes room when full', () => {
  assert.deepEqual(loadCodex(), emptyCodex());
  recordEncounter(enc(1, a.id, ok()));
  recordEncounter(enc(1, a.id, ok()));
  assert.equal(loadCodex().items[a.id].seen, 1);
  store.set(CODEX_KEY, 'garbage');
  assert.deepEqual(loadCodex(), emptyCodex());

  let x: Codex = emptyCodex();
  for (let i = 0; i < 100; i++) x = record(x, enc(i + 1, items[i].id, ok()));
  store.set(CODEX_KEY, serializeCodex(x));
  full = true;
  recordEncounter(enc(500, a.id, ok()));
  // Too big even with an empty log: nothing stored, nothing thrown, the old entry kept.
  assert.equal(loadCodex().log.length, 100);

  full = false;
  resetCodex();
  assert.deepEqual(loadCodex(), emptyCodex());
  assert.equal(store.get(CODEX_KEY), serializeCodex(emptyCodex()), 'an empty codex in its place');
});

test('median', () => {
  assert.equal(median([]), null);
  assert.equal(median([5]), 5);
  assert.equal(median([9, 1, 5]), 5);
  assert.equal(median([4, 1, 3, 2]), 2.5);
});

test('stats: completion, categories, nemeses and confusions', () => {
  const ring = items.filter((it) => it.category === 'Rings');
  let x = emptyCodex();
  let t = 0;
  const say = (it: Item, answer?: Encounter['answer']) => (x = record(x, enc(++t, it.id, answer)));
  say(ring[0], ok(1000));
  say(ring[0], ok(3000));
  say(ring[0], miss(ring[1].id));
  say(ring[1], miss(ring[0].id));
  say(ring[1], miss(ring[0].id));
  say(ring[1], miss(ring[2].id));
  say(ring[2]);
  // Something the game no longer has is left out.
  x = record(x, enc(++t, 'gone', ok()));

  const st = codexStats(x, items, categories, 3);
  assert.equal(st.total, items.length);
  assert.equal(st.seen, 3);
  assert.deepEqual([st.n, st.ok], [6, 2]);
  assert.deepEqual(st.recent, { n: 7, ok: 3 }, 'the log still has the removed item');
  assert.equal(st.medianMs, 2000, 'the right answers with a time: 1000 and 3000');
  assert.deepEqual(st.fastest, { ms: 1000, item: ring[0] });
  const rings = st.categories.find((cs) => cs.category === 'Rings')!;
  assert.deepEqual([rings.total, rings.seen, rings.n, rings.ok], [ring.length, 3, 6, 2]);
  assert.deepEqual(rings.groups.map((g) => g.group), ['Rings']);
  assert.equal(st.categories.length, categories.length);
  assert.equal(
    st.categories.reduce((n, cs) => n + cs.total, 0),
    items.length,
  );
  assert.deepEqual(
    st.nemeses.map((nm) => [nm.item.id, nm.tally.n, nm.tally.ok]),
    [
      [ring[1].id, 3, 0],
      [ring[0].id, 3, 2],
    ],
  );
  assert.deepEqual(
    st.confusions.map((cf) => [cf.answer.id, cf.picked.id, cf.n]),
    [
      [ring[1].id, ring[0].id, 2],
      ...[
        [ring[0].id, ring[1].id, 1],
        [ring[1].id, ring[2].id, 1],
      ].sort((p, q) => items.find((it) => it.id === p[0])!.name.localeCompare(items.find((it) => it.id === q[0])!.name)),
    ],
  );
  assert.equal(RECENT, 100);
});

test('Delve answers are filed under the preset their depth plays like', () => {
  let { engine, s } = setup(['Ash'], 'delve');
  s = { ...s, round: 31 };
  s = engine.apply(s, { type: 'pick', category: s.offered[0] }, 'p0');
  s = engine.apply(s, { type: 'clock', askedAt: s.question!.askedAt }, null);
  s = engine.apply(s, { type: 'answer', index: right(s.question!), askedAt: s.question!.askedAt }, 'p0');
  const e = encounterAt(s, 'p0', false)!;
  assert.equal(e.difficulty, 'eternal', 'not the room\'s leftover Cruel');
  assert.equal(e.answer!.ok, true);
  assert.deepEqual(e.delve, { depth: 31, run: s.delve!.startedAt, who: 'p0' }, 'its depth and run, and whose it was, for the Delve page');
});

// ---- Delve together ----------------------------------------------------------

/** A co-op Delve run online of p0 (the host), p1 and p2, its first question asked and its clock running. */
function coop() {
  const engine = new Engine(items, { rng: seeded(3), now: () => 1_000_000, fakes });
  let s: GameState = createGame('p0', { targetScore: 10, timer: 16, difficulty: 'merciless', mode: 'delve', public: false, locked: false });
  for (const id of ['p0', 'p1', 'p2']) s = engine.apply(s, { type: 'join', playerId: id, name: `Delver ${id}` }, id);
  s = engine.apply(s, { type: 'start' }, 'p0');
  s = structuredClone(s);
  s.delve!.finds = [];
  s = engine.apply(s, { type: 'pick', category: s.offered[0] }, null);
  s = engine.apply(s, { type: 'clock', askedAt: s.question!.askedAt }, null);
  return { engine, s };
}

test('Delve together: right for whoever cleared it, wrong for whoever struck, seen for the rest', () => {
  let { engine, s } = coop();
  const q = s.question!;
  s = engine.apply(s, { type: 'answer', index: wrongIdx(q), askedAt: q.askedAt }, 'p1');
  s = engine.apply(s, { type: 'answer', index: right(q), askedAt: q.askedAt }, 'p2');
  assert.equal(s.phase, 'reveal');
  const view = publicView(s);
  const won = encounterAt(view, 'p2', false, 800)!;
  assert.deepEqual([won.answer!.ok, won.answer!.ms, won.delve!.team, won.delve!.lost], [true, 800, true, undefined]);
  const struck = encounterAt(view, 'p1', false)!;
  assert.deepEqual([struck.answer!.ok, struck.answer!.pickedId, struck.delve!.lost], [false, q.options[wrongIdx(q)], { lives: 1, wards: 0 }]);
  assert.equal(encounterAt(view, 'p0', false)!.answer, undefined, 'cleared by a teammate first: only seen');
  // Into the codex: the miss costs p1 a life, logged as an answer together.
  const c = record(emptyCodex(), struck);
  assert.deepEqual([c.log[0].team, c.log[0].lives, c.items[q.itemId].delve!.n], [true, 1, 1]);
  assert.deepEqual(parseCodex(serializeCodex(c)), c);
  // The turn order means nothing together: the first standing is not the one answering.
  assert.equal(encounterAt(view, null, true)!.answer, undefined);
});

test('Delve together: a ward that takes a struck answer\'s loss, and the time-out for whoever never answered', () => {
  let { engine, s } = coop();
  s = structuredClone(s);
  s.delve!.inventory = { p1: { wards: 1, flares: 0, dynamite: 0, shards: 0 } };
  const q = s.question!;
  s = engine.apply(s, { type: 'answer', index: wrongIdx(q), askedAt: q.askedAt }, 'p1');
  const later = new Engine(items, { rng: seeded(3), now: () => q.deadline! + 1000, fakes });
  s = later.apply(s, { type: 'answer', index: null }, null);
  assert.equal(s.phase, 'reveal');
  const p1 = encounterAt(s, 'p1', false)!;
  assert.deepEqual([p1.answer!.ok, p1.delve!.lost], [false, { lives: 0, wards: 1 }]);
  assert.equal(record(emptyCodex(), p1).log[0].warded, true, 'a ward took it whole: no life');
  const p0 = encounterAt(s, 'p0', false)!;
  assert.deepEqual([p0.answer!.ok, p0.answer!.pickedId, p0.delve!.lost], [false, null, { lives: 1, wards: 0 }]);
});

test('a stored codex this build can\'t read is never written over', () => {
  const newer = JSON.stringify({ v: 9, items: {} });
  store.set(CODEX_KEY, newer);
  recordEncounter(enc(1, a.id, ok()));
  assert.equal(store.get(CODEX_KEY), newer, 'a newer build\'s, left alone');
  store.set(CODEX_KEY, 'garbage');
  recordEncounter(enc(1, a.id, ok()));
  assert.equal(loadCodex().items[a.id].seen, 1);
  assert.deepEqual(
    [...store.entries()].filter(([k]) => k.startsWith(`${CODEX_KEY}.unread`)).map(([, v]) => v),
    ['garbage'],
    'kept aside',
  );
});

// ---- where it is kept ---------------------------------------------------------

const LEGACY_KEY = storeKey('codex');
const delveEnc = (at: number, id: string, okay: boolean, more: Partial<NonNullable<Encounter['delve']>> = {}): Encounter => ({
  ...enc(at, id, okay ? ok() : { ok: false, pickedId: null, pickedLabel: null }),
  delve: { depth: 4, run: 99, ...more },
});

test('the codex lives under a new name: started from the old one, which is never written again', () => {
  assert.notEqual(CODEX_KEY, LEGACY_KEY);
  // What a build from before the Delve fields kept.
  const old = serializeCodex(record(emptyCodex(), enc(1, a.id, ok())));
  store.set(LEGACY_KEY, old);
  assert.equal(loadCodex().items[a.id].seen, 1, 'read from the old name while the new one is missing');
  recordEncounter(delveEnc(2, b.id, false));
  assert.equal(store.get(LEGACY_KEY), old, 'the old name left as it was');
  const now = loadCodex();
  assert.deepEqual([now.items[a.id].seen, now.items[b.id].delve?.n, now.byDepth[4]], [1, 1, { n: 1, ok: 0 }], 'the old codex, and the Delve answer, under the new name');
  // An older build still open in a tab records an answer: it reads and writes the old name only.
  store.set(LEGACY_KEY, serializeCodex(record(emptyCodex(), enc(3, a.id, ok()))));
  recordEncounter(delveEnc(4, a.id, true));
  const after = loadCodex();
  assert.deepEqual([after.items[b.id].delve?.n, after.log.map((l) => l.depth)], [1, [undefined, 4, 4]], 'the Delve fields all still there');
});

test('an unreadable codex under the old name is left alone, and the new one starts empty', () => {
  store.set(LEGACY_KEY, 'garbage');
  assert.deepEqual(loadCodex(), emptyCodex());
  recordEncounter(enc(1, a.id, ok()));
  assert.equal(store.get(LEGACY_KEY), 'garbage');
  assert.equal(loadCodex().items[a.id].seen, 1);
  assert.equal([...store.keys()].some((k) => k.includes('.unread')), false, 'nothing to keep aside: it was never in the way');
});

test('one copy kept aside however often storage is too full to write', () => {
  store.set(CODEX_KEY, '{"v":1,"items":'); // damaged
  refuse = CODEX_KEY;
  for (let i = 0; i < 5; i++) recordEncounter(enc(1000 + i, items[200 + i].id, ok()));
  refuse = null;
  assert.equal(store.get(CODEX_KEY), '{"v":1,"items":', 'nothing recorded');
  assert.deepEqual([...store.keys()].filter((k) => k.includes('.unread')), [`${CODEX_KEY}.unread`], 'one copy, not one a try');
  // A copy already kept is never written over by a later unreadable one.
  store.set(CODEX_KEY, 'other garbage');
  recordEncounter(enc(2000, a.id, ok()));
  assert.equal(store.get(`${CODEX_KEY}.unread`), '{"v":1,"items":');
  assert.equal(loadCodex().items[a.id].seen, 1, 'and the codex goes on');
});

test('reset erases the codex, the old name\'s and the copies kept aside, and never takes up the old name again', () => {
  store.set(LEGACY_KEY, serializeCodex(record(emptyCodex(), enc(1, a.id, ok()))));
  store.set(`${CODEX_KEY}.unread`, 'x');
  store.set(`${LEGACY_KEY}.unread.1700000000000`, 'y'); // as builds before the slot kept them
  store.set(storeKey('codex.unreadable-not-ours'), 'z');
  store.set('poe2trivia.beta.codex.unread', 'the beta\'s');
  resetCodex();
  assert.deepEqual([...store.keys()].sort(), [CODEX_KEY, storeKey('codex.unreadable-not-ours'), 'poe2trivia.beta.codex.unread'].sort());
  store.set(LEGACY_KEY, serializeCodex(record(emptyCodex(), enc(2, a.id, ok()))));
  assert.deepEqual(loadCodex(), emptyCodex(), 'an older tab writing the old name again changes nothing');
});

test('two players of one browser in one room: each Delve answer says whose it was', () => {
  let x = record(emptyCodex(), delveEnc(1, a.id, false, { who: 'p0' }));
  x = record(x, delveEnc(2, b.id, false, { who: 'p1' }));
  x = record(x, delveEnc(3, c.id, false));
  assert.deepEqual(parseCodex(serializeCodex(x))!.log.map((l) => l.who), ['p0', 'p1', undefined]);
});

test("practice answers count only in their own tally, kept apart from the codex", () => {
  recordPractice(true);
  recordPractice(false);
  recordPractice(true);
  assert.deepEqual(loadPractice(), { n: 3, ok: 2 });
  // The codex itself is untouched (none was even written).
  const c = loadCodex();
  assert.deepEqual([c.items, c.log, c.byDifficulty, c.streak], [{}, [], {}, 0]);
  assert.equal(store.has(CODEX_KEY), false);
  // A codex written over by a build that knows nothing of practice keeps it.
  store.set(CODEX_KEY, serializeCodex(emptyCodex()));
  assert.deepEqual(loadPractice(), { n: 3, ok: 2 });
  // Erasing the codex erases it with it.
  resetCodex();
  assert.deepEqual(loadPractice(), { n: 0, ok: 0 });
});

test("today's unique without its answer finds the item and counts no answer", () => {
  recordEncounter({ at: 1000, itemId: items[0].id, mode: 'name', difficulty: 'custom', race: false });
  const c = loadCodex();
  assert.equal(c.items[items[0].id].seen, 1);
  assert.deepEqual([c.items[items[0].id].name, c.items[items[0].id].art], [{ n: 0, ok: 0 }, { n: 0, ok: 0 }]);
  assert.deepEqual([c.log, c.byDifficulty, c.streak], [[], {}, 0]);
});
