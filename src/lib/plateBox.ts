// The box a rune circle's layer is drawn in (lib/engraver.ts staged): the
// smallest rectangle, in the plate's own units (-100 to 100), round
// everything its paths draw. ArcaneStage sizes the layer to it rather than
// to the whole circle: each layer is a compositing layer of its own, at the
// screen's full density, and most draw in only part of the circle.

export type Box = [x0: number, y0: number, x1: number, y1: number];

/**
 * Room left round the paths for their strokes: the glow's (2.2 at most,
 * half of it outside the path) and their corners, with some to spare.
 * What a stroke still reaches past it (a sharp corner's mitre) is drawn all
 * the same (the layer's SVG lets it overflow); it only isn't counted here.
 */
const STROKE_ROOM = 3;

/** How many points an arc is measured at: off by under a thousandth of its radius. */
const ARC_STEPS = 64;

/** The box round every path in `markup` (`<path d="…">`, absolute M, L, A, C and Z), or null if it draws nothing. */
export function boxOf(markup: string): Box | null {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  const add = (x: number, y: number) => {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  };
  for (const [, d] of markup.matchAll(/\sd="([^"]*)"/g)) {
    const tok = d.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) ?? [];
    let i = 0;
    let cmd = '';
    let cur: [number, number] = [0, 0];
    let start: [number, number] = [0, 0];
    const num = () => Number(tok[i++]);
    while (i < tok.length) {
      if (/[A-Za-z]/.test(tok[i])) cmd = tok[i++];
      if (cmd === 'Z' || cmd === 'z') {
        cur = start;
        continue;
      }
      if (cmd === 'M' || cmd === 'L') {
        cur = [num(), num()];
        if (cmd === 'M') start = cur;
        add(...cur);
        // (Further pairs after an M are lines.)
        if (cmd === 'M') cmd = 'L';
      } else if (cmd === 'C') {
        // The curve stays within its control points.
        for (let k = 0; k < 3; k++) add(num(), num());
        cur = [Number(tok[i - 2]), Number(tok[i - 1])];
      } else if (cmd === 'A') {
        const [rx, ry, rot, large, sweep, x, y] = [num(), num(), num(), num(), num(), num(), num()];
        for (const p of arcPoints(cur, [x, y], rx, ry, rot, !!large, !!sweep)) add(...p);
        cur = [x, y];
      } else {
        throw new Error(`plateBox: path command "${cmd}" isn't measured`);
      }
    }
  }
  return x1 < x0 ? null : [x0 - STROKE_ROOM, y0 - STROKE_ROOM, x1 + STROKE_ROOM, y1 + STROKE_ROOM];
}

/** Points along an SVG arc from `p` to `q` (its centre worked out as SVG does: SVG 1.1, F.6.5), the ends included. */
function arcPoints(p: [number, number], q: [number, number], rx: number, ry: number, rotDeg: number, large: boolean, sweep: boolean): [number, number][] {
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
  const out: [number, number][] = [p, q];
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
