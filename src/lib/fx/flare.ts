// Delve: a flare burns as the clock runs out, for FLARE_MS more on the same
// question. The effects overlay's part of it: the fire and light. The page's
// own part (lib/flareBurn.ts), which calls these, carries the strike by
// itself: the flare flaring in the player's entry, the streak to the clock,
// the clock burning while the added seconds run.
//
// Everything here is placed at points the page measured (never an element,
// which the overlay would measure again every frame), in a road flare's
// red: the Flare Cache's crimson and its pink-white heart.

import { after, budget, cover, particle, shape, task, type CoverSource, type Handle, type Point, type Vec3 } from './core';
import { C, emitter, flash, rand, ring, sparks } from './effects';
import { FIND_COLORS } from './moments';
import { Shape } from './particles';
import { ShapeType } from './renderer';
import { holdLight, light, pulseMood } from '../lights';
import { cornerPx } from '../corner';

const RED = FIND_COLORS.flare.main;
const PALE = FIND_COLORS.flare.pale;
/** The light it throws on the scene behind the UI (lib/lights.ts, unit colour). */
const GLOW: Vec3 = [1, 0.3, 0.4];

/** A circle on screen: the clock's ring, its centre and radius (viewport px). */
export type Ring = { x: number; y: number; r: number };

const square = (c: Ring) => new DOMRect(c.x - c.r, c.y - c.r, c.r * 2, c.r * 2);

/**
 * The strike: the flare (`icon`) catches with a hot flash and a burst of
 * sparks; sparks drop off the streak's `path` (points along it, with the
 * second each is passed); at `ignite` seconds it reaches the clock (`clock`)
 * and sets it alight: a flash, a ring of fire running out, sparks off its
 * edge, a red light on the scene.
 */
export function flareStruck(icon: Point | null, path: { at: Point; t: number }[], clock: Ring | null, ignite: number) {
  if (icon) {
    flash(icon, { radius: 26, color: PALE, intensity: 0.45, life: 0.45 });
    sparks(icon, { count: 16, colors: [RED, PALE, C.whiteHot], speed: [90, 300], gravity: 260, drag: 2.4, life: [0.25, 0.6] });
    light(icon, { color: GLOW, radius: 140, intensity: 0.22, hold: 0.05, decay: 0.6 });
  }
  for (const p of path) after(p.t, () => sparks(p.at, { count: 2, colors: [RED, PALE], speed: [20, 90], gravity: 320, drag: 2, life: [0.2, 0.45], size: [0.6, 1.1] }));
  if (!clock) return;
  after(ignite, () => {
    const r = clock.r;
    flash(clock, { radius: r * 2.6, color: PALE, intensity: 0.5, life: 0.6 });
    ring(clock, { radius: r * 3, from: r * 0.9, thickness: 6, life: 0.7, color: RED, breakup: 0.5, fill: 0, intensity: 0.85 });
    ring(clock, { radius: r * 2, from: r * 0.9, thickness: 3, life: 0.45, color: C.whiteHot, breakup: 0.3, fill: 0, intensity: 0.5, delay: 0.06 });
    sparks(square(clock), { count: 24, area: 'edge', colors: [RED, PALE, C.whiteHot], speed: [120, 400], gravity: 200, drag: 2, life: [0.3, 0.7] });
    light(clock, { color: GLOW, radius: 260, intensity: 0.45, hold: 0.12, decay: 1 });
    pulseMood(0.12, GLOW);
  });
}

/**
 * The burning, at the clock: while the added seconds run, its burning tip
 * (where `now` says it is, with how much of the flare is left, 0 to 1)
 * sputters sparks, dying down with what is left. Stop the handle when it
 * goes out. (The flare's own fire and light are flareLit's.)
 */
export function flareBurning(now: () => { clock: Ring; tip: Point; out: Point; level: number }): Handle {
  const spit = emitter(16, () => {
    const s = now();
    if (Math.random() > 0.25 + 0.75 * s.level) return;
    // Out from the ring at the tip, and round it.
    const a = Math.atan2(s.out.y, s.out.x);
    sparks(s.tip, { count: 1, angle: a, spread: 1.6, colors: [RED, PALE, C.whiteHot], speed: [40, 150], gravity: 220, drag: 2.2, life: [0.2, 0.5], size: [0.6, 1.2] });
  });
  // A soft hot spot on the tip, renewed as it moves on.
  const tip = emitter(4.5, () => {
    const s = now();
    flash(s.tip, { radius: 10 + s.clock.r * 0.25, color: PALE, intensity: 0.18 * (0.4 + 0.6 * s.level), life: 0.3 });
  });
  return {
    stop() {
      spit.stop();
      tip.stop();
    },
  };
}

const k3 = (c: Vec3, k: number): Vec3 => [c[0] * k, c[1] * k, c[2] * k];
/** The flare's flame, from its heart out: white-hot pink, magenta, crimson, and the deep red its sparks cool to. */
const HEART: Vec3 = [3.3, 2.3, 2.6];
const MAGENTA: Vec3 = [3.0, 0.42, 1.2];
const CRIMSON: Vec3 = [2.6, 0.2, 0.36];
const CINDER: Vec3 = [0.5, 0.03, 0.08];

export type FlareLit = {
  /** Where it burns, behind the UI (viewport px): the middle of the item box, followed as it moves. */
  at: () => Point;
  /** The element it burns behind (the item box), if any: its outline is backlit, and the backdrop's light follows it. */
  light?: () => Element | null;
  /** How much of the flare is left, 0 to 1. */
  level: () => number;
  /** The UI in front of it, which hides it (see cover in core.ts). */
  covers: CoverSource;
};

/**
 * The flare the player lit, burning behind the question, in the middle of
 * the item box (the panel with the item's picture): it catches with a white flash, a burst of sparks and a ring of
 * light, then burns as a road flare does. A white-hot heart in a flame of
 * magenta and crimson, never steady: it wavers, and now and then sputters
 * low. It spits sparks that arc out and fall, drops burning slag, and sends
 * up a little smoke that catches its light; and it throws a strong light
 * on everything round it (the overlay's glow round the UI, and the
 * backdrop's own light), wavering with it. As the seconds run out it
 * gutters: shrinking, sputtering more and more, reddening to a last glow.
 * The UI hides all of it, but for its edges. Stop the handle when it goes out.
 */
export function flareLit(o: FlareLit): Handle {
  const W = innerWidth;
  const H = innerHeight;
  const big = Math.max(W, H);
  const small = Math.min(W, H);
  // The flame's heart and height, for the screen.
  const R = Math.max(7, Math.min(13, small * 0.013));
  const tall = R * 9;
  const where = () => o.at();

  const covered = cover(o.covers);

  // ---- how hard it burns, moment to moment ----
  // A road flare's light jumps about: it settles on a new strength every
  // few hundredths of a second and swings there fast, and now and then it
  // sputters low for a moment. As it runs out it burns lower and sputters
  // more, guttering at the very end.
  let heat = 0;
  let want = 1;
  let nextWant = 0;
  let dip = 0;
  let dipTo = 0.4;
  /** How far it has guttered, 0 to 1. */
  let gut = 0;
  /** The flash of its catching, falling away. */
  let catching = 1;
  const flicker = task((dt) => {
    const left = Math.min(1, Math.max(0, o.level()));
    // Full until the last fifth, then guttering down to a last glow.
    const base = left > 0.2 ? 1 : 0.14 + 0.86 * (left / 0.2) ** 1.4;
    gut = 1 - Math.min(1, left / 0.2);
    nextWant -= dt;
    if (nextWant <= 0) {
      want = rand(0.72, 1.12);
      nextWant = rand(0.03, 0.1);
    }
    if (dip <= 0 && Math.random() < dt * (1.1 + 6 * gut)) {
      dip = rand(0.05, 0.14 + 0.25 * gut);
      dipTo = rand(0.25, 0.5);
    }
    if (dip > 0) dip -= dt;
    catching = Math.max(0, catching - dt * 2.2);
    const target = base * (dip > 0 ? dipTo : want) + catching * catching * 0.9;
    heat += (target - heat) * (1 - Math.exp(-dt * 30));
    return true;
  });

  // ---- the flame, its glow, and the light it throws ----
  const flame = shape({
    type: ShapeType.Burn,
    at: { x: 0, y: 0 },
    life: Infinity,
    behind: true,
    color: [1, 1, 1],
    update(f, _t, _age, b) {
      const p = where();
      b.x = p.x;
      b.y = p.y;
      f.hw = tall * 0.9;
      f.hh = tall * 1.55;
      f.k = Math.min(1.4, heat);
      f.q[0] = R * (0.75 + 0.35 * Math.min(heat, 1.3)) * (1 - 0.35 * gut);
      f.q[1] = tall * (1 - 0.55 * gut);
      f.q[2] = heat;
      f.q[3] = gut;
    },
  });
  // Its glow, close about it, and the light it throws far round it.
  const glow = (radius: number, color: Vec3, k: number) =>
    shape({
      type: ShapeType.Flash,
      at: { x: 0, y: 0 },
      life: Infinity,
      behind: true,
      color,
      update(f, _t, _age, b) {
        const p = where();
        b.x = p.x;
        b.y = p.y;
        const r = radius * (0.8 + 0.2 * Math.min(heat, 1.2)) * (1 - 0.3 * gut);
        f.hw = f.hh = r * 2.2;
        f.q[0] = r;
        f.k = k * heat * (1 - 0.4 * gut);
      },
    });
  const near = glow(R * 7, MAGENTA, 0.45);
  // Far enough to reach past the panels in front of it, lighting the
  // backdrop round them and leaving them backlit; stronger on a tall, narrow
  // screen (a phone), where the question's picture hides all the middle.
  const narrow = Math.min(1.5, Math.max(1, big / small / 1.6));
  const far = glow(big * 0.3 * Math.sqrt(narrow), CRIMSON, 0.085 * narrow);
  // The box it burns behind, backlit: its light welling up round the box's
  // outline, licking upward like fire (hidden over the box itself, but for its rim).
  let corner = '0';
  let cornerOf: Element | null = null;
  const backlit = shape({
    type: ShapeType.RectGlow,
    at: { x: 0, y: 0 },
    life: Infinity,
    behind: true,
    color: MAGENTA,
    update(f, _t, _age, b) {
      const el = o.light?.();
      const r = el?.isConnected ? el.getBoundingClientRect() : null;
      if (!el || !r || !r.width) {
        f.k = 0;
        return;
      }
      if (el !== cornerOf) {
        cornerOf = el;
        corner = getComputedStyle(el).borderTopLeftRadius;
      }
      const wd = Math.max(20, Math.min(r.width, r.height) * 0.12);
      b.x = r.left + r.width / 2;
      b.y = r.top + r.height / 2;
      f.hw = r.width / 2 + wd * 5;
      f.hh = r.height / 2 + wd * 5;
      f.k = 0.19 * heat * (1 - 0.5 * gut);
      f.q[0] = r.width / 2;
      f.q[1] = r.height / 2;
      f.q[2] = Math.min(cornerPx(corner, r.width, r.height), r.width / 2, r.height / 2);
      f.q[3] = wd;
      f.q[4] = 0.6;
      f.q[5] = 0;
    },
  });
  // The backdrop's own light, behind everything, wavering with it.
  const lit = holdLight(o.light?.() ?? where(), [1, 0.26, 0.48], big * 0.55);
  const lightUp = task(() => {
    lit.set(0.85 * heat * (1 - 0.5 * gut));
    return true;
  });

  // ---- it catches ----
  const at0 = where();
  flash(at0, { radius: R * 10, color: HEART, intensity: 0.9, life: 0.5, behind: true });
  ring(at0, { radius: small * 0.45, from: R * 2, thickness: 10, life: 0.75, color: MAGENTA, breakup: 0.55, fill: 0.1, intensity: 0.6, behind: true });
  burst(at0, 46, [260, 760]);
  pulseMood(0.1, GLOW);

  // ---- what it spits and sheds ----
  /** Sparks spat out of the flame, mostly up and out, arcing over and falling. */
  function burst(p: Point, n: number, speed: [number, number]) {
    const count = budget(n);
    for (let i = 0; i < count; i++) {
      const wide = Math.random() < 0.25;
      const a = wide ? rand(-Math.PI, Math.PI) : -Math.PI / 2 + rand(-1.35, 1.35);
      const v = rand(speed[0], speed[1]);
      const c = Math.random() < 0.35 ? HEART : Math.random() < 0.6 ? MAGENTA : CRIMSON;
      particle({
        x: p.x + rand(-R, R) * 0.5,
        y: p.y - rand(0, R),
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: rand(0.55, 1.4),
        size: rand(0.8, 1.7),
        color: c,
        colorEnd: CINDER,
        gravity: 600,
        drag: 1.2,
        shape: Shape.Spark,
        stretch: 0.045,
        behind: true,
      });
    }
  }
  let sparkAcc = 0;
  let slagAcc = 0;
  let smokeAcc = 0;
  const spit = task((dt) => {
    const p = where();
    const h = Math.min(1.3, heat);
    // Sparks come in spurts, as the flame flares.
    sparkAcc += dt * 85 * h * h * (1 - 0.6 * gut);
    let n = Math.floor(sparkAcc);
    sparkAcc -= n;
    n = Math.min(n, budget(n + 1));
    if (n > 0) burst(p, n, [180 + 220 * h, 460 + 360 * h]);
    // Burning slag, dropping off the flare and fading as it falls.
    slagAcc += dt * 3 * (1 - 0.5 * gut);
    if (slagAcc >= 1) {
      slagAcc--;
      particle({
        x: p.x + rand(-R, R) * 0.4,
        y: p.y + R * 0.8,
        vx: rand(-30, 30),
        vy: rand(20, 70),
        life: rand(0.7, 1.3),
        size: rand(1.4, 2.4),
        sizeEnd: 0.6,
        color: MAGENTA,
        colorEnd: CINDER,
        gravity: 480,
        drag: 0.4,
        shape: Shape.Ember,
        flicker: 0.4,
        fadeIn: 0.02,
        behind: true,
      });
    }
    // A little smoke rising off the flame's tip, lit by it: drifting up,
    // spreading and fading.
    smokeAcc += dt * 8;
    if (smokeAcc >= 1) {
      smokeAcc--;
      const lit = 0.6 + 0.6 * h;
      particle({
        x: p.x + rand(-R, R),
        y: p.y - tall * rand(0.4, 0.8),
        vx: rand(-16, 16),
        vy: -rand(55, 105),
        life: rand(2.6, 4),
        size: rand(10, 16),
        sizeEnd: rand(34, 52),
        color: k3([0.27, 0.075, 0.13], lit),
        colorEnd: [0.05, 0.012, 0.022],
        gravity: -10,
        drag: 0.3,
        turbulence: 90,
        fadeIn: 0.25,
        behind: true,
      });
    }
    return true;
  });

  return {
    stop() {
      flicker.stop();
      spit.stop();
      lightUp.stop();
      lit.release();
      for (const s of [flame, near, far, backlit]) s.stop(0.45);
      // Sparks and smoke still in the air keep the UI in front of them till they're gone.
      after(1.6, () => covered.stop());
    },
  };
}
