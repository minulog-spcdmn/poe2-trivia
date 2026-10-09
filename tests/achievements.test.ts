import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Engine, createGame, isFake, publicView, type GameMode, type GameState, type Item, type Question, type Reveal, type Revive } from '../src/lib/game.ts';
import { emptyCodex, encounterAt, recordEncounter, resetCodex, type Answer, type Codex } from '../src/lib/codex.ts';
import { emptyRecords, recordRun, type DelveRecords, type DelveRun } from '../src/lib/delveRecord.ts';
import {
  ACHIEVEMENTS,
  ACHIEVEMENTS_KEY,
  ACHIEVEMENTS_VERSION,
  GROUPS,
  checkAchievements,
  earnedFrom,
  emptyStore,
  isDone,
  loadAchievements,
  nextSeal,
  recapSeals,
  sealRows,
  standings,
  type SealRow,
  momentsIn,
  forfeit,
  nextWins,
  noteState,
  PRIMA,
  parseStore,
  parseWins,
  parseTrack,
  resetAchievements,
  serializeStore,
  summarize,
  trackVersus,
  serializeWins,
  versusEnd,
  WINS_VERSION,
  type VersusTrack,
} from '../src/lib/achievements.ts';
import { storeKey } from '../src/lib/storage.ts';
import { forgiveLeaving, leftGame, losing, noteLeaving } from '../src/lib/versus.ts';

const items: Item[] = JSON.parse(readFileSync(new URL('../src/data/items.json', import.meta.url), 'utf8'));
const fakes: Record<string, string[]> = JSON.parse(readFileSync(new URL('../src/data/fakes.json', import.meta.url), 'utf8'));

const store = new Map<string, string>();
const tab = new Map<string, string>();
const area = (m: Map<string, string>) => ({
  getItem: (k: string) => m.get(k) ?? null,
  setItem: (k: string, v: string) => void m.set(k, String(v)),
  removeItem: (k: string) => void m.delete(k),
  key: (i: number) => [...m.keys()][i] ?? null,
  get length() {
    return m.size;
  },
});
(globalThis as { localStorage?: unknown }).localStorage = area(store);
(globalThis as { sessionStorage?: unknown }).sessionStorage = area(tab);
beforeEach(() => {
  store.clear();
  tab.clear();
});

const right = (q: Question) => q.options.indexOf(q.itemId);
const wrongIdx = (q: Question) => q.options.findIndex((o) => o !== q.itemId && !isFake(o));

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

const ids = (list: { id: string }[]) => list.map((a) => a.id);

// ---- the list --------------------------------------------------------------------

test('every achievement has its own id, a listed group, and a sentence saying what earns it', () => {
  const all = ids(ACHIEVEMENTS);
  assert.equal(new Set(all).size, all.length);
  for (const a of ACHIEVEMENTS) {
    assert.ok(GROUPS.some((g) => g.key === a.group), a.id);
    assert.ok(a.title.split(' ').length <= 3, `${a.id}: a title of 1 to 3 words`);
    assert.ok(a.text.endsWith('.'), a.id);
  }
  // Nothing is earned before anything was played.
  assert.deepEqual(earnedFrom(summarize(emptyCodex(), emptyRecords(), items)), []);
});

test('the groups are the same size, so the page lays out evenly', () => {
  const sizes = GROUPS.map((g) => ACHIEVEMENTS.filter((a) => a.group === g.key).length);
  assert.ok(sizes[0] > 0);
  assert.deepEqual(sizes, sizes.map(() => sizes[0]), JSON.stringify(sizes));
});

test('a sign is shared only by the tiers of one series, and a series climbs', () => {
  const seriesOf = new Map<string, string>();
  for (const a of ACHIEVEMENTS) {
    const series = a.series ?? a.id;
    const was = seriesOf.get(a.sign);
    assert.ok(was === undefined || was === series, `${a.sign} is used by ${was} and ${series}`);
    seriesOf.set(a.sign, series);
  }
  for (const [series, list] of Map.groupBy(ACHIEVEMENTS, (a) => a.series ?? a.id)) {
    assert.equal(new Set(list.map((a) => a.sign)).size, 1, `${series} keeps one sign`);
    assert.ok(list.every((a, i) => i === 0 || a.tier > list[i - 1].tier), `${series} climbs`);
  }
});

// ---- from the codex --------------------------------------------------------------

/** A codex whose log holds these answers, in order. */
function codexOf(answers: Partial<Answer>[], over: Partial<Codex> = {}): Codex {
  const c = emptyCodex();
  answers.forEach((a, i) => c.log.push({ t: i + 1, id: items[0].id, mode: 'name', ok: true, difficulty: 'cruel', race: false, ...a }));
  return { ...c, ...over };
}
const sum = (c: Codex, r: DelveRecords = emptyRecords()) => summarize(c, r, items);

test('streaks count only questions put to this player alone: races and runs together neither add nor break', () => {
  const s = sum(codexOf([{}, {}, {}, { race: true, ok: false }, {}, {}, { team: true, ok: false }, { team: true }, {}]));
  assert.equal(s.streak, 6);
  assert.equal(s.streakNow, 6);
  assert.equal(sum(codexOf([{}, {}, { ok: false }, {}])).streak, 2);
  const a = ACHIEVEMENTS.find((x) => x.id === 'streak-25')!;
  assert.equal(a.progress!(s).note, 'now 6 in a row');
  assert.ok(earnedFrom(sum(codexOf(Array.from({ length: 25 }, () => ({}))))).includes('streak-25'));
  assert.ok(!earnedFrom(sum(codexOf(Array.from({ length: 25 }, (_, i) => ({ race: i % 2 === 0 }))))).includes('streak-25'));
});

test('Mercurial wants five right in a row on your own turns, each quick', () => {
  const quick = (n: number, ms = 1500) => Array.from({ length: n }, () => ({ ms }));
  assert.equal(sum(codexOf(quick(5))).fast, 5);
  assert.equal(sum(codexOf([...quick(3), { ms: 2500 }, ...quick(4)])).fast, 4);
  assert.equal(sum(codexOf([...quick(3), { ok: false }, ...quick(2)])).fast, 3);
  // A race answer is skipped, not counted.
  assert.equal(sum(codexOf([...quick(3), { race: true, ms: 900 }, ...quick(2)])).fast, 5);
  assert.ok(earnedFrom(sum(codexOf(quick(5)))).includes('mercurial'));
});

test('Twofold Lore and The Great Work read the items answered right, by question mode', () => {
  const rings = items.filter((it) => it.category === 'Rings');
  const c = emptyCodex();
  for (const it of rings) c.items[it.id] = { seen: 2, first: 1, last: 2, name: { n: 1, ok: 1 }, art: { n: 1, ok: 1 }, mixed: {} };
  const s = sum(c);
  assert.deepEqual(s.twofold, { have: rings.length, need: rings.length, note: 'Rings' });
  assert.deepEqual(s.known, { have: rings.length, need: items.length });
  assert.ok(earnedFrom(s).includes('twofold'));
  assert.ok(!earnedFrom(s).includes('great-work'));
  // Named from the art only: one way.
  c.items[rings[0].id] = { ...c.items[rings[0].id], art: { n: 2, ok: 0 } };
  assert.equal(sum(c).twofold.have, rings.length - 1);
  // Seen but never answered right is not known.
  c.items[rings[1].id] = { seen: 3, first: 1, last: 2, name: { n: 1, ok: 0 }, art: { n: 0, ok: 0 }, mixed: {} };
  assert.equal(sum(c).known.have, rings.length - 1);
});

test('Fool Me Twice is a secret, earned by the same made-up name twice', () => {
  assert.equal(ACHIEVEMENTS.find((a) => a.id === 'fooled-twice')!.secret, true);
  assert.ok(!earnedFrom(sum(codexOf([], { fooled: { 'Fake Name': { of: items[0].id, n: 1, last: 1 }, Other: { of: items[1].id, n: 1, last: 2 } } }))).includes('fooled-twice'));
  assert.ok(earnedFrom(sum(codexOf([], { fooled: { 'Fake Name': { of: items[0].id, n: 2, last: 3 } } }))).includes('fooled-twice'));
});

test('Prima Materia counts the different items answered right: five, as a first quick hunt gets', () => {
  assert.equal(PRIMA, 5);
  const prima = ACHIEVEMENTS.find((a) => a.id === 'prima-materia')!;
  const c = emptyCodex();
  for (const it of items.slice(0, 4)) c.items[it.id] = { seen: 1, first: 1, last: 1, name: { n: 1, ok: 1 }, art: { n: 0, ok: 0 }, mixed: {} };
  // Seen, but never answered right: not one of them.
  c.items[items[10].id] = { seen: 2, first: 1, last: 2, name: { n: 2, ok: 0 }, art: { n: 0, ok: 0 }, mixed: {} };
  assert.ok(!earnedFrom(sum(c)).includes('prima-materia'));
  assert.deepEqual(prima.progress!(sum(c)), { have: 4, need: 5 });
  c.items[items[4].id] = { seen: 1, first: 1, last: 1, name: { n: 0, ok: 0 }, art: { n: 1, ok: 1 }, mixed: {} };
  assert.ok(earnedFrom(sum(c)).includes('prima-materia'));
  // The same item right 5 times is one item.
  const same = codexOf(Array.from({ length: 5 }, () => ({})));
  same.items[items[0].id] = { seen: 5, first: 1, last: 5, name: { n: 5, ok: 5 }, art: { n: 0, ok: 0 }, mixed: {} };
  assert.ok(!earnedFrom(sum(same)).includes('prima-materia'));
});

test("Prima Materia's text asks for five", () => {
  assert.equal(ACHIEVEMENTS.find((a) => a.id === 'prima-materia')!.text, 'Answer 5 different items right.');
});

test('Sweet Revenge: an item answered right after three wrong answers to it in a row', () => {
  const [a, b] = [items[0].id, items[1].id];
  // Other items' answers in between don't break it; races count too.
  const revenge = sum(codexOf([{ id: a, ok: false }, { id: b }, { id: a, ok: false, race: true }, { id: a, ok: false }, { id: b, ok: false }, { id: a }]));
  assert.equal(revenge.revenge, true);
  assert.ok(earnedFrom(revenge).includes('sweet-revenge'));
  // A right answer to it in between starts the count over.
  assert.equal(sum(codexOf([{ id: a, ok: false }, { id: a, ok: false }, { id: a }, { id: a, ok: false }, { id: a }])).revenge, false);
  // Three wrong answers to three items are no revenge.
  assert.equal(sum(codexOf([{ id: a, ok: false }, { id: b, ok: false }, { id: items[2].id, ok: false }, { id: a }])).revenge, false);
});

test('each group opens with one very easy achievement in lead', () => {
  for (const g of GROUPS) {
    const list = ACHIEVEMENTS.filter((a) => a.group === g.key);
    assert.equal(list[0].tier, 0, g.key);
    assert.equal(list.filter((a) => a.tier === 0).length, 1, g.key);
  }
});

test('Quicksilver: twenty quick right answers in a row, the tier above Mercurial', () => {
  const quick = (n: number) => Array.from({ length: n }, () => ({ ms: 1800 }));
  assert.ok(!earnedFrom(sum(codexOf(quick(19)))).includes('quicksilver'));
  assert.ok(earnedFrom(sum(codexOf(quick(20)))).includes('quicksilver'));
  assert.ok(!earnedFrom(sum(codexOf([...quick(10), { ms: 2100 }, ...quick(10)]))).includes('quicksilver'));
});

// ---- from the Delve records ------------------------------------------------------

const solo = (o: Partial<DelveRun>): DelveRun => ({ id: 1, at: 1, depth: 10, players: 1, ruleset: 1, mixed: false, ...o });
const team = (o: Partial<DelveRun>): DelveRun => solo({ players: 3, perished: [], ...o });

function recordsOf(runs: DelveRun[]): DelveRecords {
  for (const run of runs) recordRun(run);
  return JSON.parse(store.get(storeKey('delve2'))!) as DelveRecords;
}

test('runs alone: the deepest, the first life lost, and the last life', () => {
  const r = recordsOf([
    solo({ id: 1, at: 1, depth: 52, losses: [41, 44, 52] }),
    solo({ id: 2, at: 2, depth: 47, losses: [8, 33, 47] }),
    solo({ id: 3, at: 3, depth: 30, left: true, losses: [] }),
  ]);
  const s = sum(emptyCodex(), r);
  // Depths as players see them (shownDepth): one less than the records'.
  assert.equal(s.deepestAlone, 51);
  // Run 1 lost its first life at 41 (shown 40): it stood at 40 with every life.
  assert.equal(s.untouched, 40);
  // Run 2 was on its last life from 33 and survived to 46 (shown 32 and 45): 13 depths past 32.
  assert.equal(s.thread, 13);
  for (const id of ['depth-50', 'untouched', 'by-a-thread']) assert.ok(earnedFrom(s).includes(id), id);
  assert.ok(!earnedFrom(s).includes('depth-100'));
});

test('runs under other rules count for nothing', () => {
  const s = sum(emptyCodex(), recordsOf([solo({ depth: 60, mixed: true, losses: [45, 50, 60] })]));
  assert.deepEqual([s.deepestAlone, s.untouched, s.thread], [0, 0, 0]);
});

test('a ward on the last life is read from the codex log and its run', () => {
  const r = recordsOf([solo({ id: 7, depth: 25, losses: [10, 20, 25] })]);
  const log = (depth: number): Partial<Answer>[] => [{ depth, run: 7, ok: false, warded: true }];
  assert.equal(sum(codexOf(log(22)), r).savingGrace, true, 'two lives lost before 22');
  assert.equal(sum(codexOf(log(15)), r).savingGrace, false, 'only one lost before 15');
  assert.equal(sum(codexOf([{ depth: 22, run: 7, ok: false }]), r).savingGrace, false, 'a life lost, no ward');
});

test('Familiar Grave: a fall at exactly the best before it', () => {
  const tie = recordsOf([solo({ id: 1, at: 1, depth: 24, losses: [5, 9, 24] }), solo({ id: 2, at: 2, depth: 24, losses: [3, 7, 24] })]);
  assert.equal(sum(emptyCodex(), tie).grave, true);
  store.clear();
  const shallow = recordsOf([solo({ id: 1, at: 1, depth: 20, losses: [5, 9, 20] }), solo({ id: 2, at: 2, depth: 20, losses: [3, 7, 20] })]);
  assert.equal(sum(emptyCodex(), shallow).grave, false, 'shown 19, below 20');
  store.clear();
  const at20 = recordsOf([solo({ id: 1, at: 1, depth: 21, losses: [5, 9, 21] }), solo({ id: 2, at: 2, depth: 21, losses: [3, 7, 21] })]);
  assert.equal(sum(emptyCodex(), at20).grave, true, 'shown 20');
  store.clear();
  const better = recordsOf([solo({ id: 1, at: 1, depth: 24, losses: [5, 9, 24] }), solo({ id: 2, at: 2, depth: 26, losses: [3, 7, 26] })]);
  assert.equal(sum(emptyCodex(), better).grave, false);
});

test('Familiar Grave: a run left and then ended at the same depth never ties itself', () => {
  // Left at 22 (never a best, so no step of the climb), then rejoined and fallen there.
  recordsOf([solo({ id: 1, at: 1, depth: 22, left: true, losses: [5, 9] })]);
  const r = recordsOf([solo({ id: 1, at: 2, depth: 22, losses: [5, 9, 22] })]);
  assert.equal(sum(emptyCodex(), r).grave, false);
});

test('runs together: lives given in one run, and the deepest depth stood at', () => {
  const r = recordsOf([team({ id: 1, depth: 80, perished: [40, 78], given: 2 }), team({ id: 2, depth: 90, perished: [12], given: 1 })]);
  const s = sum(emptyCodex(), r);
  assert.equal(s.given, 2);
  assert.equal(s.deepCompany, 77);
  for (const id of ['selfless', 'deep-company']) assert.ok(earnedFrom(s).includes(id), id);
  store.clear();
  // Left on their feet after being brought back: they stood at the depth it was left at.
  assert.equal(sum(emptyCodex(), recordsOf([team({ depth: 80, left: true, perished: [60], revived: 1 })])).deepCompany, 79);
  store.clear();
  // Left while down: they last stood where they fell.
  assert.equal(sum(emptyCodex(), recordsOf([team({ depth: 80, left: true, perished: [60] })])).deepCompany, 59);
});

test('runs together: the team\'s depth and times brought back', () => {
  const r = recordsOf([team({ id: 1, depth: 11, perished: [4, 8, 11], revived: 3 }), team({ id: 2, depth: 9, perished: [9], revived: 1 })]);
  const s = sum(emptyCodex(), r);
  // The team's depth counts for Roped Together, even with this player down before it.
  assert.equal(s.deepTeam, 10);
  assert.equal(s.revived, 3);
  for (const id of ['roped-together', 'dead-weight']) assert.ok(earnedFrom(s).includes(id), id);
  store.clear();
  const short = sum(emptyCodex(), recordsOf([team({ id: 1, depth: 10, perished: [10], revived: 2 })]));
  assert.ok(!earnedFrom(short).includes('roped-together'), 'shown 9');
  assert.ok(!earnedFrom(short).includes('dead-weight'));
});

// ---- moments in a run ------------------------------------------------------------

const question = (o: Partial<Question> = {}): Question => ({
  category: 'Rings',
  mode: 'name',
  itemId: 'x',
  options: ['x', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
  labels: ['X', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
  prompt: null,
  veil: null,
  askedAt: 100,
  deadline: null,
  misses: [],
  ...o,
});
const reveal = (o: Partial<Reveal> = {}): Reveal => ({ correctId: 'x', chosenId: null, correctIndex: 0, chosenIndex: null, correct: true, timedOut: false, winnerId: null, ...o });

/** A run as the state has it: `losses` by seat, at `round`. */
function delve(losses: Record<string, number[]>, o: Partial<GameState> & { revives?: Revive[]; leftAt?: number; q?: Partial<Question>; r?: Partial<Reveal> } = {}): GameState {
  const { revives, leftAt, q, r, ...over } = o;
  const s = createGame('a');
  const seats = Object.keys(losses);
  s.players = seats.map((id, hue) => ({ id, name: id, score: 0, recent: [], connected: true, hue }));
  s.phase = 'choosing';
  s.delve = { entrants: seats, losses, ruleset: 1, startedAt: 500, excused: [], graceUntil: 0, ...(revives ? { revives } : {}), ...(leftAt ? { leftAt } : {}) };
  if (r) {
    s.phase = 'reveal';
    s.question = question(q);
    s.reveal = reveal(r);
  }
  return { ...s, ...over };
}
const was = (s: GameState) => ({ ...s, phase: 'question' as const, reveal: null });

test('alone: depths reached, untouched, and on the last life', () => {
  // Depth 50 as players see it (shownDepth) is round 51.
  assert.deepEqual(momentsIn(null, delve({ a: [3] }, { round: 11 }), 'a', false), ['depth-10']);
  assert.deepEqual(momentsIn(null, delve({ a: [3] }, { round: 10 }), 'a', false), []);
  assert.deepEqual(momentsIn(null, delve({ a: [3] }, { round: 51 }), 'a', false), ['depth-10', 'depth-50']);
  assert.deepEqual(momentsIn(null, delve({ a: [3] }, { round: 50 }), 'a', false), ['depth-10']);
  assert.deepEqual(momentsIn(null, delve({ a: [3] }, { round: 101 }), 'a', false), ['depth-10', 'depth-50', 'depth-100']);
  assert.deepEqual(momentsIn(null, delve({ a: [3] }, { round: 100 }), 'a', false), ['depth-10', 'depth-50']);
  assert.deepEqual(momentsIn(null, delve({ a: [] }, { round: 41 }), 'a', false), ['depth-10', 'untouched']);
  assert.deepEqual(momentsIn(null, delve({ a: [] }, { round: 40 }), 'a', false), ['depth-10']);
  assert.deepEqual(momentsIn(null, delve({ a: [41] }, { round: 42 }), 'a', false), ['depth-10', 'untouched'], 'it reached 40 with every life');
  assert.deepEqual(momentsIn(null, delve({ a: [40] }, { round: 42 }), 'a', false), ['depth-10']);
  // On the last life since 31: survived depths 32 to 41.
  const thread = delve({ a: [5, 31] }, { round: 41, r: { correct: true } });
  assert.ok(momentsIn(was(thread), thread, 'a', false).includes('by-a-thread'));
  const short = delve({ a: [5, 31] }, { round: 40, r: { correct: true } });
  assert.ok(!momentsIn(was(short), short, 'a', false).includes('by-a-thread'));
  // Early losses count from depth 30 as shown (round 31): ten past it is round 41.
  const early = delve({ a: [2, 3] }, { round: 41, r: { correct: true } });
  assert.ok(momentsIn(was(early), early, 'a', false).includes('by-a-thread'));
  const earlier = delve({ a: [2, 3] }, { round: 40, r: { correct: true } });
  assert.ok(!momentsIn(was(earlier), earlier, 'a', false).includes('by-a-thread'));
  // On one device, its one player; a spectator or another seat, nothing.
  assert.deepEqual(momentsIn(null, delve({ a: [] }, { round: 51 }), null, true), ['depth-10', 'depth-50', 'untouched']);
  assert.deepEqual(momentsIn(null, delve({ a: [] }, { round: 51 }), 'z', false), []);
  assert.deepEqual(momentsIn(null, { ...delve({ a: [] }, { round: 51 }), delve: { ...delve({ a: [] }).delve!, mixed: true } }, 'a', false), []);
});

test('alone: a ward that breaks in place of the last life', () => {
  const saved = delve({ a: [4, 9] }, { round: 12, r: { correct: false, warded: true } });
  assert.ok(momentsIn(was(saved), saved, 'a', false).includes('saving-grace'));
  // Not the last life.
  const early = delve({ a: [4] }, { round: 12, r: { correct: false, warded: true } });
  assert.ok(!momentsIn(was(early), early, 'a', false).includes('saving-grace'));
  // A cave-in on the last life where two wards took both losses counts; a ward and a life doesn't.
  const vein = delve({ a: [4, 9] }, { round: 12, r: { correct: false, caveIn: true, warded: true, lost: { lives: 0, wards: 2 } } });
  assert.ok(momentsIn(was(vein), vein, 'a', false).includes('saving-grace'));
  const half = delve({ a: [4, 9, 12] }, { round: 12, r: { correct: false, caveIn: true, lost: { lives: 1, wards: 1 } } });
  assert.ok(!momentsIn(was(half), half, 'a', false).includes('saving-grace'));
  // Only as the reveal comes in.
  assert.ok(!momentsIn(saved, saved, 'a', false).includes('saving-grace'));
});

const rv = (by: string, to: string, fell: number): Revive => ({ by, to, fell, depth: fell, at: fell });

test('together: lives given, the deep company, and nobody left behind', () => {
  assert.ok(momentsIn(null, delve({ a: [4], b: [1, 2, 3, 9], c: [] }, { round: 12, revives: [rv('a', 'b', 3), rv('a', 'b', 9)] }), 'a', false).includes('selfless'));
  assert.ok(!momentsIn(null, delve({ a: [4], b: [1, 2, 3] }, { round: 12, revives: [rv('a', 'b', 3)] }), 'a', false).includes('selfless'));
  assert.ok(momentsIn(null, delve({ a: [10], b: [3, 30, 50] }, { round: 76 }), 'a', false).includes('deep-company'));
  assert.ok(!momentsIn(null, delve({ a: [10], b: [3, 30, 50] }, { round: 75 }), 'a', false).includes('deep-company'), 'shown 74');
  assert.ok(!momentsIn(null, delve({ a: [10, 30, 70], b: [] }, { round: 76 }), 'a', false).includes('deep-company'), 'not standing');
  assert.ok(momentsIn(null, delve({ a: [10], b: [5, 20], c: [] }, { round: 31 }), 'a', false).includes('nobody-left'));
  assert.ok(!momentsIn(null, delve({ a: [10], b: [5, 20], c: [] }, { round: 30 }), 'a', false).includes('nobody-left'), 'shown 29');
  assert.ok(!momentsIn(null, delve({ a: [], b: [3, 5, 9], c: [] }, { round: 31 }), 'a', false).includes('nobody-left'), 'one lies perished');
  assert.ok(!momentsIn(null, delve({ a: [], b: [3, 5, 9], c: [] }, { round: 31, revives: [rv('a', 'b', 9)] }), 'a', false).includes('nobody-left'), 'one was brought back');
  // Someone who set out has left.
  const gone = delve({ a: [], b: [] }, { round: 31 });
  assert.ok(!momentsIn(null, { ...gone, delve: { ...gone.delve!, entrants: ['a', 'b', 'c'] } }, 'a', false).includes('nobody-left'));
});

test('together: the clear after every other teammate standing struck', () => {
  const struck = (by: string, index: number) => ({ index, by, at: 1, lives: 1, wards: 0 });
  const make = (q: Partial<Question>, losses: Record<string, number[]> = { a: [], b: [12], c: [12] }) => delve(losses, { round: 12, q, r: { winnerId: 'a' } });
  const won = make({ struck: [struck('b', 1), struck('c', 2)] });
  assert.ok(momentsIn(was(won), won, 'a', false).includes('elimination'));
  // A teammate standing who never answered.
  const idle = make({ struck: [struck('b', 1), struck('c', 2)] }, { a: [], b: [12], c: [12], d: [] });
  assert.ok(!momentsIn(was(idle), idle, 'a', false).includes('elimination'));
  // Too few left open: 8 options, 2 struck, 4 blown away.
  const easy = make({ struck: [struck('b', 1), struck('c', 2)], blownAway: [3, 4, 5, 6] });
  assert.ok(!momentsIn(was(easy), easy, 'a', false).includes('elimination'));
  // One striker is not a team that failed.
  const one = delve({ a: [], b: [12] }, { round: 12, q: { struck: [struck('b', 1)] }, r: { winnerId: 'a' } });
  assert.ok(!momentsIn(was(one), one, 'a', false).includes('elimination'));
});

test('together: falling as one, and the lone wolf', () => {
  // Depth 20 as shown is round 21.
  const wipe = delve({ a: [5, 9, 21], b: [7, 15, 21], c: [3, 18, 21] }, { round: 21, r: { winnerId: null, correct: false } });
  assert.ok(momentsIn(was(wipe), wipe, 'a', false).includes('fell-as-one'));
  const shallow = delve({ a: [5, 9, 20], b: [7, 15, 20], c: [3, 18, 20] }, { round: 20, r: { winnerId: null, correct: false } });
  assert.ok(!momentsIn(was(shallow), shallow, 'a', false).includes('fell-as-one'));
  const two = delve({ a: [5, 9, 21], b: [7, 15, 21], c: [3, 4, 6] }, { round: 21, r: { winnerId: null, correct: false } });
  assert.ok(!momentsIn(was(two), two, 'a', false).includes('fell-as-one'), 'only two fell on it');

  // Teammates down at 25 and 31; clean past 31 to 41.
  const wolf = delve({ a: [12], b: [5, 9, 25], c: [6, 20, 31] }, { round: 41, r: { winnerId: 'a' } });
  assert.ok(momentsIn(was(wolf), wolf, 'a', false).includes('lone-wolf'));
  const soon = delve({ a: [12], b: [5, 9, 25], c: [6, 20, 31] }, { round: 40, r: { winnerId: 'a' } });
  assert.ok(!momentsIn(was(soon), soon, 'a', false).includes('lone-wolf'));
  const hurt = delve({ a: [12, 35], b: [5, 9, 25], c: [6, 20, 31] }, { round: 41, r: { winnerId: 'a' } });
  assert.ok(!momentsIn(was(hurt), hurt, 'a', false).includes('lone-wolf'), 'a life lost on the way');
  // Teammates down early: it counts from depth 30 as shown (round 31), so ten past it is round 41.
  const lone = delve({ a: [], b: [5, 9, 10], c: [6, 7, 12] }, { round: 41, r: { winnerId: 'a' } });
  assert.ok(momentsIn(was(lone), lone, 'a', false).includes('lone-wolf'));
  const lonely = delve({ a: [], b: [5, 9, 10], c: [6, 7, 12] }, { round: 40, r: { winnerId: 'a' } });
  assert.ok(!momentsIn(was(lonely), lonely, 'a', false).includes('lone-wolf'));
});

test('a pack full of everything, alone only', () => {
  const full = { wards: 3, flares: 3, dynamite: 3, shards: 0 };
  const laden = (o: Partial<typeof full>, losses: Record<string, number[]> = { a: [] }) => {
    const s = delve(losses, { round: 70 });
    return { ...s, delve: { ...s.delve!, inventory: Object.fromEntries(Object.keys(losses).map((id) => [id, { ...full, ...o }])) } };
  };
  assert.ok(momentsIn(null, laden({}), 'a', false).includes('fully-laden'));
  assert.ok(!momentsIn(null, laden({ flares: 2 }), 'a', false).includes('fully-laden'));
  assert.ok(!momentsIn(null, laden({ wards: 2, shards: 1 }), 'a', false).includes('fully-laden'));
  assert.ok(!momentsIn(null, laden({}, { a: [], b: [] }), 'a', false).includes('fully-laden'), 'together');
});

test('Chain Reaction: a cache blast that takes your own dynamite, alone or together', () => {
  const alone = delve({ a: [12] }, { round: 12, r: { correct: false, blown: 'dynamite' } });
  assert.ok(momentsIn(was(alone), alone, 'a', false).includes('chain-reaction'));
  const flare = delve({ a: [12] }, { round: 12, r: { correct: false, blown: 'flares' } });
  assert.ok(!momentsIn(was(flare), flare, 'a', false).includes('chain-reaction'));
  const hit = (playerId: string, blown?: 'dynamite') => ({ playerId, lives: 1, wards: 0, timedOut: false, ...(blown ? { blown } : {}) });
  const team = delve({ a: [12], b: [12] }, { round: 12, r: { correct: false, hits: [hit('a'), hit('b', 'dynamite')] } });
  assert.ok(momentsIn(was(team), team, 'b', false).includes('chain-reaction'));
  assert.ok(!momentsIn(was(team), team, 'a', false).includes('chain-reaction'), "a teammate's");
});

test('together: roped to depth 10, the unbroken circle, and dead weight', () => {
  assert.ok(momentsIn(null, delve({ a: [], b: [1, 2, 3] }, { round: 11 }), 'b', false).includes('roped-together'), 'down, but in the run');
  assert.ok(!momentsIn(null, delve({ a: [], b: [] }, { round: 10 }), 'a', false).includes('roped-together'));
  assert.ok(momentsIn(null, delve({ a: [10], b: [5, 20], c: [] }, { round: 61 }), 'a', false).includes('unbroken-circle'));
  assert.ok(!momentsIn(null, delve({ a: [10], b: [5, 20], c: [] }, { round: 60 }), 'a', false).includes('unbroken-circle'), 'shown 59');
  assert.ok(!momentsIn(null, delve({ a: [], b: [3, 5, 9], c: [] }, { round: 61, revives: [rv('a', 'b', 9)] }), 'a', false).includes('unbroken-circle'));
  const thrice = [rv('a', 'b', 3), rv('c', 'b', 6), rv('a', 'b', 9)];
  assert.ok(momentsIn(null, delve({ a: [1], b: [1, 2, 3, 6, 9], c: [] }, { round: 12, revives: thrice }), 'b', false).includes('dead-weight'));
  assert.ok(!momentsIn(null, delve({ a: [1], b: [1, 2, 3, 6, 9], c: [] }, { round: 12, revives: thrice }), 'a', false).includes('dead-weight'));
  assert.ok(!momentsIn(null, delve({ a: [1], b: [1, 2, 3, 6], c: [] }, { round: 12, revives: thrice.slice(0, 2) }), 'b', false).includes('dead-weight'));
});

test('the lone wolf: teammates who left count from where they fell or left', () => {
  /** a and c seated, b gone: where b went is in `fellLeft` or `leftAt`. */
  const without = (round: number, over: { fellLeft?: number; leftAt?: number }) => {
    const s = delve({ a: [12], c: [6, 20, 31] }, { round, r: { winnerId: 'a' } });
    return { ...s, delve: { ...s.delve!, entrants: ['a', 'b', 'c'], ...over } };
  };
  const early = without(41, { fellLeft: 3 });
  assert.ok(momentsIn(was(early), early, 'a', false).includes('lone-wolf'), 'b fell at 3 and left');
  const late = without(41, { fellLeft: 38 });
  assert.ok(!momentsIn(was(late), late, 'a', false).includes('lone-wolf'), 'b fell at 38: only 3 depths alone');
  const walked = without(41, { leftAt: 39 });
  assert.ok(!momentsIn(was(walked), walked, 'a', false).includes('lone-wolf'), 'b stood until 39');
  const unknown = without(60, {});
  assert.ok(!momentsIn(was(unknown), unknown, 'a', false).includes('lone-wolf'), 'an older host never said where b went');
});

test('a fallen teammate leaving the run is kept as where they fell', () => {
  const engine = new Engine(items, { rng: seeded(5), fakes });
  let s: GameState = createGame('a', { targetScore: 5, timer: 0, difficulty: 'cruel', mode: 'delve', public: false, locked: false });
  for (const id of ['a', 'b', 'c']) s = engine.apply(s, { type: 'join', playerId: id, name: `Delver ${id}` }, id);
  s = engine.apply(s, { type: 'start' }, 'a');
  s = { ...s, delve: { ...s.delve!, losses: { ...s.delve!.losses, b: [1, 2, 3] } } };
  s = engine.apply(s, { type: 'remove', playerId: 'b' }, 'b');
  assert.equal(s.delve!.fellLeft, 3);
  assert.equal(s.delve!.leftAt, undefined);
});

// ---- games against others ---------------------------------------------------------

function setup(names: string[], o: { mode?: GameMode; target?: number; difficulty?: 'cruel' | 'merciless' | 'eternal'; start?: number } = {}) {
  let clock = o.start ?? 1000;
  const engine = new Engine(items, { rng: seeded(3), fakes, now: () => (clock += 10) });
  let s: GameState = createGame('p0', { targetScore: o.target ?? 5, timer: 0, difficulty: o.difficulty ?? 'cruel', mode: o.mode ?? 'turns', public: false, locked: false });
  names.forEach((name, i) => (s = engine.apply(s, { type: 'join', playerId: `p${i}`, name }, `p${i}`)));
  return { engine, s: engine.apply(s, { type: 'start' }, 'p0') };
}

/**
 * Plays a game to its end as `me` sees it: each state change is followed, the
 * codex records `me`'s answers, and the end is judged. `answer(who, q)`: the
 * option a player picks, or (in a race) null for one who doesn't guess.
 */
function play(engine: Engine, s: GameState, me: string, answer: (who: string, q: Question, s: GameState) => number | null, race = false, share?: number) {
  let track: VersusTrack | null = null;
  let prev: GameState | null = null;
  const see = (next: GameState) => {
    const view = publicView(next);
    track = trackVersus(track, prev, view, me, false, share !== undefined && next.question ? { qid: next.question.askedAt, share } : undefined);
    const e = encounterAt(view, me, false, 1000);
    if (e && (prev?.phase !== 'reveal' || prev.question?.askedAt !== next.question?.askedAt)) recordEncounter(e);
    // Judged as the end comes in.
    const earned = view.phase === 'over' && prev?.phase !== 'over' ? versusEnd(view, me, false, track).earned : [];
    prev = view;
    return earned;
  };
  let earned = see(s);
  for (let n = 0; n < 200 && s.phase !== 'over'; n++) {
    if (race) {
      for (const p of s.players) {
        if (s.phase !== 'question') break;
        const i = answer(p.id, s.question!, s);
        if (i !== null) earned = see((s = engine.apply(s, { type: 'answer', index: i }, p.id)));
      }
      // Nobody got it: the time runs out.
      if (s.phase === 'question') earned = see((s = engine.apply(s, { type: 'answer', index: null }, null)));
    } else {
      const who = s.players[s.turn].id;
      earned = see((s = engine.apply(s, { type: 'pick', category: s.offered[0] }, who)));
      earned = see((s = engine.apply(s, { type: 'answer', index: answer(who, s.question!, s) }, who)));
    }
    if (s.phase === 'reveal') earned = see((s = engine.apply(s, { type: 'next' }, 'p0')));
  }
  return { s, earned };
}

test('a game started records when, and a restart back to the lobby forgets it', () => {
  const { engine, s } = setup(['Ash', 'Bram']);
  assert.equal(typeof s.startedAt, 'number');
  assert.equal(publicView(s).startedAt, s.startedAt, 'guests get it too');
  const { s: over } = play(engine, s, 'p0', (_, q) => right(q));
  assert.equal(engine.apply(over, { type: 'restart', play: false }, 'p0').startedAt, undefined);
});

test('Untarnished: a win to 10 with every own answer right; a wrong one, or a game to 5, earns nothing', () => {
  let g = setup(['Ash', 'Bram'], { target: 10 });
  let r = play(g.engine, g.s, 'p0', (who, q) => (who === 'p0' ? right(q) : wrongIdx(q)));
  assert.deepEqual(r.s.winners, ['p0']);
  assert.ok(r.earned.includes('untarnished'), JSON.stringify(r.earned));

  store.clear();
  g = setup(['Ash', 'Bram'], { target: 10 });
  let first = true;
  r = play(g.engine, g.s, 'p0', (who, q) => (who === 'p0' ? (first ? ((first = false), wrongIdx(q)) : right(q)) : wrongIdx(q)));
  assert.deepEqual(r.s.winners, ['p0']);
  assert.ok(!r.earned.includes('untarnished'));

  store.clear();
  g = setup(['Ash', 'Bram'], { target: 5 });
  r = play(g.engine, g.s, 'p0', (who, q) => (who === 'p0' ? right(q) : wrongIdx(q)));
  assert.ok(!r.earned.includes('untarnished'), 'only to 10 or more');
});

test('the loser, a game to 4, a spectator or one device earns nothing', () => {
  let g = setup(['Ash', 'Bram']);
  let r = play(g.engine, g.s, 'p1', (who, q) => (who === 'p0' ? right(q) : wrongIdx(q)));
  assert.deepEqual(r.earned, []);
  g = setup(['Ash', 'Bram'], { target: 4 });
  r = play(g.engine, g.s, 'p0', (who, q) => (who === 'p0' ? right(q) : wrongIdx(q)));
  assert.deepEqual(r.earned, []);
  const over = r.s;
  assert.deepEqual(versusEnd(over, 'zz', false, null), { outcome: null, earned: [] });
  assert.deepEqual(versusEnd(over, 'p0', true, null), { outcome: null, earned: [] });
  assert.deepEqual(versusEnd({ ...over, phase: 'reveal' }, 'p0', false, null), { outcome: null, earned: [] }, 'not over yet');
});

test('Tide Turner: a win after a rival led by 4 at a round end', () => {
  // Bram takes the first four rounds; Ash misses them, then wins every round after while Bram misses.
  const { engine, s } = setup(['Ash', 'Bram']);
  let rounds = 0;
  const r = play(engine, s, 'p0', (who, q, st) => {
    if (who === st.players[0].id) rounds++;
    const early = rounds <= 4;
    return (who === 'p1') === early ? right(q) : wrongIdx(q);
  });
  assert.deepEqual(r.s.winners, ['p0']);
  assert.ok(r.earned.includes('tide-turner'), JSON.stringify(r.earned));
});

test("Tide Turner: in a race, a rival's lead counts from your real score, below zero too", () => {
  // Ash misses the first three while Bram takes the fourth (Ash -3, Bram 1: a lead of 4), then Ash takes the rest.
  const { engine, s } = setup(['Ash', 'Bram'], { mode: 'race', target: 5 });
  const r = play(
    engine,
    s,
    'p0',
    (who, q, st) => {
      if (st.round <= 3) return who === 'p0' ? wrongIdx(q) : null;
      if (st.round === 4) return who === 'p1' ? right(q) : null;
      return who === 'p0' ? right(q) : null;
    },
    true,
  );
  assert.deepEqual(r.s.winners, ['p0']);
  assert.ok(r.earned.includes('tide-turner'), JSON.stringify(r.earned));
});

test('Sudden Death: a deathmatch won on the answers', () => {
  // Both answer right until the target, so they tie; in the deathmatch Ash is right and Bram wrong.
  const { engine, s } = setup(['Ash', 'Bram']);
  const r = play(engine, s, 'p0', (who, q, st) => (st.deathmatch && who === 'p1' ? wrongIdx(q) : right(q)));
  assert.ok(r.s.deathmatch);
  assert.deepEqual(r.s.winners, ['p0']);
  assert.ok(r.earned.includes('deathmatch'), JSON.stringify(r.earned));
});

test('Clean Sweep: every question of a race to 10 taken, against a rival who guessed', () => {
  const { engine, s } = setup(['Ash', 'Bram'], { mode: 'race', target: 10 });
  const r = play(engine, s, 'p0', (who, q) => (who === 'p1' ? wrongIdx(q) : right(q)), true);
  assert.deepEqual(r.s.winners, ['p0']);
  assert.ok(r.earned.includes('clean-sweep'), JSON.stringify(r.earned));
  assert.ok(r.earned.includes('untarnished'));
  // A rival who never guessed hands nothing over.
  store.clear();
  const idle = setup(['Ash', 'Bram'], { mode: 'race', target: 10 });
  const r2 = play(idle.engine, idle.s, 'p0', (who, q) => (who === 'p1' ? null : right(q)), true);
  assert.ok(!r2.earned.includes('clean-sweep'));
});

test('Through the Veil: race questions taken before a quarter of the art burned in', () => {
  const g = setup(['Ash', 'Bram'], { mode: 'race', target: 5, difficulty: 'merciless' });
  const r = play(g.engine, g.s, 'p0', (who, q) => (who === 'p1' ? null : right(q)), true, 0.1);
  assert.ok(r.earned.includes('through-the-veil'), JSON.stringify(r.earned));
  store.clear();
  tab.clear();
  // Before any of it had burned in is before a quarter too.
  const blind = setup(['Ash', 'Bram'], { mode: 'race', target: 5, difficulty: 'merciless' });
  assert.ok(play(blind.engine, blind.s, 'p0', (who, q) => (who === 'p1' ? null : right(q)), true, 0).earned.includes('through-the-veil'));
  store.clear();
  const late = setup(['Ash', 'Bram'], { mode: 'race', target: 5, difficulty: 'merciless' });
  assert.ok(!play(late.engine, late.s, 'p0', (who, q) => (who === 'p1' ? null : right(q)), true, 0.5).earned.includes('through-the-veil'));
});

test('Usurper: a win over the creator, never as the creator', () => {
  const { engine, s } = setup(['Ash', 'zoe_arcana']);
  const r = play(engine, s, 'p0', (who, q) => (who === 'p0' ? right(q) : wrongIdx(q)));
  assert.ok(r.earned.includes('usurper'));
  store.clear();
  const her = setup(['Ash', 'zoe_arcana']);
  assert.ok(!play(her.engine, her.s, 'p1', (who, q) => (who === 'p1' ? right(q) : wrongIdx(q))).earned.includes('usurper'));
});

test('First Victory: any win against others that counts', () => {
  const g = setup(['Ash', 'Bram']);
  const won = play(g.engine, g.s, 'p0', (who, q) => (who === 'p0' ? right(q) : wrongIdx(q)));
  assert.ok(won.earned.includes('first-victory'));
  store.clear();
  const lost = setup(['Ash', 'Bram']);
  assert.ok(!play(lost.engine, lost.s, 'p1', (who, q) => (who === 'p0' ? right(q) : wrongIdx(q))).earned.includes('first-victory'));
});

test('Hubris: a loss after leading the winner by 4 at a round end', () => {
  // Ash takes the first four rounds while Bram misses them, then misses every round after while Bram takes them.
  const play2 = (lead: number) => {
    store.clear();
    tab.clear();
    const { engine, s } = setup(['Ash', 'Bram']);
    let rounds = 0;
    return play(engine, s, 'p0', (who, q, st) => {
      if (who === st.players[0].id) rounds++;
      const early = rounds <= lead;
      return (who === 'p0') === early ? right(q) : wrongIdx(q);
    });
  };
  const fell = play2(4);
  assert.deepEqual(fell.s.winners, ['p1']);
  assert.deepEqual(fell.earned, ['hubris']);
  const close = play2(3);
  assert.deepEqual(close.s.winners, ['p1']);
  assert.deepEqual(close.earned, [], 'only ever 3 ahead');
});

/**
 * A game Ash (p0) plays to its end as their tab follows it through noteState:
 * `wins` says whether Ash answers right and Bram wrong, or the other way
 * round; `reload`: the tab reloads just before the end comes in.
 */
function followed(wins: boolean, reload = false, start?: number) {
  const { engine, s } = setup(['Ash', 'Bram'], { start });
  let st = s;
  let prev: GameState | null = null;
  const earned: string[] = [];
  const step = (next: GameState) => {
    const view = publicView(next);
    earned.push(...ids(noteState(reload && next.phase === 'over' && prev?.phase !== 'over' ? null : prev, view, 'p0', false, { items }).earned));
    prev = view;
    st = next;
  };
  step(st);
  for (let n = 0; n < 50 && st.phase !== 'over'; n++) {
    const who = st.players[st.turn].id;
    step(engine.apply(st, { type: 'pick', category: st.offered[0] }, who));
    step(engine.apply(st, { type: 'answer', index: (who === 'p0') === wins ? right(st.question!) : wrongIdx(st.question!) }, who));
    if (st.phase === 'reveal') step(engine.apply(st, { type: 'next' }, 'p0'));
  }
  assert.equal(st.phase, 'over');
  return { earned, again: () => step(st) };
}

const WINS_AT = storeKey('achievements.wins');
const storedWins = () => parseWins(store.get(WINS_AT) ?? null);

test('Undefeated: wins in a row are kept apart from the list, a loss starts them over', () => {
  let w = parseWins(null);
  for (let g = 1; g <= 3; g++) w = nextWins(w, 'won', g);
  assert.deepEqual(w, { now: 3, best: 3, last: 3 });
  assert.deepEqual(nextWins(w, 'won', 3), w, 'one game counts once');
  w = nextWins(w, 'lost', 4);
  assert.deepEqual(w, { now: 0, best: 3, last: 4 });
  assert.deepEqual(parseWins(serializeWins(w)), w);
  assert.deepEqual(parseWins(JSON.stringify({ v: WINS_VERSION, now: 2.5, best: 1, last: 'x' })), { now: 2, best: 2, last: 0 });
  assert.deepEqual(parseWins('{broken'), { now: 0, best: 0, last: 0 });

  // The fifth win in a row, followed through noteState as a game is.
  store.set(WINS_AT, serializeWins({ now: 4, best: 4, last: 1 }));
  const { earned } = followed(true);
  assert.ok(earned.includes('undefeated'), JSON.stringify(earned));
  assert.ok(earned.includes('first-victory'));
  assert.equal(storedWins().now, 5);
  // Shown on the page from the kept run, and erased with the rest.
  assert.ok(earnedFrom(summarize(emptyCodex(), emptyRecords(), items, { now: 5, best: 5, last: 1 })).includes('undefeated'));
  resetAchievements();
  assert.equal(store.get(WINS_AT), undefined);
});

test('a game followed only from part way through never counts as without a wrong answer', () => {
  // Ash misses the first question, then their tab is opened anew (no tracker, nothing before it) and they answer the rest right.
  const { engine, s } = setup(['Ash', 'Bram'], { target: 10 });
  let st = s;
  for (let missed = false; !missed; ) {
    const who = st.players[st.turn].id;
    st = engine.apply(st, { type: 'pick', category: st.offered[0] }, who);
    st = engine.apply(st, { type: 'answer', index: wrongIdx(st.question!) }, who);
    st = engine.apply(st, { type: 'next' }, 'p0');
    missed = who === 'p0';
  }
  let prev: GameState | null = null;
  const earned: string[] = [];
  const step = (next: GameState) => {
    earned.push(...ids(noteState(prev, publicView(next), 'p0', false, { items }).earned));
    prev = publicView(next);
    st = next;
  };
  step(st);
  for (let n = 0; n < 80 && st.phase !== 'over'; n++) {
    const who = st.players[st.turn].id;
    step(engine.apply(st, { type: 'pick', category: st.offered[0] }, who));
    step(engine.apply(st, { type: 'answer', index: who === 'p0' ? right(st.question!) : wrongIdx(st.question!) }, who));
    if (st.phase === 'reveal') step(engine.apply(st, { type: 'next' }, 'p0'));
  }
  assert.deepEqual(st.winners, ['p0']);
  assert.ok(earned.includes('first-victory'));
  assert.ok(!earned.includes('untarnished'), JSON.stringify(earned));
});

test('with session storage blocked, a game is still judged as its end comes in', () => {
  const session = (globalThis as { sessionStorage?: unknown }).sessionStorage;
  (globalThis as { sessionStorage?: unknown }).sessionStorage = {
    getItem: () => null,
    setItem: () => {
      throw new Error('blocked');
    },
    removeItem: () => {},
    key: () => null,
    length: 0,
  };
  try {
    store.set(WINS_AT, serializeWins({ now: 4, best: 4, last: 1 }));
    const { earned, again } = followed(true);
    assert.ok(earned.includes('first-victory'), JSON.stringify(earned));
    assert.ok(earned.includes('undefeated'));
    again();
    assert.equal(earned.filter((id) => id === 'first-victory').length, 1, 'once');
    assert.equal(storedWins().now, 5);
  } finally {
    (globalThis as { sessionStorage?: unknown }).sessionStorage = session;
  }
});

test('a game whose end first comes in after a reload is judged, once', () => {
  store.set(WINS_AT, serializeWins({ now: 4, best: 4, last: 1 }));
  const won = followed(true, true);
  assert.ok(won.earned.includes('undefeated'), JSON.stringify(won.earned));
  assert.equal(storedWins().now, 5);
  // Seen over again (a spectator joining, a rejoin): nothing more.
  won.again();
  assert.equal(won.earned.filter((id) => id === 'first-victory').length, 1);
  assert.equal(storedWins().now, 5);

  // A loss seen only after a reload still starts the run over.
  store.clear();
  tab.clear();
  store.set(WINS_AT, serializeWins({ now: 4, best: 4, last: 1 }));
  followed(false, true);
  assert.deepEqual(storedWins(), { now: 0, best: 4, last: storedWins().last });
});

/** Ash (p0) and Bram (p1) part way through a game to 5, at these scores. */
function midGame(ash: number, bram: number, o: { gone?: boolean; target?: number } = {}) {
  const { s } = setup(['Ash', 'Bram'], { target: o.target });
  return { ...s, players: s.players.map((p) => ({ ...p, score: p.id === 'p0' ? ash : bram, connected: p.id === 'p0' || !o.gone })) };
}

test('only walking away while losing marks a game: behind a rival still there, or out of its deathmatch', () => {
  assert.equal(losing(midGame(1, 3), 'p0', false), true);
  assert.equal(losing(midGame(2, 2), 'p0', false), false, 'level is not losing');
  assert.equal(losing(midGame(3, 1), 'p0', false), false);
  assert.equal(losing(midGame(1, 3, { gone: true }), 'p0', false), false, 'the rival quit');
  assert.equal(losing(midGame(1, 3, { target: 4 }), 'p0', false), false, "a game that doesn't count");
  assert.equal(losing(midGame(1, 3), 'p0', true), false, 'one device');
  assert.equal(losing({ ...midGame(1, 3), phase: 'over' }, 'p0', false), false, 'ended');
  const dm = { alive: ['p1'], entrants: ['p0', 'p1'], round: 2, results: {}, eliminated: ['p0'], startedAt: 3 };
  assert.equal(losing({ ...midGame(5, 5), deathmatch: dm }, 'p0', false), true, 'out of the deathmatch');
  noteLeaving(midGame(2, 2), 'p0', false, 'ROOM');
  assert.equal(leftGame(), null);
  noteLeaving(null, 'p0', false, 'ROOM');
  assert.equal(leftGame(), null);
});

test('a game walked away from while losing: coming back to it lets it go; the next game counts it as lost first', () => {
  store.set(WINS_AT, serializeWins({ now: 4, best: 4, last: 1 }));
  const left = midGame(1, 3);
  noteLeaving(left, 'p0', false, 'ROOM');
  assert.deepEqual(leftGame(), { game: left.startedAt, room: 'ROOM' });
  // Back in the same game (a reload): the mark goes, the run stands.
  noteState(null, publicView(left), 'p0', false, { items });
  assert.equal(leftGame(), null);
  assert.equal(storedWins().now, 4);

  // Left again, and the next game is another: that one is lost, this one wins the first of a new run.
  noteLeaving(left, 'p0', false, 'ROOM');
  tab.clear();
  const { earned } = followed(true, false, 50000);
  assert.ok(!earned.includes('undefeated'), JSON.stringify(earned));
  assert.equal(storedWins().now, 1);
  assert.equal(leftGame(), null);
});

test('erasing lets a mark go too', () => {
  noteLeaving(midGame(1, 3), 'p0', false, 'ROOM');
  resetAchievements();
  assert.equal(leftGame(), null);
});

test("a mark goes when its room can't be got back into, or another tab is still in its game", () => {
  const left = midGame(1, 3);
  noteLeaving(left, 'p0', false, 'ROOM');
  forgiveLeaving({ room: 'OTHER' });
  assert.notEqual(leftGame(), null, 'another room failing changes nothing');
  forgiveLeaving({ room: 'ROOM' });
  assert.equal(leftGame(), null, 'the room closed during the reload');
  noteLeaving(left, 'p0', false, 'ROOM');
  forgiveLeaving({ game: left.startedAt });
  assert.equal(leftGame(), null, 'still seated in it in another tab');
});

test('offline, walking away marks nothing: the game may be gone already', () => {
  const nav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true });
  try {
    noteLeaving(midGame(1, 3), 'p0', false, 'ROOM');
    assert.equal(leftGame(), null);
  } finally {
    if (nav) Object.defineProperty(globalThis, 'navigator', nav);
    else delete (globalThis as { navigator?: unknown }).navigator;
  }
});

test('a forfeit ends the run without moving the last game counted, and never undoes one counted after all', () => {
  const w = { now: 3, best: 3, last: 9 };
  assert.deepEqual(forfeit(w, 5), { now: 0, best: 3, last: 9 });
  assert.equal(forfeit(w, 9), w, 'that game was played to its end in another tab, and counted');
  // A game counted later is still recognised when its end is seen again.
  assert.deepEqual(nextWins(forfeit(w, 5), 'won', 9), forfeit(w, 5));
});

test("a mark stays when the loss can't be written, for the next game to count", () => {
  noteLeaving(midGame(1, 3), 'p0', false, 'ROOM');
  const newer = JSON.stringify({ v: WINS_VERSION + 1, now: 4 });
  store.set(WINS_AT, newer);
  tab.clear();
  followed(true, false, 50000);
  assert.notEqual(leftGame(), null);
  assert.equal(store.get(WINS_AT), newer);
});

test("a newer build's wins in a row are never written over", () => {
  const newer = JSON.stringify({ v: WINS_VERSION + 1, now: 4, best: 7, shape: 'new' });
  store.set(WINS_AT, newer);
  const { earned } = followed(true);
  assert.ok(earned.includes('first-victory'));
  assert.ok(!earned.includes('undefeated'));
  assert.equal(store.get(WINS_AT), newer);
});

// ---- storage ------------------------------------------------------------------------

const codexWith = (c: Codex) => store.set(storeKey('codex2'), JSON.stringify({ v: 1, ...c }));

test('a codex from before achievements earns quietly; what comes after is announced', () => {
  codexWith(codexOf(Array.from({ length: 5 }, () => ({ ms: 900 }))));
  const first = checkAchievements(items);
  assert.deepEqual(ids(first.earned), ['mercurial']);
  assert.equal(first.first, true);
  assert.deepEqual(checkAchievements(items), { earned: [], first: false });
  codexWith(codexOf(Array.from({ length: 25 }, () => ({}))));
  assert.deepEqual(ids(checkAchievements(items).earned), ['streak-25']);
});

test('an achievement once earned stays earned', () => {
  codexWith(codexOf(Array.from({ length: 25 }, () => ({}))));
  checkAchievements(items);
  resetCodex();
  assert.deepEqual(checkAchievements(items), { earned: [], first: false });
  assert.ok(loadAchievements().earned['streak-25']);
});

test('moments are written as they happen, announced, and once', () => {
  resetAchievements();
  const at50 = delve({ a: [3] }, { round: 51 });
  const c = noteState(null, at50, 'a', false, { items });
  assert.deepEqual([ids(c.earned), c.first], [['depth-10', 'depth-50'], false]);
  assert.deepEqual(ids(noteState(null, at50, 'a', false, { items }).earned), []);
  assert.ok(loadAchievements().earned['depth-50']);
});

test('a moment before there is any list: the past caught up quietly first, the moment announced', () => {
  // A player with past games reloads straight into a run that reaches depth 10.
  codexWith(codexOf(Array.from({ length: 25 }, () => ({}))));
  const c = noteState(null, delve({ a: [3] }, { round: 11 }), 'a', false, { items });
  assert.deepEqual([ids(c.earned), c.first, ids(c.past ?? [])], [['depth-10'], false, ['streak-25']]);
  // Nothing from the past is left to be announced as new afterwards.
  assert.deepEqual(checkAchievements(items), { earned: [], first: false });
});

test('Sweet Revenge reaches across modes and rooms: misses in races, the right answer in a later Delve run', () => {
  const id = items[0].id;
  // A seat's id (`who`) is only good for one room, and only Delve notes it: it never splits an item's misses.
  const log = [{ id, ok: false, race: true }, { id, ok: false }, { id, ok: false, depth: 12, run: 1, who: 'p3' }, { id, depth: 30, run: 2, who: 'p1' }];
  assert.equal(sum(codexOf(log)).revenge, true);
});

test("a tab that lost its connection in the lobby doesn't vouch for a game it rejoins part way", () => {
  const { engine, s } = setup(['Ash', 'Bram'], { target: 10 });
  const lobby = { ...s, phase: 'lobby' as const, startedAt: undefined };
  // Ash's first turn has passed (missed) while the tab was away.
  let st = s;
  for (let missed = false; !missed; ) {
    const who = st.players[st.turn].id;
    st = engine.apply(st, { type: 'pick', category: st.offered[0] }, who);
    st = engine.apply(st, { type: 'answer', index: wrongIdx(st.question!) }, who);
    st = engine.apply(st, { type: 'next' }, 'p0');
    missed = who === 'p0';
  }
  const t = trackVersus(null, lobby, publicView(st), 'p0', false);
  assert.equal(t?.whole, false);
  assert.equal(trackVersus(null, lobby, publicView(s), 'p0', false)?.whole, true, 'seen at its first question');
});

test('the game in play is followed across reloads and let go at its end', () => {
  const { engine, s } = setup(['Ash', 'Bram']);
  let st = s;
  let prev: GameState | null = null;
  const step = (next: GameState) => {
    noteState(prev, publicView(next), 'p0', false, { items });
    prev = publicView(next);
    st = next;
  };
  step(st);
  assert.equal(parseTrack(tab.get(storeKey('achievements.versus')) ?? null)?.game, s.startedAt);
  // A state of another game (another tab's, on one device) leaves it alone.
  noteState(null, createGame(null), null, true, { items });
  assert.equal(parseTrack(tab.get(storeKey('achievements.versus')) ?? null)?.game, s.startedAt);
  for (let n = 0; n < 50 && st.phase !== 'over'; n++) {
    const who = st.players[st.turn].id;
    step(engine.apply(st, { type: 'pick', category: st.offered[0] }, who));
    step(engine.apply(st, { type: 'answer', index: who === 'p0' ? right(st.question!) : wrongIdx(st.question!) }, who));
    if (st.phase === 'reveal') step(engine.apply(st, { type: 'next' }, 'p0'));
  }
  assert.equal(st.phase, 'over');
  assert.equal(tab.get(storeKey('achievements.versus')), undefined);
});

test('erasing leaves an empty list, so the next achievement is announced', () => {
  codexWith(codexOf(Array.from({ length: 25 }, () => ({}))));
  checkAchievements(items);
  resetAchievements();
  assert.deepEqual(loadAchievements(), emptyStore());
  const after = checkAchievements(items);
  assert.deepEqual(ids(after.earned), ['streak-25']);
  assert.equal(after.first, false);
});

test("erasing leaves a newer build's list and wins alone", () => {
  const list = JSON.stringify({ v: ACHIEVEMENTS_VERSION + 1, earned: { 'streak-25': 1 } });
  const wins = JSON.stringify({ v: WINS_VERSION + 1, now: 3 });
  store.set(ACHIEVEMENTS_KEY, list);
  store.set(WINS_AT, wins);
  resetAchievements();
  assert.equal(store.get(ACHIEVEMENTS_KEY), list);
  assert.equal(store.get(WINS_AT), wins);
});

test('a list a newer build wrote is never written over; a damaged one is kept aside', () => {
  const newer = JSON.stringify({ v: ACHIEVEMENTS_VERSION + 1, earned: { 'streak-25': 1 }, shape: 'new' });
  store.set(ACHIEVEMENTS_KEY, newer);
  codexWith(codexOf(Array.from({ length: 25 }, () => ({}))));
  assert.deepEqual(checkAchievements(items), { earned: [], first: false });
  assert.deepEqual(noteState(null, delve({ a: [] }, { round: 50 }), 'a', false, { items }), { earned: [], first: false });
  assert.equal(store.get(ACHIEVEMENTS_KEY), newer);

  store.set(ACHIEVEMENTS_KEY, '{broken');
  checkAchievements(items);
  assert.equal(store.get(storeKey('achievements.unread')), '{broken');
  assert.ok(loadAchievements().earned['streak-25']);
});

test('a stored list is cleaned up as it is read', () => {
  assert.equal(parseStore(null), null);
  assert.equal(parseStore('[]'), null);
  assert.equal(parseStore(JSON.stringify({ v: 99, earned: {} })), null);
  const s = parseStore(JSON.stringify({ v: ACHIEVEMENTS_VERSION, earned: { untarnished: 10, 'from-a-newer-build': 20, bad: 'x' } }))!;
  assert.deepEqual(s.earned, { untarnished: 10, 'from-a-newer-build': 20 });
  assert.deepEqual(parseStore(serializeStore(s)), s);
  const t = parseTrack(JSON.stringify({ game: 5, lead: { p1: 4, p2: -1, p3: 'x' }, answered: 3.5, wrong: 1, guessed: ['p1', 7], veiled: 2.5, last: 9 }));
  assert.deepEqual(t, { game: 5, whole: false, lead: { p1: 4 }, ahead: {}, answered: 3, wrong: false, guessed: ['p1'], veiled: 2, last: 9 });
  assert.deepEqual(parseTrack(JSON.stringify({ game: 5, ahead: { p1: 4, p2: 'x' } }))?.ahead, { p1: 4 });
  assert.equal(parseTrack(JSON.stringify({ game: 'x' })), null);
  assert.equal(parseTrack('{broken'), null);
});

test('isDone needs something to do', () => {
  assert.equal(isDone({ have: 0, need: 0 }), false);
  assert.equal(isDone({ have: 3, need: 2 }), true);
});

// ---- the recap's seal ----------------------------------------------------------------

/** Every achievement unearned with no progress made, then `o` laid over some of them by id. */
function rowsWith(o: Record<string, { earned?: number | null; have?: number; need?: number }>): SealRow[] {
  return ACHIEVEMENTS.map((a) => {
    const x = o[a.id] ?? {};
    const progress = a.progress ? { have: x.have ?? 0, need: x.need ?? 10 } : null;
    return { achievement: a, progress, earned: x.earned ?? null };
  });
}
/** The recap's seals, by id. */
const sealsOf = (rows: SealRow[], before: Set<string> | null) => recapSeals(rows, before).map((r) => r.achievement.id);
/** The first of them (the one the recap leads with). */
const sealOf = (rows: SealRow[], before: Set<string> | null) => sealsOf(rows, before)[0] ?? null;

test('recapSeals: every seal earned in the game, the highest tier first; else First Victory; else the nearest done', () => {
  const before = new Set(['streak-25']);
  // Prima Materia (lead) and Mercurial (silver) earned in the game; Burning Bright before it.
  const rows = rowsWith({ 'prima-materia': { earned: 5 }, mercurial: { earned: 6 }, 'streak-25': { earned: 1 } });
  assert.deepEqual(sealsOf(rows, before), ['mercurial', 'prima-materia'], 'both, the higher tier first');
  assert.deepEqual(
    recapSeals(rows, before).map((r) => r.earned),
    [6, 5],
  );
  assert.deepEqual(sealsOf(rowsWith({ 'prima-materia': { earned: 5 } }), new Set()), ['prima-materia']);
  // A newcomer's first online win: Prima Materia and First Victory, both lead, in the list's order.
  assert.deepEqual(sealsOf(rowsWith({ 'prima-materia': { earned: 5 }, 'first-victory': { earned: 5 } }), new Set()), ['prima-materia', 'first-victory']);
  // Earned before the game: not this game's.
  assert.deepEqual(sealsOf(rowsWith({ 'prima-materia': { earned: 5 } }), new Set(['prima-materia'])), ['first-victory']);
  // Not known what the game began with: no seal is said to be this game's.
  assert.deepEqual(sealsOf(rows, null), ['first-victory'], 'before = null skips the first step');

  // First Victory earned: the unearned seal nearest done, by its share.
  const later = rowsWith({ 'first-victory': { earned: 1 }, 'streak-25': { have: 12, need: 25 }, 'great-work': { have: 300, need: 501 }, mercurial: { have: 1, need: 5 } });
  assert.deepEqual(sealsOf(later, new Set(['first-victory'])), ['great-work']);
  const s = nextSeal(later)!;
  assert.deepEqual([s.achievement.id, s.progress, s.earned], ['great-work', { have: 300, need: 501 }, null]);
});

test('nextSeal: on a tie the lower tier, then the list order; never a secret one, nor one earned', () => {
  // Burning Bright (copper) and Undying Flame (gold), both half done: the copper one.
  const tie = rowsWith({ 'first-victory': { earned: 1 }, 'streak-100': { have: 50, need: 100 }, 'streak-25': { have: 12.5, need: 25 } });
  assert.equal(sealOf(tie, null), 'streak-25');
  // Two of one tier at the same share: the first in the list.
  const copper = ACHIEVEMENTS.filter((a) => a.progress && !a.secret && a.tier === ACHIEVEMENTS.find((b) => b.id === 'streak-25')!.tier);
  if (copper.length > 1) {
    const order = rowsWith({ 'first-victory': { earned: 1 }, [copper[0].id]: { have: 5, need: 10 }, [copper[1].id]: { have: 5, need: 10 } });
    assert.equal(sealOf(order, null), copper[0].id);
  }
  // Fool Me Twice is a secret: however near done, never named.
  const secret = rowsWith({ 'first-victory': { earned: 1 }, 'fooled-twice': { have: 1, need: 2 }, 'streak-25': { have: 2, need: 25 } });
  assert.ok(ACHIEVEMENTS.find((a) => a.id === 'fooled-twice')!.secret);
  assert.equal(sealOf(secret, null), 'streak-25');
  // Earned ones are past; none left to name: nothing.
  const all = ACHIEVEMENTS.map((a): SealRow => ({ achievement: a, progress: a.progress ? { have: 1, need: 1 } : null, earned: 1 }));
  assert.equal(nextSeal(all), null);
  assert.deepEqual(recapSeals(all, new Set(ACHIEVEMENTS.map((a) => a.id))), []);
});

test("sealRows reads this browser's codex and list: a newcomer's first hunt earns Prima Materia, and First Victory comes next", () => {
  const before = new Set(Object.keys(loadAchievements().earned));
  assert.equal(sealOf(sealRows(items), before), 'first-victory', 'nothing yet: the first seal to chase');
  const c = emptyCodex();
  for (const it of items.slice(0, 5)) c.items[it.id] = { seen: 1, first: 1, last: 1, name: { n: 1, ok: 1 }, art: { n: 0, ok: 0 }, mixed: {} };
  codexWith(c);
  // Before the check has written it (it waits for an idle moment): earned all the same.
  const early = sealRows(items);
  assert.equal(sealOf(early, before), 'prima-materia');
  assert.equal(typeof recapSeals(early, before)[0].earned, 'number');
  assert.deepEqual(loadAchievements().earned, {}, 'nothing written by reading');
  checkAchievements(items);
  const rows = sealRows(items);
  assert.deepEqual(rows, standings(summarize(c, emptyRecords(), items), loadAchievements()));
  assert.equal(sealOf(rows, before), 'prima-materia');
  assert.equal(sealOf(rows, new Set(Object.keys(loadAchievements().earned))), 'first-victory', 'the next game');
});
