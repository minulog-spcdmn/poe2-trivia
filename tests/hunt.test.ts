import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CODEX_NAMES,
  HUNTS,
  HUNTS_VERSION,
  QUICK_DEFAULT,
  QUICK_TARGET,
  QUICK_TIMER,
  addHunt,
  emptyHunts,
  initiateFlag,
  isNewcomer,
  loadHunts,
  newReveal,
  parseHunts,
  recordHunt,
  serializeHunts,
  setQuickDifficulty,
  type HuntRun,
  type Hunts,
  type RevealSeen,
} from '../src/lib/hunt.ts';
import { CODEX_KEY } from '../src/lib/codex.ts';
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

test('the codex names kept here are the codex\'s own', () => {
  assert.equal(storeKey(CODEX_NAMES[0]), CODEX_KEY);
  assert.deepEqual(CODEX_NAMES, ['codex2', 'codex']);
});

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
