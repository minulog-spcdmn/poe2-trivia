// How the room bot's players decide whether to host or to join, and which
// room to join: as people do, not by one number. Everyone leans one way
// (Persona.hosting), and what is on their mind tips it: what they did last
// time (habit), a long stint hosting lately (they've had their fill for
// now), a bad time as a guest lately (a host who never started: they'd
// sooner run a room themselves), and how much time they have (too little to
// look after a room). A room to join is weighed by their taste (their own
// mode and difficulty, and how much they mind others), whether they like a
// busy room or a quiet one, and how they got on with its host before; the
// longer they look, the less they mind. Pure functions of their inputs and a
// random source, so tests can pin them.

import type { RoomInfo } from '../lib/roomInfo.ts';
import type { Persona, Rng } from './brain.ts';
import type { RoomPrefs } from './identities.ts';

const HOUR = 3600000;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** What a seat remembers of someone between their visits (all of it optional: nothing yet). */
export interface Memory {
  /** What they did last time they were on. */
  last?: 'host' | 'join';
  /** When their last hosting stint ended, and how long it was (minutes). */
  hostedAt?: number;
  hostedFor?: number;
  /** A bad time as a guest (0 to 1), as of `sourAt`: it wears off. */
  sour?: number;
  sourAt?: number;
  /** How they got on with hosts they played with: -1 (badly) to 1 (very well). */
  hosts?: Record<string, number>;
}

/** How sour they still are about their last bad times as a guest: half of it wears off every hour. */
export const sourNow = (m: Memory, now: number) => (m.sour ?? 0) * 0.5 ** Math.max(0, (now - (m.sourAt ?? now)) / HOUR);

/**
 * How a visit to someone's room went: `won` a game, `played` (and had
 * enough), `lost heavily`, the host `never started`, the room `went` with
 * the game not done, or they were `turned away` at the door.
 */
export type Visit = 'won' | 'played' | 'lost heavily' | 'never started' | 'room went' | 'turned away';

/** How much each kind of visit sours them on being a guest, and warms them to (or cools them on) its host. */
const SOURS: Record<Visit, number> = { won: 0, played: 0, 'lost heavily': 0.1, 'never started': 0.4, 'room went': 0.2, 'turned away': 0.15 };
const WARMTH: Record<Visit, number> = { won: 0.35, played: 0.2, 'lost heavily': -0.1, 'never started': -0.4, 'room went': -0.15, 'turned away': -0.1 };
/** How many hosts stick in their mind: the ones they feel most strongly about. */
const HOSTS_KEPT = 12;

/** Their memory after a visit to `host`'s room. */
export function afterVisit(m: Memory, visit: Visit, host: string, now: number): Memory {
  const hosts = { ...m.hosts, [host]: clamp((m.hosts?.[host] ?? 0) + WARMTH[visit], -1, 1) };
  const kept = Object.entries(hosts)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, HOSTS_KEPT);
  return { ...m, last: 'join', sour: Math.min(1, sourNow(m, now) + SOURS[visit]), sourAt: now, hosts: Object.fromEntries(kept) };
}

/** Their memory after hosting for `minutes`. */
export const afterHosting = (m: Memory, minutes: number, now: number): Memory => ({ ...m, last: 'host', hostedAt: now, hostedFor: minutes });

/**
 * How much they feel like hosting right now (0 to 1), with `minutesFree`
 * to spare: their own leaning, tipped by habit, by a long stint hosting
 * lately (wearing off over three hours), by a bad time as a guest lately,
 * and by having too little time.
 */
export function urgeToHost(p: Pick<Persona, 'hosting'>, m: Memory, now: number, minutesFree: number): number {
  let urge = p.hosting;
  if (m.last === 'host') urge += 0.12;
  else if (m.last === 'join') urge -= 0.08;
  if (m.hostedAt !== undefined && m.hostedFor) urge -= Math.min(0.4, m.hostedFor / 150) * Math.max(0, 1 - (now - m.hostedAt) / (3 * HOUR));
  urge += 0.4 * sourNow(m, now);
  if (minutesFree < 25) urge -= 0.3;
  return clamp(urge, 0, 1);
}

/** How likely someone is to be the one who comes on now to host, or to join a room: the weight they're picked by. */
export const keenTo = (urge: number, to: 'host' | 'join') => (to === 'host' ? 0.05 + urge : 1.05 - urge);

/** Milliseconds someone about to open a room thinks it over: a few for the keen, 20 or so for the rest. */
export const hesitation = (urge: number, rng: Rng) => Math.round((2 + 20 * (1 - urge) ** 2) * (0.7 + 0.6 * rng()) * 1000);

/**
 * Looking for a room and finding none to play in: whether they open one,
 * and after how long (ms); null when they'd rather not (they soon give up
 * looking instead). The keener, the likelier and the sooner.
 */
export function opensRoom(urge: number, rng: Rng): number | null {
  return rng() < 0.25 + 0.75 * urge ? hesitation(urge, rng) : null;
}

/**
 * Why a host's room closed: `made way` for another room to join, `nobody
 * came`, `done` (their time up), or `sulking` after a heavy loss.
 */
export type HostExit = 'made way' | 'nobody came' | 'done' | 'sulking';

/**
 * After hosting, whether they stay on to play in someone else's room rather
 * than go: likelier after making way for that room, or when nobody came,
 * and the less they feel like hosting (`urge`, with the stint just over
 * counted in).
 */
export function joinsAfter(urge: number, exit: HostExit, rng: Rng): boolean {
  const odds: Record<HostExit, number> = { 'made way': 0.8, 'nobody came': 0.5, done: 0.25, sulking: 0 };
  return rng() < odds[exit] * (1 - urge);
}

/**
 * After a visit, with `minutesLeft` of their time: whether they look for
 * another room rather than go. Likelier after a let-down (they came to
 * play), less after a good time (they've had it), seldom after a heavy loss.
 */
export function playsOn(visit: Visit, minutesLeft: number, rng: Rng): boolean {
  if (minutesLeft < 10) return false;
  const odds: Record<Visit, number> = { won: 0.3, played: 0.25, 'lost heavily': 0.1, 'never started': 0.55, 'room went': 0.5, 'turned away': 0.6 };
  return rng() < odds[visit];
}

const DIFFICULTIES = ['cruel', 'merciless', 'eternal'];

/**
 * How much a room appeals to someone looking to join (about 0 to 1.3): the
 * rules, by how far they are from their own and how much they mind (a
 * different mode more than a different difficulty, Delve against the others
 * most); the company, a busy room for the sociable and a host on their own
 * for the rest; and how they got on with the host before (`warmth`, -1 to 1).
 */
export function appeal(p: Pick<Persona, 'sociable' | 'picky'>, taste: Pick<RoomPrefs, 'mode' | 'difficulty'>, room: Pick<RoomInfo, 'mode' | 'difficulty' | 'players'>, warmth = 0): number {
  const mode = room.mode === taste.mode ? 1 : room.mode === 'delve' || taste.mode === 'delve' ? 0.4 : 0.65;
  // Delve has no difficulty to pick; a custom room's is anyone's guess.
  const step = DIFFICULTIES.indexOf(room.difficulty);
  const difficulty = room.mode === 'delve' ? 1 : step < 0 ? 0.75 : 1 - 0.2 * Math.abs(step - DIFFICULTIES.indexOf(taste.difficulty));
  const rules = 1 - p.picky * (1 - mode * difficulty);
  const company = 1 + 0.15 * (2 * p.sociable - 1) * (room.players > 1 ? 1 : -1);
  return clamp(rules * company + 0.3 * warmth, 0, 1.5);
}

/** The least a room must appeal for them to join it, `minutes` into looking: choosy at first, settling for less as time goes on. */
export const settlesFor = (minutes: number) => Math.max(0.3, 0.8 - 0.1 * minutes);
