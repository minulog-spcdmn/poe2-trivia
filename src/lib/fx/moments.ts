// The game's big beats, choreographed from the effect building blocks: what
// a correct answer, a wrong one, a pick, a new turn, a deathmatch or a
// victory look like. Components call these with the elements involved; all
// of them are no-ops while effects are off.

import { after, boxOf, detached, fxActive, isLive, shakeView, type Anchor, type Handle, type Point, type Vec3 } from './core';
import {
  C,
  edgeGlow,
  embers,
  emitter,
  fire,
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
import { budget, follow, followOffset, particle, task } from './core';
import { showAura } from './aura';
import { light, pulseMood, setMood } from '../lights';
import { CALM, embers as backdropEmbers } from '../backdropEmbers';
import { burnsBlue } from './streaks';
import type { FindKind } from '../delve';
import { WARD_BREAK } from '../inventoryArt';

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

/** Point `a`, moved as far as the element behind follow slot `slot` has (see follow in core.ts). */
function landed<T extends Point>(a: T, slot: number): T {
  const o = followOffset(slot);
  return { ...a, x: a.x + o.x, y: a.y + o.y };
}

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

// ---------- the vote (Delve together) ----------

/** Delve together: a vote lands on a card (`pip`, the voter's mark on it): a small glint. */
export function voteCast(pip: Element) {
  if (!fxActive() || detached(pip)) return;
  glints(pip, { count: 1, area: 'centre', size: [5, 9], color: C.goldPale, life: [0.35, 0.6] });
  ring(pip, { radius: 22, from: 4, thickness: 2.5, life: 0.4, color: C.gold, breakup: 0.5, fill: 0, intensity: 0.5 });
}

/** Delve together: the draw passes over a card (`frame`) on its way: a quick light round its edge. */
export function raffleHop(frame: Element) {
  if (!fxActive() || detached(frame)) return;
  outline(frame, { color: k3(C.gold, 0.8), width: 10, intensity: 0.7, life: 0.32, fadeIn: 0.03 });
  light(frame, { color: [1, 0.65, 0.3], radius: 200, intensity: 0.16, decay: 0.35 });
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

/** The verdict badge's colour: your point, no point, out of time, or (watching a race) someone else's. */
export type VerdictTone = 'good' | 'bad' | 'late' | 'neutral';

export type RevealTargets = {
  /** The right answer's button (or tile). */
  answer?: Element | null;
  /** The chosen wrong answer, if any. */
  chosen?: Element | null;
  art?: Element | null;
  /** "Find the art": the pictures are the options, so the art's light centres on the right one. */
  tiles?: boolean;
  /** The verdict badge ("Correct", "Wrong"...) and its colour. */
  verdict?: Element | null;
  verdictTone?: VerdictTone;
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
  /** Delve: your ward takes what the miss would have cost (its own blue swell follows, wardBlocked), so no red one. */
  warded?: boolean;
};

/** The answer is revealed. */
export function reveal(t: RevealTargets) {
  if (!fxActive()) return;
  const streak = t.streak ?? 1;
  const hype = Math.min(3, 1 + (streak - 1) * 0.5);
  // A tile's item picture (swapped for the original at the reveal): the light shines from behind it.
  const pic = () => t.answer?.querySelector('.pic .art-fit > img') ?? null;

  if (t.answer) {
    const a = t.answer;
    const celebrate = t.good || t.otherScored;
    outline(a, { color: C.right, width: celebrate ? 12 : 9, flame: celebrate ? 0.6 : 0.2, intensity: celebrate ? 0.55 : 0.4, life: celebrate ? 1.4 : 2, bleed: 0.1 });
    if (celebrate) {
      sparks(a, { count: Math.round(30 * hype), area: 'edge', colors: [C.gold, C.rightPale, C.goldPale], speed: [160, 600 * Math.sqrt(hype)], life: [0.4, 1] });
      ring(a, { radius: 150 * Math.sqrt(hype), thickness: 10, life: 0.6, color: C.right, breakup: 0.6, intensity: 0.5 });
      flare(a, { size: 22, streak: 260 * Math.sqrt(hype), life: 0.6, color: C.rightPale, intensity: 0.55, clear: pic });
      glints(a, { count: Math.round(3 * hype), size: [5, 9], delay: [0, 0.6] });
      light(a, { color: [0.85, 1, 0.6], radius: 240, intensity: 0.25, decay: 1.1 });
    } else {
      glints(a, { count: 3, size: [4, 8], color: C.rightPale, delay: [0.3, 1] });
    }
  }

  if (t.good && t.tiles && t.answer) {
    // The right tile already has its flare and light; the rays just crown it,
    // from behind its item.
    const a = t.answer;
    const b = boxOf(a);
    rays(a, { radius: Math.max(b.w, b.h) * 1.1, life: 1.8 + 0.2 * hype, fadeIn: 0.5, intensity: 0.12 * Math.sqrt(hype), color: C.gold, count: 12, clear: pic });
    embers(a, { count: Math.round(8 * hype), area: 'fill', colors: [C.gold, C.ember, C.rightPale], rise: [50, 150], life: [0.7, 1.5] });
  } else if (t.good && t.art) {
    const b = boxOf(t.art);
    // The flare and rays shine from behind the item (its outline), not over
    // it. Veiled art is still burning in when they start, and only then
    // hands over to the full picture, so it's looked up as they go.
    const art = t.art;
    const item = () => art.querySelector('.frame .art-fit > img') ?? art.querySelector('.frame .veil');
    flare(t.art, { size: 40, streak: b.w * 0.9, life: 0.9, color: C.goldPale, intensity: 0.6, clear: item });
    rays(t.art, { radius: Math.max(b.w, b.h) * 0.7, life: 2.2 + 0.3 * hype, fadeIn: 0.5, intensity: 0.1 + 0.12 * hype, color: C.gold, count: 14, clear: item });
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
    if (!t.warded) {
      edgeGlow({ color: C.wrong, intensity: 0.05, width: 60, life: 0.7 });
      pulseMood(0.16, [0.9, 0.3, 0.15]);
    }
    shakeView(0.45, 6);
  }

  if (t.verdict && t.verdictTone === 'good') {
    // As the badge lands, a right answer's catches a glint of light.
    const v = t.verdict;
    after(0.3, () => glints(v, { count: 2, size: [3, 6], delay: [0, 0.4] }));
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
  // The stream leaves the answer and lands on the bar where they are as it flies (the page may scroll meanwhile).
  const from0 = follow(answer, FILL_START + FILL_SPAN);
  const to0 = follow(bar, FILL_START + FILL_SPAN);
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
      seek: { cx, cy, tx, ty, from: from0, to: to0 },
    });
    arrivals.push({ t: arrive, x: tx, y: ty });
  }
  // Each landing sheds a spark or two off the bar.
  arrivals.sort((a, b) => a.t - b.t);
  let k = 0;
  task((_, age) => {
    while (k < arrivals.length && arrivals[k].t <= age) {
      const a = landed(arrivals[k++], to0);
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
 * A player on a streak burns: their scoreboard entry is wreathed in fire,
 * with flames licking up off it. `heat` (0 to 1, from lib/fx/streaks) sets
 * how big: a faint smoulder at three in a row, turning blue at seven,
 * and a blaze by ten.
 * Returns a handle to put it out.
 */
export function ablaze(row: Element, heat: number, blue = burnsBlue(heat)): Handle {
  if (!fxActive() || heat <= 0) return { stop() {} };
  // At the very top of a streak the fire burns blue.
  const flames = fire(row, { height: 6 + 66 * heat, intensity: 0.45 + 1.0 * heat, blue: blue ? 1 : 0 });
  // No room for the flames (or the entry is gone): no sparks off nothing either.
  if (!isLive(flames)) return flames;
  const sparkColors = blue ? [C.portal, C.portalPale] : [C.ember, C.gold];
  // Sparks spat out of the fire, drifting up; slower than CALM_SPEED (lib/fx/core.ts),
  // so a fire that burns all game lets phones draw at 30fps.
  const rising = emitter(14 * heat, () =>
    embers(row, { count: 1, area: 'top', colors: sparkColors, size: [0.8, 1.8], rise: [60, 90 + 60 * heat], scatter: 30, gravity: 0, life: [0.6, 1 + 0.6 * heat] }),
  );
  return {
    stop(fade = 0.5) {
      flames.stop(fade);
      rising.stop();
    },
  };
}

/** A streak reaches the top: the fire on a player's entry flares up and turns blue. */
export function turnsBlue(row: Element) {
  if (!fxActive()) return;
  flash(row, { radius: 160, color: C.portal, intensity: 0.35, life: 0.6 });
  ring(row, { radius: 140, thickness: 8, life: 0.6, color: C.portalPale, breakup: 0.6, intensity: 0.5 });
  sparks(row, { count: 40, area: 'edge', colors: [C.portal, C.portalPale, C.whiteHot], speed: [150, 480], gravity: -60, life: [0.4, 0.9] });
  embers(row, { count: 16, area: 'top', colors: [C.portal, C.portalPale], rise: [120, 280], life: [0.6, 1.3] });
}

/** A streak ends: the fire on a player's entry goes out in a puff of smoke. */
export function doused(row: Element) {
  if (!fxActive()) return;
  puffs(row, { count: 10, area: 'edge', color: [0.16, 0.13, 0.11], size: [14, 26], speed: [20, 70], life: [0.8, 1.6], angle: -Math.PI / 2, spread: 1.2 });
  sparks(row, { count: 8, area: 'edge', colors: [C.ember, C.emberDeep], speed: [40, 140], gravity: 200, life: [0.3, 0.6] });
}

/** A point is lost (race: a wrong guess). */
export function lostPoint(pill: Element) {
  if (!fxActive()) return;
  shards(pill, { count: 10, area: 'centre', speed: [60, 200] });
  outline(pill, { color: C.wrong, width: 8, life: 0.7, intensity: 0.45 });
  sparks(pill, { count: 10, colors: [C.wrong], angle: Math.PI / 2, spread: 2.4, gravity: 700, life: [0.3, 0.6] });
}

/** Where a phial jets its light out: the phial and whether it stands upright (then up, else toward its right end). */
export type PhialFlow = { phial: Element; upright: boolean };

/**
 * Delve: a player loses a life. The light of the phial's chamber that
 * empties (`chamber`) pours out of the end of the phial (`flow`) in a jet
 * along its axis, strongest at first and weakening as the chamber drains;
 * the jet's sparks slow and its motes and mist drift apart and rise. The
 * player's entry glows red at the edge. `left`: lives still left (the last
 * one's jet is longer, and your own jars the view a little). Without a
 * phial (`flow` missing) the light rises from `chamber`.
 */
export function lifeLost(pill: Element, chamber: Element, left: number, mine: boolean, flow?: PhialFlow) {
  if (!fxActive()) return;
  const last = left === 0;
  const dir = flow && !flow.upright ? { x: 1, y: 0 } : { x: 0, y: -1 };
  const across = { x: -dir.y, y: dir.x };
  /** The phial's open end (or the chamber's middle), where it is now. */
  const tip = (): Point & { half: number } => {
    if (!flow || detached(flow.phial)) {
      const b = boxOf(chamber);
      return { x: b.x, y: b.y, half: 2 };
    }
    const r = flow.phial.getBoundingClientRect();
    return flow.upright
      ? { x: r.left + r.width / 2, y: r.top + 1, half: r.width * 0.3 }
      : { x: r.right - 1, y: r.top + r.height / 2, half: r.height * 0.3 };
  };
  const span = last ? 0.9 : 0.75;
  const rate = budget(last ? 230 : 170);
  const pale = C.lifePale;
  const warm = k3(C.life, 1.1);
  flash(chamber, { radius: 12, color: C.life, intensity: 0.22, life: 0.3 });
  const t0 = tip();
  flash(t0, { radius: 10, color: C.life, intensity: 0.2, life: span });
  light(t0, { color: [1, 0.36, 0.3], radius: 150, intensity: 0.25, hold: span * 0.5, decay: 0.8 });
  let acc = 0;
  task((dt, age) => {
    if (age > span) return false;
    if (detached(chamber)) return false;
    // The jet weakens as the chamber empties.
    const k = Math.pow(1 - age / span, 0.6);
    acc += rate * dt * (0.35 + 0.65 * k);
    const t = tip();
    const c = boxOf(chamber);
    for (; acc >= 1; acc--) {
      // Most of it leaves by the open end; some is seen streaming through the glass toward it.
      const inside = Math.random() < 0.25;
      const at = inside
        ? { x: c.x + (Math.random() - 0.5) * c.w, y: c.y + (Math.random() - 0.5) * c.h }
        : { x: t.x + across.x * rand(-t.half, t.half), y: t.y + across.y * rand(-t.half, t.half) };
      // A narrow cone, fanning out a little as the jet tires.
      const a = rand(-1, 1) * (0.14 + 0.2 * (1 - k));
      const vx = dir.x * Math.cos(a) - dir.y * Math.sin(a);
      const vy = dir.y * Math.cos(a) + dir.x * Math.sin(a);
      const v = rand(220, 640) * (0.45 + 0.55 * k) * (last ? 1.15 : 1);
      const roll = Math.random();
      if (roll < 0.42) {
        particle({ x: at.x, y: at.y, vx: vx * v, vy: vy * v, life: rand(0.3, 0.65), size: rand(0.6, 1.2), color: Math.random() < 0.5 ? pale : warm, colorEnd: k3(C.life, 0.3), gravity: -40, drag: 3, shape: Shape.Spark, stretch: 0.03, turbulence: 90 });
      } else if (roll < 0.8) {
        particle({ x: at.x, y: at.y, vx: vx * v * 0.75, vy: vy * v * 0.75, life: rand(0.6, 1.3), size: rand(0.9, 1.9), sizeEnd: 0.3, color: Math.random() < 0.35 ? pale : warm, colorEnd: k3(C.life, 0.25), gravity: -55, drag: 2.6, shape: Shape.Ember, flicker: 0.4, turbulence: 170 });
      } else {
        // Mist: soft light that spreads and fades as the jet disperses.
        particle({ x: at.x, y: at.y, vx: vx * v * 0.5, vy: vy * v * 0.5, life: rand(0.5, 0.9), size: rand(3, 5), sizeEnd: rand(9, 14), color: k3(C.life, 0.45), colorEnd: k3(C.life, 0.06), gravity: -30, drag: 2.4, shape: Shape.Glow, fadeIn: 0.15, turbulence: 60 });
      }
    }
    return true;
  });
  outline(pill, { color: C.wrong, width: 8, life: 0.9, intensity: 0.4 });
  if (mine && last) shakeView(0.3, 4);
}

/** Delve: a question survived. The phial (`phial`) catches the light for a moment as a wave runs through it. */
export function lifeHeld(phial: Element) {
  if (!fxActive()) return;
  glints(phial, { count: 2, size: [3, 6], color: C.lifePale, delay: [0.1, 0.5] });
  embers(phial, { count: 5, area: 'fill', colors: [C.life, C.lifePale], size: [0.7, 1.4], rise: [30, 80], scatter: 20, life: [0.6, 1.1] });
  light(phial, { color: [1, 0.42, 0.36], radius: 110, intensity: 0.22, decay: 0.8 });
}

/** Seconds from a life being given until its light lands in the teammate's phial (lifeGiven). */
export const GIFT_LANDS = 1.05;

/**
 * Delve together: a player gives one of their lives to bring back a teammate
 * who perished. The light of the giver's chamber that empties (`chamber`, in
 * the entry `giver`) leaves it as a stream of motes that bows across the
 * scoreboard and gathers into the very chamber of the teammate's phial it
 * fills (`into`, in the entry `taker`), wherever the two are as it flies,
 * landing at GIFT_LANDS: there the chamber flares, a ring of life runs out
 * and glints settle, and their entry is rimmed in its rose light.
 */
export function lifeGiven(chamber: Element, giver: Element, into: Element, taker: Element) {
  if (!fxActive() || detached(chamber) || detached(into)) return;
  const src = boxOf(chamber);
  const dst = boxOf(into);
  const from0 = follow(chamber, GIFT_LANDS);
  const to0 = follow(into, GIFT_LANDS);
  flash(chamber, { radius: 14, color: C.life, intensity: 0.3, life: 0.45 });
  light(chamber, { color: [1, 0.4, 0.34], radius: 150, intensity: 0.22, decay: 0.8 });
  outline(giver, { color: k3(C.life, 0.75), width: 8, life: 0.9, intensity: 0.35 });
  const n = budget(80);
  for (let i = 0; i < n; i++) {
    const u = n > 1 ? i / (n - 1) : 1;
    // The motes leave over the first half and arrive bunched at the end.
    const arrive = GIFT_LANDS * (0.72 + 0.28 * u) + rand(-0.04, 0.04);
    const delay = Math.max(0.02, Math.min(arrive - 0.35, u * 0.45 + rand(0, 0.08)));
    const x = src.x + (Math.random() - 0.5) * src.w;
    const y = src.y + (Math.random() - 0.5) * src.h;
    const tx = dst.x + (Math.random() - 0.5) * dst.w * 0.6;
    const ty = dst.y + (Math.random() - 0.5) * dst.h * 0.6;
    // Bow each path up and out to one side, so the stream arcs over the row and gathers again.
    const dx = tx - x;
    const dy = ty - y;
    const len = Math.hypot(dx, dy) || 1;
    const side = rand(-0.25, 0.25);
    const cx = (x + tx) / 2 + (-dy / len) * len * side;
    const cy = (y + ty) / 2 + (dx / len) * len * side - Math.max(40, len * 0.35);
    const mote = i % 3 !== 0;
    particle({
      x,
      y,
      life: arrive - delay,
      delay,
      size: mote ? rand(1.3, 2.3) : rand(0.8, 1.2),
      sizeEnd: mote ? 1 : 0.6,
      color: mote ? k3(C.life, 0.6) : C.lifePale,
      colorEnd: C.lifePale,
      shape: mote ? Shape.Ember : Shape.Spark,
      stretch: 0.012,
      fadeIn: 0.2,
      seek: { cx, cy, tx, ty, from: from0, to: to0 },
    });
  }
  after(GIFT_LANDS, () => {
    if (detached(into)) return;
    flash(into, { radius: 18, color: C.lifePale, intensity: 0.42, life: 0.6 });
    ring(into, { radius: 40, from: 5, thickness: 4, life: 0.6, color: C.life, breakup: 0.4, fill: 0, intensity: 0.65 });
    glints(into, { count: 3, area: 'centre', size: [4, 8], color: C.lifePale, delay: [0, 0.3] });
    embers(into, { count: 8, area: 'fill', colors: [C.life, C.lifePale], size: [0.7, 1.4], rise: [30, 90], scatter: 12, life: [0.6, 1.2] });
    light(into, { color: [1, 0.42, 0.36], radius: 190, intensity: 0.36, decay: 1 });
    if (!detached(taker)) outline(taker, { color: C.life, width: 10, life: 1, intensity: 0.5 });
  });
}

// ---------- Delve's finds ----------

/** Where an element is now, so an effect stays where it was after the element goes. */
const rectOf = (el: Element) => el.getBoundingClientRect();

/**
 * Delve: an Azurite Ward crystallises onto a chamber of the phial (`pip`, its
 * casing): blue light gathers into it, and as it settles it flashes and
 * glints. `forged` from two shards: more light, and a ring of it running out.
 * `fed`: a find's sparks already gathered into it (findGained), so the light
 * doesn't gather again.
 */
export function wardFormed(pip: Element, forged: boolean, fed = false) {
  if (!fxActive() || detached(pip)) return;
  if (!fed) implode(pip, { count: forged ? 22 : 14, radius: forged ? 48 : 34, color: C.azurite, life: forged ? 0.55 : 0.45 });
  after(forged ? 0.5 : 0.4, () => {
    if (detached(pip)) return;
    flash(pip, { radius: forged ? 26 : 16, color: C.azurite, intensity: forged ? 0.42 : 0.3, life: 0.55 });
    glints(pip, { count: forged ? 3 : 2, area: 'centre', size: [6, 11], color: C.azuritePale, life: [0.5, 0.85], delay: [0, 0.25] });
    sparks(pip, { count: forged ? 12 : 6, colors: [C.azuritePale, C.azurite], cool: k3(C.azurite, 0.3), speed: [60, 200], gravity: -40, drag: 3, life: [0.25, 0.55] });
    if (forged) ring(pip, { radius: 42, from: 6, thickness: 4, life: 0.6, color: C.azurite, breakup: 0.45, fill: 0, intensity: 0.6 });
    light(pip, { color: [0.4, 0.65, 1], radius: forged ? 160 : 110, intensity: forged ? 0.3 : 0.2, decay: 0.9 });
  });
}

/** Delve: an azurite shard toward the next ward lands on its chamber (`pip`, the half casing). */
export function shardFound(pip: Element) {
  if (!fxActive() || detached(pip)) return;
  flash(pip, { radius: 12, color: C.azurite, intensity: 0.22, life: 0.4 });
  sparks(pip, { count: 8, colors: [C.azuritePale, C.azurite], cool: k3(C.azurite, 0.3), speed: [40, 150], gravity: 160, life: [0.25, 0.5] });
  glints(pip, { count: 1, area: 'centre', size: [5, 8], color: C.azuritePale, delay: [0.15, 0.25] });
}

/**
 * Delve: an Azurite Ward shatters in place of a life (`pip`: the casing
 * bursting on its chamber), as its barrier breaks (wardBlocked). It breaks
 * where it is: a cold flash, and blue sparks burst out all round its outline
 * and die away close by, with splinters of crystal thrown out and falling,
 * and a ring of light. Nothing jets off to one side (a lost life's light
 * jets out of the phial's end; a ward's doesn't leave). The player's entry
 * (`pill`) is rimmed in blue rather than red.
 */
export function wardShattered(pip: Element, pill: Element, mine: boolean) {
  if (!fxActive() || detached(pip)) return;
  const at = rectOf(pip);
  const b = boxOf(at);
  const big = Math.max(b.w, b.h);
  // Round its outline, a little out from it.
  const rx = b.w / 2 + 1;
  const ry = b.h / 2 + 1;
  flash(at, { radius: big * 0.6 + 4, color: C.azuritePale, intensity: 0.32, life: 0.3 });
  const n = budget(46);
  for (let i = 0; i < n; i++) {
    const a = ((i + Math.random() * 0.8) / n) * Math.PI * 2;
    const [cos, sin] = [Math.cos(a), Math.sin(a)];
    const v = rand(110, 340);
    const pale = i % 3 !== 0;
    particle({
      x: b.x + cos * rx,
      y: b.y + sin * ry,
      vx: cos * v,
      vy: sin * v,
      life: rand(0.22, 0.55),
      size: rand(0.6, 1.3),
      color: pale ? C.azuritePale : i % 2 ? C.azurite : C.whiteHot,
      colorEnd: k3(C.azurite, 0.3),
      // They burst and stop: a halo of blue, not a spray.
      drag: 5,
      gravity: 40,
      shape: Shape.Spark,
      stretch: 0.03,
    });
  }
  // Splinters of crystal thrown out from where it was, glittering as they fall.
  const m = budget(mine ? 12 : 8);
  for (let i = 0; i < m; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = rand(70, 210);
    particle({
      x: b.x + (Math.random() - 0.5) * b.w,
      y: b.y + (Math.random() - 0.5) * b.h,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v - 40,
      life: rand(0.6, 1),
      size: rand(1.8, 3),
      sizeEnd: 0.8,
      color: i % 2 ? C.azuritePale : C.azurite,
      colorEnd: k3(C.azurite, 0.25),
      gravity: 160,
      drag: 3,
      shape: Shape.Shard,
      spin: rand(-14, 14),
      fadeIn: 0.02,
    });
  }
  ring(at, { radius: big * 0.9 + 10, from: 3, thickness: 3, life: 0.45, color: C.azurite, breakup: 0.5, fill: 0, intensity: 0.5 });
  glints(at, { count: 3, area: 'fill', size: [4, 8], color: C.azuritePale, life: [0.3, 0.6], delay: [0.04, 0.3] });
  light(at, { color: [0.4, 0.62, 1], radius: 130, intensity: 0.28, decay: 0.7 });
  if (!detached(pill)) outline(pill, { color: k3(C.azurite, 0.8), width: 8, life: 0.8, intensity: 0.45 });
}

/** The cold-blue swell at the screen's edges as your ward takes a loss: the red one of a wrong answer (reveal), in azurite. */
function wardedEdge() {
  edgeGlow({ color: C.azurite, intensity: 0.05, width: 70, life: 0.8 });
  pulseMood(0.16, [0.3, 0.55, 1]);
}

/**
 * Delve: a ward takes what would have cost a life. Its barrier (`barrier`,
 * the vesica of crystal Phial.svelte throws round the phial) catches the
 * blow: a cold flash where it lands (the bottom of the barrier, under the
 * phial, so nothing flares over the name), sparks glancing off it either
 * way, and the scene lit blue; your own sends
 * a cold swell round the screen's edges and jars the view a little. At
 * WARD_BREAK it breaks: big shards of crystal thrown outward all round it,
 * further than the casing's splinters, and the casing
 * (`pip`) shatters with it (wardShattered). A teammate's is smaller.
 */
export function wardBlocked(barrier: Element, pip: Element | null, pill: Element, mine: boolean) {
  if (!fxActive() || detached(barrier)) return;
  const at = rectOf(barrier);
  const b = boxOf(at);
  // The blow lands on the barrier's bottom apex, under the phial (clear of the name above it); upright (phones), turned a quarter, that is its right side.
  const upright = at.height > at.width;
  // The vesica inside the box (BARRIER: half width 46, rise 15, in a box of 96 x 34 units).
  const [hx, hy] = upright ? [at.width * (15 / 34), at.height * (46 / 96)] : [at.width * (46 / 96), at.height * (15 / 34)];
  const hit = upright ? { x: b.x + hx, y: b.y } : { x: b.x, y: b.y + hy + 1 };
  const k = mine ? 1 : 0.65;
  flash(hit, { radius: 12 * k + 4, color: C.azuritePale, intensity: 0.28, life: 0.28 });
  flash(at, { radius: Math.max(hx, hy) * 0.9, color: C.azurite, intensity: 0.1 * k, life: 0.4 });
  // Sparks glancing off the barrier, either way along it, away from the name.
  for (const side of [-1, 1]) {
    const angle = upright ? side * 0.32 : side < 0 ? Math.PI - 0.32 : 0.32;
    sparks(hit, { count: Math.round(12 * k), angle, spread: 0.55, colors: [C.whiteHot, C.azuritePale, C.azurite], cool: k3(C.azurite, 0.3), speed: [220, 560], gravity: 260, drag: 2.2, life: [0.25, 0.55] });
  }
  glints(hit, { count: 1, area: 'centre', size: [5 * k + 3, 8 * k + 3], color: C.azuritePale, life: [0.25, 0.4], delay: [0, 0.03] });
  light(at, { color: [0.4, 0.65, 1], radius: 200 * k + 60, intensity: 0.34 * k, hold: 0.15, decay: 0.8 });
  if (mine) {
    wardedEdge();
    shakeView(0.15, 3);
  }
  after(WARD_BREAK, () => {
    if (detached(barrier)) return;
    const c = boxOf(rectOf(barrier));
    // Big shards from all round the barrier, thrown outward along it.
    const n = budget(mine ? 20 : 11);
    for (let i = 0; i < n; i++) {
      const t = ((i + Math.random() * 0.7) / n) * Math.PI * 2;
      const [cos, sin] = [Math.cos(t), Math.sin(t)];
      // Outward from a vesica of these half sizes, near enough by an ellipse's normal.
      const nx = cos / hx;
      const ny = sin / hy;
      const nl = Math.hypot(nx, ny) || 1;
      const v = rand(150, 330) * (mine ? 1 : 0.75);
      particle({
        x: c.x + cos * hx,
        y: c.y + sin * hy,
        vx: (nx / nl) * v + rand(-30, 30),
        vy: (ny / nl) * v - rand(20, 90),
        life: rand(0.65, 1.05),
        size: rand(2.6, 4.4) * (mine ? 1 : 0.8),
        sizeEnd: 1.1,
        color: i % 3 === 0 ? C.whiteHot : i % 3 === 1 ? C.azuritePale : C.azurite,
        colorEnd: k3(C.azurite, 0.28),
        gravity: 420,
        drag: 1.6,
        shape: Shape.Shard,
        spin: rand(-12, 12),
        fadeIn: 0.02,
      });
    }
    if (pip && !detached(pip)) wardShattered(pip, pill, mine);
  });
}

/**
 * Delve: a Dynamite Cache missed, and its blast destroys something the player
 * carries (`pip`, its casing on the phial or its engraving beside it): a
 * small blast of its own, as the stick's on the art but close and light. A
 * white-hot pop and a ring of fire, sparks and chips of what it was (blue
 * crystal for a ward or a shard, the item's own warm colours for a flare or
 * dynamite) thrown out and falling, a wisp of smoke, and the entry (`pill`)
 * flickering ember-red where the ward's breaking glows blue.
 */
export function itemBlown(pip: Element, pill: Element, item: 'wards' | 'shards' | 'flares' | 'dynamite', mine: boolean) {
  if (!fxActive() || detached(pip)) return;
  const at = rectOf(pip);
  const b = boxOf(at);
  const big = Math.max(b.w, b.h);
  const crystal = item === 'wards' || item === 'shards';
  const chips: Vec3[] = crystal ? [C.azuritePale, C.azurite, C.whiteHot] : item === 'flares' ? [[2.6, 1.2, 1.1], C.ember, C.gold] : [[2.4, 0.9, 0.6], C.ember, [0.55, 0.45, 0.38]];
  flash(at, { radius: big * 0.8 + 10, color: C.whiteHot, intensity: 0.5, life: 0.3 });
  ring(at, { radius: big * 0.9 + 14, from: 3, thickness: 4, life: 0.45, color: C.ember, breakup: 0.55, fill: 0.15, intensity: 0.75 });
  sparks(at, { count: crystal ? 26 : 22, speed: [140, 480], life: [0.25, 0.6], gravity: 520, colors: [C.whiteHot, C.ember, C.gold] });
  shards(at, { count: crystal ? 12 : 9, colors: chips, cool: k3(crystal ? C.azurite : C.ash, 0.35), speed: [80, 300], size: [1.4, 3.2] });
  puffs(at, { count: 4, area: 'centre', color: [0.09, 0.07, 0.055], size: [8, 16], speed: [20, 90], life: [0.6, 1.1] });
  after(0.1, () => embers(at, { count: 6, area: 'fill', colors: [C.ember, C.gold], rise: [30, 90], life: [0.5, 1.1] }));
  light(at, { color: [1, 0.55, 0.25], radius: 150, intensity: 0.32, decay: 0.7 });
  if (!detached(pill)) outline(pill, { color: k3(C.ember, 0.75), width: 8, life: 0.75, intensity: 0.45 });
  if (mine) shakeView(0.2, 4);
}

/** Seconds from a reveal until a find's sparks start landing on its item, and how long they take to (see findGained). */
export const FIND_START = 0.85;
export const FIND_SPAN = 0.45;
/** Seconds from a reveal until a find's item has landed. */
export const FIND_LANDS = FIND_START + FIND_SPAN;

/**
 * The finds' colours, as their cards have them (ChooseCategory.svelte):
 * azurite blue, a signal flare's crimson, dynamite's ember.
 */
export const FIND_COLORS: Record<FindKind, { main: Vec3; pale: Vec3 }> = {
  azurite: { main: C.portal, pale: C.portalPale },
  flare: { main: [3.1, 0.38, 0.62], pale: [3.1, 1.55, 1.75] },
  dynamite: { main: C.ember, pale: C.whiteHot },
};

/**
 * Delve: a find answered right. As a point flows into the scorer's bar
 * (fillBar), the reward flows from the answer (`answer`) to the very place
 * its item appears (`slot`: the casing its ward or shard forms on, or the
 * engraving its flare or dynamite stands as; `aim`, inside it, narrows that
 * down where the slot is wider), in the find card's colours: a stream of
 * sparks that gathers on it between FIND_START and FIND_LANDS, wherever it
 * has moved meanwhile (on phones the page scrolls to the answer as it
 * shows), each landing shedding a spark, and a flash as the last lands.
 */
export function findGained(answer: Element, slot: Element, kind: FindKind, aim: Element = slot) {
  if (!fxActive() || detached(answer) || detached(slot)) return;
  const { main, pale } = FIND_COLORS[kind];
  const src = boxOf(answer);
  const dst = boxOf(aim);
  const from0 = follow(answer, FIND_LANDS);
  const to0 = follow(slot, FIND_LANDS);
  const n = budget(48);
  const arrivals: { t: number; x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const u = n > 1 ? i / (n - 1) : 1;
    const arrive = FIND_START + u * FIND_SPAN + rand(-0.03, 0.03);
    const delay = Math.max(0.08, arrive - rand(0.55, 0.85));
    const tx = dst.x + (Math.random() - 0.5) * dst.w * 0.6;
    const ty = dst.y + (Math.random() - 0.5) * dst.h * 0.6;
    const x = src.x + (Math.random() - 0.5) * src.w * 0.9;
    const y = src.y + (Math.random() - 0.5) * src.h * 0.7;
    // Bow each path out to one side (and a little up), so the stream fans out and gathers again.
    const dx = tx - x;
    const dy = ty - y;
    const len = Math.hypot(dx, dy) || 1;
    const side = rand(-0.4, 0.4);
    const cx = (x + tx) / 2 + (-dy / len) * len * side;
    const cy = (y + ty) / 2 + (dx / len) * len * side - len * 0.12;
    const mote = i % 3 !== 0;
    particle({
      x,
      y,
      life: arrive - delay,
      delay,
      size: mote ? rand(1.4, 2.4) : rand(0.8, 1.3),
      sizeEnd: mote ? 1.1 : 0.7,
      color: mote ? k3(main, 0.55) : pale,
      colorEnd: pale,
      shape: mote ? Shape.Ember : Shape.Spark,
      stretch: 0.012,
      fadeIn: 0.25,
      seek: { cx, cy, tx, ty, from: from0, to: to0 },
    });
    arrivals.push({ t: arrive, x: tx, y: ty });
  }
  arrivals.sort((a, b) => a.t - b.t);
  let k = 0;
  task((_, age) => {
    while (k < arrivals.length && arrivals[k].t <= age) {
      const a = landed(arrivals[k++], to0);
      if (k % 3 === 0) particle({ x: a.x, y: a.y, life: 0.3, size: 3, sizeEnd: 7, color: k3(main, 0.22), shape: Shape.Glow, fadeIn: 0.1 });
      sparks(a, { count: 2, colors: [pale, main], cool: k3(main, 0.3), speed: [40, 160], angle: -Math.PI / 2, spread: 2.6, life: [0.15, 0.35], size: [0.5, 0.9], gravity: 300 });
    }
    return k < arrivals.length;
  });
  glints(answer, { count: 2, size: [4, 7], color: pale, delay: [0.05, 0.3] });
  after(FIND_LANDS, () => {
    const at = detached(aim) ? slot : aim;
    if (detached(at)) return;
    flash(at, { radius: Math.max(dst.w, dst.h) * 0.6 + 10, color: main, intensity: 0.35, life: 0.5 });
    glints(at, { count: 2, area: 'centre', size: [5, 9], color: pale, life: [0.4, 0.7], delay: [0, 0.2] });
  });
}

/** Delve: a flare found (`icon`, its engraving in the player's entry): it catches and settles. */
export function flareFound(icon: Element) {
  if (!fxActive() || detached(icon)) return;
  flash(icon, { radius: 16, color: C.ember, intensity: 0.3, life: 0.45 });
  sparks(icon, { count: 10, colors: [C.ember, C.whiteHot, C.gold], speed: [60, 200], gravity: -30, drag: 3, life: [0.25, 0.5] });
  embers(icon, { count: 6, area: 'fill', colors: [C.ember, C.gold], rise: [30, 80], scatter: 15, life: [0.5, 1] });
  glints(icon, { count: 1, area: 'centre', size: [6, 10], color: C.goldPale, delay: [0.1, 0.2] });
}

/**
 * Delve: one depth deeper. The backdrop's embers flare up for a moment, and
 * any still in the old colour take the new one (lib/backdropEmbers.ts).
 */
export function descended() {
  backdropEmbers.flare(0.35, 1.2);
}

/**
 * Delve: a named depth reached; its plaque (`card`) lies over the banner.
 * Light streaks along it, sparks fly off its pointed ends, embers rise off
 * its top edge and it lights the stage; the backdrop's embers flare and all
 * take the depth's colour. `accent`: the stratum's colour (a CSS colour,
 * lib/descent.ts accentAt), which tints all of it.
 */
export function milestoneReached(card: Element, accent: string) {
  backdropEmbers.flare(0.85, 2.4);
  backdropEmbers.recolor();
  if (!fxActive() || detached(card)) return;
  const tint = hdr(accent, 1);
  const main = k3(tint, 2.7);
  // Its pale: the colour run most of the way to white, as light at its hottest.
  const pale: Vec3 = [1.6 + tint[0] * 1.2, 1.6 + tint[1] * 1.2, 1.6 + tint[2] * 1.2];
  const b = boxOf(card);
  flare(card, { size: 12, streak: b.w * 0.6, life: 0.8, color: pale, intensity: 0.3 });
  glints(card, { count: 4, area: 'edge', size: [4, 8], color: pale, delay: [0.1, 0.7] });
  for (const side of [-1, 1]) {
    const end = { x: b.x + (side * b.w) / 2, y: b.y };
    sparks(end, { count: 16, angle: side > 0 ? 0 : Math.PI, spread: 0.7, colors: [main, pale], speed: [120, 420], gravity: -30, drag: 2.4, life: [0.4, 0.9] });
    flash(end, { radius: 30, color: main, intensity: 0.3, life: 0.5 });
  }
  const top = new DOMRect(b.x - b.w * 0.4, b.y - b.h / 2, b.w * 0.8, 2);
  embers(top, { count: 18, area: 'fill', colors: [main, pale], rise: [50, 150], scatter: 30, life: [0.8, 1.6] });
  light(card, { color: unit(tint), radius: Math.max(220, b.w * 0.6), intensity: 0.2, decay: 1.1 });
}

/**
 * Someone guessed wrong in a race (or, Delve together, struck an option): a
 * puff of red at the answer they picked. `warded`: your ward takes what it
 * cost, and swells blue at the edges instead of red (wardBlocked).
 */
export function raceMiss(option: Element, mine: boolean, warded = false) {
  if (!fxActive()) return;
  sparks(option, { count: mine ? 24 : 10, area: 'edge', colors: [C.wrong, C.ember], gravity: 800, life: [0.3, 0.7] });
  if (mine) {
    shards(option, { count: 16 });
    if (!warded) {
      edgeGlow({ color: C.wrong, intensity: 0.05, life: 0.7 });
      pulseMood(0.16, [0.9, 0.3, 0.15]);
    }
    shakeView(0.4, 6);
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
  backdropEmbers.swarm(0);
}

/** The deathmatch colours the whole scene, and crowds it with embers, while it lasts. */
export function deathmatchMood(on: boolean) {
  if (moodOwner === 'victory') return;
  if (!on) {
    if (moodOwner === 'deathmatch') calmScene();
    return;
  }
  moodOwner = 'deathmatch';
  setMood([1, 0.12, 0.05], 0.55);
  backdropEmbers.tint([1, 0.14, 0.06]);
  backdropEmbers.stoke(0.55);
  backdropEmbers.swarm(1);
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
  handles.push(rays(avatar, { radius: Math.min(650, innerWidth * 0.5), intensity: lost ? 0.08 : 0.15, color: main, count: 16, delay: 0.3, fadeIn: 1.2, life: 14, clear: avatar.querySelector('.avatar') ?? avatar }));
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
  backdropEmbers.swarm(0);

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

/**
 * zoe_arcana walks in, out of her own magic rather than a portal: ruby and
 * gold motes gather on her avatar, then burst, and her aura (aura.ts) takes
 * over from there.
 */
export function creatorArrived(row: Element) {
  if (!fxActive()) return;
  const face = row.querySelector('.avatar') ?? row;
  const R = Math.max(boxOf(face).w / 2, 12);
  implode(face, { count: 22, radius: R * 4.5, color: C.ruby, life: 0.5 });
  implode(face, { count: 10, radius: R * 3.6, color: C.goldPale, life: 0.42 });
  after(0.45, () => {
    flash(face, { radius: R * 2.2, color: C.ruby, intensity: 0.45, life: 0.6 });
    ring(face, { radius: R * 4, thickness: 5, life: 0.55, color: C.gold, intensity: 0.7 });
    sparks(face, { count: 22, colors: [C.ruby, C.gold, C.whiteHot], speed: [90, 330], gravity: 60, drag: 2.6, life: [0.35, 0.8] });
    glints(face, { count: 3, area: 'edge', size: [4, 8], delay: [0, 0.4] });
    outline(row, { color: k3(C.ruby, 0.8), width: 8, life: 1.1, intensity: 0.6, bleed: 0.15 });
    sparks(row, { count: 12, area: 'edge', colors: [C.gold, C.rubyPale], speed: [40, 160], gravity: -40, life: [0.4, 0.8] });
    light(face, { color: [1, 0.22, 0.28], radius: 240, intensity: 0.3, decay: 1 });
    showAura();
  });
}

/** The notice of her arrival (Toasts.svelte): gold runs round it, and her avatar catches the light. */
export function heraldNotice(toast: Element) {
  if (!fxActive()) return;
  after(0.3, () => {
    if (detached(toast)) return;
    outline(toast, { color: k3(C.gold, 0.7), width: 8, life: 1, intensity: 0.5, bleed: 0.1 });
    glints(toast, { count: 3, area: 'edge', size: [4, 8], delay: [0, 0.3] });
    const face = toast.querySelector('.avatar');
    if (face) glints(face, { count: 1, area: 'centre', size: [8, 12], life: [0.5, 0.7] });
  });
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

// ---------- dynamite ----------

export type BlastTargets = {
  /** The art stage (name questions) or the picture grid (art questions). */
  art: Element | null;
  /** Answers (or pictures) that burst too, one after another. */
  blown: Element[];
  /** The player who set it off: their screen shakes harder. */
  mine: boolean;
};

/**
 * Delve: a stick of dynamite blasts the question away. A white-hot burst at
 * the heart of the art with a ring of fire and a shockwave running out, the
 * stone of the art breaking into falling chips and smoke, embers drifting
 * up; each of `blown` bursts too, one after another.
 */
export function dynamiteBlast(t: BlastTargets) {
  if (!fxActive()) return;
  if (t.art && !detached(t.art)) {
    const b = boxOf(t.art);
    const r = Math.max(b.w, b.h);
    flash(t.art, { radius: r * 0.7, color: C.whiteHot, intensity: 0.55, life: 0.45 });
    flare(t.art, { size: 46, streak: b.w * 1.1, life: 0.55, color: C.whiteHot, intensity: 0.8 });
    ring(t.art, { radius: r * 0.95, from: 10, thickness: 14, life: 0.7, color: C.ember, breakup: 0.55, fill: 0.25, intensity: 0.9 });
    ring(t.art, { radius: r * 0.6, from: 6, thickness: 5, life: 0.4, color: C.whiteHot, breakup: 0.3, fill: 0, intensity: 0.6, delay: 0.04 });
    sparks(t.art, { count: 70, speed: [220, 900], life: [0.3, 0.9], gravity: 600, colors: [C.whiteHot, C.gold, C.ember] });
    shards(t.art, { count: 26, area: 'fill', colors: [[0.9, 0.72, 0.55], [0.55, 0.45, 0.38], C.ember], cool: k3(C.ash, 0.4), speed: [140, 520], size: [2, 5] });
    puffs(t.art, { count: 12, area: 'centre', color: [0.1, 0.075, 0.06], size: [16, 34], speed: [60, 240], life: [0.8, 1.6] });
    after(0.12, () => embers(t.art!, { count: 20, area: 'fill', colors: [C.ember, C.gold], rise: [40, 140], life: [0.8, 1.8] }));
    after(0.3, () => glints(t.art!, { count: 5, size: [4, 9], color: C.goldPale, delay: [0, 0.4] }));
    light(t.art, { color: [1, 0.62, 0.3], radius: 460, intensity: 0.6, hold: 0.08, decay: 1.1 });
  }
  t.blown.forEach((el, i) => {
    after(0.05 + i * 0.07, () => {
      if (detached(el)) return;
      flash(el, { radius: 40, color: C.ember, intensity: 0.4, life: 0.3 });
      sparks(el, { count: 18, area: 'fill', speed: [120, 460], life: [0.25, 0.6], gravity: 500, colors: [C.whiteHot, C.ember, C.gold] });
      shards(el, { count: 10, colors: [[0.85, 0.68, 0.5], [0.5, 0.4, 0.33], C.ember], cool: k3(C.ash, 0.4), speed: [100, 380], size: [1.6, 3.6] });
      puffs(el, { count: 5, area: 'fill', color: [0.09, 0.07, 0.055], size: [10, 22], speed: [30, 120], life: [0.6, 1.2] });
    });
  });
  pulseMood(0.22, [1, 0.5, 0.2]);
  shakeView(t.mine ? 0.6 : 0.4, t.mine ? 10 : 7);
}
