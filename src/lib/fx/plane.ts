// A plane an element lies in on screen, turned in 3D (an aura's card's face,
// tilted toward the pointer, lifted and swollen as it's hovered): shapes on
// it (ShapeSpec's `plane`) are drawn in its own px, turned and foreshortened
// as it is, where the effects' canvas is flat. It is measured by pins: empty
// spans at the corners of its element, and of what it's held in, whose boxes
// the browser gives as the points they land on, whatever turns them (the
// tilt, the deal, a sharp face's zoom), so nothing of the card's transforms
// is worked out again here. Once a frame, however often it's asked.

import type { Box, Point } from './core';

/** A plane's own px (from its centre) to the screen's: (A p + t) / (g . p + 1). */
type Map = { a: number; b: number; c: number; d: number; tx: number; ty: number; gx: number; gy: number };

export type Plane = {
  /** Its centre on screen, and its side in its own px: as large as it shows, as if it faced the viewer. */
  box(): Box;
  /** The box of what it's held in, in its own px from its centre; null for none. */
  clip(): Box | null;
  /**
   * The map about a point of it, its own px from its centre (where a shape
   * on it is centred), written at `o` in `out`: where that point lands on
   * screen, then how its px about there fall on screen: x's and y's (a 2 x 2,
   * by columns), and how far each foreshortens (the divide's two terms). As
   * the effects' shader reads them (renderer.ts, s0, s7 and s8).
   */
  about(x: number, y: number, out: Float32Array, o: number): void;
  /** Takes its pins away. */
  drop(): void;
};

/** Bumped as each frame of the effects begins (core.ts): a plane is measured once in it. */
let frameNo = 0;
export function planesFrame() {
  frameNo++;
}

/** Four empty spans at the corners of `host` (top left, top right, bottom right, bottom left), unseen. */
function pinsIn(host: Element): HTMLElement[] {
  return [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ].map(([x, y]) => {
    const p = document.createElement('span');
    p.className = 'fx-pin';
    p.setAttribute('aria-hidden', 'true');
    Object.assign(p.style, { position: 'absolute', left: `${x! * 100}%`, top: `${y! * 100}%`, width: '0', height: '0', visibility: 'hidden', pointerEvents: 'none' });
    host.append(p);
    return p;
  });
}

const pointOf = (el: Element): Point => {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top };
};

/** The square's corners (0,0), (1,0), (1,1), (0,1) to the four points q, as a homography (Heckbert's). */
function squareTo(q: Point[]): number[] {
  const [p0, p1, p2, p3] = q as [Point, Point, Point, Point];
  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const dy3 = p0.y - p1.y + p2.y - p3.y;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = den ? (dx3 * dy2 - dx2 * dy3) / den : 0;
  const h = den ? (dx1 * dy3 - dx3 * dy1) / den : 0;
  return [p1.x - p0.x + g * p1.x, p3.x - p0.x + h * p3.x, p0.x, p1.y - p0.y + g * p1.y, p3.y - p0.y + h * p3.y, p0.y, g, h];
}

/** The area of a four-cornered shape, its corners in order. */
function area(q: Point[]): number {
  let s = 0;
  for (let i = 0; i < q.length; i++) {
    const a = q[i]!;
    const b = q[(i + 1) % q.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

const FLAT = (b: Box): Map => ({ a: 1, b: 0, c: 0, d: 1, tx: b.x, ty: b.y, gx: 0, gy: 0 });

/**
 * The plane `el` lies in, and what it's held in (`clip`, an element in the
 * same plane: a card's face), both given pins (taken away with drop()).
 * `el` and `clip` must each place what's absolute in them (positioned, or
 * transformed).
 */
export function planeOf(el: HTMLElement, clip?: Element | null): Plane {
  const at = pinsIn(el);
  const held = clip ? pinsIn(clip) : [];
  let seen = -1;
  let box: Box = { x: 0, y: 0, w: 0, h: 0 };
  let map: Map = FLAT(box);
  let inside: Box | null = null;
  const measure = () => {
    if (seen === frameNo) return;
    seen = frameNo;
    const q = at.map(pointOf);
    const side = Math.sqrt(area(q));
    if (!(side > 1)) {
      // Seen edge on, or not laid out: flat where its box is.
      const r = el.getBoundingClientRect();
      box = { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
      map = FLAT(box);
      inside = null;
      return;
    }
    // Its own px from its centre to the square's (u = x / side + 0.5), then the square to the screen.
    const [a, b, c, d, e, f, g, h] = squareTo(q) as [number, number, number, number, number, number, number, number];
    const w = (g + h) / 2 + 1;
    map = { a: a / side / w, b: b / side / w, c: d / side / w, d: e / side / w, tx: ((a + b) / 2 + c) / w, ty: ((d + e) / 2 + f) / w, gx: g / side / w, gy: h / side / w };
    box = { x: map.tx, y: map.ty, w: side, h: side };
    inside = held.length ? boundsOf(held.map((p) => back(map, pointOf(p)))) : null;
  };
  return {
    box() {
      measure();
      return { ...box };
    },
    clip() {
      measure();
      return inside && { ...inside };
    },
    about(x, y, out, o) {
      measure();
      const m = map;
      const w = m.gx * x + m.gy * y + 1;
      const px = (m.a * x + m.b * y + m.tx) / w;
      const py = (m.c * x + m.d * y + m.ty) / w;
      out[o] = px;
      out[o + 1] = py;
      // (A - P g^T) / w, by columns, and g / w: the same map, about P.
      out[o + 2] = (m.a - px * m.gx) / w;
      out[o + 3] = (m.c - py * m.gx) / w;
      out[o + 4] = (m.b - px * m.gy) / w;
      out[o + 5] = (m.d - py * m.gy) / w;
      out[o + 6] = m.gx / w;
      out[o + 7] = m.gy / w;
    },
    drop() {
      for (const p of [...at, ...held]) p.remove();
    },
  };
}

/** A point on screen back to the plane's own px (the map undone). */
function back(m: Map, p: Point): Point {
  // Solve (A - p g^T) x = p - t.
  const a = m.a - p.x * m.gx;
  const b = m.b - p.x * m.gy;
  const c = m.c - p.y * m.gx;
  const d = m.d - p.y * m.gy;
  const rx = p.x - m.tx;
  const ry = p.y - m.ty;
  const det = a * d - b * c || 1e-9;
  return { x: (d * rx - b * ry) / det, y: (a * ry - c * rx) / det };
}

function boundsOf(ps: Point[]): Box {
  const xs = ps.map((p) => p.x);
  const ys = ps.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
}
