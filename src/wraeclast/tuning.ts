// The tuning panel's numbers (wraeclast.html), kept in storage: a run starts
// with them, and its log keeps a copy. Anything missing or out of shape in
// what was kept falls back to the handoff's number.

import { readStored, writeStored } from '../lib/storage.ts';
import { DEFAULT_TUNING, SECTIONS, SUPPLIES, type Range, type Tuning } from './rules.ts';

// 6: v5's slimmed rules (no flask, loot, corruption or free clues; prices one at a time).
const KEY = 'wraeclastTuning6';

/** Each number's range, for the panel's fields and for reading back what was kept. */
export const LIMITS = {
  life: [1, 999],
  gold: [0, 999],
  townHeal: [0, 999],
  tiles: [8, 36],
  missCost: [0, 999],
  price: [0, 999],
  torch: [1, 99],
  seeds: [3, 15],
  pay: [0, 999],
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
  const pay = rec(r.pay);
  return {
    life: whole(r.life, LIMITS.life, d.life),
    gold: whole(r.gold, LIMITS.gold, d.gold),
    townHeal: whole(r.townHeal, LIMITS.townHeal, d.townHeal),
    tiles: each(SECTIONS, r.tiles, LIMITS.tiles, d.tiles),
    names: Object.fromEntries(SECTIONS.map((s) => [s, range(rec(r.names)[s], LIMITS.names, d.names[s])])) as Tuning['names'],
    missCost: Object.fromEntries(SECTIONS.map((s) => [s, range(rec(r.missCost)[s], LIMITS.missCost, d.missCost[s])])) as Tuning['missCost'],
    price: each(SUPPLIES, r.price, LIMITS.price, d.price),
    torch: whole(r.torch, LIMITS.torch, d.torch),
    seeds: whole(r.seeds, LIMITS.seeds, d.seeds),
    pay: {
      early: range(pay.early, LIMITS.pay, d.pay.early),
      mid: range(pay.mid, LIMITS.pay, d.pay.mid),
      late: range(pay.late, LIMITS.pay, d.pay.late),
    },
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
