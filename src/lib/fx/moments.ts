// The game's big beats, choreographed from the effect building blocks: what
// a correct answer, a wrong one, a pick, a new turn, a deathmatch or a
// victory look like. Components call these with the elements involved; all
// of them are no-ops while effects are off.

import { after, boxOf, fxActive, shakeView, type Anchor, type Handle, type Vec3 } from './core';
import {
  C,
  comet,
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
import { particle } from './core';
import { light, pulseMood, setMood } from '../lights';
import { CALM, embers as backdropEmbers } from '../backdropEmbers';

const k3 = (c: Vec3, k: number): Vec3 => [c[0] * k, c[1] * k, c[2] * k];

/** A CSS colour (hsl() from playerColor, or rgb()) as an HDR colour of the given brightness. */
export function hdr(css: string, gain = 2.6): Vec3 {
  const m = css.match(/hsl\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/);
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
  backdropEmbers.stoke(0.7);
  after(1.6, () => backdropEmbers.stoke(0));
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

/** A category card lands on the table. */
export function cardLanded(card: Element) {
  if (!fxActive()) return;
  const r = card.getBoundingClientRect();
  const floor = new DOMRect(r.left + 12, r.bottom - 6, r.width - 24, 8);
  puffs(floor, { count: 7, area: 'fill', color: [0.3, 0.16, 0.06], speed: [40, 140], angle: -Math.PI / 2, spread: Math.PI });
  sparks(floor, { count: 10, area: 'fill', angle: -Math.PI / 2, spread: 1.6, speed: [120, 380], life: [0.3, 0.6] });
}

/** The mouse is over a card you can pick: it catches fire. Returns a handle to put it out. */
export function cardHover(frame: Element, dm: boolean): Handle {
  if (!fxActive()) return { stop() {} };
  const color = dm ? C.crimson : C.ember;
  const glow = outline(frame, { color: k3(color, 0.7), width: 14, flame: 0.9, intensity: 0.7, fadeIn: 0.25 });
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
export function cardPicked(card: Element, others: Element[], dm: boolean) {
  if (!fxActive()) return;
  const main = dm ? C.crimson : C.gold;
  outline(card, { color: main, width: 20, flame: 1, intensity: 1.3, life: 1.3 });
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

/** One veiled tile lifts. */
export function tileLifted(cell: Element) {
  if (!fxActive()) return;
  const b = boxOf(cell);
  puffs(cell, { count: 3, area: 'fill', color: [0.35, 0.24, 0.1], size: [b.w * 0.15, b.w * 0.3], speed: [10, 50] });
  sparks(cell, { count: 6, area: 'edge', speed: [60, 220], life: [0.25, 0.5], gravity: 200 });
  if (Math.random() < 0.5) glints(cell, { count: 1, size: [3, 6] });
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
};

/** The answer is revealed. */
export function reveal(t: RevealTargets) {
  if (!fxActive()) return;
  const streak = t.streak ?? 1;
  const hype = Math.min(3, 1 + (streak - 1) * 0.5);

  if (t.answer) {
    const a = t.answer;
    const celebrate = t.good || t.otherScored;
    outline(a, { color: C.good, width: celebrate ? 16 : 10, flame: celebrate ? 0.8 : 0.3, intensity: celebrate ? 1.1 : 0.7, life: celebrate ? 1.6 : 2.2, bleed: 0.15 });
    if (celebrate) {
      sparks(a, { count: Math.round(46 * hype), area: 'edge', colors: [C.gold, C.goodPale, C.whiteHot], speed: [180, 760 * Math.sqrt(hype)], life: [0.45, 1.2] });
      ring(a, { radius: 180 * Math.sqrt(hype), thickness: 10, life: 0.7, color: C.good, breakup: 0.5 });
      flare(a, { size: 26, streak: 320 * Math.sqrt(hype), life: 0.7, color: C.goodPale });
      glints(a, { count: Math.round(4 * hype), size: [5, 10], delay: [0, 0.6] });
      light(a, { color: [0.55, 1, 0.45], radius: 260, intensity: 0.55, decay: 1.2 });
    } else {
      glints(a, { count: 3, size: [4, 8], color: C.goodPale, delay: [0.3, 1] });
    }
  }

  if (t.good && t.art) {
    const b = boxOf(t.art);
    flare(t.art, { size: 46, streak: b.w * 1.1, life: 1, color: C.goldPale, intensity: 0.9 });
    rays(t.art, { radius: Math.max(b.w, b.h) * 0.75, life: 1.6 + 0.3 * hype, intensity: 0.28 * hype, color: C.gold, count: 16 });
    embers(t.art, { count: Math.round(18 * hype), area: 'fill', colors: [C.gold, C.ember, C.goodPale], rise: [60, 190], life: [0.8, 1.8] });
    light(t.art, { color: [1, 0.78, 0.4], radius: 460, intensity: 0.5 + 0.12 * hype, hold: 0.4, decay: 1.6 });
    if (streak >= 3) {
      edgeGlow({ color: C.gold, intensity: 0.12, width: 70, life: 1.4 });
      backdropEmbers.stoke(0.8);
      after(2, () => backdropEmbers.stoke(0));
    }
  }

  if (!t.good && !t.otherScored) {
    if (t.chosen) {
      shards(t.chosen, { count: 26 });
      sparks(t.chosen, { count: 22, area: 'fill', colors: [C.crimson, C.ember], angle: Math.PI / 2, spread: Math.PI * 1.6, gravity: 900, life: [0.4, 0.9] });
      outline(t.chosen, { color: C.crimson, width: 12, life: 0.9, intensity: 1, bleed: 0.1 });
      ring(t.chosen, { radius: 110, thickness: 8, life: 0.5, color: C.crimson, breakup: 0.8 });
      light(t.chosen, { color: [1, 0.12, 0.06], radius: 220, intensity: 0.6, decay: 1 });
    }
    if (t.art) {
      const b = boxOf(t.art);
      light(t.art, { color: [0.9, 0.12, 0.06], radius: 380, intensity: 0.35, decay: 1.3 });
      if (t.timedOut) {
        // Everything turns to ash.
        const top = new DOMRect(b.x - b.w / 2, b.y - b.h / 2, b.w, 10);
        embers(top, { count: 34, area: 'fill', colors: [C.ash, k3(C.ash, 0.6)], rise: [-80, -20], gravity: 60, life: [1.2, 2.4], turbulence: 80 });
      } else {
        puffs(t.art, { count: 8, area: 'fill', color: [0.25, 0.04, 0.02], size: [20, 40] });
      }
    }
    edgeGlow({ color: C.crimson, intensity: 0.1, width: 70, life: 0.8 });
    pulseMood(0.35);
    shakeView(0.5, 7);
  }

  if (t.stamp) {
    const s = t.stamp;
    after(0.28, () => {
      const col = t.good ? C.good : C.crimson;
      ring(s, { radius: 90, thickness: 7, life: 0.45, color: col, breakup: 0.4 });
      puffs(s, { count: 8, area: 'edge', color: t.good ? [0.12, 0.3, 0.1] : [0.3, 0.05, 0.03], speed: [60, 180] });
      sparks(s, { count: 14, area: 'edge', colors: t.good ? [C.goodPale, C.gold] : [C.crimson, C.ember], speed: [120, 420], life: [0.3, 0.6] });
      shakeView(t.good ? 0.28 : 0.2, 5);
    });
  }

  if (t.pill && t.answer && (t.good || t.otherScored)) {
    const pill = t.pill;
    comet(t.answer, pill, {
      delay: 0.35,
      duration: SCORE_LANDS - 0.35,
      color: t.good ? C.goldPale : C.gold,
      trail: t.good ? C.gold : C.ember,
      onArrive: () => scored(pill, streak),
    });
  }
}

/** Seconds from a reveal until its point lands on the scoreboard. */
export const SCORE_LANDS = 1.15;

/** A point lands on a scoreboard entry. */
export function scored(pill: Element, streak = 1) {
  if (!fxActive()) return;
  const hype = Math.min(3, 1 + (streak - 1) * 0.5);
  sparks(pill, { count: Math.round(34 * hype), area: 'edge', colors: [C.gold, C.whiteHot, C.ember], speed: [150, 520], life: [0.35, 0.9] });
  ring(pill, { radius: 110, thickness: 7, life: 0.55, color: C.gold });
  flare(pill, { size: 18, streak: 200, life: 0.5, color: C.goldPale });
  glints(pill, { count: 3, size: [4, 8] });
  outline(pill, { color: C.gold, width: 10, life: 0.9, intensity: 0.9, bleed: 0.2 });
  light(pill, { color: [1, 0.72, 0.35], radius: 200, intensity: 0.5, decay: 1 });
}

/** A point is lost (race: a wrong guess). */
export function lostPoint(pill: Element) {
  if (!fxActive()) return;
  shards(pill, { count: 10, area: 'centre', speed: [60, 200] });
  outline(pill, { color: C.crimson, width: 8, life: 0.7, intensity: 0.8 });
  sparks(pill, { count: 10, colors: [C.crimson], angle: Math.PI / 2, spread: 2.4, gravity: 700, life: [0.3, 0.6] });
}

/** Someone guessed wrong in a race: a puff of red at the answer they picked. */
export function raceMiss(option: Element, mine: boolean) {
  if (!fxActive()) return;
  sparks(option, { count: mine ? 24 : 10, area: 'edge', colors: [C.crimson, C.ember], gravity: 800, life: [0.3, 0.7] });
  if (mine) {
    shards(option, { count: 16 });
    edgeGlow({ color: C.crimson, intensity: 0.14, life: 0.7 });
    shakeView(0.4, 6);
    pulseMood(0.5);
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

/** The deathmatch colours the whole scene while it lasts. */
export function deathmatchMood(on: boolean) {
  setMood([1, 0.12, 0.05], on ? 0.55 : 0);
  backdropEmbers.tint(on ? [1, 0.14, 0.06] : CALM);
  backdropEmbers.stoke(on ? 0.45 : 0);
}

// ---------- the end ----------

/** Victory screen. Returns a handle that stops the ongoing parts. */
export function victory(avatar: Element, title: Element, color: string, lost: boolean): Handle {
  if (!fxActive()) return { stop() {} };
  const pc = hdr(color, 2.4);
  const handles: Handle[] = [];
  const main = lost ? k3(C.gold, 0.7) : C.gold;
  flash(avatar, { radius: Math.max(innerWidth, innerHeight) * 0.3, intensity: lost ? 0.05 : 0.1, life: 0.9, delay: 0.2 });
  ring(avatar, { radius: Math.hypot(innerWidth, innerHeight) * 0.5, thickness: 20, life: 1.2, color: main, breakup: 0.7, delay: 0.2, fill: 0.15 });
  handles.push(rays(avatar, { radius: Math.min(700, innerWidth * 0.55), intensity: lost ? 0.18 : 0.34, color: main, count: 16, delay: 0.3, fadeIn: 1.2 }));
  handles.push(sigil(avatar, { radius: 96, color: pc, intensity: 0.55, spin: 0.25, draw: 1.1, delay: 0.5 }));
  after(0.9, () => {
    flare(title, { size: 40, streak: innerWidth * 0.45, life: 1, color: C.goldPale });
    glints(title, { count: 6, size: [5, 11], delay: [0, 1] });
  });
  setMood(lost ? [0.6, 0.5, 0.4] : [1, 0.7, 0.3], lost ? 0.2 : 0.4);
  backdropEmbers.tint(lost ? CALM : [1, 0.62, 0.2]);
  backdropEmbers.stoke(lost ? 0 : 0.9);

  if (!lost) {
    // Fireworks: bursts of gold high over the screen.
    let n = 0;
    const burst = () => {
      if (n++ > 9) return;
      const p = { x: innerWidth * rand(0.12, 0.88), y: innerHeight * rand(0.1, 0.42) };
      const hue = [C.gold, C.whiteHot, C.ember, pc][n % 4];
      sparks(p, { count: 90, speed: [120, 560], colors: [hue, C.goldPale, C.whiteHot], gravity: 240, drag: 1.3, life: [0.9, 1.8], stretch: 0.06, cool: k3(C.emberDeep, 0.4) });
      flare(p, { size: 22, streak: 240, life: 0.5, color: hue });
      ring(p, { radius: 120, thickness: 5, life: 0.6, color: hue, breakup: 0.7, intensity: 0.7 });
      light(p, { color: unit(hue), radius: 320, intensity: 0.45, decay: 1 });
      after(rand(0.35, 0.8), burst);
    };
    after(0.4, burst);
    // Gold glitter drifting down.
    handles.push(
      emitter(26, () => {
        particle({
          x: rand(0, innerWidth),
          y: -10,
          vx: rand(-20, 20),
          vy: rand(60, 140),
          life: rand(3, 6),
          size: rand(1.5, 3.2),
          color: Math.random() < 0.3 ? C.whiteHot : C.gold,
          shape: Math.random() < 0.25 ? Shape.Glint : Shape.Ember,
          flicker: 0.6,
          turbulence: 60,
          spin: rand(-1, 1),
          fadeIn: 0.1,
        });
      }, 7),
    );
    shakeView(0.4, 6);
  } else {
    // Ash settles instead.
    handles.push(
      emitter(14, () => {
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
      }),
    );
  }
  return {
    stop() {
      for (const h of handles) h.stop(0.6);
      setMood([0, 0, 0], 0);
      backdropEmbers.tint(CALM);
      backdropEmbers.stoke(0);
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
    }, rand(1800, 3600));
  };
  next();
  return { stop: () => clearTimeout(timer) };
}
