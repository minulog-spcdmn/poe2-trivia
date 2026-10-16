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

import { f, pt, rad, ring, type Part, type Pt } from './arcane.ts';

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

/**
 * One layer of a rune circle: its lines drawn twice, worn (`lines`) and
 * whole for the glow under them (`glow`), and, if it turns, how: once
 * round in `turn` seconds, the other way if `reverse`, after winding in
 * from `from` degrees. `tint`: a colour its lines lean toward (mixed with
 * the circle's own, so they still warm and cool with it), as the Delve
 * circle's azurite is blue.
 *
 * A layer can ride `within` another (named), turning or swaying about its
 * own `pivot` (a point in the plate, -100 to 100) as its parent carries it
 * round: a seal turning in its ring, a bud swaying on its stem. `sway`:
 * back and forth `swing` degrees either side, once in `period` seconds.
 * `upright`: it turns back against its parent as fast as the parent turns,
 * so it travels round with it but keeps facing the same way (a sun or a
 * moon, which have a right way up). `breathe`: it swells and shrinks about
 * its pivot (the centre, unless given) between full size and `low`, once
 * each way in `period` seconds, so rays seem to lengthen and shorten.
 * `flutter`: once every `period` seconds it narrows toward its pivot to
 * `fold` of its width and back, twice in quick succession, as a resting
 * moth stirs its wings. `mask`: its lines stop short of the shape `d`
 * (grown by `grow`) as that turns with the layer named `with`, so a ray
 * gives way to a head only while the head passes over it. Each is still a
 * box of its own, moved on the compositor.
 */
export type StageLayer = {
  name: string;
  lines: Plate;
  glow: Plate;
  spin?: { turn: number; from: number; reverse?: boolean };
  tint?: string;
  within?: string;
  pivot?: [number, number];
  sway?: { swing: number; period: number; delay?: number };
  upright?: boolean;
  breathe?: { low: number; period: number; delay?: number };
  flutter?: { fold: number; period: number; delay?: number };
  mask?: { d: string; grow: number; with: string };
};

/** How far round its ellipse (`rx`, `ry`, turned `rot`) an arc from `p` to `q` reaches: 1 where it is exactly half of it, below 1 where less. */
const reach = (rx: number, ry: number, rot: number, p: Pt, q: Pt) => {
  const [c, s] = [Math.cos(rad(rot)), Math.sin(rad(rot))];
  const [dx, dy] = [(p[0] - q[0]) / 2, (p[1] - q[1]) / 2];
  const [x, y] = [c * dx + s * dy, -s * dx + c * dy];
  return (x * x) / (rx * rx) + (y * y) / (ry * ry);
};
/**
 * An arc's radii as written, for an arc whose ends fall at `p` and `q`
 * (`exact`, before they are rounded to be written). Only an arc that is
 * exactly half its ellipse (a ring drawn in two halves, a moon's
 * terminator) needs care: ends rounded a hair closer than its radii
 * would swing its middle well off to one side, and a ring would bulge
 * into an oval; so there the radii are written a hair short of what the
 * written ends need, and the browser grows them to fit exactly. Every
 * other arc is written as it is.
 */
const radii = (rx: number, ry: number, rot: number, exact: [Pt, Pt], p: Pt, q: Pt) => {
  const fill = reach(rx, ry, rot, p, q);
  if (reach(rx, ry, rot, ...exact) > 0.9999 && fill < 1) {
    const k = Math.sqrt(fill) * 0.9995;
    return `${(rx * k).toFixed(4)} ${(ry * k).toFixed(4)}`;
  }
  return `${f(rx)} ${f(ry)}`;
};

/** Maps a path of absolute commands (as the signs are drawn) point by point; `turn` (degrees) and `k` for its arcs. */
export const mapPath = (d: string, m: (p: Pt) => Pt, turn = 0, k = 1) => {
  const tok = d.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) ?? [];
  let i = 0;
  let cmd = '';
  let cur: Pt = [0, 0];
  let start: Pt = [0, 0];
  /** Where the pen is on the page, as written and exactly, and where the figure began. */
  let at: Pt = [0, 0];
  let exact: Pt = [0, 0];
  let home: [Pt, Pt] = [
    [0, 0],
    [0, 0],
  ];
  let out = '';
  const num = () => Number(tok[i++]);
  const to = (p: Pt) => {
    cur = p;
    exact = m(p);
    const s = pt(exact);
    at = s.split(' ').map(Number) as Pt;
    return s;
  };
  while (i < tok.length) {
    if (/[A-Za-z]/.test(tok[i])) cmd = tok[i++];
    switch (cmd) {
      case 'M':
        out += `M${to([num(), num()])}`;
        start = cur;
        home = [at, exact];
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
        const [from, fromExact] = [at, exact];
        const end = to([num(), num()]);
        out += `A${radii(rx * k, ry * k, rot + turn, [fromExact, exact], from, at)} ${f(rot + turn)} ${large} ${sweep} ${end}`;
        break;
      }
      case 'Z':
        out += 'Z';
        cur = start;
        [at, exact] = home;
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
/** A whole circle about the origin, in arcs of a third (lib/arcane's ring), which keep true however their ends are rounded. */
export const circlePath = (r: number) => ring([0, 0], r);

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
