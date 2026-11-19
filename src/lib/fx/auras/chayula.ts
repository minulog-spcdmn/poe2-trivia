// The chayula aura (lib/auraKinds.ts): the Acolyte of Chayula, who wraps
// himself in Darkness and feeds on the Breach. A well of darkness stands
// round the token, deeper than the page, its smoke rolling at the edge and
// its horizon burning a deep violet. Round it a maelstrom lies on a tilted
// plane: the light round the token falls in along spiral lanes and dies in
// the dark, its far half going behind the token and its near half crossing
// in front of the face. On that plane stand the Acolyte's remnants, the
// Flames of Chayula as Into the Breach manifests them: little flames of
// violet, crimson and azure, each burning in its own place, the far ones
// behind the token and the near ones before it. Now and then the wearer
// takes one in (it is drawn to the token and burns up) and another
// manifests elsewhere.
//
// What it answers (react):
// - arrive: the dark opens from the token and the flames catch round it.
// - vote, touch: the void drinks once: a wave of light down every lane, the
//   flames bowing to it; touched, they are blown back and stand again.
// - score: it feeds, and a new flame catches. A streak keeps them: one more
//   for each right answer, to ten on a big token (Lucid Dreaming's ten),
//   turning violet as they build, the maelstrom faster and brighter.
// - miss: the void falters: the flames it held gutter out one by one, the
//   maelstrom stalls and its horizon gutters.
// - hurt: its Darkness is spent, as the Acolyte's soaks a blow: the dark
//   thins and shrinks, the flames are blown out, and it all grows back,
//   slower with fewer lives left.
// - win: the void opens wide with all ten flames burning violet round it,
//   and holds a while before it settles.
//
// The dark is the page's own (light can't darken): layers under the avatar,
// black shaped by masks and dithered so their soft falloff doesn't band
// (app.css, --dither; the tile is imported, as an inline style can't reach
// the built one). A still disc, and over it two layers of uneven lobes
// turning against each other, so the edge of the dark rolls like smoke. The
// light is the shader's (chayula.glsl.ts).

import dither from '../../../assets/dither.png';
import { auraShape, type AuraContext, type AuraEvent, type Burning } from './common';

/** Seconds between the void's idle breaths. */
const PERIOD = 6.5;
/** Seconds a gulp's wave takes to run in to the horizon. */
const GULP = 0.6;

const DITHER_MEAN = 5 / 255; // the --dither tile's mean opacity
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Its form round a token `w` px across (lengths in px from the centre). On
 * a card (`card`) its dark is held closer and lighter: round an avatar it
 * lies on the page, on a card on the card's face, which it blacked out.
 */
function form(w: number, card = false) {
  const R = w / 2;
  // 0 at 32 px and under, 1 from 64 px.
  const m = smooth((w - 32) / 32);
  const rv = mix(R + 4.5, 1.27 * R, m);
  return {
    m,
    R,
    /** The token and its rim, which hide what passes behind. */
    disc: R + 3,
    /** The dark's horizon, where light dies. */
    rv,
    /** How far out the maelstrom reaches, on its plane. */
    reach: mix(R + 15, 2.6 * R, m),
    /** Where the dark's soft falloff ends. */
    span: mix(rv + 8, (card ? 1.3 : 1.9) * rv, m),
    /** How dark it is at its deepest. */
    deep: card ? 0.68 : 0.9,
    /** How far the dark widens on a breath, over its size. */
    widen: mix(0.06, 0.12, m),
    /** Remnants held at rest, and at most. */
    base: m > 0.5 ? 5 : 4,
    cap: Math.round(mix(7, 10, m)),
  };
}
type Form = ReturnType<typeof form>;

/** How dark the still disc is `r` px from the centre: deep within the horizon, falling off softly past it. */
function discDark(r: number, f: Form): number {
  const g = clamp01((r - 0.85 * f.rv) / (f.span - 0.85 * f.rv));
  return f.deep * (1 - g) ** 2.2;
}
/** The rolling lobes' profile: they lie round the horizon and reach on past the disc's dark. */
function lobeDark(r: number, f: Form): number {
  const g = clamp01((r - 0.9 * f.rv) / (1.25 * f.span - 0.9 * f.rv));
  return ((0.8 * f.deep) / 0.9) * (1 - g) ** 1.6;
}

/** A mask for a box `s` px each side of the centre, by an opacity at `r` px: a radial fade carrying the dither, as zonecard/fume.ts lays it. */
function darkMask(s: number, dark: (r: number) => number): string {
  const at: number[] = [];
  for (let i = 0; i <= 24; i++) at.push((s * i) / 24);
  const weight = (r: number) => Math.min(1, dark(r) / DITHER_MEAN);
  const radial = (g: (r: number) => number) =>
    `radial-gradient(closest-side, ${at.map((r) => `rgb(0 0 0 / ${clamp01(g(r)).toFixed(4)}) ${r.toFixed(2)}px`).join(', ')})`;
  return [
    radial((r) => {
      const k = DITHER_MEAN * weight(r);
      return (dark(r) - k) / (1 - k);
    }),
    `url(${dither})`,
    radial(weight),
  ].join(',');
}

/** Uneven lobes round a circle, as a conic gradient of the dark's colour. */
function lobes(n: number): string {
  const stops: string[] = [];
  const first = 0.25 + 0.75 * Math.random();
  for (let i = 0; i < n; i++) {
    const a = 0.15 + 0.85 * Math.random() ** 0.7;
    stops.push(`rgb(2 0 5 / ${(i ? a : first).toFixed(3)}) ${((360 * (i + 0.3 * Math.random())) / n).toFixed(1)}deg`);
  }
  stops.push(`rgb(2 0 5 / ${first.toFixed(3)}) 360deg`);
  return `conic-gradient(${stops.join(', ')})`;
}

/** A spring toward `to`: `x` and its speed `v`, `w` its pace (rad/s), `z` its damping (1: none past). */
function spring(s: { x: number; v: number }, to: number, dt: number, w: number, z: number) {
  const n = Math.max(1, Math.ceil(dt / 0.02));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    s.v += (w * w * (to - s.x) - 2 * z * w * s.v) * h;
    s.x += s.v * h;
  }
}

export function burn(ctx: AuraContext): Burning {
  const layer = (bg: string) => {
    const d = document.createElement('div');
    d.style.cssText = [
      `position:absolute;left:50%;top:50%;pointer-events:none;opacity:0;transform:translate(-50%,-50%);background:${bg};border-radius:50%`,
      'mask-size:100% 100%,auto,100% 100%;mask-repeat:no-repeat,repeat,no-repeat;mask-composite:add,intersect;image-rendering:pixelated',
    ].join(';');
    ctx.under.append(d);
    return d;
  };
  const disc = layer('rgb(2 0 5)');
  const roll = [layer(lobes(7)), layer(lobes(5))];
  // The dark is laid out by the avatar's layout size (a transform on it, a
  // scale-in, scales the dark with it), and laid again when that changes.
  let laid = -1;
  let laidForm = form(32);
  const lay = () => {
    const w = ctx.el.offsetWidth;
    if (w === laid || !w) return;
    laid = w;
    const f = form(w, ctx.bare);
    laidForm = f;
    const s = `${(2 * f.span).toFixed(2)}px`;
    Object.assign(disc.style, { width: s, height: s, maskImage: darkMask(f.span, (r) => discDark(r, f)) });
    const s2 = 1.25 * f.span;
    for (const l of roll) Object.assign(l.style, { width: `${(2 * s2).toFixed(2)}px`, height: `${(2 * s2).toFixed(2)}px`, maskImage: darkMask(s2, (r) => lobeDark(r, f)) });
  };
  lay();

  let age = 0;
  let frames = 0;
  // How far the light has fallen (each packet falls once per unit); the remnants ride it too.
  let flow = Math.random() * 10;
  // The lobes' turn (rad).
  const turn = [Math.random() * 6.3, Math.random() * 6.3];

  // A breath: the gulp's wave runs in, and as it lands the dark widens. `beatAt` is its start (age), `beatK` its strength.
  let beatAt = -99;
  let beatK = 1;
  let nextBeat = 1.2 + Math.random() * PERIOD;
  let breath = 0;
  let gulpRun = 0;
  let gulp = 0;
  const beat = (k: number) => {
    beatAt = age;
    beatK = k;
    nextBeat = age + PERIOD * (0.85 + 0.3 * Math.random());
  };

  // What the moments move: how open the void is (a spring), how far the
  // remnants are flung (a spring), its Darkness (spent by a hurt, growing
  // back), its light's dimming, how the maelstrom is held back (a stall),
  // the horizon's flare (below 0: it gutters), and its power (a streak).
  const open = { x: 0.2, v: 0 };
  let openTo = 1;
  let wideUntil = -1;
  const spread = { x: 0, v: 0 };
  let darkness = 1;
  let regrow = 1.5;
  let dim = 1;
  let stall = 1;
  let flare = 0;
  // A surge: the maelstrom spun up as it feeds, falling back.
  let surge = 0;
  let streak = 0;
  let power = 0;
  let powerTo = 0;
  let powerUntil = -1;
  // The remnants: how many (a float; the last one partway out or in), and how many it holds.
  let count = 0;
  let held = laidForm.base;
  let come = 0;
  // When it came (age): it opens from there.
  let bornAt = 0;

  const light = auraShape(
    ctx,
    (f, _age, b) => {
      const g = form(b.w, ctx.bare);
      const rv = g.rv * open.x * (1 + g.widen * breath);
      const reach = g.reach * mix(1, open.x, 0.5);
      f.hw = f.hh = Math.max(reach * (1 + 0.6 * Math.max(0, spread.x)), g.span) / 0.7;
      f.k = come * dim * mix(0.95, 1, g.m) * (1 + 0.3 * power);
      f.q[0] = g.disc;
      f.q[1] = rv;
      f.q[2] = flow;
      f.q[3] = flare + breath * mix(0.45, 1, g.m) * beatK;
      f.q[4] = spread.x;
      f.q[5] = mix(reach, rv, gulpRun * gulpRun);
      f.q[6] = gulp * mix(0.5, 1, g.m) * beatK;
      f.q[7] = reach;
      // (Negative while the flames are going out, so the newest gutters rather than catches.)
      f.q[9] = Math.min(count, g.cap) * (count > held ? -1 : 1);
      f.q[10] = g.m;
      f.q[11] = power;
    },
    { calm: false },
  );

  const react = (e: AuraEvent) => {
    const f = laidForm;
    switch (e.kind) {
      case 'arrive':
        open.x = 0.15;
        open.v = 0;
        bornAt = age;
        count = 0;
        held = f.base;
        beat(1);
        beatAt = age + 0.45;
        break;
      case 'vote':
        beat(0.8);
        flare = Math.max(flare, 0.4);
        break;
      case 'touch':
        beat(0.7);
        spread.v += 2.2;
        flare = Math.max(flare, 0.5);
        break;
      case 'score':
        streak = Math.max(1, e.streak);
        held = Math.min(f.cap, f.base + streak);
        powerTo = Math.min(streak, 7) / 7;
        beat(1.2 + 0.12 * Math.min(streak, 7));
        flare = Math.max(flare, 1 + 0.12 * Math.min(streak, 7));
        surge = 2.5 + 0.3 * Math.min(streak, 7);
        open.v += 2.5;
        break;
      case 'miss':
        streak = 0;
        held = f.base;
        powerTo = 0;
        stall = 0.08;
        dim = 0.6;
        flare = -0.8;
        open.v -= 1.8;
        break;
      case 'hurt':
        streak = 0;
        held = f.base;
        powerTo = 0;
        darkness = 0.05;
        regrow = 1.2 + 2.4 / (Math.max(0, e.left) + 1);
        dim = 0.45;
        flare = -1;
        stall = 0.3;
        open.x *= 0.7;
        spread.v += 3.2;
        break;
      case 'win':
        held = f.cap;
        powerTo = 1;
        powerUntil = age + 8;
        openTo = 1.3;
        wideUntil = age + 6;
        beat(1.6);
        flare = 1.5;
        break;
    }
  };

  return {
    react,
    step(dt) {
      age += dt;
      if (++frames % 20 === 1) lay();
      const f = laidForm;
      come = smooth((age - bornAt) / 1.2);
      if (age >= nextBeat) beat(0.8);
      // The beat: the wave runs in from the reach, quickening; as it lands
      // the dark widens fast, then settles back slowly.
      const tb = age - beatAt;
      gulpRun = 0;
      gulp = 0;
      breath = 0;
      if (tb >= 0 && tb < GULP) {
        gulpRun = tb / GULP;
        gulp = smooth(gulpRun / 0.3) * (1 - smooth((gulpRun - 0.8) / 0.2));
      }
      const e = tb - GULP * 0.9;
      if (e > 0) breath = Math.min(1, 1.35 * (1 - Math.exp(-e / 0.07)) * Math.exp(-e / 0.85));

      if (wideUntil >= 0 && age > wideUntil) {
        openTo = 1;
        wideUntil = -1;
      }
      if (powerUntil >= 0 && age > powerUntil) {
        powerTo = Math.min(streak, 7) / 7;
        if (held > f.base + streak) held = Math.min(f.cap, f.base + streak);
        powerUntil = -1;
      }
      spring(open, openTo, dt, 6, 0.45);
      open.x = Math.max(0.1, open.x);
      spring(spread, 0, dt, 4, 0.55);
      darkness += (1 - darkness) * (1 - Math.exp(-dt / regrow));
      dim += (1 - dim) * (1 - Math.exp(-dt / 1.1));
      stall += (1 - stall) * (1 - Math.exp(-dt / 0.9));
      flare *= Math.exp(-dt / (flare < 0 ? 1.2 : 0.5));
      power += (powerTo - power) * (1 - Math.exp(-dt / 0.8));
      // Remnants come out one at a time and are swallowed quicker, one after another.
      if (age - bornAt > 0.5) count = count < held ? Math.min(held, count + dt / 0.7) : Math.max(held, count - dt / 0.3);

      surge *= Math.exp(-dt / 0.7);
      flow += dt * 0.34 * stall * (1 + 0.8 * power + surge) * (1 + 1.6 * breath * beatK + 1.2 * gulp);
      turn[0] += dt * 0.16 * (1 + power) * stall;
      turn[1] -= dt * 0.1 * (1 + power) * stall;

      const o = String(come * darkness);
      const s = open.x * (1 + f.widen * breath) * (0.75 + 0.25 * darkness);
      disc.style.opacity = o;
      disc.style.transform = `translate(-50%,-50%) scale(${s.toFixed(4)})`;
      roll.forEach((l, i) => {
        l.style.opacity = o;
        l.style.transform = `translate(-50%,-50%) rotate(${turn[i].toFixed(4)}rad) scale(${(s * (1 + 0.04 * Math.sin(age * (0.7 + 0.3 * i) + i))).toFixed(4)})`;
      });
    },
    stop() {
      light.stop(0.4);
      disc.remove();
      for (const l of roll) l.remove();
    },
  };
}
