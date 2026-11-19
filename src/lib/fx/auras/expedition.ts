// The expedition aura (lib/auraKinds.ts): the token as a Remnant awake, as in
// the Runes of Aldur. Cold spirit-light streams out from it all round, in a
// field of thin wisps lying about its waist (the far half behind it, the
// near half across the foot of its face), a few rising off its crown; and
// the Remnant's runes, in the game's own script and its electric sky blue,
// are written in the air round it one by one, each in a place of its own:
// beside it, low in front, behind it (the token hides them). Each is cut stroke by stroke along a thread of light from the
// token, hangs and turns a little, rises, and breaks up into motes, to be
// written again elsewhere. Its light is `aura_expedition` (expedition.glsl.ts);
// here are its clocks and how it answers the player's moments.
//
// It answers by writing:
// - arrive: the wisps well up from nothing and the runes are written out;
// - vote: a small rune is written over the crown and taken into the token;
// - touch: the runes flare and the wisps stir;
// - score: a large rune is written over the crown and flares as its last
//   stroke is cut, throwing motes out to the sides; it sinks into the
//   Remnant behind its crown, and the light round its waist surges out
//   sideways. A streak wakes
//   more runes round the token (up to five), raises the wisps and makes the
//   rune larger; from four in a row it is one of the rare runes, in lilac;
// - miss: the pen falters: every rune is struck out stroke by stroke and the
//   wisps gutter and shrink, then the runes are written again;
// - hurt: the Remnant is jolted: its runes are struck out and fall, the
//   wisps all but go out, and it comes back the dimmer the fewer lives are
//   left;
// - win: the Remnant wakes whole: all five runes, the rare lilac among them,
//   the wisps at their tallest, and the largest rune written over it.

import { budget, particle, type ShapeHandle } from '../core';
import { Shape } from '../particles';
import { auraShape, type AuraContext, type AuraEvent, type Burning } from './common';

/** How many runes stand round it at most (the shader's loop). */
const MOST = 5;
/** The rune script's glyphs (the shader's eight). */
const GLYPHS = 8;
/** How long one rune lives (the shader's T), s. */
const LIFE = 8.5;

const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const smooth = (t: number) => {
  const u = clamp(t);
  return u * u * (3 - 2 * u);
};
/** Eases x toward y with a time constant of tau seconds. */
const ease = (x: number, y: number, dt: number, tau: number) => x + (y - x) * (1 - Math.exp(-dt / tau));
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

/** An inscription over the crown: its shape, age, pen time and power; `lit` once its last stroke is cut. */
type Writ = { shape: ShapeHandle; age: number; pen: number; power: number; size: number; lilac: number; glyph: number; lit: boolean; sunk: boolean; done: boolean };

/** The runes' near-white core and the lilac of the rare ones (HDR). */
const CORE: [number, number, number] = [1.7, 2.45, 2.95];
const LILAC: [number, number, number] = [1.55, 0.8, 2.6];

export function burn(ctx: AuraContext): Burning {
  let age = 0;
  // The wisps' flow (token radii risen) and the runes' clock, each token its own.
  let flow = Math.random() * 40;
  let clock = Math.random() * LIFE * 4;
  // How many runes are awake (shown, and wanted), and the streak.
  let awake = 2;
  let streak = 0;
  // The surge of the wisps (score, win), how low they cower (miss, hurt) and how far up they've welled (arrive).
  let surge = 0;
  let cower = 0;
  let welled = 1;
  // How dim it is (0 lit to 1 dark), the floor it comes back to (lives lost), and its guttering.
  let dim = 0;
  let floor = 0;
  let gutter = 0;
  // The runes struck out (0-1), held struck for `strike` s; their heat; how far they've fallen.
  let unwrite = 0;
  let strike = 0;
  let heat = 0;
  let fall = 0;
  // The rare runes' lilac.
  let lilac = 0;
  let lilacHold = 0;
  // A jolt: the token's shift (px) on a spring.
  let jx = 0;
  let jy = 0;
  let jvx = 0;
  let jvy = 0;
  // Kept from the last frame, for the writs and the motes.
  let R = 16;
  let at = { x: 0, y: 0 };
  let small = false;
  const writs: Writ[] = [];

  const wisps = auraShape(ctx, (f, a, b) => {
    R = b.w / 2;
    at = { x: b.x, y: b.y };
    small = b.w < 28;
    // (At rest the crown's wisps stay low, clear of the token above in a list; only a surge, brief, carries them high.)
    const H = R * (0.45 + 0.04 * Math.min(streak, 5) + 0.6 * surge) * smooth(welled) * (1 - 0.65 * cower);
    // (A surge throws the light round its waist out sideways, for a moment.)
    f.hw = (R * (2.7 + 1.1 * Math.min(surge, 1.5))) / 0.72;
    f.hh = Math.max(R * 2.7, R * 1.45 + H) / 0.72;
    f.k = Math.min(1, a / 0.6);
    f.q[0] = 0;
    f.q[1] = R;
    f.q[2] = H;
    f.q[3] = gutter;
    f.q[4] = flow;
    f.q[5] = dim;
    f.q[6] = lilac * 0.5;
    f.q[7] = surge;
    f.q[9] = jx;
    f.q[10] = jy;
    f.q[11] = 0;
    f.calm = Math.abs(jvx) + Math.abs(jvy) < 20 && surge < 0.3;
  });

  const runes = auraShape(ctx, (f, a, b) => {
    const r = b.w / 2;
    const S = Math.max(r * 0.34, 4.6) * 1.35;
    const reach = r * 1.6 + S * 3.4 + 4;
    f.hw = reach / 0.72;
    f.hh = (reach + r * 0.6) / 0.72;
    f.k = Math.min(1, a / 0.6) * (1 - 0.75 * dim);
    f.q[0] = 1;
    f.q[1] = r;
    f.q[2] = awake;
    f.q[3] = gutter;
    f.q[4] = clock;
    f.q[5] = unwrite;
    f.q[6] = heat;
    f.q[7] = fall;
    f.q[9] = jx;
    f.q[10] = jy;
    f.q[11] = lilac;
    f.calm = Math.abs(jvx) + Math.abs(jvy) < 20;
  });

  /** Writes a rune over the crown: `size` in token radii, the pen taking `pen` s, `power` 0-1+, `rare` for the lilac. */
  function write(size: number, pen: number, power: number, rare: boolean) {
    // No more than two at once: the oldest goes.
    if (writs.length >= 2) {
      const old = writs.shift()!;
      old.shape.stop(0.3);
    }
    const w: Writ = {
      shape: null as unknown as ShapeHandle,
      age: 0,
      pen,
      power,
      size,
      lilac: rare ? 1 : 0,
      glyph: Math.floor(Math.random() * GLYPHS),
      lit: false,
      sunk: false,
      done: false,
    };
    w.shape = auraShape(
      ctx,
      (f, _a, b) => {
        const r = b.w / 2;
        // On a small token the rune is a little larger for its size, or its strokes run together.
        const S = Math.max(r * w.size, 5.5 * w.size / 0.5);
        const stand = r + S * 1.1;
        f.hw = (S * 3.4 + 4) / 0.72;
        f.hh = (stand + S * 3.4 + 4) / 0.72;
        f.k = 1;
        f.q[0] = 2;
        f.q[1] = r;
        f.q[2] = S;
        f.q[3] = w.glyph;
        f.q[4] = w.age;
        f.q[5] = w.pen;
        f.q[6] = w.lilac;
        f.q[7] = w.power;
        f.q[9] = jx;
        f.q[10] = jy;
        f.q[11] = stand;
      },
      // The pen runs over it in under half a second: too fast for 30 fps.
      { calm: false },
    );
    writs.push(w);
  }

  /** Its last stroke cut: it flares, and motes fly off it, out to the sides. */
  function cut(w: Writ) {
    heat = Math.max(heat, 0.35 + 0.4 * w.power);
    const sc = R / 16;
    const S = Math.max(R * w.size, (5.5 * w.size) / 0.5);
    const cy = at.y + jy - R - S * 1.1;
    const n = budget(Math.round(3 + 5 * w.power));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * S * 0.9;
      const side = Math.cos(a) < 0 ? -1 : 1;
      particle({
        x: at.x + jx + Math.cos(a) * d,
        y: cy + Math.sin(a) * d,
        vx: side * rand(12, 30) * sc,
        vy: -rand(2, 9) * sc,
        life: rand(0.8, 1.5),
        size: rand(0.6, 1.0) * Math.max(0.7, sc ** 0.5),
        sizeEnd: 0.25,
        color: w.lilac ? LILAC : CORE,
        colorEnd: w.lilac ? [0.4, 0.15, 0.7] : [0.12, 0.35, 0.95],
        drag: 1.4,
        shape: Shape.Glow,
        fadeIn: 0.1,
        turbulence: 8 * sc,
        delay: rand(0, 0.25),
      });
    }
  }

  /** The token jolted: a kick to its spring. */
  function jolt(k: number) {
    jvy += k;
    jvx += (Math.random() - 0.5) * k * 0.7;
  }

  /** How many runes stand round it for this streak. */
  const want = () => Math.min(MOST, (small ? 1.6 : 2) + Math.min(streak, 3));

  function react(e: AuraEvent) {
    switch (e.kind) {
      case 'arrive':
        welled = 0;
        dim = 0;
        floor = 0;
        // Every rune struck, to be written out as it wells up.
        unwrite = 1;
        strike = 0.5;
        break;
      case 'vote':
        write(0.42, 0.42, 0.2, false);
        heat = Math.max(heat, 0.3);
        break;
      case 'touch':
        heat = Math.max(heat, 0.7);
        surge = Math.max(surge, 0.3);
        break;
      case 'score': {
        streak = e.streak;
        const n = Math.min(streak, 6);
        const rare = streak >= 4;
        if (rare) {
          lilac = Math.max(lilac, 1);
          lilacHold = 6;
        }
        write(0.5 + 0.04 * n, 0.5 - 0.02 * n, 0.4 + 0.12 * n, rare);
        dim = Math.min(dim, floor + 0.1);
        cower = 0;
        break;
      }
      case 'miss':
        streak = 0;
        strike = 1.2;
        gutter = 1;
        cower = Math.max(cower, 0.7);
        surge = 0;
        heat = 0;
        dim = Math.max(dim, 0.45);
        jolt(R * 1.2);
        break;
      case 'hurt':
        streak = 0;
        strike = 2;
        gutter = 1;
        cower = 1;
        surge = 0;
        heat = 0;
        fall = 1;
        dim = Math.max(dim, 0.85);
        floor = clamp((3 - e.left) / 3) * 0.4;
        jolt(R * 4);
        break;
      case 'win':
        streak = Math.max(streak, 6);
        lilac = 1;
        lilacHold = 12;
        dim = 0;
        floor = 0;
        cower = 0;
        fall = 0;
        surge = Math.max(surge, 0.6);
        write(0.78, 0.6, 1.4, true);
        break;
    }
  }

  return {
    react,
    step(dt) {
      age += dt;
      // The wisps rise faster as they surge, slower as they cower.
      flow += dt * (0.4 + 0.9 * surge) * (1 - 0.6 * cower);
      // The runes keep their time, slowed while the Remnant reels.
      clock += dt * (1 - 0.5 * cower);
      const target = want();
      awake = ease(awake, target, dt, awake < target ? 0.6 : 1.2);
      // A strike holds, then the runes are written again.
      if (strike > 0) {
        strike -= dt;
        unwrite = ease(unwrite, 1, dt, 0.18);
      } else {
        unwrite = ease(unwrite, 0, dt, 0.7);
        if (unwrite < 0.002) unwrite = 0;
      }
      surge = ease(surge, 0, dt, 1.4);
      cower = ease(cower, 0, dt, strike > 0 ? 9 : 1.3);
      welled = Math.min(1, welled + dt / 1.4);
      dim = Math.max(floor, ease(dim, floor, dt, 1.1));
      gutter = ease(gutter, 0, dt, 0.8);
      heat = ease(heat, 0, dt, 0.7);
      fall = ease(fall, 0, dt, strike > 0 ? 9 : 1.2);
      if (lilacHold > 0) lilacHold -= dt;
      else lilac = ease(lilac, 0, dt, 2.5);
      // The jolt's spring: a little under critical, so it swings back once and settles.
      const w = 2 * Math.PI * 2.2;
      jvx += (-w * w * jx - 2 * 0.35 * w * jvx) * dt;
      jvy += (-w * w * jy - 2 * 0.35 * w * jvy) * dt;
      jx += jvx * dt;
      jy += jvy * dt;
      for (const wr of writs) {
        wr.age += dt;
        if (!wr.lit && wr.age >= wr.pen) {
          wr.lit = true;
          cut(wr);
        }
        // Taken into the Remnant: the light round its waist surges out.
        if (!wr.sunk && wr.age >= wr.pen + 0.7) {
          wr.sunk = true;
          surge = Math.max(surge, 0.35 + 0.55 * wr.power);
        }
        if (!wr.done && wr.age > wr.pen + 2.2) {
          wr.done = true;
          wr.shape.stop(0.2);
        }
      }
      for (let i = writs.length - 1; i >= 0; i--) if (writs[i].done) writs.splice(i, 1);
    },
    stop() {
      wisps.stop();
      runes.stop();
      for (const wr of writs) wr.shape.stop();
      writs.length = 0;
    },
  };
}
