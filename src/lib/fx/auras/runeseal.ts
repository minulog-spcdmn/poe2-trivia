// The runeseal aura (lib/auraKinds.ts): the Runic Seals of PoE2's Traitor's
// Passage. There, in the Prison of the Disgraced, Balbala lies bound: a
// Sekhema who betrayed her akhara and was condemned by the ritual of the
// barya to serve a thousand years as a djinn, held by three Runic Seals that
// the player breaks to free her; free, she tosses coins that form runes on
// the ground.
//
// Here the wearer is the bound djinn. Three engraved seals lie on the floor
// round the token, one in front and two behind to either side; from each a
// stream of the djinn's pale sand rises and coils up round the token, across
// its face and behind it, and the seals draw the three in to a knot over its
// head, where the djinn's turquoise heart beats in a little eddy of sand.
// The sand runs up the streams in clumps, each stream at its own pace, and
// waves run up them as they climb, so they writhe and coil and never repeat;
// their upper reaches lean one way and another; glints walk round the seals.
// All of the light is the shader's (runeseal.glsl.ts); this keeps time and
// listens.
//
// It keeps close: anything that stays (the seals, the knot, a free djinn's
// billow) spreads sideways and low, since in a list the players above and
// below sit near; only brief things (a seal's shot of sand as it breaks, a
// gust, a coin) reach further.
//
// Its player's run is the seals' undoing:
// - arrive: the seals are cut into the floor one by one and the sand rises
//   out of them;
// - vote: the djinn tosses a coin: it turns over in the air, lands on the
//   floor and forms a rune there;
// - score: a seal breaks, the next in turn for each right answer in a row:
//   its rune flares, it splits in two and lets out a breath of the djinn's
//   light and a puff of sand, and its stream slips the knot, shoots up a
//   moment and sinks back to billow out free, wide and low. With all three
//   broken the djinn is loose and opens its eyes; each answer more runs a
//   surge up the streams, a gust and a look, and tosses a coin;
// - miss: the binding is cast again: every broken seal is whole at once and
//   the streams are yanked down hard into the knot, the gold gone to ash
//   for a moment;
// - hurt: the same, harder; and for each life lost the sand sinks lower and
//   thinner, with none left barely a trickle;
// - win: the seals break one after another, the djinn rises free, its eyes
//   open and three coins fly;
// - touch: the djinn strains against the seals: a surge runs up the
//   streams and they lift a little, then settle back, and its eyes open.
// Now and then, at rest, it stirs of its own accord, each time something
// other than the last: it strains at the seals; a gust swings the streams
// and blows sand off the knot sideways; a seal tightens, its rune flaring
// and the streams drawn in; its eyes open in the knot for a moment; or it
// tosses a coin.
//
// No fire anywhere: flames round a token are the game's own sign of a streak.

import { budget, particle } from '../core';
import { Shape } from '../particles';
import { auraShape, type AuraContext, type AuraEvent, type Burning } from './common';

/** How far the token's own rim reaches past its face (Avatar.svelte), px. */
const RIM = 3;
/** The floor and the seals as the shader lays them out (runeseal.glsl.ts), in the token's radii. */
const FLOOR = -0.9;
const SEAL_AT = 1.34;
const TILT = 0.24;
/** The order the seals break in: the front one first, then behind to the left and the right. */
const ORDER = [0, 1, 2];
/** How long without a right answer before the seals quietly bind it again (s). */
const REBIND = 45;
/** The sand's colours, and the djinn's turquoise light (HDR). */
const SAND: [number, number, number] = [2.0, 1.6, 1.0];
const SPIRIT: [number, number, number] = [0.7, 2.0, 1.85];

const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const smooth = (x: number) => x * x * (3 - 2 * x);
/** How far a token `w` px across is from small (32 px and under: 0) to large (64 and up: 1). */
const grown = (w: number) => smooth(clamp((w - 32) / 32));
const rand = (a: number, b: number) => a + Math.random() * (b - a);

type Seal = {
  /** 0 not yet there, 1 lit, 2 broken (as the shader takes it), and where it is heading. */
  st: number;
  goal: number;
  /** Seconds since it broke (or 99: not breaking). */
  broke: number;
  /** When it is due to break (s from now; -1: not due). */
  due: number;
  /** Its stream's freedom (0 held at the knot, 1 free). */
  free: number;
  /** The shot of sand up past the knot as it breaks (1, dying away). */
  burst: number;
};

/** What the djinn does of its own accord, now one, now another, never the same twice running. */
type Stir = 'strain' | 'gust' | 'tighten' | 'glance' | 'coin';
const STIRS: [Stir, number][] = [
  ['strain', 3],
  ['gust', 3],
  ['tighten', 3],
  ['glance', 2],
  ['coin', 1],
];

export function burn(ctx: AuraContext): Burning {
  const seed = Math.random();
  /** The sand's travel up the streams (in the token's radii). */
  let travel = Math.random() * 20;
  /** The light: a swell on a score, ebbing. */
  let surge = 0;
  /** A pulse running up the streams (its height, U), or below -1. */
  let pulse = -9;
  let pulseSpeed = 3;
  let chill = 0;
  let vigor = 1;
  let eyes = 0;
  /** The streams' rise as the token arrives (0 sunk into the seals, 1 risen). */
  let risen = 1;
  /** A strain against the seals: the streams lift a little and settle. */
  let strain = 0;
  /** The next stir at rest (s from now), and the last one. */
  let nextStir = rand(3, 6);
  let lastStir: Stir = 'strain';
  let sinceScore = 0;
  /** A yank back to the knot (0-1+): the streams pulled down below bound, springing back. */
  let yank = 0;
  /** The upper streams' lean (U), drifting toward a goal that changes now and then. */
  let lean = 0;
  let leanGoal = 0;
  let leanRate = 0.6;
  let nextLean = rand(3, 7);
  /** How long the djinn's eyes stay open (s), and how bright. */
  let eyesFor = 0;
  let eyesK = 1;
  const seals: Seal[] = [0, 1, 2].map(() => ({ st: 1, goal: 1, broke: 99, due: -1, free: 0, burst: 0 }));
  /** The coin in flight or lying as a rune: the shader draws one at a time, the newest. */
  let coin = { age: -1, at: 1.2 };
  const coinsDue: number[] = [];
  let box = { x: 0, y: 0, w: 32 };

  const broken = () => seals.filter((s) => s.goal === 2).length;
  const busy = () =>
    seals.some((s) => s.broke < 2 || s.burst > 0.02 || Math.abs(s.free - (s.goal === 2 ? 1 : 0)) > 0.02) ||
    coin.age >= 0 ||
    pulse > -1 ||
    strain > 0.02 ||
    yank > 0.02 ||
    Math.abs(leanGoal - lean) > 0.04 ||
    Math.abs(eyes - (eyesFor > 0 ? eyesK : 0)) > 0.02;

  /** Where seal j lies on screen, in the token's radii from its centre. */
  const sealPlace = (j: number) => {
    const th = Math.PI / 2 + (j * 2 * Math.PI) / 3;
    return { x: SEAL_AT * Math.cos(th), y: -FLOOR + SEAL_AT * Math.sin(th) * TILT };
  };

  /** A seal breaks: what it held lets go, a puff of sand and a few motes of the djinn's light lifting off it. */
  const shatter = (j: number) => {
    const s = seals[j];
    s.broke = 0;
    s.goal = 2;
    s.burst = 1;
    const u = box.w / 2 + RIM * (box.w / 32) ** 0.5;
    const at = sealPlace(j);
    const sc = box.w / 32;
    const n = budget(Math.round(6 + 3 * grown(box.w)));
    for (let i = 0; i < n; i++) {
      const spirit = i % 3 === 0;
      const a = rand(-Math.PI, 0);
      const v = rand(8, 18) * sc;
      particle({
        x: box.x + at.x * u + rand(-0.15, 0.15) * u,
        y: box.y + at.y * u,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v * 0.6 - rand(6, 14) * sc,
        life: rand(0.9, 1.6),
        size: rand(0.5, 0.85) * Math.max(0.7, sc ** 0.5),
        sizeEnd: 0.2,
        color: spirit ? SPIRIT : SAND,
        colorEnd: spirit ? [0.15, 0.45, 0.42] : [0.5, 0.38, 0.22],
        drag: 1.8,
        shape: spirit ? Shape.Glow : Shape.Mote,
        turbulence: 9 * sc,
        delay: rand(0, 0.12),
      });
    }
    // With the last of them broken, the djinn opens its eyes.
    if (seals.every((t) => t.goal === 2 && t.due < 0)) look(3.5);
  };
  /** Breaks the next seals in turn until `n` are broken, a beat apart. */
  const breakTo = (n: number, gap = 0.32) => {
    let wait = 0;
    for (const j of ORDER) {
      if (broken() >= n) break;
      const s = seals[j];
      if (s.goal === 2 || s.due >= 0) continue;
      s.due = wait;
      // (Its goal is set ahead, so broken() counts it while it waits.)
      s.goal = 2;
      wait += gap;
    }
  };
  /** The binding is cast again: every seal whole, the streams yanked down. */
  const rebind = (hard: number) => {
    yank = Math.max(yank, hard);
    for (const s of seals) {
      s.goal = 1;
      s.due = -1;
      s.broke = 99;
      s.burst = 0;
    }
    eyes = 0;
    eyesFor = 0;
  };
  const toss = (delay = 0) => coinsDue.push(delay);
  const run = (speed: number) => {
    pulse = -0.2;
    pulseSpeed = speed;
  };
  /** The djinn opens its eyes for `t` s, `k` bright. */
  const look = (t: number, k = 1) => {
    eyesK = eyesFor > 0 ? Math.max(eyesK, k) : k;
    eyesFor = Math.max(eyesFor, t);
  };
  /** A gust: the streams swing one way and the djinn breathes sand out off the knot, sideways. */
  const gust = (k = 1) => {
    const side = Math.random() < 0.5 ? -1 : 1;
    leanGoal = side * rand(0.25, 0.38) * k;
    leanRate = 2.2;
    nextLean = rand(1.2, 2);
    const u = box.w / 2 + RIM * (box.w / 32) ** 0.5;
    const sc = box.w / 32;
    const n = budget(Math.round((4 + 3 * grown(box.w)) * k));
    for (let i = 0; i < n; i++) {
      const v = rand(22, 42) * sc;
      particle({
        x: box.x + rand(-0.2, 0.2) * u,
        y: box.y - rand(1.1, 1.35) * u,
        vx: side * v,
        vy: -rand(0, 6) * sc,
        life: rand(0.8, 1.4),
        size: rand(0.45, 0.75) * Math.max(0.7, sc ** 0.5),
        sizeEnd: 0.15,
        color: i % 4 === 0 ? SPIRIT : SAND,
        colorEnd: [0.45, 0.34, 0.2],
        drag: 1.4,
        gravity: 6 * sc,
        shape: i % 4 === 0 ? Shape.Glow : Shape.Mote,
        turbulence: 10 * sc,
        delay: rand(0, 0.3),
      });
    }
  };
  /** Something of its own accord, unlike the last. */
  const stir = () => {
    const pool = STIRS.filter(([s]) => s !== lastStir && !(s === 'tighten' && broken() >= 3));
    let x = Math.random() * pool.reduce((a, [, w]) => a + w, 0);
    let pick: Stir = pool[0][0];
    for (const [s, w] of pool) {
      x -= w;
      if (x <= 0) {
        pick = s;
        break;
      }
    }
    lastStir = pick;
    switch (pick) {
      case 'strain':
        strain = Math.max(strain, rand(0.55, 0.85));
        run(rand(2.2, 3));
        break;
      case 'gust':
        gust(0.8);
        break;
      case 'tighten': {
        // A lit seal tightens on it: the streams are pulled in a little.
        const lit = seals.filter((s) => s.goal === 1 && s.st > 0.9);
        const s = lit[Math.floor(Math.random() * lit.length)];
        if (s) {
          s.broke = -1;
          yank = Math.max(yank, 0.35);
        }
        break;
      }
      case 'glance':
        look(rand(1.3, 2.2), broken() >= 3 ? 1 : 0.6);
        break;
      case 'coin':
        toss();
        break;
    }
  };

  const react = (e: AuraEvent) => {
    switch (e.kind) {
      case 'arrive':
        // The seals are cut one by one and the sand rises out of them.
        seals.forEach((s, i) => {
          s.st = -0.35 * i;
          s.goal = 1;
          s.free = 0;
          s.broke = 99;
          s.due = -1;
          s.burst = 0;
        });
        risen = 0;
        eyes = 0;
        eyesFor = 0;
        break;
      case 'vote':
        // A coin, the streams swaying with the throw.
        toss();
        leanGoal = (Math.random() < 0.5 ? -1 : 1) * rand(0.1, 0.16);
        leanRate = 1.6;
        nextLean = rand(1.5, 2.5);
        break;
      case 'score': {
        const streak = Math.max(1, e.streak);
        const before = broken();
        breakTo(Math.min(3, streak));
        sinceScore = 0;
        chill = 0;
        surge = Math.max(surge, 0.6 + 0.15 * Math.min(streak, 4));
        run(3.2);
        // Past the third, the djinn is loose: each answer more, a surge, a
        // look, a gust and a coin.
        if (streak >= 3 && before >= 3) {
          surge = 1.2;
          toss(0.15);
          look(2.6);
          gust(0.7);
          for (const s of seals) s.burst = Math.max(s.burst, 0.6);
        }
        break;
      }
      case 'miss':
        rebind(1);
        chill = 1;
        surge = 0;
        pulse = -9;
        break;
      case 'hurt':
        rebind(1.4);
        chill = 1;
        surge = 0;
        pulse = -9;
        vigor = e.left <= 0 ? 0.3 : e.left === 1 ? 0.62 : Math.min(vigor, 0.85);
        break;
      case 'win':
        vigor = 1;
        chill = 0;
        sinceScore = 0;
        breakTo(3, 0.28);
        surge = 1.3;
        run(2.4);
        toss(0.9);
        toss(1.5);
        toss(2.1);
        look(5);
        break;
      case 'touch':
        // It strains against the seals and looks out at whoever touched it.
        strain = 1;
        run(4);
        look(1.3, broken() >= 3 ? 1 : 0.7);
        break;
    }
  };

  const shapes = [
    // The djinn: its light, its three streams, the knot and its eyes.
    auraShape(ctx, (f, _a, b) => {
      const u = b.w / 2 + RIM * (b.w / 32) ** 0.5;
      // (The light reaches out to the free streams' billow, and up as far as a breaking seal's shot.)
      const loose = Math.max(...seals.map((s) => s.free));
      const shot = Math.max(...seals.map((s) => s.burst));
      f.hw = ((2.0 + 0.4 * loose) * u + 4) / 0.72;
      f.hh = ((1.9 + 0.5 * loose + 0.75 * shot) * u + 4) / 0.72;
      f.k = (0.62 + 0.38 * grown(b.w)) * (0.4 + 0.6 * risen);
      f.calm = !busy();
      f.q[0] = clamp(lean, -0.45, 0.45);
      f.q[1] = u;
      f.q[2] = travel;
      f.q[3] = (0.85 + 0.6 * surge) * (0.55 + 0.45 * vigor);
      // (A yank pulls them below bound, the knot drawn down tight for a moment; a burst shoots one past free.)
      for (let j = 0; j < 3; j++) f.q[4 + j] = clamp(seals[j].free * risen + 0.65 * seals[j].burst + strain * 0.18 - yank * 0.5, -0.6, 1.65);
      f.q[7] = eyes;
      f.q[9] = chill;
      f.q[10] = pulse;
      f.q[11] = vigor * (0.25 + 0.75 * risen);
    }),
    // The seals, their breaking, and the coin.
    auraShape(ctx, (f, _a, b) => {
      const u = b.w / 2 + RIM * (b.w / 32) ** 0.5;
      f.hw = f.hh = (2.25 * u + 4) / 0.72;
      f.k = 0.62 + 0.38 * grown(b.w);
      f.calm = !busy();
      f.q[0] = 1;
      f.q[1] = u;
      f.q[2] = clamp(seals[0].st, 0, 2);
      f.q[3] = clamp(seals[1].st, 0, 2);
      f.q[4] = clamp(seals[2].st, 0, 2);
      f.q[5] = seals[0].broke;
      f.q[6] = seals[1].broke;
      f.q[7] = seals[2].broke;
      f.q[9] = coin.age;
      f.q[10] = coin.at;
      f.q[11] = chill * 0.7;
    }),
  ];

  return {
    react,
    step(dt, b) {
      box = b;
      sinceScore += dt;
      risen += (1 - risen) * (1 - Math.exp(-dt * 1.4));

      // The seals: lit, breaking, broken; the streams following their seals.
      seals.forEach((s, j) => {
        if (s.due >= 0) {
          s.due -= dt;
          if (s.due < 0) {
            s.due = -1;
            shatter(j);
          }
        }
        // (Breaking counts up from 0; tightening counts down from -1, done by -5.)
        if (s.broke >= 0) s.broke = Math.min(s.broke + dt, 99);
        else s.broke = s.broke - dt < -5 ? 99 : s.broke - dt;
        s.burst *= Math.exp(-dt * 1.5);
        // (A broken seal dulls to its mark over a moment; one bound again is whole at once.)
        const goal = s.due >= 0 ? s.st : s.goal;
        const rate = goal > s.st ? (s.st < 1 ? 2.2 : 1.6) : 7;
        s.st += clamp(goal - s.st, -rate * dt, rate * dt);
        const want = s.goal === 2 && s.due < 0 ? 1 : 0;
        // Freed, a stream climbs slowly; yanked back, it comes down fast.
        const k = want > s.free ? 1.4 : 5;
        s.free += (want - s.free) * (1 - Math.exp(-dt * k));
      });
      // Quietly bound again after a long while with no right answer.
      if (sinceScore > REBIND && broken() > 0) {
        for (const s of seals) s.goal = 1;
        eyesFor = 0;
      }

      // The djinn's eyes: open a moment, then shut again.
      eyesFor = Math.max(0, eyesFor - dt);
      const open = eyesFor > 0 ? eyesK : 0;
      eyes += (open - eyes) * (1 - Math.exp(-dt * (open > eyes ? 5 : 3)));

      // The lean drifts toward a goal that changes now and then, settling back from a gust.
      nextLean -= dt;
      if (nextLean <= 0) {
        nextLean = rand(4, 9);
        leanGoal = rand(-0.16, 0.16);
        leanRate = rand(0.3, 0.7);
      }
      lean += (leanGoal - lean) * (1 - Math.exp(-dt * leanRate));

      // The sand runs up steadily, quicker on a surge or a strain, slower when chilled or worn.
      travel += dt * (0.32 + 0.35 * surge + 0.4 * strain) * (1 - 0.7 * chill) * (0.45 + 0.55 * vigor);
      if (pulse > -1) {
        pulse += dt * pulseSpeed;
        if (pulse > 4.2) pulse = -9;
      }

      // Now and then, at rest, it stirs of its own accord; with no lives left, hardly ever.
      nextStir -= dt;
      if (nextStir <= 0) {
        nextStir = rand(4.5, 8.5) / Math.max(vigor, 0.3);
        if (vigor > 0.5 || Math.random() < 0.3) stir();
      }

      // The coin: one at a time, the newest taking over.
      for (let i = coinsDue.length - 1; i >= 0; i--) {
        coinsDue[i] -= dt;
        if (coinsDue[i] <= 0) {
          coinsDue.splice(i, 1);
          coin = { age: 0, at: rand(0.18, 0.82) * Math.PI };
        }
      }
      if (coin.age >= 0) {
        coin.age += dt;
        if (coin.age > 3) coin.age = -1;
      }

      surge *= Math.exp(-dt * 0.9);
      strain *= Math.exp(-dt * 1.3);
      chill *= Math.exp(-dt * 1.1);
      yank *= Math.exp(-dt * 3);
    },
    stop() {
      for (const s of shapes) s.stop();
    },
  };
}
