// The room bots' hands move as a person's did: they replay stretches of
// recorded play (src/data/botMotion.json, cut by scripts/bot-motion.mjs from
// recordings made with ?record), fitted to the moment. A stretch is kept
// relative to what was on screen then (the cards, the answers and the art,
// the lobby), and laid onto what is on this bot's screen now (reach.ts
// layout). A click's stretch has its lead (looking things over) and its
// final reach: the lead is fitted to the time the bot takes to make up its
// mind, its pauses longer or shorter and its moves as they were; the reach
// is steered, little by little as it goes, onto the bot's own pick, where it
// lands as the person's click did on theirs. Where the person rested on an
// answer while looking it over, the bot rests on its own: on what it leans
// to where they rested on what they picked, on what it's torn between where
// they rested on others, the moves between shifted to match. Wherever the
// hand is when a stretch begins, the stretch eases away from there into its
// own path. And no replay is the very same twice: each has its own slow,
// slight bend to its path (held off while it rests, and gone by the time it
// lands), its own wavering tempo, and its own pace, a little either way.
// Pure functions of their inputs and a random source, so tests can pin them.

import data from '../data/botMotion.json' with { type: 'json' };
import type { Rng } from './brain.ts';
import type { Box, Spot } from './reach.ts';

/** How far apart the recorded samples are (ms). */
export const STEP = data.step;

export interface ClickStretch {
  kind: 'card' | 'answer' | 'next';
  mode?: 'name' | 'art';
  n?: number;
  /** Where its frame was on the screen it was recorded on (Src). */
  src: Src;
  /** Positions, pairs of across and down in thousandths of the frame, every STEP ms. */
  lead: number[];
  reach: number[];
  /** Where in what it pressed the click landed (thousandths). */
  aim: [number, number];
  /** How long the button was held (ms). */
  hold: number;
  /** Where its lead rested: fives of first sample, last sample, on which answer or card (-1: none), where on it across, down. */
  dwells: number[];
  /** Which answer or card it picked in the end (-1: not one, Next). */
  pick: number;
}
export interface StreamStretch {
  kind: 'wait' | 'lobby';
  src: Src;
  /** Waiting through someone's card and then their question: where the frame was from `switchAt` (samples) on. */
  then?: Src;
  switchAt?: number;
  path: number[];
  /** Clicks at nothing on the way (ms from its start). */
  presses?: number[];
}
export type Stretch = ClickStretch | StreamStretch;

const ALL = data.episodes as Stretch[];

/**
 * Where a frame was on the screen a stretch was recorded on, in pixels:
 * its left, top, right and bottom from the room's top left, then the room's
 * width and its height down to the screen's bottom.
 */
export type Src = number[];

/** A path the hand follows: times (ms, on the bot's clock), places in its frame's thousandths, and where that frame was as recorded. */
export interface Track {
  t: number[];
  u: number[];
  v: number[];
  src: Src[];
}

const between = (rng: Rng, a: number, b: number) => a + (b - a) * rng();
/** Recorded movement (thousandths of the frame) over which a replay comes onto its recording from where the hand was. */
const SETTLE_PATH = 700;

const smooth = (k: number) => {
  const x = Math.min(1, Math.max(0, k));
  return x * x * (3 - 2 * x);
};

/** The bot's room (reach.ts): across, 0 to 1000; down, its screen's bottom (a 900 high screen, the room from 65 down). */
export const ROOM: [number, number] = [1000, ((900 - 65) / 900) * 1000];

/**
 * One way across or down: from the recorded screen's (its frame from `a`
 * to `b`, the room from 0 to `end`, pixels) onto this one's (the frame from
 * `lo` to `hi`, the room from 0 to `top`): within the frame, stretched to
 * it; beside it, the same share of the space between it and the screen's
 * edge, so whatever stayed on the recorded screen stays on this one.
 */
function across(x: number, a: number, b: number, end: number, lo: number, hi: number, top: number): number {
  if (x >= a && x <= b) return lo + ((x - a) / Math.max(1, b - a)) * (hi - lo);
  if (x < a) return lo - ((a - x) / Math.max(a, (b - a) * 0.25)) * lo;
  return hi + ((x - b) / Math.max(end - b, (b - a) * 0.25)) * (top - hi);
}
function back(y: number, a: number, b: number, end: number, lo: number, hi: number, top: number): number {
  if (y >= lo && y <= hi) return a + ((y - lo) / Math.max(1e-6, hi - lo)) * (b - a);
  if (y < lo) return a - ((lo - y) / Math.max(1e-6, lo)) * Math.max(a, (b - a) * 0.25);
  return b + ((y - hi) / Math.max(1e-6, top - hi)) * Math.max(end - b, (b - a) * 0.25);
}

/**
 * Where `u`, `v` (thousandths of the frame as recorded) are in the frame
 * `f` on this bot's screen: within it, stretched to it; beside it, as far
 * toward the screen's edge as it was on the screen recorded (`src`), so a
 * hand resting beside the answers rests beside them here, and never off
 * the screen.
 */
export function place(u: number, v: number, f: Box, src?: Src): Spot {
  if (!src) return { x: f[0] + (u / 1000) * (f[2] - f[0]), y: f[1] + (v / 1000) * (f[3] - f[1]) };
  const [l, t, r, b, w, h] = src;
  return { x: across(l + (u / 1000) * (r - l), l, r, w, f[0], f[2], ROOM[0]), y: across(t + (v / 1000) * (b - t), t, b, h, f[1], f[3], ROOM[1]) };
}

/** And back: where a spot is in thousandths of the frame as recorded. */
export function within(p: Spot, f: Box, src?: Src): [number, number] {
  if (!src) return [((p.x - f[0]) / (f[2] - f[0])) * 1000, ((p.y - f[1]) / (f[3] - f[1])) * 1000];
  const [l, t, r, b, w, h] = src;
  const x = back(p.x, l, r, w, f[0], f[2], ROOM[0]);
  const y = back(p.y, t, b, h, f[1], f[3], ROOM[1]);
  return [((x - l) / (r - l)) * 1000, ((y - t) / (b - t)) * 1000];
}

/** The frame of what's on screen: the union of `boxes`. */
export function frameOf(boxes: Box[]): Box | null {
  if (!boxes.length) return null;
  return [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])), Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))];
}

const duration = (pairs: number[]) => (pairs.length / 2 - 1) * STEP;

/**
 * A stretch for a click of `kind` (and `mode`, if any are), its lead as
 * near `leadMs` as there are: one of the nearest dozen at random, none it
 * used lately (`used`) if it can help it, so it isn't the same one over
 * again; a lead a little long is better (its pauses shorten), a lot too
 * short worse (they'd stretch long).
 */
export function pickClick(
  kind: ClickStretch['kind'],
  leadMs: number,
  rng: Rng,
  { mode, n, used = new Set() }: { mode?: string; n?: number; used?: ReadonlySet<Stretch> } = {},
  pool: Stretch[] = ALL,
): ClickStretch | null {
  let c = pool.filter((e): e is ClickStretch => e.kind === kind);
  if (mode && c.some((e) => e.mode === mode)) c = c.filter((e) => e.mode === mode);
  if (c.some((e) => !used.has(e))) c = c.filter((e) => !used.has(e));
  if (!c.length) return null;
  // As many answers as this question has, by preference (a list read through as long as this one).
  const off = (e: ClickStretch) => Math.abs(Math.log((duration(e.lead) + 400) / (leadMs + 400))) + (n && e.n !== n ? 0.45 : 0);
  const near = [...c].sort((a, b) => off(a) - off(b)).slice(0, 12);
  return near[Math.floor(rng() * near.length)];
}

/**
 * A replay's own small differences from the recording: a slow bend to its
 * path (thousandths of the frame, by time), a wavering tempo (by sample),
 * and its overall pace, a little either way.
 */
export interface Waver {
  bend: (t: number) => [number, number];
  tempo: (i: number) => number;
  pace: number;
}

export function waver(rng: Rng): Waver {
  const wave = () => {
    const period = between(rng, 1600, 4500);
    const phase = rng() * Math.PI * 2;
    const size = between(rng, 5, 15);
    return (t: number) => size * Math.sin((2 * Math.PI * t) / period + phase);
  };
  const [u1, u2, v1, v2] = [wave(), wave(), wave(), wave()];
  const period = between(rng, 12, 40);
  const phase = rng() * Math.PI * 2;
  const depth = between(rng, 0.06, 0.15);
  return { bend: (t) => [u1(t) + u2(t), v1(t) + v2(t)], tempo: (i) => 1 + depth * Math.sin((2 * Math.PI * i) / period + phase), pace: between(rng, 0.92, 1.08) };
}

/** The recording as it was: no bend, steady tempo, its own pace. */
export const STEADY: Waver = { bend: () => [0, 0], tempo: () => 1, pace: 1 };

/** For each sample, 1 where the pointer moves (it or a sample beside it changes), 0 where it rests: where a bend may show. */
function moving(pairs: number[]): number[] {
  const n = pairs.length / 2;
  const still = (i: number) => i > 0 && pairs[2 * i] === pairs[2 * i - 2] && pairs[2 * i + 1] === pairs[2 * i - 1];
  const raw = Array.from({ length: n }, (_, i) => (still(i) && (i + 1 >= n || still(i + 1)) ? 0 : 1));
  // Eased in and out over a couple of samples, so a rest doesn't jolt.
  return raw.map((_, i) => {
    let sum = 0;
    let k = 0;
    for (let j = Math.max(0, i - 2); j <= Math.min(n - 1, i + 2); j++, k++) sum += raw[j];
    return sum / k;
  });
}

/**
 * Where a click's stretch rested on the answers (or the cards), laid onto
 * the bot's own (`onto`: an index and the place on it, to where in the frame
 * it rests here; null to leave it be): for each sample of its lead, how far
 * to shift it, held through each rest and eased between them.
 */
export function steer(e: ClickStretch, onto: (index: number, on: [number, number]) => [number, number] | null): [number, number][] {
  const n = e.lead.length / 2;
  const keys: { a: number; b: number; off: [number, number] }[] = [];
  for (let k = 0; k + 4 < e.dwells.length; k += 5) {
    const [a, b, index, ru, rv] = e.dwells.slice(k, k + 5);
    const to = index >= 0 ? onto(index, [ru, rv]) : null;
    // A rest on nothing in particular stays where it was in the frame.
    keys.push({ a, b, off: to ? [to[0] - e.lead[2 * a], to[1] - e.lead[2 * a + 1]] : [0, 0] });
  }
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const at = keys.find((key) => i >= key.a && i <= key.b);
    if (at) {
      out.push(at.off);
      continue;
    }
    const before = [...keys].reverse().find((key) => key.b < i) ?? { b: 0, off: [0, 0] as [number, number] };
    const after = keys.find((key) => key.a > i);
    if (!after) {
      out.push(before.off);
      continue;
    }
    const w = smooth((i - before.b) / Math.max(1, after.a - before.b));
    out.push([before.off[0] + (after.off[0] - before.off[0]) * w, before.off[1] + (after.off[1] - before.off[1]) * w]);
  }
  return out;
}

/** A stretch of waiting (someone else's turn) or of the lobby, any of them but those used lately. */
export function pickStream(kind: StreamStretch['kind'], rng: Rng, used: ReadonlySet<Stretch> = new Set(), pool: Stretch[] = ALL): StreamStretch | null {
  let c = pool.filter((e): e is StreamStretch => e.kind === kind);
  if (c.some((e) => !used.has(e))) c = c.filter((e) => !used.has(e));
  return c.length ? c[Math.floor(rng() * c.length)] : null;
}

/**
 * When each of a lead's samples is shown so it lasts `ms` in all: its
 * pauses (where the pointer kept still) longer or shorter, its moves as
 * they were, `speed` aside (above 1, slower). Not enough room even with no
 * pauses: the moves go quicker, down to two thirds of their time; past
 * that, it starts partway in (the times then begin below 0, to be cut).
 */
export function fitLead(pairs: number[], ms: number, speed = 1, tempo: (i: number) => number = () => 1): number[] {
  const n = pairs.length / 2;
  if (n < 2) return n ? [ms] : [];
  const still: boolean[] = [];
  for (let i = 1; i < n; i++) still.push(pairs[2 * i] === pairs[2 * i - 2] && pairs[2 * i + 1] === pairs[2 * i - 1]);
  const moving = still.filter((s) => !s).length * STEP * speed;
  const paused = still.filter(Boolean).length * STEP;
  let move = speed;
  let pause = 1;
  if (ms >= moving) pause = paused ? (ms - moving) / paused : 0;
  else {
    pause = 0;
    move = Math.max((2 / 3) * speed, (ms / moving) * speed);
  }
  const t = [0];
  still.forEach((s, i) => t.push(t[t.length - 1] + STEP * (s ? pause : move * tempo(i))));
  // Room to spare (no pauses to stretch): it waits at the start; too little: it begins partway in.
  const shift = ms - t[t.length - 1];
  return t.map((x) => x + shift);
}

/**
 * A track from samples `pairs` shown at `times` (from `start`), coming onto
 * them from `from` (thousandths of its frame) only as the recorded hand
 * moves: still where it was still, the way there folded into its moves,
 * there by `settle` (a sample) or after SETTLE_PATH of movement, whichever
 * is first; and, if `to` is given, steered onto it by the end (little at
 * first, all of it at the last).
 */
export function track(
  pairs: number[],
  times: number[],
  start: number,
  from: [number, number] | null,
  to: [number, number] | null = null,
  settle = Infinity,
  src: (i: number) => Src = () => [0, 0, 1000, 1000, 1000, 1000],
  shift: (i: number, t: number) => [number, number] = () => [0, 0],
): Track {
  const n = pairs.length / 2;
  const out: Track = { t: [], u: [], v: [], src: [] };
  // Cut where it begins partway in (times below 0).
  const first = Math.max(0, times.findIndex((x) => x >= 0));
  // Each sample as shifted (a bend, rests laid onto the bot's own, its own place to wait); come onto from `from` and steered onto `to` from there.
  const base = (i: number): [number, number] => {
    const [du, dv] = shift(i, times[i]);
    return [pairs[2 * i] + du, pairs[2 * i + 1] + dv];
  };
  const [u0, v0] = base(first);
  const [ue, ve] = base(n - 1);
  const end = times[n - 1];
  // How far the recorded hand has moved by each sample, and how far it moves before it's to be on the recording.
  const moved = [0];
  for (let i = first + 1; i < n; i++) moved.push(moved[moved.length - 1] + Math.hypot(pairs[2 * i] - pairs[2 * i - 2], pairs[2 * i + 1] - pairs[2 * i - 1]));
  const by = moved[Math.min(moved.length - 1, Math.max(0, settle - first))];
  const reach = Math.min(SETTLE_PATH, by > 30 ? by : moved[moved.length - 1]);
  for (let i = first; i < n; i++) {
    let [u, v] = base(i);
    if (from) {
      const w = reach > 0 ? 1 - smooth(moved[i - first] / reach) : 1;
      u += (from[0] - u0) * w;
      v += (from[1] - v0) * w;
    }
    if (to) {
      const w = smooth(end > 0 ? times[i] / end : 1);
      u += (to[0] - ue) * w;
      v += (to[1] - ve) * w;
    }
    out.t.push(start + times[i]);
    out.u.push(u);
    out.v.push(v);
    out.src.push(src(i));
  }
  return out;
}

/**
 * The lead of a click's stretch, from `start` to `reachAt`, coming in from
 * `from` as it moves (track), its rests laid onto the bot's own (`onto`, steer), and wavered
 * (`w`): its path bent a little where it moves, its tempo and pace its own.
 */
export function leadTrack(
  e: ClickStretch,
  from: [number, number],
  start: number,
  reachAt: number,
  speed = 1,
  { onto, w = STEADY }: { onto?: (index: number, on: [number, number]) => [number, number] | null; w?: Waver } = {},
): Track {
  const shifted = onto ? steer(e, onto) : null;
  const mask = moving(e.lead);
  const times = fitLead(e.lead, Math.max(0, reachAt - start), speed * w.pace, w.tempo);
  // On the recording by its first rest on an answer or a card, which is laid onto the bot's own.
  let settle = Infinity;
  for (let k = 0; k + 4 < e.dwells.length && settle === Infinity; k += 5) if (e.dwells[k + 2] >= 0) settle = e.dwells[k];
  return track(e.lead, times, start, from, null, settle, () => e.src, (i, t) => {
    const [bu, bv] = w.bend(t);
    const [su, sv] = shifted?.[i] ?? [0, 0];
    return [su + bu * mask[i], sv + bv * mask[i]];
  });
}

/** Its final reach from `start`, from `from` onto `to` (thousandths of the frame), its bend fading out as it lands. */
export function reachTrack(e: ClickStretch, from: [number, number], to: [number, number], start: number, speed = 1, w: Waver = STEADY): Track {
  const n = e.reach.length / 2;
  const times: number[] = [0];
  for (let i = 1; i < n; i++) times.push(times[i - 1] + STEP * speed * w.pace * w.tempo(i));
  return track(e.reach, times, start, from, to, n - 1, () => e.src, (i, t) => {
    const fade = 1 - smooth(i / Math.max(1, n - 1));
    const [bu, bv] = w.bend(t);
    return [bu * fade, bv * fade];
  });
}

/**
 * A stream stretch (waiting, the lobby) from `start`, coming in from `from`
 * as it moves (track),
 * wavered (`w`), begun partway in (at one of its rests, `rng`), shifted
 * `aside` (a bot's own place to wait); and when its clicks at nothing fall.
 */
export function streamTrack(
  e: StreamStretch,
  from: [number, number],
  start: number,
  speed = 1,
  w: Waver = STEADY,
  rng?: Rng,
  aside: [number, number] = [0, 0],
): { track: Track; presses: number[] } {
  const n = e.path.length / 2;
  const mask = moving(e.path);
  // Begun at one of its rests (not the stir it begins with, which every hand would make at once).
  const rests = mask.map((m, i) => (m === 0 && (i === 0 || mask[i - 1] > 0) && i < n * 0.7 ? i : -1)).filter((i) => i > 0);
  const skip = rng && rests.length ? rests[Math.floor(rng() * rests.length)] : 0;
  const times: number[] = [];
  let t = -skip * STEP * speed * w.pace;
  for (let i = 0; i < n; i++) {
    if (i) t += STEP * speed * w.pace * (mask[i] ? w.tempo(i) : 1);
    times.push(t);
  }
  const src = (i: number) => (e.then && i >= (e.switchAt ?? Infinity) ? e.then : e.src);
  const presses = (e.presses ?? []).map((p) => (p - skip * STEP) * speed * w.pace).filter((p) => p >= 0);
  return {
    track: track(e.path, times, start, from, null, Infinity, src, (i, tt) => {
      const [bu, bv] = w.bend(tt);
      return [aside[0] + bu * mask[i], aside[1] + bv * mask[i]];
    }),
    presses: presses.map((p) => start + p),
  };
}

/** Where a track is at `now` (thousandths of its frame, and where the frame was as recorded): between its samples; held at its ends. */
export function trackAt(tr: Track, now: number): [number, number, Src] {
  const n = tr.t.length;
  if (!n) return [500, 500, [0, 0, 1000, 1000, 1000, 1000]];
  if (now <= tr.t[0]) return [tr.u[0], tr.v[0], tr.src[0]];
  if (now >= tr.t[n - 1]) return [tr.u[n - 1], tr.v[n - 1], tr.src[n - 1]];
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (tr.t[mid] <= now) lo = mid;
    else hi = mid;
  }
  const k = (now - tr.t[lo]) / Math.max(1, tr.t[hi] - tr.t[lo]);
  return [tr.u[lo] + (tr.u[hi] - tr.u[lo]) * k, tr.v[lo] + (tr.v[hi] - tr.v[lo]) * k, tr.src[lo]];
}

/**
 * A bot's own touch on the recorded hand, for good: how much slower or
 * quicker it moves (1: as recorded), and how still it keeps between
 * stretches of waiting (0 to 1: the longer its rests).
 */
export interface HandStyle {
  speed: number;
  still: number;
}

export const rollHandStyle = (rng: Rng): HandStyle => ({ speed: between(rng, 0.85, 1.25), still: rng() });

/** Before any is rolled (tests, bots made by hand): the recorded hand as it was. */
export const PLAIN_HAND: HandStyle = { speed: 1, still: 0.5 };
