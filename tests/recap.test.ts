import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ANSWER_MS_FLOOR, ANSWER_MS_SLACK, Engine, createGame, heldMs, publicView, type GameState, type Item, type Question, type Revive } from '../src/lib/game.ts';
import {
  CHART_RUNS,
  chartLayout,
  chartRuns,
  delveLine,
  highlights,
  livesLost,
  median,
  missedAnswers,
  ordinal,
  partyHighlights,
  plain,
  ranked,
  runFacts,
  scoreLine,
  soloHighlights,
  yourGame,
  zoneOf,
} from '../src/lib/recap.ts';
import { parseClientMsg } from '../src/lib/protocol.ts';
import type { Answer } from '../src/lib/codex.ts';
import type { DelveRun } from '../src/lib/delveRecord.ts';
import { DELVE_RULESET, inventoryOf, livesOf } from '../src/lib/delve.ts';

const items: Item[] = JSON.parse(readFileSync(new URL('../src/data/items.json', import.meta.url), 'utf8'));
const byId = new Map(items.map((it) => [it.id, it]));
const right = (q: Question) => q.options.indexOf(q.itemId);
const wrongIdx = (q: Question) => q.options.findIndex((o) => o !== q.itemId);
const text = (s: GameState) => (id: string) => s.players.find((p) => p.id === id)?.name ?? byId.get(id)?.name ?? id;

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

/** A game on a clock the test moves (an answer's time is held to what the host saw: game.ts heldMs). */
function setup(names: string[], settings: Partial<GameState['settings']> = {}) {
  const clock = { now: 1_000_000 };
  const engine = new Engine(items, { autoClock: true, rng: seeded(7), now: () => clock.now });
  let s: GameState = createGame('p0', { targetScore: 3, timer: 0, difficulty: 'cruel', mode: 'turns', public: false, locked: false, ...settings });
  names.forEach((name, i) => (s = engine.apply(s, { type: 'join', playerId: `p${i}`, name }, `p${i}`)));
  return { engine, clock, s: engine.apply(s, { type: 'start' }, 'p0') };
}

test('take turns: the recap keeps each answer, its time, the categories and the misses', () => {
  let { engine, clock, s } = setup(['Ash', 'Bram']);
  const first = s.players[s.turn].id;
  const other = s.players.find((p) => p.id !== first)!.id;
  // The first player gets theirs right in 2.4 s, the other misses.
  s = engine.apply(s, { type: 'pick', category: s.offered[0] }, first);
  const cat = s.question!.category;
  clock.now += 2500;
  s = engine.apply(s, { type: 'answer', index: right(s.question!), ms: 2400 }, first);
  s = engine.apply(s, { type: 'next' }, first);
  s = engine.apply(s, { type: 'pick', category: s.offered[0] }, other);
  const missed = s.question!.itemId;
  s = engine.apply(s, { type: 'answer', index: wrongIdx(s.question!), ms: 900 }, other);
  const r = s.recap!;
  assert.deepEqual(r.answers[first], { n: 1, ok: 1, ms: 2400 });
  assert.deepEqual(r.answers[other], { n: 1, ok: 0 });
  assert.deepEqual(r.fastest, { by: first, id: s.used[s.used.length - 2], ms: 2400 });
  assert.deepEqual(r.misses, [{ by: other, id: missed }]);
  assert.deepEqual(r.cats![cat][0] >= 1, true);
  // A wrong answer's time never makes it the fastest.
  assert.equal(r.fastest!.ms, 2400);
  // Back to the lobby, the recap goes.
  s = engine.apply(s, { type: 'restart' }, 'p0');
  assert.equal(s.recap, undefined);
});

test('an answer time out of reason is dropped, and the protocol keeps a fair one', () => {
  let { engine, s } = setup(['Ash']);
  s = engine.apply(s, { type: 'pick', category: s.offered[0] }, 'p0');
  s = engine.apply(s, { type: 'answer', index: right(s.question!), ms: 3 }, 'p0');
  assert.equal(s.recap!.fastest, undefined);
  const msg = parseClientMsg({ t: 'action', action: { type: 'answer', index: 1, askedAt: 5, ms: 1234.4 } });
  assert.deepEqual(msg, { t: 'action', action: { type: 'answer', index: 1, askedAt: 5, ms: 1234 } });
  const bad = parseClientMsg({ t: 'action', action: { type: 'answer', index: 1, ms: 'soon' } });
  assert.deepEqual(bad, { t: 'action', action: { type: 'answer', index: 1, askedAt: undefined } });
});

test('race: firsts in a row, wrong guesses per item, and the lines they make', () => {
  let { engine, clock, s } = setup(['Ash', 'Bram', 'Cass'], { mode: 'race', timer: 20, targetScore: 50 });
  // Bram first three times running, then Ash; Cass guesses wrong on the second.
  const order = ['p1', 'p1', 'p1', 'p0'];
  let wrongItem = '';
  order.forEach((who, i) => {
    if (i === 1) {
      wrongItem = s.question!.itemId;
      s = engine.apply(s, { type: 'answer', index: wrongIdx(s.question!), askedAt: s.question!.askedAt }, 'p2');
    }
    clock.now += 2000;
    s = engine.apply(s, { type: 'answer', index: right(s.question!), askedAt: s.question!.askedAt, ms: 1500 + i * 100 }, who);
    s = engine.apply(s, { type: 'next' }, 'p0');
  });
  const r = s.recap!;
  assert.deepEqual(r.firsts, { by: 'p1', n: 3 });
  assert.deepEqual(r.wrong, { [wrongItem]: 1 });
  assert.deepEqual(r.answers.p2, { n: 1, ok: 0 });
  const lines = highlights(s).map((l) => plain(l.parts, text(s)));
  assert.equal(lines[0], `Bram answered fastest: 1.5s on ${byId.get(r.fastest!.id)!.name}.`);
  assert.ok(lines.includes('Bram was first 3 times in a row.'));
  // One wrong guess isn't "missed most".
  assert.ok(!lines.some((l) => l.includes('missed most')));
  // Cass's game: no firsts, one wrong guess.
  s.players.find((p) => p.id === 'p2')!.score = -1;
  const g = yourGame(s, 'p2');
  assert.equal(plain(g.game!), 'First right on 0 of 5 questions; 1 wrong guess took a point back.');
  assert.equal(g.missedLead, 'The one you guessed wrong, kept in your codex:');
  assert.deepEqual(g.missed, [wrongItem]);
});

/** A finished game by hand: who scored what, and the recap the host kept. */
function over(scores: number[], recap: GameState['recap'], extra: Partial<GameState> = {}): GameState {
  const s = createGame('p0');
  s.players = scores.map((score, i) => ({ id: `p${i}`, name: ['Kalguur', 'Doryani', 'Una of the Vaal', 'Rog', 'Alva'][i], score, recent: [], connected: true, hue: i }));
  s.phase = 'over';
  s.round = 10;
  s.winners = ['p0'];
  s.recap = recap;
  return Object.assign(s, extra);
}

test('your game: your place, your answers and your misses, in words', () => {
  const s = over([10, 9, 9, 5], {
    answers: { p0: { n: 10, ok: 10, ms: 2400 }, p1: { n: 10, ok: 9, ms: 2800 }, p2: { n: 10, ok: 9 } },
    misses: [
      { by: 'p1', id: 'kaoms-heart' },
      { by: 'p2', id: 'headhunter' },
    ],
  });
  assert.deepEqual(
    ranked(s.players, s.winners).map((x) => x.rank),
    [1, 2, 2, 4],
  );
  const win = yourGame(s, 'p0');
  assert.equal(win.place, null);
  assert.equal(plain(win.game!), '10 of 10 right, not one missed. Your fastest took 2.4s.');
  assert.deepEqual(win.missed, []);
  const second = yourGame(s, 'p1');
  assert.equal(plain(second.place!), 'You came joint second with 9 points.');
  assert.equal(plain(second.game!), '9 of 10 right. Your fastest took 2.8s.');
  assert.equal(second.missedLead, 'The one you missed, kept in your codex:');
  assert.equal(plain(scoreLine(s, s.players[0])), '10 points after 10 rounds');
  assert.deepEqual(missedAnswers(s), [
    { id: 'kaoms-heart', by: 'p1' },
    { id: 'headhunter', by: 'p2' },
  ]);
});

test('a deathmatch: tied on points, the duel told apart', () => {
  const s = over([10, 10, 7], { answers: { p1: { n: 10, ok: 10, ms: 1800, dn: 3, dok: 2 } }, misses: [{ by: 'p1', id: 'death-rush', dm: true }] }, {
    deathmatch: { alive: ['p0'], entrants: ['p0', 'p1'], round: 3, results: {}, eliminated: ['p1'], startedAt: 0 },
  });
  const g = yourGame(s, 'p1');
  assert.equal(plain(g.place!), 'You came second, tied on 10.');
  assert.equal(plain(g.game!), 'All 10 right, then 2 more in the deathmatch; you missed the third. Your fastest took 1.8s.');
  assert.equal(g.missedLead, 'The deathmatch question you missed, kept in your codex:');
  assert.equal(plain(scoreLine(s, s.players[0])), 'Tied on 10, won the deathmatch in round 3');
});

test('take turns: the hardest category and the one picked most', () => {
  const s = over([10, 8], {
    answers: { p1: { n: 10, ok: 8, ms: 1800 } },
    fastest: { by: 'p1', id: 'atziris-disdain', ms: 1800 },
    cats: { 'Amulets & Belts': [5, 3], 'Body Armours': [8, 7], Rings: [1, 0] },
    misses: [],
  });
  const lines = highlights(s).map((l) => plain(l.parts, text(s)));
  assert.deepEqual(lines.slice(1), ['The hardest category was Amulets & Belts: 3 of 5 answered right.', 'The category picked most was Body Armours, 8 times.']);
});

test('the line under a Delve depth, against this device’s records', () => {
  // Depths as the game keeps them: shown one less.
  assert.equal(plain(delveLine(23, false, { previousBest: 27, best: false })), 'Perished in the Frozen Hollow, four short of your best, 26.');
  assert.equal(plain(delveLine(45, false, { previousBest: 37, best: true })), `Into ${zoneOf(45).the}, eight past your best, 36.`);
  assert.equal(plain(delveLine(23, false, { previousBest: null, best: true })), 'Your first descent reached the Frozen Hollow, the third zone.');
  assert.equal(plain(delveLine(27, true, { previousBest: 19, best: true })), 'Into the Frozen Hollow, eight past your best together, 18.');
  assert.equal(plain(delveLine(27, true, { previousBest: 32, best: false })), 'Into the Frozen Hollow, five short of your best together, 31.');
  assert.equal(plain(delveLine(27, true, null)), 'The party reached the Frozen Hollow.');
  // A zone with "The" of its own keeps it.
  assert.equal(zoneOf(1).the, 'the Mines');
  assert.equal(plain(delveLine(5, false, null)), 'Perished in the Mines.');
});

/** A Delve run alone, over: lives lost at the depths given. */
function run(losses: number[], recap: Partial<NonNullable<GameState['recap']>> = {}, revives: Revive[] | undefined = undefined, players = 1): GameState {
  const s = createGame('p0', { targetScore: 0, timer: 0, difficulty: 'cruel', mode: 'delve', public: false, locked: false });
  s.players = Array.from({ length: players }, (_, i) => ({ id: `p${i}`, name: ['Kalguur', 'Doryani', 'Una of the Vaal'][i], score: 0, recent: [], connected: true, hue: i }));
  s.phase = 'over';
  s.round = Math.max(...losses, 1);
  s.delve = {
    entrants: s.players.map((p) => p.id),
    losses: { p0: losses, ...(players > 1 ? { p1: [losses.at(-1)!, losses.at(-1)!, losses.at(-1)!], p2: [losses.at(-1)!, losses.at(-1)!, losses.at(-1)!] } : {}) },
    ruleset: DELVE_RULESET,
    startedAt: 1000,
    excused: [],
    graceUntil: 0,
    ...(revives ? { revives } : {}),
  };
  s.recap = { answers: {}, misses: [], ...recap };
  return s;
}

const miss = (t: number, id: string, depth: number, more: Partial<Answer> = {}): Answer => ({ t, id, mode: 'name', ok: false, difficulty: 'cruel', race: false, depth, run: 1000, ...more });

test('where your lives went: one row a life, the phial draining, a cave-in told as one', () => {
  const s = run([19, 21, 45]);
  const log = [
    miss(1100, 'atziris-disdain', 19),
    miss(1200, 'headhunter', 20, { warded: true }),
    miss(1300, 'briarpatch', 21),
    miss(1400, 'kaoms-heart', 45, { find: 'azurite', lives: 1, wards: 1 }),
    // Another run's, and a right answer: not here.
    miss(1500, 'death-rush', 22, { run: 999 }),
    { ...miss(1600, 'death-rush', 22), ok: true },
  ];
  const rows = livesLost(s, null, log);
  assert.deepEqual(
    rows.map((r) => [r.kind, r.id, r.depth, r.lives, r.wards, r.after]),
    [
      ['item', 'atziris-disdain', 19, 1, 0, 2],
      ['item', 'briarpatch', 21, 1, 0, 1],
      ['cave', 'kaoms-heart', 45, 1, 1, 0],
    ],
  );
  // A loss the log is missing is still told, at its depth.
  const short = livesLost(s, null, log.slice(0, 2));
  assert.deepEqual(
    short.map((r) => [r.kind, r.depth, r.after]),
    [
      ['item', 19, 2],
      ['plain', 21, 1],
      ['plain', 45, 0],
    ],
  );
});

test('together: a life given drains the phial, one brought back leaves it as it was', () => {
  const revives = [
    { by: 'p0', to: 'p1', depth: 22, fell: 22, at: 1250 },
    { by: 'p2', to: 'p0', depth: 23, fell: 23, at: 1350 },
  ];
  const s = run([20, 23, 27], {}, revives, 3);
  const log = [miss(1100, 'ingenuity', 20, { who: 'p0', team: true, lives: 1, wards: 0 }), miss(1300, 'death-rush', 23, { who: 'p0', team: true, lives: 1, wards: 0 }), miss(1400, 'headhunter', 27, { who: 'p0', team: true, lives: 1, wards: 0 })];
  const rows = livesLost(s, 'p0', log);
  assert.deepEqual(
    rows.map((r) => [r.kind, r.id ?? r.to, r.back ?? null, r.after]),
    [
      ['item', 'ingenuity', null, 2],
      ['given', 'p1', null, 1],
      ['item', 'death-rush', 'p2', 1],
      ['item', 'headhunter', null, 0],
    ],
  );
  const lines = partyHighlights(s).map((l) => plain(l.parts, text(s)));
  assert.deepEqual(lines, ['Kalguur gave a life to bring Doryani back at depth 21.', 'Una of the Vaal gave a life to bring Kalguur back at depth 22.']);
});

test("the run's facts: zones reached, and what its finds gave", () => {
  const s = run([15, 18, 23], {
    items: [
      { kind: 'dynamite', at: 15, by: 'p0', used: 18, how: 'blast' },
      { kind: 'wards', at: 23, by: 'p0' },
      { kind: 'wards', at: 23, by: 'p0' },
      { kind: 'flares', at: 23, by: 'p0' },
    ],
  });
  assert.deepEqual(
    runFacts(s, 'p0').map((l) => plain(l.parts)),
    ['Reached the Frozen Hollow.', 'Dynamite you won at depth 14 blasted a question away at depth 17.', 'An azurite vein at depth 22 gave you two wards.', 'A flare you won at depth 22 was never needed.'],
  );
});

test('alone, the highlights are your own; the first run tells fewer', () => {
  const s = run([20], { fastest: { by: 'p0', id: '0935a2ea4b46', ms: 1900 }, closest: { by: 'p0', id: '6c868f3fcde4', left: 420, depth: 17 } });
  const lines = soloHighlights(s, 'p0', { met: 9, fresh: 3 }, false).map((l) => plain(l.parts, text(s)));
  assert.deepEqual(lines, ['Your fastest answer: 1.9s on Headhunter.', 'Your closest call: Ingenuity at depth 16, right with 0.4s left.', 'You met 3 new uniques, now kept in your codex.']);
  const firstRun = soloHighlights(s, 'p0', { met: 23, fresh: 23 }, true).map((l) => plain(l.parts, text(s)));
  assert.deepEqual(firstRun, ['Your fastest answer: 1.9s on Headhunter.', 'All 23 uniques you met are now kept in your codex.']);
});

test('the runs chart: the runs of the kind up to this one, and columns that fit', () => {
  const r = (id: number, players = 1, more: Partial<DelveRun> = {}): DelveRun => ({ id, at: id, depth: 10 + id, players, ruleset: DELVE_RULESET, mixed: false, ...more });
  const runs = [r(1), r(2, 3), r(3, 1, { left: true }), r(4), r(5, 1, { mixed: true }), r(6), r(7)];
  assert.deepEqual(
    chartRuns(runs, 6, false, null).map((x) => x.id),
    [1, 4, 6],
  );
  assert.deepEqual(chartRuns(runs, 99, false, null), []);
  const many = Array.from({ length: 30 }, (_, i) => r(i + 1));
  assert.equal(chartRuns(many, 30, false, null).length, CHART_RUNS);
  assert.deepEqual(chartLayout(4), { col: 34, gap: 44 / 3 });
  assert.deepEqual(chartLayout(3), { col: 34, gap: 22 });
  assert.deepEqual(chartLayout(8), { col: 17, gap: 6 });
  for (let n = 1; n <= CHART_RUNS; n++) {
    const { col, gap } = chartLayout(n);
    assert.ok(col >= 10 && n * col + (n - 1) * gap <= 180 + 1e-9, `${n} runs fit`);
  }
  assert.equal(median([3, 9, 4]), 4);
  assert.equal(median([3, 9, 4, 10]), 7);
});

test('Delve: a find won goes into the recap, and what came of it; a right answer is a close call by its clock', () => {
  const clock = { now: 1_000_000 };
  const engine = new Engine(items, { autoClock: true, rng: seeded(3), now: () => clock.now });
  let s: GameState = createGame(null, { targetScore: 10, timer: 16, difficulty: 'merciless', mode: 'delve', public: false, locked: false });
  s = engine.apply(s, { type: 'join', playerId: 'p0', name: 'Ash' }, null);
  s = engine.apply(s, { type: 'start' }, null);
  s = structuredClone(s);
  s.round = 20;
  // A Dynamite Cache on the first card, answered right with 3 s of its clock left.
  s.delve!.finds = [{ category: s.offered[0], kind: 'dynamite' }];
  s = engine.apply(s, { type: 'pick', category: s.offered[0] }, null);
  s = engine.apply(s, { type: 'clock', askedAt: s.question!.askedAt }, null);
  clock.now = s.question!.clockAt! + 2300;
  const left = s.question!.deadline! - clock.now;
  s = engine.apply(s, { type: 'answer', index: right(s.question!), askedAt: s.question!.askedAt, ms: 2100 }, null);
  assert.equal(s.reveal!.gained, 'dynamite');
  assert.deepEqual(s.recap!.items, [{ kind: 'dynamite', at: 20, by: 'p0' }]);
  assert.deepEqual(s.recap!.closest, { by: 'p0', id: s.question!.itemId, left, depth: 20 });
  assert.deepEqual(s.recap!.fastest, { by: 'p0', id: s.question!.itemId, ms: 2100 });
  // A depth on, the stick blasts a question away.
  s = engine.apply(s, { type: 'next' }, null);
  const card = s.offered.find((c) => !s.delve!.finds?.some((f) => f.category === c))!;
  s = engine.apply(s, { type: 'pick', category: card }, null);
  s = engine.apply(s, { type: 'clock', askedAt: s.question!.askedAt }, null);
  s = engine.apply(s, { type: 'blast', askedAt: s.question!.askedAt }, null);
  assert.deepEqual(s.recap!.items, [{ kind: 'dynamite', at: 20, by: 'p0', used: 21, how: 'blast' }]);
  assert.equal(plain(runFacts(s, 'p0')[1].parts), 'Dynamite you won at depth 19 blasted a question away at depth 20.');
});

test('a deathmatch of three ranks who lasted longer higher, and the engine keeps when each went out', () => {
  const s = over([10, 10, 10, 5], { answers: {}, misses: [] }, {
    deathmatch: { alive: ['p0'], entrants: ['p0', 'p1', 'p2'], round: 2, results: {}, eliminated: ['p2'], out: { p1: 1, p2: 2 }, startedAt: 0 },
  });
  assert.deepEqual(
    ranked(s.players, s.winners, s.deathmatch!.out).map((x) => [x.p.id, x.rank]),
    [
      ['p0', 1],
      ['p2', 2],
      ['p1', 3],
      ['p3', 4],
    ],
  );
  assert.equal(plain(yourGame(s, 'p1').place!), 'You came third, tied on 10.');
  // The engine: a round lost puts the round on the duelist.
  let { engine, s: g } = setup(['Ash', 'Bram', 'Cass'], { targetScore: 1 });
  for (let k = 0; k < 3; k++) {
    g = engine.apply(g, { type: 'pick', category: g.offered[0] }, g.players[g.turn].id);
    g = engine.apply(g, { type: 'answer', index: right(g.question!) }, g.players[g.turn].id);
    g = engine.apply(g, { type: 'next' }, 'p0');
  }
  assert.ok(g.deathmatch, 'all three tied: a deathmatch');
  const [a, b, c] = g.deathmatch!.alive;
  const answer = (ok: boolean) => {
    g = engine.apply(g, { type: 'pick', category: g.offered[0] }, g.players[g.turn].id);
    g = engine.apply(g, { type: 'answer', index: ok ? right(g.question!) : wrongIdx(g.question!) }, g.players[g.turn].id);
    g = engine.apply(g, { type: 'next' }, 'p0');
  };
  // Round 1: the first wrong, the others right; round 2: the second right, the third wrong.
  for (const who of [a, b, c]) assert.equal(g.players[g.turn].id, who), answer(who !== a);
  assert.deepEqual(g.deathmatch!.out, { [a]: 1 });
  for (const who of [b, c]) assert.equal(g.players[g.turn].id, who), answer(who === b);
  assert.equal(g.phase, 'over');
  assert.deepEqual(g.deathmatch!.out, { [a]: 1, [c]: 2 });
  assert.deepEqual(
    ranked(g.players, g.winners, g.deathmatch!.out).map((x) => x.p.id),
    [b, c, a],
  );
});

test('a negative score has a minus sign; the hardest category is never the one picked most too; every life given is told', () => {
  const s = over([3, -1], { answers: {}, misses: [] });
  assert.equal(plain(yourGame(s, 'p1').place!), 'You came second with −1 points.');
  const one = over([3, 1], { answers: {}, cats: { Rings: [4, 1] }, misses: [] });
  assert.deepEqual(
    highlights(one).map((l) => plain(l.parts)),
    ['The hardest category was Rings: 1 of 4 answered right.'],
  );
  const revives = [22, 23, 24, 25].map((depth, i) => ({ by: 'p0', to: 'p1', depth, fell: depth, at: 1100 + i }));
  const r = run([20, 23, 27], {}, revives, 3);
  assert.deepEqual(
    partyHighlights(r).map((l) => plain(l.parts, text(r))),
    ['Kalguur gave a life to bring Doryani back at depth 21.', 'Kalguur gave a life to bring Doryani back at depth 22.', 'Two more lives were given to bring a teammate back.'],
  );
  const three = run([20, 23, 27], {}, revives.slice(0, 3), 3);
  assert.equal(partyHighlights(three).length, 3);
});

test("an answer's time is held to what the host saw: never longer, never much shorter", () => {
  // Said 50 ms, but 8 s went by on the host: at most the slack sooner than that.
  assert.equal(heldMs(50, 8000), 8000 - ANSWER_MS_SLACK);
  // Never under the floor, never over what the host saw, the device's own time otherwise.
  assert.equal(heldMs(50, 400), ANSWER_MS_FLOOR);
  assert.equal(heldMs(9000, 4000), 4000);
  assert.equal(heldMs(2400, 2500), 2400);
  assert.equal(heldMs(undefined, 2500), undefined);
});

test('race: a question thrown out takes its wrong guesses out of the recap with their points', () => {
  let { engine, s } = setup(['Ash', 'Bram'], { mode: 'race', timer: 20, targetScore: 50 });
  const item = s.question!.itemId;
  s = engine.apply(s, { type: 'answer', index: wrongIdx(s.question!), askedAt: s.question!.askedAt }, 'p1');
  assert.deepEqual([s.recap!.answers.p1, s.recap!.misses.length, s.recap!.wrong], [{ n: 1, ok: 0 }, 1, { [item]: 1 }]);
  s = engine.apply(s, { type: 'reask' }, 'p0');
  assert.deepEqual([s.recap!.answers.p1, s.recap!.misses.length, s.recap!.wrong], [{ n: 0, ok: 0 }, 0, {}]);
});

test('the recap keeps the names it tells, and stays with the host until the game is over', () => {
  let { engine, clock, s } = setup(['Ash', 'Bram']);
  const first = s.players[s.turn].id;
  s = engine.apply(s, { type: 'pick', category: s.offered[0] }, first);
  clock.now += 1800;
  s = engine.apply(s, { type: 'answer', index: right(s.question!), ms: 1700 }, first);
  assert.equal(s.recap!.people![first].name, s.players.find((p) => p.id === first)!.name);
  // A guest sees none of it mid-game, all of it at the end.
  assert.equal(publicView(s).recap, undefined);
  assert.deepEqual(publicView({ ...s, phase: 'over', question: null, reveal: null }).recap, s.recap);
});

test("an honest time stands: a slow picture outside Delve, a clock held still by a reload", () => {
  // 0.9 s on a device whose picture came 3.5 s after the question was asked.
  assert.equal(heldMs(900, 4400), 900);
  // Delve: 9 s used in all, the clock started again 3 s ago after a reload.
  assert.equal(heldMs(9000, 20_000, 3000), 9000);
  // But never less than the clock has run, past the slack.
  assert.equal(heldMs(300, 20_000, 9000), 9000 - ANSWER_MS_SLACK);
});

test('ordinals: in words to twelve, then figures with the right suffix', () => {
  assert.deepEqual([1, 3, 12, 13, 21, 22, 23, 111, 112].map(ordinal), ['first', 'third', 'twelfth', '13th', '21st', '22nd', '23rd', '111th', '112th']);
});

test('together: a flare given back goes only to a holder still standing', () => {
  const clock = { now: 1_000_000 };
  const engine = new Engine(items, { autoClock: true, rng: seeded(5), now: () => clock.now });
  let s: GameState = createGame('p0', { targetScore: 10, timer: 16, difficulty: 'merciless', mode: 'delve', public: false, locked: false });
  for (const id of ['p0', 'p1', 'p2']) s = engine.apply(s, { type: 'join', playerId: id, name: id.toUpperCase() }, id);
  s = engine.apply(s, { type: 'start' }, 'p0');
  // p1 holds the only flare, on their last life.
  s = structuredClone(s);
  s.round = 20;
  s.delve!.finds = [];
  s.delve!.inventory = { p1: { wards: 0, flares: 1, dynamite: 0 } };
  s.delve!.losses = { p1: [5, 9] };
  for (const id of ['p0', 'p1', 'p2']) if (s.phase === 'choosing') s = engine.apply(s, { type: 'vote', category: s.offered[0] }, id);
  if (s.phase === 'choosing') s = engine.apply(s, { type: 'expire' }, null);
  s = engine.apply(s, { type: 'clock', askedAt: s.question!.askedAt }, null);
  // At 0 the flare burns; p1 then strikes wrong and perishes; p2's right answer, sent before 0, crosses the flare.
  clock.now = s.question!.deadline!;
  s = engine.apply(s, { type: 'answer', index: null }, null);
  assert.equal(s.question!.flaredBy, 'p1');
  clock.now += 100;
  s = engine.apply(s, { type: 'answer', index: wrongIdx(s.question!), askedAt: s.question!.askedAt }, 'p1');
  assert.equal(livesOf(s, 'p1'), 0);
  clock.now += 100;
  s = engine.apply(s, { type: 'answer', index: right(s.question!), askedAt: s.question!.askedAt }, 'p2');
  assert.equal(s.reveal!.correct, true);
  // No flare back into a pack that perished with them.
  assert.equal(inventoryOf(s, 'p1').flares, 0);
});
