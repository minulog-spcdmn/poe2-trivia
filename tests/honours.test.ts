import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGame, Engine, isFake, PRESETS, publicView, type GameState, type Item, type Player, type Question, type Tally } from '../src/lib/game.ts';
import { findOn } from '../src/lib/delve.ts';
import { COMEBACK_FROM, FOOLED_FROM, HONOUR_TITLES, KEEN_ASKED, KEEN_SHARE, hasHonours, honours } from '../src/lib/honours.ts';
import { ABLAZE_FROM } from '../src/lib/fx/streaks.ts';

const items: Item[] = JSON.parse(readFileSync(new URL('../src/data/items.json', import.meta.url), 'utf8'));
const fakes: Record<string, string[]> = JSON.parse(readFileSync(new URL('../src/data/fakes.json', import.meta.url), 'utf8'));

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

/** R: right; W: a wrong real item; F: a made-up one; T: the clock runs out. */
type Move = 'R' | 'W' | 'F' | 'T';

function choose(q: Question, move: Move): number | null {
  if (move === 'T') return null;
  const i = move === 'R' ? q.options.indexOf(q.itemId) : q.options.findIndex((o) => o !== q.itemId && isFake(o) === (move === 'F'));
  assert.ok(i >= 0, `an option for ${move}`);
  return i;
}

/**
 * A hot-seat game (name questions with two made-up names among six), its
 * seats played round by round: `rounds[r][seat]` is what that seat does.
 */
function scripted(names: string[], target: number, rounds: Move[][]) {
  const engine = new Engine(items, { rng: seeded(11), fakes });
  const custom = { ...PRESETS.eternal, options: 6, fakes: 2, artChance: 0 };
  let s: GameState = createGame(null, { targetScore: target, timer: 0, difficulty: 'custom', custom, mode: 'turns', public: false, locked: false });
  names.forEach((name, i) => (s = engine.apply(s, { type: 'join', playerId: `p${i}`, name }, null)));
  s = engine.apply(s, { type: 'start' }, null);
  const seats = s.players.map((p) => p.id);
  for (const round of rounds) {
    for (const move of round) {
      assert.notEqual(s.phase, 'over', 'the script outlasts the game');
      s = engine.apply(s, { type: 'pick', category: s.offered[0] }, null);
      s = engine.apply(s, { type: 'answer', index: choose(s.question!, move) }, null);
      s = engine.apply(s, { type: 'next' }, null);
    }
  }
  return { engine, s, seats };
}

const tallyOf = (s: GameState, id: string) => s.players.find((p) => p.id === id)!.tally;

test('tallies count how the game went for each player, through real play', () => {
  const { s, seats } = scripted(
    ['Ash', 'Bea', 'Cid'],
    4,
    [
      ['R', 'T', 'F'], // 1 0 0
      ['R', 'R', 'F'], // 2 1 0
      ['R', 'R', 'R'], // 3 2 1
      ['W', 'R', 'R'], // 3 3 2
      ['R', 'W', 'R'], // 4 3 3: the first seat wins
    ],
  );
  const [a, b, c] = seats;
  assert.equal(s.phase, 'over');
  assert.deepEqual(s.winners, [a]);
  assert.deepEqual(
    seats.map((id) => s.players.find((p) => p.id === id)!.score),
    [4, 3, 3],
  );
  // Turns are counted from 0: the second seat's first point came on turn 4 (round 2), the third's on turn 8.
  assert.deepEqual(tallyOf(s, a), { asked: 5, right: 4, best: 3, fooled: 0, behind: 0, first: 0 });
  assert.deepEqual(tallyOf(s, b), { asked: 5, right: 3, best: 3, fooled: 0, behind: 1, first: 4 });
  assert.deepEqual(tallyOf(s, c), { asked: 5, right: 3, best: 3, fooled: 2, behind: 2, first: 8 });
  // Guests see them as they are (nothing in them is an item).
  assert.deepEqual(publicView(s).players, s.players);

  // An honour for everyone here: the longest run (the first seated of three
  // equal ones), the closest to the winner, the most believed made-up items.
  const h = honours(s);
  assert.deepEqual(Object.fromEntries(h), {
    [a]: { title: 'Ablaze', detail: '3 in a row' },
    [b]: { title: 'So Close', detail: '1 point short' },
    [c]: { title: 'Wild Imagination', detail: 'Believed in 2 made-up items' },
  });
});

test('a deathmatch winner is the Last One Standing; the first point is still First Blood', () => {
  // A and B tie at the target, C misses; in the deathmatch only B is right.
  const { s, seats } = scripted(['Ash', 'Bea', 'Cid'], 1, [['R', 'R', 'W'], ['W', 'R']]);
  const [a, b] = seats;
  assert.equal(s.phase, 'over');
  assert.ok(s.deathmatch);
  assert.deepEqual(s.winners, [b]);
  assert.deepEqual(tallyOf(s, b), { asked: 2, right: 2, best: 2, fooled: 0, behind: 0, first: 1 });
  // C is two points short: no honour.
  assert.deepEqual(Object.fromEntries(honours(s)), {
    [b]: { title: 'Last One Standing', detail: 'Won the deathmatch' },
    [a]: { title: 'First Blood', detail: 'Scored the first point' },
  });
});

test('tallies are reset by start and by restart; race games and Delve runs keep none', () => {
  let { engine, s, seats } = scripted(['Ash', 'Bea'], 1, [['R', 'W']]);
  assert.equal(s.phase, 'over');
  assert.ok(tallyOf(s, seats[0]));
  // Play again: the next game starts with nothing counted.
  const again = engine.apply(s, { type: 'restart', play: true }, null);
  assert.equal(again.version, s.version + 1);
  assert.ok(again.players.every((p) => p.tally === undefined));
  // Change settings: the lobby has none, and a tally left on a seat (an older save) goes at the start.
  let lobby = engine.apply(s, { type: 'restart' }, null);
  assert.ok(lobby.players.every((p) => p.tally === undefined));
  lobby = structuredClone(lobby);
  lobby.players[0].tally = { asked: 9, right: 9, best: 9, fooled: 0, behind: 0, first: 0 };
  const started = engine.apply(lobby, { type: 'start' }, null);
  assert.ok(started.players.every((p) => p.tally === undefined));

  // A race, played to its end.
  const race = new Engine(items, { rng: seeded(3) });
  let r: GameState = createGame('p0', { targetScore: 2, timer: 0, difficulty: 'cruel', mode: 'race', public: false, locked: false });
  r = race.apply(r, { type: 'join', playerId: 'p0', name: 'Ash' }, 'p0');
  r = race.apply(r, { type: 'join', playerId: 'p1', name: 'Bea' }, 'p1');
  r = race.apply(r, { type: 'start' }, 'p0');
  for (let guard = 0; r.phase !== 'over' && guard < 10; guard++) {
    r = race.apply(r, { type: 'answer', index: r.question!.options.indexOf(r.question!.itemId) }, 'p1');
    r = race.apply(r, { type: 'next' }, 'p0');
  }
  assert.equal(r.phase, 'over');
  assert.ok(r.players.every((p) => p.tally === undefined));
  assert.equal(hasHonours(r), false);
  assert.equal(honours(r).size, 0);

  // A Delve run alone: a depth answered right counts nothing either.
  const clock = { now: 1000 };
  const delve = new Engine(items, { rng: seeded(5), now: () => clock.now });
  let d: GameState = createGame(null, { targetScore: 10, timer: 16, difficulty: 'cruel', mode: 'delve', public: false, locked: false });
  d = delve.apply(d, { type: 'join', playerId: 'p0', name: 'Ash' }, null);
  d = delve.apply(d, { type: 'start' }, null);
  d = delve.apply(d, { type: 'pick', category: d.offered.find((c) => !findOn(d, c))! }, null);
  d = delve.apply(d, { type: 'clock', askedAt: d.question!.askedAt }, null);
  d = delve.apply(d, { type: 'answer', index: d.question!.options.indexOf(d.question!.itemId) }, null);
  assert.equal(d.phase, 'reveal');
  assert.equal(d.players[0].tally, undefined);
});

// ---- who gets what ---------------------------------------------------------

const T = (t: Partial<Tally> = {}): Tally => ({ asked: 0, right: 0, best: 0, fooled: 0, behind: 0, ...t });

/** A turns game over, seated in this order: scores, tallies, winners (default: the top score). */
function over(rows: Array<{ score: number; tally?: Partial<Tally> }>, opts: { winners?: number[]; deathmatch?: boolean } = {}): GameState {
  const s = createGame(null, { targetScore: 10, timer: 0, difficulty: 'cruel', mode: 'turns', public: false, locked: false });
  s.players = rows.map(
    (r, i): Player => ({ id: `p${i}`, name: `P${i}`, score: r.score, recent: [], connected: true, hue: i, ...(r.tally ? { tally: T(r.tally) } : {}) }),
  );
  const top = Math.max(...rows.map((r) => r.score));
  s.winners = (opts.winners ?? [rows.findIndex((r) => r.score === top)]).map((i) => `p${i}`);
  s.phase = 'over';
  if (opts.deathmatch) s.deathmatch = { alive: [...s.winners], entrants: ['p0', 'p1'], round: 2, results: {}, eliminated: [], startedAt: 9 };
  return s;
}

const given = (s: GameState) => Object.fromEntries([...honours(s)].map(([id, h]) => [id, h.title]));

test('honours follow their order and thresholds, one per player, the first seated among equals', () => {
  // One player qualifies for everything: they take the first; each other honour goes to the next best.
  const all = over([
    { score: 10, tally: { asked: 10, right: 10, best: 10, fooled: 3, behind: 4, first: 0 } },
    { score: 9, tally: { asked: 10, right: 9, best: 6, fooled: 0, first: 1 } },
    { score: 9, tally: { asked: 10, right: 8, best: 2, fooled: 2, first: 2 } },
    { score: 5, tally: { asked: 10, right: 5, best: 2, fooled: 4, first: 3 } },
  ]);
  assert.deepEqual(given(all), { p0: 'The Comeback', p1: 'Ablaze', p2: 'Keen Eye', p3: 'Wild Imagination' });
  assert.equal(honours(all).get('p0')!.detail, 'Won after trailing by 4');
  assert.equal(honours(all).get('p1')!.detail, '6 in a row');
  assert.equal(honours(all).get('p2')!.detail, '8 of 10 right');
  assert.equal(honours(all).get('p3')!.detail, 'Believed in 4 made-up items');
  // The same state, the same honours, wherever it is read.
  assert.deepEqual([...honours(structuredClone(all))], [...honours(all)]);
  for (const s of [all, over([{ score: 3 }, { score: 2 }])]) {
    const titles = [...honours(s).values()].map((h) => h.title);
    assert.equal(new Set(titles).size, titles.length, 'each honour at most once');
  }

  // Ablaze: from three in a row; equal runs go to the first seated.
  assert.deepEqual(given(over([{ score: 5, tally: { best: 2 } }, { score: 2, tally: { best: 2 } }, { score: 1 }])), {});
  assert.equal(ABLAZE_FROM, 3);
  assert.deepEqual(given(over([{ score: 5, tally: { best: 2 } }, { score: 2, tally: { best: 3 } }, { score: 1, tally: { best: 3 } }])), { p1: 'Ablaze' });

  // Keen Eye: three asked at least, three in four right at least; the best share wins.
  assert.equal(KEEN_ASKED, 3);
  assert.equal(KEEN_SHARE, 0.75);
  assert.deepEqual(given(over([{ score: 5, tally: { asked: 2, right: 2 } }, { score: 1 }])), {});
  assert.deepEqual(given(over([{ score: 5, tally: { asked: 7, right: 5 } }, { score: 1 }])), {});
  const keen = over([{ score: 5, tally: { asked: 4, right: 3 } }, { score: 1, tally: { asked: 5, right: 4 } }]);
  assert.deepEqual(given(keen), { p1: 'Keen Eye' });
  assert.equal(honours(keen).get('p1')!.detail, '4 of 5 right');

  // The Comeback: only a winner, only from three behind.
  assert.equal(COMEBACK_FROM, 3);
  assert.deepEqual(given(over([{ score: 5, tally: { behind: 2 } }, { score: 1, tally: { behind: 5 } }])), {});
  assert.deepEqual(given(over([{ score: 5, tally: { behind: 3 } }, { score: 1 }])), { p0: 'The Comeback' });

  // First Blood: only whoever scored the game's first point, even when they already have an honour.
  assert.deepEqual(given(over([{ score: 5, tally: { first: 3 } }, { score: 1, tally: { first: 7 } }])), { p0: 'First Blood' });
  assert.deepEqual(given(over([{ score: 5, tally: { best: 4, first: 0 } }, { score: 1, tally: { first: 1 } }])), { p0: 'Ablaze' });

  // So Close: not the winner, a point short at most; level comes first.
  const close = over([{ score: 6 }, { score: 5 }, { score: 6 }, { score: 4 }], { winners: [0], deathmatch: true });
  assert.deepEqual(given(close), { p0: 'Last One Standing', p2: 'So Close' });
  assert.equal(honours(close).get('p2')!.detail, 'Level on points');
  assert.equal(honours(over([{ score: 6 }, { score: 5 }])).get('p1')!.detail, '1 point short');
  assert.deepEqual(given(over([{ score: 6 }, { score: 4 }])), {});

  // Wild Imagination: two made-up items at least.
  assert.equal(FOOLED_FROM, 2);
  assert.deepEqual(given(over([{ score: 6 }, { score: 2, tally: { fooled: 1 } }])), {});
  assert.deepEqual(given(over([{ score: 6 }, { score: 2, tally: { fooled: 2 } }, { score: 1, tally: { fooled: 3 } }])), { p2: 'Wild Imagination' });

  // Nothing before the end, in a race, in Delve, or for a game alone; an older host's players (no tallies) still get what scores tell.
  const playing = { ...over([{ score: 6 }, { score: 5 }]), phase: 'choosing' as const };
  assert.equal(honours(playing).size, 0);
  const race = over([{ score: 6 }, { score: 5 }]);
  race.settings.mode = 'race';
  assert.equal(honours(race).size, 0);
  assert.equal(honours({ ...over([{ score: 6 }, { score: 5 }]), delve: {} as GameState['delve'] }).size, 0);
  assert.equal(honours(over([{ score: 6, tally: { best: 6, first: 0 } }])).size, 0);
  assert.deepEqual(given(over([{ score: 6 }, { score: 5 }])), { p1: 'So Close' });
});

test('every title has three words at most, and no detail an em dash', () => {
  assert.equal(HONOUR_TITLES.length, 7);
  for (const title of HONOUR_TITLES) assert.ok(title.split(' ').length <= 3, title);
  // Every honour handed out, with numbers of one and of two digits.
  const states = [
    over(
      [
        { score: 12, tally: { asked: 12, right: 12, best: 12, behind: 0, first: 0 } },
        { score: 11, tally: { asked: 12, right: 10, best: 3, fooled: 0, first: 1 } },
        { score: 11, tally: { asked: 12, right: 11, best: 2, fooled: 11, first: 2 } },
        { score: 2, tally: { asked: 12, right: 2, best: 1, fooled: 0, first: 3 } },
      ],
      { deathmatch: true },
    ),
    over([
      { score: 10, tally: { behind: 10, first: 5 } },
      { score: 9, tally: { asked: 3, right: 3, first: 1 } },
      { score: 3, tally: { first: 0 } },
      { score: 1, tally: { fooled: 2 } },
    ]),
    over([{ score: 3 }, { score: 2, tally: { best: 3, first: 0 } }, { score: 2 }]),
  ];
  // Built from its code, so this file has none.
  const EM_DASH = String.fromCharCode(0x2014);
  const seen = new Set<string>();
  for (const s of states) {
    for (const h of honours(s).values()) {
      seen.add(h.title);
      assert.ok(!h.detail.includes(EM_DASH) && !h.title.includes(EM_DASH), h.detail);
      assert.match(h.detail, /^[A-Z0-9][\w -]+$/, 'a plain line, no bullets');
    }
  }
  assert.deepEqual([...seen].sort(), [...HONOUR_TITLES].sort(), 'every honour is handed out somewhere above');
});
