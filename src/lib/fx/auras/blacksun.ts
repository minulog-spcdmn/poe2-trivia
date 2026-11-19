// The blacksun aura (lib/auraKinds.ts), which is Delve: the black sun at the
// heart of Delve's own circle (lib/plates/blackSun.ts, BlackSunCircle), worn.
// The token stands where the black sun does, the moon across the sun, its
// face its own; round it the corona, drawn as the plate draws its glory and
// the old copperplates drew an eclipse, in fine engraved strokes in the
// circle's old gold, laid along the sun's field as a real corona lies: the
// strokes from above and below bend out toward the sides and gather into
// long streamers there, one longer than the other, each token's tilted its
// own way, leaving the top and bottom nearly bare. One slanting streamer
// leans out toward us, its strokes rising from the face and running out over
// its edge (blacksun.glsl.ts draws it all).
//
// At rest it moves as the plate's coronas do, slowly and each part on its
// own beat: the streamers and their strokes swell and shrink in two sets
// out of step, each streamer sways, the field wavers, and now and then a
// stroke catches the light. The sun drifts a little behind the moon, so the
// light pools on one side, catching the face's edge there, and moves round
// as it goes; when it comes near the edge, its light glints through the
// moon's valleys (Baily's beads). Now and then a loop of the field rises on
// the edge in rose, flares and sinks back (not in a list, where it would be
// a speck).
//
// What happens to the player moves the eclipse:
// - score: the diamond ring. The sun comes to the very edge and breaks
//   through in a run of beads, the last flaring into the diamond, a burst of
//   fine rays, its glare over the face, the corona dimming under it; as it
//   peaks, the corona blooms and a pulse of light runs out along every
//   stroke, lit round from where it broke. A streak spreads the corona
//   further and brighter; from two in a row the strokes where the sun broke
//   burst out far, hot at their tips, and from three the sun breaks through
//   on the far side too, blooming again.
// - miss: the corona jars and cools to rust, as the circle does at a wrong
//   answer.
// - hurt: the Darkness takes it. The corona jars, cools, is drawn into the
//   rim and goes out; then the sun's edge glints and it kindles again,
//   smaller for every life lost, as the plate's suns go dark.
// - vote, touch: a run of beads glints at the edge, and the corona swells.
// - arrive: totality comes: beads run along the edge, the last flares and
//   the corona blooms out from the rim.
// - win: the diamond ring and a burst on one side, then the diamond on the
//   other, the corona at its greatest.

import { auraShape, type AuraContext, type AuraEvent, type Burning } from './common';

/** How far the token's own rim reaches past its face (Avatar.svelte), px. */
const RIM = 3;

const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const smooth = (x: number) => x * x * (3 - 2 * x);
const rand = (a: number, b: number) => a + Math.random() * (b - a);
/** The token's radius with its rim, for a token `w` px across. */
const radius = (w: number) => w / 2 + RIM * (w / 32) ** 0.5;
/** How far a token `w` px across is from small (32 px and under: 0) to large (64 and up: 1). */
const grown = (w: number) => smooth(clamp((w - 32) / 32));
const TAU = Math.PI * 2;

/** A damped spring (x toward a target, v its speed), stepped in small steps so a long frame can't throw it. */
type Spring = { x: number; v: number };
function pull(s: Spring, target: number, w: number, z: number, dt: number) {
  const n = Math.max(1, Math.ceil(dt / (1 / 120)));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    s.v += (-w * w * (s.x - target) - 2 * z * w * s.v) * h;
    s.x += s.v * h;
  }
}

/** A run of beads at the moon's edge: where its last one stands (rad: 0 right, +y down), s since it began, how many, and how bright the last flares into the diamond (0-1). */
type Beads = { a: number; t: number; n: number; dia: number };
/** How long a run of beads takes (s): each lights 0.055 s after the one before, and the diamond fades out slower than a bead. */
const beadsLast = (b: Beads) => (b.n - 1) * 0.055 + (b.dia > 0.05 ? 2.6 : 1.2);
/** Where on the moon's edge the sun breaks out (rad): toward the sides, on `side` (1 right, -1 left; 0 either). */
function edge(side = 0) {
  const s = side || (Math.random() < 0.5 ? -1 : 1);
  const off = rand(-0.85, 0.85);
  return s > 0 ? off : Math.PI - off;
}

/** How long a score's pulse of light takes to run out along the corona's strokes (s). */
const WAVE_DONE = 2.5;

/** What a run of beads brings once its diamond peaks: the corona's bloom (its reach's kick, its swell), and whether the strokes burst out there. */
type Bloom = { kick: number; swell: number; burst?: boolean };

export function burn(ctx: AuraContext): Burning {
  let age = 0;
  // It's already whole when first seen.
  const reach: Spring = { x: 1, v: 0 };
  const light: Spring = { x: 1, v: 0 };
  /** The lives left, as the corona's size (1 with all three). */
  let lives = 1;
  /** The streak's glow (0-1), fading over half a minute. */
  let power = 0;
  let swell = 0;
  let chill = 0;
  /** s since a miss or a lost life jarred it (large: long ago); the shader cools it by this too. */
  let jarT = 9;
  /** The Darkness's hold after a lost life (s left). */
  let grip = 0;
  let beads: Beads | null = null;
  /** Runs of beads waiting their turn: s till each. */
  const queue: { in: number; b: Omit<Beads, 't'>; bloom?: Bloom }[] = [];
  /** s since the pulse of light began to run out (below 0: about to; past WAVE_DONE: none), and the angle it was lit round from. */
  let wave = WAVE_DONE + 1;
  let waveAt = 0;
  /** A loop flaring (k 0 or 1) or the strokes bursting out at `a` (k 2): how far through (0-1), how fast. */
  let flare: { k: number; a: number; t: number; v: number } | null = null;
  let nextFlare = rand(2.5, 5);
  /**
   * The sun behind the moon (radii from its centre, x and y springs), the
   * place it drifts toward, and when it picks the next. Near the edge the
   * moon's valleys let its light through: beads, once in a while (`beadCool`, s).
   */
  const sun = { x: { x: 0, v: 0 } as Spring, y: { x: 0, v: 0 } as Spring };
  const aim = { x: 0, y: 0 };
  let nextDrift = rand(0.5, 2);
  let beadCool = rand(1, 3);
  /** The sun pushed to the moon's very edge at a score (the way, s since). */
  let push: { a: number; t: number } | null = null;
  /** The size at rest beside the token: smaller in lists, where the next player is close. */
  let sizeK = 1;

  /** What the diamond brings once it peaks, waiting for it. */
  let kick: Bloom | null = null;
  /**
   * The sun breaking out at the moon's edge: n beads, the last flaring into
   * the diamond as bright as `dia`; with `bloom`, the corona blooming as the
   * diamond peaks (as hard as given), a ring of light running out through it.
   */
  const breakOut = (b: Omit<Beads, 't'>, bloom?: Bloom) => {
    beads = { ...b, t: 0 };
    if (bloom) {
      wave = -(b.n - 1) * 0.055 - 0.16;
      waveAt = b.a;
      kick = bloom;
    }
  };

  const busy = () => !!beads || !!flare || !!push || wave < WAVE_DONE || grip > 0 || jarT < 1.5 || Math.abs(reach.v) > 0.03 || Math.abs(light.v) > 0.03;

  const shape = auraShape(ctx, (f, _age, b) => {
    const tok = radius(b.w);
    f.hw = (3.25 * tok) / 0.72 + 4;
    f.hh = (1.75 * tok) / 0.72 + 4;
    f.k = 1;
    f.calm = !busy();
    f.q[0] = tok;
    f.q[1] = Math.max(0, reach.x) * sizeK;
    f.q[2] = Math.max(0, light.x);
    // (Each of x and y from -0.1 to 0.1 as 0 to 1000, x the high part: exact in a float.)
    const at = (v: number) => Math.round(clamp(v / 0.2 + 0.5) * 1000);
    f.q[3] = at(sun.x.x) * 1024 + at(sun.y.x);
    f.q[4] = Math.min(jarT, 9);
    f.q[5] = beads?.a ?? waveAt;
    f.q[6] = beads ? beads.t : -1;
    f.q[7] = beads ? beads.n + Math.min(0.99, beads.dia) : 0;
    f.q[9] = power;
    f.q[10] = wave;
    // (Which, where a burst is as 0-1023 round from the right, and how far through.)
    f.q[11] = flare ? flare.k * 2048 + (flare.k === 2 ? Math.round((((flare.a % TAU) + TAU) % TAU / TAU) * 1023) : 0) + clamp(flare.t, 0, 0.999) : -1;
  });

  const react = (e: AuraEvent) => {
    switch (e.kind) {
      case 'arrive':
        // Totality comes: the corona from nothing, as the last of the sun runs out along the edge.
        reach.x = 0.05;
        reach.v = 0;
        light.x = 0.35;
        lives = 1;
        queue.length = 0;
        breakOut({ a: edge(), n: 7, dia: 0.9 }, { kick: 0, swell: 0.3 });
        break;
      case 'vote':
      case 'touch':
        swell = Math.max(swell, e.kind === 'vote' ? 0.35 : 0.25);
        reach.v += e.kind === 'vote' ? 0.9 : 0.6;
        if (!beads || beads.t > 0.6) breakOut({ a: edge(), n: e.kind === 'vote' ? 4 : 3, dia: e.kind === 'vote' ? 0.4 : 0.25 });
        break;
      case 'score': {
        const m = Math.min(Math.max(1, e.streak), 5);
        power = clamp(Math.max(power, 0.22 * (m - 1) + 0.08));
        chill = 0;
        const a = edge();
        breakOut({ a, n: Math.min(3 + m, 7), dia: Math.min(0.99, 0.66 + 0.08 * m) }, { kick: 1.2 + 0.25 * m, swell: 0.3 + 0.08 * m, burst: m >= 2 });
        push = { a, t: 0 };
        queue.length = 0;
        if (m >= 3) queue.push({ in: 1.0, b: { a: edge(Math.cos(a) > 0 ? -1 : 1), n: 6, dia: 0.85 }, bloom: { kick: 0.7, swell: 0.3 } });
        break;
      }
      case 'miss':
        chill = 1;
        jarT = 0;
        power *= 0.5;
        light.v -= 3;
        break;
      case 'hurt':
        lives = Math.min(lives, 0.6 + 0.4 * clamp(e.left / 3));
        grip = 1.3;
        power = 0;
        chill = 1;
        jarT = 0;
        beads = null;
        flare = null;
        kick = null;
        push = null;
        queue.length = 0;
        break;
      case 'win':
        lives = 1;
        power = 1;
        queue.length = 0;
        {
          const a = edge();
          breakOut({ a, n: 7, dia: 0.99 }, { kick: 2, swell: 0.6, burst: true });
          push = { a, t: 0 };
          queue.push({ in: 1.1, b: { a: edge(Math.cos(a) > 0 ? -1 : 1), n: 7, dia: 0.99 }, bloom: { kick: 1.2, swell: 0.5 } });
        }
        break;
    }
  };

  return {
    react,
    step(dt, b) {
      age += dt;
      sizeK = 0.82 + 0.18 * grown(b.w);
      const wake = smooth(clamp(age / 0.6));
      if (beads) {
        beads.t += dt;
        if (beads.t > beadsLast(beads)) beads = null;
      }
      for (let i = queue.length - 1; i >= 0; i--) {
        queue[i].in -= dt;
        if (queue[i].in <= 0 && (!beads || beads.t > 0.7)) {
          const { b: next, bloom } = queue.splice(i, 1)[0];
          breakOut(next, bloom);
        }
      }
      if (wave < WAVE_DONE + 1) wave += dt;
      // The corona blooms as the diamond peaks, and its strokes there burst out.
      if (kick && wave >= 0) {
        reach.v += kick.kick;
        swell = Math.max(swell, kick.swell);
        if (kick.burst) flare = { k: 2, a: waveAt, t: 0, v: 1 / 1.8 };
        kick = null;
      }
      if (flare) {
        flare.t += flare.v * dt;
        if (flare.t >= 1) flare = null;
      }
      const calmNow = grip <= 0;
      // Now and then one of the loops flares.
      nextFlare -= dt;
      if (nextFlare <= 0) {
        nextFlare = rand(2.5, 5.5);
        if (calmNow && !flare) flare = { k: Math.random() < 0.5 ? 0 : 1, a: 0, t: 0, v: 1 / rand(1.6, 2.2) };
      }
      // The sun drifts behind the moon, easing toward a place by one side or
      // the other, now and then back to the middle; near the edge its light
      // glints through as beads.
      nextDrift -= dt;
      if (nextDrift <= 0) {
        nextDrift = rand(3.5, 8);
        if (Math.random() < 0.25) {
          aim.x = aim.y = 0;
        } else {
          const a = edge(aim.x > 0.004 ? -1 : aim.x < -0.004 ? 1 : 0);
          const d = rand(0.012, 0.026);
          aim.x = Math.cos(a) * d;
          aim.y = Math.sin(a) * d;
        }
      }
      let gx = aim.x;
      let gy = aim.y;
      let sw = 1.1;
      if (push) {
        push.t += dt;
        if (push.t < 0.45) {
          // (To the very edge of the moon, not past it: the diamond is the sun's light there.)
          gx = Math.cos(push.a) * 0.024;
          gy = Math.sin(push.a) * 0.024;
          sw = 7;
        } else {
          sw = 2.2;
          if (push.t > 2) push = null;
        }
      }
      pull(sun.x, gx, sw, 0.9, dt);
      pull(sun.y, gy, sw, 0.9, dt);
      beadCool -= dt;
      const off = Math.hypot(sun.x.x, sun.y.x);
      if (off > 0.017 && beadCool <= 0 && !beads && !push && calmNow) {
        beadCool = rand(2.5, 5);
        breakOut({ a: Math.atan2(sun.y.x, sun.x.x), n: 2 + Math.floor(Math.random() * 2), dia: rand(0.1, 0.22) });
      }
      jarT += dt;
      swell *= Math.exp(-dt / 0.6);
      chill *= Math.exp(-dt / 1.5);
      power = Math.max(0, power - (power * dt) / 30);
      // The Darkness's hold, then the sun's edge glints and it kindles again.
      if (grip > 0) {
        grip -= dt;
        if (grip <= 0) breakOut({ a: edge(), n: 2, dia: 0.5 });
      }
      const held = grip > 0;
      const goalReach = held ? 0.03 : lives * (1 + 0.22 * power) * wake;
      const goalLight = held ? 0.12 : (0.8 + 0.2 * lives) * (1 + 0.3 * power) * (1 + swell) * wake;
      pull(reach, goalReach, held ? 9 : 3.6, 0.75, dt);
      pull(light, goalLight, 7, 0.8, dt);
    },
    stop() {
      shape.stop();
    },
  };
}
