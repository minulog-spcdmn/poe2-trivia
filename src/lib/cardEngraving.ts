// The engraved plates of the category cards, in the alchemist's circle's
// style (docs/arcane-style.md), laid out in pixels for a card's measured
// size. CardEngraving draws them.
//
// Both sides share a border: two lines with a band of the circle's
// unreadable script between them, and a seal at each corner holding one
// of the four lesser planets (Mercury, Venus, Mars, Jupiter).
//
// The face (a tall card): the emblem stands in a sun of sixteen pointed
// rays, hatched down one side, with fine rays between. Its long diagonal
// rays point up at Sol and Luna in great seals in the corners and down
// at two eight-pointed stars, and stop short of them. A divider under the
// picture carries Saturn's seal, and below it is the nameplate. So all
// seven planets are on the face, once each.
//
// The back (the same either way up): a woven eight-pointed star {8/3}
// round the card's seal, a sun inside it whose long rays run out into the
// star's arms, passing under its straps, Luna above and below in great
// seals, and a small star in each corner.
//
// Laid in a row (on phones) the face keeps its emblem in a square cell
// at the left, ringed, behind a divider; the back lays its sun down, Luna
// to either side, its rays running out sideways.

import {
  at,
  f,
  line,
  LUNA,
  LUNA_HATCH,
  PLANETS,
  pointedRay,
  rad,
  ring,
  script,
  seeded,
  star8,
  wear as wearOf,
  wovenStar,
  type Hole,
  type LineOpts,
  type Pt,
  type Wear,
} from './arcane';

export type Cls = 'main' | 'thin' | 'hair' | 'hatch' | 'sign' | 'script' | 'fill';
export type Stroke = { d: string; cls: Cls };

// Where things sit, in pixels from the card's top left (inside its border).
// ChooseCategory's CSS places the emblem, the name and the seal to match.
/** A tall card: the border's lines' insets, and the nameplate's height (under a divider 5 across). */
export const TALL = { band: [9, 17], plate: 46, seal: 72 };
/** On a tall card `h` high, the emblem's centre: midway down the picture, between the border and the divider. */
export const emblemY = (h: number) => (h - TALL.plate - 5) / 2;
/** A card in a row: the border's lines' insets and the emblem's cell, square on the left. */
export const ROW = { band: [6, 13], cell: 80, seal: 38 };

/** Path data `d` (absolute commands only) turned by `turn` degrees, scaled by `k` and moved to `c`. */
const place = (d: string, c: Pt, k = 1, turn = 0) => {
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
    // After a move, further pairs are lines.
    if (cmd === 'M') cmd = 'L';
  }
  return out;
};

/** A plate being drawn: strokes by class, worn or (for the glow) whole. */
class Plate {
  out: Stroke[] = [];
  constructor(readonly wear: Wear) {}
  add(d: string, cls: Cls) {
    if (d) this.out.push({ d, cls });
  }
  /** Lines worn as the plate is (signs and hatching never wear). */
  opts(o: LineOpts = {}): LineOpts {
    return { ...o, wear: this.wear };
  }
  /** A seal: a double ring of radius `r` round a sign drawn `k` times its size. */
  seal(c: Pt, r: number, sign: string, k: number, turn = 0) {
    this.add(ring(c, r, this.opts()), 'thin');
    this.add(ring(c, r - r * 0.17), 'hair');
    this.add(place(sign, c, k, turn), 'sign');
  }
  /** Sol in a great seal of radius 13 · `k`: a disc with a dot, and twelve rays long and short. */
  sol(c: Pt, k = 1) {
    this.add(ring(c, 13 * k, this.opts()), 'main');
    this.add(ring(c, 11.4 * k), 'hair');
    this.add(ring(c, 5 * k), 'sign');
    this.add(ring(c, 1.1 * k), 'fill');
    this.add(Array.from({ length: 12 }, (_, i) => line(at(c, i * 30, 6.6 * k), at(c, i * 30, (i % 2 ? 8.4 : 10) * k))).join(''), 'sign');
  }
  /** Luna in a great seal of radius 13 · `k`, her horns turned by `turn` from the right. */
  luna(c: Pt, turn: number, k = 1) {
    this.add(ring(c, 13 * k, this.opts()), 'main');
    this.add(ring(c, 11.4 * k), 'hair');
    this.add(place(LUNA, c, k, turn), 'sign');
    this.add(place(LUNA_HATCH, c, k, turn), 'hatch');
  }
  /** An eight-pointed star, each point with a ridge and hatched down one side. */
  star(c: Pt, r: number) {
    const s = star8(c, r);
    this.add(s.outline, 'sign');
    this.add(s.ridges, 'hatch');
    this.add(s.hatch, 'hatch');
  }
  /**
   * A sun's ring of pointed rays out of `c` from `r0`, long and short in
   * turn, the first at `from` degrees; each as long as `tip` gives (left
   * out if that's too short to read).
   */
  rays(c: Pt, n: number, r0: number, tip: (a: number, long: boolean) => number, o: LineOpts, from = 0) {
    for (let k = 0; k < n; k++) {
      const a = from + (k / n) * 360;
      const long = k % 2 === 0;
      const r1 = tip(a, long);
      if (r1 - r0 < 8) continue;
      // Their bases as wide on the card as the circle's look on the stage.
      const half = (Math.asin((long ? 4.2 : 3.4) / r0) * 180) / Math.PI;
      const ray = pointedRay(c, a, r0, r1, half, 1.15, this.opts(o));
      this.add(ray.lines, 'hair');
      this.add(ray.hatch, 'hatch');
    }
  }
  /** Fine straight rays between the pointed ones. */
  fine(c: Pt, n: number, r0: number, r1: number, o: LineOpts) {
    this.add(Array.from({ length: n }, (_, k) => line(at(c, ((k + 0.5) / n) * 360, r0), at(c, ((k + 0.5) / n) * 360, r1), o)).join(''), 'hair');
  }
  /**
   * The border: two lines `b0` and `b1` in from the edges of a `w` by `h`
   * card, a seal at each corner, and the script between.
   */
  border(w: number, h: number, [b0, b1]: number[], scale: number) {
    const m = (b0 + b1) / 2;
    const r = (b1 - b0) * 0.8;
    const corners: Pt[] = [
      [m, m],
      [w - m, m],
      [w - m, h - m],
      [m, h - m],
    ];
    const holes: Hole[] = corners.map((c) => ({ c, r: r + 1.2 }));
    for (const b of [b0, b1]) {
      const pts: Pt[] = [
        [b, b],
        [w - b, b],
        [w - b, h - b],
        [b, h - b],
      ];
      for (let i = 0; i < 4; i++) this.add(line(pts[i], pts[(i + 1) % 4], this.opts({ holes })), b === b0 ? 'main' : 'thin');
    }
    const signs = [PLANETS.mercury, PLANETS.venus, PLANETS.mars, PLANETS.jupiter];
    corners.forEach((c, i) => this.seal(c, r, signs[i], (r / 7.2) * 0.95));
    // Round the card, each side's marks upright toward the edge they run along.
    const rnd = seeded(11);
    const gap = r + 3;
    const sides: [Pt, Pt, number][] = [
      [[m + gap, m], [w - m - gap, m], 0],
      [[w - m, m + gap], [w - m, h - m - gap], 90],
      [[w - m - gap, h - m], [m + gap, h - m], 180],
      [[m, h - m - gap], [m, m + gap], 270],
    ];
    this.add(
      sides
        .flatMap(([p, q, up]) => script(p, q, scale, up, rnd))
        .map((s) => place(s.d, s.at, scale, s.up))
        .join(''),
      'script',
    );
    return r;
  }
}

/** How far a ray out of `c` at `a` runs before it leaves the box [x0, x1] by [y0, y1]. */
const reach = (c: Pt, a: number, [x0, y0, x1, y1]: number[]) => {
  const [dx, dy] = [Math.sin(rad(a)), -Math.cos(rad(a))];
  const ts = [dx > 1e-9 ? (x1 - c[0]) / dx : dx < -1e-9 ? (x0 - c[0]) / dx : Infinity, dy > 1e-9 ? (y1 - c[1]) / dy : dy < -1e-9 ? (y0 - c[1]) / dy : Infinity];
  return Math.min(...ts);
};

/** The face of a card `w` by `h`. */
const face = (w: number, h: number, p: Plate) => {
  if (w > h) {
    const b1 = ROW.band[1];
    p.border(w, h, ROW.band, 0.95);
    // The emblem's cell, and the divider beside it.
    const x = b1 + ROW.cell;
    for (const dx of [-2.5, 2.5]) p.add(line([x + dx, b1], [x + dx, h - b1], p.opts()), 'thin');
    const c: Pt = [b1 + ROW.cell / 2, h / 2];
    const r = Math.min(ROW.cell / 2, h / 2 - b1) - 3;
    p.add(ring(c, r, p.opts()), 'main');
    p.add(ring(c, r - 1.6), 'hair');
    // A small star in each corner of the cell.
    const d = Math.hypot(ROW.cell / 2, h / 2 - b1) - 7;
    for (const a of [45, 135, 225, 315]) p.star(at(c, a, d), 3.6);
    return;
  }
  const b1 = TALL.band[1];
  const sealR = p.border(w, h, TALL.band, 1.1);
  // The divider over the nameplate, Saturn's seal in its middle.
  const y = h - b1 - TALL.plate - 2.5;
  const saturn: Pt = [w / 2, y];
  for (const dy of [-2.5, 2.5]) p.add(line([b1, y + dy], [w - b1, y + dy], p.opts({ holes: [{ c: saturn, r: sealR + 1.2 }] })), 'thin');
  p.seal(saturn, sealR, PLANETS.saturn, (sealR / 7.2) * 0.95);
  // The picture: the sun round the emblem, Sol and Luna above, stars below.
  const c: Pt = [w / 2, emblemY(h)];
  const box = [b1 + 3, b1 + 3, w - b1 - 3, y - 2.5 - 3];
  const SUN = 60;
  const far = 106;
  const sol = at(c, -45, far);
  const luna = at(c, 45, far);
  const stars = [at(c, -135, far - 6), at(c, 135, far - 6)];
  const holes: Hole[] = [
    { c: sol, r: 14.4 },
    { c: luna, r: 14.4 },
    ...stars.map((s) => ({ c: s, r: 11 })),
  ];
  p.add(ring(c, SUN, p.opts()), 'main');
  p.add(ring(c, SUN - 1.6), 'thin');
  p.rays(c, 16, SUN, (a, long) => Math.min(long ? 98 : 80, reach(c, a, box)), { holes });
  p.fine(c, 16, SUN + 1, SUN + 12, { holes });
  p.sol(sol);
  p.luna(luna, 180);
  for (const s of stars) p.star(s, 8.5);
};

/** The back of a card `w` by `h`, round its seal. */
const back = (w: number, h: number, p: Plate) => {
  const c: Pt = [w / 2, h / 2];
  if (w > h) {
    const seal = ROW.seal;
    const b1 = ROW.band[1];
    p.border(w, h, ROW.band, 0.95);
    const box = [b1 + 3, b1 + 3, w - b1 - 3, h - b1 - 3];
    const SUN = seal / 2 + 8;
    const lunas = [-1, 1].map((s) => [c[0] + s * 92, c[1]] as Pt);
    const stars = [-1, 1].map((s) => [c[0] + s * 128, c[1]] as Pt);
    const holes: Hole[] = [...lunas.map((l) => ({ c: l, r: 14.4 })), ...stars.map((s) => ({ c: s, r: 10 }))];
    p.add(ring(c, SUN, p.opts()), 'main');
    p.add(ring(c, SUN - 1.6), 'thin');
    p.rays(c, 12, SUN, (a, long) => Math.min(long ? 80 : 54, reach(c, a, box)), { holes });
    p.fine(c, 12, SUN + 1, Math.min(SUN + 7, h / 2 - b1 - 3), { holes });
    p.luna(lunas[0], 180);
    p.luna(lunas[1], 0);
    for (const s of stars) if (s[0] - 8 > b1 && s[0] + 8 < w - b1) p.star(s, 7.5);
    return;
  }
  p.border(w, h, TALL.band, 1.1);
  const SUN = TALL.seal / 2 + 10;
  const lunas: Pt[] = [
    [c[0], c[1] - 112],
    [c[0], c[1] + 112],
  ];
  const corners = [-45, 45, 135, 225].map((a) => at(c, a, 112));
  const holes: Hole[] = [...lunas.map((l) => ({ c: l, r: 14.4 })), ...corners.map((s) => ({ c: s, r: 10 }))];
  const star = wovenStar(c, 8, 3, 86, 1, 0.9, 0, p.opts({ holes }));
  const under = star.straps.map((s) => ({ ...s, w: s.w + 0.9 }));
  p.add(star.edges, 'thin');
  p.add(ring(c, SUN, p.opts()), 'main');
  p.add(ring(c, SUN - 1.6), 'thin');
  // Long rays out into the star's arms, short ones between, passing under its straps.
  p.rays(c, 16, SUN, (_, long) => (long ? 74 : 62), { holes, under }, 22.5);
  p.fine(c, 16, SUN + 1, SUN + 9, { holes, under });
  p.luna(lunas[0], -90);
  p.luna(lunas[1], 90);
  for (const s of corners) p.star(s, 8);
};

/** The strokes of one side of a card `w` by `h`: worn for the lines, or whole for the glow under them. */
export const engrave = (side: 'face' | 'back', w: number, h: number, worn: boolean) => {
  const p = new Plate(worn ? wearOf(5) : null);
  if (side === 'face') face(w, h, p);
  else back(w, h, p);
  // Merge each class into one path.
  const by = new Map<Cls, string>();
  for (const { d, cls } of p.out) by.set(cls, (by.get(cls) ?? '') + d);
  return [...by].map(([cls, d]) => ({ cls, d }));
};
