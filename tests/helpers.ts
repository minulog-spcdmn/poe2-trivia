// What the tests share: the item data, a seeded random source, a storage
// stand-in, a tab's history and the locks of a browser's tabs, a game in its
// lobby and a room on a clock the test moves. (Not a test file itself: npm
// test runs tests/*.test.ts.)

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ActionError, DEFAULT_SETTINGS, Engine, createGame, type Action, type Difficulty, type GameState, type Item, type Question, type Settings } from '../src/lib/game.ts';
import type { Inventory } from '../src/lib/delve.ts';

export const items: Item[] = JSON.parse(readFileSync(new URL('../src/data/items.json', import.meta.url), 'utf8'));
export const fakes: Record<string, string[]> = JSON.parse(readFileSync(new URL('../src/data/fakes.json', import.meta.url), 'utf8'));

/**
 * A random source that runs the same from the same seed. Small seeds are
 * spread apart first, or their first rolls (who sits first, the first
 * question's kind) all come out alike.
 */
export function seeded(seed: number): () => number {
  // Held in a Uint32Array, not a variable: a variable holding a number past 2^31 holds a new heap
  // object every roll, which the embers' memory tests would count as theirs.
  const s = Uint32Array.of(Math.imul(seed, 2654435761));
  return () => {
    s[0] = s[0] * 1664525 + 1013904223;
    return s[0] / 2 ** 32;
  };
}

/**
 * A Storage kept in `store` (localStorage's stand-in). A write that `fits`
 * turns down throws, as a full storage does.
 */
export function memoryStorage(store = new Map<string, string>(), fits: (key: string, value: string) => boolean = () => true) {
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (!fits(k, String(v))) throw new Error('QuotaExceededError');
      store.set(k, String(v));
    },
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
}

/**
 * A tab's history as its page sees it (`history`, and `location` for the
 * address of the entry it is on): each entry's state, kept as a copy as the
 * browser keeps it, and its address. Going back or forward tells whoever
 * `listen`s a moment later, as a popstate does. `copy()` is the same history
 * in another tab: one the browser brought back (its entries' states and
 * all), or a duplicated one.
 */
export function memoryHistory(entries: { state: unknown; url: string }[] = [{ state: null, url: 'https://poe2.quest/' }], at = entries.length - 1) {
  const heard: (() => void)[] = [];
  /** An address as the page gives it (none: the one it is on), made whole against the one it is on. */
  const address = (url?: string | URL | null) => new URL(url ?? h.entries[h.at].url, h.entries[h.at].url).href;
  const h = {
    entries: entries.map((e) => ({ state: structuredClone(e.state), url: e.url })),
    at,
    get state(): unknown {
      return h.entries[h.at].state;
    },
    get location() {
      return new URL(h.entries[h.at].url);
    },
    pushState(state: unknown, _unused: string, url?: string | URL | null) {
      const entry = { state: structuredClone(state), url: address(url) };
      h.entries.splice(++h.at, Infinity, entry);
    },
    replaceState(state: unknown, _unused: string, url?: string | URL | null) {
      h.entries[h.at] = { state: structuredClone(state), url: address(url) };
    },
    go(n: number) {
      queueMicrotask(() => {
        const to = Math.min(Math.max(h.at + n, 0), h.entries.length - 1);
        if (to === h.at) return;
        h.at = to;
        for (const fn of heard) fn();
      });
    },
    back: () => h.go(-1),
    forward: () => h.go(1),
    listen(fn: () => void) {
      heard.push(fn);
    },
    copy: () => memoryHistory(h.entries, h.at),
  };
  return h;
}

/**
 * The Web Locks of one browser, shared by the pages a test plays in it:
 * each page's own manager (`of`), and `kill`, which lets go of every lock a
 * page holds, as a tab the browser kills does. Only `ifAvailable` requests,
 * as lib/keptCopy.ts makes them.
 */
export function sharedLocks() {
  /** Who holds each lock, by its name. */
  const held = new Map<string, string>();
  const releases = new Map<string, (() => void)[]>();
  return {
    held,
    of(page: string): LockManager {
      return {
        request: (async (name: string, opts: LockOptions, cb: (lock: Lock | null) => unknown) => {
          await Promise.resolve();
          if (held.has(name) && opts.ifAvailable) return cb(null);
          assert.ok(!held.has(name), 'only ifAvailable requests here');
          held.set(name, page);
          const done = cb({ name, mode: 'exclusive' } as Lock);
          const free = () => {
            if (held.get(name) === page) held.delete(name);
          };
          releases.set(page, [...(releases.get(page) ?? []), free]);
          await done;
          free();
        }) as LockManager['request'],
        query: async () => ({ held: [...held].map(([name, clientId]) => ({ name, clientId, mode: 'exclusive' as const })) }),
      };
    },
    kill(page: string) {
      for (const free of releases.get(page) ?? []) free();
      releases.delete(page);
    },
    clear() {
      held.clear();
      releases.clear();
    },
  };
}

/** The index of the right answer, of the first wrong one, and of every wrong one. */
export const right = (q: Question) => q.options.indexOf(q.itemId);
export const wrong = (q: Question) => q.options.findIndex((id) => id !== q.itemId);
export const wrongs = (q: Question) => q.options.flatMap((id, i) => (id === q.itemId ? [] : [i]));

/** An action the engine turns down quietly (dropped as stale) / out loud (an error to show). */
export const silently = (fn: () => unknown, message?: RegExp) =>
  assert.throws(fn, (e: unknown) => e instanceof ActionError && e.silent && (!message || message.test(e.message)));
export const loudly = (fn: () => unknown, message?: RegExp) =>
  assert.throws(fn, (e: unknown) => e instanceof ActionError && !e.silent && (!message || message.test(e.message)));

/** A game of turns in its lobby, `names` joined as p0, p1, ... (p0 hosting), on an engine whose clocks run by themselves. */
export function lobby(names: string[], target = 3, difficulty: Difficulty = 'cruel') {
  const engine = new Engine(items, { autoClock: true, rng: seeded(42) });
  let s: GameState = createGame('p0', { ...DEFAULT_SETTINGS, targetScore: target, timer: 0, difficulty });
  names.forEach((name, i) => (s = engine.apply(s, { type: 'join', playerId: `p${i}`, name }, `p${i}`)));
  return { engine, s };
}

/** Plays one turn for whoever is active: picks the first card on offer, answers right or wrong, moves on. */
export function playTurn(engine: Engine, s: GameState, correct: (id: string) => boolean): GameState {
  const me = s.players[s.turn].id;
  s = engine.apply(s, { type: 'pick', category: s.offered[0] }, me);
  const q = s.question!;
  s = engine.apply(s, { type: 'answer', index: correct(me) ? right(q) : wrong(q) }, me);
  return engine.apply(s, { type: 'next' }, me);
}

export const NONE: Inventory = { wards: 0, flares: 0, dynamite: 0 };
/** A Delve room's settings: what Delve takes from them is its mode alone. */
export const DELVE: Settings = { targetScore: 10, timer: 16, difficulty: 'merciless', mode: 'delve', public: false, locked: false };

export interface RunOpts {
  /** The players p0, p1, ... by name, or how many (named Delver A, B, ...). */
  players?: string[] | number;
  /** The host's id online (p0 by default), or null for hot-seat. */
  host?: string | null;
  seed?: number;
  settings?: Settings;
  /** Seats in id order, so lists in seat order read plainly (the start shuffles them); the turn stays with whoever had it. */
  sorted?: boolean;
  depth?: number;
  /** Whether the game starts (true by default). */
  start?: boolean;
  autoClock?: boolean;
}

/**
 * A room on a clock the test moves (`clock.now`) and rolls from `seed`, its
 * players joined and (unless told otherwise) the game started. Helpers act
 * as the trusted host unless told otherwise.
 */
export function room(o: RunOpts = {}) {
  let rng = seeded(o.seed ?? 1);
  const clock = { now: 1_000_000 };
  const engine = new Engine(items, { rng: () => rng(), now: () => clock.now, fakes, autoClock: o.autoClock });
  const host = o.host === undefined ? 'p0' : o.host;
  const names =
    typeof o.players === 'number' || o.players === undefined ? Array.from({ length: o.players ?? 1 }, (_, i) => `Delver ${'ABCDEFGHIJKL'[i]}`) : o.players;
  let s: GameState = createGame(host, o.settings ?? DELVE);
  names.forEach((name, i) => (s = engine.apply(s, { type: 'join', playerId: `p${i}`, name }, host === null ? null : `p${i}`)));
  if (o.start !== false) s = engine.apply(s, { type: 'start' }, host);
  if (o.sorted) {
    const on = s.players[s.turn]?.id;
    const players = [...s.players].sort((a, b) => a.id.localeCompare(b.id));
    s = { ...s, players, turn: Math.max(0, players.findIndex((p) => p.id === on)) };
  }
  if (o.depth) s = { ...s, round: o.depth };
  const h = {
    engine,
    clock,
    get s() {
      return s;
    },
    set s(v: GameState) {
      s = v;
    },
    /** Acts as `from` (null: the trusted host's own tooling). */
    act(a: Action, from: string | null = null) {
      s = engine.apply(s, a, from);
      return s;
    },
    /** Changes the host's state by hand (a depth, an inventory, a find on offer). */
    edit(fn: (s: GameState) => void) {
      const c = structuredClone(s);
      fn(c);
      s = c;
    },
    give(id: string, inv: Partial<Inventory>) {
      h.edit((c) => ((c.delve!.inventory ??= {})[id] = { ...NONE, ...inv }));
    },
    /** Rolls from here on from `seed` (the same room, other luck). */
    reseed(seed: number) {
      rng = seeded(seed);
    },
  };
  return h;
}
