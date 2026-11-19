// The azmeri aura (lib/auraKinds.ts): the wildwood's spirits. In PoE2 an
// Azmeri spirit is a wisp, a sparkling cluster of light white at its heart,
// that drifts along a route of its own, hangs, then darts off shedding
// glitter; it flees whoever comes near, bursts in a flash if left behind,
// and at the end of its route it enters a beast and possesses it, the
// beast then wreathed in the spirit of an animal.
//
// Here the wildwood's four kinds keep the wearer, primal cyan, wild magenta,
// vivid yellow and sacred orange, with a small cyan one close in: five
// wisps at different depths and sizes. Each wanders round the token on a path
// of its own, wide and low (behind it, in front of its face), at its own
// pace, mostly hanging and drifting, now and then darting a little way, and
// sheds glitter along its path; a cold light seeps from behind the token.
// All the sparkle comes off the wisps. The light is the shader's
// (azmeri.glsl.ts); here are their pace and how they answer what happens to
// their player:
// - score: a wisp dives into the token and possesses it; its face lights from
//   within and a stag's spirit antlers rise behind it, larger and with more
//   tines the longer the streak, then dissolve from the tips as the wisp flies
//   back out. The streak's glitter trails grow longer, and from a streak of
//   three a sixth wisp, a small orange one, joins.
// - win: every wisp goes in, and the antlers rise at their fullest and stay.
// - miss: the wisps shy off from the token and their light gutters a while.
// - hurt: a wisp bursts in a flash of light and is gone; it forms again
//   later, the later the fewer lives are left, and on the last the other
//   burns low.
// - vote: a wisp darts in and grazes the token.
// - touch: they flee, as wisps flee the hand that reaches for them.
// - arrive: they fly in from afar.

import { budget, particle } from '../core';
import { Shape } from '../particles';
import { auraShape, type AuraContext, type AuraEvent, type Burning } from './common';

/** How far the token's own rim reaches past its face (Avatar.svelte), px. */
const RIM = 3;
const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const smooth = (x: number) => {
  const t = clamp(x);
  return t * t * (3 - 2 * t);
};
const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** Each wisp's colour, as azmeri_hue in the shader: primal cyan, wild magenta, vivid yellow, sacred orange. */
const HUES: [number, number, number][] = [
  [0.3, 1.2, 1.95],
  [1.8, 0.45, 1.6],
  [1.75, 1.55, 0.4],
  [2.0, 0.85, 0.25],
];
const SPIRIT: [number, number, number] = [1.2, 1.7, 2.0];

/** How fast a wisp drifts along its path at rest (phase/s), and how much faster at the height of a dart. */
const DRIFT = 0.26;
const DART = 1.5;
/** How long a dart takes (s), and the wait between them at rest (s). */
const DART_TIME = 1.3;
const DART_GAP = [3, 7];
/** How far back along its path a wisp's glitter lasts (phase): as ever, and at the height of a streak (the shader keeps 1.6 at most). */
const TRAIL = [1.15, 1.6];

/** Where a wisp is at phase `ph` on its path: as azmeri_path and azmeri_seen in the shader (px from the centre, +y down). */
function pathAt(ph: number, k: number, tok: number, far: number): [number, number] {
  const T = 2 * Math.PI;
  const a1 = T * k;
  const a2 = T * ((k * 7.31) % 1);
  const a3 = T * ((k * 3.17) % 1);
  const a4 = T * ((k * 5.71) % 1);
  const a5 = T * ((k * 9.13) % 1);
  const th = 0.7 * ph + 1.5 * Math.sin(0.61 * ph + a1);
  const el = 0.22 * Math.sin(0.83 * ph + a2) + 0.08 * Math.sin(1.9 * ph + a3);
  const rho = tok * (1.65 + 0.25 * Math.sin(1.37 * ph + a4)) * far;
  const h = rho * Math.cos(el);
  const x = 1.1 * h * Math.sin(th);
  const y = -rho * Math.sin(el);
  const z = h * Math.cos(th);
  const Y = y * 0.9664 + z * 0.2571;
  const Z = z * 0.9664 - y * 0.2571;
  const xx = x + 0.1 * tok * Math.cos(3.7 * ph + a5);
  const yy = Y + 0.07 * tok * Math.sin(3.7 * ph + a5);
  const r = 0.25 * (k - 0.5);
  const F = 9 * tok;
  const pz = F / (F - Z);
  return [(Math.cos(r) * xx - Math.sin(r) * yy) * pz, (Math.sin(r) * xx + Math.cos(r) * yy) * pz];
}

/**
 * The wisps: each its colour (as azmeri_hue: 0 cyan, 1 magenta, 2 yellow,
 * 3 orange), its size, how far out it keeps (in its path's radii) and its
 * pace. Five keep the wearer at rest, at different depths and sizes, each
 * moving at its own rate; the last, a small orange one, joins only for a streak.
 */
const WISPS = [
  { hue: 0, size: 1, home: 1, pace: 1 },
  { hue: 1, size: 0.92, home: 1.06, pace: 0.9 },
  { hue: 2, size: 0.85, home: 0.86, pace: 1.2 },
  { hue: 3, size: 0.88, home: 1.16, pace: 0.8 },
  { hue: 0, size: 0.6, home: 0.78, pace: 1.35 },
  { hue: 3, size: 0.65, home: 1.25, pace: 1.1 },
];
/** The wisp that joins only for a streak. */
const GOLD = 5;
/** The magenta wisp: the one that bursts when a life is lost. */
const ROSE = 1;

type Wisp = {
  /** Its place in WISPS, its colour, size, how far out it keeps, its pace, and its path's key. */
  i: number;
  hue: number;
  size: number;
  home: number;
  pace: number;
  k: number;
  ph: number;
  /** How far through a dart it is (s), or -1; and the wait till the next. */
  dart: number;
  wait: number;
  /** How far out it flies (1 as ever), where it's pulled to and its speed. */
  far: number;
  farTo: number;
  farV: number;
  /** How far it has dived into the token (0-1), where it's heading, and how fast (1/s). */
  dive: number;
  diveTo: number;
  diveRate: number;
  /** How much of it is here (0-1), and whether it should be. */
  here: number;
  wanted: boolean;
  /** Seconds since it burst (or 9: long since), and the time till it forms again. */
  burst: number;
  back: number;
};

export function burn(ctx: AuraContext): Burning {
  const key = Math.random();
  const wisps: Wisp[] = WISPS.map((spec, i) => ({
    i,
    ...spec,
    k: (key + i * 0.381) % 1,
    ph: Math.random() * 40,
    dart: -1,
    wait: rand(1, DART_GAP[1]),
    far: 1,
    farTo: 1,
    farV: 0,
    dive: 0,
    diveTo: 0,
    diveRate: 2,
    here: i === GOLD ? 0 : 1,
    wanted: i !== GOLD,
    burst: 9,
    back: 0,
  }));
  let clock = 0;
  let drawn = { x: 0, y: 0, w: 32 };
  /** The streak's fire (0-1): it lingers, and a miss or a lost life puts it out. */
  let fervour = 0;
  /** Their light dimmed and guttering (0-1), after a miss or a hurt. */
  let dim = 0;
  /** How much life they have left (1 whole; lower on the last lives). */
  let vigor = 1;
  /** The antlers: grown (0-1.15), their size, their tines, how much is left (0-1), and what's asked of them. */
  const stag = { grow: 0, size: 1, tines: 1, left: 0, rising: false, hold: 0 };
  /** The possession under way: which wisps went in, and when they come out (s). */
  let held: { who: number[]; out: number } | null = null;
  let possessHue = 0;
  let possess = 0;

  const tokOf = (w: number) => w / 2 + RIM * (w / 32) ** 0.5;
  const unit = (tok: number) => 0.8 + 0.03 * tok;

  const shapes = [
    // The spirit light, the possession and the antlers.
    auraShape(ctx, (f, age, b) => {
      const tok = tokOf(b.w);
      const big = smooth((b.w - 32) / 48);
      const tall = stag.left > 0.001 ? tok * stag.size * 2.5 : 0;
      // (Wide enough that its light from behind, spread sideways, is gone before the quad fades.)
      f.hw = f.hh = (Math.max(tok * 2.9, tall) + 3) / 0.72;
      f.k = smooth(age / 1.2) * (0.78 + 0.22 * big);
      f.calm = !busy();
      f.q[0] = tok;
      f.q[1] = (0.85 + 0.5 * fervour) * (0.6 + 0.4 * vigor) * (1 - 0.5 * dim);
      f.q[2] = possess;
      f.q[3] = possessHue;
      f.q[4] = stag.grow;
      f.q[5] = stag.size;
      f.q[6] = stag.tines;
      f.q[7] = stag.left;
      f.q[9] = 0;
      f.q[10] = 0;
      f.q[11] = 0;
    }),
    // The wisps.
    ...wisps.map((w) =>
      auraShape(ctx, (f, age, b) => {
        const tok = tokOf(b.w);
        const big = smooth((b.w - 32) / 48);
        const cs = unit(tok);
        const bursting = w.burst < 2;
        if (w.here < 0.002 && !bursting) {
          f.hw = f.hh = 1;
          f.k = 0;
          return;
        }
        // (Its path, its glitter's drift, and a burst's ring round where it was.)
        const reach = tok * (2.5 * Math.max(w.far * w.home, 1) + 0.8) + (bursting ? 0.6 * tok + 4 * cs : 0);
        f.hw = f.hh = (reach + 10 * cs + 4) / 0.72;
        f.k = smooth(age / 1.2) * (0.78 + 0.22 * big);
        f.calm = !busy();
        f.q[0] = tok;
        f.q[1] = w.ph;
        f.q[2] = TRAIL[0] + (TRAIL[1] - TRAIL[0]) * fervour;
        f.q[3] = w.k;
        f.q[4] = w.hue;
        f.q[5] = w.far * w.home;
        f.q[6] = w.dive;
        f.q[7] = light(w);
        f.q[9] = bursting ? w.burst : -1;
        f.q[10] = w.here;
        f.q[11] = w.size;
      }),
    ),
  ];

  /** A wisp's light now: the streak warms it, a miss makes it gutter, the last lives lower it. */
  function light(w: Wisp): number {
    const flick = 0.5 + 0.25 * Math.sin(clock * 23 + w.i * 5) + 0.25 * Math.sin(clock * 37 + w.i * 2);
    return (1 + 0.3 * fervour) * (w.i === ROSE || vigor >= 1 ? 1 : vigor) * (1 - dim * (0.45 + 0.4 * flick));
  }
  const busy = () => !!held || stag.left > 0.001 || wisps.some((w) => w.burst < 2 || Math.abs(w.farV) > 0.3 || w.dive > 0.001);

  /** Where a wisp's head is on screen now. */
  const headAt = (w: Wisp) => {
    const tok = tokOf(drawn.w);
    const [x, y] = pathAt(w.ph, w.k, tok, w.far * w.home);
    return { x: drawn.x + x, y: drawn.y + y };
  };
  const dartNow = (w: Wisp) => {
    w.dart = 0;
    w.wait = rand(DART_GAP[0], DART_GAP[1]);
  };
  /** Wisps that are here and not gone in. */
  const out = () => wisps.filter((w) => w.wanted && w.here > 0.5 && w.burst >= 2);

  /** The antlers rise for a streak of `n` (6 or more: a win's). */
  const rise = (n: number, hold: number) => {
    stag.size = 0.82 + 0.08 * Math.min(n, 5) + (n >= 6 ? 0.08 : 0);
    stag.tines = Math.min(4, 1 + n);
    stag.rising = true;
    stag.hold = hold;
    if (stag.left < 0.05) stag.grow = 0;
    stag.left = 1;
  };
  /** Spirit dust lifting off the antlers as they dissolve. */
  const dust = () => {
    const tok = tokOf(drawn.w);
    const s = tok * stag.size;
    const sc = drawn.w / 32;
    const tips = [
      [1.6, -1.95],
      [1.2, -1.6],
      [1.95, -1.85],
      [0.75, -1.3],
    ];
    const n = budget(Math.round(4 + 3 * Math.min(stag.tines, 4)));
    for (let j = 0; j < n; j++) {
      const [tx, ty] = tips[j % tips.length];
      const side = j % 2 ? -1 : 1;
      particle({
        x: drawn.x + side * tx * s + rand(-2, 2) * sc,
        y: drawn.y + ty * s + rand(-2, 2) * sc,
        vx: side * rand(-4, 8) * sc,
        vy: -rand(8, 20) * sc,
        life: rand(0.9, 1.6),
        size: rand(0.7, 1.2) * Math.max(0.7, sc ** 0.5),
        sizeEnd: 0.3,
        color: SPIRIT,
        colorEnd: [0.2, 0.5, 0.8],
        drag: 1.2,
        shape: Shape.Glint,
        flicker: 0.5,
        fadeIn: 0.15,
        turbulence: 10 * sc,
        delay: rand(0, 0.35),
      });
    }
  };
  /** A wisp bursts: gone in a flash, its light scattering. */
  const burst = (w: Wisp, back: number) => {
    const at = headAt(w);
    const sc = drawn.w / 32;
    w.burst = 0;
    w.here = 0;
    w.back = back;
    const n = budget(8);
    const hue = HUES[w.hue];
    for (let j = 0; j < n; j++) {
      const a = (j / n) * Math.PI * 2 + rand(-0.3, 0.3);
      const v = rand(28, 55) * Math.max(0.6, sc ** 0.6);
      particle({
        x: at.x,
        y: at.y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: rand(0.5, 0.9),
        size: rand(0.8, 1.3) * Math.max(0.7, sc ** 0.5),
        sizeEnd: 0.3,
        color: [hue[0] * 1.2, hue[1] * 1.2, hue[2] * 1.2],
        colorEnd: [hue[0] * 0.3, hue[1] * 0.3, hue[2] * 0.3],
        drag: 3,
        shape: Shape.Glint,
        flicker: 0.6,
      });
    }
  };

  /** What's to happen later, on the aura's own clock: when (s) and what. */
  const later: { t: number; fn: () => void }[] = [];
  const after = (s: number, fn: () => void) => later.push({ t: clock + s, fn });
  /** They come back to their paths. */
  const settle = () => wisps.forEach((w) => (w.farTo = 1));

  const react = (e: AuraEvent) => {
    switch (e.kind) {
      case 'arrive':
        // They fly in from afar along their routes.
        for (const w of wisps) {
          if (!w.wanted) continue;
          w.far = 3;
          w.farV = 0;
          w.farTo = 1;
          w.here = 0;
          dartNow(w);
        }
        break;
      case 'vote': {
        // One darts in and grazes the token, then off again.
        const w = out()[0];
        if (!w || held) break;
        w.diveTo = 0.3;
        w.diveRate = 3;
        dartNow(w);
        after(0.26, () => (w.diveTo = 0));
        break;
      }
      case 'score':
      case 'win': {
        const won = e.kind === 'win';
        const n = won ? 6 : Math.max(1, e.streak);
        fervour = won ? 1 : Math.max(fervour, Math.min(n, 5) / 5);
        dim = 0;
        // From a streak of three, the vivid wisp joins (it flies in from afar).
        const gold = wisps[GOLD];
        if (fervour >= 0.55 && !gold.wanted) {
          gold.wanted = true;
          gold.far = 2.6;
          gold.farTo = 1;
          dartNow(gold);
        }
        // One goes in (each score the next in turn); on a win, all of them.
        const free = out();
        if (!free.length) break;
        // (A score's is one of the four great wisps, each colour by turns.)
        const great = free.filter((w) => w.size >= 0.8);
        const pick = great.length ? great : free;
        const who = won ? free : [pick[(n - 1) % pick.length]];
        who.forEach((w, j) => {
          w.diveTo = 1;
          w.diveRate = 2.2 - 0.3 * j;
          dartNow(w);
        });
        possessHue = who[0].hue;
        // (In by 0.45 s; the antlers grow over 0.75 s, hold, and the wisps come out as they dissolve.)
        const hold = won ? 5 : Math.min(1 + 0.3 * n, 2.6);
        held = { who: who.map((w) => w.i), out: 0.4 + 0.77 + hold };
        after(0.4, () => rise(n, hold));
        break;
      }
      case 'miss':
        // They shy off and gutter.
        fervour = 0;
        dim = 1;
        for (const w of out()) {
          w.farTo = 1.4;
          dartNow(w);
        }
        after(0.9, settle);
        break;
      case 'hurt': {
        // A wisp bursts and is gone for a while; the other gutters.
        fervour = 0;
        dim = 1;
        vigor = e.left <= 0 ? 0.55 : e.left === 1 ? 0.8 : 1;
        const free = out();
        const w = free.find((x) => x.i === ROSE) ?? free[free.length - 1];
        if (w) burst(w, e.left >= 2 ? 4 : e.left === 1 ? 7 : 14);
        for (const x of out()) {
          x.farTo = 1.3;
          dartNow(x);
        }
        after(1.1, settle);
        break;
      }
      case 'touch':
        // They flee the hand, then drift back.
        for (const w of out()) {
          w.farTo = 1.55;
          dartNow(w);
        }
        after(0.55, settle);
        break;
    }
  };

  return {
    react,
    step(dt, b) {
      const h = Math.min(dt, 0.05);
      clock += h;
      drawn = { x: b.x, y: b.y, w: b.w };
      fervour = Math.max(0, fervour - h / 25);
      dim *= Math.exp(-h / 1.3);
      if (fervour < 0.3 && wisps[GOLD].wanted && !held) wisps[GOLD].wanted = false;
      for (let j = later.length - 1; j >= 0; j--) {
        if (later[j].t <= clock) later.splice(j, 1)[0].fn();
      }

      // The possession: when its time is up, the wisps fly back out.
      if (held) {
        held.out -= h;
        if (held.out <= 0) {
          for (const i of held.who) {
            const w = wisps[i];
            w.diveTo = 0;
            w.diveRate = 1.5;
            dartNow(w);
          }
          held = null;
        }
      }
      // The antlers: grow root to tip, hold, then dissolve from the tips.
      if (stag.rising) {
        stag.grow = Math.min(1.15, stag.grow + h * 1.5);
        if (stag.grow >= 1.15) {
          stag.hold -= h;
          if (stag.hold <= 0) {
            stag.rising = false;
            dust();
          }
        }
      } else if (stag.left > 0) {
        stag.left = Math.max(0, stag.left - h / 0.9);
        if (stag.left <= 0) stag.grow = 0;
      }

      let pos = 0;
      for (const w of wisps) {
        // Here or not: it forms slowly, leaves gently.
        if (w.burst < 9) w.burst += h;
        if (w.back > 0) {
          w.back -= h;
          if (w.back <= 0) {
            // It forms again a little way out and drifts in.
            w.far = 1.8;
            w.farTo = 1;
            w.burst = 9;
          }
        }
        const target = w.wanted && w.back <= 0 && w.burst >= 2 ? 1 : 0;
        w.here += (target - w.here) * (1 - Math.exp(-h / (target ? 0.9 : 0.6)));
        if (w.burst < 2) w.here = 0;

        // Its pace: a slow drift, and now and then a dart.
        if (w.dart < 0) {
          w.wait -= h;
          if (w.wait <= 0) dartNow(w);
        }
        let rate = DRIFT;
        if (w.dart >= 0) {
          const x = w.dart / DART_TIME;
          rate += DART * Math.sin(Math.PI * x) ** 2;
          w.dart += h;
          if (w.dart >= DART_TIME) w.dart = -1;
        }
        // (Flung far out, it comes back quicker; a burst holds it where it was.)
        rate *= (1 + 0.6 * Math.max(0, w.far - 1)) * w.pace;
        if (w.burst < 1.2) rate = 0;
        w.ph += h * rate;

        // How far out: a soft spring.
        const kk = 4.5;
        w.farV += (kk * kk * (w.farTo - w.far) - 2 * 0.85 * kk * w.farV) * h;
        w.far += w.farV * h;
        // The dive: straight in at its rate (the shader eases it).
        const d = w.diveTo - w.dive;
        w.dive += Math.sign(d) * Math.min(Math.abs(d), h * w.diveRate);
        if (held?.who.includes(w.i) || w.dive > 0) pos = Math.max(pos, smooth((w.dive - 0.55) / 0.45));
      }
      possess += (pos - possess) * (1 - Math.exp(-h / 0.15));
    },
    stop() {
      for (const s of shapes) s.stop();
    },
  };
}
