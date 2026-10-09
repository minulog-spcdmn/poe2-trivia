// The room bot's players: made-up people who take turns hosting. Each name
// always plays as the same person (strengths, pace, favourite settings),
// worked out from the name itself, so a regular is recognisable from one
// visit to the next without anything being stored. Who comes on next, and
// for how long, is up to chance; when, is up to the room list (wanted.ts).

import type { Difficulty } from '../lib/game.ts';
import { gauss, makePersona, weighted, type Persona, type Rng } from './brain.ts';

/** Made-up handles in the styles people pick here (none taken from real people). */
export const NAMES = [
  'Morgrim',
  'ashveil',
  'quietlyfrozen',
  'Tarn_ok',
  'Velka',
  'hexblast_enjoyer',
  'bramblewick',
  'OneMoreMap',
  'Ilvex',
  'tabula_rasa_',
  'Jorun',
  'Kessa',
  'faint_ember',
  'NoAtlasPoints',
  'grimtusk',
  'lightning_lily',
  'Ottis',
  'maraketh_maybe',
  'Pyrelle',
  'Fenwick',
  'boneshatter',
  'Hollowmere',
  'kirbos',
  'Ralv',
  'sorc_main',
  'Nimbrel',
  'Aldric',
  'Mirelle',
  'nosleepjustmaps',
  'vaal_it_anyway',
  'Thessa',
  'ashen_kit',
];

export interface RoomPrefs {
  mode: 'turns' | 'race' | 'delve';
  difficulty: Exclude<Difficulty, 'custom'>;
  target: number;
  /** Seconds per question (never 0: a room nobody can stall). */
  timer: number;
}

export interface Identity {
  name: string;
  persona: Persona;
  prefs: RoomPrefs;
}

/** A random source fixed by a string (mulberry32 seeded with its FNV-1a hash). */
export function seededBy(text: string): Rng {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

const pick = <T>(rng: Rng, options: T[], weights: number[]) => options[weighted(weights, rng)];

/** Rules to host with, as people pick them (mostly take turns or Delve, mostly Cruel; Delve has no rules of its own to pick). */
export function rollPrefs(rng: Rng): RoomPrefs {
  return {
    mode: pick(rng, ['turns', 'race', 'delve'] as const, [5, 2, 3]),
    difficulty: pick(rng, ['cruel', 'merciless', 'eternal'] as const, [6, 3, 1]),
    target: pick(rng, [5, 7, 10, 15], [2, 2, 4, 1]),
    timer: pick(rng, [16, 32, 64], [2, 5, 1]),
  };
}

/** Other rules than `now`: a host who waited in vain trying something else. */
export function otherPrefs(now: RoomPrefs, rng: Rng): RoomPrefs {
  for (;;) {
    const next = rollPrefs(rng);
    if (next.mode !== now.mode || next.difficulty !== now.difficulty) return next;
  }
}

/** Who a name is: always the same person for the same name and categories. */
export function identityOf(name: string, categories: string[]): Identity {
  const rng = seededBy(name);
  const persona = makePersona(categories, rng);
  return { name, persona, prefs: rollPrefs(rng) };
}

/**
 * The names one room draws from when `of` rooms run at once (`slot` 1 to
 * `of`): every room its own, so nobody hosts two rooms at the same time.
 */
export function namesFor(slot: number, of: number): string[] {
  if (!Number.isInteger(of) || of < 1 || !Number.isInteger(slot) || slot < 1 || slot > of) return NAMES;
  return NAMES.filter((_, i) => i % of === slot - 1);
}

/** How many of the last names wait before coming on again (at most half of those there are). */
const RESTING = 8;

/** The next to come on from `pool`: anyone but the last few. */
export function nextName(recent: string[], rng: Rng, pool = NAMES): string {
  const resting = new Set(recent.slice(-Math.min(RESTING, Math.floor(pool.length / 2))));
  const free = pool.filter((n) => !resting.has(n));
  const from = free.length ? free : pool;
  return from[Math.floor(rng() * from.length)];
}

const MIN = 60000;

/** A spread-out duration: `median` minutes typically, never outside lo..hi. */
function minutes(rng: Rng, median: number, lo: number, hi: number) {
  return Math.round(Math.min(hi, Math.max(lo, median * Math.exp(0.5 * gauss(rng)))) * MIN);
}

/** How long someone hosts before they call it a day (finishing the game they're in). */
export const shiftLength = (rng: Rng) => minutes(rng, 50, 20, 120);

/** How long someone waits alone in their lobby before they try other rules, or give up. */
export const lonelyLength = (rng: Rng) => minutes(rng, 9, 6, 15);
