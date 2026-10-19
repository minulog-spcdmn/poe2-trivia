// The tuning panel's numbers (wraeclast.html), kept in storage: a run starts
// with them, and its log keeps a copy. Anything missing or out of shape in
// what was kept falls back to the handoff's number.

import { readStored, writeStored } from '../lib/storage.ts';
import { DEFAULT_TUNING, LOOT_KINDS, SECTIONS, SUPPLIES, ZONE_TYPES, type Range, type Tuning } from './rules.ts';

const KEY = 'wraeclastTuning4';

/** Each number's range, for the panel's fields and for reading back what was kept. */
export const LIMITS = {
  life: [1, 999],
  gold: [0, 999],
  flask: [0, 9],
  itemsPerZone: [1, 3],
  zoneShare: [0, 100],
  tiles: [8, 36],
  missCost: [0, 999],
  price: [0, 999],
  stack: [1, 5],
  burnIn: [1, 99],
  seeds: [3, 15],
  cards: [0, 9],
  weight: [0, 99],
  lootGold: [0, 999],
  supplies: [1, 5],
  fronts: [0, 5],
  creep: [1, 3],
  multiplier: [1, 5],
  names: [0, 6],
} as const satisfies Record<string, readonly [number, number]>;

/** A whole number in [lo, hi], or the fallback. */
function whole(v: unknown, [lo, hi]: readonly [number, number], fallback: number) {
  return typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : fallback;
}

/** A range of whole numbers in [lo, hi], low end first, or the fallback. */
function range(v: unknown, limits: readonly [number, number], fallback: Range): Range {
  if (!Array.isArray(v) || v.length !== 2) return [...fallback];
  const lo = whole(v[0], limits, NaN);
  const hi = whole(v[1], limits, NaN);
  return Number.isNaN(lo) || Number.isNaN(hi) || lo > hi ? [...fallback] : [lo, hi];
}

const rec = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
/** Each key's whole number, or the fallback's. */
const each = <K extends string>(keys: readonly K[], v: unknown, limits: readonly [number, number], d: Record<K, number>) =>
  Object.fromEntries(keys.map((k) => [k, whole(rec(v)[k], limits, d[k])])) as Record<K, number>;

/** Tuning read from anything (a kept copy, a pasted one): every field checked, the handoff's where it isn't right. */
export function cleanTuning(raw: unknown): Tuning {
  const r = rec(raw);
  const d = DEFAULT_TUNING;
  const loot = rec(r.loot);
  const free = rec(r.freeClue);
  const burn = rec(r.burnIn);
  const cor = rec(r.corruption);
  const gold = rec(loot.gold);
  return {
    life: whole(r.life, LIMITS.life, d.life),
    gold: whole(r.gold, LIMITS.gold, d.gold),
    flask: whole(r.flask, LIMITS.flask, d.flask),
    itemsPerZone: whole(r.itemsPerZone, LIMITS.itemsPerZone, d.itemsPerZone),
    zoneShare: whole(r.zoneShare, LIMITS.zoneShare, d.zoneShare),
    tiles: each(SECTIONS, r.tiles, LIMITS.tiles, d.tiles),
    names: Object.fromEntries(SECTIONS.map((s) => [s, range(rec(r.names)[s], LIMITS.names, d.names[s])])) as Tuning['names'],
    missCost: Object.fromEntries(SECTIONS.map((s) => [s, range(rec(r.missCost)[s], LIMITS.missCost, d.missCost[s])])) as Tuning['missCost'],
    price: each(SUPPLIES, r.price, LIMITS.price, d.price),
    stack: each(SUPPLIES, r.stack, LIMITS.stack, d.stack),
    burnIn: {
      flare: whole(burn.flare, LIMITS.burnIn, d.burnIn.flare),
      blight: whole(burn.blight, LIMITS.burnIn, d.burnIn.blight),
      boss: whole(burn.boss, LIMITS.burnIn, d.burnIn.boss),
      deck: whole(burn.deck, LIMITS.burnIn, d.burnIn.deck),
    },
    seeds: whole(r.seeds, LIMITS.seeds, d.seeds),
    loot: {
      cards: each(ZONE_TYPES, loot.cards, LIMITS.cards, d.loot.cards),
      weights: each(LOOT_KINDS, loot.weights, LIMITS.weight, d.loot.weights),
      gold: {
        early: range(gold.early, LIMITS.lootGold, d.loot.gold.early),
        mid: range(gold.mid, LIMITS.lootGold, d.loot.gold.mid),
        late: range(gold.late, LIMITS.lootGold, d.loot.gold.late),
      },
      supplies: whole(loot.supplies, LIMITS.supplies, d.loot.supplies),
    },
    corruption: {
      seeds: whole(cor.seeds, LIMITS.fronts, d.corruption.seeds),
      creep: whole(cor.creep, LIMITS.creep, d.corruption.creep),
      multiplier: whole(cor.multiplier, LIMITS.multiplier, d.corruption.multiplier),
    },
    marks: r.marks === 'gold' || r.marks === 'both' ? r.marks : d.marks,
    freeClue: Object.fromEntries(ZONE_TYPES.map((z) => [z, typeof free[z] === 'boolean' ? free[z] : d.freeClue[z]])) as Tuning['freeClue'],
  };
}

export function readTuning(): Tuning {
  try {
    return cleanTuning(JSON.parse(readStored(KEY) ?? 'null'));
  } catch {
    return cleanTuning(null);
  }
}

export function writeTuning(t: Tuning) {
  writeStored(KEY, JSON.stringify(t));
}

/** Whether a tuning is the handoff's own. */
export const isDefault = (t: Tuning) => JSON.stringify(cleanTuning(t)) === JSON.stringify(DEFAULT_TUNING);
