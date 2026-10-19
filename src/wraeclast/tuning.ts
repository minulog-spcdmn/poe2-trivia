// The tuning panel's numbers (wraeclast.html), kept in storage: a run starts
// with them, and its log keeps a copy. Anything missing or out of shape in
// what was kept falls back to the handoff's number.

import { readStored, writeStored } from '../lib/storage.ts';
import { BOARDS, DEFAULT_TUNING, DEPTHS, SUPPLIES, type Range, type Tuning } from './rules.ts';

// 7: v5's open region (depth, mods, the Seed and the duel).
const KEY = 'wraeclastTuning7';

/** Each number's range, for the panel's fields and for reading back what was kept. */
export const LIMITS = {
  life: [1, 999],
  gold: [0, 999],
  townHeal: [0, 999],
  tiles: [8, 36],
  names: [0, 6],
  missCost: [0, 999],
  pay: [0, 999],
  depthRoll: [0, 100],
  modOdds: [1, 99],
  modGold: [0, 999],
  modDamage: [0, 999],
  seedLife: [1, 999],
  seedHit: [0, 999],
  seedGrowth: [0, 999],
  seedHitEvery: [1, 99],
  duelHit: [0, 999],
  duelMiss: [0, 999],
  price: [0, 999],
  torch: [1, 99],
  seeds: [3, 15],
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
  const hits = Array.isArray(r.duelHit) && r.duelHit.length === 3 ? r.duelHit : [];
  return {
    life: whole(r.life, LIMITS.life, d.life),
    gold: whole(r.gold, LIMITS.gold, d.gold),
    townHeal: whole(r.townHeal, LIMITS.townHeal, d.townHeal),
    tiles: each(BOARDS, r.tiles, LIMITS.tiles, d.tiles),
    names: Object.fromEntries(BOARDS.map((b) => [b, range(rec(r.names)[b], LIMITS.names, d.names[b])])) as Tuning['names'],
    missCost: each(DEPTHS, r.missCost, LIMITS.missCost, d.missCost),
    pay: each(DEPTHS, r.pay, LIMITS.pay, d.pay),
    depthRoll: each(DEPTHS, r.depthRoll, LIMITS.depthRoll, d.depthRoll),
    modOdds: whole(r.modOdds, LIMITS.modOdds, d.modOdds),
    modGold: whole(r.modGold, LIMITS.modGold, d.modGold),
    modDamage: whole(r.modDamage, LIMITS.modDamage, d.modDamage),
    seedLife: whole(r.seedLife, LIMITS.seedLife, d.seedLife),
    seedHit: whole(r.seedHit, LIMITS.seedHit, d.seedHit),
    seedGrowth: whole(r.seedGrowth, LIMITS.seedGrowth, d.seedGrowth),
    seedHitEvery: whole(r.seedHitEvery, LIMITS.seedHitEvery, d.seedHitEvery),
    duelHit: d.duelHit.map((h, i) => whole(hits[i], LIMITS.duelHit, h)) as Tuning['duelHit'],
    duelMiss: whole(r.duelMiss, LIMITS.duelMiss, d.duelMiss),
    price: each(SUPPLIES, r.price, LIMITS.price, d.price),
    torch: whole(r.torch, LIMITS.torch, d.torch),
    seeds: whole(r.seeds, LIMITS.seeds, d.seeds),
    marks: r.marks === 'gold' || r.marks === 'both' ? r.marks : d.marks,
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
