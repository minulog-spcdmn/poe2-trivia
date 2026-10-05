// The engraved plates of the category cards: old tarot cards in fine gold
// line, cut with the alchemist's circle's craft (docs/arcane-style.md:
// exact geometry, shading by one-sided hatching, lines stopping short of
// what they meet, a soft glow under them), but drawn as cards, not circles.
// They are laid out in pixels for a card's measured size; CardEngraving
// draws them, and the site's filigree sits on the corners as on any panel.
//
// The face (a tall card) is a window: a panel with notched corners and,
// standing in it, a round arch with a keystone and imposts. In the
// spandrels above it Sol and Luna, the corners round them hatched; inside
// it a glory of fine rays behind the emblem, which floats over a stepped
// plinth on a hatched floor. Under the panel, a nameplate.
//
// The back, the same either way up: a panel laid with a lattice of
// diamonds, and in its middle a mandorla, a sun at its heart in a glory
// of rays, a crescent above it and below, horns out, a star on each tip.
//
// Laid in a row (on phones) the face keeps its emblem in a glory beside
// a divider, and the back lays its mandorla down.

import {
  arc,
  at,
  f,
  line,
  LUNA,
  LUNA_HATCH,
  pointedRay,
  pt,
  rad,
  star8,
  type Cut,
  type Hole,
  type LineOpts,
  type Pt,
} from './arcane';

export type Cls = 'main' | 'thin' | 'hair' | 'hatch' | 'shade' | 'ray' | 'lattice' | 'sign' | 'fill';
export type Stroke = { d: string; cls: Cls };
/** Where the glory's rays fade out from, and how far they reach. */
export type Fade = { c: Pt; r: number };

// Where things sit, in pixels from the card's top left (inside its border).
// ChooseCategory's CSS places the emblem and the name to match.
/** A tall card's face: the panel's foot, the nameplate's top, and the emblem's centre. */
export const TALL = { panelFoot: 232, plateTop: 238, emblemY: 132 };
/** A card in a row: the emblem's centre from the left, and the divider after it. */
export const ROW = { emblemX: 54, divider: 102 };

type Box = [number, number, number, number];

/** Where a line from `p` to `q` runs inside a box, as a cut in [0, 1]. */
const inBox = (p: Pt, q: Pt, [x0, y0, x1, y1]: Box): Cut | null => {
  let [t0, t1] = [0, 1];
  const d = [q[0] - p[0], q[1] - p[1]];
  for (const [pk, qk] of [
    [-d[0], p[0] - x0],
    [d[0], x1 - p[0]],
    [-d[1], p[1] - y0],
    [d[1], y1 - p[1]],
  ]) {
    if (Math.abs(pk) < 1e-12) {
      if (qk < 0) return null;
      continue;
    }
    const t = qk / pk;
    if (pk < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
  }
  return t0 < t1 ? [t0, t1] : null;
};

/** Where a line from `p` to `q` runs inside a disc, as [t0, t1] (unclamped), if it meets it. */
const throughDisc = (p: Pt, q: Pt, c: Pt, r: number): Cut | null => {
  const [dx, dy] = [q[0] - p[0], q[1] - p[1]];
  const [fx, fy] = [p[0] - c[0], p[1] - c[1]];
  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const disc = b * b - 4 * a * (fx * fx + fy * fy - r * r);
  return disc > 0 ? [(-b - Math.sqrt(disc)) / (2 * a), (-b + Math.sqrt(disc)) / (2 * a)] : null;
};

/** Where a line from `p` to `q` runs inside an ellipse about `c`, as a cut in [0, 1]. */
const inEllipse = (p: Pt, q: Pt, c: Pt, rx: number, ry: number): Cut | null => {
  const k = rx / ry;
  const t = throughDisc([p[0], c[1] + (p[1] - c[1]) * k], [q[0], c[1] + (q[1] - c[1]) * k], c, rx);
  if (!t) return null;
  const [t0, t1] = [Math.max(0, t[0]), Math.min(1, t[1])];
  return t0 < t1 ? [t0, t1] : null;
};

/** A mandorla: the lens where two discs of radius `r` about `a` and `b` overlap. */
type Lens = { a: Pt; b: Pt; r: number };
/** Where a line from `p` to `q` runs inside a lens, as a cut in [0, 1]. */
const inLens = (p: Pt, q: Pt, { a, b, r }: Lens): Cut | null => {
  const [u, v] = [throughDisc(p, q, a, r), throughDisc(p, q, b, r)];
  if (!u || !v) return null;
  const [t0, t1] = [Math.max(u[0], v[0], 0), Math.min(u[1], v[1], 1)];
  return t0 < t1 ? [t0, t1] : null;
};
/** How far a ray out of `c` (inside the lens) at `deg` runs before it leaves it. */
const lensReach = (c: Pt, deg: number, { a, b, r }: Lens) => {
  const far = at(c, deg, 1000);
  return Math.min(...[a, b].map((o) => (throughDisc(c, far, o, r)?.[1] ?? 0) * 1000));
};

/** A rectangle with its corners notched by quarter circles of radius `n` about them, its sides `d` in, broken at `holes`. */
const notched = (x0: number, y0: number, x1: number, y1: number, n: number, d: number, holes: Hole[] = []) => {
  const s = Math.sqrt(n * n - d * d);
  const o = { holes };
  const corner = (from: Pt, to: Pt) => `M${pt(from)}A${n} ${n} 0 0 0 ${pt(to)}`;
  return [
    line([x0 + s, y0 + d], [x1 - s, y0 + d], o),
    corner([x1 - s, y0 + d], [x1 - d, y0 + s]),
    line([x1 - d, y0 + s], [x1 - d, y1 - s], o),
    corner([x1 - d, y1 - s], [x1 - s, y1 - d]),
    line([x1 - s, y1 - d], [x0 + s, y1 - d], o),
    corner([x0 + s, y1 - d], [x0 + d, y1 - s]),
    line([x0 + d, y1 - s], [x0 + d, y0 + s], o),
    corner([x0 + d, y0 + s], [x0 + s, y0 + d]),
  ].join('');
};

/** A plate being drawn: strokes by class. */
class Plate {
  out: Stroke[] = [];
  fade: Fade | null = null;
  add(d: string, cls: Cls) {
    if (d) this.out.push({ d, cls });
  }
  /** A frame of two lines with notched corners, broken at `holes`. */
  frame(x0: number, y0: number, x1: number, y1: number, holes: Hole[] = []) {
    this.add(notched(x0, y0, x1, y1, 5, 0, holes), 'main');
    this.add(notched(x0, y0, x1, y1, 7.5, 2.5, holes), 'hair');
  }
  /** A lozenge set on a frame's line, upright or (`flat`) lying along it. */
  lozenge(c: Pt, flat = false) {
    const [a, b] = flat ? [3.6, 2.2] : [2.2, 3.6];
    this.add(`M${pt([c[0], c[1] - b])}L${pt([c[0] + a, c[1]])}L${pt([c[0], c[1] + b])}L${pt([c[0] - a, c[1]])}Z`, 'thin');
    this.add(line([c[0], c[1] - b + 1], [c[0], c[1] + b - 1]), 'hatch');
  }
  /** An eight-pointed star, each point with a ridge and hatched down one side. */
  star(c: Pt, r: number) {
    const s = star8(c, r);
    this.add(s.outline, 'sign');
    this.add(s.ridges, 'hatch');
    this.add(s.hatch, 'hatch');
  }
  /** Sol, `r` across his rays: a disc with a dot, pointed rays hatched down one side and fine ones between. */
  sol(c: Pt, r: number) {
    this.add(arc(c, r * 0.36, 0, 360), 'thin');
    this.add(arc(c, r * 0.27, 0, 360), 'hair');
    this.add(`M${pt([c[0] + r * 0.07, c[1]])}A${f(r * 0.07)} ${f(r * 0.07)} 0 1 1 ${pt([c[0] - r * 0.07, c[1]])}A${f(r * 0.07)} ${f(r * 0.07)} 0 1 1 ${pt([c[0] + r * 0.07, c[1]])}Z`, 'fill');
    const r0 = r * 0.46;
    for (let k = 0; k < 16; k++) {
      const a = k * 22.5;
      if (k % 2) {
        this.add(line(at(c, a, r0), at(c, a, r * 0.72)), 'hatch');
        continue;
      }
      const ray = pointedRay(c, a, r0, k % 4 ? r * 0.82 : r, (Math.asin(Math.min(1, 1.05 / r0)) * 180) / Math.PI, 0.7);
      this.add(ray.lines, 'hair');
      this.add(ray.hatch, 'hatch');
    }
  }
  /** Luna, her horns (unturned) to the right, scaled from the circle's `k` times and turned `turn`. */
  luna(c: Pt, k: number, turn: number) {
    const place = (d: string) => transform(d, c, k, turn);
    this.add(place(LUNA), 'sign');
    this.add(place(LUNA_HATCH), 'hatch');
  }
  /**
   * Fine rays out of `c`, long and short in turn, as far as `reach` gives,
   * the short ones `short` of the way. Thinned toward the centre, as an
   * engraver would (or they'd run together): every fourth starts at `r0`,
   * every other one further out, the rest further still.
   */
  glory(c: Pt, n: number, r0: number, reach: (deg: number) => number, short: number, o: LineOpts = {}) {
    const rays = Array.from({ length: n }, (_, k) => {
      const a = ((k + 0.5) / n) * 360;
      const r1 = reach(a) - 2;
      const from = r0 * (k % 4 === 0 ? 1 : k % 2 === 0 ? 2.4 : 3.8);
      const end = k % 2 ? from + (r1 - from) * short : r1;
      return end - from > 4 ? line(at(c, a, from), at(c, a, end), o) : '';
    });
    this.add(rays.join(''), 'ray');
  }
  /**
   * A sun of pointed rays, hatched down one side, about a double ring of
   * radius `r`, its rays long and short in turn, to `long` and `short`.
   */
  sun(c: Pt, r: number, long: number, short: number, o: LineOpts = {}) {
    this.add(arc(c, r, 0, 360), 'main');
    this.add(arc(c, r - 1.4, 0, 360), 'hair');
    this.add(arc(c, r * 0.32, 0, 360), 'thin');
    this.add(arc(c, r * 0.07, 0, 360), 'fill');
    for (let k = 0; k < 16; k++) {
      const a = k * 22.5;
      const r1 = k % 2 ? short : long;
      const ray = pointedRay(c, a, r + 1.5, r1, (Math.asin((k % 2 ? 2.3 : 3) / (r + 1.5)) * 180) / Math.PI, 1, o);
      this.add(ray.lines, 'hair');
      this.add(ray.hatch, 'hatch');
    }
  }
  /** A field of diamonds, a bead where they meet, over the box `b`, left out inside `lens` (and `pad` round it). */
  lattice(b: Box, c: Pt, lens: Lens) {
    const [W, H] = [8, 11];
    const [x0, y0, x1, y1] = b;
    const pad = { ...lens, r: lens.r + 6 };
    let d = '';
    // Lines along u + v = n and u - v = n, where u and v count diamonds from `c`.
    const n0 = Math.ceil((Math.abs(x0 - c[0]) + Math.abs(x1 - c[0])) / W + (Math.abs(y0 - c[1]) + Math.abs(y1 - c[1])) / H);
    for (let n = -n0; n <= n0; n++)
      for (const s of [1, -1]) {
        // The line through (c.x + n W, c.y) going (W, -s H) per diamond.
        const p: Pt = [c[0] + n * W - 40 * W, c[1] + s * 40 * H];
        const q: Pt = [c[0] + n * W + 40 * W, c[1] - s * 40 * H];
        const inside = inBox(p, q, b);
        if (!inside) continue;
        const [a, e]: Pt[] = [inside[0], inside[1]].map((t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
        const cut = inLens(a, e, pad);
        d += line(a, e, { cuts: cut ? [cut] : [] });
      }
    this.add(d, 'lattice');
    let beads = '';
    for (let i = -n0; i <= n0; i++)
      for (let j = -n0; j <= n0; j++) {
        if ((i + j) % 2) continue;
        const p: Pt = [c[0] + (i * W) / 2, c[1] + (j * H) / 2];
        if (p[0] < x0 + 1 || p[0] > x1 - 1 || p[1] < y0 + 1 || p[1] > y1 - 1) continue;
        if (Math.hypot(p[0] - pad.a[0], p[1] - pad.a[1]) < pad.r && Math.hypot(p[0] - pad.b[0], p[1] - pad.b[1]) < pad.r) continue;
        beads += `M${pt([p[0] + 0.6, p[1]])}A0.6 0.6 0 1 1 ${pt([p[0] - 0.6, p[1]])}A0.6 0.6 0 1 1 ${pt([p[0] + 0.6, p[1]])}Z`;
      }
    this.add(beads, 'fill');
  }
  /** A mandorla's edge, two lines, broken at `holes`. */
  mandorla(lens: Lens, holes: Hole[]) {
    for (const [dr, cls] of [
      [3.5, 'thin'],
      [0, 'hair'],
    ] as const) {
      const r = lens.r + dr;
      for (const [o, other] of [
        [lens.a, lens.b],
        [lens.b, lens.a],
      ]) {
        // The arc of this disc that bounds the lens: between the tips, on the side facing the other centre.
        const half = (Math.acos(Math.hypot(other[0] - o[0], other[1] - o[1]) / 2 / r) * 180) / Math.PI;
        const toward = (Math.atan2(other[0] - o[0], -(other[1] - o[1])) * 180) / Math.PI;
        this.add(arc(o, r, toward - half, toward + half, { holes }), cls);
      }
    }
  }
}

/** Path data `d` (absolute commands only) turned by `turn` degrees, scaled by `k` and moved to `c`. */
const transform = (d: string, c: Pt, k = 1, turn = 0) => {
  const [cos, sin] = [Math.cos(rad(turn)), Math.sin(rad(turn))];
  const map = (x: number, y: number) => `${f(c[0] + k * (x * cos - y * sin))} ${f(c[1] + k * (x * sin + y * cos))}`;
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  let out = '';
  let cmd = '';
  let [cx, cy] = [0, 0];
  const num = () => Number(tokens.shift());
  while (tokens.length) {
    if (/[A-Za-z]/.test(tokens[0]!)) cmd = tokens.shift()!;
    if (cmd === 'Z') {
      out += 'Z';
      continue;
    }
    if (cmd === 'H' || cmd === 'V') {
      if (cmd === 'H') cx = num();
      else cy = num();
      out += `L${map(cx, cy)}`;
      continue;
    }
    if (cmd === 'A') {
      const [rx, ry, rot, large, sweep] = [num(), num(), num(), num(), num()];
      [cx, cy] = [num(), num()];
      out += `A${f(rx * k)} ${f(ry * k)} ${f(rot + turn)} ${large} ${sweep} ${map(cx, cy)}`;
      continue;
    }
    const pairs = { M: 1, L: 1, T: 1, S: 2, Q: 2, C: 3 }[cmd] ?? 1;
    out += cmd;
    for (let i = 0; i < pairs; i++) {
      const [x, y] = [num(), num()];
      out += (i ? ' ' : '') + map(x, y);
      [cx, cy] = [x, y];
    }
    if (cmd === 'M') cmd = 'L';
  }
  return out;
};

/** The largest circle in the corner of the box at `corner` (inside lines `inset` in), clear of a disc about `a` of radius `r`. */
const cornerCircle = (corner: Pt, inset: number, a: Pt, r: number): Hole => {
  // Its centre lies on the corner's diagonal; find where it touches the disc.
  const dir: Pt = [Math.sign(a[0] - corner[0]), Math.sign(a[1] - corner[1])];
  let [lo, hi] = [0, 200];
  for (let i = 0; i < 50; i++) {
    const m = (lo + hi) / 2;
    const c: Pt = [corner[0] + dir[0] * (inset + m), corner[1] + dir[1] * (inset + m)];
    if (Math.hypot(a[0] - c[0], a[1] - c[1]) - r > m) lo = m;
    else hi = m;
  }
  return { c: [corner[0] + dir[0] * (inset + lo), corner[1] + dir[1] * (inset + lo)], r: lo };
};

/** The face of a tall card `w` by `h`. */
const tallFace = (w: number, h: number, p: Plate) => {
  const MID = w / 2;
  const [x0, y0, x1, y1] = [16, 16, w - 16, TALL.panelFoot];
  const inner: Box = [x0 + 2.5, y0 + 2.5, x1 - 2.5, y1 - 2.5];
  const plate: Box = [16, TALL.plateTop, w - 16, h - 14];
  const plateMid = (plate[1] + plate[3]) / 2;
  p.frame(x0, y0, x1, y1);
  p.frame(...plate, [
    { c: [plate[0], plateMid], r: 4.5 },
    { c: [plate[2], plateMid], r: 4.5 },
  ]);
  p.lozenge([plate[0], plateMid]);
  p.lozenge([plate[2], plateMid]);

  // The arch: a half circle on two sides, its springing at S.
  const ri = MID - 26;
  const ro = ri + 3.5;
  const S = 110;
  const A: Pt = [MID, S];
  // The keystone, flaring a little, its left half hatched; the arcs stop at it.
  const key = [at(A, -4.5, ri), at(A, 4.5, ri), at(A, 5.4, ro + 2.2), at(A, -5.4, ro + 2.2)];
  p.add(`M${key.map(pt).join('L')}Z`, 'thin');
  for (const a of [-1.1, -2.2, -3.3]) p.add(line(at(A, a, ri + 0.6), at(A, a * 1.15, ro + 1.6)), 'hatch');
  // The imposts where the arch springs from its sides: a block across both lines.
  const imposts: Box[] = [-1, 1].map((s) => {
    const [a, b] = [MID + s * (ro + 1.8), MID + s * (ri - 4)];
    return [Math.min(a, b), S - 2.5, Math.max(a, b), S + 2];
  });
  for (const [bx0, by0, bx1, by1] of imposts) {
    p.add(`M${f(bx0)} ${f(by0)}H${f(bx1)}V${f(by1)}H${f(bx0)}Z`, 'thin');
    for (let x = bx0 + 1.4; x < bx1 - 0.6; x += 1.4) p.add(line([x, by1 - 0.7], [x, by1 - 1.9]), 'hatch');
  }
  for (const [r, cls, off] of [
    [ro, 'main', 5.3],
    [ri, 'thin', 4.5],
  ] as const) {
    const spring = (Math.asin(2.5 / r) * 180) / Math.PI;
    p.add(arc(A, r, -90 + spring, -off) + arc(A, r, off, 90 - spring), cls);
    p.add(line([MID - r, S + 2], [MID - r, y1]) + line([MID + r, S + 2], [MID + r, y1]), cls);
  }
  // The arch's moulding in relief: shaded down its left half, as if lit from the right.
  const spring = (Math.asin(2.5 / ri) * 180) / Math.PI;
  for (const d of [1.2, 2.3]) p.add(arc(A, ri + d, -90 + spring, -4.6), 'hatch');

  // The round dais the emblem floats over, seen from a little above: its
  // top an ellipse, its front a band, shaded down its right side; it stands
  // on a floor hatched in lines.
  const floor = y1 - 9;
  const [dx, dy, dh] = [54, 5, 6];
  const top: Pt = [MID, floor - dh];
  const ell = (c: Pt, from: number, to: number) => {
    const pts = Array.from({ length: 49 }, (_, i) => {
      const t = rad(from + ((to - from) * i) / 48);
      return pt([c[0] + dx * Math.cos(t), c[1] + dy * Math.sin(t)]);
    });
    return `M${pts.join('L')}`;
  };
  p.add(ell(top, 0, 360) + 'Z', 'thin');
  p.add(ell([MID, floor], 0, 180), 'thin');
  p.add(line([MID - dx, top[1]], [MID - dx, floor]) + line([MID + dx, top[1]], [MID + dx, floor]), 'thin');
  for (let x = MID + dx * 0.3; x < MID + dx - 0.6; x += 1.3) {
    const y = dy * Math.sqrt(1 - ((x - MID) / dx) ** 2);
    p.add(line([x, top[1] + y + 0.7], [x, floor + y - 0.7]), 'hatch');
  }
  const daisCuts = (a: Pt, b: Pt) =>
    [inEllipse(a, b, top, dx + 1, dy + 1), inEllipse(a, b, [MID, floor], dx + 1, dy + 1), inBox(a, b, [MID - dx - 1, top[1], MID + dx + 1, floor])].filter(
      (c): c is Cut => !!c,
    );
  p.add(line([MID - ri, floor], [MID + ri, floor], { cuts: daisCuts([MID - ri, floor], [MID + ri, floor]) }), 'thin');
  for (let y = floor + 1.6; y < y1 - 2.5; y += 1.6) {
    const [a, b]: Pt[] = [
      [MID - ri + 0.6, y],
      [MID + ri - 0.6, y],
    ];
    p.add(line(a, b, { cuts: daisCuts(a, b) }), 'hatch');
  }

  // Sol and Luna in the spandrels, each as large as the corner allows.
  const corners = [cornerCircle([x0, y0], 2.5, A, ro), cornerCircle([x1, y0], 2.5, A, ro)];
  const [sol, luna] = corners.map(({ c, r }) => ({ c, r: Math.min(13, r - 3.5) }));
  p.sol(sol.c, sol.r);
  p.luna(luna.c, (luna.r / 8.5) * 0.95, 180);

  // The spandrels and the strips beside the arch, hatched in lines rising
  // to the middle (mirrored either side), clear of the arch, the imposts,
  // Sol and Luna.
  const shadeHoles: Hole[] = [
    { c: A, r: ro + 0.8 },
    { c: sol.c, r: sol.r + 2.5 },
    { c: luna.c, r: luna.r + 2.5 },
  ];
  const shadeBoxes: Box[] = [[MID - ro - 0.8, S, MID + ro + 0.8, y1], ...imposts.map(([a, b, c, d]): Box => [a - 0.8, b - 0.8, c + 0.8, d + 0.8])];
  let shade = '';
  for (const side of [1, -1]) {
    const mx = (x: number) => (side > 0 ? x : w - x);
    for (let k = inner[0] + inner[1]; k < MID + inner[3]; k += 3.1) {
      const a: Pt = [Math.max(inner[0], k - inner[3]), 0];
      a[1] = k - a[0];
      const b: Pt = [Math.min(MID, k - inner[1]), 0];
      b[1] = k - b[0];
      if (b[0] - a[0] < 0.3) continue;
      const [pa, pb]: Pt[] = [
        [mx(a[0]), a[1]],
        [mx(b[0]), b[1]],
      ];
      shade += line(pa, pb, { holes: shadeHoles, cuts: shadeBoxes.map((bx) => inBox(pa, pb, bx)).filter((c): c is Cut => !!c) });
    }
  }
  p.add(shade, 'shade');

  // The glory behind the emblem, out to the arch and the floor, clear of the plinth.
  const C: Pt = [MID, TALL.emblemY];
  const reach = (deg: number) => {
    const u: Pt = [Math.sin(rad(deg)), -Math.cos(rad(deg))];
    const ts: number[] = [];
    if (u[1] > 1e-9) ts.push((floor - C[1]) / u[1]);
    if (Math.abs(u[0]) > 1e-9) {
      const t = ((u[0] > 0 ? MID + ri : MID - ri) - C[0]) / u[0];
      if (C[1] + t * u[1] >= S) ts.push(t);
    }
    const far = throughDisc(C, [C[0] + u[0] * 1000, C[1] + u[1] * 1000], A, ri);
    if (far && C[1] + far[1] * 1000 * u[1] <= S) ts.push(far[1] * 1000);
    return Math.min(...ts.filter((t) => t > 0));
  };
  p.glory(C, 120, 11, reach, 0.62);
  // The dais stands in front of the rays.
  p.out = p.out.map((s) => (s.cls === 'ray' ? { ...s, d: clipOut(s.d, daisCuts) } : s));
  p.fade = { c: C, r: 118 };
};

/** Straight segments `d` (M…L… pairs) with the stretches `cuts` gives taken out. */
const clipOut = (d: string, cuts: (a: Pt, b: Pt) => Cut[]) =>
  [...d.matchAll(/M(-?[\d.]+) (-?[\d.]+)L(-?[\d.]+) (-?[\d.]+)/g)]
    .map((m) => {
      const [a, b]: Pt[] = [
        [Number(m[1]), Number(m[2])],
        [Number(m[3]), Number(m[4])],
      ];
      return line(a, b, { cuts: cuts(a, b) });
    })
    .join('');

/** The face of a card `w` by `h` laid in a row: the emblem in a glory, a divider before the name. */
const rowFace = (w: number, h: number, p: Plate) => {
  const C: Pt = [ROW.emblemX, h / 2];
  const x = ROW.divider;
  const mid: Pt = [x, h / 2];
  for (const dx of [-1.25, 1.25]) p.add(line([x + dx, 14], [x + dx, h - 14], { holes: [{ c: mid, r: 4.5 }] }), dx < 0 ? 'thin' : 'hair');
  p.lozenge(mid);
  const box: Box = [10, 9, x - 6, h - 9];
  const reach = (deg: number) => {
    const u: Pt = [Math.sin(rad(deg)), -Math.cos(rad(deg))];
    const ts = [u[0] > 1e-9 ? (box[2] - C[0]) / u[0] : u[0] < -1e-9 ? (box[0] - C[0]) / u[0] : Infinity, u[1] > 1e-9 ? (box[3] - C[1]) / u[1] : u[1] < -1e-9 ? (box[1] - C[1]) / u[1] : Infinity];
    return Math.min(...ts);
  };
  p.glory(C, 72, 6, reach, 0.6);
  p.fade = { c: C, r: 52 };
};

/** The back of a card `w` by `h`. */
const back = (w: number, h: number, p: Plate) => {
  const row = w > h;
  const c: Pt = [w / 2, h / 2];
  const inset = row ? 10 : 16;
  p.frame(inset, inset, w - inset, h - inset);
  // The mandorla: standing on a tall card, lying in a row. Its half length
  // and half width give the two discs it's cut from.
  const [len, wid] = row ? [Math.min(122, w / 2 - 50), h / 2 - inset - 11] : [108, 60];
  const R = (len * len + wid * wid) / (2 * wid);
  const off = R - wid;
  const lens: Lens = row
    ? { a: [c[0], c[1] - off], b: [c[0], c[1] + off], r: R }
    : { a: [c[0] - off, c[1]], b: [c[0] + off, c[1]], r: R };
  const tipAt = (s: number, extra: number): Pt => (row ? [c[0] + s * (len + extra), c[1]] : [c[0], c[1] + s * (len + extra)]);
  // Its outer line, 3.5 out, meets further along than the inner; a star
  // sits just past it, and both lines stop short of the star.
  const outer = Math.sqrt((R + 3.5) ** 2 - off * off) - len;
  const tipStar = row ? 5.5 : 7;
  const tips = [-1, 1].map((s) => tipAt(s, outer + tipStar * 0.55));
  const tipHole = Math.max(tipStar + 2, outer + tipStar * 0.55 + 1.5);
  p.lattice([inset + 3, inset + 3, w - inset - 3, h - inset - 3], c, lens);
  p.mandorla(lens, tips.map((t) => ({ c: t, r: tipHole })));
  for (const t of tips) p.star(t, tipStar);
  // Crescents toward either tip, horns out.
  const moonK = row ? 0.95 : 1.35;
  const moons = [-1, 1].map((s) => tipAt(s, row ? -62 : -40));
  moons.forEach((m, i) => p.luna(m, moonK, row ? (i ? 0 : 180) : i ? 90 : -90));
  const holes: Hole[] = moons.map((m) => ({ c: m, r: 8.5 * moonK + 3 }));
  // The sun at the heart, in a glory out to the mandorla's edge.
  const sunR = row ? 9 : 17;
  p.glory(c, row ? 72 : 96, sunR + 2, (deg) => lensReach(c, deg, lens) - 2, 0.68, { holes });
  const room = (deg: number) => lensReach(c, deg, lens) - 3;
  p.sun(c, sunR, Math.min(row ? 24 : 42, room(0)), Math.min(row ? 18 : 31, room(22.5)), { holes });
  p.fade = { c, r: row ? len + 10 : len + 6 };
};

/** The strokes of one side of a card `w` by `h`, and where its glory fades. */
export const engrave = (side: 'face' | 'back', w: number, h: number) => {
  const p = new Plate();
  if (side === 'back') back(w, h, p);
  else if (w > h) rowFace(w, h, p);
  else tallFace(w, h, p);
  // Merge each class into one path.
  const by = new Map<Cls, string>();
  for (const { d, cls } of p.out) by.set(cls, (by.get(cls) ?? '') + d);
  return { strokes: [...by].map(([cls, d]) => ({ cls, d })), fade: p.fade };
};
