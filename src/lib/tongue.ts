// The script nobody can read, on the rune circles' bands (docs/arcane-style.md).
//
// A script reads as writing, not as a row of symbols, when it behaves like
// one: its letters share a body (a headline they hang from and a baseline),
// a few rise above it or drop below; each has its own width; the letters of
// a word are joined by the headline running over them, as in Devanagari or
// the old Theban alphabet; a few letters are used often and most seldom; a
// few short words recur and most are rare; phrases end in a stop; and a
// line is set to its full length, the spaces between words evened out.
// The words are drawn once from a fixed seed, so every circle writes in the
// same tongue.

import { f, seeded } from './arcane.ts';

/**
 * The letters, each `w` wide and drawn from x = 0 to `w`: hanging from the
 * headline at y = -1.2 to the baseline at 1.2, rising to -2.4 or dropping
 * to 2.4. The headline itself is drawn with the word.
 */
const LETTERS: { w: number; d: string }[] = [
  { w: 1.8, d: 'M0.35 -1.2V0.5A0.55 0.55 0 0 0 1.45 0.5V-1.2' },
  { w: 1.9, d: 'M0.35 -1.2V1.2M0.35 0.1A0.75 0.75 0 0 0 1.55 0.1V-1.2' },
  { w: 1.7, d: 'M1.35 -1.2V0.45A0.65 0.65 0 1 1 0.85 -0.35' },
  { w: 1.7, d: 'M0.3 -1.2L0.85 1.2L1.4 -1.2' },
  { w: 2.1, d: 'M0.35 -1.2V0.2A0.7 0.7 0 0 0 1.75 0.2V-1.2M1.05 -1.2V2.4' },
  { w: 1.6, d: 'M0.8 -1.2V-0.1M0.8 0.6A0.5 0.5 0 1 1 0.8 1.6A0.5 0.5 0 1 1 0.8 0.6Z' },
  { w: 1.5, d: 'M0.3 -1.2C1.5 -1 1.5 0 0.4 0.1C1.5 0.2 1.5 1.2 0.3 1.2' },
  { w: 1.9, d: 'M0.95 -1.2V1.2M0.3 0.25H1.6' },
  { w: 1.5, d: 'M1.15 -1.2V1.2H0.3' },
  { w: 2.1, d: 'M0.3 -1.2V0.4L1.05 -0.4L1.8 0.4V1.2' },
  { w: 1.7, d: 'M0.85 -1.2V-0.1L0.3 1.2M0.85 -0.1L1.4 1.2' },
  { w: 1.4, d: 'M0.7 -1.2V2.4M0.7 1.4L0.25 2' },
  { w: 1.7, d: 'M0.4 -2.4V1.2M0.4 -0.2C1.6 -0.2 1.6 1.2 0.85 1.2' },
  { w: 1.7, d: 'M0.85 -1.2V-0.1M0.85 -0.1L0.3 0.6L0.85 1.3L1.4 0.6Z' },
  { w: 1.1, d: 'M0.55 -1.2V0.5M0.55 1A0.2 0.2 0 1 1 0.55 1.4A0.2 0.2 0 1 1 0.55 1Z' },
  { w: 1.9, d: 'M1.6 -1.2V1.2M1.6 0.5C0.1 0.7 0.1 -0.7 1.6 -0.5' },
  { w: 1.7, d: 'M1.35 -1.2A1.1 1.1 0 0 0 1.35 1M0.45 -0.1H1.35' },
  { w: 1.8, d: 'M0.3 -1.2L1.5 1.2M1.5 -1.2L0.9 0' },
  { w: 1.7, d: 'M0.85 -2.4V1.2M0.85 -0.2H1.4' },
  { w: 2, d: 'M0.3 -1.2C0.3 0.3 1.7 -0.3 1.7 1.2M1 1.2H1.7' },
];
/** The stop at the end of a phrase: a small lozenge on the headline's line, standing alone. */
const STOP = { w: 1.3, d: 'M0.65 -1.75L1.05 -1.2L0.65 -0.65L0.25 -1.2Z' };
/** Space between letters, and the least between words. */
const TRACK = 0.3;
const SPACE = 1.5;

/** Picks from `items` by their `weights`. */
const weighted = <T>(items: T[], weights: number[], rnd: () => number): T => {
  let x = rnd() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < items.length; i++) if ((x -= weights[i]) < 0) return items[i];
  return items.at(-1)!;
};

// The words: of one to seven letters, most of three to six, never a letter
// twice running; the letters used as unevenly as a real alphabet's.
const WORDS = (() => {
  const rnd = seeded(1789);
  const order = LETTERS.map((_, i) => ({ i, k: rnd() })).sort((a, b) => a.k - b.k).map(({ i }) => i);
  const freq = order.map((_, i) => 1 / (i + 1.6));
  const words = Array.from({ length: 90 }, () => {
    const n = weighted([1, 2, 3, 4, 5, 6, 7], [0.4, 2, 5, 7, 6, 4, 2], rnd);
    const w: number[] = [];
    while (w.length < n) {
      const i = weighted(order, freq, rnd);
      if (i !== w.at(-1)) w.push(i);
    }
    return w;
  });
  return words;
})();
// A few words common, most rare; the longest less often than their rank says.
const WORD_WEIGHTS = WORDS.map((w, i) => 1 / (i + 5) / (w.length > 4 ? 2 : 1));
/** A word's width, its letters and the tracking between them. */
const width = (w: number[]) => w.reduce((s, i) => s + LETTERS[i].w, 0) + TRACK * (w.length - 1);

/**
 * A line of the script along a circle of radius `r`, from `from` to `to`
 * degrees, `k` times its drawn size, its choices made by `rnd`: as many
 * whole words as fit, the spaces between them evened out to fill the line
 * (no more than twice their least; any more is left either side). Each
 * letter comes as path data centred on its place, `a` degrees round, with
 * its stretch of the headline over it.
 */
export function inscribe(from: number, to: number, r: number, rnd: () => number, k = 1) {
  const length = (((to - from) * Math.PI) / 180) * r;
  // Words (and stops) until the line is full.
  const line: number[][] = [];
  let used = -SPACE * k;
  let last: number[] | null = null;
  let phrase = 0;
  for (let tries = 0; tries < 40; ) {
    let w = weighted(WORDS, WORD_WEIGHTS, rnd);
    while (w === last) w = weighted(WORDS, WORD_WEIGHTS, rnd);
    const stop = line.length > 0 && ++phrase > 2 && rnd() < 0.3;
    const add = (width(w) + SPACE) * k + (stop ? (STOP.w + SPACE) * k : 0);
    if (used + add > length) {
      tries++;
      continue;
    }
    if (stop) line.push([-1]), (phrase = 0);
    line.push(w);
    used += add;
    last = w;
  }
  // Even the spaces out, up to twice their least.
  const gaps = line.length - 1;
  const extra = gaps ? Math.min((length - used) / gaps, SPACE * k) : 0;
  let x = (length - used - extra * gaps) / 2;
  const out: { a: number; d: string }[] = [];
  const deg = (s: number) => from + (s / r) * (180 / Math.PI);
  const scaled = (d: string, dx: number) =>
    d.replace(/([MLHVCA])([^MLHVCAZ]*)/g, (_, cmd: string, args: string) => {
      const n = args.trim().split(/[ ,]+/).filter(Boolean).map(Number);
      if (cmd === 'H') return `H${f((n[0] + dx) * k)}`;
      if (cmd === 'V') return `V${f(n[0] * k)}`;
      if (cmd === 'A') return `A${f(n[0] * k)} ${f(n[1] * k)} ${n[2]} ${n[3]} ${n[4]} ${f((n[5] + dx) * k)} ${f(n[6] * k)}`;
      return cmd + n.map((v, i) => f((i % 2 ? v : v + dx) * k)).join(' ');
    });
  for (const w of line) {
    if (w[0] === -1) {
      out.push({ a: deg(x + (STOP.w * k) / 2), d: scaled(STOP.d, -STOP.w / 2) });
      x += (STOP.w + SPACE) * k + extra;
      continue;
    }
    w.forEach((i, n) => {
      const { w: lw, d } = LETTERS[i];
      // The headline over the letter, on to the next letter's.
      const head = `M${-lw / 2 - (n ? TRACK / 2 : 0)} -1.2H${lw / 2 + (n < w.length - 1 ? TRACK / 2 : 0)}`;
      out.push({ a: deg(x + (lw * k) / 2), d: scaled(d, -lw / 2) + scaled(head, 0) });
      x += (lw + TRACK) * k;
    });
    x += (SPACE - TRACK) * k + extra;
  }
  return out;
}

/**
 * Letter `i` of the script alone, without its headline, centred on 0, 0 at
 * `k` times its drawn size (its letters stand about 2.4 high): for a
 * cipher wheel's cells.
 */
export function glyph(i: number, k = 1) {
  const { w, d } = LETTERS[((i % LETTERS.length) + LETTERS.length) % LETTERS.length];
  return d.replace(/([MLHVCA])([^MLHVCAZ]*)/g, (_, cmd: string, args: string) => {
    const n = args.trim().split(/[ ,]+/).filter(Boolean).map(Number);
    if (cmd === 'H') return `H${f((n[0] - w / 2) * k)}`;
    if (cmd === 'V') return `V${f(n[0] * k)}`;
    if (cmd === 'A') return `A${f(n[0] * k)} ${f(n[1] * k)} ${n[2]} ${n[3]} ${n[4]} ${f((n[5] - w / 2) * k)} ${f(n[6] * k)}`;
    return cmd + n.map((v, j) => f((j % 2 ? v : v - w / 2) * k)).join(' ');
  });
}
