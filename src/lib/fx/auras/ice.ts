// The ice aura (lib/auraKinds.ts): Herald of Ice. The herald's whole cycle
// is freeze, shatter and an icy explosion; here the wearer goes through it
// at rest, slowly, over and over. The cold builds in the token: its light
// draws in close behind it and ferns of frost grow in over its face from the
// rim, glittering; just before it breaks the cold is drawn in hard. Then the
// frost shatters and the cold breaks out as a nova, Ice Nova's own wave,
// rolling out on a tilted plane through the token's middle: a crisp, uneven
// crest with a band of cracked ice behind it and frost crystals forming
// along it, throwing faceted shards that tumble as they fly. The near half
// crosses the face (lighting it cold) and the far half passes behind the
// token; each wave lies on a plane of its own, some strong, some weak, some
// followed by a second, at no set beat. The waves spread sideways, along a
// list's row; what stays (the cold light) stays close.
// The light is the shader's (ice.glsl.ts): the cold heart and the waves.
//
// What happens to the player is the herald's:
// - arrive: the cold gathers in and the first wave breaks.
// - vote: a short sharp wave.
// - touch: the freeze builds at once and breaks.
// - score: the herald's shatter: the face freezes through, white, and bursts
//   in a great nova, white-hot, splinters of ice flung out; a streak chains
//   it, a wave more for each answer in the run (up to four), each on its own
//   plane and further, and the waves come quicker for a while after.
// - miss: the cold falters: a wave stalls at the token and its spikes break
//   off at once, and the light goes grey.
// - hurt: the same, harder; and as lives run out the cold is weaker, the
//   waves smaller and rarer.
// - win: three novae at once on three planes, and a cold that stays bright.

import { budget, particle } from '../core';
import { Shape } from '../particles';
import { auraShape, type AuraContext, type AuraEvent, type Burning } from './common';

/** How far the token's own rim reaches past its face (Avatar.svelte), px. */
const RIM = 3;
/** How many waves may roll at once. */
const WAVES = 5;

const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const smooth = (x: number) => x * x * (3 - 2 * x);
/** Eases `x` toward `to` at `rate` per second. */
const ease = (x: number, to: number, rate: number, dt: number) => x + (to - x) * (1 - Math.exp(-rate * dt));
/** How large the token is drawn: 0 at 32 px and under, 1 at 64 and up. */
const grown = (w: number) => smooth(clamp((w - 32) / 32));
/** The token's radius with its rim, as drawn. */
const radius = (w: number) => w / 2 + RIM * Math.sqrt(w / 32);
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

/**
 * A wave: `t` its age (s, below 0 still to come), `dur` its life, `reach`
 * how far its crest rolls (in the token's radii), its plane's `tilt` and
 * `roll`, its light, its spikes' height (in radii), when they start to break
 * off (0-1 of its life), its heat and its own number.
 */
type Wave = { on: boolean; t: number; dur: number; reach: number; tilt: number; roll: number; light: number; spikes: number; breakAt: number; heat: number; id: number; stall: boolean };

const ICE: [number, number, number] = [0.9, 1.6, 2.2];
const WHITE: [number, number, number] = [1.6, 1.8, 2.0];

export function burn(ctx: AuraContext): Burning {
  const phase = Math.random() * 20;
  let age = 0;
  /** The freeze building (0-1) toward the next wave, and how long it takes this time (s). */
  let build = Math.random() * 0.6;
  let buildTime = rand(2.8, 4.6);
  /** The shatter's flash on the rim, the face frozen through, the cold's light. */
  let flash = 0;
  let frozen = 0;
  let light = 0;
  let lightTo = 1;
  let chill = 0;
  let heat = 0;
  /** The streak's power (0-1, ebbing), a win's glory (stays) and the cold left as lives run out (1-0). */
  let power = 0;
  let glory = 0;
  let vigor = 1;
  let ids = Math.floor(Math.random() * 500);
  /** Each token's planes lean their own way, a little. */
  const lean = (Math.random() - 0.5) * 0.24;
  let lastRoll = lean;
  /** A shatter about to burst (s), and how great. */
  let pending = -1;
  let pendingStreak = 0;
  let pendingWin = false;
  /** Where the token was last drawn: splinters leave from there. */
  let at = { x: 0, y: 0, w: 32 };

  const waves: Wave[] = Array.from({ length: WAVES }, () => ({ on: false, t: 0, dur: 1, reach: 2, tilt: 0.3, roll: 0, light: 1, spikes: 0.2, breakAt: 0.5, heat: 0, id: 0, stall: false }));

  /** Sends out a wave (with `delay` s before it breaks), taking the oldest slot if all are rolling. */
  const send = (w: Partial<Wave>, delay = 0) => {
    let slot = waves.find((v) => !v.on);
    if (!slot) slot = waves.reduce((a, b) => (a.t / a.dur > b.t / b.dur ? a : b));
    // Each plane rolls away from the last, so the waves never lie alike.
    const roll = w.roll ?? clamp(lean + (lastRoll > lean ? -1 : 1) * rand(0.04, 0.22), -0.3, 0.3);
    lastRoll = roll;
    Object.assign(slot, { on: true, t: -delay, dur: 2.1, reach: 2.2, tilt: rand(0.22, 0.36), light: 1, spikes: 0.6, breakAt: 0.42, heat: 0, stall: false, ...w, roll, id: (ids = (ids + 1) % 1000) });
  };

  /** The cold drawn in hard just before it breaks (0-1): the last fifth of the freeze, or a shatter about to come. */
  let rush = 0;
  const drawIn = () => Math.max(smooth(clamp((build - 0.8) / 0.2)), rush);

  /**
   * The freeze breaks: the cold's own wave at rest. No two alike and never
   * on a beat: most are plain, some strong, some weak; now and then a
   * second, smaller one follows on another plane, and now and then the cold
   * rests longer before it builds again.
   */
  const release = () => {
    const small = 1 - grown(at.w);
    const roll = Math.random();
    const k = roll < 0.14 ? rand(1.15, 1.3) : roll < 0.3 ? rand(0.55, 0.7) : rand(0.8, 1.0);
    const wave = (scale: number, delay: number) =>
      send(
        {
          dur: rand(1.9, 2.5) * (0.8 + 0.2 * scale),
          reach: (rand(1.8, 2.15) - 0.15 * small) * (0.75 + 0.25 * vigor) * (1 + 0.08 * Math.max(power, glory)) * (0.85 + 0.15 * scale),
          light: rand(0.75, 1.0) * scale * (0.6 + 0.4 * vigor),
          spikes: rand(0.48, 0.7) * (0.7 + 0.3 * vigor) * (1 + 0.25 * small) * (0.8 + 0.2 * scale),
          heat: 0.15 * Math.max(power, glory) + 0.3 * Math.max(0, scale - 1),
        },
        delay,
      );
    wave(k, 0);
    if (Math.random() < 0.22) wave(k * rand(0.55, 0.75), rand(0.3, 0.6));
    flash = Math.max(flash, 0.55 * k);
    build = 0;
    buildTime = (rand(2.2, 4.6) * (Math.random() < 0.12 ? 1.7 : 1)) / (1 + 0.6 * Math.max(power, glory)) / (0.6 + 0.4 * vigor);
  };

  /** Splinters of the shatter, flung out sideways and falling. */
  const splinters = (n: number, force: number) => {
    const sc = at.w / 32;
    const R = radius(at.w);
    for (let i = 0; i < budget(n); i++) {
      const side = i % 2 ? 1 : -1;
      const a = rand(-0.5, 0.35);
      const v = rand(70, 150) * force * Math.sqrt(sc);
      particle({
        x: at.x + side * R * 0.9,
        y: at.y + rand(-0.3, 0.3) * R,
        vx: side * Math.cos(a) * v,
        vy: Math.sin(a) * v * 0.6,
        life: rand(0.45, 0.8),
        size: rand(1.6, 2.6) * Math.sqrt(sc),
        sizeEnd: 0.6 * Math.sqrt(sc),
        color: WHITE,
        colorEnd: ICE,
        gravity: 260 * sc,
        drag: 2.2,
        shape: Shape.Shard,
        rot: Math.random() * 6.28,
        spin: rand(-12, 12),
        delay: rand(0, 0.06),
      });
    }
  };

  const heartShape = auraShape(ctx, (f, _age, b) => {
    const R = radius(b.w);
    f.hw = (2.7 * R + 4) / 0.72;
    f.hh = (2.0 * R + 4) / 0.72;
    f.k = 0.7 + 0.3 * grown(b.w);
    f.calm = flash < 0.05 && frozen < 0.05;
    f.q[0] = 0;
    f.q[1] = R;
    f.q[2] = light * (0.55 + 0.45 * vigor) * (1 + 0.3 * Math.max(power, glory));
    f.q[3] = smooth(build);
    f.q[4] = chill;
    f.q[5] = flash;
    f.q[6] = b.w / 2;
    f.q[7] = frozen;
    f.q[9] = heat;
    f.q[10] = drawIn();
    f.q[11] = 0;
  });

  const waveShapes = waves.map((w) =>
    auraShape(ctx, (f, _age, b) => {
      if (!w.on || w.t < 0) {
        f.hw = f.hh = 1;
        f.k = 0;
        return;
      }
      const R = radius(b.w);
      const x = clamp(w.t / w.dur);
      // The crest rolls out fast and slows; a stalled one hardly leaves the token.
      const out = 1 - Math.pow(1 - x, 2.4);
      const Rn = R * (0.95 + (w.reach - 0.95) * out);
      // Its shards thrown out as it goes, then breaking away and dwindling.
      const broke = smooth(clamp((x - w.breakAt) / (1 - w.breakAt)));
      const L = w.spikes * R * smooth(clamp(x / 0.16)) * (1 - 0.6 * broke);
      const lit = w.light * smooth(clamp(x / 0.06)) * (1 - smooth(clamp((x - 0.5) / 0.5)));
      // (Its shards fly on out past the crest once they break away, and rise out of the plane.)
      const outer = Rn + (1.1 + 0.9 * broke) * L;
      f.hw = (outer + 4) / 0.66;
      f.hh = (outer * (w.tilt * Math.cos(w.roll) + Math.abs(Math.sin(w.roll))) + 0.75 * L + 4) / 0.66;
      f.k = 0.75 + 0.25 * grown(b.w);
      f.calm = w.heat < 0.3 && !w.stall;
      f.q[0] = 1;
      f.q[1] = R;
      f.q[2] = Rn;
      f.q[3] = w.tilt;
      f.q[4] = w.roll;
      f.q[5] = lit;
      f.q[6] = L;
      f.q[7] = broke;
      f.q[9] = w.heat * (1 - x);
      // (Its number, and a tenth of its age in what's left: the shader tumbles its shards by it.)
      f.q[10] = w.id + Math.min(Math.max(w.t, 0), 9.9) / 10;
      f.q[11] = chill;
    }),
  );

  /** The herald's shatter: the face, frozen through, bursts into a chain of novae. */
  const shatter = (streak: number, win: boolean) => {
    // (The frost on the face goes with it: only a trace stays.)
    flash = 1.3;
    frozen = 0.3;
    build = 0;
    buildTime = rand(2.4, 3.6);
    if (win) {
      send({ dur: 2.6, reach: 3.0, tilt: 0.3, roll: lean, light: 1.5, spikes: 1.05, breakAt: 0.5, heat: 1 });
      send({ dur: 2.4, reach: 2.6, tilt: 0.42, roll: 0.62, light: 1.2, spikes: 0.8, breakAt: 0.45, heat: 0.9 });
      send({ dur: 2.4, reach: 2.6, tilt: 0.42, roll: -0.62, light: 1.2, spikes: 0.8, breakAt: 0.45, heat: 0.9 });
      splinters(14, 1.4);
      return;
    }
    const n = clamp(streak, 1, 4);
    for (let i = 0; i < n; i++) {
      send(
        {
          dur: 2.2 + 0.15 * i,
          reach: 2.45 + 0.22 * i,
          light: 1.35 + 0.08 * i,
          spikes: 0.85 + 0.07 * i,
          breakAt: 0.5,
          heat: 1,
          tilt: rand(0.24, 0.38),
        },
        0.26 * i,
      );
    }
    splinters(6 + 2 * n, 1 + 0.12 * n);
  };

  const react = (e: AuraEvent) => {
    switch (e.kind) {
      case 'arrive':
        // (Each in its own time, so a room that fills at once never pulses as one.)
        light = 0;
        build = 0.35;
        buildTime = rand(0.9, 3.2);
        break;
      case 'vote':
        send({ dur: 1.2, reach: 1.7, light: 0.95, spikes: 0.5, breakAt: 0.35, heat: 0.5 });
        flash = Math.max(flash, 0.7);
        break;
      case 'touch':
        // The freeze runs through at once and breaks a breath later.
        build = Math.max(build, 0.6);
        buildTime = 0.4 / (1 - build);
        heat = Math.max(heat, 0.4);
        break;
      case 'score': {
        // It freezes through, the cold drawn in hard, and then it shatters.
        frozen = 1;
        rush = 1;
        heat = 1;
        light = Math.max(light, 1.2);
        power = clamp(Math.max(power, 0.25 * e.streak));
        pending = 0.3;
        pendingStreak = Math.max(1, e.streak);
        pendingWin = false;
        break;
      }
      case 'miss':
        // The cold falters: a wave stalls at the token and its ice breaks off at once.
        send({ dur: 1.1, reach: 1.38, light: 0.7, spikes: 0.6, breakAt: 0.05, heat: 0, stall: true });
        chill = 1;
        light = 0.45;
        build = 0;
        power *= 0.5;
        break;
      case 'hurt':
        send({ dur: 1.3, reach: 1.3, light: 0.8, spikes: 0.7, breakAt: 0.02, heat: 0, stall: true });
        chill = 1;
        light = 0.3;
        build = 0;
        power = 0;
        vigor = e.left <= 0 ? 0.35 : e.left === 1 ? 0.6 : Math.min(vigor, 0.85);
        break;
      case 'win':
        glory = 1;
        power = 1;
        vigor = 1;
        frozen = 1;
        rush = 1;
        heat = 1;
        light = Math.max(light, 1.4);
        pending = 0.4;
        pendingWin = true;
        break;
    }
  };

  return {
    react,
    step(dt, b) {
      at = { x: b.x, y: b.y, w: b.w };
      age += dt;
      // The freeze builds; when it's whole, it breaks.
      build += dt / buildTime;
      if (build >= 1 && pending < 0) release();
      if (pending >= 0) {
        pending -= dt;
        if (pending < 0) shatter(pendingStreak, pendingWin);
      } else rush *= Math.exp(-dt * 7);
      for (const w of waves) {
        if (!w.on) continue;
        w.t += dt;
        if (w.t > w.dur) w.on = false;
      }
      // What ebbs: the flash, the frozen face, the heat, the chill; the
      // streak's power over half a minute.
      flash *= Math.exp(-dt * 5);
      frozen *= Math.exp(-dt * (frozen > 0.5 ? 1.6 : 2.6));
      heat *= Math.exp(-dt * 1.2);
      chill *= Math.exp(-dt * 0.9);
      power = Math.max(0, power - dt / 30);
      lightTo = 0.9 + 0.08 * Math.sin(age * 0.31 + phase) + 0.06 * Math.sin(age * 0.53 + phase * 1.9);
      light = ease(light, lightTo, light > lightTo ? 1.2 : 0.8, dt);
    },
    stop() {
      heartShape.stop();
      for (const s of waveShapes) s.stop();
    },
  };
}
