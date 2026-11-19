// The divine aura (lib/auraKinds.ts): the Arbiter of Divinity's power, held
// in an Origin Core. The Core is the Origin Spark sealed in the Origin
// Cradle, a Precursor seed and egg made one; the token is that Cradle. The
// Spark's warm light lives in it and seeps out round it, and its charge
// builds until it breaks out sideways as the Arbiter's yellow divine
// lightning, then builds again. As it fills it crackles, and the crackle
// gathers at the side it will break out at. All its light is drawn in
// divine.glsl.ts: one shape for the Core and one for each bolt; here is when
// they strike.
//
// - arrive: a bolt strikes down into the Core from above and wakes it.
// - vote, touch: the Core discharges a short arc to one side.
// - score: the Rain of Divine Lightning: a bolt strikes down into the Core,
//   the Core blazes up as it lands, and its power breaks out sideways through
//   it. A streak brings more strikes, each on the last, and leaves the Core
//   charged and restless.
// - miss: the Core gutters; one weak arc fizzles out and it is quiet a while.
// - hurt: it sputters and its light falls, lower with each life lost.
// - win: strike after strike, the Core at full blaze, discharging all round.

import { auraShape, type AuraContext, type AuraEvent, type Burning } from './common';
import type { ShapeHandle } from '../core';

/** How far the token's own rim reaches past its face (Avatar.svelte), px. */
const RIM = 3;
/** Bolts that can burn at once. */
const SLOTS = 8;
/** How far a channel's glow reaches (px) at width w; as divine_reach in divine.glsl.ts. */
const reachOf = (w: number) => 5 * (2 * w + 0.5);

const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const ease = (x: number, to: number, rate: number, dt: number) => x + (to - x) * (1 - Math.exp(-dt * rate));
const rand = (a: number, b: number) => a + Math.random() * (b - a);
/** Roughly normal, -1..1 mostly. */
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 0.75;

/** A bolt: mode 1 from behind the token, 2 from its face, 3 a strike from above (see divine.glsl.ts). */
type Bolt = {
  mode: 1 | 2 | 3;
  age: number;
  str: number;
  ox: number;
  oy: number;
  ang: number;
  len: number;
  seed: number;
  /** How many flickers it lives, each a path held a few frames (1-6). */
  n: number;
  after: number;
  /** When it is out (s). */
  end: number;
};

/** Something that waits its moment (s). */
type Later = { in: number; run: () => void };

export function burn(ctx: AuraContext): Burning {
  /** The Core's slow phase. */
  let phase = Math.random() * 60;
  /** Its light at rest (lower as lives are lost) and its charge now. */
  let rest = 0.55;
  let charge = 0.45;
  /** The charge it breaks out at, chosen anew each time so no two waits match. */
  let breakAt = rand(0.75, 1.0);
  /** The side it will break out at next (-1 left, 1 right): its crackle gathers there. */
  let nextSide = Math.random() < 0.5 ? -1 : 1;
  /** A strike's blast as it lands. */
  let blast = 0;
  /** How fast it charges (per s); quicker while a streak keeps it restless. */
  let restless = 0;
  let quiet = 0;
  let flash = 0;
  let flashX = 1;
  let flashY = 0;
  let chill = 0;
  let sputter = 0;
  let later: Later[] = [];
  let box = { w: 32 };
  const bolts: (Bolt | null)[] = new Array(SLOTS).fill(null);

  const after = (s: number, run: () => void) => later.push({ in: s, run });

  /** A bolt into a free slot, or over the one nearest its end. */
  const put = (b: Omit<Bolt, 'age' | 'end' | 'seed'>) => {
    let at = bolts.findIndex((x) => !x);
    if (at < 0) {
      at = 0;
      for (let i = 1; i < SLOTS; i++) if (bolts[i]!.end - bolts[i]!.age < bolts[at]!.end - bolts[at]!.age) at = i;
    }
    // Its flickers take up to about 0.11 s each; its glow is out by after * 4.
    const end = 0.11 * b.n + b.after * 4 + 0.08;
    bolts[at] = { ...b, age: 0, end, seed: rand(1, 97) };
  };

  /** The Core lets go: an arc out to one side (side -1 left, 1 right). */
  const discharge = (o: { side?: number; str?: number; long?: number; n?: number } = {}) => {
    const side = o.side ?? (Math.random() < 0.5 ? -1 : 1);
    const long = o.long ?? (Math.random() < 0.3 ? 1 : 0);
    // Mostly level, sometimes steeply off; a little more often upward than down.
    const ang = (side > 0 ? 0 : Math.PI) + side * (gauss() * 0.38 - 0.06);
    const front = Math.random() < 0.35;
    const from = ang + rand(-0.5, 0.5);
    const r0 = front ? rand(0.55, 0.8) : rand(0.15, 0.55);
    const len = (long ? rand(1.5, 2.2) : rand(0.85, 1.35)) + (front ? 0 : 0.5 - r0 * 0.6);
    put({
      mode: front ? 2 : 1,
      str: (o.str ?? 1) * rand(0.8, 1.05),
      ox: Math.cos(from) * r0,
      oy: Math.sin(from) * r0,
      ang,
      len,
      n: o.n ?? 2 + Math.floor(Math.random() * 3),
      after: rand(0.14, 0.22) * (long ? 1.25 : 1),
    });
    lit(Math.cos(ang), Math.sin(ang), 0.3 * (o.str ?? 1));
  };

  /** A strike from above, down into the Core; on landing its power breaks out sideways. */
  const strike = (str: number, out: number) => {
    const x = rand(0.5, 1.8) * (Math.random() < 0.5 ? -1 : 1);
    const ox = x;
    const oy = -rand(3.0, 3.6);
    // It lands just behind the top of the token.
    const ex = rand(-0.25, 0.25);
    const ey = -0.72;
    const ang = Math.atan2(ey - oy, ex - ox);
    // Its leader steps down, then the return stroke and two to four restrikes
    // come down the same path, and the channel lingers.
    put({ mode: 3, str, ox, oy, ang, len: Math.hypot(ex - ox, ey - oy), n: 4 + Math.floor(Math.random() * 2.9), after: rand(0.22, 0.3) });
    after(0.06, () => {
      lit(ex * 0.5, -1, 0.8 * str);
      blast = Math.max(blast, 1.1 * str);
      charge = Math.max(charge, rest + 0.5 * str);
      for (let i = 0; i < out; i++) after(rand(0.02, 0.14) + i * rand(0.06, 0.16), () => discharge({ side: i % 2 ? -Math.sign(x) : Math.sign(x), str: 0.9 + 0.1 * str, long: 1 }));
    });
  };

  const lit = (x: number, y: number, k: number) => {
    const l = Math.hypot(x, y) || 1;
    flashX = x / l;
    flashY = y / l;
    flash = Math.max(flash, k);
  };

  const shapes: ShapeHandle[] = [];
  const tokOf = (w: number) => w / 2 + RIM * (w / 32) ** 0.5;
  shapes.push(
    auraShape(ctx, (f, age, b) => {
      const tok = tokOf(b.w);
      f.hw = 3.3 * tok;
      f.hh = 2.3 * tok;
      f.k = 1;
      f.calm = flash < 0.02 && sputter < 0.02 && blast < 0.02 && !bolts.some((x) => x);
      f.q[0] = tok;
      f.q[1] = 0;
      f.q[2] = charge;
      f.q[3] = flash;
      f.q[4] = flashX;
      f.q[5] = flashY;
      f.q[6] = chill;
      f.q[7] = phase;
      f.q[9] = sputter;
      // It crackles more the fuller it is (never while it is quiet), signed
      // by the side it will break out at.
      const full = clamp((charge / breakAt - 0.35) / 0.65);
      f.q[10] = (quiet > 0 ? 0 : clamp(0.15 + 0.85 * full * full + 0.35 * restless)) * nextSide;
      f.q[11] = blast;
    }),
  );
  for (let i = 0; i < SLOTS; i++) {
    shapes.push(
      auraShape(ctx, (f, _age, b) => {
        const bolt = bolts[i];
        const tok = tokOf(b.w);
        f.q[0] = tok;
        if (!bolt) {
          // (Out: a pixel's quad, dark.)
          f.hw = f.hh = 0.5;
          f.k = 0;
          f.q[1] = 1;
          return;
        }
        // The quad holds the bolt and its forks, with room for its glow inside the round fade.
        const ex = bolt.ox + Math.cos(bolt.ang) * bolt.len;
        const ey = bolt.oy + Math.sin(bolt.ang) * bolt.len;
        const w = Math.sqrt(tok / 19) * (bolt.mode === 3 ? 1.35 : 1) * Math.sqrt(bolt.str);
        const pad = 0.38 * bolt.len + reachOf(w) / tok + 0.1;
        f.hw = ((Math.max(Math.abs(bolt.ox), Math.abs(ex)) + pad) * tok * 1.3) / 0.72;
        f.hh = ((Math.max(Math.abs(bolt.oy), Math.abs(ey)) + pad) * tok * 1.3) / 0.72;
        f.k = 1;
        f.calm = false;
        f.q[1] = bolt.mode;
        f.q[2] = bolt.age;
        f.q[3] = bolt.str;
        f.q[4] = bolt.ox;
        f.q[5] = bolt.oy;
        f.q[6] = bolt.ang;
        f.q[7] = bolt.len;
        f.q[9] = bolt.seed;
        f.q[10] = bolt.n;
        f.q[11] = bolt.after;
      }),
    );
  }

  const react = (e: AuraEvent) => {
    switch (e.kind) {
      case 'arrive':
        charge = 0.05;
        quiet = 0.5;
        later = [];
        after(0.35, () => strike(1, 1));
        break;
      case 'vote':
      case 'touch':
        if (quiet > 0) {
          flash = Math.max(flash, 0.25);
          break;
        }
        discharge({ str: 0.85, long: e.kind === 'vote' ? 1 : 0, n: 2 });
        charge = Math.max(rest * 0.6, charge - 0.3);
        break;
      case 'score': {
        const s = clamp(e.streak, 1, 4);
        quiet = 0;
        chill = 0;
        sputter = 0;
        for (let i = 0; i < s; i++) after(i * rand(0.26, 0.38), () => strike(0.9 + 0.12 * s, i === s - 1 ? 1 + Math.min(2, s - 1) : 1));
        restless = Math.max(restless, 0.4 + 0.3 * s);
        break;
      }
      case 'miss':
        chill = Math.max(chill, 0.75);
        sputter = Math.max(sputter, 0.7);
        charge = rest * 0.35;
        quiet = 2.2;
        restless = 0;
        // One weak arc that never reaches: short, dim, cooling at once.
        put({ mode: 1, str: 0.45, ox: rand(-0.3, 0.3), oy: 0.2, ang: Math.random() < 0.5 ? 2.7 : 0.45, len: 0.95, n: 1, after: 0.16 });
        break;
      case 'hurt':
        chill = 1;
        sputter = 1;
        restless = 0;
        rest = e.left <= 0 ? 0.18 : e.left === 1 ? 0.32 : Math.min(rest, 0.44);
        charge = rest * 0.3;
        quiet = 2.8;
        break;
      case 'win':
        rest = 0.55;
        quiet = 0;
        chill = 0;
        sputter = 0;
        later = [];
        restless = 2;
        for (let i = 0; i < 5; i++) after(i * rand(0.32, 0.5), () => strike(1.35, 2));
        break;
    }
  };

  return {
    react,
    step(dt, b) {
      box = b;
      for (const l of later) l.in -= dt;
      const due = later.filter((l) => l.in <= 0);
      later = later.filter((l) => l.in > 0);
      for (const l of due) l.run();

      for (let i = 0; i < SLOTS; i++) {
        const bolt = bolts[i];
        if (!bolt) continue;
        bolt.age += dt;
        if (bolt.age > bolt.end) bolts[i] = null;
      }

      phase += dt * (0.5 + 0.4 * restless);
      flash *= Math.exp(-dt * 7);
      blast *= Math.exp(-dt * 4.5);
      chill *= Math.exp(-dt * 0.8);
      sputter *= Math.exp(-dt * 1.1);
      restless = Math.max(0, restless - dt * 0.12);
      quiet = Math.max(0, quiet - dt);

      // The Core charges, slowly at rest and unevenly (it gathers in fits),
      // faster while restless; a small token in a list charges slower, so a
      // row of them stays calm. At its break point it lets go.
      const small = clamp((32 - box.w) / 14);
      const fit = 0.5 + Math.random();
      const rate = (0.32 + 0.35 * restless) * (1 - 0.2 * small) * fit;
      if (quiet > 0) charge = ease(charge, rest * 0.5, 0.8, dt);
      else charge += dt * rate * (1.2 * rest + 0.1 - 0.6 * Math.max(0, charge - breakAt));
      charge = Math.max(charge, 0);
      if (quiet <= 0 && charge >= breakAt) {
        const lo = rest * rand(0.45, 0.75);
        const strong = clamp((breakAt - 0.6) / 0.8);
        const side = nextSide;
        discharge({ side, str: 1.05 + 0.35 * strong + 0.15 * restless, long: Math.random() < 0.45 ? 1 : 0 });
        // Now and then it lets go twice, the second to the other side.
        if (Math.random() < 0.18 + 0.3 * Math.min(1, restless)) after(rand(0.08, 0.3), () => discharge({ side: -side, str: 0.7 + 0.1 * restless }));
        charge = lo;
        breakAt = rest * rand(1.25, 1.85) + 0.25 * Math.min(1, restless);
        // Mostly to the other side next, but never a steady back and forth.
        nextSide = Math.random() < 0.62 ? -side : side;
      }
    },
    stop() {
      for (const s of shapes) s.stop();
    },
  };
}
