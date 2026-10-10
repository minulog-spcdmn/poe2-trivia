// The end of a Delve run. Nobody wins a descent outright, so this is no
// victory: the last ember of the run gutters out. A faint warmth behind the
// fallen delver dies away, embers drift down off the rune circle and fade to
// ash, and a few more settle over the whole screen, thinning out until they
// stop. A new personal best gets a quiet gleam on the depth; in a group, the
// deepest delver's row is lit softly as it comes in.

import { budget, boxOf, fxActive, particle, task, type Handle, type Vec3 } from './core';
import { C, after, emitter, flash, glints, outline, rand } from './effects';
import { Shape } from './particles';
import { light } from '../lights';

const k3 = (c: Vec3, k: number): Vec3 => [c[0] * k, c[1] * k, c[2] * k];
/** What a dying ember cools to: a dull red going grey. */
const CINDER: Vec3 = [0.32, 0.12, 0.06];

export function fallen(avatar: Element, title: Element, o: { best?: boolean; standings?: Element | null } = {}): Handle {
  if (!fxActive()) return { stop() {} };
  const handles: Handle[] = [];
  let stopped = false;
  const later = (s: number, fn: () => void) => after(s, () => stopped || fn());

  // The last warmth behind the circle, dying slowly.
  flash(avatar, { radius: 240, color: k3(C.ember, 0.6), intensity: 0.05, life: 1.8, delay: 0.15 });
  light(avatar, { color: [1, 0.5, 0.2], radius: 320, intensity: 0.22, attack: 0.4, hold: 0.5, decay: 3.2 });

  // Embers falling off the rune circle's rim, fewer and fewer until none are left.
  const a = boxOf(avatar);
  const R = Math.max(a.w, a.h) * 0.5 + 40;
  const scale = budget(100) / 100;
  let shed = 0;
  handles.push(
    task((dt, age) => {
      if (age > 7) return false;
      shed += 10 * Math.pow(1 - age / 7, 1.6) * scale * dt;
      for (; shed >= 1; shed--) {
        // Mostly from the lower half of the circle, where they'd fall from.
        const ang = rand(-0.2, Math.PI + 0.2);
        particle({
          x: a.x + Math.cos(ang) * R * rand(0.75, 1),
          y: a.y + Math.sin(ang) * R * rand(0.6, 1),
          vx: rand(-12, 12),
          vy: rand(15, 45),
          life: rand(2.4, 4.4),
          size: rand(1.2, 2.4),
          sizeEnd: 0.3,
          color: Math.random() < 0.7 ? k3(C.ember, 0.8) : k3(C.gold, 0.7),
          colorEnd: CINDER,
          gravity: 10,
          drag: 0.4,
          shape: Shape.Ember,
          flicker: 0.65,
          fadeIn: 0.1,
          turbulence: 35,
        });
      }
      return true;
    }, 7),
  );

  // Ash and the odd cinder settling over the whole screen, thinning out.
  later(0.8, () => {
    const h = emitter(
      7,
      () => {
        const cinder = Math.random() < 0.3;
        particle({
          x: rand(0, innerWidth),
          y: -10,
          vx: rand(-12, 12),
          vy: rand(25, 55),
          life: rand(5, 9),
          size: rand(1.1, 2.2),
          color: cinder ? k3(C.ember, 0.45) : C.ash,
          colorEnd: cinder ? CINDER : k3(C.ash, 0.6),
          shape: Shape.Ember,
          flicker: cinder ? 0.6 : 0.3,
          turbulence: 45,
          fadeIn: 0.15,
        });
      },
      9,
    );
    handles.push(h);
  });

  if (o.best) {
    // Deeper than ever: a quiet gleam on the depth, and a few gold motes rising from it.
    later(1.1, () => {
      glints(title, { count: 3, size: [4, 7], delay: [0, 1.4], color: k3(C.goldPale, 0.8) });
      const t = boxOf(title);
      for (let i = 0; i < budget(8); i++)
        particle({
          x: t.x + rand(-0.4, 0.4) * t.w,
          y: t.y + rand(-0.2, 0.3) * t.h,
          vx: rand(-8, 8),
          vy: -rand(14, 34),
          life: rand(1.6, 2.8),
          size: rand(1, 1.8),
          sizeEnd: 0.4,
          color: k3(C.gold, 0.7),
          colorEnd: k3(C.emberDeep, 0.4),
          shape: Shape.Ember,
          flicker: 0.4,
          fadeIn: 0.25,
          turbulence: 25,
          delay: rand(0, 1.2),
        });
    });
  }

  if (o.standings) {
    // The deepest delver's row, softly, as it flies in.
    later(1.25, () => {
      const first = o.standings?.querySelector('li');
      if (first) outline(first, { color: k3(C.gold, 0.7), width: 6, life: 1.8, intensity: 0.3, bleed: 0.08 });
    });
  }

  return {
    stop() {
      stopped = true;
      for (const h of handles) h.stop(0.6);
    },
  };
}
