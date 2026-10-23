// Delve: dynamite blasts the question away for a new one at the same depth.
// The fire and light of the explosion (the effects overlay); the question
// breaking apart and the smoke the new one comes in through are the page's
// own (lib/blastAway.ts, lib/blastSmoke.ts), which calls this at the moment
// it goes off.

import { after, budget, fxActive, particle, shakeView, type Point, type Vec3 } from './core';
import { C, embers, flare, flash, rand, ring, sparks } from './effects';
import { Shape } from './particles';
import { light, pulseMood } from '../lights';

const k3 = (c: Vec3, k: number): Vec3 => [c[0] * k, c[1] * k, c[2] * k];

export type EdgeBlast = {
  /** The screen edge the explosion bursts in from: -1 left, 1 right. */
  side: -1 | 1;
  /** Its height on screen (viewport px): the question's middle, kept on screen. */
  y: number;
  /** The question it blasts away (viewport box), struck by the shockwave as it arrives. */
  target: DOMRect;
  /** When the shockwave reaches the question (s): its shards fly then, and the screen shakes. */
  impact: number;
  /** The player who set it off: their screen shakes harder. */
  mine: boolean;
};

/**
 * The explosion bursting in from a screen edge: a white-hot flash and a
 * fireball just off the edge, a shockwave running across, a spray of sparks
 * and rock chips flying over the screen toward the far side, the fire
 * billowing in and its glow on the smoke behind it, embers left drifting
 * where the question stood, and the screen shaking as the shockwave hits.
 */
export function edgeBlast(b: EdgeBlast) {
  if (!fxActive()) return;
  const W = innerWidth;
  const H = innerHeight;
  const reach = Math.hypot(W, H);
  // Its heart just past the edge, off screen; what flies out of it goes inward.
  const edgeX = b.side > 0 ? W : 0;
  const heart: Point = { x: edgeX + b.side * 30, y: b.y };
  const rim: Point = { x: edgeX - b.side * 12, y: b.y };
  const inward = b.side > 0 ? Math.PI : 0;

  flash(heart, { radius: Math.max(W, H) * 0.6, color: C.whiteHot, intensity: 0.75, life: 0.5 });
  flash(rim, { radius: Math.min(W, H) * 0.45, color: C.ember, intensity: 0.6, life: 0.9, delay: 0.05 });
  flare(rim, { size: 70, streak: W * 0.9, life: 0.55, color: C.whiteHot, intensity: 0.9 });
  ring(heart, { radius: reach * 1.05, from: 30, thickness: 26, life: 0.8, color: C.ember, breakup: 0.6, fill: 0.18, intensity: 0.95 });
  ring(heart, { radius: reach * 0.7, from: 16, thickness: 7, life: 0.5, color: C.whiteHot, breakup: 0.35, fill: 0, intensity: 0.7, delay: 0.03 });
  light(rim, { color: [1, 0.6, 0.28], radius: Math.max(W, H) * 0.8, intensity: 0.95, attack: 0.04, hold: 0.12, decay: 1.3 });
  pulseMood(0.3, [1, 0.5, 0.2]);

  // Sparks thrown across the screen.
  sparks(rim, { count: 90, angle: inward, spread: 1.3, speed: [520, 1600], life: [0.35, 1.0], gravity: 420, drag: 1.3, stretch: 0.05, colors: [C.whiteHot, C.gold, C.ember] });
  // The fireball: billows of fire torn by noise (Shape.Smoke), bursting in
  // off the edge, swelling as the air slows them, rising on their own heat
  // and cooling from white through orange to a dull red as they burn out.
  // The heart of it first and hottest, the rest a beat behind, flung wider.
  const S = Math.min(Math.max(Math.min(W, H) * 1.05, 380), 980);
  const nFire = budget(16);
  for (let i = 0; i < nFire; i++) {
    const core = i < nFire * 0.35;
    const a = inward + (Math.random() - 0.5) * (core ? 0.6 : 1.5);
    const v = S * (core ? rand(0.9, 1.6) : rand(1.2, 2.6));
    const size = S * (core ? rand(0.12, 0.16) : rand(0.07, 0.12));
    particle({
      x: rim.x + b.side * size * 0.6,
      y: b.y + rand(-0.12, 0.12) * S,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      life: core ? rand(0.55, 0.8) : rand(0.4, 0.7),
      size,
      sizeEnd: size * rand(1.6, 2),
      color: core ? k3(C.whiteHot, 0.55) : k3(C.ember, 0.5),
      colorEnd: core ? k3(C.emberDeep, 0.45) : [0.3, 0.045, 0.015],
      gravity: -140,
      drag: 3.2,
      shape: Shape.Smoke,
      fadeIn: 0.06,
      delay: core ? 0 : rand(0.02, 0.09),
    });
  }
  // The smoke after it (the page's own, lib/blastSmoke.ts, darkens; this is
  // the fire's glow on it), lit from within, dimming as it rolls away from the fire.
  const nSmoke = budget(10);
  for (let i = 0; i < nSmoke; i++) {
    const a = inward + (Math.random() - 0.5) * 1.1;
    const v = W * rand(0.5, 1.4);
    const size = S * rand(0.08, 0.14);
    particle({
      x: rim.x + b.side * size,
      y: b.y + rand(-0.3, 0.3) * S,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v - rand(0, 60),
      life: rand(0.7, 1.2),
      size,
      sizeEnd: size * rand(2, 2.8),
      color: k3(C.ember, 0.07),
      colorEnd: [0, 0, 0],
      gravity: -40,
      drag: 1.8,
      turbulence: 160,
      shape: Shape.Smoke,
      fadeIn: 0.15,
      delay: rand(0.06, 0.2),
    });
  }
  // Rock chips: the wall the blast came through, flung across with a spin.
  const n = budget(26);
  for (let i = 0; i < n; i++) {
    const a = inward + (Math.random() - 0.5) * 1.2;
    const v = rand(500, 1500);
    const hot = Math.random() < 0.3;
    particle({
      x: rim.x,
      y: b.y + rand(-90, 90),
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v - rand(60, 220),
      life: rand(0.7, 1.4),
      size: rand(2.5, 7.5),
      sizeEnd: 1.6,
      color: hot ? C.ember : [0.85, 0.66, 0.5],
      colorEnd: k3(C.ash, 0.35),
      gravity: 950,
      drag: 1.1,
      shape: Shape.Shard,
      spin: rand(-14, 14),
      fadeIn: 0.02,
    });
  }

  // The shockwave strikes the question: it shakes, and where it stood is left smouldering.
  const t = b.target;
  after(b.impact, () => {
    shakeView(b.mine ? 0.7 : 0.55, b.mine ? 13 : 10);
    const near = new DOMRect(b.side > 0 ? t.right - t.width * 0.3 : t.left, t.top, t.width * 0.3, t.height);
    sparks(near, { count: 40, area: 'fill', angle: inward, spread: 1.6, speed: [240, 900], life: [0.25, 0.7], gravity: 520, colors: [C.whiteHot, C.ember, C.gold] });
    flash(near, { radius: Math.max(t.width, t.height) * 0.5, color: C.gold, intensity: 0.45, life: 0.35 });
  });
  after(b.impact + 0.25, () => {
    embers(t, { count: 22, area: 'fill', colors: [C.ember, C.gold], rise: [40, 150], life: [0.8, 1.8] });
  });
}
