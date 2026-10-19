// The tuning panel's numbers (wraeclast.html), kept in storage: a run starts
// with them, and its log keeps a copy. Anything missing or out of shape in
// what was kept falls back to the handoff's number.

import { readStored, writeStored } from '../lib/storage.ts';
import { BOARD_SIZES, DEFAULT_TUNING, SUPPLIES, ZONE_TYPES, type Section, type Tuning } from './rules.ts';

const KEY = 'wraeclastTuning';

/** Each number's range, for the panel's fields and for reading back what was kept. */
export const LIMITS = {
  life: [1, 999],
  gold: [0, 999],
  flask: [0, 9],
  missCost: [0, 999],
  reward: [0, 999],
  price: [0, 999],
} as const satisfies Record<string, readonly [number, number]>;

const SECTIONS: readonly Section[] = ['early', 'late', 'boss'];

/** A whole number in [lo, hi], or the fallback. */
function whole(v: unknown, [lo, hi]: readonly [number, number], fallback: number) {
  return typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : fallback;
}

/** Tuning read from anything (a kept copy, a pasted one): every field checked, the handoff's where it isn't right. */
export function cleanTuning(raw: unknown): Tuning {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof Tuning, unknown>>;
  const d = DEFAULT_TUNING;
  const rec = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
  const miss = rec(r.missCost);
  const reward = rec(r.reward);
  const price = rec(r.price);
  const board = rec(r.board);
  const free = rec(r.freeClue);
  return {
    life: whole(r.life, LIMITS.life, d.life),
    gold: whole(r.gold, LIMITS.gold, d.gold),
    flask: whole(r.flask, LIMITS.flask, d.flask),
    missCost: Object.fromEntries(SECTIONS.map((s) => [s, whole(miss[s], LIMITS.missCost, d.missCost[s])])) as Tuning['missCost'],
    reward: { early: whole(reward.early, LIMITS.reward, d.reward.early), late: whole(reward.late, LIMITS.reward, d.reward.late) },
    price: Object.fromEntries(SUPPLIES.map((s) => [s, whole(price[s], LIMITS.price, d.price[s])])) as Tuning['price'],
    board: Object.fromEntries(SECTIONS.map((s) => [s, (BOARD_SIZES as readonly unknown[]).includes(board[s]) ? board[s] : d.board[s]])) as Tuning['board'],
    freeClue: Object.fromEntries(ZONE_TYPES.map((z) => [z, typeof free[z] === 'boolean' ? free[z] : d.freeClue[z]])) as Tuning['freeClue'],
    wordCount: typeof r.wordCount === 'boolean' ? r.wordCount : d.wordCount,
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
