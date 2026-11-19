// The mirror aura (lib/auraKinds.ts): the token's face become the glass of
// the Mirror of Kalandra, which "creates a mirrored copy", its image
// reversed; Kalandra's lake gave her that power, Wraeclast reflected in it.
//
// Inside the face, the mirror: now and then the glass turns and catches the
// light, a sheen crossing the face, and in the sheen the wearer's own
// reflection slides past, reversed and deeper in the glass (it moves at half
// the sheen's pace), the rim catching the light at either end. As it catches
// the light it throws it off sideways, a shaft of silver swinging out from
// the face and fading.
//
// Outside, the Mirror's glitter: motes drifting slowly either side of the
// wearer, near and far (the token hides those behind it), each lit as a
// shaft passes it, and now and then of itself, with the Mirror's
// four-pointed star. Cold silver light seeps from behind the token.
//
// What happens to the player: a score opens the glass's depths, mirror
// within mirror down into the face, one more for each answer in the run
// (up to five), as the glass throws its light both ways at once and all the
// glitter flares; a vote turns the glass once, quickly; a touch turns it,
// the glitter sparkles and the glass cracks a little, a hairline running in
// from near the rim that heals after a few seconds (more touches, more
// hairlines, up to four); arriving, the glitter gathers and the glass
// turns; a miss breaks the glass: cracks race out from where it is struck,
// the face splits along them into shards a little out of true, a few fall
// away tumbling and glinting, and the glass heals; a lost life breaks it
// harder (all the outer glass falls; the last life, all of it), and for each
// life lost the glass turns less often and the glitter thins; a win opens
// the depths whole, its light swinging round both ways.
//
// At rest, besides: the glass's bevel catching the light inside its rim, and
// on an uneven beat the Mirror's glint, its four-pointed star at the edge
// with a fine line of silver laid sideways through the token.
//
// The light is the shader's (mirror.glsl.ts); the reflection is a copy of
// the token in the layer over its face, kept within the disc.

import { particle } from '../core';
import { Shape } from '../particles';
import { auraShape, type AuraContext, type AuraEvent, type Burning } from './common';

const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

/** The reflection as the glass shows it: pale, cool, its darks lifted, so the face's own letter reads through it. */
const REFLECTED = 'saturate(0.6) brightness(1.45) contrast(0.7)';
/** How deep in the glass the reflection lies: it moves at this share of the sheen's pace. */
const DEPTH = 0.5;

/** A shaft of light thrown off the glass: its angle (rad, 0 to the right, +y down), how it swings (rad/s), when it was thrown, how bright and how long. */
type Shaft = { ang: number; swing: number; at: number; k: number; len: number };

/**
 * A shard of the broken glass: its element (a copy of the face, cut to its
 * outline) and the light on it; its middle and which way it was knocked (in
 * the token's radii); whether it falls, and if so when, how fast (px/s),
 * how it turns and tumbles (rad/s) and about what axis.
 */
type Shard = {
  el: HTMLElement;
  sheen: HTMLElement;
  cx: number;
  cy: number;
  kx: number;
  ky: number;
  falls: boolean;
  delay: number;
  vx: number;
  vy: number;
  spin: number;
  tumble: number;
  ax: number;
  ay: number;
  phase: number;
  thrown: boolean;
};
/**
 * The glass breaking: where it was struck (in the token's radii), the cracks'
 * angles as the shader draws them (base, how many, their wander), the ring
 * round the impact, when it broke, how hard (0 a miss, 1 a lost life, 2 the
 * last), when it heals and how long that takes; its layer, the dark behind
 * the glass, and its shards.
 */
type Break = {
  px: number;
  py: number;
  base: number;
  n: number;
  wander: number;
  ring: number;
  at: number;
  hard: number;
  heal: number;
  healTime: number;
  host: HTMLElement;
  back: HTMLElement;
  shards: Shard[];
};
/** How a break goes, by how hard: cracks, when the shards fall, when the glass heals and how long it takes. */
const BREAKS = [
  { n: 6, fall: 0.24, heal: 1.0, healTime: 0.5 },
  { n: 8, fall: 0.22, heal: 1.3, healTime: 0.65 },
  { n: 9, fall: 0.2, heal: 1.8, healTime: 0.95 },
];
const TAU = Math.PI * 2;
/**
 * A fine crack a touch leaves: its code for the shader (a whole pattern
 * number times 8, plus where on the face it starts, rad) and when it came.
 */
type Chip = { code: number; at: number };
/** How long a touch's crack lasts, healing included (s); the shader draws none past 4.2. */
const CHIP_LIFE = 4;

const div = (style: Partial<CSSStyleDeclaration>) => {
  const d = document.createElement('div');
  Object.assign(d.style, { position: 'absolute', pointerEvents: 'none', ...style });
  return d;
};

export function burn(ctx: AuraContext): Burning {
  const seed = Math.random();
  let clock = 0;
  let drawn = 32;

  // The glass: the face's disc, over it. In it, a band that travels with the
  // sheen, and in the band the reflection, reversed, travelling slower.
  const glass = div({ inset: '0', borderRadius: '50%', overflow: 'hidden' });
  const band = div({ inset: '-30% 15%', opacity: '0', visibility: 'hidden', willChange: 'transform, opacity' });
  const soft = 'linear-gradient(to right, transparent, #000 38%, #000 62%, transparent)';
  band.style.setProperty('mask-image', soft);
  band.style.setProperty('-webkit-mask-image', soft);
  const inner = div({ left: '-21.4286%', top: '18.75%', width: '142.857%', height: '62.5%', willChange: 'transform' });
  const twin = div({ inset: '0', transform: 'scale(-1.08, 1.08)' });
  inner.append(twin);
  band.append(inner);
  // The reflection that always stands in the glass, faint, drifting a little
  // as the glass sways (so the face never looks a plain token).
  const standing = div({ inset: '0', opacity: '0', willChange: 'transform, opacity' });
  // The cloud a miss leaves on the glass.
  const cloud = div({ inset: '0', borderRadius: '50%', background: 'radial-gradient(closest-side, rgba(70, 74, 80, 0.25), rgba(40, 43, 48, 0.6))', opacity: '0' });
  glass.append(standing, band, cloud);
  ctx.over.append(glass);
  let stale = true;
  // The avatar changes (dimmed, turned face down, another sigil): the reflection is taken again.
  const ours = (n: Node) => !!(n instanceof Element ? n : n.parentElement)?.closest('.aura-under, .aura-over');
  const watch = new MutationObserver((ms) => {
    if (ms.some((m) => !ours(m.target))) stale = true;
  });
  watch.observe(ctx.el, { attributes: true, childList: true, subtree: true, characterData: true });

  /**
   * A turn of the glass: the sheen's way (rad, near level, so the band
   * stands near upright), which way it travels, how far through it is and
   * how long it takes; whether it has thrown its light yet; when the next one comes.
   */
  const turn = { way: rand(-0.35, 0.35), dir: 1, t: 1, time: 2, threw: true, strength: 1, next: rand(0.3, 2) };
  let at = 1.7;
  const shafts: Shaft[] = [
    { ang: 0, swing: 0, at: -99, k: 0, len: 2.2 },
    { ang: Math.PI, swing: 0, at: -99, k: 0, len: 2.2 },
  ];
  let slot = 0;
  /** The glitter's own clock (it drifts slower when the glass is clouded), its sparkle, and how much of it shows. */
  let drift = Math.random() * 100;
  let sparkle = 0;
  let glitter = 1;
  /** The glass's depths (mirrors within it) and how many are wanted, until when. */
  let depths = 0;
  let depthsFor = 0;
  let depthsUntil = 0;
  let power = 0;
  let tarnish = 0;
  let flash = 0;
  let vigor = 1;
  let shown = '';
  let clouded = '';
  let standOp = '';
  /** The Mirror's glint: on an uneven beat, now and then twice running; how bright this one is. */
  let glintAt = -99;
  let glintK = 1;
  let nextGlint = rand(0.6, 2.2);
  /** The token's box as last drawn (for where loose glints set out from). */
  let box = { x: 0, y: 0, w: 32 };
  let broken: Break | null = null;
  /** The fine cracks touches have left, up to four; a new one takes the oldest's place. */
  const chips: Chip[] = Array.from({ length: 4 }, () => ({ code: 0, at: -99 }));
  const chipping = () => chips.some((c) => clock - c.at < CHIP_LIFE);
  /** A touch cracks the glass a little: a hairline from near the rim, somewhere new. */
  const chip = () => {
    const c = chips.reduce((o, x) => (x.at < o.at ? x : o));
    c.code = Math.floor(rand(1, 500)) * 8 + rand(0, TAU);
    c.at = clock;
  };

  /** Takes a break's layer away. */
  const mend = () => {
    broken?.host.remove();
    broken = null;
  };

  /**
   * Breaks the glass, `hard` 0 (a miss) to 2 (the last life): cracks race
   * out from where it is struck, the face splits along them into shards, the
   * loose ones fall away tumbling, and the glass heals.
   */
  const shatter = (hard: number) => {
    mend();
    // (The glass that heals after takes a touch's small cracks with it.)
    for (const c of chips) c.at = -99;
    const spec = BREAKS[hard];
    const n = spec.n;
    const hit = rand(0, TAU);
    const dist = rand(0.12, 0.4);
    const px = Math.cos(hit) * dist;
    const py = Math.sin(hit) * dist;
    const base = rand(0, TAU);
    const wander = rand(0, 10);
    const ring = rand(0.3, 0.4);
    // The cracks' angles, as the shader draws them.
    const angles = Array.from({ length: n + 1 }, (_, i) => base + ((i % n) + 0.35 * Math.sin((i % n) * 2.7 + wander)) * (TAU / n) + (i === n ? TAU : 0));
    // Where each crack meets the rim.
    const exits = angles.map((a) => {
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const pd = px * dx + py * dy;
      const t = -pd + Math.sqrt(Math.max(pd * pd - (px * px + py * py - 1), 0));
      return { x: px + t * dx, y: py + t * dy };
    });
    const pt = (x: number, y: number) => `${(50 + 50 * x).toFixed(2)}% ${(50 + 50 * y).toFixed(2)}%`;
    const onRing = (a: number) => ({ x: px + ring * Math.cos(a), y: py + ring * Math.sin(a) });

    const host = div({ inset: '0' });
    const back = div({ inset: '0', borderRadius: '50%', background: 'radial-gradient(circle at 40% 35%, rgb(26, 32, 48), rgb(6, 8, 14) 75%)', opacity: '0' });
    host.append(back);
    const shards: Shard[] = [];
    const R = box.w / 2;
    const make = (poly: { x: number; y: number }[], inner: boolean) => {
      const cx = poly.reduce((s, p) => s + p.x, 0) / poly.length;
      const cy = poly.reduce((s, p) => s + p.y, 0) / poly.length;
      let kx = cx - px;
      let ky = cy - py;
      const kl = Math.hypot(kx, ky) || 1;
      kx /= kl;
      ky /= kl;
      const el = div({ inset: '0', opacity: '0', willChange: 'transform, opacity', transformOrigin: pt(cx, cy) });
      el.style.clipPath = `polygon(${poly.map((p) => pt(p.x, p.y)).join(', ')})`;
      // The face as this piece of glass holds it: a little out of true with
      // its neighbours, as a broken mirror's pieces are, each its own brightness.
      const face = ctx.copyFace();
      face.style.filter = `brightness(${rand(0.85, 1.2).toFixed(2)}) saturate(${rand(0.8, 1.05).toFixed(2)})`;
      const knock = div({ inset: '0', transform: `translate(${(kx * rand(0.02, 0.06) * 100).toFixed(1)}%, ${(ky * rand(0.02, 0.06) * 100).toFixed(1)}%) rotate(${rand(-4, 4).toFixed(1)}deg)` });
      knock.append(face);
      const sheen = div({ inset: '0', opacity: '0', background: `linear-gradient(${rand(0, 180).toFixed(0)}deg, transparent 25%, rgba(236, 244, 255, 0.85) 50%, transparent 75%)` });
      el.append(knock, sheen);
      host.append(el);
      const falls = hard === 2 || (hard === 1 ? !inner || Math.random() < 0.35 : !inner && Math.random() < 0.5);
      // (They fall sideways more than down: out the way the blow sent them.)
      const speed = rand(1.3, 2.4) * (1 + 0.3 * hard) * R;
      const ax = rand(-1, 1);
      shards.push({
        el,
        sheen,
        cx,
        cy,
        kx,
        ky,
        falls,
        delay: rand(0, 0.12) + (inner ? 0.06 : 0),
        vx: kx * speed + Math.sign(kx || 1) * 0.7 * R,
        vy: ky * speed * 0.45 - 0.5 * R,
        spin: rand(2, 6) * (Math.random() < 0.5 ? -1 : 1),
        tumble: rand(4, 9) * (Math.random() < 0.5 ? -1 : 1),
        ax,
        ay: Math.sqrt(Math.max(0, 1 - ax * ax)),
        phase: rand(0, TAU),
        thrown: false,
      });
    };
    for (let i = 0; i < n; i++) {
      const a0 = angles[i];
      const a1 = angles[i + 1];
      const ringArc = [1, 2, 3].map((k) => onRing(a0 + ((a1 - a0) * k) / 4));
      const q0 = onRing(a0);
      const q1 = onRing(a1);
      make([{ x: px, y: py }, q0, ...ringArc, q1], true);
      // Out past the rim a little, so the piece takes the rim with it.
      const e0 = exits[i];
      const e1 = exits[i + 1];
      const t0 = Math.atan2(e0.y, e0.x);
      const span = (((Math.atan2(e1.y, e1.x) - t0) % TAU) + TAU) % TAU;
      const rim = [0, 1, 2, 3, 4].map((k) => ({ x: 1.25 * Math.cos(t0 + (span * k) / 4), y: 1.25 * Math.sin(t0 + (span * k) / 4) }));
      make([q0, e0, ...rim, e1, q1, ...ringArc.slice().reverse()], false);
    }
    // At least two pieces fall on a miss.
    if (hard === 0 && shards.filter((s) => s.falls).length < 2) for (const s of shards.filter((_s, i) => i % 2 === 1).slice(0, 2)) s.falls = true;
    ctx.over.append(host);
    broken = { px, py, base, n, wander, ring, at: clock, hard, heal: spec.heal, healTime: spec.healTime, host, back, shards };
  };

  /** Turns the glass: the sheen crosses the face in `time` s, and halfway it throws its light. */
  const turnGlass = (time: number, strength = 1) => {
    turn.dir = Math.random() < 0.5 ? -1 : 1;
    turn.way = rand(-0.35, 0.35);
    turn.t = 0;
    turn.time = time;
    turn.threw = false;
    turn.strength = strength;
  };
  /** Throws a shaft of light off the glass, at `ang`, swinging `swing` rad/s. */
  const throwLight = (ang: number, k: number, len: number, swing: number) => {
    const s = shafts[slot];
    slot = 1 - slot;
    Object.assign(s, { ang, k, len, swing, at: clock });
  };
  /** Its light now, from when it was thrown: quick to come, slow to go. */
  const shaftLight = (s: Shaft) => {
    const a = clock - s.at;
    return a < 0 ? 0 : s.k * smooth(0, 0.2, a) * Math.exp(-Math.max(0, a - 0.2) / 0.6);
  };

  /** The glint's light now: sharp to come, quick to go. */
  const glintLight = () => {
    const a = clock - glintAt;
    return a < 0 ? 0 : glintK * smooth(0, 0.06, a) * Math.exp(-Math.max(0, a - 0.06) / 0.3);
  };

  const busy = () => !!broken || clock - glintAt < 1.2 || turn.t < 1 || shafts.some((s) => clock - s.at < 2.5) || Math.abs(depths - depthsFor) > 0.01 || depths > 0.01 || flash > 0.02;

  const shapes: { stop: () => void }[] = [];
  // The glass's own light.
  shapes.push(
    auraShape(ctx, (f, _age, b) => {
      const R = b.w / 2;
      const reach = (0.7 + 0.13 * R) * 2.4;
      f.hw = (R + 2.6 * reach + 0.5 * R + 3) / 0.72;
      f.hh = (R + 0.9 * reach + 0.4 * R + 3) / 0.72;
      f.k = (0.78 + 0.22 * smooth(32, 64, b.w)) * (0.65 + 0.35 * vigor);
      f.calm = !busy();
      f.q[0] = -R;
      f.q[1] = (0.75 + 0.5 * power) * (0.85 + 0.15 * Math.sin(clock * 0.31 + seed * 9));
      f.q[2] = clamp(tarnish + 0.4 * (1 - vigor));
      f.q[3] = flash;
      // (At rest the glass keeps a depth or so of its own, breathing, faint.)
      f.q[4] = clamp(depths / 2);
      f.q[5] = Math.max(depths, (1.1 + 0.35 * Math.sin(clock * 0.23 + seed * 5)) * (1 - 0.6 * tarnish));
      f.q[6] = 0.32 * Math.sin(clock * 0.37 + seed * 7);
      f.q[7] = 0.2 * Math.sin(clock * 0.29 + seed * 3);
      f.q[9] = turn.way;
      f.q[10] = glintLight() * (broken ? 0 : 1);
      f.q[11] = at;
    }),
  );
  // What the glass throws out: the shafts and the glitter.
  shapes.push(
    auraShape(ctx, (f, _age, b) => {
      const R = b.w / 2;
      const len = Math.max(shafts[0].len, shafts[1].len);
      f.hw = (Math.max(3.4 * 1.4 * R, (len * 2.6 + 0.4) * R) + 2 * R + 4) / 0.72;
      f.hh = (1.3 * R + Math.max(0, len * 2.6 * R * 0.34 - 1.3 * R) + 4) / 0.62;
      f.k = (0.7 + 0.3 * smooth(32, 64, b.w)) * (0.7 + 0.3 * vigor);
      f.calm = !busy();
      f.q[0] = R;
      f.q[1] = shafts[0].ang + shafts[0].swing * (clock - shafts[0].at);
      f.q[2] = shaftLight(shafts[0]);
      f.q[3] = len;
      f.q[4] = shafts[1].ang + shafts[1].swing * (clock - shafts[1].at);
      f.q[5] = shaftLight(shafts[1]);
      f.q[6] = sparkle;
      f.q[7] = clamp(tarnish + 0.4 * (1 - vigor));
      f.q[9] = drift;
      f.q[10] = glitter * (0.55 + 0.45 * vigor);
      f.q[11] = 0;
    }),
  );
  // The cracks of a break.
  shapes.push(
    auraShape(ctx, (f, _age, b) => {
      const R = b.w / 2;
      const k = broken;
      if (!k) {
        f.hw = f.hh = 1;
        f.k = 0;
        return;
      }
      const a = clock - k.at;
      const spec = BREAKS[k.hard];
      const hp = clamp((a - k.heal) / k.healTime);
      f.hw = f.hh = (2.6 * R + 6) / 0.62;
      f.k = 0.8 + 0.2 * smooth(32, 64, b.w);
      f.calm = false;
      f.q[0] = R;
      f.q[1] = k.px;
      f.q[2] = k.py;
      f.q[3] = a;
      f.q[4] = k.base;
      f.q[5] = k.n;
      f.q[6] = k.wander;
      f.q[7] = k.ring;
      // Bright as they race, a little less once the pieces fall, and as the
      // glass heals they glow once more as they knit, and are gone.
      f.q[9] = a < k.heal ? (a < spec.fall ? 1 : 1 - 0.55 * smooth(spec.fall, spec.fall + 0.3, a)) : (1 - hp) * (0.45 + 1.1 * Math.sin(Math.PI * hp));
      f.q[10] = Math.exp(-a / 0.12) * (1 + 0.4 * k.hard);
      f.q[11] = 1;
    }),
  );

  // The fine cracks of touches.
  shapes.push(
    auraShape(ctx, (f, _age, b) => {
      const R = b.w / 2;
      if (!chipping()) {
        f.hw = f.hh = 1;
        f.k = 0;
        f.calm = true;
        return;
      }
      f.hw = f.hh = (R + 3) / 0.7;
      f.k = (0.8 + 0.2 * smooth(32, 64, b.w)) * (0.7 + 0.3 * vigor);
      f.calm = false;
      f.q[0] = R;
      const slots = [1, 2, 3, 4, 5, 6, 7, 9];
      chips.forEach((c, i) => {
        f.q[slots[2 * i]] = c.code;
        f.q[slots[2 * i + 1]] = clock - c.at;
      });
      f.q[10] = 0;
      f.q[11] = 2;
    }),
  );

  /** Moves a break on: its shards knocked out of true, the loose ones falling, then the glass healing. */
  const stepBreak = () => {
    const k = broken;
    if (!k) return;
    const a = clock - k.at;
    const spec = BREAKS[k.hard];
    const R = box.w / 2;
    const shown = a >= 0.1;
    const healed = smooth(k.heal, k.heal + 0.35, a);
    const out = smooth(0.1, 0.18, a) * (1 - healed);
    k.back.style.opacity = (smooth(0.1, 0.14, a) * (1 - smooth(k.heal + 0.1, k.heal + k.healTime, a))).toFixed(3);
    const eye = 6 * R;
    for (const s of k.shards) {
      const nudge = R * 0.05 * (1 + 0.5 * k.hard) * out;
      let x = s.kx * nudge;
      let y = s.ky * nudge;
      let o = shown ? 1 - smooth(k.heal + 0.25, k.heal + k.healTime, a) : 0;
      let rot = 0;
      let tum = 0;
      const t = a - spec.fall - s.delay;
      if (s.falls && t > 0) {
        x += s.vx * t;
        y += s.vy * t + 0.5 * 3.5 * R * t * t;
        rot = s.spin * t;
        tum = s.tumble * t;
        o = 1 - smooth(0.25, 0.75 + 0.15 * k.hard, t);
        // It catches the light as it tumbles.
        s.sheen.style.opacity = (0.75 * Math.pow(Math.max(0, Math.cos(tum + s.phase)), 4)).toFixed(3);
        if (!s.thrown) {
          s.thrown = true;
          particle({
            x: box.x + s.cx * R,
            y: box.y + s.cy * R,
            vx: s.vx,
            vy: s.vy,
            gravity: 3.5 * R,
            life: rand(0.5, 0.8),
            size: (1.4 + Math.random()) * Math.sqrt(box.w / 32),
            sizeEnd: 0.3,
            color: [1.3, 1.4, 1.6],
            colorEnd: [0.6, 0.75, 1.1],
            shape: Shape.Glint,
            flicker: 0.5,
          });
        }
      }
      const tf = `perspective(${eye.toFixed(0)}px) translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate3d(${s.ax.toFixed(2)}, ${s.ay.toFixed(2)}, 0.4, ${tum.toFixed(3)}rad) rotate(${rot.toFixed(3)}rad)`;
      s.el.style.transform = tf;
      s.el.style.opacity = Math.max(0, o).toFixed(3);
    }
    if (a > k.heal + k.healTime + 0.1) mend();
  };

  const react = (e: AuraEvent) => {
    switch (e.kind) {
      case 'arrive':
        // The glitter gathers, and the glass turns.
        glitter = 0;
        tarnish = 0;
        vigor = 1;
        turnGlass(1.6);
        break;
      case 'vote':
        // One quick turn.
        turnGlass(0.75, 1.1);
        break;
      case 'touch':
        // A turn, the glitter sparkles, and the glass cracks a little.
        turnGlass(1, 1);
        sparkle = Math.max(sparkle, 0.7);
        if (!broken) chip();
        break;
      case 'score': {
        // The depths open, mirror within mirror, one more for each answer in
        // the run; the glass throws its light both ways and the glitter flares.
        const n = Math.min(5, Math.max(1, e.streak));
        depthsFor = n + 1;
        depthsUntil = clock + 1.8 + 0.25 * n;
        power = Math.max(power, clamp(0.25 * e.streak));
        tarnish = 0;
        sparkle = 1;
        flash = 0.6 + 0.08 * n;
        const k = 1.2 + 0.15 * n;
        const len = 2.4 + 0.25 * n;
        throwLight(rand(-0.15, 0.15), k, len, rand(-0.12, 0.12));
        throwLight(Math.PI + rand(-0.15, 0.15), k, len, rand(-0.12, 0.12));
        turnGlass(1.1, 1.2);
        turn.threw = true;
        break;
      }
      case 'miss':
        // The glass breaks: a few pieces fall, and it heals; the glitter dims and stills.
        shatter(0);
        tarnish = 0.6;
        sparkle = 0;
        power *= 0.5;
        depthsFor = 0;
        for (const s of shafts) s.k *= 0.2;
        break;
      case 'hurt':
        // It breaks harder: the outer glass all falls, and the last life breaks it whole.
        shatter(e.left <= 0 ? 2 : 1);
        tarnish = 1;
        sparkle = 0;
        power = 0;
        depthsFor = 0;
        for (const s of shafts) s.k = 0;
        vigor = e.left <= 0 ? 0.3 : e.left === 1 ? 0.55 : Math.min(vigor, 0.8);
        break;
      case 'win':
        // The depths whole, the light swinging round both ways.
        vigor = 1;
        power = 1;
        tarnish = 0;
        sparkle = 1;
        flash = 1;
        depthsFor = 6;
        depthsUntil = clock + 3.2;
        throwLight(-0.2, 1.8, 3.4, 0.25);
        throwLight(Math.PI + 0.2, 1.8, 3.4, 0.25);
        turnGlass(1.4, 1.3);
        turn.threw = true;
        break;
    }
  };

  return {
    react,
    step(dt, b) {
      clock += dt;
      drawn = b.w;
      box = { x: b.x, y: b.y, w: b.w };
      const R = b.w / 2;
      stepBreak();

      // The Mirror's glint, on an uneven beat: now and then twice running,
      // now and then a long wait (longer as lives run out; none while broken).
      if (clock >= nextGlint && !broken) {
        glintAt = clock;
        glintK = rand(0.6, 1);
        nextGlint = clock + (Math.random() < 0.25 ? rand(0.22, 0.35) : rand(1.1, 4.2) / (0.5 + 0.5 * vigor));
      }

      // The glass turns now and then, less often as lives run out.
      if (turn.t >= 1) {
        turn.next -= dt * (0.5 + 0.5 * vigor);
        if (turn.next <= 0) {
          turnGlass(rand(1.5, 2.6));
          turn.next = rand(0.8, 2.4);
        }
      }
      turn.t = Math.min(1, turn.t + dt / turn.time);
      const x = ease(turn.t);
      at = turn.t >= 1 ? 1.7 : turn.dir * (-1.7 + 3.4 * x);
      // Halfway across it throws the light it caught, out the way it travels
      // (a small token, in a list, throws it mostly to its left: its
      // player's name sits to the right).
      if (!turn.threw && turn.t >= 0.5) {
        turn.threw = true;
        let toLeft = turn.dir < 0;
        if (drawn < 48 && Math.random() < 0.6) toLeft = true;
        // (Near level, and swinging a little toward level: it spreads sideways, not up and down.)
        const tilt = rand(-0.2, 0.2);
        const ang = (toLeft ? Math.PI : 0) + tilt;
        throwLight(ang, (0.75 + 0.25 * vigor) * (1 - 0.7 * tarnish) * turn.strength, 2.1 + 0.3 * power, -Math.sign(tilt) * rand(0.1, 0.2));
      }

      // The reflection in the sheen: shown while the sheen is on the face.
      const on = turn.t < 1 ? smooth(1.45, 0.6, Math.abs(at)) : 0;
      const op = (on * 0.32 * (1 - 0.6 * tarnish) * (drawn < 40 ? 0.75 : 1)).toFixed(3);
      if (op !== shown) {
        band.style.opacity = shown = op;
        band.style.visibility = on > 0 ? 'visible' : 'hidden';
      }
      if (stale) {
        for (const holder of [twin, standing]) {
          const copy = ctx.copyFace();
          copy.style.filter = REFLECTED;
          holder.replaceChildren(copy);
        }
        stale = false;
      }
      // The standing reflection: reversed, a little deeper, swaying slowly.
      const stand = ((drawn < 40 ? 0.1 : 0.13) * (1 - 0.7 * tarnish) * (1 - 0.6 * on)).toFixed(3);
      if (stand !== standOp) standing.style.opacity = standOp = stand;
      standing.style.transform = `translate(${(Math.sin(clock * 0.21 + seed * 6) * 0.14 * R).toFixed(2)}px, ${(Math.sin(clock * 0.17 + seed * 2) * 0.05 * R).toFixed(2)}px) scale(-0.94, 0.94)`;
      if (on > 0) {
        const X = at * R;
        band.style.transform = `rotate(${turn.way.toFixed(4)}rad) translateX(${X.toFixed(2)}px)`;
        inner.style.transform = `translateX(${(-X * (1 - DEPTH)).toFixed(2)}px) rotate(${(-turn.way).toFixed(4)}rad)`;
      }
      const cl = (tarnish * 0.9).toFixed(3);
      if (cl !== clouded) cloud.style.opacity = clouded = cl;

      // The depths: open while the run is fresh, then closing.
      if (clock > depthsUntil) depthsFor = 0;
      depths += (depthsFor - depths) * (1 - Math.exp(-dt * (depthsFor > depths ? 5 : 2.2)));

      // The glitter drifts (stilled by a cloud), gathers, and its sparkle settles.
      drift += dt * (1 - 0.8 * tarnish) * (0.6 + 0.4 * vigor);
      glitter = Math.min(1, glitter + dt / 1.4);
      sparkle *= Math.exp(-dt / 0.9);
      power = Math.max(0, power - dt / 25);
      tarnish *= Math.exp(-dt / 2.4);
      flash *= Math.exp(-dt * 4);
    },
    stop() {
      for (const s of shapes) s.stop();
      watch.disconnect();
      glass.remove();
      mend();
    },
  };
}
