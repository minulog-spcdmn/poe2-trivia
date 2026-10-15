// The room bot's players: made-up people who come on to host a room or join
// one. Each name always plays as the same person (strengths, pace, favourite
// settings, how much they like hosting), worked out from the name itself, so
// a regular is recognisable from one visit to the next without anything
// being stored. Who comes on next, and for how long, is up to chance and
// their own leanings; when a room opens, is up to the room list (wanted.ts).

import { LEFT_HANDED, rollHandStyle } from './motion.ts';
import { DEFAULT_SETTINGS, type Difficulty, type Item } from '../lib/game.ts';
import { seededBy } from './util.ts';
import { gauss, makePersona, rollEye, rollNerveForRisk, weighted, type Persona, type Rng } from './brain.ts';

/**
 * The regulars: people who keep coming back to a PoE2 quiz, so players who
 * go by the handle they use everywhere (their PoE account, Twitch, Discord).
 * Written to read as the public PoE2 ladder's account names do (visitors.ts
 * says how it was looked at), in about its proportions: a made-up word a
 * quarter of the time (these drawn from a model of the ladder's letters, kept
 * clear of every real handle in it: no five letters in a row in common), a
 * word or nickname with an ordinary number, words run together, a few short
 * letter strings, a surname or a name with digits, a little that's edgy, and
 * a few in other languages and scripts as people write them there (few: the
 * players here are mostly from Europe and the Americas). Almost no
 * food, animals or game jokes, as on the ladder. None is anyone's real handle.
 */
export const NAMES = [
  'Badashy',
  'Kamulak',
  'Zeleke',
  'Vhenort',
  'Taldoto',
  'Ikatka',
  'Delaxor',
  'Wintrax',
  'Lerasz',
  'Rotich',
  'Yatorr',
  'Qroth',
  'Halitton',
  'Sordlikka',
  'Varolg',
  'Moresis',
  'Ossen',
  'Firith',
  'Silessu',
  'Zecha',
  'Gelanu',
  'Nessouli',
  'Ubertop',
  'Dwartox',
  'Nyance',
  'Barnit',
  'lefashu',
  'venill',
  'urbox',
  'solind',
  'Ecoran',
  'Clongama',
  'raseppa',
  'enomos',
  'juhar',
  'swistrn',
  'Quallz',
  'ogardi',
  'zoichik',
  'KaRmino',
  'kenard7',
  'Mikonit92',
  'pinkeyx13',
  'Phrakena1',
  'xevel21',
  'Gurustan4',
  'wizzle2',
  'StormyNights',
  'Hexley9',
  'jabba101',
  'Torque23',
  'mumbles7',
  'Phantom81',
  'zaphod42',
  'GravelPit',
  'Snoozer',
  'Merlin1105',
  'kappa77',
  'Ozzy1987',
  'nemo113',
  'Brick21',
  'falcon06',
  'echo1206',
  'BlueStar',
  'CallMeRusty',
  'MasterOfNone',
  'TheDudeAbides',
  'IronLung',
  'BlackRainbow',
  'PaperTiger',
  'CaptainVoid',
  'DrSalty',
  'NotAnotherDan',
  'GreyMantle',
  'ElGrandeJefe',
  'Mister_Moody',
  'Lord_Fenwick',
  'djsk',
  'ianq',
  'xkor',
  'aerwy',
  'Pheb',
  'jvno',
  'oskl',
  'mikkelsen',
  'danielk93',
  'rafa_m',
  'ken0812',
  'lucasmrtz',
  'evanchen7',
  'lindahl',
  'markus_o',
  'DEMONIK07',
  'hellbent86',
  'Nekro666',
  '새벽세시',
  'quietriot',
  'brennick7',
  'Halvard',
  'sablejack',
  'Thornwick',
  'Тень',
  'Kopfkino',
  'Tordenvær',
  'Saudade',
  'elcapitan',
  'NoTradeLeague',
  'MidasPL',
  'Sh4rd',
  'n1ghtcap',
];

/** The game modes a bot may host. */
export const MODES = ['turns', 'race', 'delve'] as const;
export type Mode = (typeof MODES)[number];
/** How often people host each (out of the modes allowed). */
const MODE_WEIGHTS: Record<Mode, number> = { turns: 4, race: 2, delve: 6 };
/** How likely a host keeps the game's own rules for a mode (difficulty, target, timer: lib/game.ts DEFAULT_SETTINGS), as most people do. */
const KEEPS_DEFAULTS = 0.55;

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

export { seededBy };

const pick = <T>(rng: Rng, options: T[], weights: number[]) => options[weighted(weights, rng)];

/**
 * Rules to host with, as people pick them, among the modes allowed: Delve a
 * little more often than taking turns, racing least (Delve has no rules of
 * its own to pick). Most keep the game's own rules for the mode; the rest
 * set their own, easier or harder, longer or shorter.
 */
export function rollPrefs(rng: Rng, modes: readonly Mode[] = MODES): RoomPrefs {
  const mode = pick(rng, [...modes], modes.map((m) => MODE_WEIGHTS[m]));
  if (rng() < KEEPS_DEFAULTS) return { mode, ...DEFAULT_RULES };
  return {
    mode,
    difficulty: pick(rng, ['cruel', 'merciless', 'eternal'] as const, [4, 3, 2]),
    target: pick(rng, [5, 7, 10, 15], [3, 3, 1, 2]),
    timer: pick(rng, [16, 32, 64], [1, 4, 2]),
  };
}

/** The game's own rules for a mode, as a room starts with them. */
export const DEFAULT_RULES: Omit<RoomPrefs, 'mode'> = {
  difficulty: DEFAULT_SETTINGS.difficulty as RoomPrefs['difficulty'],
  target: DEFAULT_SETTINGS.targetScore,
  timer: DEFAULT_SETTINGS.timer,
};

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
  // And its hand style, its own for good (left or right: its share of the regulars, leftHanders; a newcomer's, visitors.ts).
  persona.hand = { ...rollHandStyle(seededBy(`${name}:hand-style`)), left: regularLefts().has(name) };
  // How little of a burning-in item it needs to see, and the items it knows: its own too.
  persona.eye = rollEye(seededBy(`${name}:eye`));
  // And how it takes a risk.
  Object.assign(persona, rollNerveForRisk(seededBy(`${name}:risk`)));
  // And how curious it is about items.
  persona.curious = seededBy(`${name}:curious`)() ** 1.5;
  persona.seed = name;
  return { name, persona, prefs };
}

/**
 * Who of `cast` mouses with the left hand: LEFT_HANDED of them (rounded),
 * the same ones every time (those lowest on a draw of their own), so the
 * cast has its share however the dice fell for each.
 */
export function leftHanders(cast: readonly string[]): Set<string> {
  const draw = new Map(cast.map((n) => [n, seededBy(`${n}:left`)()]));
  return new Set([...cast].sort((a, b) => draw.get(a)! - draw.get(b)!).slice(0, Math.round(LEFT_HANDED * cast.length)));
}

let lefts: Set<string> | null = null;
/** The regulars who mouse with the left hand. */
const regularLefts = () => (lefts ??= leftHanders(NAMES));

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

/**
 * The next to come on from `pool`: anyone but the last few, the keener
 * (`keen`: a weight for each name, 0 for one who won't come on now) the
 * likelier; one of the last few only when nobody else would.
 */
export function nextName(recent: string[], rng: Rng, pool = NAMES, keen?: (name: string) => number): string {
  const resting = new Set(recent.slice(-Math.min(RESTING, Math.floor(pool.length / 2))));
  const free = pool.filter((n) => !resting.has(n));
  if (!keen) {
    const from = free.length ? free : pool;
    return from[Math.floor(rng() * from.length)];
  }
  const from = free.some((n) => keen(n) > 0) ? free : pool;
  return from[weighted(from.map(keen), rng)];
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
