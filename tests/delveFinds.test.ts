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
  FINDS_IN_ORDER,
  FIND_MIN_TIMER,
  FIND_FADE_FROM,
  FIND_FADE_TO,
  FIND_RAMP,
  FLARE_MS,
  SHARDS_PER_WARD,
  blastVictim,
  blowsUp,
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
  shownDepth,
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
import { delveNotices, flareIn, inventoryChanges, itemsBlown } from '../src/lib/delveSession.ts';
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
      // A Flare Cache's clock is three seconds shorter still (never under three): time now for time later.
      assert.equal(findTimer(kind, d), kind === 'flare' ? Math.max(FIND_MIN_TIMER, delveTimer(deeper) - 3) : delveTimer(deeper));
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
        KNOBS.every((k) => r[k] === deepest[k]) &&
        JSON.stringify(r.veil) === JSON.stringify(deepest.veil) &&
        r.moreFakes === 1 &&
        findTimer(kind, d) === (kind === 'flare' ? FIND_MIN_TIMER : DELVE_MIN_TIMER);
      assert.equal(hardest, findDepth(kind, d) >= 150, `${kind}: the hardest question at ${d}`);
    }
});

test("a find's clock is fair: never the shortest near the top, and never shorter than any depth's, but a Flare Cache's", () => {
  // At the first finds, a Dynamite Cache gets 14 s, not the 5 of depth 96; a vein where it first turns up, 8 s.
  assert.equal(findTimer('dynamite', FINDS_FROM), 14);
  assert.equal(findTimer('azurite', findFor('azurite').from), 8);
  assert.equal(findTimer('azurite', 8), 15 - 1);
  assert.equal(findTimer('azurite', 20), 12);
  assert.equal(findTimer('dynamite', 20), 12);
  assert.equal(findTimer('azurite', 43), 7);
  assert.equal(findTimer('azurite', 63), 6);
  // The shortest clock only past depth 75, where the depth's own is 6 s at the least.
  assert.equal(findTimer('azurite', 80), DELVE_MIN_TIMER + 1);
  assert.equal(findTimer('azurite', 81), DELVE_MIN_TIMER);
  for (const kind of ['azurite', 'dynamite'] as const)
    for (let d = 1; d <= 300; d++) {
      if (findTimer(kind, d) === DELVE_MIN_TIMER) assert.ok(delveTimer(d) > DELVE_MIN_TIMER || d >= 96, `${kind} at ${d}`);
      assert.ok(findTimer(kind, d) >= DELVE_MIN_TIMER && findTimer(kind, d) <= 16);
    }
});

test('a Flare Cache trades time now for time later: three seconds less than its deeper depth, never under three', () => {
  assert.equal(FIND_MIN_TIMER, 3);
  assert.deepEqual(
    FINDS.map((f) => [f.kind, f.shorter]),
    [
      ['azurite', 0],
      ['flare', 3],
      ['dynamite', 0],
    ],
  );
  // Where it first turns up (depth 26, shown 25), 10 s less 3; then down with the curve.
  assert.equal(findTimer('flare', findFor('flare').from), 7);
  assert.equal(findTimer('flare', 15), 9);
  assert.equal(findTimer('flare', 20), 8);
  assert.equal(findTimer('flare', 38), 4);
  assert.equal(findTimer('flare', 57), 4);
  // From depth 58 it asks from 78 down, 6 s there: three left, and never fewer (5 − 3 would be 2).
  assert.equal(findTimer('flare', 58), FIND_MIN_TIMER);
  assert.equal(findTimer('flare', 76), FIND_MIN_TIMER);
  assert.equal(findTimer('flare', 500), FIND_MIN_TIMER);
  for (let d = 1; d <= 300; d++) {
    const deep = delveTimer(findDepth('flare', d));
    assert.equal(findTimer('flare', d), Math.max(FIND_MIN_TIMER, deep - 3), `at ${d}`);
    assert.ok(findTimer('flare', d) < delveTimer(d), `less time than the depth's own at ${d}`);
  }
});

test('even a find has half its art in with over 3 s left, and an Azurite Vein half of it in before its window closes', () => {
  for (const kind of [...LIVE, 'dynamite'] as const)
    for (let d = FINDS_FROM; d <= 300; d++) {
      const secs = findTimer(kind, d);
      const ms = secs * 1000;
      const veil = findRules(kind, d).veil;
      if (!veil) continue;
      // A Flare Cache's three seconds are too few for any art to burn in fairly: it is shown plain (below).
      if (secs === FIND_MIN_TIMER) {
        assert.equal(kind, 'flare');
        assert.equal(veilSeconds(secs, veil.share, veil.size), 0, `${kind} at ${d}`);
        assert.equal(veilSeconds(secs, veil.share, tileVeilSize(veil.size), true), 0, `${kind} at ${d}`);
        continue;
      }
      assert.ok(veilSeconds(secs, veil.share, veil.size) > 0 && veilSeconds(secs, veil.share, tileVeilSize(veil.size), true) > 0, `${kind} at ${d}`);
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

test('each find ramps from its start at its own first depth to its cap 20 depths on, fixed by depth, and grows scarcer past 100; they come one at a time, the vein last', () => {
  assert.deepEqual(
    FINDS.map((f) => [f.kind, f.item, f.max]),
    [
      ['azurite', 'wards', DELVE_MAX_WARDS],
      ['flare', 'flares', DELVE_MAX_FLARES],
      ['dynamite', 'dynamite', DELVE_MAX_DYNAMITE],
    ],
  );
  assert.deepEqual([DELVE_MAX_WARDS, DELVE_MAX_FLARES, DELVE_MAX_DYNAMITE, SHARDS_PER_WARD], [3, 3, 3, 2]);
  assert.equal(FIND_RAMP, 20);
  assert.equal(FINDS_FROM, 11);
  // In the order they first turn up, at the depths players see: dynamite from 10, flares from 25, veins from 40.
  assert.deepEqual(
    FINDS_IN_ORDER.map((f) => [f.kind, shownDepth(f.from)]),
    [
      ['dynamite', 10],
      ['flare', 25],
      ['azurite', 40],
    ],
  );
  assert.equal(shownDepth(FINDS_FROM), 10);
  // Where each starts, and how.
  assert.deepEqual([findChance('dynamite', 10), findChance('dynamite', 11)], [0, 0.08]);
  assert.deepEqual([findChance('flare', 25), findChance('flare', 26)], [0, 0.04]);
  assert.deepEqual([findChance('azurite', 40), findChance('azurite', 41)], [0, 0.04]);
  const live = FINDS.filter((f) => f.cap > 0);
  assert.ok(Math.max(...live.map((f) => f.from)) === findFor('azurite').from, 'the Azurite Vein comes last');
  for (const f of live) {
    let prev = 0;
    for (let d = 1; d <= FIND_FADE_FROM; d++) {
      const c = findChance(f.kind, d);
      assert.ok(c >= prev, `${f.kind} never less likely deeper (${d})`);
      if (d < f.from) assert.equal(c, 0, `no ${f.kind} above its first depth (${d})`);
      if (d >= f.from && d < f.from + FIND_RAMP) assert.ok(c < f.cap, `${f.kind} below its cap at ${d}`);
      if (d >= f.from + FIND_RAMP) assert.equal(c, f.cap, `${f.kind} at its cap from ${f.from + FIND_RAMP}`);
      prev = c;
    }
    // Past 100 a little scarcer with every depth, never in a jump, down to `late` of its cap at 200, held from there.
    for (let d = FIND_FADE_FROM + 1; d <= FIND_FADE_TO; d++) {
      const c = findChance(f.kind, d);
      assert.ok(c < prev && prev - c <= 0.01 * f.cap, `${f.kind} at ${d}: ${prev} to ${c}`);
      prev = c;
    }
    assert.ok(Math.abs(findChance(f.kind, FIND_FADE_TO) - f.cap * f.late) < 1e-4, `${f.kind} at ${FIND_FADE_TO}`);
    assert.equal(findChance(f.kind, FIND_FADE_TO), findChance(f.kind, 300), 'held from there on');
  }
  assert.deepEqual([FIND_FADE_FROM, FIND_FADE_TO], [100, 200]);
  assert.deepEqual(FINDS.map((f) => [f.kind, f.late]), [['azurite', 1 / 3], ['flare', 0.5], ['dynamite', 0.5]]);
  // Rare at first, about one offer in three once the vein is at its cap (depth 61, shown 60).
  const total = (d: number) => FINDS.reduce((sum, f) => sum + findChance(f.kind, d), 0);
  assert.equal(total(10), 0);
  assert.equal(total(11), 0.08);
  assert.ok(total(25) < 0.1, `${total(25)} at 25`);
  assert.ok(Math.abs(total(26) - 0.1275) < 1e-9, `${total(26)} at 26`);
  assert.ok(total(60) < total(61));
  assert.ok(Math.abs(total(61) - 0.33) < 0.005, `${total(61)} at 61`);
  assert.equal(total(100), total(61));
  // About one offer in seven from 200.
  assert.ok(Math.abs(total(200) - 0.147) < 0.005, `${total(200)} at 200`);
  assert.equal(total(300), total(200));
  // Odd depths read as the surface.
  for (const d of [NaN, -3, 0]) assert.equal(total(d), 0);
});

test('no find turns up above its first depth; each is at its start chance there and at its cap 20 depths on', () => {
  for (const f of FINDS_IN_ORDER) {
    for (let d = 0; d < f.from; d++) assert.equal(findChance(f.kind, d), 0, `no ${f.kind} at ${d}`);
    assert.equal(findChance(f.kind, f.from), f.start, `${f.kind} at its first depth`);
    assert.ok(findChance(f.kind, f.from + FIND_RAMP - 1) < f.cap, `${f.kind} just short of its cap`);
    assert.equal(findChance(f.kind, f.from + FIND_RAMP), f.cap, `${f.kind} at its cap ${FIND_RAMP} depths on`);
  }
  // As players see it: dynamite full by 30, flares by 45, veins by 60.
  assert.deepEqual(
    FINDS_IN_ORDER.map((f) => [f.kind, shownDepth(f.from + FIND_RAMP)]),
    [
      ['dynamite', 30],
      ['flare', 45],
      ['azurite', 60],
    ],
  );
});

test("a find's chance is always a number between 0 and 1, at any depth and for odd ones", () => {
  for (const f of FINDS)
    for (const d of [...Array.from({ length: 301 }, (_, i) => i), NaN, Infinity, -Infinity, -1, 0.5, 11.9, 1e9]) {
      const c = findChance(f.kind, d);
      assert.ok(Number.isFinite(c) && c >= 0 && c <= 1, `${f.kind} at ${d}: ${c}`);
    }
});

test('from depth 10 to 24 as shown, the Dynamite Cache is the only find', () => {
  for (let shown = 10; shown <= 24; shown++) {
    const d = shown + 1;
    assert.ok(findChance('dynamite', d) >= 0.08, `dynamite at ${shown}`);
    assert.equal(findChance('flare', d), 0, `no flare at ${shown}`);
    assert.equal(findChance('azurite', d), 0, `no vein at ${shown}`);
  }
  // Rolled by the engine: only dynamite, and never two side by side.
  const h = delve(['Ash'], { seed: 8 });
  const roll = (h.engine as unknown as { beginTurn(s: GameState, first: boolean): void }).beginTurn.bind(h.engine);
  const s = structuredClone(h.s);
  let caches = 0;
  for (let i = 0; i < 3000; i++) {
    s.round = 11 + (i % 15);
    roll(s, false);
    const finds = findOffers(s);
    assert.ok(finds.length <= 1 && finds.every((f) => f.kind === 'dynamite'), `at depth ${s.round}`);
    caches += finds.length;
  }
  assert.ok(caches > 3000 * 0.08 * 0.7, `${caches} Dynamite Caches in 3000 offers`);
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

test('the Dynamite Cache comes first, from depth 10 as shown, 8% rising to 9% by 30, and is the rarest of the three at their caps', () => {
  assert.equal(DYNAMITE_ON, true);
  assert.deepEqual(
    FINDS.map((f) => [f.kind, f.from, f.start, f.cap]),
    [
      ['azurite', 41, 0.04, 0.11],
      ['flare', 26, 0.04, 0.13],
      ['dynamite', 11, 0.08, 0.09],
    ],
  );
  // Internal depths (shown one less): none at 10, 8% at 11, 8.5% at 21, 9% from 31, half of that from 200.
  assert.deepEqual([10, 11, 21, 31, 100, 200].map((d) => findChance('dynamite', d)), [0, 0.08, 0.085, 0.09, 0.09, 0.045]);
  // Rarer than the flare once that is at its cap, and than the vein once that is at its.
  for (let d = 46; d <= 200; d++) assert.ok(findChance('dynamite', d) < findChance('flare', d), `${d}`);
  assert.ok(findChance('dynamite', 61) < findChance('azurite', 61));
  // Rolled as often as its chance, for a player with room for it.
  const h = delve(['Ash'], { seed: 9 });
  let seen = 0;
  for (let i = 0; i < 600; i++) {
    h.edit((c) => (c.round = 61));
    if (findOffers(h.s).some((f) => f.kind === 'dynamite')) seen++;
    h.plainTurn();
  }
  // A little more often than 9% of offers: it may also come second, beside another find.
  const p = present('dynamite', 61);
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
  // The rates, as SECOND_FIND says: none above depth 26 (shown 25), about 1 offer in 290 at 26, 1 in 57 at 41, 1 in 28 from 61.
  assert.equal(SECOND_FIND, 0.5);
  for (let d = 1; d <= 25; d++) assert.equal(double(d), 0, `only dynamite at ${d}: nothing to go beside it`);
  assert.ok(double(26) > 0.002 && double(26) < 0.005, `${double(26)} at 26`);
  assert.ok(double(41) > 0.015 && double(41) < 0.02, `${double(41)} at 41`);
  assert.ok(double(61) > 0.03 && double(61) < 0.04, `${double(61)} at 61`);
  assert.equal(double(100), double(61));
  // Rarer again as the finds grow scarcer past 100.
  assert.ok(double(200) < double(100) / 4, `${double(200)} at 200`);
  for (let d = 25; d < 61; d++) assert.ok(double(d + 1) >= double(d), `growing at ${d}`);
  // A ninth of the offers with a find hold two from depth 61, fewer above.
  assert.ok(double(61) / anyFind(61) < 0.12 && double(41) / anyFind(41) < 0.08);
  // Simulated: offers rolled by the engine at each depth, for a player with room for everything.
  const h = delve(['Ash'], { seed: 21 });
  const roll = (h.engine as unknown as { beginTurn(s: GameState, first: boolean): void }).beginTurn.bind(h.engine);
  const N = 20_000;
  for (const d of [26, 41, 61]) {
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
function found(kind: FindKind, opts: { host?: string | null; inv?: Partial<Inventory>; seed?: number } = { host: null }) {
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

test('wrong or out of time on a Flare or Dynamite Cache with nothing carried costs a life like any other', () => {
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

// ---- the Flare Cache's clock and the Dynamite Cache's blast ----------------

test("a Flare Cache's question starts three seconds shorter, and at three seconds its art comes plain", () => {
  let veiled = 0;
  for (let seed = 1; seed <= 24; seed++) {
    // Depth 40 asks from 60 down (7 s there, 4 here); depth 60 from 80 (6 s there, the floor of 3 here).
    for (const depth of [40, 60]) {
      const h = delve(['Ash'], { seed });
      at(h, depth);
      h.act({ type: 'pick', category: h.plant('flare') });
      const q = h.s.question!;
      const secs = findTimer('flare', depth);
      assert.equal(secs, depth === 40 ? 4 : FIND_MIN_TIMER);
      h.clockIn();
      assert.equal(h.s.question!.deadline! - h.s.question!.clockAt!, secs * 1000);
      assert.equal(questionTimer(h.s), secs);
      if (depth === 60) assert.equal(q.veil, null, `seed ${seed}: no art burns in on three seconds`);
      else if (q.veil) {
        veiled++;
        // Fair on the shortened clock: half the art in with three seconds left at the least.
        const pace = veilPace(q.veil.seconds * 1000, q.veil.size ** 2);
        const late = q.mode === 'art' ? pace.gap / 2 : 0;
        assert.ok(secs * 1000 - (400 + late + (q.veil.size ** 2 / 2) * pace.gap + pace.burn) >= 3000, `seed ${seed}`);
      }
    }
  }
  assert.ok(veiled > 0, 'some art burns in on four seconds');
});

test("a Dynamite Cache's blast takes one thing a pack holds: each ward, flare and stick a chance, a shard half of one", () => {
  assert.deepEqual(
    FINDS.map((f) => [f.kind, blowsUp(f.kind)]),
    [
      ['azurite', false],
      ['flare', false],
      ['dynamite', true],
    ],
  );
  assert.equal(blastVictim(NONE, 0.5), null);
  assert.equal(blastVictim({ ...NONE, shards: 1 }, 0), 'shards');
  assert.equal(blastVictim({ ...NONE, shards: 1 }, 0.99), 'shards');
  assert.equal(blastVictim({ ...NONE, wards: 2 }, 0.7), 'wards');
  // Two wards, a flare and a shard: 2 + 1 + 0.5 chances, in the order wards, flares, dynamite, shards.
  const inv = { ...NONE, wards: 2, flares: 1, shards: 1 };
  const share = (item: string) => {
    let n = 0;
    for (let i = 0; i < 3500; i++) if (blastVictim(inv, (i + 0.5) / 3500) === item) n++;
    return n / 3500;
  };
  assert.ok(Math.abs(share('wards') - 2 / 3.5) < 0.001);
  assert.ok(Math.abs(share('flares') - 1 / 3.5) < 0.001);
  assert.ok(Math.abs(share('shards') - 0.5 / 3.5) < 0.001);
  assert.equal(share('dynamite'), 0);
  // Never something not held, whatever the roll.
  for (const roll of [0, 0.25, 0.5, 0.999, 1, -1, NaN]) {
    const v = blastVictim({ ...NONE, dynamite: 1 }, roll);
    assert.equal(v, 'dynamite', String(roll));
  }
});

/** What a pack holds in all, a shard counted as one thing. */
const things = (inv: Inventory) => inv.wards + inv.flares + inv.dynamite + inv.shards;

test('a miss on a Dynamite Cache costs a life and blows up exactly one thing carried, the same on every replay', () => {
  const PACK: Inventory = { wards: 0, flares: 2, dynamite: 1, shards: 1 };
  const seen = new Set<string>();
  for (let seed = 1; seed <= 40; seed++) {
    const run = () => {
      const h = found('dynamite', { host: null, inv: PACK, seed });
      const id = h.active().id;
      h.answer(false);
      return { h, id };
    };
    const { h, id } = run();
    const blown = h.s.reveal!.blown!;
    assert.ok(blown, `seed ${seed}`);
    seen.add(blown);
    assert.equal(livesOf(h.s, id), DELVE_LIVES - 1);
    const inv = inventoryOf(h.s, id);
    assert.equal(things(inv), things(PACK) - 1);
    assert.equal(inv[blown], PACK[blown] - 1);
    // Deterministic: the engine's seeded roll picks it, so a replay (or any screen) agrees.
    assert.equal(run().h.s.reveal!.blown, blown);
  }
  assert.deepEqual([...seen].sort(), ['dynamite', 'flares', 'shards']);
});

test('a ward takes the life first, then the blast takes one thing from what is left', () => {
  // One ward and nothing else: the ward takes the loss, nothing is left to blow up.
  const bare = found('dynamite', { host: null, inv: { wards: 1 } });
  const id = bare.active().id;
  bare.answer(false);
  assert.equal(livesOf(bare.s, id), DELVE_LIVES);
  assert.equal(bare.s.reveal!.warded, true);
  assert.equal(bare.s.reveal!.blown, undefined);
  assert.deepEqual(inventoryOf(bare.s, id), NONE);
  // Two wards: one takes the loss, the other is blown up.
  const two = found('dynamite', { host: null, inv: { wards: 2 } });
  two.answer(false);
  assert.equal(livesOf(two.s, id), DELVE_LIVES);
  assert.equal(two.s.reveal!.blown, 'wards');
  assert.equal(wardsOf(two.s, id), 0);
});

test('a time-out on a Dynamite Cache is a miss: the blast takes something too', () => {
  const h = found('dynamite', { host: null, inv: { dynamite: 2 } });
  const id = h.active().id;
  h.clock.now += findTimer('dynamite', 20) * 1000 + ANSWER_GRACE_MS + 1;
  h.act({ type: 'answer', index: null, askedAt: h.s.question!.askedAt });
  assert.equal(h.s.reveal!.timedOut, true);
  assert.equal(h.s.reveal!.blown, 'dynamite');
  assert.equal(dynamiteOf(h.s, id), 1);
  assert.equal(livesOf(h.s, id), DELVE_LIVES - 1);
});

test('nothing is blown up for a player who carries nothing, who perishes on the miss, or who answers right', () => {
  const empty = found('dynamite');
  empty.answer(false);
  assert.equal(empty.s.reveal!.blown, undefined);
  // On the last life the whole pack goes with them; the blast adds nothing (and uses no roll).
  const last = found('dynamite', { host: null, inv: { flares: 2, dynamite: 1 } });
  const id = last.active().id;
  last.edit((c) => (c.delve!.losses[id] = [5, 9]));
  last.answer(false);
  assert.equal(livesOf(last.s, id), 0);
  assert.equal(last.s.reveal!.blown, undefined);
  assert.deepEqual(inventoryOf(last.s, id), NONE);
  const right = found('dynamite', { host: null, inv: { flares: 1 } });
  right.answer(true);
  assert.equal(right.s.reveal!.blown, undefined);
  assert.deepEqual(inventoryOf(right.s, id), { ...NONE, flares: 1, dynamite: 1 });
});

test('only a Dynamite Cache blows anything up: a Flare Cache or an Azurite Vein missed leaves the pack (but the wards a cave-in breaks)', () => {
  for (const kind of ['flare', 'azurite'] as const) {
    const h = found(kind, { host: null, inv: { flares: 1, dynamite: 1, shards: 1 } });
    const id = h.active().id;
    h.answer(false);
    assert.equal(h.s.reveal!.blown, undefined, kind);
    assert.deepEqual(inventoryOf(h.s, id), { ...NONE, flares: 1, dynamite: 1, shards: 1 }, kind);
  }
});

test('what a blast destroyed is reported once, for the phial, alone at the reveal', () => {
  const h = found('dynamite', { host: null, inv: { flares: 1 } });
  const id = h.active().id;
  const before = h.s;
  h.answer(false);
  assert.deepEqual(itemsBlown(before, h.s), [{ playerId: id, item: 'flares' }]);
  assert.deepEqual(itemsBlown(h.s, h.s), []);
  assert.deepEqual(itemsBlown(null, h.s), []);
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
    // Kept, but a Dynamite Cache's blast takes what is carried: the one flare it found.
    assert.equal(flaresOf(h.s, id), kind === 'dynamite' ? 1 : 2, kind);
    assert.equal(h.s.reveal!.blown, kind === 'dynamite' ? 'flares' : undefined, kind);
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
    s.round = 61;
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
