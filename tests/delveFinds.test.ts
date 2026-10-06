import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DELVE_LIVES,
  DELVE_MAX_DYNAMITE,
  DELVE_MAX_FLARES,
  DELVE_MAX_WARDS,
  DELVE_MIN_TIMER,
  DYNAMITE_ON,
  FINDS,
  FINDS_FROM,
  FIND_RAMP_TO,
  FLARE_MS,
  SHARDS_PER_WARD,
  cavesIn,
  delveLockout,
  delveStandings,
  fellAt,
  findLosses,
  delveRules,
  delveTileVeil,
  delveTimer,
  dynamiteOf,
  findChance,
  findDepth,
  MAX_FINDS,
  SECOND_FIND,
  capShards,
  findOffer,
  findOffers,
  findOn,
  findReward,
  findRules,
  findTileVeil,
  findTimer,
  flaresOf,
  hasRoom,
  inventoryOf,
  itemsWorkOn,
  livesOf,
  questionTimer,
  shardsOf,
  tileVeilSize,
  veilSeconds,
  veinWindow,
  veinWindowMs,
  wardsOf,
  type FindKind,
  type Inventory,
} from '../src/lib/delve.ts';
import { ANSWER_GRACE_MS, Engine, activeRules, createGame, isFake, publicView, type Action, type GameState, type Item, type Question, type Settings } from '../src/lib/game.ts';
import { delveNotices, flareIn, inventoryChanges } from '../src/lib/delveSession.ts';
import { veilPace } from '../src/lib/patches.ts';

const items: Item[] = JSON.parse(readFileSync(new URL('../src/data/items.json', import.meta.url), 'utf8'));
const fakes: Record<string, string[]> = JSON.parse(readFileSync(new URL('../src/data/fakes.json', import.meta.url), 'utf8'));

const right = (q: Question) => q.options.indexOf(q.itemId);
const wrongIdx = (q: Question) => q.options.findIndex((o) => o !== q.itemId);

function seeded(seed: number) {
  // Spread small seeds apart, or their first rolls (who sits first) all come out alike.
  seed = Math.imul(seed, 2654435761) >>> 0;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

const NONE: Inventory = { wards: 0, flares: 0, dynamite: 0, shards: 0 };
const FULL: Inventory = { wards: DELVE_MAX_WARDS, flares: DELVE_MAX_FLARES, dynamite: DELVE_MAX_DYNAMITE, shards: 0 };

const SETTINGS: Settings = { targetScore: 10, timer: 16, difficulty: 'merciless', mode: 'delve', public: false, locked: false };

/** A Delve run with a controllable clock; `host` null for hot-seat. Helpers act as the trusted host. */
function delve(names: string[], opts: { host?: string | null; seed?: number } = {}) {
  const clock = { now: 1_000_000 };
  const engine = new Engine(items, { rng: seeded(opts.seed ?? 11), now: () => clock.now, fakes });
  const host = opts.host === undefined ? 'p0' : opts.host;
  let s: GameState = createGame(host, SETTINGS);
  names.forEach((name, i) => (s = engine.apply(s, { type: 'join', playerId: `p${i}`, name }, host === null ? null : `p${i}`)));
  s = engine.apply(s, { type: 'start' }, host);
  const h = {
    engine,
    clock,
    get s() {
      return s;
    },
    set s(v: GameState) {
      s = v;
    },
    act(a: Action, from: string | null = null) {
      s = engine.apply(s, a, from);
      return s;
    },
    active: () => s.players[s.turn],
    /** Changes the host's state by hand (a depth, an inventory, a find on offer). */
    edit(fn: (s: GameState) => void) {
      const c = structuredClone(s);
      fn(c);
      s = c;
    },
    /** Makes the first card on offer a find, as a lucky roll would. */
    plant(kind: FindKind = 'azurite') {
      h.edit((c) => (c.delve!.finds = [{ category: c.offered[0], kind }]));
      return s.offered[0];
    },
    give(id: string, inv: Partial<Inventory>) {
      h.edit((c) => ((c.delve!.inventory ??= {})[id] = { ...NONE, ...inv }));
    },
    clockIn: () => h.act({ type: 'clock', askedAt: s.question!.askedAt }),
    answer(ok: boolean, from: string | null = null) {
      const q = s.question!;
      return h.act({ type: 'answer', index: ok ? right(q) : wrongIdx(q), askedAt: q.askedAt }, from);
    },
    /** A whole turn on an ordinary card (never the find), answered right. */
    plainTurn() {
      h.act({ type: 'pick', category: s.offered.find((c) => !findOn(s, c))! });
      h.clockIn();
      h.answer(true);
      h.act({ type: 'next' });
    },
  };
  return h;
}

const at = (h: ReturnType<typeof delve>, depth: number) => h.edit((c) => (c.round = depth));

/**
 * A two-player online co-op run at `depth`: p0 hosts, p1 is a guest. The
 * helpers' trusted pick settles the vote; players answer as themselves.
 */
function coop(depth = 20, seed = 11) {
  const h = delve(['Ash', 'Brea'], { seed });
  at(h, depth);
  return h;
}

// ---- the rules -------------------------------------------------------------

const KNOBS = ['options', 'similarNames', 'fakes', 'grayChance', 'mirror'] as const;
/** A knob's value as a number that only grows as the curve gets harder (no grayscale chance is none). */
const level = (_: (typeof KNOBS)[number], v: unknown) => (v as number | undefined) ?? 0;
const LIVE = ['azurite', 'flare'] as const;
const DEEPER: Record<FindKind, number> = { azurite: 15, flare: 20, dynamite: 15 };

test('an Azurite Vein asks the question of fifteen depths deeper, a Flare Cache of twenty: its rules, its clock and its pictures\' veil', () => {
  assert.deepEqual(
    FINDS.map((f) => [f.kind, f.deeper]),
    Object.entries(DEEPER),
  );
  for (const kind of ['azurite', 'flare', 'dynamite'] as const)
    for (const d of [FINDS_FROM, 8, 12, 13, 20, 40, 59, 60, 75, 300]) {
      const deeper = d + DEEPER[kind];
      const [r, deep] = [findRules(kind, d), delveRules(deeper)];
      assert.equal(findDepth(kind, d), deeper);
      for (const k of KNOBS) assert.equal(r[k], deep[k], `${kind} ${k} at ${d}`);
      assert.deepEqual(r.veil, deep.veil, `veil at ${d}`);
      assert.equal(r.moreFakes, deep.moreFakes, `fourth fakes at ${d}`);
      assert.equal(r.lookalikes, deep.lookalikes, `look-alike pictures at ${d}`);
      assert.equal(findTimer(kind, d), delveTimer(deeper));
      assert.equal(findTileVeil(kind, d), delveTileVeil(deeper));
      // Neither the art/name mix nor the lockout makes a question harder: they stay the depth's.
      assert.equal(r.artChance, delveRules(d).artChance);
      assert.equal(r.lockout, delveLockout(d));
    }
  // Odd depths read as the surface.
  assert.equal(findDepth('flare', NaN), 21);
  assert.deepEqual([findDepth('azurite', 20), findDepth('flare', 20)], [35, 40]);
});

test('a find is never easier than its depth, nearly always harder, and the hardest there is only once its question is from 150 down', () => {
  const deepest = delveRules(1000);
  for (const kind of LIVE)
    for (let d = FINDS_FROM; d <= 200; d++) {
      const [r, here] = [findRules(kind, d), delveRules(d)];
      for (const k of KNOBS) assert.ok(level(k, r[k]) >= level(k, here[k]), `${kind}: ${k} eases at ${d}`);
      assert.ok(findTimer(kind, d) <= delveTimer(d), `more time at ${d}`);
      const harder =
        KNOBS.some((k) => r[k] !== here[k]) ||
        JSON.stringify(r.veil) !== JSON.stringify(here.veil) ||
        (r.moreFakes ?? 0) > (here.moreFakes ?? 0) ||
        (r.lookalikes ?? 0) > (here.lookalikes ?? 0) ||
        findTileVeil(kind, d) > delveTileVeil(d) ||
        findTimer(kind, d) < delveTimer(d);
      assert.ok(findTileVeil(kind, d) >= delveTileVeil(d), `fewer veiled pictures at ${d}`);
      // Harder wherever the curve has anything harder further down (the tile veil rises to 124, the fourth fakes to 150).
      if (d < 150) assert.ok(harder, `${kind}: nothing harder at ${d}`);
      const hardest =
        KNOBS.every((k) => r[k] === deepest[k]) && JSON.stringify(r.veil) === JSON.stringify(deepest.veil) && r.moreFakes === 1 && findTimer(kind, d) === DELVE_MIN_TIMER;
      assert.equal(hardest, findDepth(kind, d) >= 150, `${kind}: the hardest question at ${d}`);
    }
});

test("a find's clock is fair: never the shortest near the top, and never shorter than any depth's", () => {
  // At the first finds, a vein gets 14 s, not the 5 of depth 96.
  assert.equal(findTimer('azurite', FINDS_FROM), 14);
  assert.equal(findTimer('azurite', 8), 15 - 1);
  assert.equal(findTimer('azurite', 20), 12);
  assert.equal(findTimer('flare', 15), 12);
  assert.equal(findTimer('flare', 20), 11);
  assert.equal(findTimer('azurite', 43), 7);
  assert.equal(findTimer('flare', 38), 7);
  assert.equal(findTimer('azurite', 63), 6);
  assert.equal(findTimer('flare', 58), 6);
  // The shortest clock only past depth 75, where the depth's own is 6 s at the least.
  assert.equal(findTimer('azurite', 80), DELVE_MIN_TIMER + 1);
  assert.equal(findTimer('azurite', 81), DELVE_MIN_TIMER);
  assert.equal(findTimer('flare', 75), DELVE_MIN_TIMER + 1);
  assert.equal(findTimer('flare', 76), DELVE_MIN_TIMER);
  for (const kind of LIVE) for (let d = 1; d <= 300; d++) if (findTimer(kind, d) === DELVE_MIN_TIMER) assert.ok(delveTimer(d) > DELVE_MIN_TIMER || d >= 96, `${kind} at ${d}`);
  for (const kind of LIVE) for (let d = 1; d <= 300; d++) assert.ok(findTimer(kind, d) >= DELVE_MIN_TIMER && findTimer(kind, d) <= 16);
});

test('even a find has half its art in with over 3 s left, and an Azurite Vein half of it in before its window closes', () => {
  for (const kind of LIVE)
    for (let d = FINDS_FROM; d <= 300; d++) {
      const secs = findTimer(kind, d);
      const ms = secs * 1000;
      const veil = findRules(kind, d).veil;
      if (!veil) continue;
      // The art of a name question (see tests/delve.test.ts for where these timings come from), faster on a short clock.
      const whole = veilPace(veilSeconds(secs, veil.share, veil.size) * 1000, veil.size ** 2);
      const halfArt = 400 + (veil.size ** 2 / 2) * whole.gap + whole.burn;
      // A "find the art" picture, the last of which starts up to half a step late.
      const count = tileVeilSize(veil.size) ** 2;
      const tile = veilPace(veilSeconds(secs, veil.share, tileVeilSize(veil.size), true) * 1000, count);
      const halfTile = 400 + tile.gap / 2 + (count / 2) * tile.gap + tile.burn;
      for (const half of [halfArt, halfTile]) {
        assert.ok(ms - half >= 3000, `${kind} at ${d}: ${Math.round(ms - half)} ms left with half the art in`);
        if (kind === 'azurite') assert.ok(half <= veinWindow(secs), `depth ${d}: half the art in at ${Math.round(half)} ms, the window closes at ${veinWindow(secs)}`);
      }
    }
});

test("the Azurite Vein's window is the first half of the clock, in whole seconds", () => {
  for (let secs = DELVE_MIN_TIMER; secs <= 16; secs++) {
    const w = veinWindow(secs);
    assert.equal(w % 1000, 0, `${secs} s`);
    assert.ok(w >= (secs * 1000) / 2 && w < (secs * 1000) / 2 + 1000, `${secs} s: ${w}`);
  }
  assert.equal(veinWindow(13), 7000);
  assert.equal(veinWindow(7), 4000);
  assert.equal(veinWindow(16), 8000);
});

// ---- rewards ---------------------------------------------------------------

test("a right answer to a find earns its own item, and nothing else when there's no room for it", () => {
  assert.equal(findReward('azurite', NONE, true), 'wards');
  assert.equal(findReward('azurite', NONE, false), 'shards');
  assert.equal(findReward('flare', NONE, false), 'flares');
  assert.equal(findReward('dynamite', NONE, false), 'dynamite');
  assert.equal(findReward('flare', NONE, true), 'flares', 'speed only matters to a vein');
  // A shard toward the last ward there is room for.
  assert.equal(findReward('azurite', { ...NONE, wards: 2, shards: 1 }, false), 'shards');
  assert.equal(hasRoom({ ...NONE, wards: 2, shards: 1 }, 'shards'), true);
  assert.equal(hasRoom({ ...NONE, wards: 3 }, 'shards'), false);
  // Full of it: nothing, never something else instead.
  for (const fast of [true, false]) {
    assert.equal(findReward('azurite', { ...NONE, wards: 3 }, fast), null);
    assert.equal(findReward('flare', { ...NONE, flares: 3 }, fast), null);
    assert.equal(findReward('dynamite', { ...NONE, dynamite: 3 }, fast), null);
    for (const kind of ['azurite', 'flare', 'dynamite'] as const) assert.equal(findReward(kind, FULL, fast), null);
  }
});

// ---- the offer -------------------------------------------------------------

test('each find ramps from a low chance at its first depth to its cap at depth 50, fixed by depth; the Flare Cache comes deepest', () => {
  assert.deepEqual(
    FINDS.map((f) => [f.kind, f.item, f.max]),
    [
      ['azurite', 'wards', DELVE_MAX_WARDS],
      ['flare', 'flares', DELVE_MAX_FLARES],
      ['dynamite', 'dynamite', DELVE_MAX_DYNAMITE],
    ],
  );
  assert.deepEqual([DELVE_MAX_WARDS, DELVE_MAX_FLARES, DELVE_MAX_DYNAMITE, SHARDS_PER_WARD], [3, 3, 3, 2]);
  assert.equal(FIND_RAMP_TO, 50);
  assert.equal(FINDS_FROM, 5);
  // Where each starts, and how.
  assert.deepEqual([findChance('azurite', 4), findChance('azurite', 5)], [0, 0.04]);
  assert.deepEqual([findChance('flare', 14), findChance('flare', 15)], [0, 0.04]);
  const live = FINDS.filter((f) => f.cap > 0);
  assert.ok(Math.max(...live.map((f) => f.from)) === findFor('flare').from, 'the Flare Cache comes deepest');
  for (const f of live) {
    let prev = 0;
    for (let d = 1; d <= 120; d++) {
      const c = findChance(f.kind, d);
      assert.ok(c >= prev, `${f.kind} never less likely deeper (${d})`);
      if (d >= f.from && d < FIND_RAMP_TO) assert.ok(c < f.cap, `${f.kind} below its cap at ${d}`);
      if (d >= FIND_RAMP_TO) assert.equal(c, f.cap, `${f.kind} at its cap from ${FIND_RAMP_TO}`);
      prev = c;
    }
    assert.equal(findChance(f.kind, 50), findChance(f.kind, 300), 'held from there on');
  }
  // Rare at first, about one offer in three by depth 50.
  const total = (d: number) => FINDS.reduce((sum, f) => sum + findChance(f.kind, d), 0);
  assert.equal(total(4), 0);
  assert.ok(total(5) <= 0.05, `${total(5)} at 5`);
  assert.ok(total(15) >= 0.1 && total(15) <= 0.15, `${total(15)} at 15`);
  assert.ok(Math.abs(total(50) - 0.33) < 0.005, `${total(50)} at 50`);
  assert.equal(total(200), total(50));
  // Odd depths read as the surface.
  for (const d of [NaN, -3, 0]) assert.equal(total(d), 0);
});

/** The find that yields an item (as delve.ts findFor). */
const findFor = (kind: FindKind) => FINDS.find((f) => f.kind === kind)!;

/** Every find's chance at depth `d`, together: how often an offer holds at least one. */
const anyFind = (d: number) => FINDS.reduce((sum, f) => sum + findChance(f.kind, d), 0);
/**
 * How often an offer at depth `d` holds a find of `kind`, first or second:
 * its own chance, plus each other kind's times SECOND_FIND of its own.
 */
const present = (kind: FindKind, d: number) => findChance(kind, d) * (1 + SECOND_FIND * (anyFind(d) - findChance(kind, d)));
/** How often an offer at depth `d` holds two finds: any first, then another kind at SECOND_FIND of its chance. */
const double = (d: number) => FINDS.reduce((sum, f) => sum + findChance(f.kind, d) * SECOND_FIND * (anyFind(d) - findChance(f.kind, d)), 0);

test('the Dynamite Cache turns up from depth 10, 4% rising to 9% at 50, between the vein and the flare', () => {
  assert.equal(DYNAMITE_ON, true);
  assert.deepEqual(
    FINDS.map((f) => [f.kind, f.from, f.start, f.cap]),
    [
      ['azurite', 5, 0.04, 0.11],
      ['flare', 15, 0.04, 0.13],
      ['dynamite', 10, 0.04, 0.09],
    ],
  );
  assert.deepEqual([9, 10, 30, 50, 120].map((d) => findChance('dynamite', d)), [0, 0.04, 0.065, 0.09, 0.09]);
  // The rarest of the three at its cap, and rarer than the vein from the start of the flare's.
  for (let d = 15; d <= 200; d++) assert.ok(findChance('dynamite', d) < findChance('flare', d) || d < 50, `${d}`);
  assert.ok(findChance('dynamite', 50) < findChance('azurite', 50));
  // Rolled as often as its chance, for a player with room for it.
  const h = delve(['Ash'], { seed: 9 });
  let seen = 0;
  for (let i = 0; i < 600; i++) {
    h.edit((c) => (c.round = 50));
    if (findOffers(h.s).some((f) => f.kind === 'dynamite')) seen++;
    h.plainTurn();
  }
  // A little more often than 9% of offers: it may also come second, beside another find.
  const p = present('dynamite', 50);
  assert.ok(p > 0.09 && p < 0.105, `${p}`);
  assert.ok(Math.abs(seen - 600 * p) < 4 * Math.sqrt(600 * p), `${seen} Dynamite Caches in 600 offers`);
});

test('one roll per offer and one more beside a find: at most two, on different cards and of different kinds, each from its depth, about as often as its chance there', () => {
  const h = delve(['Ash'], { seed: 3 });
  at(h, 1);
  const seen: Record<FindKind, number> = { azurite: 0, flare: 0, dynamite: 0 };
  const expected: Record<FindKind, number> = { azurite: 0, flare: 0, dynamite: 0 };
  for (let i = 0; i < 1500; i++) {
    const s = h.s;
    assert.equal(s.phase, 'choosing');
    const finds = findOffers(s);
    assert.deepEqual(finds, s.delve!.finds);
    assert.ok(finds.length <= MAX_FINDS && MAX_FINDS === 2, 'never three');
    assert.equal(new Set(finds.map((f) => f.category)).size, finds.length, 'each on its own card');
    assert.equal(new Set(finds.map((f) => f.kind)).size, finds.length, 'each of its own kind');
    assert.deepEqual(findOffer(s), finds[0] ?? null);
    for (const f of finds) {
      assert.ok(s.offered.includes(f.category), 'the find is one of the cards on offer');
      assert.ok(findChance(f.kind, s.round) > 0, `${f.kind} at depth ${s.round}`);
      assert.equal(findOn(s, f.category), f.kind);
      seen[f.kind]++;
    }
    for (const x of FINDS) expected[x.kind] += present(x.kind, s.round);
    // Never answering a find keeps the player empty-handed, so every find stays on offer.
    h.plainTurn();
  }
  for (const x of FINDS) {
    const sd = Math.sqrt(Math.max(1, expected[x.kind]));
    assert.ok(Math.abs(seen[x.kind] - expected[x.kind]) < 4 * sd, `${x.kind}: ${seen[x.kind]}, expected about ${Math.round(expected[x.kind])}`);
  }
});

test('two finds side by side are rare early and grow less rare with depth, and as many offers hold a find as with one roll', () => {
  // The rates, as SECOND_FIND says: about 1 offer in 500 at depth 10, 1 in 100 at 20, 1 in 28 from 50.
  assert.equal(SECOND_FIND, 0.5);
  assert.equal(double(5), 0, 'only the vein so shallow: nothing to go beside it');
  assert.ok(double(10) > 0.001 && double(10) < 0.003, `${double(10)} at 10`);
  assert.ok(double(20) > 0.007 && double(20) < 0.012, `${double(20)} at 20`);
  assert.ok(double(50) > 0.03 && double(50) < 0.04, `${double(50)} at 50`);
  assert.equal(double(200), double(50));
  for (let d = 10; d < 50; d++) assert.ok(double(d + 1) >= double(d), `growing at ${d}`);
  // A ninth of the offers with a find hold two from depth 50, fewer above.
  assert.ok(double(50) / anyFind(50) < 0.12 && double(20) / anyFind(20) < 0.06);
  // Simulated: offers rolled by the engine at each depth, for a player with room for everything.
  const h = delve(['Ash'], { seed: 21 });
  const roll = (h.engine as unknown as { beginTurn(s: GameState, first: boolean): void }).beginTurn.bind(h.engine);
  const N = 20_000;
  for (const d of [10, 20, 50]) {
    let one = 0;
    let two = 0;
    const s = structuredClone(h.s);
    for (let i = 0; i < N; i++) {
      s.round = d;
      roll(s, false);
      const n = findOffers(s).length;
      if (n >= 1) one++;
      if (n === 2) two++;
    }
    const near = (seen: number, p: number, what: string) =>
      assert.ok(Math.abs(seen - N * p) < 4 * Math.sqrt(N * p * (1 - p)) + 1, `${what} at ${d}: ${seen} of ${N}, expected about ${Math.round(N * p)}`);
    near(one, anyFind(d), 'offers with a find');
    near(two, double(d), 'offers with two');
  }
});

test("a find whose item the player is full of is never offered, and the others' chances stay the depth's", () => {
  // Full of wards: never a vein, flares as often as ever.
  const runs = (inv: Partial<Inventory>) => {
    const h = delve(['Ash'], { seed: 5 });
    at(h, 50);
    h.give(h.active().id, inv);
    const seen: Record<FindKind, number> = { azurite: 0, flare: 0, dynamite: 0 };
    for (let i = 0; i < 400; i++) {
      for (const f of findOffers(h.s)) seen[f.kind]++;
      h.edit((c) => (c.round = 50));
      h.plainTurn();
    }
    return seen;
  };
  const wardsFull = runs({ wards: DELVE_MAX_WARDS });
  assert.equal(wardsFull.azurite, 0);
  assert.ok(wardsFull.flare > 400 * findChance('flare', 50) * 0.6, `${wardsFull.flare} flares`);
  const flaresFull = runs({ flares: DELVE_MAX_FLARES });
  assert.equal(flaresFull.flare, 0);
  assert.ok(flaresFull.azurite > 400 * findChance('azurite', 50) * 0.6, `${flaresFull.azurite} veins`);
  // Two wards and a shard: room for one more, so veins still come.
  assert.ok(runs({ wards: 2, shards: 1 }).azurite > 0);
  // Full of everything: nothing at all.
  assert.deepEqual(runs(FULL), { azurite: 0, flare: 0, dynamite: 0 });
});

// ---- a find's question -----------------------------------------------------

test('picking a find asks the question of its deeper depth, on its clock', () => {
  let names = 0;
  let arts = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const kind = (['azurite', 'flare', 'dynamite'] as const)[seed % 3];
    const depth = [FINDS_FROM, 15, 60][seed % 3];
    const h = delve(['Ash'], { seed });
    at(h, depth);
    h.edit((c) => (c.offered = h.engine.offerCategories(c, c.players[0])));
    const card = h.plant(kind);
    h.act({ type: 'pick', category: card });
    const q = h.s.question!;
    const rules = findRules(kind, depth);
    assert.equal(q.find, kind);
    assert.equal(q.blasted, undefined);
    assert.deepEqual(activeRules(h.s), rules);
    assert.equal(q.options.length, rules.options);
    if (q.mode === 'name') {
      names++;
      assert.equal(q.options.filter(isFake).length, rules.fakes, 'its made-up names');
      if (rules.mirror === 1) assert.deepEqual(q.mirrored, [true]);
      if (rules.veil) assert.equal(q.veil!.size, rules.veil.size);
      else assert.equal(q.veil, null);
    } else {
      arts++;
      if (rules.mirror === 1) assert.ok(q.mirrored!.every(Boolean), 'every picture mirrored');
      if (q.veil) assert.equal(q.veil.size, tileVeilSize(rules.veil!.size), 'a "find the art" picture burns in, cut coarser');
    }
    if (q.veil) assert.equal(q.veil.seconds, veilSeconds(findTimer(kind, depth), rules.veil!.share, q.veil.size, q.mode === 'art'));
    h.clockIn();
    assert.equal(h.s.question!.deadline! - h.s.question!.clockAt!, findTimer(kind, depth) * 1000);
    assert.equal(questionTimer(h.s), findTimer(kind, depth));
    assert.equal(veinWindowMs(h.s), kind === 'azurite' ? veinWindow(findTimer(kind, depth)) : 0);
    assert.equal(h.active().recent.at(-1), card, 'locked like any pick');
  }
  assert.ok(names > 0 && arts > 0, `${names} name and ${arts} art questions`);
});

test('the other cards beside a find ask questions of the depth', () => {
  const h = delve(['Ash']);
  at(h, 13);
  h.plant();
  h.act({ type: 'pick', category: h.s.offered[1] });
  assert.equal(h.s.question!.find, undefined);
  assert.deepEqual(activeRules(h.s), delveRules(13));
  h.clockIn();
  assert.equal(h.s.question!.deadline! - h.s.question!.clockAt!, delveTimer(13) * 1000);
  assert.equal(veinWindowMs(h.s), 0);
});

/** A run at depth 20 with a find picked and its clock started. */
function found(kind: FindKind, opts: { host?: string | null; inv?: Partial<Inventory> } = { host: null }) {
  const h = delve(['Ash'], opts);
  at(h, 20);
  if (opts.inv) h.give(h.active().id, opts.inv);
  h.act({ type: 'pick', category: h.plant(kind) });
  h.clockIn();
  return h;
}

/** The fast window of a vein at depth 20. */
const WINDOW = veinWindow(findTimer('azurite', 20));

test('a right answer to a Flare or Dynamite Cache earns its item at any speed', () => {
  for (const kind of ['flare', 'dynamite'] as const) {
    const h = found(kind);
    const id = h.active().id;
    h.clock.now += findTimer(kind, 20) * 1000 - 100;
    h.answer(true);
    assert.equal(h.s.reveal!.gained, kind === 'flare' ? 'flares' : 'dynamite');
    assert.deepEqual(inventoryOf(h.s, id), { ...NONE, flares: kind === 'flare' ? 1 : 0, dynamite: kind === 'dynamite' ? 1 : 0 });
  }
});

test('an Azurite Vein mines a ward for a fast right answer, and a shard for a slow one; two shards forge a ward', () => {
  const fast = found('azurite');
  const id = fast.active().id;
  fast.clock.now += WINDOW;
  fast.answer(true);
  assert.equal(wardsOf(fast.s, id), 1);
  assert.equal(fast.s.reveal!.gained, 'wards');
  assert.equal(fast.s.reveal!.forged, undefined);

  const slow = found('azurite');
  slow.clock.now += WINDOW + 1;
  let prev = slow.s;
  slow.answer(true);
  assert.deepEqual(inventoryOf(slow.s, id), { ...NONE, shards: 1 });
  assert.equal(slow.s.reveal!.correct, true);
  assert.equal(slow.s.reveal!.gained, 'shards');
  assert.equal(livesOf(slow.s, id), DELVE_LIVES);
  assert.deepEqual(inventoryChanges(prev, slow.s), [{ playerId: id, item: 'shards', change: 'gained', left: 1 }]);

  // A second slow one forges the ward.
  const again = found('azurite', { host: null, inv: { shards: 1 } });
  again.clock.now += findTimer('azurite', 20) * 1000 - 50;
  prev = again.s;
  again.answer(true);
  assert.deepEqual(inventoryOf(again.s, id), { ...NONE, wards: 1 });
  assert.equal(again.s.reveal!.gained, 'wards');
  assert.equal(again.s.reveal!.forged, true);
  assert.deepEqual(inventoryChanges(prev, again.s), [
    { playerId: id, item: 'wards', change: 'gained', left: 1 },
    { playerId: id, item: 'shards', change: 'used', left: 0 },
  ]);

  // A fast one leaves a shard held for the next.
  const kept = found('azurite', { host: null, inv: { shards: 1 } });
  kept.answer(true);
  assert.deepEqual(inventoryOf(kept.s, id), { ...NONE, wards: 1, shards: 1 });
});

test('three wards are the most, with no shard beside them: a fast ward, a forge or an odd state that reaches three drops the shard', () => {
  assert.deepEqual(capShards({ ...NONE, wards: 3, shards: 1 }), { ...NONE, wards: 3 });
  assert.deepEqual(capShards({ ...NONE, wards: 2, shards: 1 }), { ...NONE, wards: 2, shards: 1 });
  // A fast vein's ward makes three: the shard held goes.
  const fast = found('azurite', { host: null, inv: { wards: 2, shards: 1 } });
  const id = fast.active().id;
  const prev = fast.s;
  fast.answer(true);
  assert.equal(fast.s.reveal!.gained, 'wards');
  assert.deepEqual(inventoryOf(fast.s, id), { ...NONE, wards: 3 });
  assert.deepEqual(fast.s.delve!.inventory![id], { ...NONE, wards: 3 }, 'stored without it too');
  assert.deepEqual(inventoryChanges(prev, fast.s), [
    { playerId: id, item: 'wards', change: 'gained', left: 3 },
    { playerId: id, item: 'shards', change: 'used', left: 0 },
  ]);
  // A slow one forges the third from the shard.
  const slow = found('azurite', { host: null, inv: { wards: 2, shards: 1 } });
  slow.clock.now += WINDOW + 1;
  slow.answer(true);
  assert.equal(slow.s.reveal!.forged, true);
  assert.deepEqual(inventoryOf(slow.s, id), { ...NONE, wards: 3 });
  // A hand-made or older state with three wards and a shard reads as none, and a full player is offered no vein.
  const odd = delve(['Ash']);
  odd.give(id, { wards: 3, shards: 1 });
  assert.deepEqual(inventoryOf(odd.s, id), { ...NONE, wards: 3 });
  assert.equal(hasRoom(inventoryOf(odd.s, id), 'shards'), false);
  // Spending a ward from three leaves two and still no shard.
  odd.act({ type: 'pick', category: odd.s.offered.find((c) => !findOn(odd.s, c))! });
  odd.clockIn();
  odd.answer(false);
  assert.deepEqual(inventoryOf(odd.s, id), { ...NONE, wards: 2 });
});

test('a find planted for a player full of its item: a right answer stands, with nothing to carry', () => {
  for (const [kind, inv] of [
    ['azurite', { wards: 3 }],
    ['flare', { flares: 3 }],
    ['flare', FULL],
  ] as const) {
    const h = found(kind, { host: null, inv });
    const id = h.active().id;
    h.answer(true);
    assert.equal(h.s.reveal!.correct, true);
    assert.equal(h.s.reveal!.gained, undefined);
    assert.deepEqual(inventoryOf(h.s, id), { ...NONE, ...inv });
  }
});

test('wrong or out of time on a Flare or Dynamite Cache costs a life like any other', () => {
  for (const kind of ['flare', 'dynamite'] as const) {
    const wrong = found(kind);
    const id = wrong.active().id;
    wrong.answer(false);
    assert.equal(livesOf(wrong.s, id), DELVE_LIVES - 1);
    assert.deepEqual(inventoryOf(wrong.s, id), NONE);
    assert.equal(wrong.s.reveal!.gained, undefined);
    assert.equal(wrong.s.reveal!.caveIn, undefined);
    assert.equal(wrong.s.reveal!.lost, undefined);
    const late = found(kind);
    late.clock.now += findTimer(kind, 20) * 1000 + ANSWER_GRACE_MS + 1;
    late.act({ type: 'answer', index: null, askedAt: late.s.question!.askedAt });
    assert.equal(livesOf(late.s, id), DELVE_LIVES - 1);
    assert.deepEqual(inventoryOf(late.s, id), NONE);
  }
});

// ---- the cave-in -----------------------------------------------------------

test('only an Azurite Vein caves in', () => {
  assert.deepEqual(
    (['azurite', 'flare', 'dynamite'] as const).map((k) => [findLosses(k), cavesIn(k)]),
    [
      [2, true],
      [1, false],
      [1, false],
    ],
  );
});

test('a wrong answer or a time-out on an Azurite Vein caves in: two losses, a ward taking each first, never more than the last life', () => {
  // [lives, wards] before → [lives, wards] after, and what the reveal says.
  const cases: [number, number, number, number, boolean][] = [
    // lives, wards, lives after, wards after, warded (no life lost)
    [3, 0, 1, 0, false],
    [3, 1, 2, 0, false],
    [3, 2, 3, 0, true],
    [3, 3, 3, 1, true],
    [2, 0, 0, 0, false],
    [2, 1, 1, 0, false],
    [2, 2, 2, 0, true],
    [2, 3, 2, 1, true],
    [1, 0, 0, 0, false],
    [1, 1, 0, 0, false],
    [1, 2, 1, 0, true],
    [1, 3, 1, 1, true],
  ];
  for (const timedOut of [false, true])
    for (const [lives, wards, livesAfter, wardsAfter, warded] of cases) {
      const h = delve(['Ash'], { host: null });
      at(h, 20);
      const id = h.active().id;
      h.edit((c) => (c.delve!.losses[id] = [3, 7].slice(0, DELVE_LIVES - lives)));
      h.give(id, { wards });
      h.edit((c) => (c.players[0].streak = 4));
      h.act({ type: 'pick', category: h.plant('azurite') });
      h.clockIn();
      const prev = h.s;
      if (timedOut) {
        h.clock.now += findTimer('azurite', 20) * 1000 + ANSWER_GRACE_MS + 1;
        h.act({ type: 'answer', index: null, askedAt: h.s.question!.askedAt });
      } else h.answer(false);
      const what = `${lives} lives, ${wards} wards${timedOut ? ', timed out' : ''}`;
      const r = h.s.reveal!;
      assert.equal(livesOf(h.s, id), livesAfter, what);
      assert.equal(wardsOf(h.s, id), wardsAfter, what);
      assert.equal(r.caveIn, true, what);
      assert.deepEqual(r.lost, { lives: lives - livesAfter, wards: wards - wardsAfter }, what);
      assert.equal(r.warded, warded || undefined, what);
      assert.equal(r.timedOut, timedOut, what);
      assert.equal(h.s.players[0].streak, 0, what);
      // The losses list takes one entry per life, the same depth twice for two.
      assert.deepEqual(h.s.delve!.losses[id], [...[3, 7].slice(0, DELVE_LIVES - lives), ...Array(lives - livesAfter).fill(20)], what);
      assert.equal(fellAt(h.s, id), livesAfter === 0 ? 20 : null, what);
      // Guests see the cave-in and what it took.
      assert.deepEqual([publicView(h.s).reveal!.caveIn, publicView(h.s).reveal!.lost], [r.caveIn, r.lost], what);
      if (wards - wardsAfter) assert.ok(inventoryChanges(prev, h.s).some((c) => c.item === 'wards' && c.change === 'used'), what);
      if (livesAfter === 0) {
        h.act({ type: 'next' });
        assert.equal(h.s.phase, 'over', `${what}: a solo run ends`);
      }
    }
});

test('a right answer to a vein still pays, and dynamite held over one neither goes off nor saves it from its cave-in', () => {
  const ok = found('azurite');
  ok.answer(true);
  assert.equal(ok.s.reveal!.caveIn, undefined);
  assert.equal(ok.s.reveal!.gained, 'wards');

  const h = delve(['Ash'], { host: null });
  at(h, 20);
  const id = h.active().id;
  h.give(id, { dynamite: 1 });
  h.act({ type: 'pick', category: h.plant('azurite') });
  h.clockIn();
  const q = h.s.question!;
  h.clock.now = q.clockAt! + veinWindow(questionTimer(h.s));
  h.act({ type: 'dynamite', askedAt: q.askedAt });
  assert.equal(h.s.question!.blasted, undefined);
  h.answer(false);
  assert.equal(livesOf(h.s, id), DELVE_LIVES - 2);
  assert.equal(h.s.reveal!.caveIn, true);
  assert.equal(dynamiteOf(h.s, id), 1);
});

test('a cave-in in a co-op run: the perish, and the standings with two losses at one depth', () => {
  const h = coop(30);
  const [id, other] = ['p1', 'p0'];
  h.edit((c) => (c.delve!.losses = { [id]: [10], [other]: [12] }));
  h.act({ type: 'pick', category: h.plant('azurite') });
  h.clockIn();
  h.answer(false, id);
  assert.deepEqual(h.s.delve!.losses[id], [10, 30, 30]);
  assert.equal(fellAt(h.s, id), 30);
  assert.equal(livesOf(h.s, id), 0);
  // The other player stands, so comes first; the perished one second.
  assert.deepEqual(
    delveStandings(h.s).map((r) => [r.id, r.rank, r.depth, r.losses, r.perished]),
    [
      [other, 1, 30, [12], []],
      [id, 2, 30, [10, 30, 30], [30]],
    ],
  );
});

test("a guest's answer to a vein gets the same network allowance as at the deadline; the host's own needs none", () => {
  for (const [who, allowance] of [
    ['p1', ANSWER_GRACE_MS],
    ['p0', 0],
  ] as const) {
    const h = coop();
    h.act({ type: 'pick', category: h.plant() });
    h.clockIn();
    h.clock.now += WINDOW + allowance;
    const inTime = h.s;
    h.answer(true, who);
    assert.equal(h.s.reveal!.gained, 'wards', who);
    h.s = inTime;
    h.clock.now += 1;
    h.answer(true, who);
    assert.equal(h.s.reveal!.gained, 'shards', who);
  }
});

test('items stop at three each, and a shard held never makes two', () => {
  // Nonsense in a save reads as something sane.
  const h = delve(['Ash']);
  const id = h.active().id;
  h.give(id, { wards: 99, flares: NaN, dynamite: -2, shards: 5 });
  // Three wards are the most: no shard beside them.
  assert.deepEqual(inventoryOf(h.s, id), { wards: 3, flares: 0, dynamite: 0, shards: 0 });
  assert.equal(shardsOf(h.s, id), 0);
  h.give(id, { wards: 1, shards: 5 });
  assert.deepEqual(inventoryOf(h.s, id), { ...NONE, wards: 1, shards: SHARDS_PER_WARD - 1 });
  assert.equal(shardsOf(h.s, id), 1);
  h.edit((c) => delete c.delve!.inventory);
  assert.deepEqual(inventoryOf(h.s, id), NONE);
  // An older save without shards.
  h.edit((c) => (c.delve!.inventory = { [id]: { wards: 1, flares: 2, dynamite: 0 } as Inventory }));
  assert.deepEqual(inventoryOf(h.s, id), { ...NONE, wards: 1, flares: 2 });
});

// ---- wards -----------------------------------------------------------------

test('a loss takes an Azurite Ward before a life, and the streak ends either way', () => {
  const h = delve(['Ash'], { host: null });
  const id = h.active().id;
  h.give(id, { wards: 2 });
  h.edit((c) => (c.players[0].streak = 4));
  h.act({ type: 'pick', category: h.s.offered[0] });
  h.clockIn();
  h.answer(false);
  assert.equal(h.s.reveal!.warded, true);
  assert.equal(wardsOf(h.s, id), 1);
  assert.equal(livesOf(h.s, id), DELVE_LIVES);
  assert.deepEqual(h.s.delve!.losses[id] ?? [], []);
  assert.equal(h.s.players[0].streak, 0);
  h.act({ type: 'next' });
  // Out of time with the last ward.
  h.act({ type: 'pick', category: h.s.offered[0] });
  h.clockIn();
  h.act({ type: 'answer', index: null });
  assert.equal(h.s.reveal!.warded, true);
  assert.equal(wardsOf(h.s, id), 0);
  h.act({ type: 'next' });
  // No ward left: a life.
  h.act({ type: 'pick', category: h.s.offered[0] });
  h.clockIn();
  h.answer(false);
  assert.equal(h.s.reveal!.warded, undefined);
  assert.equal(livesOf(h.s, id), DELVE_LIVES - 1);
});

// ---- flares ----------------------------------------------------------------

/** A question on the clock for a player holding `flares`. */
function flaring(flares = 1, opts: { host?: string | null } = { host: null }) {
  const h = delve(['Ash'], opts);
  at(h, 20);
  h.give(h.active().id, { flares });
  h.act({ type: 'pick', category: h.s.offered.find((c) => !findOn(h.s, c))! });
  h.clockIn();
  return h;
}

test('a flare burns by itself as the clock hits 0, not a second before: once a question, and moves the deadline', () => {
  const h = flaring(2);
  const id = h.active().id;
  const q = h.s.question!;
  assert.equal(flareIn(h.s, h.clock.now), q.deadline! - h.clock.now, 'due at 0');
  // With a second left (when it used to burn), nothing burns.
  h.clock.now = q.deadline! - 1000;
  h.act({ type: 'flare', askedAt: q.askedAt });
  assert.equal(flaresOf(h.s, id), 2);
  assert.equal(h.s.question!.flared, undefined);
  // At 0 (a timer a moment early still counts).
  h.clock.now = q.deadline! - 100;
  const prev = h.s;
  h.act({ type: 'flare', askedAt: q.askedAt });
  assert.equal(flaresOf(h.s, id), 1);
  assert.equal(h.s.question!.flared, true);
  assert.equal(h.s.question!.deadline, q.deadline! + FLARE_MS);
  assert.deepEqual(inventoryChanges(prev, h.s), [{ playerId: id, item: 'flares', change: 'used', left: 1 }]);
  assert.equal(flareIn(h.s, h.clock.now), null, 'once a question');
  // A second burn does nothing.
  h.clock.now = h.s.question!.deadline!;
  h.act({ type: 'flare', askedAt: q.askedAt });
  assert.equal(flaresOf(h.s, id), 1);
  // Guests see the new deadline, and the answer counts until it.
  assert.equal(publicView(h.s).question!.deadline, q.deadline! + FLARE_MS);
  h.clock.now = q.deadline! + FLARE_MS - 10;
  h.answer(true, 'p0');
  assert.equal(h.s.reveal!.correct, true);
});

test('an answer at any time before 0 keeps the flare, right or wrong', () => {
  for (const [left, ok] of [[1000, true], [1, true], [1, false]] as const) {
    const h = flaring(1);
    const id = h.active().id;
    h.clock.now = h.s.question!.deadline! - left;
    h.answer(ok);
    assert.equal(h.s.phase, 'reveal');
    assert.equal(h.s.reveal!.correct, ok);
    assert.equal(h.s.question!.flared, undefined);
    assert.equal(flaresOf(h.s, id), 1, `${left} ms left`);
  }
});

test("the flare beats the time-out: the host's time-out finds it due and burns it instead", () => {
  // The flare's timer never came (or came after the time-out): the time-out burns it.
  const h = flaring(1);
  const id = h.active().id;
  const q = h.s.question!;
  h.clock.now = q.deadline! + ANSWER_GRACE_MS;
  h.act({ type: 'answer', index: null }, null);
  assert.equal(h.s.phase, 'question', 'no time-out');
  assert.equal(h.s.reveal, null);
  assert.equal(h.s.question!.flared, true);
  assert.equal(flaresOf(h.s, id), 0);
  assert.equal(livesOf(h.s, id), DELVE_LIVES);
  assert.equal(h.s.question!.deadline, h.clock.now + FLARE_MS, 'the whole flare from now');
  // Its own time-out then comes as usual.
  h.clock.now = h.s.question!.deadline! + ANSWER_GRACE_MS;
  h.act({ type: 'answer', index: null }, null);
  assert.equal(h.s.reveal!.timedOut, true);
  assert.equal(livesOf(h.s, id), DELVE_LIVES - 1);

  // In order, the flare's timer (at 0) comes before the time-out's (ANSWER_GRACE_MS later).
  const o = flaring(1);
  assert.equal(flareIn(o.s, o.clock.now), o.s.question!.deadline! - o.clock.now);
  assert.ok(flareIn(o.s, o.clock.now)! < o.s.question!.deadline! + ANSWER_GRACE_MS - o.clock.now);
});

test("alone, the host's own answer after the flare burnt spends it: it travels nowhere", () => {
  const h = flaring(1, { host: 'p0' });
  h.clock.now = h.s.question!.deadline!;
  h.act({ type: 'flare', askedAt: h.s.question!.askedAt });
  h.clock.now += 100;
  h.answer(true, 'p0');
  assert.equal(flaresOf(h.s, 'p0'), 0);
  // (A guest's answer on its way as the flare burns: tests/delveCoop.test.ts.)
});

test('a flare that fires late still saves the player, and never after the time-out or an answer', () => {
  const late = flaring();
  const q = late.s.question!;
  late.clock.now = q.deadline! + ANSWER_GRACE_MS;
  late.act({ type: 'flare', askedAt: q.askedAt });
  assert.equal(late.s.question!.deadline, late.clock.now + FLARE_MS);
  assert.equal(late.s.question!.flaredAt, q.deadline, 'it burnt as the clock hit 0');

  const tooLate = flaring();
  tooLate.clock.now = tooLate.s.question!.deadline! + ANSWER_GRACE_MS + 1;
  tooLate.act({ type: 'flare', askedAt: tooLate.s.question!.askedAt });
  assert.equal(tooLate.s.question!.flared, undefined);

  const answered = flaring();
  const askedAt = answered.s.question!.askedAt;
  answered.clock.now = answered.s.question!.deadline! - 10;
  answered.answer(true);
  answered.clock.now += 10;
  answered.act({ type: 'flare', askedAt });
  assert.equal(flaresOf(answered.s, answered.active().id), 1);
  assert.equal(answered.s.phase, 'reveal');

  const timedOut = flaring(0);
  timedOut.clock.now = timedOut.s.question!.deadline! + ANSWER_GRACE_MS;
  timedOut.act({ type: 'answer', index: null }, null);
  timedOut.give(timedOut.active().id, { flares: 1 });
  timedOut.act({ type: 'flare', askedAt });
  assert.equal(timedOut.s.question!.flared, undefined);

  const stale = flaring();
  stale.clock.now = stale.s.question!.deadline!;
  stale.act({ type: 'flare', askedAt: stale.s.question!.askedAt - 1 });
  assert.equal(stale.s.question!.flared, undefined);
});

test('no flare burns before the clock starts, without one, for someone away, or on a player\'s word', () => {
  const h = delve(['Ash']);
  at(h, 20);
  const id = h.active().id;
  h.give(id, { flares: 1 });
  h.act({ type: 'pick', category: h.s.offered.find((c) => !findOn(h.s, c))! });
  assert.equal(flareIn(h.s, h.clock.now), null, 'not before the clock starts');
  h.act({ type: 'flare', askedAt: h.s.question!.askedAt });
  assert.equal(h.s.question!.flared, undefined);
  h.clockIn();
  h.clock.now = h.s.question!.deadline!;
  assert.throws(() => h.act({ type: 'flare', askedAt: h.s.question!.askedAt }, id));
  h.act({ type: 'connection', playerId: id, connected: false });
  assert.equal(flareIn(h.s, h.clock.now), null, 'not for someone away');
  h.act({ type: 'flare', askedAt: h.s.question!.askedAt });
  assert.equal(flaresOf(h.s, id), 1);
  // Nor does the time-out burn one for them.
  h.clock.now += ANSWER_GRACE_MS;
  h.act({ type: 'answer', index: null }, null);
  assert.equal(h.s.reveal!.timedOut, true);
  assert.equal(flaresOf(h.s, id), 1);

  const none = flaring(0);
  assert.equal(flareIn(none.s, none.clock.now), null);
  none.clock.now = none.s.question!.deadline!;
  none.act({ type: 'flare', askedAt: none.s.question!.askedAt });
  assert.equal(none.s.question!.flared, undefined);
});

test("no flare burns on a find's own question: the time-out is taken and the flare kept", () => {
  for (const kind of ['azurite', 'flare', 'dynamite'] as const) {
    const h = found(kind, { host: null, inv: { flares: 2 } });
    const id = h.active().id;
    const q = h.s.question!;
    assert.equal(itemsWorkOn(q), false);
    assert.equal(flareIn(h.s, h.clock.now), null, kind);
    h.clock.now = q.deadline!;
    h.act({ type: 'flare', askedAt: q.askedAt });
    assert.equal(h.s.question!.flared, undefined);
    h.clock.now = q.deadline! + ANSWER_GRACE_MS;
    h.act({ type: 'answer', index: null }, null);
    assert.equal(h.s.reveal!.timedOut, true, kind);
    assert.equal(flaresOf(h.s, id), 2, kind);
    assert.equal(livesOf(h.s, id), DELVE_LIVES - findLosses(kind));
  }
  // The vein's fast window is just its own.
  const v = found('azurite', { host: null, inv: { flares: 1 } });
  assert.equal(veinWindowMs(v.s), WINDOW);
  assert.equal(questionTimer(v.s), findTimer('azurite', 20), "the question started with the find's clock");
});

// ---- trust, views and lifetimes --------------------------------------------

test("guests can't make up a find or award themselves items", () => {
  const h = coop();
  const id = 'p1';
  h.edit((c) => (c.delve!.finds = []));
  h.act({ type: 'vote', category: h.s.offered[0], find: 'azurite' } as never, id);
  h.act({ type: 'vote', category: h.s.offered[0] }, 'p0');
  assert.equal(h.s.phase, 'question');
  assert.equal(h.s.question!.find, undefined);
  assert.throws(() => h.act({ type: 'clock', askedAt: h.s.question!.askedAt }, id));
  h.clockIn();
  h.act({ type: 'answer', index: right(h.s.question!), askedAt: h.s.question!.askedAt, gained: 'wards' } as never, id);
  assert.deepEqual(inventoryOf(h.s, id), NONE);
});

test('guests see the find, the question it asked and everyone\'s items, but never the answer', () => {
  const h = delve(['Ash', 'Brea']);
  at(h, 20);
  const id = h.active().id;
  h.give(id, { wards: 2, flares: 1, dynamite: 3, shards: 1 });
  const card = h.plant();
  assert.deepEqual(findOffers(publicView(h.s)), [{ category: card, kind: 'azurite' }]);
  h.act({ type: 'pick', category: card }, null);
  let view = publicView(h.s);
  assert.equal(view.question!.find, 'azurite');
  assert.equal(view.question!.itemId, '');
  assert.deepEqual(view.question!.options, []);
  assert.deepEqual(inventoryOf(view, id), { wards: 2, flares: 1, dynamite: 3, shards: 1 });
  h.clockIn();
  view = publicView(h.s);
  assert.equal(view.question!.itemId, '');
  assert.deepEqual(view.question!.options, []);
  assert.equal(view.question!.clockAt, h.s.question!.clockAt, 'guests can draw the fast window');
  assert.equal(questionTimer(view), findTimer('azurite', 20));
  assert.equal(veinWindowMs(view), veinWindow(findTimer('azurite', 20)), 'guests can draw the fast window');
});

test('leaving or being kicked takes your items with you, and a new run starts with none', () => {
  const h = delve(['Ash', 'Brea', 'Cyd']);
  const [a, b] = h.s.players.map((p) => p.id).filter((id) => id !== 'p0');
  h.give(a, { wards: 2 });
  h.give(b, { flares: 1 });
  h.give('p0', { dynamite: 3 });
  h.act({ type: 'remove', playerId: a }, 'p0');
  assert.equal(h.s.delve!.inventory![a], undefined);
  h.act({ type: 'remove', playerId: b }, b);
  assert.equal(h.s.delve!.inventory![b], undefined);
  assert.equal(dynamiteOf(h.s, 'p0'), 3);
  h.act({ type: 'restart', play: true }, 'p0');
  assert.deepEqual(h.s.delve!.inventory, {});
  assert.deepEqual(findOffers(h.s), []);
  assert.equal(h.s.delve!.find, undefined);
});

test('a question asked again, or set aside by a host reload, keeps what it was', () => {
  const h = delve(['Ash']);
  at(h, 20);
  const card = h.plant('flare');
  h.act({ type: 'pick', category: card });
  h.act({ type: 'reask' });
  assert.equal(h.s.question!.find, 'flare');
  assert.equal(h.s.question!.category, card);

  // A co-op question is set aside after a host reload, and the same cards come back.
  const g = coop();
  const infused = g.plant();
  g.act({ type: 'pick', category: infused });
  g.act({ type: 'connection', playerId: 'p1', connected: false });
  g.act({ type: 'resumed' });
  assert.equal(g.s.phase, 'choosing');
  assert.deepEqual(findOffers(g.s), [{ category: infused, kind: 'azurite' }]);
});

test('item changes are reported for the phial and its sounds', () => {
  const h = found('azurite');
  const id = h.active().id;
  const prev = h.s;
  h.answer(true);
  assert.deepEqual(inventoryChanges(prev, h.s), [{ playerId: id, item: 'wards', change: 'gained', left: 1 }]);
  assert.deepEqual(delveNotices(prev, h.s), []);
  assert.deepEqual(inventoryChanges(null, h.s), []);
});

test('two finds on offer: each card asks its own, an ordinary card neither, and a game saved with one `find` still has it', () => {
  for (const pick of [0, 1, 2]) {
    const h = delve(['Ash'], { host: null });
    at(h, 30);
    const [a, b, c] = h.s.offered;
    h.edit((x) => (x.delve!.finds = [{ category: a, kind: 'flare' }, { category: b, kind: 'dynamite' }]));
    assert.deepEqual([findOn(h.s, a), findOn(h.s, b), findOn(h.s, c)], ['flare', 'dynamite', null]);
    h.act({ type: 'pick', category: h.s.offered[pick] });
    assert.equal(h.s.question!.find, ['flare', 'dynamite', undefined][pick], `card ${pick}`);
    // Once the question is asked, nothing is on offer.
    assert.deepEqual(findOffers(h.s), []);
  }
  // Never a third, never two on one card or of one kind (a hand-made state reads as the first of each).
  const h = delve(['Ash'], { host: null });
  const [a, b, c] = h.s.offered;
  h.edit(
    (x) =>
      (x.delve!.finds = [
        { category: a, kind: 'azurite' },
        { category: a, kind: 'flare' },
        { category: b, kind: 'azurite' },
        { category: 'Nowhere', kind: 'flare' },
        { category: b, kind: 'nonsense' as FindKind },
        { category: b, kind: 'dynamite' },
        { category: c, kind: 'flare' },
      ]),
  );
  assert.deepEqual(findOffers(h.s), [
    { category: a, kind: 'azurite' },
    { category: b, kind: 'dynamite' },
  ]);
  // An older save: the one `find`, no `finds`.
  h.edit((x) => {
    delete x.delve!.finds;
    x.delve!.find = { category: c, kind: 'flare' };
  });
  assert.deepEqual(findOffers(h.s), [{ category: c, kind: 'flare' }]);
  h.act({ type: 'pick', category: c });
  assert.equal(h.s.question!.find, 'flare');
  h.clockIn();
  h.answer(true);
  h.act({ type: 'next' });
  assert.equal(h.s.delve!.find, undefined, 'the next offer is rolled into `finds`');
  assert.ok(Array.isArray(h.s.delve!.finds));
});

test('a second find is only of a kind someone can still carry', () => {
  const h = delve(['Ash'], { seed: 4 });
  const id = h.active().id;
  h.give(id, { flares: DELVE_MAX_FLARES, dynamite: DELVE_MAX_DYNAMITE });
  const roll = (h.engine as unknown as { beginTurn(s: GameState, first: boolean): void }).beginTurn.bind(h.engine);
  const s = structuredClone(h.s);
  let veins = 0;
  for (let i = 0; i < 4000; i++) {
    s.round = 50;
    roll(s, false);
    const finds = findOffers(s);
    assert.ok(finds.every((f) => f.kind === 'azurite'), 'only veins');
    assert.ok(finds.length <= 1);
    veins += finds.length;
  }
  // As often as the vein's own chance: the full kinds' slices find nothing, first or second.
  assert.ok(Math.abs(veins - 4000 * 0.11) < 4 * Math.sqrt(4000 * 0.11), `${veins} veins`);
});

test('a game saved before finds plays on without them', () => {
  const h = delve(['Ash'], { host: null });
  const id = h.active().id;
  h.edit((c) => {
    delete c.delve!.inventory;
    delete c.delve!.find;
    delete c.delve!.finds;
  });
  assert.deepEqual(findOffers(h.s), []);
  h.act({ type: 'pick', category: h.s.offered[0] });
  h.clockIn();
  h.answer(false);
  assert.equal(livesOf(h.s, id), DELVE_LIVES - 1);
  h.act({ type: 'next' });
  assert.equal(h.s.phase, 'choosing');
});

// ---- endless ---------------------------------------------------------------

test('past depth 100, name questions now and then show a fourth made-up name; from 150 every one that has room', () => {
  const count = (depth: number) => {
    const fakes: number[] = [];
    for (let seed = 1; seed <= 40; seed++) {
      const h = delve(['Ash'], { host: null, seed });
      for (let i = 0; i < 6; i++) {
        at(h, depth);
        h.act({ type: 'pick', category: h.s.offered.find((c) => !findOn(h.s, c))! });
        const q = h.s.question!;
        if (q.mode === 'name') fakes.push(q.options.filter(isFake).length);
        h.clockIn();
        h.answer(true);
        h.act({ type: 'next' });
      }
    }
    return fakes;
  };
  const at100 = count(100);
  assert.ok(at100.every((n) => n <= 3), 'never four before 101');
  const at150 = count(150);
  assert.ok(at150.every((n) => n <= 4), 'never more than eight options hold');
  const four = at150.filter((n) => n === 4).length;
  assert.ok(four >= at150.length * 0.8, `${four} of ${at150.length} name questions with four at 150`);
});
