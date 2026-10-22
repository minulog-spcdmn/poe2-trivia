// A zone title card's motion (ZoneCard.svelte), as each family of places has
// it (lib/zoneTitle.ts Family). The card builds its parts and hands them to
// its family, which brings the name's letters in, makes the moment it locks,
// keeps it alive while it holds and takes it away. Every animation runs on
// the card's own clock (`play`: ms from the plunge's start), so a tuning
// page can stop it at any moment and a card mounted late lands part-way.
// What a family leaves out, the default here does.

import type { Vec3 } from '../../lib/fx/core';
import type { Treatment, Variant } from '../../lib/zoneTitle';
import type { Timeline } from '../../lib/zoneTitleTiming';

export type PlayOpts = {
  /** Its start, in ms from the plunge's. */
  at: number;
  ms: number;
  easing?: string;
  /**
   * 'both' (the default) holds its first frame until it starts and its last
   * once it is done; 'forwards' for an exit, which must not hold its first;
   * 'backwards' for a letter's entrance, which ends on the letter's own
   * style: done, it lets go, leaving the letter no filter at all (held, its
   * last frame, a blur of nothing, left some letters soft on iOS Safari).
   */
  fill?: FillMode;
  composite?: CompositeOperation;
};

export type Ctx = {
  play: (el: Element, frames: Keyframe[], o: PlayOpts) => Animation;
  /** Runs `fn` at `at` ms into the card, unless it has gone by then. */
  at: (at: number, fn: () => void) => void;
  tl: Timeline;
  t: Treatment;
  has: (v: Variant) => boolean;
  /** The name's letters, spaces among them: each an outer span (for drifts) holding an inner one (entrance and exit). */
  outer: HTMLElement[];
  inner: HTMLElement[];
  /** Each letter's centre from the name's, in the card's own px (measured at rest). */
  dx: number[];
  /** The seal's centre from the name's, in the card's own px (measured at rest). */
  toSeal: [number, number];
  /** The letters that are not spaces. */
  glyphs: number[];
  /** The name (its letters and the copies under them), the letters' row, and the copies. */
  word: HTMLElement;
  letters: HTMLElement;
  glow: HTMLElement;
  flash: HTMLElement;
  /** The seal holding the sigil. */
  seal: HTMLElement;
  /** The divider under the name: its two rules' halves (upper first), and its star. */
  rules: SVGPathElement[];
  star: SVGGElement;
  /** The column the card's text stands in. */
  plate: HTMLElement;
  /** The zone's colour as light, and its pale (most of the way to white). */
  main: Vec3;
  pale: Vec3;
  /** A desktop with effects to spare: ambient effects and SVG filters only there. */
  rich: boolean;
  /** A coarse pointer (a phone): fewer particles. */
  phone: boolean;
  /** Random numbers from the name, the same every time it is shown. */
  rnd: () => number;
};

export type FamilyMotion = {
  /** The divider's upper rule opens before the name, as the fissure it rises out of. */
  fissure?: boolean;
  /** How the light it casts wavers at `ms` (1 steady): a fire's flicker, spores' breathing. */
  flicker?(ms: number): number;
  /** The letters' entrance, timed by `tl.starts` and `tl.letterMs` to settle at the lock (made after the card's own animations, so it may take theirs over). */
  enter?(c: Ctx): void;
  /** At the lock: its own effects (the card's own flare and glints come too). */
  lock?(c: Ctx): void;
  /** While it holds (rich screens only, from just after the lock to the exit). Returns how to stop. */
  ambient?(c: Ctx): (() => void) | void;
  /** From `tl.exit`: the letters leave (by `tl.exit + 800` at the latest), with their effects. */
  exit?(c: Ctx): void;
};

/** The house's strong ease-out, and its ease-in for leaving. */
export const OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';
export const IN = 'cubic-bezier(0.5, 0, 0.75, 0)';

/**
 * The default entrance: each letter rises 0.32em into place out of a blur,
 * pulled in toward the middle at first so the name spreads as it comes (its
 * tracking widens without the text reflowing), overshooting a touch.
 */
export function enterDefault(c: Ctx, blur = c.phone ? 4 : 6) {
  for (const i of c.glyphs)
    c.play(
      c.inner[i],
      [
        { opacity: 0, transform: `translate(${(-0.22 * c.dx[i]).toFixed(1)}px, 0.32em) scale(0.94)`, filter: `blur(${blur}px)`, easing: OUT },
        { offset: 0.62, opacity: 1, transform: 'translate(0, -0.02em) scale(1.012)', filter: 'blur(0.4px)', easing: 'cubic-bezier(0.45, 0, 0.55, 1)' },
        { opacity: 1, transform: 'none', filter: 'none' },
      ],
      { at: c.tl.starts[i], ms: c.tl.letterMs, fill: 'backwards' },
    );
}

/** While it holds the name keeps spreading, a little, as if seen from closer. */
export function drift(c: Ctx) {
  for (const i of c.glyphs)
    c.play(c.outer[i], [{ translate: `${(-0.03 * c.dx[i]).toFixed(1)}px 0` }, { translate: `${(0.025 * c.dx[i]).toFixed(1)}px 0` }], {
      at: c.tl.starts[0] ?? 0,
      ms: Math.max(1, c.tl.exit - (c.tl.starts[0] ?? 0)),
      easing: 'cubic-bezier(0.2, 0.6, 0.35, 1)',
    });
}

/** The letters in order from the middle out. */
export const fromMiddle = (c: Ctx) => [...c.glyphs].sort((a, b) => Math.abs(c.dx[a]) - Math.abs(c.dx[b]));

/** The default exit: from the middle out, each letter rises a little and blurs away. */
export function exitDefault(c: Ctx) {
  fromMiddle(c).forEach((i, k) =>
    c.play(c.inner[i], [{ opacity: 1 }, { opacity: 0, transform: 'translateY(-0.25em)', filter: 'blur(5px)' }], {
      at: c.tl.exit + k * 18,
      ms: 440,
      easing: IN,
      fill: 'forwards',
    }),
  );
}

/** Seeded random numbers (mulberry32). */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A string's seed. */
export const seedOf = (s: string) => [...s].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619), 2166136261);

/** Each letter's start when they come in in `order` (glyph indices) instead of left to right: the same times, given out in that order. */
export function startsIn(c: Ctx, order: number[]): Map<number, number> {
  const times = c.glyphs.map((i) => c.tl.starts[i]).sort((a, b) => a - b);
  return new Map(order.map((i, k) => [i, times[k]]));
}

/** `order` shuffled by the card's seed. */
export function shuffled<T>(c: Ctx, order: T[]): T[] {
  const out = [...order];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(c.rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** A thin strip along the top of `el` (for embers to rise off), `share` of its width, `y` px below its top edge. */
export function topOf(el: Element, share = 0.8, y = 0.3): DOMRect {
  const b = el.getBoundingClientRect();
  const w = b.width * share;
  return new DOMRect(b.left + (b.width - w) / 2, b.top + b.height * y, w, 2);
}

/** A colour (HDR) at `k` times its strength. */
export const times = (v: readonly [number, number, number], k: number): [number, number, number] => [v[0] * k, v[1] * k, v[2] * k];
