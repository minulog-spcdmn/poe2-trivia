import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ANSWER_GRACE_MS, createGame, Engine, type GameState, type Item, type Question } from '../src/lib/game.ts';
import { DELVE_LIVES, findOn } from '../src/lib/delve.ts';
import {
  PAIR_LIMIT,
  RIVAL_LIMIT,
  SEEN_LIMIT,
  emptyRivals,
  loadRivals,
  pairLines,
  parseRivals,
  recordCouch,
  recordGame,
  rivalLines,
  rivalTag,
  saveRivals,
  serializeRivals,
  type Rivals,
} from '../src/lib/rivals.ts';
import { storeKey } from '../src/lib/storage.ts';

const store = new Map<string, string>();
/** Storage blocked: every read and write throws. */
let blocked = false;
const guard = <T>(fn: () => T) => {
  if (blocked) throw new Error('SecurityError');
  return fn();
};
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => guard(() => store.get(k) ?? null),
  setItem: (k: string, v: string) => guard(() => void store.set(k, String(v))),
  removeItem: (k: string) => guard(() => void store.delete(k)),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() {
    return store.size;
  },
};
beforeEach(() => {
  store.clear();
  blocked = false;
});
const KEY = storeKey('rivals');

const items: Item[] = JSON.parse(readFileSync(new URL('../src/data/items.json', import.meta.url), 'utf8'));
const right = (q: Question) => q.options.indexOf(q.itemId);
const wrongIdx = (q: Question) => q.options.findIndex((o) => o !== q.itemId);

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

const clock = { now: 1_000_000 };
const engine = new Engine(items, { rng: seeded(11), now: () => clock.now });

/**
 * A room hosted by p0 (null: hot-seat), first to 1 point, played to its end
 * through the engine: only `winner` (a seat index) answers right. A
 * spectator ('late') comes in once it has started.
 */
function played(names: string[], winner = 0, opts: { hostId?: string | null; mode?: 'turns' | 'race' } = {}): GameState {
  clock.now += 60_000;
  const hostId = opts.hostId === undefined ? 'p0' : opts.hostId;
  const as = (id: string) => (hostId === null ? null : id);
  let s: GameState = createGame(hostId, { targetScore: 1, timer: 0, difficulty: 'cruel', mode: opts.mode ?? 'turns', public: false, locked: false });
  names.forEach((name, i) => (s = engine.apply(s, { type: 'join', playerId: `p${i}`, name }, as(`p${i}`))));
  s = engine.apply(s, { type: 'start' }, as('p0'));
  if (hostId !== null) s = engine.apply(s, { type: 'join', playerId: 'late', name: 'Late' }, 'late');
  const w = `p${winner}`;
  let n = 0;
  while (s.phase !== 'over' && n++ < 80) {
    if (s.settings.mode === 'race') {
      s = engine.apply(s, { type: 'answer', index: right(s.question!) }, w);
      s = engine.apply(s, { type: 'next' }, as('p0'));
      continue;
    }
    const me = s.players[s.turn].id;
    s = engine.apply(s, { type: 'pick', category: s.offered[0] }, as(me));
    const q = s.question!;
    s = engine.apply(s, { type: 'answer', index: me === w ? right(q) : wrongIdx(q) }, as(me));
    s = engine.apply(s, { type: 'next' }, as(me));
  }
  assert.equal(s.phase, 'over');
  assert.deepEqual(s.winners, [w]);
  return s;
}

/** What a browser seating `me` makes of the game just over: its records, and its lines. */
function online(s: GameState, me: string) {
  const r = saveRivals((x) => recordGame(x, s, me, clock.now));
  return { r, lines: r ? rivalLines(r, s, me) : [] };
}

const emDash = new RegExp(String.fromCharCode(0x2014));

test('recordGame counts online games played through the engine: a win, a loss, three players', () => {
  // Ash (p0, hosting) beats Bea: Ash's browser has a win, Bea's a loss.
  const g1 = played(['Ash', 'Bea'], 0);
  let r = recordGame(emptyRivals(), g1, 'p0', 5)!;
  assert.deepEqual(r.vs, { bea: { name: 'Bea', won: 1, lost: 0, last: 5, game: g1.startedAt } });
  assert.deepEqual(r.seen, [g1.startedAt]);
  assert.deepEqual(recordGame(emptyRivals(), g1, 'p1', 5)!.vs, { ash: { name: 'Ash', won: 0, lost: 1, last: 5, game: g1.startedAt } });
  // The next game, Bea wins: level.
  const g2 = played(['Ash', 'Bea'], 1);
  r = recordGame(r, g2, 'p0', 6)!;
  assert.deepEqual(r.vs.bea, { name: 'Bea', won: 1, lost: 1, last: 6, game: g2.startedAt });
  // A race counts too.
  r = recordGame(r, played(['Ash', 'Bea'], 0, { mode: 'race' }), 'p0', 7)!;
  assert.deepEqual([r.vs.bea.won, r.vs.bea.lost], [2, 1]);

  // Three: Cid wins. Ash lost to Cid, and nothing changes between Ash and Bea (both lost).
  // (Rivals are kept by the look of their name: Cid's is 'cld', an i reads as an l.)
  const g3 = played(['Ash', 'Bea', 'Cid'], 2);
  const ash = recordGame(r, g3, 'p0', 8)!;
  assert.deepEqual(ash.vs.cld, { name: 'Cid', won: 0, lost: 1, last: 8, game: g3.startedAt });
  assert.deepEqual(ash.vs.bea, r.vs.bea, 'both lost: not counted between them');
  // Cid's browser beat both.
  const cid = recordGame(emptyRivals(), g3, 'p2', 8)!;
  assert.deepEqual(
    Object.values(cid.vs)
      .map((x) => [x.name, x.won, x.lost])
      .sort(),
    [
      ['Ash', 1, 0],
      ['Bea', 1, 0],
    ],
  );
  // A rival no longer connected at the end isn't counted.
  const gone = engine.apply(g3, { type: 'connection', playerId: 'p1', connected: false }, null);
  assert.deepEqual(Object.keys(recordGame(emptyRivals(), gone, 'p2', 8)!.vs), ['ash']);
});

test('recordGame counts nothing for a spectator, a hot-seat state, a game still on or a Delve run; and a game only once', () => {
  const g = played(['Ash', 'Bea'], 0);
  assert.ok(g.spectators!.some((o) => o.id === 'late'));
  assert.equal(recordGame(emptyRivals(), g, 'late', 1), null, 'watching');
  assert.equal(recordGame(emptyRivals(), g, null, 1), null);
  assert.equal(recordGame(emptyRivals(), g, 'stranger', 1), null);
  const couch = played(['Ash', 'Bea'], 0, { hostId: null });
  assert.equal(recordGame(emptyRivals(), couch, 'p0', 1), null, 'hot-seat');
  const on = engine.apply(g, { type: 'restart', play: true }, 'p0');
  assert.equal(recordGame(emptyRivals(), on, 'p0', 1), null, 'not over');
  // Alone: nobody to count against.
  assert.equal(recordGame(emptyRivals(), played(['Ash'], 0), 'p0', 1), null);

  // Delve together, played to its end: nobody is counted.
  let d = engine.apply(g, { type: 'restart' }, 'p0');
  d = engine.apply(d, { type: 'settings', settings: { mode: 'delve' } }, 'p0');
  d = engine.apply(d, { type: 'start' }, 'p0');
  d = structuredClone(d);
  for (const p of d.players) d.delve!.losses[p.id] = Array(DELVE_LIVES - 1).fill(1);
  d = engine.apply(d, { type: 'pick', category: d.offered.find((c) => !findOn(d, c))! }, null);
  d = engine.apply(d, { type: 'clock', askedAt: d.question!.askedAt }, null);
  clock.now = d.question!.deadline! + ANSWER_GRACE_MS;
  d = engine.apply(d, { type: 'answer', index: null }, null);
  d = engine.apply(d, { type: 'next' }, null);
  assert.equal(d.phase, 'over');
  assert.ok(d.delve);
  assert.equal(recordGame(emptyRivals(), d, 'p0', 1), null, 'Delve');
  assert.equal(saveRivals((x) => recordGame(x, d, 'p0', 1))?.seen.length, 0);

  // Once: a reload into the end screen, or a second tab, finds it counted.
  const first = online(g, 'p0');
  assert.deepEqual(first.lines, ['Your first game against Bea on this device.']);
  const stored = store.get(KEY);
  const again = online(g, 'p0');
  assert.equal(store.get(KEY), stored, 'nothing written');
  assert.deepEqual(again.r!.vs.bea, first.r!.vs.bea);
  assert.deepEqual(again.lines, first.lines, 'the lines read again');
  // Another seat of the same browser (a second tab) doesn't count it either.
  assert.equal(recordGame(loadRivals(), g, 'p1', 1), null);
});

test('names merge by their look; the caps drop the oldest by last', () => {
  let r = recordGame(emptyRivals(), played(['Ash', 'Bea'], 0), 'p0', 1)!;
  r = recordGame(r, played(['Ash', 'bea'], 0), 'p0', 2)!;
  r = recordGame(r, played(['Ash', 'BEEA'], 1), 'p0', 3)!;
  assert.deepEqual(Object.keys(r.vs), ['bea']);
  assert.deepEqual([r.vs.bea.name, r.vs.bea.won, r.vs.bea.lost], ['BEEA', 2, 1], 'the latest spelling');
  assert.equal(rivalTag(r, 'Bea')?.text, 'You lead 2-1');

  // Distinct looks (no letter repeated or folded).
  const L = 'bcfghjkpqstxyz';
  const name = (n: number) => `Zed${L[n % L.length]}o${L[Math.floor(n / L.length)]}`;
  const many: Rivals = emptyRivals();
  for (let n = 0; n <= RIVAL_LIMIT; n++) {
    const k = name(n).toLowerCase();
    many.vs[k] = { name: name(n), won: 1, lost: 0, last: 100 + n };
  }
  for (let n = 0; n <= PAIR_LIMIT; n++) {
    const [a, b] = [name(n).toLowerCase(), `${name(n)}x`.toLowerCase()];
    many.pairs[`${a}|${b}`] = { names: [name(n), `${name(n)}x`], wins: [1, 0], last: 100 + n };
  }
  many.seen = Array.from({ length: SEEN_LIMIT + 5 }, (_, i) => i + 1);
  const read = parseRivals(JSON.stringify({ v: 1, ...many }));
  assert.equal(Object.keys(read.vs).length, RIVAL_LIMIT);
  assert.equal(read.vs[name(0).toLowerCase()], undefined, 'the oldest went');
  assert.ok(read.vs[name(1).toLowerCase()]);
  assert.equal(Object.keys(read.pairs).length, PAIR_LIMIT);
  assert.ok(!Object.values(read.pairs).some((p) => p.last === 100));
  assert.deepEqual(read.seen, many.seen.slice(-SEEN_LIMIT));
  // A new rival on a full store pushes the oldest out as it is saved.
  store.set(KEY, serializeRivals(read));
  const g = played(['Ash', 'Newcomer'], 0);
  const saved = saveRivals((x) => recordGame(x, g, 'p0', 999))!;
  assert.equal(Object.keys(saved.vs).length, RIVAL_LIMIT);
  assert.ok(saved.vs.newcomer);
  assert.equal(saved.vs[name(1).toLowerCase()], undefined);
  assert.deepEqual(loadRivals(), saved);
});

test('recordCouch records the winner against each other seat, and nothing for a shared win', () => {
  const g = played(['Ash', 'Bea', 'Cid'], 1, { hostId: null });
  let r = recordCouch(emptyRivals(), g, 7)!;
  assert.deepEqual(r.pairs, {
    'ash|bea': { names: ['Ash', 'Bea'], wins: [0, 1], last: 7, game: g.startedAt },
    'bea|cld': { names: ['Bea', 'Cid'], wins: [1, 0], last: 7, game: g.startedAt },
  });
  assert.deepEqual(r.vs, {});
  assert.equal(recordCouch(r, g, 8), null, 'once');
  // Online games are not the couch's.
  assert.equal(recordCouch(emptyRivals(), played(['Ash', 'Bea'], 0), 1), null);
  // Shared: counted as played, for nobody.
  const shared = structuredClone(played(['Ash', 'Bea', 'Cid'], 0, { hostId: null }));
  shared.winners = ['p0', 'p1'];
  const after = recordCouch(r, shared, 9)!;
  assert.deepEqual(after.pairs, r.pairs);
  assert.ok(after.seen.includes(shared.startedAt!));
  // Alone on the couch: nothing.
  assert.equal(recordCouch(emptyRivals(), played(['Ash'], 0, { hostId: null }), 1), null);
  // Two more for Ash over Bea: Ash leads.
  r = recordCouch(r, played(['Bea', 'Ash'], 1, { hostId: null }), 10)!;
  r = recordCouch(r, played(['Ash', 'Bea'], 0, { hostId: null }), 11)!;
  assert.deepEqual(r.pairs['ash|bea'].wins, [2, 1]);
  assert.deepEqual(pairLines(r, ['Bea', 'Ash', 'Cid']), ['Ash leads Bea 2-1 on this device.', 'Bea leads Cid 1-0 on this device.']);
});

test('parseRivals reads junk as an empty store; saveRivals leaves a newer version and unreadable storage alone', () => {
  for (const junk of [null, '', 'nope', '[]', '5', '{"v":1,"vs":5,"pairs":[],"seen":"x"}', '{"vs":{}}', '{"v":2,"vs":{}}'])
    assert.deepEqual(parseRivals(junk), emptyRivals(), String(junk));
  // Damaged entries go, sound ones stay.
  const mixed = parseRivals(
    JSON.stringify({
      v: 1,
      vs: {
        bea: { name: 'Bea', won: 2, lost: 1, last: 5 },
        cid: { name: 'Bea', won: 1, lost: 0, last: 5 },
        dora: { name: 'Dora', won: -1, lost: 0, last: 5 },
        eve: { name: 'Eve', won: 0, lost: 0, last: 5 },
        fin: 'Fin',
      },
      pairs: { 'ash|bea': { names: ['Ash', 'Bea'], wins: [1, 2], last: 3 }, 'bea|ash': { names: ['Bea', 'Ash'], wins: [1, 2], last: 3 }, x: 1 },
      seen: [4, 'x', -1, 9],
    }),
  );
  assert.deepEqual(mixed, {
    vs: { bea: { name: 'Bea', won: 2, lost: 1, last: 5 } },
    pairs: { 'ash|bea': { names: ['Ash', 'Bea'], wins: [1, 2], last: 3 } },
    seen: [4, 9],
  });

  const g = played(['Ash', 'Bea'], 0);
  // A newer build's records: never written over, nothing recorded.
  const newer = JSON.stringify({ v: 2, vs: { bea: { tally: 'x' } } });
  store.set(KEY, newer);
  assert.equal(saveRivals((x) => recordGame(x, g, 'p0', 1)), null);
  assert.equal(store.get(KEY), newer);
  assert.deepEqual(loadRivals(), emptyRivals());
  // Damaged: kept aside, and new records start.
  store.set(KEY, 'nope');
  assert.ok(saveRivals((x) => recordGame(x, g, 'p0', 1)));
  assert.equal(store.get(storeKey('rivals.unread')), 'nope');
  assert.equal(loadRivals().vs.bea.won, 1);
  // Storage that can't be read at all: nothing recorded, nothing thrown.
  store.clear();
  blocked = true;
  assert.equal(saveRivals((x) => recordGame(x, g, 'p0', 1)), null);
  assert.deepEqual(loadRivals(), emptyRivals());
  blocked = false;
  assert.equal(store.size, 0);
});

test('rivalTag, rivalLines and pairLines read as they should', () => {
  const r: Rivals = {
    vs: {
      bea: { name: 'Bea', won: 3, lost: 2, last: 1, game: 50 },
      cld: { name: 'Cid', won: 1, lost: 3, last: 1, game: 50 },
      dora: { name: 'Dora', won: 2, lost: 2, last: 1, game: 40 },
      eve: { name: 'Eve', won: 0, lost: 1, last: 1, game: 50 },
    },
    pairs: {
      'ash|bea': { names: ['Ash', 'Bea'], wins: [3, 2], last: 1, game: 50 },
      'bea|cld': { names: ['Bea', 'Cid'], wins: [2, 2], last: 1, game: 40 },
      'ash|cld': { names: ['Ash', 'Cid'], wins: [0, 1], last: 1, game: 50 },
    },
    seen: [40, 50],
  };
  assert.deepEqual(rivalTag(r, 'Bea'), {
    text: 'You lead 3-2',
    words: 'You lead',
    score: '3-2',
    title: 'Your games against Bea on this device: 3 won, 2 lost',
    lead: 1,
  });
  // On their row: the name is beside it. Known by the look of the name ('Cid' looks like 'cld').
  assert.deepEqual(rivalTag(r, 'cid'), {
    text: 'Leads you 3-1',
    words: 'Leads you',
    score: '3-1',
    title: 'Your games against cid on this device: 1 won, 3 lost',
    lead: -1,
  });
  assert.equal(rivalTag(r, 'Dora')?.text, 'Level 2-2');
  assert.equal(rivalTag(r, 'Zed'), null);

  const s = createGame('p0');
  s.phase = 'over';
  s.startedAt = 50;
  s.players = ['Ash', 'Bea', 'Cid', 'Dora', 'Eve'].map((name, i) => ({ id: `p${i}`, name, score: 0, recent: [], connected: true, hue: i }));
  // Most games first, two at most, only those this game counted.
  assert.deepEqual(rivalLines(r, s, 'p0'), ['You now lead Bea 3 to 2 across your games.', 'Cid leads you 3 to 1 across your games. Revenge?']);
  const level = { ...r, vs: { dora: { ...r.vs.dora, game: 50 }, eve: r.vs.eve } };
  assert.deepEqual(rivalLines(level, s, 'p0'), ['You and Dora are level at 2 games each.', 'Your first game against Eve on this device.']);
  assert.deepEqual(rivalLines({ ...r, vs: { dora: { name: 'Dora', won: 1, lost: 1, last: 1, game: 50 } } }, s, 'p0'), [
    'You and Dora are level at 1 game each.',
  ]);
  assert.deepEqual(rivalLines(r, { ...s, startedAt: 60 }, 'p0'), []);

  // The lobby: every pair of the party; the end screen: those the game counted.
  assert.deepEqual(pairLines(r, ['Ash', 'Bea', 'Cid']), ['Ash leads Bea 3-2 on this device.', 'Bea and Cid are level 2-2 on this device.']);
  assert.deepEqual(pairLines(r, ['Cid', 'Bea', 'Ash'], 50), ['Ash leads Bea 3-2 on this device.', 'Cid leads Ash 1-0 on this device.']);
  assert.deepEqual(pairLines(r, ['Cid', 'Bea']), ['Cid and Bea are level 2-2 on this device.'], 'by seat when level');
  assert.deepEqual(pairLines(r, ['Ash', 'Dora']), []);

  const all = [
    ...['Bea', 'Cid', 'Dora'].map((n) => rivalTag(r, n)!.text + rivalTag(r, n)!.title),
    ...rivalLines(r, s, 'p0'),
    ...rivalLines(level, s, 'p0'),
    ...pairLines(r, ['Ash', 'Bea', 'Cid']),
  ];
  for (const line of all) assert.ok(!emDash.test(line), line);
});
