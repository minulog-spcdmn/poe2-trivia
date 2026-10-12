// The room bot's players: made-up people who come on to host a room or join
// one. Each name always plays as the same person (strengths, pace, favourite
// settings, how much they like hosting), worked out from the name itself, so
// a regular is recognisable from one visit to the next without anything
// being stored. Who comes on next, and for how long, is up to chance and
// their own leanings; when a room opens, is up to the room list (wanted.ts).

import { rollHandStyle } from './motion.ts';
import type { Difficulty, Item } from '../lib/game.ts';
import { gauss, makePersona, weighted, type Persona, type Rng } from './brain.ts';

/**
 * Made-up handles in the styles people pick here (none taken from real
 * people), and in a mix, so a few in one list don't read as a set: first
 * names and nicknames, gamer tags with numbers, game jokes and jargon, the
 * odd character name, in any case and spacing, and some in other languages
 * and scripts.
 */
export const NAMES = [
  'mikey',
  'Fluffy2k',
  'OneMoreMap',
  'morgrim',
  'lukasz',
  'pancake',
  'sorc_main',
  'Sanne',
  'まったり',
  'nox77',
  'kitava_ate_me',
  'Tobi',
  'Grumpus',
  'crit_or_quit',
  'velka',
  'Jonny92',
  'lagspike',
  '小鱼',
  'hc_ssf_andy',
  'Matteo',
  'wobbly',
  'exalt_slammer',
  'Kev',
  'darkwing99',
  'NoAtlasPoints',
  'Bjarki',
  'Snacc',
  '감자',
  'out of waystones',
  'Ellie',
  'Kaiser_91',
  'vaal_it_anyway',
  'Noodle',
  'Саня',
  'andreas87',
  'xXsparkXx',
  'Deadeye_Dan',
  'yuki',
  'afk_again',
  'tabula_rasa_',
  'henrik',
  '老王',
  'Meatball',
  'breach_addict',
  'tomek',
  'joãozinho',
  'Jinxed',
  'regal_rat',
  'Aldric',
  'ggwp',
  'Rafa',
  'skill_issue',
  'Vexx',
  'ChronoNerd',
  'jess',
  'Pfannkuchen',
  'ねこ丸',
  'toastyy',
  'Boneshatter',
  'carlitos',
  'kaiju',
  'monk_btw',
  'thessa',
  'sleepy_owl',
  '초보',
  'infernalist4life',
  'lena',
  'Hunterrr',
  'chaos_beggar',
  'Gruff',
  'Kestrel',
  'Dani',
  'no_loot_filter',
  'Ronin',
  'Mr Biscuit',
  'RitualEnjoyer',
  'nacho',
  'flaskk',
  'grimtusk',
  'Gemling',
  'ysolde',
  'potato_pc',
  'whisper_me',
  'kurczak',
  'Tarn_ok',
  '2h_mace_only',
  'Cheesy',
  'Vovan',
  'kirbos',
  'Brannoc',
  'stormweaver_',
  'ok_buddy',
  'wren',
  'ArbiterFarmer',
  'gato_loco',
  'Tuấn',
  'sam',
  'witchhunter',
  'ahiru',
  'Volt',
];

/** The game modes a bot may host. */
export const MODES = ['turns', 'race', 'delve'] as const;
export type Mode = (typeof MODES)[number];
/** How often people host each (out of the modes allowed). */
const MODE_WEIGHTS: Record<Mode, number> = { turns: 5, race: 2, delve: 3 };

/** The modes in a list like "turns,delve" (case and spaces aside); all of them if it names none. */
export function modesFrom(list: string | null | undefined): Mode[] {
  const named = MODES.filter((m) => (list ?? '').toLowerCase().split(/[\s,]+/).includes(m));
  return named.length ? named : [...MODES];
}

export interface RoomPrefs {
  mode: Mode;
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

/**
 * Rules to host with, as people pick them (mostly take turns or Delve, mostly
 * Cruel; Delve has no rules of its own to pick), among the modes allowed.
 */
export function rollPrefs(rng: Rng, modes: readonly Mode[] = MODES): RoomPrefs {
  return {
    mode: pick(rng, [...modes], modes.map((m) => MODE_WEIGHTS[m])),
    difficulty: pick(rng, ['cruel', 'merciless', 'eternal'] as const, [6, 3, 1]),
    target: pick(rng, [5, 7, 10, 15], [2, 2, 4, 1]),
    timer: pick(rng, [16, 32, 64], [2, 5, 1]),
  };
}

/**
 * Other rules than `now`, among the modes allowed: a host who waited in vain
 * trying something else (another mode, or another difficulty outside Delve).
 * Null when there is nothing else to try (Delve the only mode allowed).
 */
export function otherPrefs(now: RoomPrefs, rng: Rng, modes: readonly Mode[] = MODES): RoomPrefs | null {
  if (modes.length === 1 && modes[0] === 'delve') return null;
  for (;;) {
    const next = rollPrefs(rng, modes);
    if (next.mode !== now.mode || (next.mode !== 'delve' && next.difficulty !== now.difficulty)) return next;
  }
}

/** One rule nudged a step, as a host fiddles before starting: the target score, or the timer. */
export function fiddled(now: RoomPrefs, rng: Rng): RoomPrefs {
  const step = (list: number[], v: number) => {
    const i = list.indexOf(v);
    const near = [list[i - 1], list[i + 1]].filter((x) => x !== undefined);
    return near.length ? near[Math.floor(rng() * near.length)] : v;
  };
  return rng() < 0.6 ? { ...now, target: step([5, 7, 10, 15], now.target) } : { ...now, timer: step([16, 32, 64], now.timer) };
}

/** Shuffled copy (Fisher-Yates, with `rng`). */
function shuffled<T>(list: T[], rng: Rng): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * The items a player knows cold, from the builds they played: a good share
 * of one kind of weapon's uniques (up to 12), and 8 to 16 others they wore
 * along the way.
 */
export function buildOf(items: Pick<Item, 'id' | 'group' | 'category'>[], rng: Rng): string[] {
  const weapons = items.filter((it) => it.category.endsWith('Weapons'));
  const groups = [...new Set(weapons.map((it) => it.group))].sort();
  if (!groups.length) return [];
  const main = groups[Math.floor(rng() * groups.length)];
  const own = shuffled(weapons.filter((it) => it.group === main), rng);
  const kept = own.slice(0, Math.min(12, Math.max(1, Math.round(own.length * (0.4 + 0.3 * rng())))));
  const worn = shuffled(items.filter((it) => it.group !== main), rng).slice(0, 8 + Math.floor(rng() * 9));
  return [...kept, ...worn].map((it) => it.id);
}

/**
 * Who a name is: always the same person for the same name and categories
 * (and modes allowed); `items`, to know their build by.
 */
export function identityOf(name: string, categories: string[], modes: readonly Mode[] = MODES, items: Pick<Item, 'id' | 'group' | 'category'>[] = []): Identity {
  const rng = seededBy(name);
  const persona = makePersona(categories, rng);
  const prefs = rollPrefs(rng, modes);
  persona.favourites = buildOf(items, seededBy(`${name}:build`));
  Object.assign(persona, leaningsOf(name));
  // And its hand style, its own for good.
  persona.hand = rollHandStyle(seededBy(`${name}:hand-style`));
  return { name, persona, prefs };
}

/**
 * How a name goes about rooms (Persona.hosting, sociable, picky), on its
 * own: quick to look up for the whole cast. Most would rather join; a few
 * like to host.
 */
export function leaningsOf(name: string): Pick<Persona, 'hosting' | 'sociable' | 'picky'> {
  const rng = seededBy(`${name}:rooms`);
  return { hosting: rng() ** 1.6, sociable: rng(), picky: rng() };
}

/**
 * The names one seat draws from when `of` seats run at once (`slot` 1 to
 * `of`): every seat its own, so nobody is in two places at the same time.
 */
export function namesFor(slot: number, of: number): string[] {
  if (!Number.isInteger(of) || of < 1 || !Number.isInteger(slot) || slot < 1 || slot > of) return NAMES;
  const share = NAMES.filter((_, i) => i % of === slot - 1);
  // More bots than names: the latecomers share the whole cast.
  return share.length ? share : NAMES;
}

/** How many of the last names wait before coming on again (at most half of those there are). */
const RESTING = 8;

/** The next to come on from `pool`: anyone but the last few, the keener (`keen`: a weight for each name) the likelier. */
export function nextName(recent: string[], rng: Rng, pool = NAMES, keen?: (name: string) => number): string {
  const resting = new Set(recent.slice(-Math.min(RESTING, Math.floor(pool.length / 2))));
  const free = pool.filter((n) => !resting.has(n));
  const from = free.length ? free : pool;
  return keen ? from[weighted(from.map(keen), rng)] : from[Math.floor(rng() * from.length)];
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
