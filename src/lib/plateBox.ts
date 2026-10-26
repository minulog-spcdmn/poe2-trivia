// The box a rune circle's layer is drawn in (lib/engraver.ts staged): the
// smallest rectangle, in the plate's own units (-100 to 100), round
// everything its paths draw. ArcaneStage sizes the layer to it rather than
// to the whole circle: each layer is a compositing layer of its own, at the
// screen's full density, and most draw in only part of the circle.

export type Box = [x0: number, y0: number, x1: number, y1: number];
type Pt = [number, number];

/** The widest stroke drawn: the glow under a seal's sign drawn 1.1 times its size (ArcaneStage, `.glow .big`). */
const STROKE = 2.2;
/** How far a stroke reaches past its path's sides and ends (half its width), with some to spare. */
const STROKE_ROOM = STROKE / 2 + 0.4;
/** The lines' mitre limit (ArcaneStage: stroke-miterlimit): a sharper corner is cut off (bevelled), within the stroke's half width. */
const MITER_LIMIT = 12;

/** How many points an arc is measured at: off by under a thousandth of its radius. */
const ARC_STEPS = 64;

/**
 * The box round every path in `markup` (`<path d="…">`, absolute M, L, A,
 * C and Z), the strokes' width and their corners' mitres included; null if
 * it draws nothing. A path with anything else in it isn't measured: the
 * whole plate then, as every layer used to take.
 */
export function boxOf(markup: string): Box | null {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  const add = ([x, y]: Pt) => {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  };
  for (const [, d] of markup.matchAll(/\sd="([^"]*)"/g)) {
    const subpaths = subpathsOf(d);
    if (!subpaths) return WHOLE;
    for (const { from, segs, closed } of subpaths) {
      add(from);
      for (const s of segs) s.points.forEach(add);
      // A corner's mitre: where one segment ends and the next begins (a closed shape's last into its first too).
      const joins: [Seg, Seg][] = segs.slice(1).map((s, i) => [segs[i], s]);
      if (closed && segs.length > 1) joins.push([segs[segs.length - 1], segs[0]]);
      for (const [a, b] of joins) {
        const tip = mitre(a.end, a.outDir, b.inDir);
        if (tip) add(tip);
      }
    }
  }
  return x1 < x0 ? null : [x0 - STROKE_ROOM, y0 - STROKE_ROOM, x1 + STROKE_ROOM, y1 + STROKE_ROOM];
}

/** One segment of a path: the points it passes through (or a hull round it), where it ends, and its direction leaving its start and arriving at its end. */
type Seg = { points: Pt[]; end: Pt; inDir: Pt; outDir: Pt };

/** A subpath: where it starts, its segments, and whether it closes back to its start. */
type Subpath = { from: Pt; segs: Seg[]; closed: boolean };

/** A path's subpaths, segment by segment; null for anything but absolute M, L, A, C and Z. */
function subpathsOf(d: string): Subpath[] | null {
  const tok = d.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) ?? [];
  let i = 0;
  const num = () => Number(tok[i++]);
  // Arc flags may be written run together ("A5 5 0 015 5"): read a character at a time.
  const flag = () => {
    const t = tok[i];
    if (t === undefined || !/^[01]/.test(t)) return NaN;
    if (t.length === 1) i++;
    else tok[i] = t.slice(1);
    return Number(t[0]);
  };
  const out: Subpath[] = [];
  let sub: Subpath | null = null;
  let cmd = '';
  let cur: Pt = [0, 0];
  let start: Pt = [0, 0];
  const push = (seg: Seg) => {
    if (!sub) out.push((sub = { from: cur, segs: [], closed: false }));
    sub.segs.push(seg);
    cur = seg.end;
  };
  const line = (to: Pt) => {
    const dir = unit(to, cur);
    push({ points: [cur, to], end: to, inDir: dir, outDir: dir });
  };
  while (i < tok.length) {
    if (/[A-Za-z]/.test(tok[i])) cmd = tok[i++];
    if (cmd === 'Z') {
      if (sub) {
        if (cur[0] !== start[0] || cur[1] !== start[1]) line(start);
        sub.closed = true;
      }
      sub = null;
      cur = start;
      continue;
    }
    if (cmd === 'M') {
      cur = start = [num(), num()];
      out.push((sub = { from: cur, segs: [], closed: false }));
      // (Further pairs after an M are lines.)
      cmd = 'L';
    } else if (cmd === 'L') {
      line([num(), num()]);
    } else if (cmd === 'C') {
      const [c1, c2, to]: Pt[] = [
        [num(), num()],
        [num(), num()],
        [num(), num()],
      ];
      // The curve stays within its control points; it leaves towards the first and arrives from the second.
      const inDir = [c1, c2, to].map((p) => unit(p, cur)).find(([x, y]) => x || y) ?? [0, 0];
      const outDir = [c2, c1, cur].map((p) => unit(to, p)).find(([x, y]) => x || y) ?? [0, 0];
      push({ points: [cur, c1, c2, to], end: to, inDir, outDir });
    } else if (cmd === 'A') {
      const [rx, ry, rot] = [num(), num(), num()];
      const [large, sweep] = [flag(), flag()];
      const to: Pt = [num(), num()];
      if ([rx, ry, rot, large, sweep, ...to].some(Number.isNaN)) return null;
      const points = arcPoints(cur, to, rx, ry, rot, !!large, !!sweep);
      // (Its ends first, then the points along it in order: its directions there, from the nearest of them.)
      const along = points.slice(2);
      push({ points, end: to, inDir: unit(along[0] ?? to, cur), outDir: unit(to, along[along.length - 1] ?? cur) });
    } else {
      return null;
    }
    if (cur.some(Number.isNaN)) return null;
  }
  return out;
}

/** The direction from `b` to `a`, of length 1 (none where they're the same point). */
const unit = (a: Pt, b: Pt): Pt => {
  const [x, y] = [a[0] - b[0], a[1] - b[1]];
  const l = Math.hypot(x, y);
  return l ? [x / l, y / l] : [0, 0];
};

/** Where the mitre at the corner `at` reaches (arriving along `a`, leaving along `b`); null where there's no corner, or it's cut off within the stroke's half width. */
function mitre(at: Pt, a: Pt, b: Pt): Pt | null {
  if (!(a[0] || a[1]) || !(b[0] || b[1])) return null;
  // The angle between the way back along `a` and the way on along `b`.
  const cos = -(a[0] * b[0] + a[1] * b[1]);
  const sinHalf = Math.sqrt(Math.max(0, (1 - cos) / 2));
  if (sinHalf > 0.999 || 1 / sinHalf > MITER_LIMIT) return null;
  // Out from the corner, away from both sides.
  const out = unit(a, b);
  const reach = STROKE / 2 / sinHalf;
  return [at[0] + out[0] * reach, at[1] + out[1] * reach];
}

/** Points along an SVG arc from `p` to `q` (its centre worked out as SVG does: SVG 1.1, F.6.5): its ends, then the points between in order. */
function arcPoints(p: Pt, q: Pt, rx: number, ry: number, rotDeg: number, large: boolean, sweep: boolean): Pt[] {
  if (!rx || !ry || (p[0] === q[0] && p[1] === q[1])) return [p, q];
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const phi = (rotDeg * Math.PI) / 180;
  const [c, s] = [Math.cos(phi), Math.sin(phi)];
  const [dx, dy] = [(p[0] - q[0]) / 2, (p[1] - q[1]) / 2];
  const x1 = c * dx + s * dy;
  const y1 = -s * dx + c * dy;
  // Radii too small to reach are grown until they just do.
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cx1 = (k * rx * y1) / ry;
  const cy1 = (-k * ry * x1) / rx;
  const cx = c * cx1 - s * cy1 + (p[0] + q[0]) / 2;
  const cy = s * cx1 + c * cy1 + (p[1] + q[1]) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let dt = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const out: Pt[] = [p, q];
  for (let n = 1; n < ARC_STEPS; n++) {
    const t = t1 + (dt * n) / ARC_STEPS;
    const [ex, ey] = [rx * Math.cos(t), ry * Math.sin(t)];
    out.push([c * ex - s * ey + cx, s * ex + c * ey + cy]);
  }
  return out;
}

/** The box round both. */
export const union = (a: Box | null, b: Box | null): Box | null =>
  !a ? b : !b ? a : [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];

/** The whole plate (-100 to 100): the box of a layer that isn't given one of its own. */
export const WHOLE: Box = [-100, -100, 100, 100];

/** How far from the plate's centre a box reaches, along either axis. */
export const reachOf = (b: Box) => Math.max(...b.map(Math.abs));

/** Boxes from the plate's centre out: their indices, the one reaching least first (those reaching as far in their own order). */
export const insideOut = (boxes: Box[]) =>
  boxes
    .map((b, i) => [reachOf(b), i] as const)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .map(([, i]) => i);

const pc = (n: number) => `${+(n * 100).toFixed(4)}%`;

/**
 * Where a layer drawn in `box` sits in the box `inside` (both in plate
 * units), as CSS percentages of it, and the point it turns, sways and
 * swells about (`pivot`, or the plate's centre) in its own: the layer is
 * sized to its drawing, and everything turns about the point it always did.
 * `viewBox` shows the plate's units in that box.
 */
export function placed(box: Box, inside: Box, pivot: [number, number] = [0, 0]) {
  const [w, h] = [box[2] - box[0], box[3] - box[1]];
  const [W, H] = [inside[2] - inside[0], inside[3] - inside[1]];
  return {
    left: pc((box[0] - inside[0]) / W),
    top: pc((box[1] - inside[1]) / H),
    width: pc(w / W),
    height: pc(h / H),
    origin: `${pc((pivot[0] - box[0]) / w)} ${pc((pivot[1] - box[1]) / h)}`,
    viewBox: `${box[0]} ${box[1]} ${w} ${h}`,
  };
}
