// The press behind the rune circles (ArcaneCircle, MonadCircle, both set on
// ArcaneStage; see docs/arcane-style.md): it turns a drawing's lines into the
// markup that draws them in, piece by piece, and into the still copy that
// takes their place once drawn.
//
// A circle is made of hundreds of lines, most of them pieces of a broken
// line, each drawn in by its own animation. Built as markup once per page
// load (not as hundreds of components each time a circle mounts) and put on
// the page a layer at a time, just before each draws, no frame carries much
// of it. Once a layer is drawn, its pieces give way to a still copy: the
// same lines merged into one path per weight, with nothing animated
// (finished animations keep holding their last frame and are styled again
// with every change of the circle's colour), so a reveal recolours a few
// dozen paths, not the whole drawing.

import { f, pt, rad, type Part, type Pt } from './arcane.ts';

const sec = (v: number) => `${v.toFixed(3)}s`;

/**
 * Timing for drawing a broken line in one stroke: each piece starts when
 * the pen reaches it and draws at the pen's speed, the pen sweeping the
 * whole in `t` seconds after `delay`, fast at first and slowing at the end.
 * (A dash can't run on from one piece to the next by itself.)
 */
export const stroke = (parts: Part[], delay: number, t: number) => {
  const when = (y: number) => 1 - Math.sqrt(1 - Math.min(1, Math.max(0, y)));
  return parts.map(({ d, from, to }) => ({
    d,
    delay: delay + when(from) * t,
    t: Math.max(0.03 * t, (when(to) - when(from)) * t),
  }));
};
export type Stroke = ReturnType<typeof stroke>;

/** A drawing's lines as they draw in, the same lines still, and when the first of them starts and the last is drawn (s). */
export type Plate = { drawing: string; still: string; start: number; end: number };

/** Maps a path of absolute commands (as the signs are drawn) point by point; `turn` (degrees) and `k` for its arcs. */
export const mapPath = (d: string, m: (p: Pt) => Pt, turn = 0, k = 1) => {
  const tok = d.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) ?? [];
  let i = 0;
  let cmd = '';
  let cur: Pt = [0, 0];
  let start: Pt = [0, 0];
  let out = '';
  const num = () => Number(tok[i++]);
  const to = (p: Pt) => ((cur = p), pt(m(p)));
  while (i < tok.length) {
    if (/[A-Za-z]/.test(tok[i])) cmd = tok[i++];
    switch (cmd) {
      case 'M':
        out += `M${to([num(), num()])}`;
        start = cur;
        cmd = 'L';
        break;
      case 'L':
        out += `L${to([num(), num()])}`;
        break;
      case 'H':
        out += `L${to([num(), cur[1]])}`;
        break;
      case 'V':
        out += `L${to([cur[0], num()])}`;
        break;
      case 'C':
        out += `C${pt(m([num(), num()]))} ${pt(m([num(), num()]))} ${to([num(), num()])}`;
        break;
      case 'S':
        out += `S${pt(m([num(), num()]))} ${to([num(), num()])}`;
        break;
      case 'A': {
        const [rx, ry, rot, large, sweep] = [num(), num(), num(), num(), num()];
        out += `A${f(rx * k)} ${f(ry * k)} ${f(rot + turn)} ${large} ${sweep} ${to([num(), num()])}`;
        break;
      }
      case 'Z':
        out += 'Z';
        cur = start;
        cmd = '';
        break;
      default:
        throw new Error(`engraver: no ${cmd} in a sign's path`);
    }
  }
  return out;
};
/** Turned `a` degrees about the origin (clockwise on screen, as SVG's rotate). */
export const turned = (a: number) => {
  const [c, s] = [Math.cos(rad(a)), Math.sin(rad(a))];
  return ([x, y]: Pt): Pt => [x * c - y * s, x * s + y * c];
};
export const circlePath = (r: number) => `M0 ${-r}A${r} ${r} 0 1 1 0 ${r}A${r} ${r} 0 1 1 0 ${-r}Z`;

/** Builds one drawing's markup, collecting the still copy's paths by their weight (class) as it goes. */
export const engrave = (draw: (e: Engraver) => void): Plate => {
  const e = engraver();
  draw(e);
  return { drawing: e.drawing(), still: e.still(), start: e.start(), end: e.end() };
};
export type Engraver = ReturnType<typeof engraver>;
const engraver = () => {
  let drawing = '';
  let start = Infinity;
  let end = 0;
  const still = new Map<string, string>();
  const keep = (cls: string, d: string) => still.set(cls, (still.get(cls) ?? '') + d);
  /** A line that starts at `from` and is done at `to`. */
  const span = (from: number, to: number) => {
    start = Math.min(start, from);
    end = Math.max(end, to);
  };
  const style = (delay: number, t: number) => `style="--d:${sec(delay)};--t:${sec(t)}"`;
  return {
    /** A line drawn in, eased, as one stroke. */
    line(d: string, cls: string, delay: number, t: number) {
      drawing += `<path d="${d}" class="draw ${cls}" ${style(delay, t)} pathLength="100"/>`;
      keep(cls, d);
      span(delay, delay + t);
    },
    /** A broken line drawn in one sweep of the pen, piece by piece (see stroke()). */
    pieces(list: Stroke, cls: string) {
      for (const { d, delay, t } of list) {
        drawing += `<path d="${d}" class="draw piece ${cls}" ${style(delay, t)} pathLength="100"/>`;
        keep(cls, d);
        span(delay, delay + t);
      }
    },
    /**
     * A seal stamped in at `delay`: its double ring (`r`, the inner one
     * `inner` inside it) drawn in `t`, its signs ([path, class, scale])
     * set down after; `place` puts a point of it on the circle, as
     * `transform` (turning it `turn` degrees) does.
     */
    seal(delay: number, place: (p: Pt) => Pt, transform: string, turn: number, r: number, inner: number, t: number, signs: [string, string, number][]) {
      drawing += `<g class="seal" style="--d:${sec(delay)}"><g transform="${transform}">`;
      drawing += `<circle r="${r}" class="draw" style="--t:${sec(t)}" pathLength="100"/>`;
      drawing += `<circle r="${f(r - inner)}" class="draw hair" style="--t:${sec(t)}" pathLength="100"/>`;
      for (const [d, cls, k] of signs) drawing += `<path d="${d}"${k === 1 ? '' : ` transform="scale(${k})"`} class="${cls} carve"/>`;
      drawing += '</g></g>';
      keep('', mapPath(circlePath(r), place));
      keep('hair', mapPath(circlePath(r - inner), place));
      for (const [d, cls, k] of signs) keep(k === 1 ? cls : `${cls} big`, mapPath(d, (p) => place([p[0] * k, p[1] * k]), turn, k));
      span(delay, delay + Math.max(0.55, t, 0.3 + 0.6));
    },
    /** A mark of the script, written at `delay`, `transform` and `place` putting it on the band. */
    mark(d: string, delay: number, transform: string, place: (p: Pt) => Pt, turn: number) {
      drawing += `<path d="${d}" transform="${transform}" class="sign mark" style="--d:${sec(delay)}"/>`;
      keep('sign', mapPath(d, place, turn));
      span(delay, delay + 0.35);
    },
    drawing: () => drawing,
    still: () => [...still].map(([cls, d]) => `<path d="${d}"${cls ? ` class="${cls}"` : ''}/>`).join(''),
    start: () => start,
    end: () => end,
  };
};
