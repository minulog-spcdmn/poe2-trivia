// The lich aura (lib/auraKinds.ts): the Witch's Lich, as her passive tree
// paints her, wreathed in her Unholy Might. Her power wells up out of the
// token in cords of braided, crackling threads, white-hot at their hearts: each
// springs from round the rim, hottest there, and most rise as they leave
// it, bending away to the side; it lives a while, its line slowly rippling,
// pulses of light running out along it now and then, its threads crackling
// harder as one passes and flicking sparks off its frayed head; then it lets
// go and fades, each thread letting go at its own place, and another springs.
// The far ones come from behind the token; the near ones cross its rim in
// front, wider and brighter. And they wrap round her, so her power stands
// round the token rather than flat beside it: one always comes round the
// token's far side from behind and crosses its face low down, below the
// letter, light and thin, dipping toward the eye; others run on behind the
// token and out a little past its far side. They curl round and stay where
// they are: nothing circles. Their hues are hers: violet, her cold blue and a
// magenta; and her light steeps the token's face.
//
// The space it takes follows the token's: where the token stands large with
// room round it (the winner, the bench), the streams rise high and reach far;
// in a list, where its neighbours sit above and below, they keep to its row
// and stay close, rising no higher than its top.
//
// What happens to the player moves her power:
// - arrive: it is drawn in out of the dark, streams running in to her from
//   both sides, and her light kindles as they land.
// - vote: a pulse runs out along each stream, one after another.
// - score: her might wells up: pulses ripple through the streams and new
//   ones spring out one after another, rising, longer; a streak keeps more of
//   them out, longer and brighter.
// - miss: her power falters: the streams go slack and sag, their light drains
//   cold, then they gather themselves again.
// - hurt: a blow tears it away: every stream is torn off and flung out, her
//   light gutters, and fewer come back, and dimmer, as lives run out.
// - win: Unholy Might at its full: streams spring out on both sides one
//   after another, rising high, and her light blazes.
// - touch: the streams recoil from the touch and lash out again, crackling.
//
// The light is the shader's (lich.glsl.ts); the dark it stands in is the
// page's, a dithered shade under the token, so it holds on a lit row too.

import dither from '../../../assets/dither.png';
import { budget, particle, type Box } from '../core';
import { Shape } from '../particles';
import { auraShape, type AuraContext, type AuraEvent, type Burning } from './common';

/** How far the token's own rim reaches past its face (Avatar.svelte), px. */
const RIM = 3;

const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const ease = (x: number, to: number, rate: number, dt: number) => x + (to - x) * (1 - Math.exp(-dt * rate));
const outCubic = (x: number) => 1 - (1 - x) ** 3;
const TAU = Math.PI * 2;

/** The token's radius with its rim, px. */
const tokR = (b: { w: number }) => b.w / 2 + RIM * (b.w / 32) ** 0.5;
/** How far a token is from list size (26 px and under: 0) to large, with room round it (66 and up: 1). */
const big = (w: number) => clamp((w - 26) / 40);

/** A slow wandering value, about -1 to 1: three slow swells of their own pace, so it never beats. */
function wander() {
  const w = [0.09, 0.047, 0.023].map((f) => ({ f: f * rand(0.8, 1.25), p: rand(0, TAU) }));
  return (t: number) => 0.5 * Math.sin(t * w[0].f * TAU + w[0].p) + 0.3 * Math.sin(t * w[1].f * TAU + w[1].p) + 0.2 * Math.sin(t * w[2].f * TAU + w[2].p);
}

/** A dark mask of a soft ellipse (r: 0 at its centre, 1 at its edge), dithered so it doesn't band (as abyss.ts lays one). */
const DITHER_MEAN = 5 / 255;
function shadeMask(fade: (r: number) => number) {
  const weight = (r: number) => Math.min(1, fade(r) / DITHER_MEAN);
  const radial = (fn: (r: number) => number) =>
    `radial-gradient(closest-side, ${Array.from({ length: 41 }, (_, i) => `rgb(0 0 0 / ${clamp(fn(i / 40)).toFixed(4)}) ${i * 2.5}%`).join(', ')})`;
  return [
    radial((r) => {
      const k = DITHER_MEAN * weight(r);
      return (fade(r) - k) / (1 - k);
    }),
    `url(${dither})`,
    radial(weight),
  ].join(',');
}

/** The shade under the token, in the avatar's box (CSS lengths), its opacity set by `step`. */
function shade(ctx: AuraContext, box: { left: string; top: string; width: string; height: string }, depth: number) {
  const d = document.createElement('div');
  const fade = (r: number) => depth * Math.exp((-r * r) / 0.32) * (1 - r ** 8) ** 2;
  Object.assign(d.style, {
    position: 'absolute',
    pointerEvents: 'none',
    ...box,
    opacity: '0',
    willChange: 'opacity',
    background: 'rgb(7 4 14)',
    maskImage: shadeMask(fade),
    maskSize: '100% 100%,auto,100% 100%',
    maskRepeat: 'no-repeat,repeat,no-repeat',
    maskComposite: 'add,intersect',
    imageRendering: 'pixelated',
  });
  d.style.setProperty('-webkit-mask-image', d.style.maskImage);
  ctx.under.append(d);
  return {
    show(o: number) {
      const s = o.toFixed(3);
      if (d.style.opacity !== s) d.style.opacity = s;
    },
    remove: () => d.remove(),
  };
}

/**
 * One stream of her might. Lengths are in the token's radii (with its rim),
 * along its way from the token's centre; its reach is as it is on a large
 * token, and shorter in a list (see `span`).
 * - gather: drawn in from far out, its tail running in to the token.
 * - grow: springing from round the rim, its head running out.
 * - live: there, rippling, pulses running out along it.
 * - go: let go, fading, its tail running out after its head.
 * - gone: waiting to spring again.
 */
type Stream = {
  side: 1 | -1;
  /**
   * How it lies round the token: far, coming from behind it; near, crossing
   * its rim in front; or wrapping round it: front, coming round its far side
   * from behind and crossing its face low down; back, running on behind it
   * and out a little past its far side.
   */
  kind: Kind;
  state: 'gather' | 'grow' | 'live' | 'go' | 'gone';
  t: number;
  dur: number;
  head: number;
  tail: number;
  /** Where its head reaches once out, and where its tail was when it let go. */
  reach: number;
  from: number;
  /** Its height where it leaves the rim; where it heads (-1 as high as the room allows, 0 level, 1 as low); its wave's height, phase and drift (rad/s). */
  y0: number;
  lean: number;
  amp: number;
  ph: number;
  drift: number;
  hue: number;
  /** Its light, and how its reach breathes. */
  light: number;
  breathe: (t: number) => number;
  /** A pulse running out along it (0 root to 1 head; -1 none), its pace, and when the next comes. */
  surge: number;
  surgeDur: number;
  nextSurge: number;
  /** Its head thrown out (a pulse landing) or pulled back (a recoil): a spring, and how fast it moves. */
  kick: number;
  kickV: number;
  /** How fast its head drifts out once let go. */
  fling: number;
};

type Kind = 'far' | 'near' | 'front' | 'back';
/** Its kind as the shader reads it (tens in q.z). */
const KIND: Record<Kind, number> = { far: 0, near: 1, front: 2, back: 3 };
/** In front of the token, and wrapping round it. */
const inFront = (s: Stream) => s.kind === 'near' || s.kind === 'front';
const wraps = (s: Stream) => s.kind === 'front' || s.kind === 'back';

const newStream = (): Stream => ({
  side: 1,
  kind: 'far',
  state: 'gone',
  t: 0,
  dur: 1,
  head: 0,
  tail: 0,
  reach: 2.4,
  from: 0,
  y0: 0,
  lean: 0,
  amp: 0.15,
  ph: 0,
  drift: 0.3,
  hue: 0.5,
  light: 1,
  breathe: wander(),
  surge: -1,
  surgeDur: 1,
  nextSurge: 2,
  kick: 0,
  kickV: 0,
  fling: 0.2,
});

/** At most this many streams at once (some of them letting go). */
const SLOTS = 10;

/** Where a stream at height `y0` (in the token's radii) comes out past the rim, and how far it rises or falls as it fans out from there: as the shader has it. */
const rimAt = (y0: number) => Math.sqrt(Math.max(1 - y0 * y0, 0.2));
const lift = (y0: number) => (y0 / rimAt(y0)) * 0.3;

/** Her hues, by turns so two in a row are rarely alike: violet, her cold blue, a magenta. */
const HUES: [number, number][] = [
  [0.4, 0.6],
  [0.02, 0.22],
  [0.76, 0.96],
];

/**
 * How a stream lies on a token `w` px across (in its radii): how far its
 * head reaches, and how high or low it may run. A large token has room:
 * they rise high and reach far; in a list they keep to the row and stay close.
 */
const span = (w: number) => {
  const g = big(w);
  return { reach: 0.6 + 0.4 * g, up: 0.45 + 1.25 * g, down: 0.7 + 0.5 * g, wave: 0.55 + 0.45 * g };
};

export function burn(ctx: AuraContext): Burning {
  const dark = shade(ctx, { left: '-115%', top: '-50%', width: '330%', height: '190%' }, 0.58);
  const breathe = wander();
  const sway = wander();
  const leaning = wander();
  let age = 0;
  /** Her light (1 at rest), a flare that fades, the chill of a miss, the slack of a falter. */
  let glow = 0.6;
  let flare = 0;
  let chill = 0;
  let slack = 0;
  /** A streak's power (0-1), ebbing; what's left of her after lost lives (1 whole). */
  let power = 0;
  let vigor = 1;
  /** Until another stream may spring. */
  let nextSpring = rand(0.6, 1.2);
  /** What a moment sets going a little later (a score's streams, one after another). */
  let queue: { t: number; go: () => void }[] = [];
  /** The light's own slow drift round the rim. */
  let drift = Math.random() * 20;
  let box: Box = { x: 0, y: 0, w: 32, h: 32 };
  let hueAt = Math.floor(Math.random() * 3);

  const streams = Array.from({ length: SLOTS }, () => newStream());

  const later = (t: number, go: () => void) => queue.push({ t, go });
  const pickHue = () => {
    const x = Math.random();
    hueAt = x < 0.15 ? hueAt : (hueAt + (x < 0.6 ? 1 : 2)) % 3;
    return rand(...HUES[hueAt]);
  };
  /**
   * Where a new stream heads: at rest most run out to the side, rising a
   * little, some rise high and a few fall (a moment's welling rises more);
   * of a few tries, the one furthest from where the
   * others head (on its own side, and less so on the other), so a side
   * never fans out in parallel like a wing, nor mirrors the other like a
   * pair of them. (Within `range`, if given.)
   */
  const pickLean = (side: number, range?: [number, number]) => {
    const taken = streams.filter((s) => s.state !== 'gone' && s.state !== 'go');
    let best = 0;
    let far = -1;
    for (let i = 0; i < 4; i++) {
      const x = Math.random();
      const l = range ? rand(...range) : x < 0.3 ? rand(-1, -0.4) : x < 0.82 ? rand(-0.4, 0.15) : rand(0.15, 0.6);
      const d = Math.min(1, ...taken.map((s) => Math.abs(s.lean - l) * (s.side === side ? 1 : 1.6)));
      if (d > far) [far, best] = [d, l];
    }
    return best;
  };

  /**
   * How a new stream lies round the token: always one crossing its face in
   * front (but only one, so the face stays clear), and a good share of the
   * rest running on behind it, so her power reads as round her, not flat to
   * the sides.
   */
  const pickKind = (): Kind => {
    if (!streams.some((s) => out(s) && s.kind === 'front')) return 'front';
    const x = Math.random();
    return x < 0.38 ? 'back' : x < 0.58 ? 'near' : 'far';
  };

  /** Sets a stream afresh: its kind, where it leaves the rim, where it heads, its wave and hue. */
  const shapeLine = (s: Stream, kind = pickKind(), lean = pickLean(s.side)) => {
    s.kind = kind;
    // (One in front sweeps out low and rises only a little, so it doesn't cut across the far ones.)
    if (kind === 'near') lean = Math.max(-0.5, Math.min(lean, 0.15));
    if (kind === 'front') lean = Math.max(-0.7, Math.min(lean, 0.2));
    // (The far ones mostly from the upper half of the rim, a back one from
    // its upper half, the ones in front round its lower edge.)
    s.y0 = {
      far: () => -0.85 + 1.15 * Math.random() ** 1.3,
      near: () => rand(0.3, 0.68),
      front: () => rand(0.12, 0.4),
      back: () => rand(-0.75, 0.1),
    }[kind]();
    s.lean = lean;
    s.amp = rand(0.06, 0.16);
    s.ph = rand(0, TAU);
    s.drift = rand(0.22, 0.5) * (Math.random() < 0.5 ? -1 : 1);
    s.hue = pickHue();
    s.light = inFront(s) ? rand(1.0, 1.2) : rand(0.75, 0.95);
    s.kick = 0;
    s.kickV = 0;
    s.surge = -1;
    s.surgeDur = rand(0.8, 1.2);
    s.nextSurge = rand(0.6, 2.2);
  };

  /**
   * A stream springs from round the rim on `side`, its head out to `reach`
   * over `dur` s (a wrapping one's from round the token's far side, so it
   * whips round the token once and stays).
   */
  const spring = (s: Stream, side: 1 | -1, reach: number, dur: number, kind?: Kind, lean?: number) => {
    s.side = side;
    s.reach = reach;
    shapeLine(s, kind, lean);
    const rest = restOf(s);
    Object.assign(s, { state: 'grow', t: 0, dur, head: wraps(s) ? rest + 0.3 : 0.4, tail: rest });
  };

  /** Lets a stream go: it fades over `dur` s, its tail running out after its head, its head drifting out at `fling` radii/s. */
  const letGo = (s: Stream, dur: number, fling: number) => {
    if (s.state === 'gone' || s.state === 'go') return;
    Object.assign(s, { state: 'go', t: 0, dur, fling, from: s.tail });
  };

  /** A pulse down a stream, after `delay` s, taking `dur` s. */
  const surge = (s: Stream, delay: number, dur: number) => {
    if (s.state === 'gone' || s.state === 'go') return;
    s.surge = -1;
    s.nextSurge = delay;
    s.surgeDur = dur;
  };

  const out = (s: Stream) => s.state !== 'gone' && s.state !== 'go';
  const free = () => streams.find((s) => s.state === 'gone');
  /**
   * A side: her power leans one way for a while and slowly turns to the
   * other (a slow wander), so the two sides never mirror each other; but
   * a side left bare is filled before long.
   */
  const pickSide = (): 1 | -1 => {
    let l = 0;
    let r = 0;
    for (const s of streams) if (out(s)) s.side < 0 ? l++ : r++;
    if (l === 0 && r >= 2) return -1;
    if (r === 0 && l >= 2) return 1;
    return Math.random() < 0.5 + 0.32 * leaning(age) ? 1 : -1;
  };
  /** How many she keeps out at rest: five, more on a streak, fewer as lives are lost. */
  const want = () => Math.round((4.6 + 2.4 * power) * (0.45 + 0.55 * vigor));
  /** Streams springing out one after another, from `t0` s on, rising (`lean` at most). */
  const welling = (n: number, t0: number, reach: [number, number], dur: number, lean: [number, number]) => {
    let t = t0;
    let side = pickSide();
    for (let i = 0; i < n; i++) {
      const sd = side;
      later(t, () => {
        const s = free();
        if (s) spring(s, sd, rand(...reach), dur * rand(0.85, 1.2), i % 3 === 1 ? 'near' : undefined, pickLean(sd, lean));
      });
      t += rand(0.11, 0.24);
      side = Math.random() < 0.7 ? (-side as 1 | -1) : side;
    }
  };

  /** Where a stream is, `a` radii along on a token `w` px across, in its radii from the centre (+y down): as the shader draws it, without its wave. */
  const lineAt = (s: Stream, a: number, w: number) => {
    const { curl, slope } = lie(s, w);
    const edge = rimAt(s.y0);
    const fr = a - edge + (s.kind === 'near' ? 0.16 : 0);
    const fo = Math.max(fr, 0);
    let y = s.y0 + (wraps(s) ? 0 : lift(s.y0) * (1 - Math.exp(-fo / 0.55))) + slope * fr + curl * fo * fo;
    if (s.kind === 'front') {
      const back = rimAt(s.y0 - slope * 2 * edge);
      y += 0.22 * Math.sin(Math.PI * clamp((a + back) / (back + edge))) ** 2;
    }
    return y;
  };
  /**
   * How a stream lies on a token `w` px across: its slope and its curl (in
   * its radii), so its head ends where it heads within the room there is, a
   * little of the way on its slope and most of it curling up (or down) at
   * the end, so the part near the token lies sideways. (A wrapping one's
   * slope stays gentle, as its way runs on across the token.)
   */
  const lie = (s: Stream, w: number) => {
    const sp = span(w);
    const end = s.lean < 0 ? s.lean * sp.up : s.lean * sp.down;
    const run = Math.max(0.6, s.reach * sp.reach - rimAt(s.y0) + (s.kind === 'near' ? 0.16 : 0));
    const to = end + 0.22 * slack * (1 + s.reach * 0.3) - s.y0 - (wraps(s) ? 0 : lift(s.y0));
    // (A front one's no steeper than keeps it below the letter at the face's middle.)
    const most = s.kind === 'front' ? Math.min(0.28, (s.y0 - 0.2) / rimAt(s.y0)) : 0.28;
    const slope = wraps(s) ? clamp((to * 0.4) / run, -0.22, most) : (to * 0.4) / run;
    // (Never steeper at its head than about 50°: its kinks and ends are laid
    // out along its way across, so a cord turned upright would smear into
    // streaks; it rises less instead.)
    let curl = (to - slope * run) / (run * run);
    const atHead = slope + 2 * curl * run;
    if (Math.abs(atHead) > 1.2) curl = (Math.sign(atHead) * 1.2 - slope) / (2 * run);
    return { curl: clamp(curl, -1.9, 1.9), slope };
  };
  /**
   * Where a wrapping stream's root is, round on the token's far side (radii
   * along its way, below 0): past where its straight way back meets the far
   * rim, as the shader has it, so it's seen coming out from behind there
   * before it crosses the face (a front one) or a stub running on past it
   * (a back one); further on a big token, with room round it.
   */
  const startOf = (s: Stream, w: number) => {
    const { slope } = lie(s, w);
    const y0 = s.y0 + 0.15 * slack;
    const back = rimAt(y0 - slope * 2 * rimAt(y0));
    return -back - (s.kind === 'back' ? 0.25 + 0.5 * big(w) : 0.2 + 0.35 * big(w));
  };
  /** Where its tail rests while it's out (in the radii its head and tail are kept in, before `span`'s reach): 0, or a wrapping one's root. */
  const restOf = (s: Stream) => (wraps(s) ? startOf(s, box.w) / span(box.w).reach : 0);

  /** Sparks flicked off a stream's frayed head as a pulse lands there, flying on its way. */
  const sparks = (s: Stream) => {
    const tok = tokR(box);
    const sc = box.w / 32;
    const sp = span(box.w);
    const n = budget(box.w < 40 ? 1 : 2);
    const a = s.head * sp.reach;
    const y = lineAt(s, a, box.w);
    const dy = y - lineAt(s, a - 0.3, box.w);
    const dir = Math.atan2(dy, 0.3);
    for (let i = 0; i < n; i++) {
      const ang = dir + rand(-0.35, 0.35);
      const v = rand(60, 110) * Math.sqrt(sc);
      particle({
        x: box.x + s.side * (a - rand(0, 0.3)) * tok,
        y: box.y + y * tok,
        vx: s.side * Math.cos(ang) * v,
        vy: Math.sin(ang) * v,
        life: rand(0.3, 0.5),
        size: rand(0.6, 0.95) * Math.sqrt(sc),
        sizeEnd: 0.3,
        color: [1.7, 1.35, 2.5],
        colorEnd: [0.5, 0.2, 1.3],
        drag: 3.2,
        stretch: 0.07,
        shape: Shape.Spark,
        fadeIn: 0.02,
        delay: rand(0, 0.08),
      });
    }
  };

  /** Moves a stream on by dt. */
  const move = (s: Stream, dt: number) => {
    if (s.state === 'gone') return;
    s.t += dt;
    const x = clamp(s.t / s.dur);
    // (Slack: a falter stalls its ripple.)
    s.ph += dt * s.drift * (1 - 0.8 * slack);
    // Its head on a spring: thrown out or pulled back, it swings back past where it was and settles.
    s.kickV += (-40 * s.kick - 7 * s.kickV) * dt;
    s.kick += s.kickV * dt;
    const reach = Math.max(0.9, s.reach * (1 + 0.05 * s.breathe(age)) + s.kick);
    const rest = restOf(s);
    if (s.state === 'gather') {
      s.head = reach;
      s.tail = s.t < 0 ? reach : s.reach + (rest - s.reach) * outCubic(x);
      if (x >= 1) Object.assign(s, { state: 'live', t: 0, dur: rand(3, 5.5) });
    } else if (s.state === 'grow') {
      const h0 = wraps(s) ? rest + 0.3 : 0.4;
      s.head = s.t < 0 ? h0 : h0 + (reach - h0) * outCubic(x);
      s.tail = rest;
      // (The one wrapped across the face stays longest, so it's nearly always there.)
      if (x >= 1) Object.assign(s, { state: 'live', t: 0, dur: rand(3, 5.5) * (0.7 + 0.3 * vigor) * (s.kind === 'front' ? 1.5 : 1) });
    } else if (s.state === 'live') {
      s.head = reach;
      s.tail = rest;
      if (x >= 1) letGo(s, rand(1.2, 1.7), rand(0.1, 0.22));
    } else if (s.state === 'go') {
      s.head += dt * s.fling;
      s.tail = s.from + (s.head - s.from) * x ** 1.4;
      if (x >= 1) Object.assign(s, { state: 'gone', t: 0, surge: -1 });
    }
    // Its pulses: now and then one runs out along it, quick from the root and
    // slowing as it reaches the head, where it flicks sparks off.
    if (s.state !== 'grow' && s.state !== 'live') return;
    if (s.surge < 0) {
      s.nextSurge -= dt;
      if (s.nextSurge <= 0) s.surge = 0;
      return;
    }
    const before = s.surge;
    s.surge += dt / s.surgeDur;
    if (before < 0.85 && s.surge >= 0.85) {
      s.kickV += 1.2;
      sparks(s);
    }
    if (s.surge >= 1.2) {
      s.surge = -1;
      s.surgeDur = rand(0.8, 1.2);
      s.nextSurge = rand(1.6, 4);
    }
  };

  /** The pulse's place along a stream, eased: quick from the root, slowing as it reaches the head. */
  const surgeAt = (s: Stream) => (s.surge < 0 ? -1 : s.surge > 1 ? s.surge : outCubic(s.surge));

  const shapes = [
    // Her light, behind the token and on its face.
    auraShape(ctx, (f, _age, b) => {
      const tok = tokR(b);
      f.hw = (tok * 3.2) / 0.72;
      f.hh = (tok * 2.0) / 0.72;
      f.k = (0.8 + 0.2 * big(b.w)) * clamp(age / 0.5);
      // How strong the streams are at each side now: a little brighter as a pulse leaves the root.
      let l = 0;
      let r = 0;
      for (const s of streams) {
        if (s.state === 'gone') continue;
        const at = surgeAt(s);
        const on = clamp(1 - s.tail / Math.max(1, s.head)) * clamp((s.head - 0.8) / 0.6) * s.light * (1 + (at >= 0 ? 0.3 * clamp(1 - at * 3) : 0));
        if (s.side < 0) l += on;
        else r += on;
      }
      f.q[0] = tok;
      f.q[1] = glow;
      f.q[2] = 0;
      f.q[3] = flare;
      f.q[4] = (0.8 + 0.2 * Math.min(glow, 1.2)) * (0.6 + 0.4 * vigor);
      f.q[5] = clamp(l * 0.55);
      f.q[6] = clamp(r * 0.55);
      f.q[7] = drift;
      f.q[9] = chill;
      f.q[10] = 0;
      f.q[11] = 0;
    }),
    // The streams.
    ...streams.map((s) =>
      auraShape(ctx, (f, _age, b) => {
        const tok = tokR(b);
        if (s.state === 'gone') {
          f.hw = f.hh = 1;
          f.k = 0;
          return;
        }
        const sp = span(b.w);
        const { curl, slope } = lie(s, b.w);
        const head = s.head * sp.reach;
        const tail = s.tail * sp.reach;
        // (Its quad reaches past its head, and a wrapping one's past its root on the far side.)
        const far = Math.max(head, -tail) + 0.9;
        const amp = s.amp * sp.wave * (1 + 0.8 * slack);
        const high = Math.max(
          Math.abs(s.y0),
          Math.abs(lineAt(s, far, b.w)),
          wraps(s) ? Math.max(Math.abs(lineAt(s, tail, b.w)), Math.abs(lineAt(s, 0, b.w))) : 0,
        );
        f.hw = (far * tok) / 0.62;
        f.hh = ((high + amp * 1.5 + 0.8) * tok + 3) / 0.5;
        f.k = (0.8 + 0.2 * big(b.w)) * clamp(age / 0.5);
        f.calm = s.surge < 0 && s.state !== 'go' && !(s.state === 'grow' && s.dur < 0.8) && Math.abs(s.kickV) < 0.3;
        // (Let go, it fades as it goes, rather than leave a scrap of itself flying.)
        const going = s.state === 'go' ? 1 - 0.97 * clamp(s.t / s.dur) ** 0.7 : 1;
        f.q[0] = tok;
        f.q[1] = head * tok;
        f.q[2] = s.side * (10 * KIND[s.kind] + 2 + curl);
        f.q[3] = s.light * glow * (0.55 + 0.45 * vigor) * (1 - 0.35 * slack) * going;
        f.q[4] = (s.y0 + 0.15 * slack) * tok;
        f.q[5] = slope;
        f.q[6] = amp * tok;
        f.q[7] = s.ph;
        f.q[9] = surgeAt(s);
        f.q[10] = tail * tok;
        f.q[11] = s.hue + Math.floor(clamp(chill) * 99);
      }),
    ),
  ];

  // She comes with her power about her: streams out already, more springing.
  spring(streams[0], -1, rand(2.1, 2.6), 0.01, 'far', rand(-0.9, -0.4));
  Object.assign(streams[0], { state: 'live', dur: rand(2, 4) });
  spring(streams[1], 1, rand(2.1, 2.6), 0.01, 'front', rand(-0.6, 0));
  Object.assign(streams[1], { state: 'live', dur: rand(4, 6), nextSurge: rand(0.3, 1.2) });
  spring(streams[2], 1, rand(2.1, 2.7), 1.3, 'back');
  streams[2].t = 0.6;
  spring(streams[3], -1, rand(2.0, 2.6), 1.4);
  streams[3].t = -0.35;

  const react = (e: AuraEvent) => {
    switch (e.kind) {
      case 'arrive': {
        // Drawn in out of the dark: streams run in to her from both sides, one
        // after another, and her light kindles as they land.
        queue = [];
        for (const s of streams) letGo(s, 0.3, 0.6);
        glow = Math.min(glow, 0.15);
        let side: 1 | -1 = Math.random() < 0.5 ? -1 : 1;
        for (let i = 0; i < 4; i++) {
          const s = free();
          if (!s) break;
          s.side = side;
          s.reach = rand(2.3, 2.9);
          shapeLine(s, i % 3 === 1 ? 'near' : undefined);
          Object.assign(s, { state: 'gather', t: -i * rand(0.12, 0.22), dur: rand(0.8, 1.0), head: s.reach, tail: s.reach });
          side = Math.random() < 0.75 ? (-side as 1 | -1) : side;
        }
        later(0.95, () => (flare = Math.max(flare, 0.7)));
        nextSpring = 2.5;
        break;
      }
      case 'vote':
        // A pulse of her might down each stream, one after another.
        for (const s of streams) surge(s, rand(0, 0.45), 0.6);
        flare = Math.max(flare, 0.3);
        break;
      case 'score': {
        // Her might wells up: pulses ripple through the streams, and new ones
        // spring out one after another, rising, longer; a streak keeps more out.
        const n = Math.max(1, e.streak);
        power = clamp(Math.max(power, 0.22 * n + 0.1));
        flare = Math.max(flare, 0.55);
        glow = Math.max(glow, 1.25);
        for (const s of streams) {
          surge(s, rand(0, 0.6), 0.6);
          if (s.state === 'live') s.reach = Math.min(3.6, s.reach + 0.3);
        }
        const m = Math.min(n, 4);
        welling(Math.min(2 + Math.floor(n / 2), 4), 0.05, [2.6 + 0.15 * m, 3.1 + 0.15 * m], 0.55, [-1, -0.25]);
        nextSpring = Math.max(nextSpring, 1.2);
        break;
      }
      case 'miss':
        // Her power falters: the streams go slack and sag, their light drains
        // cold, then they gather themselves again.
        chill = 1;
        slack = 1;
        flare = 0;
        glow = Math.min(glow, 0.55);
        power *= 0.5;
        for (const s of streams) {
          s.surge = -1;
          s.nextSurge = rand(1.5, 2.5);
          s.kickV -= 1.5;
        }
        break;
      case 'hurt':
        // A blow tears it away: every stream torn off and flung out; her light
        // gutters, and fewer come back, and dimmer, as lives run out.
        queue = [];
        for (const s of streams) letGo(s, rand(0.35, 0.5), rand(1.6, 2.4));
        vigor = e.left <= 0 ? 0.35 : e.left === 1 ? 0.6 : Math.min(vigor, 0.8);
        chill = Math.max(chill, 0.7);
        glow = 0.2;
        flare = 0;
        power = 0;
        nextSpring = 1.3;
        break;
      case 'win':
        // Unholy Might at its full: streams spring out on both sides one after
        // another, rising high, and her light blazes.
        power = 1;
        vigor = 1;
        flare = Math.max(flare, 0.8);
        glow = 1.8;
        for (const s of streams) surge(s, rand(0, 0.8), 0.55);
        welling(7, 0, [3, 3.7], 0.6, [-1, -0.15]);
        nextSpring = 2;
        break;
      case 'touch':
        // The streams recoil from the touch and lash out again, a pulse
        // crackling down each as it does.
        for (const s of streams) {
          if (!out(s)) continue;
          s.kickV -= rand(10, 12);
          surge(s, rand(0.15, 0.25), 0.3);
        }
        flare = Math.max(flare, 0.45);
        break;
    }
  };

  return {
    react,
    step(dt, b) {
      box = b;
      age += dt;
      drift += dt * 0.12;
      flare *= Math.exp(-dt * 1.5);
      chill *= Math.exp(-dt * 0.7);
      slack *= Math.exp(-dt * 0.8);
      power = Math.max(0, power - dt / 35);
      // Her light: at rest a little brighter on a streak and dimmer as lives
      // are lost, breathing slowly; it rises quicker than it settles.
      const rest = (0.95 + 0.25 * power) * (0.55 + 0.45 * vigor) * (1 + 0.08 * breathe(age)) * (1 + 0.04 * sway(age * 1.7));
      glow = ease(glow, rest, glow > rest ? 1.1 : 1.8, dt);
      if (queue.length) {
        for (const q of queue) q.t -= dt;
        const due = queue.filter((q) => q.t <= 0);
        queue = queue.filter((q) => q.t > 0);
        for (const q of due) q.go();
      }

      for (const s of streams) move(s, dt);

      // Another springs once one has gone, while she keeps fewer out than she wants.
      nextSpring -= dt;
      if (nextSpring <= 0 && streams.filter(out).length < want()) {
        const s = free();
        if (s) spring(s, pickSide(), rand(2.0, 2.8) * (1 + 0.15 * power) * (0.8 + 0.2 * vigor), rand(1.1, 1.6));
        nextSpring = rand(0.5, 1.6);
      }

      dark.show(clamp(age / 0.8) * (0.65 + 0.35 * vigor) * (b.w < 40 ? 0.85 : 1));
    },
    stop() {
      for (const s of shapes) s.stop();
      dark.remove();
    },
  };
}
