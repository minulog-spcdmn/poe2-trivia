// What a room bot does with its pointer while it reads, thinks and waits:
// its hand style, one of its own for good (identities.ts rolls it from the
// name), and the plans that style makes (hand.ts carries them out).
//
// People's pointers follow their eyes only loosely (eye tracking on web
// pages: Chen et al. 2001, Rodden et al. 2008, Huang et al. 2012). Many park
// the pointer while they read or think, often beside what they read, and
// only move once they're about to act; fewer trace what they read with it;
// some rest it on what they're torn between; a few never keep it still. The
// pointer trails the eyes by half a second or more, and is nearest them just
// before a click. So the habits:
// • park: the pointer goes aside (or stays put) and waits; the answer is
//   picked from there, now and then after a brief lean toward one;
// • trace: it follows the reading, never still for long: up to what's asked
//   first, now and then, then sweeps down the answers (across the rows of
//   pictures) without stopping on each, pausing here and there, and back and
//   forth between a few when unsure;
// • hover: it rests a while on one candidate, or two or three when unsure;
// • fidget: parked, but never still, small wiggles and circles meanwhile.
// A habit is a lean, not a rule: each question, the situation steers it
// (pickHabit). Sure of the answer, a hand waits and then goes straight
// there; unsure, it reads and hovers more; just after a miss, it reads more
// carefully; tired, after a long while, it parks more and moves less; and
// with the clock nearly out, an unsure one stops browsing and darts between
// its last few candidates. After the answer is shown, people look at it:
// the right one, now and then their own pick first (afterReveal).
// A player's recorded hand (lib/recorder.ts; a long Delve run alone) tuned
// the tracing: how fast a sweep goes, how often it turns back, how long it
// pauses, and how often it goes up to the question first.
// Pure functions of their inputs and a random source, so tests (and the
// styles' preview) can pin them.

import type { Rng } from './brain.ts';
import { sweepTime, type Box, type Spot } from './reach.ts';

export type Habit = 'park' | 'trace' | 'hover' | 'fidget';

export interface HandStyle {
  habit: Habit;
  /** Mouse skill, 0 to 1: deft hands move quicker and land closer, clumsy ones overshoot more and correct twice. */
  deft: number;
  /** How bowed its strokes are, 0 (nearly straight) to 1. */
  curve: number;
  /** Where it parks while reading: beside the answers, below them, or wherever it is. */
  rest: 'side' | 'low' | 'stay';
  /**
   * How much it clicks at nothing, 0 to 1: just after moving on, or idly,
   * a press on an empty spot (everyone sees a press). Most hardly ever; some
   * click through everything, as the recorded hand did.
   */
  clicky: number;
}

/** How common each habit is (parking most). */
const HABITS: [Habit, number][] = [
  ['park', 0.35],
  ['trace', 0.3],
  ['hover', 0.25],
  ['fidget', 0.1],
];

/** A bot's hand style, from its own random source. */
export function rollHandStyle(rng: Rng): HandStyle {
  let r = rng();
  let habit: Habit = 'park';
  for (const [h, w] of HABITS) {
    if (r < w) {
      habit = h;
      break;
    }
    r -= w;
  }
  const rest = rng();
  const deft = rng();
  const curve = rng();
  const clicky = rng() < 0.25 ? 0.4 + 0.6 * rng() : 0.08 * rng();
  return { habit, deft, curve, rest: rest < 0.5 ? 'side' : rest < 0.8 ? 'low' : 'stay', clicky };
}

/** Before any style is rolled (tests, bots made by hand). */
export const PLAIN_HAND: HandStyle = { habit: 'park', deft: 0.5, curve: 0.5, rest: 'side', clicky: 0.05 };

/**
 * A step in looking a choice over: at `at`, to an anchor (aimed at its
 * words, `text`) or a spot of the room (`spot`, which also says where in the
 * anchor, if both); `through` some spots first, in one sweep taking `ms`.
 */
export interface Glance {
  at: number;
  anchor?: string;
  spot?: Spot;
  text?: boolean;
  through?: Spot[];
  ms?: number;
}

/**
 * What steers a hand on a question: whether it's `sure` of the answer,
 * whether it's being `careful` (it just missed one), how `tired` it is (0
 * to 1, after a long session), and from when the clock is nearly out
 * (`urgentAt`, on the same clock as the plan's times; Infinity: never).
 */
export interface Situation {
  sure: boolean;
  careful: boolean;
  tired: number;
  urgentAt: number;
}

/** This question's habit: its own, mostly, as the situation leans it. */
export function pickHabit(style: HandStyle, sit: Situation, rng: Rng): Habit {
  const w = Object.fromEntries(HABITS.map(([h, p]) => [h, p * 0.35 + (h === style.habit ? 0.65 : 0)])) as Record<Habit, number>;
  if (sit.sure) {
    w.park *= 1.5;
    w.trace *= 0.5;
  } else {
    w.trace *= 1.3;
    w.hover *= 1.3;
  }
  if (sit.careful) w.trace *= 2.2;
  w.park *= 1 + 2 * sit.tired;
  w.trace *= 1 - 0.6 * sit.tired;
  w.fidget *= 1 - 0.5 * sit.tired;
  let r = rng() * Object.values(w).reduce((a, b) => a + b, 0);
  for (const [h] of HABITS) {
    if (r < w[h]) return h;
    r -= w[h];
  }
  return style.habit;
}

/** Where it parks this time: its own place, mostly. */
const restOf = (style: HandStyle, rng: Rng): HandStyle => {
  if (rng() < 0.7) return style;
  const others = (['side', 'low', 'stay'] as const).filter((r) => r !== style.rest);
  return { ...style, rest: others[Math.floor(rng() * others.length)] };
};

const between = (rng: Rng, a: number, b: number) => a + (b - a) * rng();
const shuffled = <T>(xs: T[], rng: Rng) => xs.map((x) => [rng(), x] as const).sort((a, b) => a[0] - b[0]).map(([, x]) => x);

/** Where a parked pointer waits: beside the answers (or cards), below them, or nowhere new (null). */
export function restSpot(style: HandStyle, boxes: Box[], rng: Rng): Spot | null {
  if (style.rest === 'stay' || !boxes.length) return null;
  const l = Math.min(...boxes.map((b) => b[0]));
  const r = Math.max(...boxes.map((b) => b[2]));
  const t = Math.min(...boxes.map((b) => b[1]));
  const b = Math.max(...boxes.map((b) => b[3]));
  if (style.rest === 'side') return { x: Math.min(990, r + between(rng, 25, 110)), y: between(rng, t + (b - t) * 0.15, t + (b - t) * 0.85) };
  return { x: between(rng, l + (r - l) * 0.15, l + (r - l) * 0.85), y: Math.min(990, b + between(rng, 25, 90)) };
}

/**
 * Where a hand waits out someone else's turn (`boxes`: what's on screen,
 * the cards or the answers): as recorded, just right of it all, in its lower
 * half, or by where the button to move on comes, under it at the right; then
 * it mostly keeps still.
 */
export function waitSpot(boxes: Box[], rng: Rng): Spot | null {
  if (!boxes.length) return null;
  const r = Math.max(...boxes.map((b) => b[2]));
  const t = Math.min(...boxes.map((b) => b[1]));
  const b = Math.max(...boxes.map((b) => b[3]));
  if (rng() < 0.7) return { x: Math.min(985, r + between(rng, 20, 110)), y: between(rng, t + (b - t) * 0.5, b + 30) };
  return { x: between(rng, r - 90, r + 15), y: Math.min(990, b + between(rng, 30, 90)) };
}

/**
 * A click at nothing, from `at`: a spot a little way off, mostly to the right
 * or down (the recorded hand's were 200 to 300 pixels from its last click),
 * on none of `boxes` (a press on an answer or a card would look like a pick).
 */
export function straySpot(at: Spot, boxes: Box[], rng: Rng): Spot | null {
  for (let tries = 0; tries < 8; tries++) {
    const a = between(rng, -0.6, 1.9);
    const d = between(rng, 70, 190);
    const p = { x: at.x + Math.cos(a) * d, y: at.y + Math.sin(a) * d };
    if (p.x < 20 || p.x > 980 || p.y < 110 || p.y > 990) continue;
    if (!boxes.some(([l, t, r, b]) => p.x >= l - 8 && p.x <= r + 8 && p.y >= t - 8 && p.y <= b + 8)) return p;
  }
  return null;
}

/** What a bot is like, as far as its hand goes. */
export interface Hands {
  style: HandStyle;
  /** Multiplies its delays (thinking, reading). */
  pace: number;
  /** Delve together: how much it wavers; here, how long it lingers between candidates (0 to 1). */
  dither: number;
}

/**
 * How a bot looks a question over (`options`: its answers' anchors, top to
 * bottom; `art`: whether there is art to look at; `boxes`: the answers'
 * boxes), from `now` until it sets off to answer at `until`: the glances its
 * hand makes, by the habit the situation leans it to this time (`habit`,
 * pinned for tests). Its eyes go first: the pointer follows half a second
 * or more behind.
 */
export function readQuestion(
  h: Hands,
  options: string[],
  art: boolean,
  boxes: Box[],
  now: number,
  until: number,
  sit: Situation,
  rng: Rng,
  habit = pickHabit(h.style, sit, rng),
): Glance[] {
  const out: Glance[] = [];
  const style = restOf(h.style, rng);
  let t = now + between(rng, 400, 950) * h.pace;
  // Once the clock is nearly out, everything goes quicker.
  const dwell = (ms: number) => (t >= sit.urgentAt ? ms * 0.35 : ms);
  const room = () => t < until - 250;
  const go = (g: Omit<Glance, 'at'>, ms: number) => {
    if (!room()) return false;
    out.push({ at: t, ...g });
    t += dwell(ms);
    return true;
  };
  const unsure = !sit.sure;
  const torn = shuffled(options, rng).slice(0, unsure ? 2 + Math.round(rng()) : 1);
  const linger = (a: number, b: number) => between(rng, a, b) * h.pace * (1 + h.dither);
  switch (habit) {
    case 'park':
    case 'fidget': {
      const spot = restSpot(style, boxes, rng);
      if (spot) go({ spot }, 0);
      // Now and then, just before it moves for its answer, a lean toward one first.
      if (unsure && rng() < 0.35) {
        t = Math.max(t, until - between(rng, 1300, 800));
        go({ anchor: torn[0], text: true }, 0);
      }
      break;
    }
    case 'trace': {
      // Where the hand is to begin with: about the middle (the card it picked).
      let pos: Spot = { x: (Math.min(...boxes.map((b) => b[0])) + Math.max(...boxes.map((b) => b[2]))) / 2, y: 500 };
      // Sweeping, in pixels a millisecond on a desktop screen (reach.ts sweepTime): as recorded, scaled to 1440 across.
      const speed = between(rng, 0.3, 0.6) / h.pace;
      const pause = () => (rng() < 0.15 ? between(rng, 700, 1400) : between(rng, 220, 600)) * h.pace * (sit.careful ? 1.3 : 1);
      // An answer's spot: on its words, in the lane the hand keeps running down (it drifts only a little across
      // as the recorded hand's did), or around a picture's middle.
      let lane = between(rng, 0.2, 0.45);
      const spotOf = (i: number): Spot => {
        const [l, t, r, b] = boxes[i];
        if (!art) return { x: l + (r - l) * between(rng, 0.3, 0.7), y: t + (b - t) * between(rng, 0.3, 0.7) };
        lane = Math.min(0.55, Math.max(0.1, lane + (rng() - 0.5) * 0.08));
        return { x: l + (r - l) * lane, y: t + (b - t) * between(rng, 0.3, 0.7) };
      };
      const mid = (i: number): Spot => ({ x: (boxes[i][0] + boxes[i][2]) / 2, y: (boxes[i][1] + boxes[i][3]) / 2 });
      // One sweep through answers `via` on the way to `stop` (or a spot), then a pause there.
      const pass = (via: number[], stop: number | Spot) => {
        if (!room() || !boxes.length) return false;
        const end = typeof stop === 'number' ? spotOf(stop) : stop;
        const through = via.map(spotOf);
        const ms = sweepTime(pos, [...through, end], speed);
        out.push({ at: t, ...(typeof stop === 'number' ? { anchor: options[stop], spot: end } : { spot: end }), through, ms });
        t += dwell(ms + pause());
        pos = end;
        return true;
      };
      // Now and then, up to what's asked first (the question above the answers), or to the art.
      if (art && rng() < 0.25) {
        go({ anchor: 'art' }, between(rng, 500, 1100) * h.pace);
        pos = { x: Math.min(...boxes.map((b) => b[0])) - 150, y: 550 };
      } else if (boxes.length && rng() < 0.45) {
        const top = Math.min(...boxes.map((b) => b[1]));
        const l = Math.min(...boxes.map((b) => b[0]));
        const r = Math.max(...boxes.map((b) => b[2]));
        pass([], { x: between(rng, l + (r - l) * 0.15, l + (r - l) * 0.6), y: Math.max(110, top - between(rng, 25, 70)) });
      }
      // Down the answers (across each row of pictures, then the next) in sweeps of a few, a pause after each.
      const order = options.map((_, i) => i).filter((i) => boxes[i]);
      const upTo = sit.sure ? 1 + Math.floor(rng() * order.length) : order.length;
      for (let i = 0; i < upTo; ) {
        const n = Math.min(upTo - i, 2 + Math.floor(rng() * 3));
        const run = order.slice(i, i + n);
        if (!pass(run.slice(0, -1), run.at(-1)!)) break;
        i += n;
        // Now and then back up a line or two to read again, then on down from there.
        if (i < upTo && i >= 3 && rng() < 0.35) {
          const back = 1 + Math.floor(rng() * 2);
          if (!pass(order.slice(i - back, i - 1).reverse(), order[i - 1 - back])) break;
        }
      }
      // Unsure: back and forth between its candidates, over what lies between.
      if (unsure) {
        const at = (o: string) => options.indexOf(o);
        for (let i = 0; room(); i++) {
          const to = at(torn[i % torn.length]);
          const dist = (k: number) => Math.hypot(mid(k).x - pos.x, mid(k).y - pos.y);
          const from = order.reduce((best, k) => (dist(k) < dist(best) ? k : best), order[0]);
          const over = order.filter((k) => (k - from) * (k - to) < 0 && rng() < 0.6);
          if (!pass(from < to ? over : over.reverse(), to)) break;
        }
      } else if (room()) {
        const spot = restSpot(style, boxes, rng);
        if (spot) go({ spot }, 0);
      }
      break;
    }
    case 'hover': {
      if (art && rng() < 0.3) go({ anchor: 'art' }, between(rng, 600, 1200) * h.pace);
      for (let i = 0; room() && i < 6; i++) go({ anchor: torn[i % torn.length], text: true }, linger(900, 2200));
      break;
    }
  }
  // The clock nearly out and still unsure: it stops browsing and darts between its last few.
  if (unsure && until > sit.urgentAt) {
    const cut = out.findIndex((g) => g.at >= sit.urgentAt);
    if (cut >= 0) out.length = cut;
    t = Math.max(sit.urgentAt, out.at(-1)?.at ?? now);
    for (let i = 0; t < until - 250; i++) {
      out.push({ at: t, anchor: torn[i % torn.length], text: true });
      t += between(rng, 250, 520);
    }
  }
  return out;
}

/** How a bot looks the category cards over (`cards`: their anchors, left to right) before it picks, by the habit the situation leans it to. */
export function readCards(h: Hands, cards: string[], boxes: Box[], now: number, until: number, sit: Situation, rng: Rng, habit = pickHabit(h.style, sit, rng)): Glance[] {
  const out: Glance[] = [];
  let t = now + between(rng, 300, 800) * h.pace;
  const go = (anchor: string, dwell: number) => {
    if (t >= until - 250) return false;
    out.push({ at: t, anchor });
    t += dwell;
    return true;
  };
  if (habit === 'trace') {
    for (const c of cards) if (!go(c, between(rng, 500, 1000) * h.pace)) return out;
    for (let last = ''; t < until - 250; ) {
      const c = shuffled(cards.filter((x) => x !== last), rng)[0] ?? cards[0];
      go(c, between(rng, 600, 1300) * h.pace);
      last = c;
    }
  } else if (habit === 'hover') {
    for (const c of shuffled(cards, rng).slice(0, 2)) go(c, between(rng, 900, 2000) * h.pace * (1 + h.dither));
  } else {
    const spot = restSpot(restOf(h.style, rng), boxes, rng);
    if (spot) out.push({ at: t, spot });
  }
  return out;
}

/**
 * Once the answer is shown (`correct`; `mine`: the answer this hand gave,
 * if it gave one), from `now`: people look at it, the right one, now and
 * then their own pick first; then a parker goes aside again.
 */
export function afterReveal(h: Hands, correct: string | null, mine: string | null, boxes: Box[], now: number, rng: Rng): Glance[] {
  const out: Glance[] = [];
  let t = now + between(rng, 300, 800) * h.pace;
  if (mine && mine !== correct && rng() < 0.35) {
    out.push({ at: t, anchor: mine, text: true });
    t += between(rng, 500, 1000);
  }
  if (correct && rng() < 0.55) {
    out.push({ at: t, anchor: correct, text: true });
    t += between(rng, 700, 1500);
  }
  if (h.style.habit === 'park' || h.style.habit === 'fidget') {
    const spot = restSpot(restOf(h.style, rng), boxes, rng);
    if (spot) out.push({ at: t, spot });
  }
  return out;
}

/** How long a hand with nothing to do keeps still between its idle moves (ms): a parker for long stretches, a fidget hardly at all; longer the more tired. */
export function idleEvery(style: HandStyle, tired: number): [number, number] {
  const base: Record<Habit, [number, number]> = { park: [5000, 18000], trace: [3000, 10000], hover: [3000, 11000], fidget: [1500, 5000] };
  const [a, b] = base[style.habit];
  return [a * (1 + tired), b * (1 + tired)];
}

/** The chance, at each idle move, that it looks away from the page a while: more often the more tired. */
export const awayChance = (tired: number) => 0.04 + 0.08 * tired;

/** The chance an unsure hand, setting off for its answer, heads for another first and veers off. */
export const changeOfMind = (sure: boolean) => (sure ? 0.03 : 0.18);

/**
 * The small shifts of a hand on the mouse while it's busy: how often (ms)
 * and how far (units), by habit; a nervous one (low `nerve`) with the clock
 * running out shifts more often and further.
 */
export function fidgets(style: HandStyle, nerve: number, urgent: boolean): { every: [number, number]; size: [number, number] } {
  const base: Record<Habit, { every: [number, number]; size: [number, number] }> = {
    park: { every: [2500, 7000], size: [1, 3] },
    trace: { every: [700, 2600], size: [1.5, 5] },
    hover: { every: [900, 3000], size: [1, 4] },
    fidget: { every: [300, 1100], size: [3, 10] },
  };
  const f = base[style.habit];
  if (!urgent || nerve >= 0.5) return f;
  const jitter = 1.5 + (0.5 - nerve) * 3;
  return { every: [f.every[0] * 0.4, f.every[1] * 0.4], size: [f.size[0] * jitter, f.size[1] * jitter] };
}

/** A small circle or wiggle a fidgeting hand makes while it waits: the spots it goes through, from `at`. */
export function circle(at: Spot, rng: Rng): Spot[] {
  const r = between(rng, 6, 16);
  const start = rng() * Math.PI * 2;
  const way = rng() < 0.5 ? 1 : -1;
  const n = 5 + Math.floor(rng() * 4);
  const c = { x: at.x - Math.cos(start) * r, y: at.y - Math.sin(start) * r };
  return Array.from({ length: n }, (_, i) => {
    const a = start + way * ((i + 1) / n) * Math.PI * 2 * (0.8 + 0.4 * rng());
    return { x: c.x + Math.cos(a) * r * (0.8 + 0.4 * rng()), y: c.y + Math.sin(a) * r * (0.8 + 0.4 * rng()) };
  });
}
