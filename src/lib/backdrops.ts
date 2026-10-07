// Delve's backdrops as the game has them: the zones' looks and their embers'
// motions from src/data/backdrops.json, and past the last zone the endgame,
// every stratum one of the archetypes (lib/archetypes.ts), dealt out so none
// comes twice in a row, generated from a seed of its own
// (lib/backdropGen.ts) and named from its archetype's names, the same for
// everyone. lib/descent.ts and lib/emberMotion.ts read them here.
//
// The backdrop tool (backdrop.html, src/backdropTool) shows a draft in their
// place through setBackdrops, its hook; the game never calls it, so the game
// only ever has the file's.

import shipped from '../data/backdrops.json' with { type: 'json' };
import { cloneData, ENVIRONMENTS, type Backdrops, type Endgame, type ZoneBackdrop } from './backdropData.ts';
import { ARCHETYPES, composedNames } from './archetypes.ts';
import { generateStratum, mix, rng, stratumSeed, type Generated, type Steer } from './backdropGen.ts';
import { difference, nearest, signatureOf, UNLIKE, type Signature } from './likeness.ts';

/** The file's backdrops, as shipped (never changed). */
export const SHIPPED: Backdrops = cloneData(shipped as unknown as Backdrops);

/** The zones (depths 1 to 10, 11 to 20, ... 91 to 100): the same list for as long as the page lives, its entries replaced by setBackdrops. */
export const zones: ZoneBackdrop[] = cloneData(SHIPPED.zones);
/** The endgame's seed, settings and pinned seeds (the same object, changed in place by setBackdrops). */
export const endgame: Endgame = cloneData(SHIPPED.endgame);

/** Bumped whenever setBackdrops changes them (what caches them checks it). */
export let backdropsVersion = 0;
const listeners = new Set<() => void>();

/** Calls `f` whenever setBackdrops changes them (lib/descent.ts and lib/emberMotion.ts drop what they worked out). */
export function onBackdrops(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/**
 * The backdrop tool's hook: shows `data` in place of the file's backdrops,
 * from the next frame on (the zones' names stay as they are). The game
 * never calls it.
 */
export function setBackdrops(data: Backdrops) {
  const next = cloneData(data);
  next.zones.forEach((z, k) => {
    if (zones[k]) zones[k] = { ...z, name: zones[k].name, announced: zones[k].announced };
  });
  endgame.seed = next.endgame.seed;
  endgame.settings = next.endgame.settings;
  endgame.pinned = next.endgame.pinned;
  generated.clear();
  steer = null;
  backdropsVersion++;
  for (const f of listeners) f();
}

// ---- the endgame ---------------------------------------------------------------

/** The seed stratum `k` (0 the first zone) is generated from: pinned by hand, or its own from the endgame's. */
export const seedAt = (k: number) => endgame.pinned[String(k + 1)] ?? stratumSeed(endgame.seed, k);

// ---- the archetypes dealt out ------------------------------------------------------

/** How many archetypes there are: the deck dealt out a round at a time. */
const DECK = ARCHETYPES.length;
/** How far apart the same archetype comes round, all but always: none of a round's first SPREAD is among the round before's last SPREAD (where no order of the round allows it, fewer; about one stratum in a thousand comes round sooner, never twice in a row). */
export const SPREAD = 4;

/** `items` in a seeded order (`r` its random numbers). */
function shuffle<T>(items: readonly T[], r: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Whether two archetypes share an effect (then they never follow each other). */
const shares = (a: number, b: number) => ARCHETYPES[a].fx.some((x) => ARCHETYPES[b].fx.some((y) => x.env === y.env));
/** The effects the last zone draws, which the endgame's first stratum follows. */
const lastZoneFx = (): string[] => ENVIRONMENTS.filter((_, i) => zones[zones.length - 1].look.env[i] > 0);
/** What an archetype follows: another (-1, none), or the effects a zone draws. */
type After = number | readonly string[];
/** Whether archetype `a` may follow `after`: sharing no effect with it. */
const follows = (after: After, a: number) =>
  typeof after === 'number' ? !(after >= 0 && shares(after, a)) : !ARCHETYPES[a].fx.some((x) => after.includes(x.env));

/**
 * Orders `items` (a seeded search, `r` its random numbers) so that no two
 * in a row share an effect (nor are the same), the first follows `after`
 * (an archetype, -1 for none, or the effects the last zone draws) and the
 * last goes before `before` without sharing one either, and none of the
 * first SPREAD is in `notFirst`. Where the
 * round before leaves no such order, the same with fewer of the first kept
 * clear of it; failing even that, the seed's shuffle as it is (`strict`:
 * null instead, at the first failure).
 */
function order(items: number[], r: () => number, after: After, before: number, notFirst: ReadonlySet<number>): number[];
function order(items: number[], r: () => number, after: After, before: number, notFirst: ReadonlySet<number>, strict: true): number[] | null;
function order(items: number[], r: () => number, after: After, before: number, notFirst: ReadonlySet<number>, strict = false): number[] | null {
  const pool = shuffle(items, r);
  for (let spread = SPREAD; spread >= 0; spread--) {
    const out: number[] = [];
    const used = new Set<number>();
    const fits = (a: number) => {
      const at = out.length;
      if (at < spread && notFirst.has(a)) return false;
      if (!follows(at ? out[at - 1] : after, a)) return false;
      return !(at === pool.length - 1 && before >= 0 && shares(a, before));
    };
    const place = (): boolean => {
      if (out.length === pool.length) return true;
      for (const a of pool) {
        if (used.has(a) || !fits(a)) continue;
        out.push(a);
        used.add(a);
        if (place()) return true;
        out.pop();
        used.delete(a);
      }
      return false;
    };
    if (place()) return out;
    if (strict) return null;
  }
  return pool;
}

/**
 * The last SPREAD of round `b`: dealt from the round's own seed alone, so
 * the round after needs nothing more of it. The first of the seed's orders
 * (a seeded search) whose SPREAD can follow each other, and whose rest can
 * be ordered before them.
 */
const tails = new Map<number, number[]>();
function tailOf(b: number): number[] {
  let tail = tails.get(b);
  if (!tail) {
    const r = rng(mix(mix(endgame.seed, 0x7a11), b));
    const all = shuffle(Array.from({ length: DECK }, (_, i) => i), r);
    const out: number[] = [];
    const pick = (): boolean => {
      if (out.length === SPREAD) {
        const rest = all.filter((a) => !out.includes(a));
        return order(rest, () => 0.5, -1, out[0], new Set(), true) !== null;
      }
      for (const a of all) {
        if (out.includes(a) || (out.length && shares(out[out.length - 1], a))) continue;
        out.push(a);
        if (pick()) return true;
        out.pop();
      }
      return false;
    };
    tail = pick() ? out : all.slice(0, SPREAD);
    if (tails.size > 256) tails.clear();
    tails.set(b, tail);
  }
  return tail;
}

const rounds = new Map<number, number[]>();
/**
 * Round `b` of the deal: every archetype once, in an order of the endgame's
 * seed, so that no two in a row share an effect (from one round into the
 * next as well), and none of its first SPREAD is among the round before's
 * last SPREAD (as far as any order allows). Its last SPREAD are dealt from its own seed alone
 * (tailOf), the rest ordered round them and the round before's; so every
 * round is worked out from two rounds' seeds, whichever is asked for first.
 * The first round's first shares no effect with the last zone either (its
 * features would otherwise go on through the turn into it unchanged), where
 * any order of the round allows it.
 */
function roundOf(b: number): number[] {
  let deal = rounds.get(b);
  if (deal) return deal;
  const tail = tailOf(b);
  const before = b > 0 ? tailOf(b - 1) : [];
  const rest = Array.from({ length: DECK }, (_, i) => i).filter((a) => !tail.includes(a));
  const r = () => rng(mix(mix(endgame.seed, 0xdec4), b));
  const first = b === 0 ? order(rest, r(), lastZoneFx(), tail[0], new Set(), true) : null;
  deal = [...(first ?? order(rest, r(), before.length ? before[before.length - 1] : -1, tail[0], new Set(before))), ...tail];
  if (rounds.size > 256) rounds.clear();
  rounds.set(b, deal);
  return deal;
}

/**
 * The archetype of stratum `k` past the zones (its index in ARCHETYPES,
 * lib/archetypes.ts): dealt out a round at a time, every archetype once a
 * round, so none comes twice in a row or soon again (all but always
 * more than SPREAD strata apart), each comes round as often as the others, and two in a row never
 * share an effect: each stratum differs from the one before in kind. A stratum's seed
 * (its own, re-rolled or pinned) makes a variation of its archetype.
 */
export function archetypeAt(k: number): number {
  const n = Math.max(0, k - zones.length);
  return roundOf(Math.floor(n / DECK))[n % DECK];
}

/** Archetype `a`'s names in the order its strata take them: its curated ones, then its composed ones, each shuffled by the endgame's seed. */
const nameLists = new Map<number, string[]>();
function namesOf(a: number): string[] {
  let list = nameLists.get(a);
  if (!list) {
    const arch = ARCHETYPES[a];
    const r = rng(mix(mix(endgame.seed, 0x4a3e), a));
    nameLists.set(a, (list = [...shuffle(arch.names, r), ...shuffle(composedNames(arch), r)]));
  }
  return list;
}

/**
 * The name of stratum `k` past the zones: its archetype's next. An
 * archetype comes once a round, so its strata take its names one a round,
 * the curated ones first: none comes round again until all of its names
 * have been taken, and no two archetypes share a name, so no name ever
 * follows itself.
 */
export function endgameName(k: number): string {
  const n = Math.max(0, k - zones.length);
  const list = namesOf(archetypeAt(k));
  return list[Math.floor(n / DECK) % list.length];
}

/** Every endgame name, by the archetype it is one of (lib/archetypes.ts). */
let byName: Map<string, number> | null = null;
/** The zone whose emblem (its sigil and ornament) a stratum called `name` bears: its own for a zone, its archetype's for one past the zones, or undefined. */
export function emblemOf(name: string): string | undefined {
  if (zones.some((z) => z.name === name)) return name;
  if (!byName) {
    byName = new Map();
    ARCHETYPES.forEach((a, i) => [...a.names, ...composedNames(a)].forEach((n) => byName!.set(n, i)));
  }
  const a = byName.get(name);
  return a === undefined ? undefined : ARCHETYPES[a].emblem;
}

/** What kind of place stratum `k` is: its zone's name, or past the zones its archetype's kind (the codex counts the biomes reached so). */
export const biomeAt = (k: number) => (k < zones.length ? zones[Math.max(0, k)].name : ARCHETYPES[archetypeAt(k)].kind);

/** The strata past the zones, made once each (their looks are read every frame). */
const generated = new Map<number, Generated>();

/**
 * How much more colourful than the zones the endgame is (lib/backdropGen.ts,
 * Steer): past depth 100 the palettes may grow bolder, to lift the
 * excitement (the light still keeps to the scene's curve, lib/descent.ts).
 */
export const VIVID = 1;
/** How many seeds a stratum tries (its own, then the ones after it) before it settles for the least alike. */
export const TRIES = 20;

/** The generator's steer: clear of the zones as they are now (worked out again whenever they change). */
let steer: Steer | null = null;
function steerNow(): Steer {
  steer ??= { avoid: zones.map((z) => signatureOf(z)), vivid: VIVID };
  return steer;
}
/** The zones' signatures as they are now (lib/likeness.ts). */
export const zoneSignatures = () => steerNow().avoid;

const signatures = new WeakMap<Generated, Signature>();
/** A generated stratum's signature (lib/likeness.ts), worked out once. */
export function signatureAt(g: Generated): Signature {
  let sig = signatures.get(g);
  if (!sig) signatures.set(g, (sig = signatureOf(g)));
  return sig;
}

/** Whether stratum `k` keeps a seed pinned by hand. */
export const isPinned = (k: number) => endgame.pinned[String(k + 1)] !== undefined;

/**
 * The strata next to stratum `k` (past the zones, not pinned) that it must
 * look unlike, without one ever waiting on the other: every other stratum
 * from the first past the zones (n even) keeps clear of the zones alone, and
 * of a pinned neighbour; the ones between (n odd) keep clear of both
 * neighbours as well. So each pair in a row is checked once, by whichever
 * of the two is generated after the other (the one before the first past
 * the zones is the last zone, which every stratum keeps clear of anyway),
 * and stratum k is worked out from at most its two neighbours.
 */
function neighboursOf(k: number): number[] {
  const odd = (k - zones.length) % 2 === 1;
  return [k - 1, k + 1].filter((j) => j >= zones.length && (odd || isPinned(j)));
}

/**
 * How unlike the zones and its neighbours a backdrop is: the least of its
 * differences (lib/likeness.ts) from each zone and from each stratum next
 * to it it must differ from (`others`).
 */
function unlikeness(sig: Signature, others: readonly Signature[]) {
  let least = nearest(sig, steerNow().avoid).difference;
  for (const o of others) least = Math.min(least, difference(sig, o));
  return least;
}

/**
 * Stratum `k` past the zones (k from zones.length): its archetype
 * (archetypeAt) generated from its seed with the endgame's settings,
 * steered clear of the zones (lib/backdropGen.ts, generateStratum). Its
 * look's lightK is 1 (lib/descent.ts works it out).
 *
 * A stratum's own seed whose look still comes out too like a zone or a
 * neighbour (less than UNLIKE apart, lib/likeness.ts) is re-rolled, the
 * same way for everyone: the seeds after it, one by one, up to TRIES in
 * all, the first unlike enough kept, or else the least alike of them. A
 * seed pinned by hand, or one the tool tries (`seed` not the stratum's
 * own), is the user's choice and is never re-rolled.
 */
export function endgameAt(k: number, seed = seedAt(k)): Generated {
  const own = seed === seedAt(k);
  let g = own ? generated.get(k) : undefined;
  if (g) return g;
  const make = (s: number) => generateStratum(s, endgame.settings, archetypeAt(k), steerNow());
  if (!own || isPinned(k)) g = make(seed);
  else {
    const others = neighboursOf(k).map((j) => signatureAt(endgameAt(j)));
    let best = -Infinity;
    for (let i = 0; i < TRIES; i++) {
      const c = make((seed + i) >>> 0);
      c.rolled = i;
      const u = unlikeness(signatureAt(c), others);
      if (u > best) {
        best = u;
        g = c;
      }
      if (u >= UNLIKE) break;
    }
  }
  if (own) {
    if (generated.size > 512) generated.clear();
    generated.set(k, g!);
  }
  return g!;
}

/**
 * How stratum `k` (past the zones) as shown, from `seed`, compares: the
 * zone it comes nearest (its index) and how far it is, and how far it is
 * from the stratum before (the last zone, for the first) and the one
 * after. The tool shows it; a pinned seed may come out too alike, which
 * the tool warns of but never changes.
 */
export function likenessAt(k: number, seed = seedAt(k)) {
  const sig = signatureAt(endgameAt(k, seed));
  const zone = nearest(sig, steerNow().avoid);
  const before = k - 1 < zones.length ? steerNow().avoid[zones.length - 1] : signatureAt(endgameAt(k - 1));
  return { zone: zone.index, difference: zone.difference, before: difference(sig, before), after: difference(sig, signatureAt(endgameAt(k + 1))) };
}

onBackdrops(() => {
  rounds.clear();
  tails.clear();
  nameLists.clear();
});
