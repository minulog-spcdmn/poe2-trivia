// The pen that draws a rune circle in (ArcaneStage; docs/arcane-style.md,
// "Keeping it light"). Each line was a CSS animation of its own, hundreds to a
// circle, and Chrome paints an SVG's shapes again on every tick of any
// animation in it: at 240Hz the GPU rastered the drawing 240 times a second
// for as long as it drew (over a second of raster a circle, traced on a 4K
// screen). Here one loop moves what's in flight, at most 120 times a second
// and the glow under it, soft and faint, 60: each line hidden until the pen
// reaches it and set solid once drawn, so only those in flight are dashed;
// the script's marks, a seal's signs and the shapes cut solid faded in, a
// seal stamped, the same way. Nothing in a circle's drawing is a CSS
// animation, so nothing paints it at the screen's rate. The name plate
// (NamePlate) is drawn in by it too: with an animation a line its two SVGs
// were rastered at 240Hz with every question, more GPU than the circle's.
//
// Each SVG the pen draws in is a layer of its own to the GPU (a circle has
// some sixty), drawn again every time it moves, and each such drawing costs
// a fifth of a ms or so however little is in it. Moved all in the same
// frame, as they were, every other frame at 240Hz held the GPU for 5 ms or
// more, past the frame's 4.2, and the frames between next to nothing: the
// monad dropped frames for as long as it drew. So one loop moves every
// pen's SVGs, each on its own turn among the frames (`slot`): the lines
// half on even frames and half on odd ones, the glows a quarter on each,
// every one still as often as before. The script's marks fade in by their
// stroke's opacity, not their own: an opacity of its own on each of a
// hundred and fifty marks had Chrome lay out the page's layers again in
// every frame that faded one (a ms of the main thread a frame).

import { STAMP } from './engraver.ts';

/** How often the pen moves what's in flight, and the glow's (times a second; a slower screen, every frame). */
const PEN_HZ = 120;
const GLOW_HZ = 60;

/** CSS's cubic-bezier(x1, y1, x2, y2), from the time (0 to 1) to how far along. */
const bezier = (x1: number, y1: number, x2: number, y2: number) => {
  const at = (t: number, a: number, b: number) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  return (x: number) => {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      if (at(mid, x1, x2) < x) lo = mid;
      else hi = mid;
    }
    return at((lo + hi) / 2, y1, y2);
  };
};
/** A whole line's pace: slow to start, fast, slow to finish. */
const drawEase = bezier(0.55, 0, 0.25, 1);
/** A fade's and a stamp's (app.css's --ease-out). */
const easeOut = bezier(0.22, 1, 0.36, 1);
/** A soft fade's: CSS's own ease-out. */
const softEase = bezier(0, 0, 0.58, 1);

/**
 * How something comes in: a piece of a broken line drawn at the pen's own
 * pace (see stroke() in lib/engraver), a whole line drawn eased, a mark of
 * the script (a stroke and nothing else) or a shape faded in, a seal
 * stamped in from larger; `soft`, faded in on CSS's own ease-out (the name
 * plate's signs, `.fade`).
 */
type Kind = 'piece' | 'whole' | 'mark' | 'fade' | 'soft' | 'stamp';
/** One thing drawn in, from `from` to `to` (ms, performance.now()'s clock). */
type Stroke = { el: SVGElement; from: number; to: number; kind: Kind };
/**
 * One SVG's strokes in the order they start, those begun and not yet done,
 * how often it moves (ms), when it last did, its turn among the frames and
 * the pen it's drawn by.
 */
type Sheet = { svg: SVGSVGElement; first: Element | null; strokes: Stroke[]; next: number; flying: Stroke[]; every: number; moved: number; slot: number; pen: object };

const seconds = (el: Element | null, name: string) => parseFloat((el as SVGElement | null)?.style.getPropertyValue(name) || '0');

/**
 * When something the engraver wrote starts (s into the summoning) and how
 * long it takes: a line as it says (a seal's rings at the seal's delay), the
 * script's marks 0.35 s, a seal's stamp 0.55 s, its signs 0.6 s from 0.3 s
 * after it, a shape cut solid 0.6 s; a soft fade as it says (0.6 s unsaid).
 */
const timing = (el: SVGElement): [number, number, Kind] => {
  if (el.classList.contains('fade')) return [seconds(el, '--d'), seconds(el, '--t') || 0.6, 'soft'];
  const seal = el.closest('.seal');
  if (el === seal) return [seconds(el, '--d'), 0.55, 'stamp'];
  if (el.classList.contains('mark')) return [seconds(el, '--d'), 0.35, 'mark'];
  if (el.classList.contains('carve')) return [seconds(seal, '--d') + 0.3, 0.6, 'fade'];
  const own = el.style.getPropertyValue('--d');
  const at = own ? parseFloat(own) : seconds(seal, '--d');
  if (el.classList.contains('ink')) return [at, 0.6, 'fade'];
  return [at, seconds(el, '--t') || 1, el.classList.contains('piece') ? 'piece' : 'whole'];
};

/** Sets a stroke `u` of the way in (0 to 1). */
const move = ({ el, kind }: Stroke, u: number) => {
  if (kind === 'mark') el.style.strokeOpacity = u < 1 ? easeOut(u).toFixed(3) : '1';
  else if (kind === 'fade' || kind === 'soft') el.style.opacity = u < 1 ? (kind === 'soft' ? softEase : easeOut)(u).toFixed(3) : '1';
  else if (kind === 'stamp') {
    const e = easeOut(u);
    el.style.opacity = u < 1 ? e.toFixed(3) : '1';
    el.style.transform = u < 1 ? `scale(${(STAMP - (STAMP - 1) * e).toFixed(4)})` : 'none';
  } else if (u < 1) el.style.strokeDashoffset = (100 - 100 * (kind === 'piece' ? u : drawEase(u))).toFixed(2);
  else {
    el.style.strokeDasharray = 'none';
    el.style.strokeDashoffset = '0';
  }
};

export type Pen = {
  /** Draws an SVG in, as the engraver wrote it, the glow's if it's the glow. */
  add(svg: SVGSVGElement): void;
  stop(): void;
};

/** Every pen's SVGs in flight, moved by the one loop. */
const sheets: Sheet[] = [];
let frame = 0;
let last = 0;
/** The time between frames, as the screen shows them (a stall left out). */
let gap = 1000 / 60;
/** Frames the loop has run. */
let frames = 0;
/** The turns handed out so far, the lines' and the glows'. */
const dealt = { lines: 0, glow: 0 };

const run = (now: number) => {
  if (last && now - last < 100) gap += (now - last - gap) / 8;
  last = now;
  frames++;
  for (let i = sheets.length - 1; i >= 0; i--) {
    const s = sheets[i];
    // (Its still copy in its place, or the circle gone.)
    if (!s.svg.isConnected || s.svg.firstElementChild !== s.first) {
      sheets.splice(i, 1);
      continue;
    }
    // Every `n` frames on its turn, where the screen is quicker than its pace
    // (every frame where it isn't), or now if a slow frame put it behind.
    const n = Math.max(1, Math.round(s.every / gap));
    if ((frames + s.slot) % n && now - s.moved < s.every + gap / 2) continue;
    s.moved = now;
    while (s.next < s.strokes.length && s.strokes[s.next].from <= now) {
      const l = s.strokes[s.next++];
      if (l.kind === 'piece' || l.kind === 'whole') l.el.style.visibility = 'visible';
      s.flying.push(l);
    }
    let kept = 0;
    for (const l of s.flying) {
      const u = l.to > l.from ? Math.min(1, (now - l.from) / (l.to - l.from)) : 1;
      move(l, u);
      if (u < 1) s.flying[kept++] = l;
    }
    s.flying.length = kept;
    if (s.next === s.strokes.length && !kept) sheets.splice(i, 1);
  }
  frame = sheets.length ? requestAnimationFrame(run) : 0;
};

/** A pen for one circle, its summoning begun at `start` (performance.now()'s clock). */
export const drawIn = (start: number): Pen => {
  // Reduced motion: as app.css cuts every animation short, each thing shows whole as it's due.
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pen = {};
  return {
    add(svg) {
      const strokes: Stroke[] = [];
      for (const el of svg.querySelectorAll<SVGElement>('.draw, .mark, .carve, .seal, .fade')) {
        const [delay, t, kind] = timing(el);
        const from = start + 1000 * delay;
        strokes.push({ el, from, to: reduced ? from : from + 1000 * t, kind });
      }
      if (!strokes.length) return;
      strokes.sort((a, b) => a.from - b.from);
      const glow = svg.classList.contains('glow');
      const slot = glow ? dealt.glow++ : dealt.lines++;
      sheets.push({ svg, first: svg.firstElementChild, strokes, next: 0, flying: [], every: 1000 / (glow ? GLOW_HZ : PEN_HZ), moved: -Infinity, slot, pen });
      frame ||= requestAnimationFrame(run);
    },
    stop() {
      for (let i = sheets.length - 1; i >= 0; i--) if (sheets[i].pen === pen) sheets.splice(i, 1);
      if (!sheets.length) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    },
  };
};
