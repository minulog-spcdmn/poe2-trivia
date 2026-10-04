// The game's big beats, choreographed from the effect building blocks: what
// a correct answer, a wrong one, a pick, a new turn, a deathmatch or a
// victory look like. Components call these with the elements involved; all
// of them are no-ops while effects are off.

import { after, boxOf, fxActive, shakeView, type Anchor, type Handle, type Point, type Vec3 } from './core';
import {
  C,
  edgeGlow,
  embers,
  emitter,
  flare,
  flash,
  glints,
  implode,
  outline,
  portal,
  puffs,
  rand,
  rays,
  ring,
  shards,
  sigil,
  sparks,
} from './effects';
import { Shape } from './particles';
import { budget, particle, task } from './core';
import { light, pulseMood, setMood } from '../lights';
import { CALM, embers as backdropEmbers } from '../backdropEmbers';

const k3 = (c: Vec3, k: number): Vec3 => [c[0] * k, c[1] * k, c[2] * k];

/** A CSS colour (#hex from playerColor, hsl() or rgb()) as an HDR colour of the given brightness. */
export function hdr(css: string, gain = 2.6): Vec3 {
  const m = css.match(/hsl\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/);
  const hex = css.match(/#([\da-f]{3,8})\b/i)?.[1];
  let rgb: [number, number, number] = [1, 0.8, 0.4];
  if (m) {
    const h = parseFloat(m[1]) / 360;
    const s = parseFloat(m[2]) / 100;
    const l = parseFloat(m[3]) / 100;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const f = (t: number) => {
      t = (t + 1) % 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    rgb = [f(h + 1 / 3), f(h), f(h - 1 / 3)];
  } else if (hex) {
    // #rgb (or #rgba) has one digit per channel, #rrggbb (or #rrggbbaa) two; alpha is ignored.
    const d = hex.length < 6 ? 1 : 2;
    const ch = (i: number) => parseInt(hex.slice(i * d, i * d + d).repeat(3 - d), 16) / 255;
    rgb = [ch(0), ch(1), ch(2)];
  } else {
    const n = css.match(/[\d.]+/g)?.map(Number);
    if (n && n.length >= 3) rgb = [n[0] / 255, n[1] / 255, n[2] / 255];
  }
  return k3(rgb, gain);
}

const unit = (c: Vec3): Vec3 => {
  const m = Math.max(c[0], c[1], c[2]) || 1;
  return [c[0] / m, c[1] / m, c[2] / m];
};

// ---------- flow ----------

/** The game begins: a wave of light from the centre. */
export function gameStart() {
  if (!fxActive()) return;
  const c = { x: innerWidth / 2, y: innerHeight * 0.4 };
  flash(c, { radius: Math.max(innerWidth, innerHeight) * 0.35, intensity: 0.07, life: 0.6 });
  ring(c, { radius: Math.hypot(innerWidth, innerHeight) * 0.55, thickness: 40, life: 1.1, color: C.gold, breakup: 0.85, fill: 0.1, intensity: 0.55 });
  sparks(c, { count: 70, speed: [300, 1100], life: [0.5, 1.2], gravity: 300 });
  backdropEmbers.flare(0.7, 1.6);
  shakeView(0.35, 6);
}

/** A new turn: light runs along the banner's rules into the title. */
export function turnBanner(title: Element, color: string, big: boolean) {
  if (!fxActive()) return;
  const c = hdr(color, 2.4);
  const b = boxOf(title);
  after(0.12, () => {
    flare(title, { size: big ? 34 : 22, streak: Math.max(260, b.w * (big ? 1.4 : 1)), life: big ? 0.9 : 0.6, color: c, spikes: 0.3, intensity: big ? 1 : 0.6 });
    glints(title, { count: big ? 4 : 2, size: [4, 9], delay: [0.1, 0.6] });
    embers(title, { count: big ? 16 : 7, area: 'fill', colors: [c, C.gold], rise: [30, 90], life: [0.8, 1.8] });
    // Sparks converge on the title from both sides.
    for (const side of [-1, 1]) {
      const from = { x: b.x + side * (b.w / 2 + 150), y: b.y };
      sparks(from, { count: big ? 16 : 8, angle: side > 0 ? Math.PI : 0, spread: 0.25, speed: [300, 700], colors: [c, C.gold], gravity: 0, drag: 2.5, life: [0.3, 0.55] });
    }
    if (big) {
      ring(title, { radius: Math.max(160, b.w * 0.7), thickness: 14, life: 0.7, color: c, breakup: 0.75, intensity: 0.55 });
      light(title, { color: unit(c), radius: 380, intensity: 0.4, hold: 0.3, decay: 1.4 });
    }
  });
}

// ---------- categories ----------

/** A category card lands face up: light runs round its edge, its emblem kindles and lights the table. */
export function cardRevealed(frame: Element, dm: boolean) {
  if (!fxActive()) return;
  outline(frame, { color: k3(dm ? C.crimson : C.gold, 0.75), width: 10, intensity: 0.8, life: 0.85, fadeIn: 0.06 });
  flash(frame.querySelector('.icon') ?? frame, { radius: 90, color: dm ? C.crimson : C.ember, intensity: 0.16, life: 0.6 });
  glints(frame, { count: 2, area: 'edge', size: [4, 7], delay: [0, 0.2] });
  light(frame, { color: dm ? [1, 0.2, 0.08] : [1, 0.62, 0.28], radius: 240, intensity: 0.22, decay: 0.9 });
}

/** The mouse is over a card you can pick: it catches fire. Returns a handle to put it out. */
export function cardHover(frame: Element, card: Element, dm: boolean): Handle {
  if (!fxActive()) return { stop() {} };
  const color = dm ? C.crimson : C.ember;
  // The frame tilts toward the pointer; `base` lets the fire follow it exactly.
  const glow = outline(frame, { color: k3(color, 0.7), width: 14, flame: 0.9, intensity: 0.7, fadeIn: 0.25, base: card });
  const rising = emitter(14, () =>
    embers(frame, { count: 1, area: 'top', colors: dm ? [C.crimson, C.ember] : [C.ember, C.gold], rise: [50, 140], life: [0.7, 1.5] }),
  );
  glints(frame, { count: 2, area: 'edge', size: [4, 8] });
  return {
    stop() {
      glow.stop(0.35);
      rising.stop();
    },
  };
}

/** A category is chosen: it flares up; the others burn away. */
export function cardPicked(card: Element, base: Element, others: Element[], dm: boolean) {
  if (!fxActive()) return;
  const main = dm ? C.crimson : C.gold;
  outline(card, { color: main, width: 18, flame: 1, intensity: 1, life: 1.3, base });
  sparks(card, { count: 60, area: 'edge', speed: [150, 700], life: [0.4, 1.1] });
  ring(card, { radius: 260, thickness: 12, life: 0.8, color: main, breakup: 0.6 });
  flare(card, { size: 40, streak: 380, life: 0.7, color: main });
  glints(card, { count: 5, size: [5, 11] });
  light(card, { color: dm ? [1, 0.2, 0.08] : [1, 0.65, 0.3], radius: 360, intensity: 0.7, decay: 1.2 });
  shakeView(0.3, 5);
  for (const o of others) {
    embers(o, { count: 24, area: 'fill', colors: [C.ember, C.emberDeep, C.ash], rise: [60, 200], life: [0.6, 1.6] });
    puffs(o, { count: 6, area: 'fill', color: [0.14, 0.09, 0.05] });
  }
}

// ---------- questions ----------

/** The item art appears. */
export function artRevealed(art: Element) {
  if (!fxActive()) return;
  const b = boxOf(art);
  flare(art, { size: 30, streak: b.w * 0.9, life: 0.7, color: C.goldPale, intensity: 0.7 });
  ring(art, { radius: Math.min(b.w, b.h) * 0.55, thickness: 6, life: 0.7, color: C.gold, breakup: 0.7 });
  glints(art, { count: 4, size: [4, 8], delay: [0.1, 0.5] });
  light(art, { color: [1, 0.7, 0.35], radius: 300, intensity: 0.35, decay: 1 });
}

/** The magic catches at `at` (where the first patch of veiled art starts to come in); `size` is its width. */
export function veilIgnites(at: Point, size: number) {
  if (!fxActive()) return;
  flash(at, { radius: Math.min(40, size * 0.25), color: C.gold, intensity: 0.25, life: 0.35 });
  sparks(at, { count: 12, speed: [50, 200], life: [0.3, 0.7], gravity: -40, size: [0.5, 1.1], colors: [C.whiteHot, C.goldPale, C.gold] });
  glints(at, { count: 2, size: [3, 6], life: [0.3, 0.5] });
}

/** A veiled picture has come in whole: a soft glow over it and a few glints. */
export function veilComplete(art: Element) {
  if (!fxActive()) return;
  const b = boxOf(art);
  flash(art, { radius: Math.max(b.w, b.h) * 0.45, color: C.gold, intensity: 0.12, life: 0.7 });
  glints(art, { count: 4, size: [4, 7], delay: [0, 0.4] });
  sparks(art, { count: 10, area: 'fill', speed: [30, 120], life: [0.4, 0.9], gravity: -40, size: [0.5, 1], colors: [C.whiteHot, C.goldPale, C.gold] });
}

/** The veiled picture hands over to the full art at the reveal: a shimmer of glints and sparks over it. */
export function veilHandoff(art: Element) {
  if (!fxActive()) return;
  glints(art, { count: 5, size: [4, 8], delay: [0, 0.35] });
  sparks(art, { count: 16, area: 'fill', speed: [40, 160], life: [0.4, 1], gravity: -50, size: [0.5, 1.1], colors: [C.whiteHot, C.goldPale, C.gold] });
}

/** How many of a continuous effect's particles this device draws, 0 to 1 (fewer on phones and under load). */
export function fxDensity() {
  return budget(100) / 100;
}

/**
 * A little particle flying off veiled art as it comes in, or off a seam
 * where the item is still missing a part: mostly crisp sparks streaking up
 * and out and curling as they cool, now and then a glint or a drifting
 * ember. `lean` (px/s) pushes it the way the magic is moving; `heat` scales
 * how fast and bright it flies.
 */
export function veilSpark(at: Point, lean: Point = { x: 0, y: 0 }, heat = 1) {
  if (!fxActive()) return;
  const roll = Math.random();
  if (roll < 0.72) {
    const a = -Math.PI / 2 + rand(-0.9, 0.9);
    const v = rand(40, 150) * heat;
    particle({
      x: at.x,
      y: at.y,
      vx: Math.cos(a) * v + lean.x * 1.6,
      vy: Math.sin(a) * v + lean.y * 1.6,
      life: rand(0.35, 0.9),
      size: rand(0.55, 1.05),
      color: Math.random() < 0.45 ? C.whiteHot : C.gold,
      colorEnd: k3(C.ember, 0.35),
      gravity: rand(-30, 60),
      drag: 1.6,
      shape: Shape.Spark,
      stretch: 0.035,
      turbulence: 160,
    });
  } else if (roll < 0.86) {
    particle({
      x: at.x + rand(-2, 2),
      y: at.y + rand(-2, 2),
      vx: lean.x * 0.4 + rand(-8, 8),
      vy: lean.y * 0.4 - rand(5, 25),
      life: rand(0.25, 0.55),
      size: rand(2, 4) * heat,
      color: k3(C.goldPale, 0.9),
      shape: Shape.Glint,
      spin: rand(-2, 2),
      fadeIn: 0.3,
    });
  } else {
    particle({
      x: at.x,
      y: at.y,
      vx: lean.x + rand(-15, 15),
      vy: lean.y - rand(20, 60),
      life: rand(0.7, 1.4),
      size: rand(0.8, 1.5),
      sizeEnd: 0.3,
      color: C.gold,
      colorEnd: k3(C.emberDeep, 0.4),
      gravity: -25,
      drag: 0.8,
      shape: Shape.Ember,
      flicker: 0.6,
      turbulence: 200,
    });
  }
}

/** An answer is locked in: energy gathers on it until the reveal. */
export function answerCharging(option: Element): Handle {
  if (!fxActive()) return { stop() {} };
  implode(option, { count: 26, color: C.gold });
  const glow = outline(option, { color: C.gold, width: 10, intensity: 0.8, pulse: 0.6, fadeIn: 0.2 });
  const pull = emitter(20, () => implode(option, { count: 1, color: C.goldPale }));
  return {
    stop() {
      glow.stop(0.25);
      pull.stop();
    },
  };
}

export type RevealTargets = {
  /** The right answer's button (or tile). */
  answer?: Element | null;
  /** The chosen wrong answer, if any. */
  chosen?: Element | null;
  art?: Element | null;
  /** "Find the art": the pictures are the options, so the art's light centres on the right one. */
  tiles?: boolean;
  stamp?: Element | null;
  /** Scoreboard entry that gains the point. */
  pill?: Element | null;
  /** Consecutive correct answers, this one included. */
  streak?: number;
  /** Did the viewer's side win (celebrate) or lose (mourn)? */
  good: boolean;
  timedOut?: boolean;
  /** Just the point going to someone else (race, someone else won). */
  otherScored?: boolean;
  /** The scorer's progress bar before and after the point, 0 to 1. */
  fill?: { from: number; to: number };
};

/** The answer is revealed. */
export function reveal(t: RevealTargets) {
  if (!fxActive()) return;
  const streak = t.streak ?? 1;
  const hype = Math.min(3, 1 + (streak - 1) * 0.5);

  if (t.answer) {
    const a = t.answer;
    const celebrate = t.good || t.otherScored;
    outline(a, { color: C.right, width: celebrate ? 12 : 9, flame: celebrate ? 0.6 : 0.2, intensity: celebrate ? 0.55 : 0.4, life: celebrate ? 1.4 : 2, bleed: 0.1 });
    if (celebrate) {
      sparks(a, { count: Math.round(30 * hype), area: 'edge', colors: [C.gold, C.rightPale, C.goldPale], speed: [160, 600 * Math.sqrt(hype)], life: [0.4, 1] });
      ring(a, { radius: 150 * Math.sqrt(hype), thickness: 10, life: 0.6, color: C.right, breakup: 0.6, intensity: 0.5 });
      flare(a, { size: 22, streak: 260 * Math.sqrt(hype), life: 0.6, color: C.rightPale, intensity: 0.55 });
      glints(a, { count: Math.round(3 * hype), size: [5, 9], delay: [0, 0.6] });
      light(a, { color: [0.85, 1, 0.6], radius: 240, intensity: 0.25, decay: 1.1 });
    } else {
      glints(a, { count: 3, size: [4, 8], color: C.rightPale, delay: [0.3, 1] });
    }
  }

  if (t.good && t.tiles && t.answer) {
    // The right tile already has its flare and light; the rays just crown it, softly.
    const a = t.answer;
    const b = boxOf(a);
    rays(a, { radius: Math.max(b.w, b.h) * 1.1, life: 1.4 + 0.2 * hype, intensity: 0.07 * Math.sqrt(hype), color: C.gold, count: 12 });
    embers(a, { count: Math.round(8 * hype), area: 'fill', colors: [C.gold, C.ember, C.rightPale], rise: [50, 150], life: [0.7, 1.5] });
  } else if (t.good && t.art) {
    const b = boxOf(t.art);
    flare(t.art, { size: 40, streak: b.w * 0.9, life: 0.9, color: C.goldPale, intensity: 0.6 });
    rays(t.art, { radius: Math.max(b.w, b.h) * 0.6, life: 1.5 + 0.3 * hype, intensity: 0.16 * hype, color: C.gold, count: 14 });
    embers(t.art, { count: Math.round(14 * hype), area: 'fill', colors: [C.gold, C.ember, C.rightPale], rise: [60, 190], life: [0.8, 1.8] });
    light(t.art, { color: [1, 0.8, 0.45], radius: 420, intensity: 0.3 + 0.08 * hype, hold: 0.3, decay: 1.5 });
  }
  if (!t.good && !t.otherScored) {
    if (t.chosen) {
      shards(t.chosen, { count: 18, colors: [C.wrong, k3(C.wrong, 0.6), C.ember] });
      sparks(t.chosen, { count: 16, area: 'fill', colors: [C.wrong, C.ember], angle: Math.PI / 2, spread: Math.PI * 1.6, gravity: 900, life: [0.4, 0.9] });
      outline(t.chosen, { color: C.wrong, width: 10, life: 0.8, intensity: 0.5, bleed: 0.08 });
      ring(t.chosen, { radius: 100, thickness: 8, life: 0.5, color: C.wrong, breakup: 0.8, intensity: 0.5 });
      light(t.chosen, { color: [1, 0.3, 0.15], radius: 200, intensity: 0.28, decay: 0.9 });
    }
    if (t.art) {
      const b = boxOf(t.art);
      light(t.art, { color: [0.9, 0.3, 0.15], radius: 360, intensity: 0.18, decay: 1.2 });
      if (t.timedOut) {
        // Everything turns to ash.
        const top = new DOMRect(b.x - b.w / 2, b.y - b.h / 2, b.w, 10);
        embers(top, { count: 34, area: 'fill', colors: [C.ash, k3(C.ash, 0.6)], rise: [-80, -20], gravity: 60, life: [1.2, 2.4], turbulence: 80 });
      } else {
        puffs(t.art, { count: 8, area: 'fill', color: [0.25, 0.04, 0.02], size: [20, 40] });
      }
    }
    edgeGlow({ color: C.wrong, intensity: 0.05, width: 60, life: 0.7 });
    pulseMood(0.16, [0.9, 0.3, 0.15]);
    shakeView(0.45, 6);
  }

  if (t.stamp) {
    const s = t.stamp;
    after(0.28, () => {
      const col = t.good ? C.right : C.wrong;
      ring(s, { radius: 80, thickness: 7, life: 0.45, color: col, breakup: 0.5, intensity: 0.55 });
      puffs(s, { count: 6, area: 'edge', color: t.good ? [0.12, 0.18, 0.07] : [0.2, 0.06, 0.03], speed: [60, 180] });
      sparks(s, { count: 12, area: 'edge', colors: t.good ? [C.rightPale, C.gold] : [C.wrong, C.ember], speed: [120, 420], life: [0.3, 0.6] });
      shakeView(t.good ? 0.28 : 0.2, 5);
    });
  }

  if (t.pill && t.answer && (t.good || t.otherScored)) {
    const pill = t.pill;
    const bar = pill.querySelector('.bar');
    if (bar && t.fill) fillBar(t.answer, bar, t.fill.from, t.fill.to, t.good);
    after(SCORE_LANDS, () => scored(pill, streak));
  }
}

/** Seconds after a reveal when the stream starts filling the scorer's bar, and how long it takes. */
export const FILL_START = 0.9;
export const FILL_SPAN = 0.6;
/** Seconds from a reveal until its point has landed (the number ticks up). */
export const SCORE_LANDS = FILL_START + FILL_SPAN;

/**
 * The point flows from the answer into the scorer's progress bar: a stream of
 * sparks that land left to right across the part of the bar the point adds
 * (`from` to `to`, fractions of its width) while the bar fills behind them.
 */
export function fillBar(answer: Element, bar: Element, from: number, to: number, good = true) {
  if (!fxActive()) return;
  const src = boxOf(answer);
  const r = bar.getBoundingClientRect();
  const colors = good ? [C.gold, C.goldPale, C.ember] : [C.ember, C.gold];
  const n = budget(64);
  const arrivals: { t: number; x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const u = n > 1 ? i / (n - 1) : 1;
    // Arrivals sweep along the new segment as the bar fills.
    const arrive = FILL_START + u * FILL_SPAN + rand(-0.03, 0.03);
    const delay = Math.max(0.08, arrive - rand(0.55, 0.85));
    const tx = r.left + r.width * Math.min(1, Math.max(0, from + (to - from) * u));
    const ty = r.top + r.height / 2 + rand(-0.8, 0.8);
    const x = src.x + (Math.random() - 0.5) * src.w * 0.9;
    const y = src.y + (Math.random() - 0.5) * src.h * 0.7;
    // Bow each path out to one side (and a little up), so the stream fans out and gathers again.
    const dx = tx - x;
    const dy = ty - y;
    const len = Math.hypot(dx, dy) || 1;
    const side = rand(-0.4, 0.4);
    const cx = (x + tx) / 2 + (-dy / len) * len * side;
    const cy = (y + ty) / 2 + (dx / len) * len * side - len * 0.12;
    // Mostly glowing motes, some with short tails.
    const mote = i % 3 !== 0;
    particle({
      x,
      y,
      life: arrive - delay,
      delay,
      size: mote ? rand(1.4, 2.4) : rand(0.8, 1.3),
      sizeEnd: mote ? 1.1 : 0.7,
      color: mote ? k3(colors[i % colors.length], 0.55) : colors[i % colors.length],
      colorEnd: C.goldPale,
      shape: mote ? Shape.Ember : Shape.Spark,
      stretch: 0.012,
      fadeIn: 0.25,
      seek: { cx, cy, tx, ty },
    });
    arrivals.push({ t: arrive, x: tx, y: ty });
  }
  // Each landing sheds a spark or two off the bar.
  arrivals.sort((a, b) => a.t - b.t);
  let k = 0;
  task((_, age) => {
    while (k < arrivals.length && arrivals[k].t <= age) {
      const a = arrivals[k++];
      if (k % 3 === 0) particle({ x: a.x, y: a.y, life: 0.3, size: 3, sizeEnd: 7, color: k3(C.gold, 0.22), shape: Shape.Glow, fadeIn: 0.1 });
      sparks(a, { count: 2, speed: [40, 160], angle: -Math.PI / 2, spread: 2.6, life: [0.15, 0.35], size: [0.5, 0.9], gravity: 300 });
    }
    return k < arrivals.length;
  });
  puffs(answer, { count: 5, area: 'fill', color: [0.16, 0.12, 0.04], speed: [20, 80] });
}

/** A point lands on a scoreboard entry. */
export function scored(pill: Element, streak = 1) {
  if (!fxActive()) return;
  const hype = Math.min(3, 1 + (streak - 1) * 0.5);
  sparks(pill, { count: Math.round(20 * hype), area: 'edge', colors: [C.gold, C.goldPale, C.ember], speed: [120, 420], life: [0.3, 0.8] });
  ring(pill, { radius: 90, thickness: 7, life: 0.5, color: C.gold, intensity: 0.55 });
  flare(pill, { size: 16, streak: 170, life: 0.45, color: C.goldPale, intensity: 0.6 });
  glints(pill, { count: 2, size: [4, 7] });
  outline(pill, { color: C.gold, width: 9, life: 0.8, intensity: 0.5, bleed: 0.15 });
  light(pill, { color: [1, 0.72, 0.35], radius: 180, intensity: 0.3, decay: 0.9 });
}

/**
 * A streak of three or more: the "in a row" badge catches fire as it lands,
 * hotter with every answer, and keeps smouldering while it's up. Returns a
 * handle to put it out.
 */
export function streakFire(badge: Element, streak: number): Handle {
  if (!fxActive() || streak < 3) return { stop() {} };
  // 3 in a row is a spark; by 8 it's a blaze.
  const heat = Math.min(1, (streak - 2) / 6);
  const k = 1 + heat * 2;
  flash(badge, { radius: 70 + 110 * heat, color: C.ember, intensity: 0.3 + 0.3 * heat, life: 0.5 });
  outline(badge, { color: C.ember, width: 9 + 7 * heat, flame: 0.5 + 0.5 * heat, intensity: 0.55 + 0.25 * heat, life: 1.1 + heat, bleed: 0.15 });
  sparks(badge, { count: Math.round(16 * k), area: 'edge', colors: [C.ember, C.gold, C.whiteHot], speed: [120, 380 * Math.sqrt(k)], gravity: 300, life: [0.3, 0.8] });
  ring(badge, { radius: 60 * Math.sqrt(k), thickness: 6, life: 0.5, color: C.ember, breakup: 0.5, intensity: 0.6 });
  flare(badge, { size: 18, streak: 150 * Math.sqrt(k), life: 0.5, color: C.gold, intensity: 0.6 });
  embers(badge, { count: Math.round(10 * k), area: 'top', colors: [C.ember, C.gold], rise: [70, 200], life: [0.6, 1.4] });
  light(badge, { color: [1, 0.55, 0.2], radius: 160 + 140 * heat, intensity: 0.25 + 0.2 * heat, decay: 1 });
  if (streak >= 5) backdropEmbers.flare(0.4 + 0.5 * heat, 1.2 + heat);
  if (streak >= 7) shakeView(0.12 + 0.1 * heat, 4);
  return emitter(2 + 8 * heat, () =>
    embers(badge, { count: 1, area: 'top', colors: [C.ember, C.gold], rise: [40, 110], scatter: 20, life: [0.6, 1.3] }),
  );
}

/** A point is lost (race: a wrong guess). */
export function lostPoint(pill: Element) {
  if (!fxActive()) return;
  shards(pill, { count: 10, area: 'centre', speed: [60, 200] });
  outline(pill, { color: C.wrong, width: 8, life: 0.7, intensity: 0.45 });
  sparks(pill, { count: 10, colors: [C.wrong], angle: Math.PI / 2, spread: 2.4, gravity: 700, life: [0.3, 0.6] });
}

/** Someone guessed wrong in a race: a puff of red at the answer they picked. */
export function raceMiss(option: Element, mine: boolean) {
  if (!fxActive()) return;
  sparks(option, { count: mine ? 24 : 10, area: 'edge', colors: [C.wrong, C.ember], gravity: 800, life: [0.3, 0.7] });
  if (mine) {
    shards(option, { count: 16 });
    edgeGlow({ color: C.wrong, intensity: 0.05, life: 0.7 });
    shakeView(0.4, 6);
    pulseMood(0.16, [0.9, 0.3, 0.15]);
  }
}

/** The last seconds of the clock. */
export function timerTick(timer: Element, secs: number) {
  if (!fxActive()) return;
  const urgency = (6 - secs) / 5;
  ring(timer, { radius: 50 + urgency * 30, from: 26, thickness: 4 + urgency * 3, life: 0.6, color: C.crimson, breakup: 0.3, fill: 0 });
  sparks(timer, { count: 6 + Math.round(urgency * 10), area: 'edge', colors: [C.crimson, C.ember], speed: [80, 260], gravity: 200, life: [0.25, 0.5] });
  pulseMood(0.25 + urgency * 0.35);
  if (secs <= 2) edgeGlow({ color: C.crimson, intensity: 0.08 + urgency * 0.06, width: 60, life: 0.7 });
}

// ---------- deathmatch ----------

/** The deathmatch intro card. */
export function deathmatchIntro(title: Element) {
  if (!fxActive()) return;
  const c = { x: innerWidth / 2, y: innerHeight / 2 };
  const D = Math.hypot(innerWidth, innerHeight);
  flash(c, { radius: D * 0.3, color: C.crimson, intensity: 0.14, life: 0.9 });
  // The lingering crimson glow behind the intro card (its backdrop is flat).
  flash(c, { radius: D * 0.26, color: k3(C.crimson, 0.6), intensity: 0.12, life: 2.9 });
  ring(c, { radius: D * 0.6, thickness: 30, life: 1.3, color: C.crimson, breakup: 0.8, fill: 0.2 });
  ring(c, { radius: D * 0.35, thickness: 10, life: 1, color: C.ember, breakup: 0.6, delay: 0.15 });
  rays(title, { radius: D * 0.42, life: 2.6, intensity: 0.26, color: C.crimson, count: 18, sharp: 8, spin: 0.5 });
  flare(title, { size: 50, streak: innerWidth * 0.5, life: 1.2, color: C.crimson, delay: 0.2 });
  sigil(title, { radius: Math.min(innerWidth, innerHeight) * 0.3, color: C.crimson, life: 2.6, draw: 0.9, intensity: 0.5, spin: 0.4 });
  const floor = new DOMRect(0, innerHeight - 4, innerWidth, 4);
  embers(floor, { count: 110, area: 'fill', colors: [C.crimson, C.ember, C.gold], rise: [180, 520], life: [1, 2.4], size: [1.2, 3], turbulence: 200 });
  edgeGlow({ color: C.crimson, intensity: 0.2, width: 100, life: 2.4, noise: 0.8 });
  shakeView(0.85, 9);
  deathmatchMood(true);
}

/**
 * Which moment owns the scene's mood (tint and embers). The screens that set
 * one overlap while they cross-fade, so each only clears a mood it owns: the
 * game screen going away after the victory screen came in must not wipe the
 * victory's gold, and the victory keeps it over a deathmatch still ending.
 */
let moodOwner: 'deathmatch' | 'victory' | null = null;

function calmScene() {
  moodOwner = null;
  setMood([0, 0, 0], 0);
  backdropEmbers.tint(CALM);
  backdropEmbers.stoke(0);
}

/** The deathmatch colours the whole scene while it lasts. */
export function deathmatchMood(on: boolean) {
  if (moodOwner === 'victory') return;
  if (!on) {
    if (moodOwner === 'deathmatch') calmScene();
    return;
  }
  moodOwner = 'deathmatch';
  setMood([1, 0.12, 0.05], 0.55);
  backdropEmbers.tint([1, 0.14, 0.06]);
  backdropEmbers.stoke(0.45);
}

// ---------- the end ----------

/** A handful of golds, so a shower of coins doesn't look stamped out. */
const COIN_GOLDS: Vec3[] = [
  [1.55, 1.08, 0.42],
  [1.75, 1.25, 0.55],
  [1.3, 0.85, 0.3],
  [1.6, 1.2, 0.7],
];

function coin(x: number, y: number, vx: number, vy: number, o: { life?: [number, number]; size?: [number, number]; gravity?: number } = {}) {
  particle({
    x,
    y,
    vx,
    vy,
    life: rand(...(o.life ?? [2.2, 3.2])),
    size: rand(...(o.size ?? [6, 9.5])),
    color: COIN_GOLDS[Math.floor(Math.random() * COIN_GOLDS.length)],
    shape: Shape.Coin,
    gravity: o.gravity ?? 1500,
    drag: 0.15,
    rot: rand(-0.6, 0.6),
    spin: rand(-1.5, 1.5),
    fadeIn: 0.02,
  });
}

/**
 * Victory screen: a fountain of gold coins bursts from behind the winner and
 * coins pour from above, in time with the clinking of the victory sound
 * (about 2.6 s), under slowly turning rays (the rune circle behind the
 * winner is SVG, in GameOver). A player who lost gets falling ash instead. Returns a handle that
 * stops the ongoing parts.
 */
export function victory(avatar: Element, title: Element, color: string, lost: boolean, standings?: Element | null): Handle {
  if (!fxActive()) return { stop() {} };
  const pc = hdr(color, 2.4);
  const handles: Handle[] = [];
  // Parts still to come are dropped once the screen is left.
  let stopped = false;
  const later = (s: number, fn: () => void) => after(s, () => stopped || fn());
  const main = lost ? k3(C.gold, 0.6) : C.gold;
  const D = Math.hypot(innerWidth, innerHeight);
  flash(avatar, { radius: Math.max(innerWidth, innerHeight) * 0.3, intensity: lost ? 0.04 : 0.08, life: 0.9, delay: 0.1 });
  ring(avatar, { radius: D * 0.5, thickness: 34, life: 1.2, color: main, breakup: 0.85, delay: 0.1, fill: 0.08, intensity: 0.45 });
  // The rays settle after a while, so a victory screen left open isn't
  // keeping the effects running. (The rune circle behind the avatar is SVG.)
  handles.push(rays(avatar, { radius: Math.min(650, innerWidth * 0.5), intensity: lost ? 0.08 : 0.15, color: main, count: 16, delay: 0.3, fadeIn: 1.2, life: 14 }));
  later(0.9, () => {
    flare(title, { size: 36, streak: innerWidth * 0.4, life: 1, color: C.goldPale, intensity: 0.7 });
    glints(title, { count: 5, size: [5, 10], delay: [0, 1] });
  });
  if (standings) {
    // The winner's row, as it flies in.
    later(1.25, () => {
      const first = standings.querySelector('li');
      if (!first) return;
      outline(first, { color: C.gold, width: 8, life: 1.4, intensity: 0.45, bleed: 0.12 });
      glints(first, { count: 3, area: 'edge', size: [4, 8], delay: [0, 0.5] });
    });
  }
  moodOwner = 'victory';
  setMood(lost ? [0.6, 0.5, 0.4] : [1, 0.7, 0.3], lost ? 0.18 : 0.35);
  backdropEmbers.tint(lost ? CALM : [1, 0.62, 0.2]);
  backdropEmbers.stoke(lost ? 0 : 0.8);

  if (!lost) {
    const a = boxOf(avatar);
    // Fewer coins on phones and slower devices.
    const scale = budget(100) / 100;
    // The fountain: strongest at first, thinning out as the clinking fades.
    let fountain = 0;
    handles.push(
      task((dt, age) => {
        if (age > 2.6) return false;
        fountain += 70 * Math.pow(1 - age / 2.6, 0.7) * scale * dt;
        for (; fountain >= 1; fountain--) {
          const ang = -Math.PI / 2 + rand(-0.95, 0.95);
          const v = rand(520, 980);
          coin(a.x + rand(-20, 20), a.y + rand(-10, 20), Math.cos(ang) * v * 0.75, Math.sin(ang) * v);
        }
        return true;
      }),
    );
    // The pour from above, across the whole width.
    let pour = 0;
    handles.push(
      task((dt, age) => {
        if (age > 2.8) return false;
        if (age < 0.25) return true;
        pour += 34 * Math.min(1, (2.8 - age) / 0.8) * scale * dt;
        for (; pour >= 1; pour--) {
          coin(rand(0, innerWidth), rand(-40, -10), rand(-60, 60), rand(120, 380), { gravity: 900, life: [2.4, 3.4], size: [5, 8.5] });
        }
        return true;
      }),
    );
    // A spray of gold dust where the fountain starts, and a few bursts of it overhead.
    sparks(a, { count: 50, speed: [200, 700], angle: -Math.PI / 2, spread: 2.2, colors: [C.gold, C.goldPale, C.whiteHot], gravity: 600, life: [0.5, 1.2] });
    light(avatar, { color: [1, 0.78, 0.4], radius: 420, intensity: 0.45, hold: 0.6, decay: 1.8 });
    [0.55, 1.15, 1.8].forEach((t, i) => {
      later(t, () => {
        const p = { x: innerWidth * (0.2 + 0.3 * i + rand(-0.05, 0.05)), y: innerHeight * rand(0.14, 0.32) };
        sparks(p, { count: 70, speed: [100, 460], colors: [C.gold, C.goldPale, i === 1 ? pc : C.ember], gravity: 260, drag: 1.4, life: [0.8, 1.6], stretch: 0.05, cool: k3(C.emberDeep, 0.4) });
        flare(p, { size: 18, streak: 200, life: 0.45, color: C.goldPale, intensity: 0.6 });
        glints(p, { count: 3, size: [4, 8], delay: [0.1, 0.5] });
        light(p, { color: [1, 0.8, 0.45], radius: 280, intensity: 0.3, decay: 0.9 });
      });
    });
    // Afterwards, gold glitter drifting down for a while.
    later(2.2, () => {
      handles.push(
        emitter(16, () => {
          particle({
            x: rand(0, innerWidth),
            y: -10,
            vx: rand(-20, 20),
            vy: rand(60, 140),
            life: rand(3, 6),
            size: rand(1.5, 3),
            color: Math.random() < 0.3 ? C.goldPale : C.gold,
            shape: Math.random() < 0.25 ? Shape.Glint : Shape.Ember,
            flicker: 0.6,
            turbulence: 60,
            spin: rand(-1, 1),
            fadeIn: 0.1,
          });
        }, 8),
      );
    });
    shakeView(0.3, 5);
  } else {
    // Ash settles instead.
    handles.push(
      emitter(12, () => {
        particle({
          x: rand(0, innerWidth),
          y: -10,
          vx: rand(-15, 15),
          vy: rand(30, 70),
          life: rand(5, 9),
          size: rand(1.2, 2.4),
          color: C.ash,
          shape: Shape.Ember,
          flicker: 0.3,
          turbulence: 50,
          fadeIn: 0.15,
        });
      }, 12),
    );
  }
  return {
    stop() {
      stopped = true;
      for (const h of handles) h.stop(0.6);
      if (moodOwner === 'victory') calmScene();
    },
  };
}

// ---------- lobby and home ----------

/** A room-code letter slams into place. */
export function glyphLanded(glyph: Element) {
  if (!fxActive()) return;
  const r = glyph.getBoundingClientRect();
  sparks(new DOMRect(r.left, r.bottom - 2, r.width, 2), { count: 9, area: 'fill', angle: -Math.PI / 2, spread: 2.2, speed: [100, 320], life: [0.25, 0.55] });
  puffs(glyph, { count: 3, area: 'edge', color: [0.3, 0.2, 0.08], size: [10, 18] });
  ring(glyph, { radius: 48, thickness: 4, life: 0.4, color: C.gold, intensity: 0.7 });
  shakeView(0.12, 3);
}

/** Someone walks into the lobby (through a portal, naturally). */
export function playerArrived(row: Element) {
  if (!fxActive()) return;
  const b = boxOf(row);
  const left = { x: b.x - b.w / 2 + 26, y: b.y };
  flash(left, { radius: 40, color: C.portal, intensity: 0.45, life: 0.6 });
  ring(left, { radius: 46, thickness: 5, life: 0.5, color: C.portalPale, intensity: 0.7 });
  sparks(left, { count: 18, colors: [C.portal, C.portalPale], speed: [100, 360], gravity: 0, drag: 3, life: [0.3, 0.7] });
  outline(row, { color: C.portal, width: 8, life: 1, intensity: 0.6, bleed: 0.15 });
  sparks(row, { count: 12, area: 'edge', colors: [C.gold, C.portalPale], speed: [40, 160], gravity: -40, life: [0.4, 0.8] });
}

/** A portal opens while connecting. */
export function connecting(at: Element): Handle {
  return portal(at, { radius: 46 });
}

/** A small celebratory twinkle (link copied, setting changed). */
export function twinkle(at: Anchor, color: Vec3 = C.goldPale) {
  if (!fxActive()) return;
  glints(at, { count: 5, size: [4, 8], color, delay: [0, 0.3] });
  sparks(at, { count: 10, area: 'edge', speed: [60, 200], gravity: 100, life: [0.3, 0.6] });
}

/** A rejected input: red sparks and a jolt. */
export function refuse(at: Element) {
  if (!fxActive()) return;
  sparks(at, { count: 16, area: 'edge', colors: [C.crimson, C.ember], speed: [80, 300], gravity: 500, life: [0.3, 0.6] });
  outline(at, { color: C.crimson, width: 10, life: 0.6, intensity: 0.9 });
}

/** A glint off the title every so often. Returns a handle to stop it. */
export function titleGlints(title: Element): Handle {
  // Timers rather than a per-frame task, so the effects loop can sleep in between.
  let timer: ReturnType<typeof setTimeout>;
  const next = () => {
    timer = setTimeout(() => {
      if (!title.isConnected) return;
      const r = title.getBoundingClientRect();
      const p = { x: r.left + r.width * rand(0.15, 0.85), y: r.top + r.height * rand(0.2, 0.45) };
      glints(p, { count: 1, area: 'centre', size: [7, 13], life: [0.6, 1], color: C.goldPale });
      if (Math.random() < 0.5) embers(new DOMRect(r.left + r.width * 0.2, r.bottom - r.height * 0.3, r.width * 0.6, 4), { count: 3, area: 'fill', life: [0.8, 1.6] });
      next();
    }, rand(3500, 6500));
  };
  next();
  return { stop: () => clearTimeout(timer) };
}
