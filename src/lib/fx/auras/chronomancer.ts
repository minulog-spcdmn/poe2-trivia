// The chronomancer aura (lib/auraKinds.ts): the Sorceress who rules time.
// Round the token stands an armillary clock: rings of brass seen tilted, each
// turning on its own slow axis, their near halves crossing in front of the
// face and their far halves passing behind it. The inner ring carries the long
// hand, ticking round on the escapement's beat; the outer one the short hand.
// Cold light seeps out from behind the token, and the sand of the hours runs
// in toward it on a spiral. Now and then the wearer casts Temporal Rift: the
// token's after-images step out from it one tick at a time, then time runs
// back; the hands ratchet back, the after-images rush home and it lands with
// a snap of light.
//
// What happens to the player moves the clock itself: a vote is one heavy
// tick, a right answer winds the hands round (the longer the streak, the
// further, the brighter the sand, and from a streak of three a third ring
// swings in), a miss loses a tick and the light goes grey, a lost life makes
// it try to rewind and fail, the rings sagging as lives run out.
//
// The light is the shader's (aura_chronomancer, three kinds of layer); the
// after-images are copies of the token in the layer under it, so they show
// only beside it, behind it.

import { auraShape, type AuraContext, type AuraEvent, type Burning } from './common';

/** How far the token's own rim reaches past its face (Avatar.svelte), px. */
const RIM = 3;

const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const smooth = (x: number) => x * x * (3 - 2 * x);
const TAU = Math.PI * 2;
/** How far a token `w` px across is from small (32 px and under: 0) to large (64 and up: 1). */
const grown = (w: number) => smooth(clamp((w - 32) / 32));

/** A tick's step: quick, with the slight overshoot of an escapement's detent. */
const detent = (x: number) => {
  const c = 1.2;
  const y = x - 1;
  return 1 + (c + 1) * y * y * y + c * y * y;
};
const inOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
/** The rewind: slow to start, fastest as it lands, then stops dead. */
const rush = (x: number) => x * x * x;

/** The long hand ticks every TICK s of the clock's time, a twelfth of a turn each, the step taking TICK_MOVE of the tick. */
const TICK = 1;
const TICK_MOVE = 0.22;
/** The short hand: a forty-eighth of a turn every SHORT_TICK s. */
const SHORT_TICK = 2;

/**
 * The rings, in the token's radii, and how fast their lozenges run round
 * them (rad/s). The first two are the dial: an inner band carrying the short
 * hand and the chapter ring carrying the long one, lying in one plane that
 * leans and sways slowly round the token. The third is the streak's: a ring
 * of its own across the dial (its tilt, the roll it starts at off the dial's,
 * and how fast that turns, rad/s), shown only while the player is on a run.
 */
const RINGS = [
  { r: 1.4, spin: -0.1 },
  { r: 1.84, spin: 0 },
  { r: 2.12, spin: 0.45, tilt: 0.24, roll: 1.25, prec: 0.16 },
];
/** The dial's plane: how open it is (height over width) and how far its roll sways either way (rad). */
const DIAL_TILT = 0.52;
const DIAL_SWAY = 0.28;

/** The cold, pale copy of the token an after-image is: grey, washed blue and lifted. */
const COLD = 'grayscale(1) sepia(1) hue-rotate(185deg) saturate(1.6) brightness(1.45) contrast(0.85)';

/**
 * Temporal Rift: after-images stepping out from the token and rushing home.
 * `dirs` is each one's way out (rad, clockwise from the top), `far` how far
 * (in the token's widths), `out` when each starts out and `slide` how long it
 * takes, `back` when time runs back and `rewind` how long that takes; `snap`
 * whether it lands with the snap of light.
 */
type Rift = { t: number; dirs: number[]; far: number[]; out: number[]; slide: number; back: number; rewind: number; snap: boolean; spin: number };

const box = (style: Record<string, string>) => {
  const d = document.createElement('div');
  Object.assign(d.style, { position: 'absolute', pointerEvents: 'none', ...style });
  return d;
};

export function burn(ctx: AuraContext): Burning {
  // The after-images: three cold copies of the token, under it, hidden till a rift.
  const ghosts = [0, 1, 2].map((i) => {
    const g = box({ inset: '0', opacity: '0', willChange: 'transform, opacity', zIndex: String(3 - i) });
    const copy = ctx.copyFace();
    Object.assign(copy.style, { filter: COLD, boxShadow: '0 0 0 1px rgba(196, 224, 255, 0.6)' });
    g.append(copy);
    ctx.under.append(g);
    return g;
  });

  // Each token keeps its own time, so a list of them never beats as one.
  const seed = Math.random();
  let age = 0;
  /** The clock's own time (s): ticks fall on its whole seconds. */
  let clock = Math.random() * 60;
  /** Time wound on (or back) by what happens: `wound` runs after `wind` at a rate set by `windRate`. */
  let wind = 0;
  let wound = 0;
  let windRate = 6;
  /** How fast the hands are being wound now (ticks/s), for their smear. */
  let windSpeed = 0;
  /** The light's flow of sand (in rings of the spiral) and how fast it runs. */
  let flow = Math.random() * 10;
  /** The streak's power (0-1): brighter sand, the third ring; it ebbs away slowly. */
  let power = 0;
  /** How much life the clock has left (1 whole; less as lives run out). */
  let vigor = 1;
  let chill = 0;
  /** The rings' jar (a shudder that settles) and its age. */
  let jar = 0;
  let jarAge = 9;
  /** The jar's shudder this frame. */
  let shaken = 0;
  /** The hands' heat: their tips flare on a heavy tick. */
  let heat = 0;
  let warm = 0;
  /** The rings swinging open as the token arrives (0 shut, 1 open). */
  let open = 0.35;
  let rift: Rift | null = null;
  let nextRift = 4 + Math.random() * 6;
  let snapAge = 99;
  const echo = { o: [0, 0, 0, 0, 0, 0], rew: -1, light: 0 };
  const hands = { long: 0, short: 0, smearL: 0, smearS: 0 };
  /** Where the dial leans: each token's own, within a little of level. */
  const lean = (seed - 0.5) * 0.7;
  const rings = RINGS.map(() => ({ roll: lean, tilt: DIAL_TILT, spin: seed * 9, show: 0 }));
  rings[2].roll = lean + (RINGS[2].roll ?? 0);
  rings[1].spin = 0;

  /** Starts a rift, unless one is under way that this one would cut short (`force` cuts it anyway). */
  const cast = (r: Omit<Rift, 't'>, force = false) => {
    if (rift && !force) return;
    rift = { t: 0, ...r };
  };
  /** The idle rift: two or three after-images strung out one way, a tick apart. */
  const idleRift = (size: number) => {
    const dir = hands.long + Math.PI + (Math.random() - 0.5) * 0.6;
    const n = size < 48 ? 2 : 3;
    const step = size < 48 ? 0.17 : 0.13;
    cast({ dirs: [dir, dir, dir], far: [0, 1, 2].map((i) => (i < n ? step * (i + 1) : 0)), out: [0.15, 1.15, 2.15], slide: 0.7, back: 3.3, rewind: 0.45, snap: true, spin: -3 });
  };
  let drawn = 32;

  /** Whether something is moving fast enough to want every frame drawn. */
  const busy = () => !!rift || Math.abs(windSpeed) > 0.5 || jarAge < 0.8 || snapAge < 0.6;

  const shapes: { stop: () => void }[] = [];
  // The time light, under the rings.
  shapes.push(
    auraShape(ctx, (f, _age, b) => {
      const tok = b.w / 2 + RIM * (b.w / 32) ** 0.5;
      f.hw = f.hh = (2.7 * tok + 4) / 0.72;
      f.k = (0.55 + 0.45 * grown(b.w)) * open * (0.75 + 0.25 * vigor);
      f.q[0] = 0;
      f.q[1] = tok;
      f.q[2] = 1 + 0.6 * power + 0.8 * warm;
      f.q[3] = (0.45 + 0.7 * power + 0.8 * warm) * (0.5 + 0.5 * vigor);
      f.q[4] = rings[0].tilt;
      f.q[5] = rings[0].roll;
      f.q[6] = flow;
      f.q[7] = clamp(warm + 0.5 * power);
      f.q[9] = chill;
      f.q[10] = 0;
      f.q[11] = 0;
    }),
  );
  // The rings: the long hand's, the short hand's and the streak's.
  RINGS.forEach((spec, i) => {
    shapes.push(
      auraShape(ctx, (f, _age, b) => {
        const ring = rings[i];
        const tok = b.w / 2 + RIM * (b.w / 32) ** 0.5;
        // Small tokens sit packed in lists: their rings stand a little closer.
        const R = (b.w / 2) * spec.r * (0.9 + 0.1 * grown(b.w)) * (0.7 + 0.3 * open);
        if (ring.show < 0.01) {
          f.hw = f.hh = 1;
          f.k = 0;
          return;
        }
        f.hw = f.hh = (R * 1.3 + 4) / 0.72;
        f.k = (0.6 + 0.4 * grown(b.w)) * ring.show * open * (0.65 + 0.35 * vigor) * (1 + 0.25 * warm);
        f.calm = !busy();
        // (The chapter ring, from 26 px up, has its twelve hours; the others their quarters.)
        f.q[0] = i === 1 && b.w >= 26 ? 1.25 : 1;
        f.q[1] = tok;
        f.q[2] = R;
        f.q[3] = ring.tilt * open;
        f.q[4] = ring.roll + shaken * (i === 1 ? -0.07 : 0.09);
        f.q[5] = ring.spin;
        f.q[6] = i === 1 ? hands.long : hands.short;
        f.q[7] = i === 1 ? hands.smearL : hands.smearS;
        f.q[9] = i === 2 ? -1 : (i === 1 ? 0.35 : 0.2) + heat;
        f.q[10] = chill;
        f.q[11] = i === 1 ? 1.13 : 1.0;
      }),
    );
  });
  // The after-images' light, the rewind and its snap.
  shapes.push(
    auraShape(ctx, (f, _age, b) => {
      const tok = b.w / 2;
      const far = Math.max(...[0, 2, 4].map((j) => Math.hypot(echo.o[j], echo.o[j + 1]))) * b.w;
      f.hw = f.hh = (Math.max(2.7 * tok, far + tok) + 5) / 0.72;
      f.k = 0.55 + 0.45 * grown(b.w);
      f.calm = !busy();
      f.q[0] = 2;
      f.q[1] = tok;
      f.q[2] = echo.light;
      f.q[3] = snapAge;
      for (let j = 0; j < 4; j++) f.q[4 + j] = echo.o[j] * b.w;
      f.q[9] = echo.o[4] * b.w;
      f.q[10] = echo.o[5] * b.w;
      f.q[11] = echo.rew;
    }),
  );

  /** Winds the clock on by `ticks` (back, if less than 0), at `rate` (1/s). */
  const windOn = (ticks: number, rate: number) => {
    wind += ticks * TICK;
    windRate = rate;
  };
  const shake = (k: number) => {
    jar = Math.max(jar * Math.exp(-jarAge * 5), 0) + k;
    jarAge = 0;
  };

  const react = (e: AuraEvent) => {
    const size = drawn;
    switch (e.kind) {
      case 'arrive':
        // The rings swing open as the after-images rewind in from three ways.
        open = 0;
        cast(
          { dirs: [0, 2.1, 4.2].map((a) => a + seed * TAU), far: [0.9, 0.9, 0.9], out: [-9, -9, -9], slide: 0.01, back: 0.05, rewind: 0.75, snap: true, spin: -8 },
          true,
        );
        break;
      case 'vote':
        // One heavy tick, its tips flaring.
        windOn(1, 18);
        heat = Math.max(heat, 1.4);
        shake(0.25);
        break;
      case 'score': {
        // The hands wound round: a turn for each answer in the run, up to four,
        // and the sand runs warm. From three in a row the streak's ring swings in.
        const s = Math.max(1, e.streak);
        windOn(12 * Math.min(s, 4), 2.6);
        power = clamp(Math.max(power, 0.22 * s + 0.12));
        warm = 1;
        heat = Math.max(heat, 1.2);
        break;
      }
      case 'miss':
        // A tick lost: the hands jump back, the rings jar, the light goes grey.
        windOn(-1, 20);
        shake(1);
        chill = 1;
        heat = 0;
        power *= 0.6;
        break;
      case 'hurt':
        // It tries to rewind the blow and can't: the hands run back hard, the
        // after-images are thrown out and creep home without a snap, and the
        // rings sag for good as lives run out.
        windOn(-8, 5);
        shake(1.6);
        chill = 1;
        power = 0;
        vigor = e.left <= 0 ? 0.3 : e.left === 1 ? 0.6 : Math.min(vigor, 0.85);
        cast({ dirs: [0, 1, 2].map(() => hands.long + Math.PI + (Math.random() - 0.5) * 1.2), far: [0.2, 0.32, 0.44], out: [0, 0.04, 0.08], slide: 0.25, back: 0.9, rewind: 1.6, snap: false, spin: 0 }, true);
        break;
      case 'win':
        // Mastery: three after-images stand out round it, every ring turns
        // bright and the hands wind a full day round as they rewind home.
        power = 1;
        warm = 1;
        vigor = 1;
        windOn(24, 1.3);
        cast({ dirs: [0, 2.094, 4.189].map((a) => a + hands.long), far: [0.42, 0.42, 0.42], out: [0, 0.12, 0.24], slide: 0.6, back: 2.0, rewind: 0.5, snap: true, spin: -6 }, true);
        break;
      case 'touch':
        // Time snaps: a quick step forward and one after-image out and back.
        windOn(3, 9);
        heat = Math.max(heat, 1);
        shake(0.35);
        cast({ dirs: [hands.long + Math.PI, 0, 0], far: [size < 48 ? 0.22 : 0.18, 0, 0], out: [0, 0, 0], slide: 0.28, back: 0.45, rewind: 0.3, snap: true, spin: -2 }, true);
        break;
    }
  };

  const set = (el: HTMLElement, transform: string, opacity: string) => {
    if (el.style.transform !== transform) el.style.transform = transform;
    if (el.style.opacity !== opacity) el.style.opacity = opacity;
  };

  return {
    react,
    step(dt, b) {
      drawn = b.w;
      age += dt;
      jarAge += dt;
      snapAge += dt;
      open += (1 - open) * (1 - Math.exp(-dt * 2.6));
      const env = clamp(age / 1.2);

      // The clock: its own time at the pace vigor allows, and what is wound on.
      clock += dt * (0.4 + 0.6 * vigor);
      const before = wound;
      wound += (wind - wound) * (1 - Math.exp(-dt * windRate));
      windSpeed = dt > 0 ? (wound - before) / dt : 0;
      const tau = clock + wound;

      // The long hand: a twelfth of a turn on each tick, with the detent's
      // overshoot; while winding, it runs freely and smears.
      const n = Math.floor(tau / TICK);
      const fr = tau / TICK - n;
      const free = clamp(Math.abs(windSpeed) / 3);
      const ticked = n - 1 + detent(clamp(fr / TICK_MOVE));
      const longTurns = (ticked * (1 - free) + (tau / TICK) * free) / 12;
      const ns = Math.floor(tau / SHORT_TICK);
      const shortTurns = (ns - 1 + detent(clamp((tau / SHORT_TICK - ns) / TICK_MOVE))) / 48;
      const shakeNow = jar * Math.exp(-jarAge * 5) * Math.sin(jarAge * 38);
      hands.long = longTurns * TAU - Math.PI / 2 + shakeNow * 0.25;
      hands.short = shortTurns * TAU - Math.PI / 2 - shakeNow * 0.15;
      // How far the hands smear behind as they whirl (rad of the ring).
      hands.smearL = clamp(((windSpeed * TAU) / 12) * 0.07, -1.1, 1.1);
      hands.smearS = clamp((windSpeed * TAU) / 48 * 0.09, -0.5, 0.5);

      // The dial's plane sways slowly about its lean and breathes open and
      // shut; a whirl or a rewind tips it further; a lost life lets it sag
      // toward edge-on. The streak's ring turns round on its own axis.
      const dialRoll = lean + DIAL_SWAY * Math.sin(age * 0.17 + seed * 9) + 0.1 * Math.sin(age * 0.41 + seed * 3) + clamp(windSpeed / 30, -1, 1) * 0.12;
      const dialTilt = DIAL_TILT * (0.5 + 0.5 * vigor) * (1 + 0.14 * Math.sin(age * 0.23 + seed * 5)) + Math.min(Math.abs(windSpeed), 30) * 0.004;
      const pull = 1 + Math.min(Math.abs(windSpeed), 20) * 0.12;
      rings.forEach((r, i) => {
        const spec = RINGS[i];
        if (spec.prec) {
          r.roll += dt * spec.prec * pull;
          r.tilt = (spec.tilt ?? DIAL_TILT) * (1 + 0.2 * Math.sin(age * 0.3 + seed * 7));
        } else {
          r.roll += (dialRoll - r.roll) * (1 - Math.exp(-dt * 3));
          r.tilt += (dialTilt - r.tilt) * (1 - Math.exp(-dt * 2));
        }
        // (The chapter ring stands still, its hours where the long hand's ticks land; the band turns, and whirls against a winding.)
        r.spin += dt * spec.spin * (0.4 + 0.6 * vigor) + (i === 0 ? -windSpeed * dt * 0.08 : 0);
        const target = i === 2 ? smooth(clamp((power - 0.45) / 0.3)) : 1;
        r.show += (target - r.show) * (1 - Math.exp(-dt * (target > r.show ? 2.2 : 0.8)));
        r.show = Math.min(r.show, env);
      });
      shaken = shakeNow;

      // The sand runs in, quicker when the clock is wound (either way) and
      // stalling for a moment when time is lost.
      flow += dt * (0.35 + 0.05 * Math.min(Math.abs(windSpeed), 30) + 0.4 * power) * (1 - 0.8 * chill) * (0.3 + 0.7 * vigor);

      // What ebbs: the streak's power over half a minute, the warmth, the chill, the tips' heat.
      power = Math.max(0, power - dt / 30);
      warm *= Math.exp(-dt * 1.4);
      chill *= Math.exp(-dt * 1.3);
      heat *= Math.exp(-dt * 3);
      // Each tick lights the long hand's tip for a moment.
      heat = Math.max(heat, 0.55 * Math.exp(-fr * TICK * 7) * (1 - free));

      // Temporal Rift, now and then.
      nextRift -= dt;
      if (nextRift <= 0 && !rift) {
        nextRift = 9 + Math.random() * 5;
        idleRift(b.w);
      }
      echo.rew = -1;
      echo.light = 0;
      echo.o.fill(0);
      if (rift) {
        const r = rift;
        r.t += dt;
        const rw = clamp((r.t - r.back) / r.rewind);
        const going = r.t >= r.back;
        if (going && r.t - dt < r.back && r.spin) windOn(r.spin, 1 / Math.max(r.rewind, 0.1) * 2.2);
        const home = r.t >= r.back + r.rewind;
        ghosts.forEach((g, i) => {
          const p = clamp((r.t - r.out[i]) / r.slide);
          const off = home || r.far[i] <= 0 ? 0 : r.far[i] * inOut(p) * (going ? 1 - (r.snap ? rush(rw) : inOut(rw)) : 1);
          const x = Math.sin(r.dirs[i]) * off;
          const y = -Math.cos(r.dirs[i]) * off;
          echo.o[2 * i] = x;
          echo.o[2 * i + 1] = y;
          const seen = home || p <= 0 || r.far[i] <= 0 ? 0 : clamp(p / 0.3) * (0.42 - 0.1 * i) * (1 + 0.6 * rw);
          set(g, `translate(${(x * 100).toFixed(2)}%, ${(y * 100).toFixed(2)}%)`, seen.toFixed(3));
        });
        echo.light = 1;
        echo.rew = going && !home && r.snap ? rw : -1;
        if (home) {
          if (r.snap) snapAge = 0;
          rift = null;
          for (const g of ghosts) set(g, 'translate(0%, 0%)', '0');
        }
      }
    },
    stop() {
      for (const s of shapes) s.stop();
      for (const g of ghosts) g.remove();
    },
  };
}
