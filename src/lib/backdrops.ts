// Delve's backdrops as the game has them: the zones' looks and their embers'
// motions from src/data/backdrops.json, and past the last zone the endgame,
// every stratum generated from a seed of its own (lib/backdropGen.ts), the
// same for everyone. lib/descent.ts and lib/emberMotion.ts read them here.
//
// The backdrop tool (backdrop.html, src/backdropTool) shows a draft in their
// place through setBackdrops, its hook; the game never calls it, so the game
// only ever has the file's.

import shipped from '../data/backdrops.json' with { type: 'json' };
import { cloneData, type Backdrops, type Endgame, type ZoneBackdrop } from './backdropData.ts';
import { generate, hueAt, hueDistance, hueOf, rng, stratumSeed, type Generated, type Steer } from './backdropGen.ts';
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

/** The golden ratio's fraction: each stratum's hue moves on by this much of the range, so no two in a row are alike and the hues never settle into a cycle. */
const GOLDEN = 0.6180339887498949;
/** How far a stratum's own seed may move its hue off that (a share of the range, either way). */
const JITTER = 0.07;

/** The seed stratum `k` (0 the first zone) is generated from: pinned by hand, or its own from the endgame's. */
export const seedAt = (k: number) => endgame.pinned[String(k + 1)] ?? stratumSeed(endgame.seed, k);

/** Where in the hue range the endgame starts (the first stratum past the zones lies as far from the last zone's hue as it can). */
let startPlace = NaN;
function start() {
  if (Number.isNaN(startPlace)) {
    const last = hueOf(zones[zones.length - 1].look.smoke).hue;
    let best = 0;
    for (let i = 0; i <= 100; i++) if (hueDistance(hueAt(endgame.settings, i / 100), last) > hueDistance(hueAt(endgame.settings, best), last) + 1e-9) best = i / 100;
    startPlace = best;
  }
  return startPlace;
}

/**
 * Where stratum `k`'s base hue lies in the range (0 to 1): a golden step on
 * from the one before, moved a little by its seed. So the hue moves on by
 * at least about a quarter of the range from one stratum to the next (87
 * degrees, the whole wheel), whatever the seeds, and stratum k needs no
 * other to be worked out.
 */
export function placeAt(k: number, seed = seedAt(k)): number {
  const n = k - zones.length;
  const step = (n * GOLDEN) % 1;
  const p = start() + step + (rng(seed)() - 0.5) * 2 * JITTER;
  return ((p % 1) + 1) % 1;
}

/** The strata past the zones, made once each (their looks are read every frame). */
const generated = new Map<number, Generated>();

/**
 * How much more colourful than the zones the endgame is (lib/backdropGen.ts,
 * Steer): past depth 100 the palettes may grow bolder, to lift the
 * excitement (the light still keeps to the scene's curve, lib/descent.ts).
 */
export const VIVID = 1;
/** How many seeds a stratum tries (its own, then the ones after it) before it settles for the least alike. */
export const TRIES = 12;

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
 * Stratum `k` past the zones (k from zones.length): generated from its seed
 * with the endgame's settings, its hue where placeAt puts it, steered clear
 * of the zones (lib/backdropGen.ts, Steer). Its look's lightK is 1
 * (lib/descent.ts works it out).
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
  const make = (s: number) => generate(s, endgame.settings, placeAt(k, s), steerNow());
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

// ---- names -------------------------------------------------------------------

/** The hue each zone's hall is known by (its low smoke's). */
const zoneHue = (i: number) => hueOf(zones[i].look.smoke).hue;
/** The detail strong enough to name a stratum after its zone. */
const NAMING = 0.25;

/** The biome a stratum past the zones looks most like (zones' index, never the first): its strongest detail's, else the nearest hue's; `not`, one it mustn't be. */
function biomeIndex(k: number, not = -1): number {
  const g = endgameAt(k);
  let best = -1;
  for (let i = 1; i < zones.length; i++) if (i !== not && g.look.env[i] >= NAMING && (best < 0 || g.look.env[i] > g.look.env[best])) best = i;
  if (best >= 0) return best;
  for (let i = 1; i < zones.length; i++) if (i !== not && (best < 0 || hueDistance(g.hue, zoneHue(i)) < hueDistance(g.hue, zoneHue(best)))) best = i;
  return best;
}

/**
 * The name of stratum `k` past the zones: the biome it looks most like,
 * never the one before's (worked out from a few strata back, so every
 * stratum's is the same whichever is asked for first).
 */
export function endgameName(k: number): string {
  const from = Math.max(zones.length, k - 6);
  let prev = from === zones.length ? zones.length - 1 : biomeIndex(from - 1);
  for (let j = from; j <= k; j++) {
    const own = biomeIndex(j);
    prev = own === prev ? biomeIndex(j, prev) : own;
  }
  return zones[prev].name;
}

onBackdrops(() => {
  startPlace = NaN;
});
