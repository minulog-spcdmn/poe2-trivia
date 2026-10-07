// Delve: a flare burns as the clock runs out, and FLARE_MS more run on the
// same question (co-op: one holder's, for the team; every screen shows it).
// The page's part of it, which carries the moment by itself (the effects
// overlay, lib/fx/flare.ts, adds its fire and light where it is on):
//
// - The strike (flareStrike, from the player's entry: Scoreboard.svelte).
//   The flare in the entry flares up and throws a burst of red sparks, and a
//   streak of its light flies from it to the clock, shedding embers, and
//   sets it alight: a flash, a ring running out, sparks off its edge.
// - The burning (flareBurning, from the clock: TimerRing.svelte). While the
//   added seconds run, the clock burns like a road flare: a red glow round
//   its ring flickering, its tip (the end of the ring, burning down) a hot
//   spot sputtering sparks, and a faint red light flickering at the very
//   edges of the screen, never reaching the question or its answers. It all
//   dies down as the seconds run out, and goes out as the question ends.
//
// Only transform and opacity move, a handful of pieces each painted once;
// the clock's box is measured once (and again on a resize). Holding still
// (reduced motion, or the effects off) it is a calm glow: no streak, no
// sparks, no flicker.

import { fxActive, type Point } from './fx/core';
import { flareBurning as fxBurning, flareStruck, type Ring } from './fx/flare';

/** ms from the strike until its streak reaches the clock and sets it alight (TimerRing.svelte holds the clock at 0 till then). */
export const FLARE_IGNITE_MS = 430;
/** ms from the strike until the streak leaves the flare. */
const LAUNCH_MS = 70;

/**
 * Who waits for the streak to land (TimerRing.svelte, to light the clock
 * then): it lands as its animation ends, which a slow first frame can put
 * a little later than FLARE_IGNITE_MS.
 */
const waiting = new Set<() => void>();
/** Calls `fn` once, when the next strike's streak reaches the clock. Returns a function that stops waiting. */
export function onFlareLands(fn: () => void): () => void {
  const once = () => {
    waiting.delete(once);
    fn();
  };
  waiting.add(once);
  return () => waiting.delete(once);
}
const landed = () => [...waiting].forEach((f) => f());

// The road flare's light: its crimson, the Flare Cache's pink, its white-hot heart.
const RED = '236, 62, 92';
const PINK = '247, 163, 179';
const HOT = '255, 240, 243';

const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.hasAttribute('data-still');
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const px = (n: number) => `${n.toFixed(1)}px`;
const deg = (a: number) => `${((a * 180) / Math.PI).toFixed(1)}deg`;

/** An absolutely placed piece, its look in `css`. */
function piece(parent: HTMLElement, css: Partial<CSSStyleDeclaration>): HTMLDivElement {
  const el = document.createElement('div');
  Object.assign(el.style, { position: 'absolute', left: '0', top: '0', pointerEvents: 'none', willChange: 'transform, opacity', ...css });
  parent.append(el);
  return el;
}

const anim = (el: Element, frames: Keyframe[], o: KeyframeAnimationOptions) => el.animate(frames, { fill: 'both', ...o });

/** A soft round light, `size` px across, centred on (x, y): hot at the heart, red at the rim. */
function glow(parent: HTMLElement, x: number, y: number, size: number, k = 1): HTMLDivElement {
  return piece(parent, {
    left: px(x - size / 2),
    top: px(y - size / 2),
    width: px(size),
    height: px(size),
    borderRadius: '50%',
    background: `radial-gradient(circle closest-side, rgba(${HOT}, ${k}) 0%, rgba(${PINK}, ${0.8 * k}) 18%, rgba(${RED}, ${0.45 * k}) 42%, rgba(${RED}, ${0.12 * k}) 68%, rgba(${RED}, 0) 100%)`,
    opacity: '0',
  });
}

/** A spark: a short streak, hot at its head, drawn pointing right from (x, y) (its head there). */
function spark(parent: HTMLElement, x: number, y: number, len: number, thick = 2): HTMLDivElement {
  return piece(parent, {
    left: px(x - len),
    top: px(y - thick / 2),
    width: px(len),
    height: px(thick),
    borderRadius: px(thick),
    transformOrigin: '100% 50%',
    background: `linear-gradient(to right, rgba(${RED}, 0), rgba(${PINK}, 0.85) 55%, rgba(${HOT}, 1))`,
    opacity: '0',
  });
}

/** Flies a spark (its head where it was placed, moved by `from`) off at angle `a`, `dist` px, falling `drop` px by the end. */
function throwSpark(el: HTMLElement, a: number, dist: number, drop: number, o: KeyframeAnimationOptions, from: Point = { x: 0, y: 0 }) {
  const at = (t: number) => {
    // Fast out of the burst, slowing; falling more as it goes.
    const d = dist * (1 - (1 - t) ** 2);
    const x = from.x + Math.cos(a) * d;
    const y = from.y + Math.sin(a) * d + drop * t * t;
    const vx = Math.cos(a) * 2 * (1 - t) * dist;
    const vy = Math.sin(a) * 2 * (1 - t) * dist + 2 * drop * t;
    return `translate(${px(x)}, ${px(y)}) rotate(${deg(Math.atan2(vy, vx))}) scaleX(${(1 - 0.6 * t).toFixed(2)})`;
  };
  return anim(
    el,
    [
      { transform: at(0), opacity: 0 },
      { transform: at(0.08), opacity: 1, offset: 0.08 },
      { transform: at(0.4), opacity: 0.9, offset: 0.4 },
      { transform: at(0.7), opacity: 0.55, offset: 0.7 },
      { transform: at(1), opacity: 0 },
    ],
    o,
  );
}

/** A road flare's flicker: `n` steps of light between `lo` and 1, now and then a sputtering dip. */
function flicker(n: number, lo: number): Keyframe[] {
  const frames: Keyframe[] = [];
  for (let i = 0; i < n; i++) {
    const dip = Math.random() < 0.14;
    frames.push({ opacity: dip ? lo * rand(0.5, 0.8) : rand(lo, 1) });
  }
  frames.push({ ...frames[0] });
  return frames;
}

/** A box on screen, if it is on the page and has one. */
function boxOf(el: Element | null): DOMRect | null {
  if (!el?.isConnected) return null;
  const r = el.getBoundingClientRect();
  return r.width || r.height ? r : null;
}

export type FlareStrike = {
  /** The clock on screen (TimerRing.svelte's ring). */
  timer: Element | null;
  /** The player's entry the flare burns in. */
  pill: Element | null;
  /** The flare's engraving in it (Inventory.svelte), if it shows. */
  icon: Element | null;
};

/** The strike: see the top of this file. */
export function flareStrike({ timer, pill, icon }: FlareStrike) {
  const calm = still();
  // Measured once, before anything is added.
  const from = boxOf(icon) ?? boxOf(pill);
  const to = boxOf(timer);
  if (!from && !to) {
    landed();
    return;
  }
  const W = innerWidth;
  const phone = W < 600;

  const layer = document.createElement('div');
  layer.className = 'flare-strike';
  layer.setAttribute('aria-hidden', 'true');
  // It dims behind an open dialog like the page's other overlays (lib/portal.ts).
  layer.dataset.behindDialog = 'dim';
  Object.assign(layer.style, { position: 'fixed', inset: '0', zIndex: '90', pointerEvents: 'none', overflow: 'hidden', contain: 'strict' });
  document.body.append(layer);

  const src: Point | null = from ? { x: from.left + from.width / 2, y: from.top + from.height / 2 } : null;
  const dst: Ring | null = to ? { x: to.left + to.width / 2, y: to.top + to.height / 2, r: (Math.max(to.width, to.height) / 2) * (26 / 32) } : null;
  const screen = 'screen';

  // ---- the flare catches, in the player's entry ----
  if (src) {
    const S = phone ? 64 : 76;
    const g = glow(layer, src.x, src.y, S);
    g.style.mixBlendMode = screen;
    if (calm) anim(g, [{ opacity: 0 }, { opacity: 0.8, offset: 0.3 }, { opacity: 0 }], { duration: 700, easing: 'ease-out' });
    else {
      anim(
        g,
        [
          { transform: 'scale(0.25)', opacity: 0 },
          { transform: 'scale(1.1)', opacity: 1, offset: 0.14 },
          { transform: 'scale(0.9)', opacity: 0.75, offset: 0.4 },
          { transform: 'scale(1.25)', opacity: 0 },
        ],
        { duration: 620, easing: 'ease-out' },
      );
      // Its light streaks out sideways for a moment, as a flare's does.
      const len = S * 2.2;
      const streak = piece(layer, {
        left: px(src.x - len / 2),
        top: px(src.y - 1.5),
        width: px(len),
        height: '3px',
        borderRadius: '2px',
        background: `linear-gradient(to right, rgba(${RED}, 0), rgba(${PINK}, 0.7) 35%, rgba(${HOT}, 1) 50%, rgba(${PINK}, 0.7) 65%, rgba(${RED}, 0))`,
        mixBlendMode: screen,
        opacity: '0',
      });
      anim(streak, [{ transform: 'scaleX(0.1)', opacity: 0 }, { transform: 'scaleX(1)', opacity: 1, offset: 0.2 }, { transform: 'scaleX(1.15)', opacity: 0 }], {
        duration: 480,
        easing: 'ease-out',
      });
      // A burst of red sparks thrown off it, most of them upward.
      const n = phone ? 10 : 13;
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + ((i / n) * 2 - 1) * Math.PI * 0.95 + rand(-0.2, 0.2);
        const s = spark(layer, src.x, src.y, rand(7, 13), rand(1.5, 2.2));
        throwSpark(s, a, rand(22, phone ? 50 : 62), rand(14, 34), { delay: rand(0, 60), duration: rand(380, 620), easing: 'linear' });
      }
    }
  }

  // ---- the streak, from the flare to the clock ----
  // Along an arc bowed upward, shedding embers as it goes.
  const flight = FLARE_IGNITE_MS - LAUNCH_MS;
  const path: { at: Point; t: number }[] = [];
  if (src && dst && !calm) {
    const dx = dst.x - src.x;
    const dy = dst.y - src.y;
    const dist = Math.hypot(dx, dy) || 1;
    // The side of the line that is up (a flat line bows up).
    let nx = -dy / dist;
    let ny = dx / dist;
    if (ny > 0 || (ny === 0 && nx > 0)) {
      nx = -nx;
      ny = -ny;
    }
    let bow = Math.min(120, dist * 0.22);
    // Kept on screen: the arc's top (half the bow from the line) stays below the edge.
    const mid = { x: (src.x + dst.x) / 2, y: (src.y + dst.y) / 2 };
    if (ny < 0) bow = Math.min(bow, Math.max(0, (mid.y - 14) / (-ny * 0.5)));
    const c = { x: mid.x + nx * bow, y: mid.y + ny * bow };
    const at = (t: number) => ({
      x: (1 - t) ** 2 * src.x + 2 * (1 - t) * t * c.x + t * t * dst.x,
      y: (1 - t) ** 2 * src.y + 2 * (1 - t) * t * c.y + t * t * dst.y,
    });
    const along = (t: number) => {
      const vx = 2 * (1 - t) * (c.x - src.x) + 2 * t * (dst.x - c.x);
      const vy = 2 * (1 - t) * (c.y - src.y) + 2 * t * (dst.y - c.y);
      return Math.atan2(vy, vx);
    };
    // The streak eases in (drawn to the clock): when it has come `t` of the way.
    const when = (t: number) => LAUNCH_MS + flight * Math.sqrt(t);
    const tail = Math.min(phone ? 70 : 110, dist * 0.45);
    const comet = piece(layer, { width: '0', height: '0' });
    const trail = piece(comet, {
      left: px(-tail),
      top: '-2px',
      width: px(tail),
      height: '4px',
      borderRadius: '2px',
      transformOrigin: '100% 50%',
      background: `linear-gradient(to right, rgba(${RED}, 0), rgba(${RED}, 0.55) 45%, rgba(${PINK}, 0.95) 85%, rgba(${HOT}, 1))`,
      willChange: 'auto',
    });
    trail.style.mixBlendMode = screen;
    const head = glow(comet, 0, 0, phone ? 26 : 32);
    head.style.opacity = '1';
    head.style.willChange = 'auto';
    const N = 12;
    const frames: Keyframe[] = [];
    for (let i = 0; i <= N; i++) {
      // Evenly in time, eased: t is how far along at that moment.
      const u = i / N;
      const t = u * u;
      const p = at(t);
      // The tail grows out of the flare as it goes, and is drawn into the clock at the end.
      const stretch = Math.min(1, u * 3) * (u > 0.9 ? 1 - (u - 0.9) * 6 : 1);
      frames.push({ transform: `translate(${px(p.x)}, ${px(p.y)}) rotate(${deg(along(t))}) scaleX(${Math.max(0.2, stretch).toFixed(2)})`, opacity: u === 0 ? 0 : 1 });
    }
    frames[N].opacity = 0.9;
    anim(comet, frames, { delay: LAUNCH_MS, duration: flight, easing: 'linear' }).finished.then(landed, landed);
    anim(comet, [{ opacity: 1 }, { opacity: 0 }], { delay: FLARE_IGNITE_MS, duration: 120, fill: 'forwards' });
    // Embers it sheds, each where the head was, sinking and going out.
    const embers = phone ? 6 : 8;
    for (let i = 1; i <= embers; i++) {
      const t = i / (embers + 1);
      const p = at(t);
      const ms = when(t);
      path.push({ at: p, t: ms / 1000 });
      const size = rand(3, 5);
      const e = piece(layer, {
        left: px(p.x - size / 2),
        top: px(p.y - size / 2),
        width: px(size),
        height: px(size),
        borderRadius: '50%',
        background: `radial-gradient(circle closest-side, rgba(${HOT}, 1), rgba(${PINK}, 0.8) 45%, rgba(${RED}, 0) 100%)`,
        opacity: '0',
      });
      anim(
        e,
        [
          { transform: 'translate(0, 0) scale(1)', opacity: 1 },
          { opacity: 0.7, offset: 0.4 },
          { transform: `translate(${px(rand(-6, 6))}, ${px(rand(10, 22))}) scale(0.4)`, opacity: 0 },
        ],
        // Unseen until the head passes (not held at the first frame through the delay).
        { delay: ms, duration: rand(380, 560), easing: 'ease-in', fill: 'forwards' },
      );
    }
  }

  // ---- the clock catches ----
  if (dst) {
    const r = dst.r;
    const at = calm ? 0 : FLARE_IGNITE_MS;
    const f = glow(layer, dst.x, dst.y, r * 7.5);
    f.style.mixBlendMode = screen;
    if (calm) anim(f, [{ opacity: 0 }, { opacity: 0.6, offset: 0.3 }, { opacity: 0 }], { duration: 800, easing: 'ease-out' });
    else {
      anim(
        f,
        [
          { transform: 'scale(0.3)', opacity: 0 },
          { transform: 'scale(1)', opacity: 1, offset: 0.12 },
          { transform: 'scale(0.85)', opacity: 0.55, offset: 0.4 },
          { transform: 'scale(1.1)', opacity: 0 },
        ],
        { delay: at - 30, duration: 760, easing: 'ease-out' },
      );
      // A ring of its light running out.
      const ring = piece(layer, {
        left: px(dst.x - r),
        top: px(dst.y - r),
        width: px(r * 2),
        height: px(r * 2),
        borderRadius: '50%',
        boxShadow: `0 0 0 1.5px rgba(${HOT}, 0.9), 0 0 10px 3px rgba(${PINK}, 0.6), inset 0 0 10px 3px rgba(${RED}, 0.45)`,
        opacity: '0',
      });
      anim(ring, [{ transform: 'scale(1)', opacity: 1 }, { opacity: 0.7, offset: 0.4 }, { transform: 'scale(3)', opacity: 0 }], {
        delay: at,
        fill: 'forwards',
        duration: 620,
        easing: 'cubic-bezier(0.15, 0.6, 0.35, 1)',
      });
      // Sparks off its edge, all round.
      const n = phone ? 12 : 16;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rand(-0.2, 0.2);
        const s = spark(layer, dst.x + Math.cos(a) * r, dst.y + Math.sin(a) * r, rand(8, 14), rand(1.5, 2.2));
        throwSpark(s, a, rand(r * 0.8, r * 1.9), rand(8, 24), { delay: at + rand(0, 50), duration: rand(380, 640), easing: 'linear' });
      }
    }
  }

  // With no streak to fly, the clock catches as soon as the strike is seen.
  if (calm || !src || !dst) landed();
  if (!calm && fxActive()) flareStruck(src, path, dst, FLARE_IGNITE_MS / 1000);
  setTimeout(() => layer.remove(), FLARE_IGNITE_MS + 1100);
}

export type FlareBurn = {
  /** What is left: `level`, the flare's added time left (0 to 1); `head`, where the ring ends (0 to 1, clockwise from the top). */
  set(level: number, head: number): void;
  /** It goes out (the question ended, or the time ran out). */
  stop(): void;
};

/** How far in from its edge the clock's ring runs (TimerRing.svelte: r 26 in 64). */
const RING = 26 / 32;

/** The burning: see the top of this file. `timer` is the clock's own element; its pieces go in it. */
export function flareBurning(timer: HTMLElement): FlareBurn {
  const calm = still();
  let level = 1;
  let head = 1;
  let stopped = false;
  // The clock's size (its own, which its pieces scale by) and where it is
  // on screen (for the effects overlay), measured now and on a resize; a
  // scroll only marks where it is as stale.
  let size = timer.offsetWidth || 64;
  let box: DOMRect | null = null;
  const place = () => (box = timer.getBoundingClientRect());
  const resized = () => {
    size = timer.offsetWidth || size;
    box = null;
  };
  const scrolled = () => (box = null);
  addEventListener('resize', resized);
  addEventListener('scroll', scrolled, { passive: true, capture: true });

  // ---- behind the ring: its glow ----
  const under = document.createElement('div');
  under.setAttribute('aria-hidden', 'true');
  Object.assign(under.style, { position: 'absolute', inset: '0', pointerEvents: 'none', opacity: '0', willChange: 'opacity' });
  timer.prepend(under);
  // A ring of red light about the clock's ring, flickering.
  const halo = piece(under, {
    left: '-75%',
    top: '-75%',
    width: '250%',
    height: '250%',
    borderRadius: '50%',
    // The ring is at 32.5% of its radius (RING / 2.5).
    background: `radial-gradient(circle closest-side, rgba(${RED}, 0) 22%, rgba(${PINK}, 0.55) 31%, rgba(${RED}, 0.5) 38%, rgba(${RED}, 0.2) 55%, rgba(${RED}, 0.06) 75%, rgba(${RED}, 0) 100%)`,
  });

  // ---- over it: the burning tip and its sparks ----
  const over = document.createElement('div');
  over.setAttribute('aria-hidden', 'true');
  Object.assign(over.style, { position: 'absolute', inset: '0', pointerEvents: 'none', opacity: '0', willChange: 'opacity' });
  timer.append(over);
  // The tip rides round with the end of the ring (turned about the clock's centre).
  const arm = piece(over, { inset: '0', width: '100%', height: '100%' });
  const tipSize = 0.42;
  const tip = piece(arm, {
    left: `${50 - (tipSize * 100) / 2}%`,
    top: `${(1 - RING) * 50 - (tipSize * 100) / 2}%`,
    width: `${tipSize * 100}%`,
    height: `${tipSize * 100}%`,
    borderRadius: '50%',
    background: `radial-gradient(circle closest-side, rgba(${HOT}, 1) 0%, rgba(${HOT}, 0.9) 18%, rgba(${PINK}, 0.75) 38%, rgba(${RED}, 0.3) 66%, rgba(${RED}, 0) 100%)`,
  });

  // ---- at the edges of the screen: its light, faintly ----
  // Over the UI as the dark of the clock is (Darkness.svelte), and as shallow:
  // a few px of red light along the edges, never reaching the question.
  const edge = document.createElement('div');
  edge.className = 'flare-edge';
  edge.setAttribute('aria-hidden', 'true');
  edge.dataset.behindDialog = 'dim';
  Object.assign(edge.style, { position: 'fixed', inset: '0', zIndex: '11', pointerEvents: 'none', opacity: '0', willChange: 'opacity', contain: 'strict' });
  const light = piece(edge, {
    inset: '0',
    width: '100%',
    height: '100%',
    boxShadow: `inset 0 0 clamp(18px, 5vmin, 48px) 0 rgba(${RED}, 0.75), inset 0 0 clamp(5px, 1.4vmin, 12px) 0 rgba(${PINK}, 0.55)`,
  });
  document.body.append(edge);

  // ---- lit ----
  const fadeIn = (el: HTMLElement, to: number, ms: number) => {
    el.animate([{ opacity: 0 }, { opacity: to }], { duration: ms, easing: 'ease-out' });
    el.style.opacity = String(to);
  };
  fadeIn(under, 1, 260);
  fadeIn(over, 1, 200);
  fadeIn(edge, 1, 500);
  if (!calm) {
    // A road flare's light: never quite steady, now and then sputtering low.
    anim(halo, flicker(18, 0.6), { duration: 1500, iterations: Infinity, easing: 'linear' });
    anim(light, flicker(14, 0.45), { duration: 1700, iterations: Infinity, easing: 'linear' });
    anim(
      tip,
      [
        { transform: 'scale(1)', opacity: 1 },
        { transform: 'scale(1.25)', opacity: 0.85 },
        { transform: 'scale(0.9)', opacity: 1 },
        { transform: 'scale(1.15)', opacity: 0.7 },
        { transform: 'scale(0.95)', opacity: 1 },
        { transform: 'scale(1.3)', opacity: 0.9 },
        { transform: 'scale(1)', opacity: 1 },
      ],
      { duration: 640, iterations: Infinity, easing: 'linear' },
    );
  }

  // ---- the sparks the tip sputters: a few, each thrown again as it goes out ----
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const sparkRoot = piece(over, { inset: '0', width: '100%', height: '100%', willChange: 'auto' });
  const shoot = (el: HTMLElement) => {
    if (stopped) return;
    const r = (size / 2) * RING;
    const a = head * Math.PI * 2;
    // From the tip, out from the ring (and a little either way along it).
    const out = Math.atan2(-Math.cos(a), Math.sin(a));
    const from = { x: size / 2 + Math.sin(a) * r, y: size / 2 - Math.cos(a) * r };
    const k = 0.45 + 0.55 * level;
    const go = throwSpark(el, out + rand(-1, 1), rand(0.12, 0.42) * size * k + 4, rand(4, 12) * (size / 64), { duration: rand(260, 520), easing: 'linear' }, from);
    go.onfinish = () => {
      // Sputtering: a pause now and then, longer as it dies down.
      const t = setTimeout(
        () => {
          timers.delete(t);
          shoot(el);
        },
        rand(20, 140) + (Math.random() < 0.2 ? rand(100, 300) : 0) + (1 - level) * 160,
      );
      timers.add(t);
    };
  };
  if (!calm) {
    for (let i = 0; i < 6; i++) {
      const s = spark(sparkRoot, 0, 0, rand(5, 9) * Math.max(0.75, size / 64), 1.6);
      const t = setTimeout(() => {
        timers.delete(t);
        shoot(s);
      }, rand(0, 300));
      timers.add(t);
    }
  }

  // ---- the effects overlay: sparks and a flickering light on the scene ----
  const fire =
    !calm && fxActive()
      ? fxBurning(() => {
          const b = box ?? place();
          const r = (b.width / 2) * RING;
          const a = head * Math.PI * 2;
          const out = { x: Math.sin(a), y: -Math.cos(a) };
          const c = { x: b.left + b.width / 2, y: b.top + b.height / 2 };
          return { clock: { ...c, r }, tip: { x: c.x + out.x * r, y: c.y + out.y * r }, out, level };
        })
      : null;

  let shownLevel = -1;
  let shownHead = -1;
  const set = (l: number, h: number) => {
    if (stopped) return;
    level = Math.min(1, Math.max(0, l));
    head = Math.min(1, Math.max(0, h));
    // Its light dies down with the seconds left (in steps, holding still).
    if (Math.abs(level - shownLevel) > (calm ? 0.1 : 0.015)) {
      shownLevel = level;
      under.style.opacity = (0.35 + 0.65 * level).toFixed(3);
      over.style.opacity = (0.5 + 0.5 * level).toFixed(3);
      edge.style.opacity = (calm ? 0.6 * level : level ** 0.8).toFixed(3);
    }
    if (Math.abs(head - shownHead) > 0.0008) {
      shownHead = head;
      arm.style.transform = `rotate(${(head * 360).toFixed(2)}deg)`;
    }
  };
  set(1, 1);

  return {
    set,
    stop() {
      if (stopped) return;
      stopped = true;
      fire?.stop();
      timers.forEach(clearTimeout);
      timers.clear();
      removeEventListener('resize', resized);
      removeEventListener('scroll', scrolled, { capture: true });
      for (const el of [under, over, edge]) {
        const from = Number(el.style.opacity || 0);
        const out = el.animate([{ opacity: from }, { opacity: 0 }], { duration: calm ? 200 : 450, easing: 'ease-out', fill: 'forwards' });
        out.onfinish = () => el.remove();
      }
    },
  };
}
