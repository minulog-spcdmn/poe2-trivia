// The tower aura (lib/auraKinds.ts): a Precursor engine, as their works
// stand in the world. The Origin Tower's crown and its Reactor are tiers of
// heavy bronze rings, each broken into segments, turning in steps about a
// core; their beacons and leylines throw out amber light. Here the token is
// the core, and three such tiers turn round it, stacked one over another and
// seen from a little above: the far side of each passes behind the token, the
// near side crosses before it. The core's light seeps out from behind the
// token, catches the bronze where it faces the core and pours out through the
// gaps between the segments. The tiers are worked like a lock, a step at a
// time, each its own way, in no fixed order or rhythm; current runs round
// each on its own pace, leaping the gaps, and a gap's light reaches out for a
// moment as current or a turn goes through it. What stays put stays close:
// the tiers hug the token, and only that passing light reaches far, out to
// the sides. The light is the shader's (tower.glsl.ts): the engine and the
// reveal.
//
// It answers what happens to its player as a Precursor engine would:
// - arrive: the tiers rise up round the core into their places and its light
//   wakes.
// - vote: every tier turns a step at once.
// - touch: one tier spins round quickly.
// - score: the tiers spin and stop with their gaps lined up, and the core's
//   light pours out through them all; a ring of light runs out over the land
//   from it: a tower's reveal. A streak charges it: from three in a row the
//   beacon's shaft of light stands up from the core, from five a second ring
//   follows. It ebbs slowly, and a miss or a lost life ends it.
// - miss: a jam. The tiers judder back, the light gutters and the
//   Precursors' lightning crackles across the gaps; the beat stalls.
// - hurt: a worse jam, and a tier sags and tips for good, the top one first;
//   with no life left all three hang tipped and the core only smoulders.
// - win: fully charged, the gaps lined up a long while, three rings and the
//   beacon's shaft.

import type { AuraContext, AuraEvent, Burning } from './common';
import { auraShape } from './common';

const TAU = Math.PI * 2;
/** Each tier's segments: the lowest, the middle, the top (as the shader has them). */
const SEGS = [5, 4, 3];
/** Seconds between one tier's step and the next's, at rest and fully charged. */
const BEAT = 1.7;
const BEAT_HOT = 1.1;
/** Seconds a step takes. */
const STEP = 0.7;

const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const smooth = (x: number) => x * x * (3 - 2 * x);
/** How far a token `w` px across is from small (32 px and under: 0) to large (64 and up: 1). */
const grown = (w: number) => smooth(clamp((w - 32) / 32));
/** A heavy step: slow to start, quick through, settling with a slight overshoot. */
const heavy = (x: number) => {
  const c = 0.9;
  const y = x - 1;
  const e = 1 + (c + 1) * y * y * y + c * y * y;
  return x < 0.35 ? e * smooth(x / 0.35) : e;
};

export function burn(ctx: AuraContext): Burning {
  const seed = Math.random();
  // Each tier: where it rests, the turn under way (from, to, its time, its length).
  const tiers = SEGS.map((n, i) => {
    const a = Math.random() * TAU;
    // (m: how fast it turns now, 0-1, for the light its gaps throw out.)
    return { n, a, from: a, to: a, t: 1, dur: STEP, dir: (i % 2 === 0) === seed < 0.5 ? 1 : -1, m: 0 };
  });
  /** Tier i's turn (rad, plus `extra`) and its speed, as one number for the shader (tower_unpack). */
  const pack = (i: number, extra: number) => {
    const t = tiers[i];
    const a = (((t.a + extra) % TAU) + TAU) % TAU;
    return a + 8 * Math.round(clamp(t.m) * 20);
  };
  // The beat: which tier steps next, and the time to it.
  let next = 2;
  let beatIn = Math.random() * BEAT;
  let stall = 0;
  // A jolt (a jam): its size and age.
  let jolt = 0;
  let joltAge = 9;
  let heat = 0;
  let heatTo = 0;
  // The gaps lined up (0-1) and how long they hold.
  let align = 0;
  let alignHold = 0;
  let life = 1;
  let lost = 0;
  let woke = 0.7;
  let stutter = 0;
  // The reveal's rings and the beacon's shaft: their ages (s; below 0, still to come).
  const rings = [9, 9, 9];
  let beam = 9;
  const lean = (seed - 0.5) * 0.16;

  const turn = (i: number, by: number, dur: number) => {
    const t = tiers[i];
    t.from = t.a;
    t.to = (t.t < 1 ? t.to : t.a) + by;
    t.t = 0;
    t.dur = dur;
  };
  /** One segment's step of tier i, its own way. */
  const stepOf = (i: number) => (tiers[i].dir * TAU) / tiers[i].n;
  /** Turns every tier so that a gap of each faces the same way, `spins` turns round first. */
  const lineUp = (spins: number, dur: number) => {
    const goal = Math.PI * 0.5 + seed;
    tiers.forEach((t, i) => {
      const cell = TAU / t.n;
      const base = t.t < 1 ? t.to : t.a;
      // (The nearest place, on its own way round, where a gap faces the goal.)
      let to = goal + Math.round((base - goal) / cell) * cell;
      to += t.dir * TAU * (spins + i * 0.25);
      turn(i, to - base, dur * (1 + 0.15 * i));
    });
  };
  const ring = (after: number) => {
    // (Into the slot of the oldest ring.)
    let k = 0;
    for (let i = 1; i < 3; i++) if (rings[i] > rings[k]) k = i;
    rings[k] = -after;
  };
  const busy = () => tiers.some((t) => t.t < 1 && t.dur < 1.2) || stutter > 0.05 || joltAge < 1 || woke < 0.98 || rings.some((a) => a < 1.8) || beam < 1.8;

  // The engine: the core's light and the tiers.
  const engine = auraShape(ctx, (f, _age, b) => {
    const R = b.w / 2;
    const tok = R + 3 * Math.sqrt(Math.max(R, 1) / 16);
    // (The lowest tier stands 1.3 of the token out; its gaps' light reaches
    // past that for a moment, out along the tiers, so mostly to the sides.)
    f.hw = (1.45 * tok + 1.5 * R + 4) / 0.72;
    f.hh = (Math.max(tok * 1.6, 1.15 * tok + 0.65 * R) + 4) / 0.72;
    f.k = 0.75 + 0.25 * grown(b.w);
    f.calm = grown(b.w) === 0 || !busy();
    const shake = jolt * Math.sin(joltAge * 28) * Math.exp(-joltAge * 5);
    f.q[0] = 0;
    f.q[1] = R;
    f.q[2] = pack(0, shake);
    f.q[3] = pack(1, -shake * 1.3);
    f.q[4] = pack(2, shake * 0.8);
    f.q[5] = heat;
    f.q[6] = life;
    f.q[7] = stutter;
    f.q[9] = woke;
    f.q[10] = align;
    f.q[11] = lost;
  });
  // The reveal: drawn only while a ring runs or the beacon's shaft stands.
  const reveal = auraShape(ctx, (f, _age, b) => {
    const R = b.w / 2;
    const tok = R + 3 * Math.sqrt(Math.max(R, 1) / 16);
    const ringOn = rings.some((a) => a > -0.05 && a < 1.85);
    const beamOn = beam > -0.05 && beam < 1.85;
    if (!ringOn && !beamOn) {
      f.hw = f.hh = 1;
      f.k = 0;
      return;
    }
    const w = (0.45 + 0.04 * R) * 1.7;
    f.hw = (3 * R + 3 * w + 4) / 0.72;
    f.hh = Math.max(0.55 * R + 1.2 * R + 3 * w, beamOn ? tok + (4.4 + 0.8 * heat) * R : 0) / 0.72 + 4;
    f.k = 0.75 + 0.25 * grown(b.w);
    f.calm = false;
    f.q[0] = 1;
    f.q[1] = R;
    f.q[2] = rings[0];
    f.q[3] = rings[1];
    f.q[4] = rings[2];
    f.q[5] = beam;
    f.q[6] = heat;
    f.q[7] = lean;
    f.q[9] = 0;
    f.q[10] = 0;
    f.q[11] = 0;
  });

  return {
    step(dt) {
      joltAge += dt;
      for (let i = 0; i < 3; i++) rings[i] += dt;
      beam += dt;
      woke = Math.min(1, woke + dt / 1.6);
      // The charge eases toward the streak's and ebbs over a minute and a quarter.
      heatTo = Math.max(0, heatTo - dt / 75);
      heat += (heatTo - heat) * (1 - Math.exp(-dt / 0.6));
      if (alignHold > 0) {
        alignHold -= dt;
        // (Lit as the tiers come to rest lined up.)
        const settling = tiers.some((t) => t.t < 0.85);
        if (!settling) align += (1 - align) * (1 - Math.exp(-dt * 6));
      } else align *= Math.exp(-dt * 1.5);

      // The beat: the tiers are worked one after another, never quite the
      // same way twice: mostly one tier a step, now and then two together,
      // a long turn of two steps, or a tier eased back a little to seat it;
      // the pauses between uneven. Unless stalled or lined up.
      if (stall > 0) stall -= dt;
      else if (alignHold <= 0) {
        beatIn -= dt;
        if (beatIn <= 0) {
          beatIn += (BEAT + (BEAT_HOT - BEAT) * heat) * (0.55 + 0.9 * Math.random());
          const slow = STEP * (1 - 0.25 * heat) * (life < 1 ? 1.4 : 1);
          const roll = Math.random();
          if (roll < 0.18) {
            // Two tiers at once, each its own way.
            const other = (next + 1 + Math.floor(Math.random() * 2)) % 3;
            turn(next, stepOf(next), slow);
            turn(other, stepOf(other), slow * 1.15);
          } else if (roll < 0.32) turn(next, 2 * stepOf(next), slow * 1.7);
          else if (roll < 0.42) turn(next, -0.3 * stepOf(next), slow * 0.6);
          else turn(next, stepOf(next), slow);
          // (The next is any but this one: top, middle and bottom in no fixed order.)
          next = (next + 1 + Math.floor(Math.random() * 2)) % 3;
        }
      }
      for (const t of tiers) {
        const before = t.a;
        if (t.t < 1) {
          t.t = Math.min(1, t.t + dt / t.dur);
          t.a = t.from + (t.to - t.from) * heavy(t.t);
          if (t.t >= 1) t.a = t.to = t.to % TAU;
        }
        // (Its speed, eased, from what it turned this frame; a wrap counts as none.)
        const v = dt > 0 && t.t < 1 ? Math.abs(t.a - before) / dt : 0;
        t.m += (clamp(v / 2.2) - t.m) * (1 - Math.exp(-dt * 10));
      }
      stutter = Math.max(0, stutter - dt / 1.2);
    },
    react(e: AuraEvent) {
      switch (e.kind) {
        case 'arrive':
          woke = 0;
          stutter = 0;
          stall = 1.2;
          break;
        case 'vote':
          for (let i = 0; i < 3; i++) turn(i, stepOf(i), 0.55);
          break;
        case 'touch': {
          const i = Math.floor(Math.random() * 3);
          turn(i, stepOf(i) * tiers[i].n * 0.5, 0.9);
          break;
        }
        case 'score': {
          const n = Math.min(Math.max(e.streak, 1), 6);
          heatTo = Math.max(heatTo, (n - 1) / 5);
          heat = Math.max(heat, heatTo * 0.6);
          stutter = 0;
          lineUp(n >= 3 ? 1 : 0, 0.9);
          alignHold = 1.6 + 0.2 * n;
          ring(0.85);
          if (n >= 3) beam = 0.75;
          if (n >= 5) ring(1.4);
          break;
        }
        case 'miss':
          stutter = 1;
          stall = Math.max(stall, 1.2);
          jolt = 0.12;
          joltAge = 0;
          for (let i = 0; i < 3; i++) turn(i, -stepOf(i) * 0.18, 0.2);
          alignHold = 0;
          heatTo = 0;
          heat *= 0.5;
          break;
        case 'hurt': {
          stutter = 1;
          stall = Math.max(stall, e.left <= 0 ? 3 : 1.8);
          jolt = 0.22;
          joltAge = 0;
          for (let i = 0; i < 3; i++) turn(i, -stepOf(i) * 0.3, 0.25);
          alignHold = 0;
          heatTo = 0;
          heat *= 0.3;
          lost = e.left <= 0 ? 3 : Math.min(3, Math.max(lost + 1, 3 - e.left));
          if (e.left <= 0) life = 0.3;
          break;
        }
        case 'win':
          heatTo = 1;
          heat = Math.max(heat, 0.7);
          life = 1;
          lost = 0;
          stutter = 0;
          lineUp(2, 1.6);
          alignHold = 5;
          ring(1.4);
          ring(2.0);
          ring(2.6);
          beam = 1.3;
          break;
      }
    },
    stop() {
      engine.stop();
      reveal.stop();
    },
  };
}
