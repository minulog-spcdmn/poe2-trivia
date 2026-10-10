// How a room bot's hand reacts to the other pointers in the room (hand.ts):
// what it notices in their movement, and the moves it answers with. People
// play with each other's pointers: they wave (a quick back and forth), come
// up to someone's pointer, nudge it, chase it round the lobby, point at a
// name. A bot notices now and then, the more sociable the more often, and
// answers in kind: waves back, comes closer or shies off, follows a while.
// Pure functions of their inputs and a random source, so tests can pin them.

import type { Rng } from './brain.ts';
import type { Spot } from './reach.ts';

/** Where another pointer was seen, and when (ms), in the room's terms (reach.ts). */
export interface Sample {
  t: number;
  x: number;
  y: number;
}

/** What it keeps of each pointer (ms). */
export const KEEP_MS = 3000;
/** A wave is a few quick turns back and forth within this long (ms). */
const WAVE_MS = 1400;

const between = (rng: Rng, a: number, b: number) => a + (b - a) * rng();
const recent = (seen: Sample[], now: number, ms: number) => seen.filter((s) => s.t >= now - ms);

/**
 * Whether a pointer is waving: going back and forth quickly (three turns at
 * least, each leg a fair way) without getting anywhere much.
 */
export function waving(seen: Sample[], now: number): boolean {
  const s = recent(seen, now, WAVE_MS);
  if (s.length < 5) return false;
  const xs = s.map((p) => p.x);
  const ys = s.map((p) => p.y);
  const wide = Math.max(...xs) - Math.min(...xs);
  const tall = Math.max(...ys) - Math.min(...ys);
  // Along whichever way it goes most.
  const along = wide >= tall ? xs : ys;
  if (Math.max(wide, tall) < 20 || Math.max(wide, tall) > 280) return false;
  const legs: number[] = [];
  for (let i = 1; i < along.length; i++) {
    const d = along[i] - along[i - 1];
    if (!d) continue;
    if (legs.length && Math.sign(legs[legs.length - 1]) === Math.sign(d)) legs[legs.length - 1] += d;
    else legs.push(d);
  }
  return legs.filter((l) => Math.abs(l) >= 10).length >= 4;
}

/** Whether a pointer has come up to `me`: within `near` now, from well off a moment ago. */
export function approaching(seen: Sample[], me: Spot, now: number, near = 70): boolean {
  const last = seen.at(-1);
  if (!last || now - last.t > 400) return false;
  const d = (p: Sample) => Math.hypot(p.x - me.x, p.y - me.y);
  if (d(last) > near) return false;
  const before = seen.find((p) => p.t >= now - 1500);
  return !!before && d(before) > near * 2.2;
}

/** How far a pointer went in the last `ms`. */
export function travelled(seen: Sample[], now: number, ms = 1500): number {
  const s = recent(seen, now, ms);
  let d = 0;
  for (let i = 1; i < s.length; i++) d += Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y);
  return d;
}

/** A wave back, from `at`: the spots it goes through, mostly across, ending about where it began. */
export function wave(at: Spot, rng: Rng, small = false): Spot[] {
  const n = small ? 3 : 4 + Math.floor(rng() * 3);
  const size = small ? between(rng, 6, 12) : between(rng, 12, 24);
  const out: Spot[] = [];
  for (let i = 0; i < n; i++) out.push({ x: at.x + (i % 2 ? -size : size) * between(rng, 0.7, 1.15), y: at.y + (rng() - 0.5) * 8 });
  out.push({ x: at.x + (rng() - 0.5) * 6, y: at.y + (rng() - 0.5) * 6 });
  return out;
}

/** Toward someone, partway: never on top of them, and not all the way across the room. */
export function toward(me: Spot, them: Spot, rng: Rng, most = 260): Spot {
  const d = Math.hypot(them.x - me.x, them.y - me.y);
  if (d < 1) return me;
  const go = Math.min(most, Math.max(0, d - between(rng, 35, 70)), d * between(rng, 0.45, 0.85));
  return { x: me.x + ((them.x - me.x) / d) * go + (rng() - 0.5) * 16, y: me.y + ((them.y - me.y) / d) * go + (rng() - 0.5) * 16 };
}

/** A little way off from someone come too close: shy. */
export function awayFrom(me: Spot, them: Spot, rng: Rng): Spot {
  const d = Math.hypot(me.x - them.x, me.y - them.y) || 1;
  const go = between(rng, 40, 110);
  const turn = (rng() - 0.5) * 0.9;
  const ux = (me.x - them.x) / d;
  const uy = (me.y - them.y) / d;
  return { x: me.x + (ux * Math.cos(turn) - uy * Math.sin(turn)) * go, y: me.y + (ux * Math.sin(turn) + uy * Math.cos(turn)) * go };
}

/**
 * What a bot does about the others' pointers this time, if anything: wave
 * back at a wave, answer one come up to it (a little wiggle, a step back,
 * or a step closer), or follow one moving about a while (where it may: the
 * lobby, a reveal, the end). `sociable` (0 to 1) makes all of it likelier.
 */
export type Reaction = { kind: 'wave'; to: string; go: boolean } | { kind: 'greet' | 'shy' | 'nudge'; to: string } | { kind: 'follow'; to: string };

export function react(
  others: Map<string, Sample[]>,
  me: Spot,
  now: number,
  sociable: number,
  rng: Rng,
  { free = true, lastFor = new Map<string, number>() }: { free?: boolean; lastFor?: Map<string, number> } = {},
): Reaction | null {
  for (const [key, seen] of others) {
    // Answered this one lately: not again so soon (and never a wave back to a wave back, on and on).
    if (now - (lastFor.get(key) ?? -Infinity) < 15000) continue;
    if (waving(seen, now)) {
      // A wave far off is likely for someone else.
      const last = seen.at(-1)!;
      const mine = Math.hypot(last.x - me.x, last.y - me.y) < 250 ? 1 : 0.25;
      return rng() < (0.3 + 0.6 * sociable) * mine ? { kind: 'wave', to: key, go: free && rng() < 0.6 } : null;
    }
    if (approaching(seen, me, now)) {
      if (rng() >= 0.25 + 0.5 * sociable) return null;
      const r = rng();
      return { kind: r < 0.5 ? 'greet' : r < 0.75 + 0.15 * sociable ? 'nudge' : 'shy', to: key };
    }
  }
  if (!free) return null;
  // Someone moving about a lot: now and then it goes after them a little while.
  for (const [key, seen] of others) {
    if (now - (lastFor.get(key) ?? -Infinity) < 15000) continue;
    if (travelled(seen, now) > 350 && rng() < 0.012 * sociable) return { kind: 'follow', to: key };
  }
  return null;
}
