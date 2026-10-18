// The plate of the rune circle (the eye) (src/components/ArcaneCircle.svelte; see
// docs/arcane-style.md): its geometry, built away from the page, in a
// worker, and kept (lib/plateStore.svelte.ts).
import { at as atAbout, f, hatch, joined, lineParts, pt, rad, ringParts, seeded, wear, type Hole, type LineOpts, type Pt, type Strap, type Wear } from '../arcane.ts';
import { PLANET_SIGNS } from '../alchemy.ts';
import { circlePath, engrave, engraveFrame, FRAME_SPIN, HOLLOW_RING, hollowFrame, mapPath, staged, stroke, turned, type Plate, type StageLayer } from '../engraver.ts';
import { inscribe } from '../tongue.ts';

// An alchemist's circle, engraved, that draws itself behind the item art
// and turns slowly, in layers:
// • the band: the seven planets of the old metals in seals, with lines
//   of an unreadable alchemical script between them;
// • a heptagram of double straps woven over and under, one point per
//   planet, with Sol and Luna sealed between its arms, and a sun whose
//   long rays run out under the straps into the arms;
// • at the heart, within the sun, an eye that stays upright and now and
//   then looks aside, in a glory of its own.
// Lines stop short of every seal they meet, as if drawn around it, and
// carry the odd nick, like a worn plate.
// `state` colours it at the reveal. It is set on the ArcaneStage, which
// turns, lights and colours it, as is its sibling the MonadCircle: the
// same craft in another plate, so the two can take turns.
const O: Pt = [0, 0];
/** The point at `a` degrees clockwise from the top, `r` from the centre. */
const at = (a: number, r: number) => atAbout(O, a, r);

// The band: seals on the planets' circle, the script between each pair.
const BAND_IN = 81;
const BAND_OUT = 94;
const BAND = (BAND_IN + BAND_OUT) / 2;
const SEAL = 7.2;
const seals = PLANET_SIGNS.map((d, k) => {
  const a = (k / 7) * 360;
  const [x, y] = at(a, BAND);
  return { a, x, y, d };
});
/** The band's seal holding Luna. */
const LUNA_SEAL = 1;
const bandHoles: Hole[] = seals.map(({ x, y }) => ({ c: [x, y], r: SEAL + 1.2 }));


// Between the seals, a script nobody can read (lib/tongue).
const rnd = seeded(11);
const SCRIPT = Array.from({ length: 7 }, (_, k) => inscribe((k / 7) * 360 + 7.5, ((k + 1) / 7) * 360 - 7.5, BAND, rnd, 1.2)).flat();

// The heptagram {7/2}: seven straps, each a pair of lines, their points
// just inside the band, half a step round from the planets. Walking the
// star in one go, the straps go over and under in turn at every crossing.
const W = 0.8;
const GAP = 0.7;
const R = BAND_IN - 1.8;
const INNER = R * Math.cos((2 * Math.PI) / 7);
const BIG = 13;
/** Sol's seal is the larger of the two. */
const SOL_BIG = 15.5;
const sol = at(0, 64.5);
// Luna stands off the axis Sol stands on, in the space between two points
// lower left: the one thing in the plate that isn't even.
const LUNA_AT = (4 / 7) * 360;
const luna = at(LUNA_AT, 65.5);
const starHoles: Hole[] = [
  { c: sol, r: SOL_BIG + 1.4 },
  { c: luna, r: BIG + 1.4 },
];
const tips = Array.from({ length: 7 }, (_, k) => at(((k + 0.5) / 7) * 360, R));
const straps: Strap[] = Array.from({ length: 7 }, (_, i) => ({ p: tips[(i * 2) % 7], q: tips[(i * 2 + 2) % 7], w: W }));
const cross = (a: Strap, b: Strap) => {
  const [r, s] = [
    [a.q[0] - a.p[0], a.q[1] - a.p[1]],
    [b.q[0] - b.p[0], b.q[1] - b.p[1]],
  ];
  const den = r[0] * s[1] - r[1] * s[0];
  const [ex, ey] = [b.p[0] - a.p[0], b.p[1] - a.p[1]];
  const t = (ex * s[1] - ey * s[0]) / den;
  const u = (ex * r[1] - ey * r[0]) / den;
  return t > 0.01 && t < 0.99 && u > 0.01 && u < 0.99 ? t : null;
};
// Each strap's crossings in order along it; every second one goes under.
let turn = 0;
const unders = straps.map((a, i) =>
  straps
    .map((b, j) => ({ j, t: i === j ? null : cross(a, b) }))
    .filter((c): c is { j: number; t: number } => c.t !== null)
    .sort((x, y) => x.t - y.t)
    .filter(() => turn++ % 2 === 1)
    .map(({ j }) => ({ ...straps[j], w: W + GAP })),
);
/** One edge of strap `i`, `side` (±1) of its centre line, mitred to its neighbours at both tips. */
const edgeOf = (i: number, side: number): [Pt, Pt] => {
  const { p, q } = straps[i];
  const n = (s: Strap): Pt => {
    const len = Math.hypot(s.q[0] - s.p[0], s.q[1] - s.p[1]);
    return [-(s.q[1] - s.p[1]) / len, (s.q[0] - s.p[0]) / len];
  };
  // At a tip both straps' outer edges meet beyond it, their inner edges
  // short of it; each tip turns the star the same way, so the same side
  // of each strap faces out.
  const [nx, ny] = n(straps[i]);
  const miter = (tip: Pt, other: Strap): Pt => {
    const [ox, oy] = n(other);
    const [bx, by] = [nx + ox, ny + oy];
    const k = (side * W) / (nx * bx + ny * by);
    return [tip[0] + bx * k, tip[1] + by * k];
  };
  return [miter(p, straps[(i + 6) % 7]), miter(q, straps[(i + 1) % 7])];
};
const STAR_RING = INNER - W - GAP;

// The star's points, each its tip and the two corners where its sides
// cross the strap across its foot; and the star's middle, the heptagon
// of those corners.
const meet = (a: Strap, b: Strap): Pt => {
  const t = cross(a, b) ?? 0;
  return [a.p[0] + (a.q[0] - a.p[0]) * t, a.p[1] + (a.q[1] - a.p[1]) * t];
};
const same = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6;
const POINTS = tips.map((tip, k) => {
  const foot = straps.find((s) => (same(s.p, tips[(k + 6) % 7]) && same(s.q, tips[(k + 1) % 7])) || (same(s.q, tips[(k + 6) % 7]) && same(s.p, tips[(k + 1) % 7])))!;
  const sides = straps.filter((s) => same(s.p, tip) || same(s.q, tip));
  const corners = sides.map((s) => meet(s, foot));
  // Clockwise first.
  const ang = (q: Pt) => (((Math.atan2(q[0], -q[1]) * 180) / Math.PI + 360) % 360);
  const a = ((k + 0.5) / 7) * 360;
  corners.sort((x, y) => (((ang(x) - a + 540) % 360) - 180) - (((ang(y) - a + 540) % 360) - 180));
  return { a, tip, cw: corners[1], ccw: corners[0] };
});
const MIDDLE = POINTS.map(({ cw }) => cw);
/** Whether `q` lies inside polygon `ps`. */
const inPoly = (q: Pt, ps: Pt[]) => {
  let inside = false;
  for (let i = 0, j = ps.length - 1; i < ps.length; j = i++) {
    const [a, b] = [ps[i], ps[j]];
    if (a[1] > q[1] !== b[1] > q[1] && q[0] < ((b[0] - a[0]) * (q[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
};
/** How far `q` lies from the segment `a` to `b`. */
const toSeg = (q: Pt, a: Pt, b: Pt) => {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(q[0] - a[0] - dx * t, q[1] - a[1] - dy * t);
};
/** Whether `q` lies within the star or `m` of its outline. */
const inStar = (q: Pt, m: number) =>
  inPoly(q, MIDDLE) || POINTS.some(({ tip, cw, ccw }) => inPoly(q, [tip, cw, ccw])) || straps.some((s) => toSeg(q, s.p, s.q) < m);
/** The straight runs along `p` to `q` whose points satisfy `ok`. */
const runs = (p: Pt, q: Pt, ok: (q: Pt) => boolean, step = 0.25) => {
  const n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / step));
  let d = '';
  let from: Pt | null = null;
  let last: Pt | null = null;
  for (let i = 0; i <= n; i++) {
    const x: Pt = [p[0] + ((q[0] - p[0]) * i) / n, p[1] + ((q[1] - p[1]) * i) / n];
    if (ok(x)) {
      from ??= x;
      last = x;
    } else if (from && last) {
      if (Math.hypot(last[0] - from[0], last[1] - from[1]) > 0.6) d += `M${pt(from)}L${pt(last)}`;
      from = last = null;
    }
  }
  if (from && last && Math.hypot(last[0] - from[0], last[1] - from[1]) > 0.6) d += `M${pt(from)}L${pt(last)}`;
  return d;
};

// Sol and Luna, the two great seals, kept upright as the star turns (see
// the layers), drawn for a ring of radius 13 (about ±10 inside it).
// Sol: a disc streaked from its point, ringed twice, and sixteen rays,
// straight and flaming in turn: the straight ones pointed, ridged and
// hatched down one side, the four at the quarters longest; the flames
// curved blades all bending the same way, so the sun seems to turn.
const SOL_FACE = (() => {
  let lines = circlePath(4.3) + circlePath(3.4) + circlePath(0.85);
  let hatched = '';
  for (let k = 0; k < 28; k++) {
    const a = (k / 28) * 360;
    hatched += `M${pt(at(a, 1.4))}L${pt(at(a, k % 2 ? 2.6 : 3.0))}`;
  }
  for (let k = 0; k < 8; k++) {
    const a = k * 45;
    const [base, l, r, tip] = [at(a, 5), at(a - 8, 5), at(a + 8, 5), at(a, k % 2 ? 8.6 : 10.1)];
    lines += `M${pt(l)}L${pt(tip)}L${pt(r)}M${pt(base)}L${pt(tip)}`;
    hatched += hatch(base, l, tip, 0.42);
    // The flame after it: a blade of two curves from a base on the disc's ring to a tip bent sunwise.
    const b = a + 22.5;
    const [fl, fr, ft] = [at(b - 6, 5), at(b + 6, 5), at(b + 9, 9.1)];
    const [cl, cr] = [at(b + 1, 7.4), at(b + 8, 7)];
    lines += `M${pt(fl)}C${pt(cl)} ${pt(cl)} ${pt(ft)}C${pt(cr)} ${pt(cr)} ${pt(fr)}`;
  }
  return { lines, hatched };
})();
// Luna: the crescent, its horns to the right, shaded in arcs that follow
// its inner curve, and the rest of her round in a hairline, as the old
// moon is seen in the new moon's arms.
const LUNA_FACE = (() => {
  const [R, r, off] = [8.6, 7, 3.6];
  const hx = (R * R - r * r + off * off) / (2 * off);
  const hy = Math.sqrt(R * R - hx * hx);
  const crescent = `M${f(hx)} ${f(-hy)}A${R} ${R} 0 1 0 ${f(hx)} ${f(hy)}A${r} ${r} 0 1 1 ${f(hx)} ${f(-hy)}Z`;
  const ghost = `M${f(hx)} ${f(-hy)}A${R} ${R} 0 0 1 ${f(hx)} ${f(hy)}`;
  let shade = '';
  const edge = R - 0.55;
  for (let rho = r + 0.6; rho < off + edge - 0.6; rho += 0.55) {
    const c = (edge * edge - off * off - rho * rho) / (2 * off * rho);
    if (c > 1 || c < -1) continue;
    const th = Math.acos(c);
    const [x, y] = [off + rho * Math.cos(th), rho * Math.sin(th)];
    shade += `M${f(x)} ${f(-y)}A${f(rho)} ${f(rho)} 0 ${th < Math.PI / 2 ? 1 : 0} 0 ${f(x)} ${f(y)}`;
  }
  return { crescent, ghost, shade };
})();

// The sun: seven long pointed rays out into the star's arms, passing
// under the inner ring and the straps, and seven short ones between,
// each hatched down one side, from its ring (`from`: SUN, or hollow the
// hollow frame's, the rays reaching in to it).
const SUN = 31;
const rayStraps = straps.map((s) => ({ ...s, w: W + GAP }));
const rays = (worn: Wear, from = SUN) =>
  Array.from({ length: 14 }, (_, k) => {
    const a = ((k + 1) / 14) * 360;
    const long = k % 2 === 0;
    const [base, l, r, tip] = [at(a, from), at(a - (long ? 4.5 : 3.6), from), at(a + (long ? 4.5 : 3.6), from), at(a, long ? R - 8 : STAR_RING - 1.4)];
    const opts: LineOpts = { holes: starHoles, under: rayStraps, rings: [{ c: O, r: STAR_RING, w: GAP }] };
    const delay = 0.7 + k * 0.035;
    return {
      lines: [lineParts(l, tip, { ...opts, wear: worn }), lineParts(r, tip, { ...opts, wear: worn }), lineParts(base, tip, opts)].flatMap((parts) =>
        stroke(parts, delay, long ? 0.6 : 0.4),
      ),
      hatch: hatch(base, l, tip, 0.55, opts),
      delay: delay + 0.25,
    };
  });
// Fine rays between, half as long (from the sun's ring, or hollow the hollow frame's).
const fine = (from = SUN) =>
  Array.from({ length: 14 }, (_, k) => {
    const a = ((k + 0.5) / 14) * 360;
    return joined(lineParts(at(a, from + 1), at(a, from + 10)));
  }).join('');

// In the spaces between the points, out to the band: a glory of fine
// rays, long and short in turn, clear of the star, the seals and Luna.
const sealHoles: Hole[] = seals.map(({ x, y }) => ({ c: [x, y], r: SEAL + 1.4 }));
const GAPS_GLORY = Array.from({ length: 7 }, (_, k) => {
  const mid = (k / 7) * 360;
  return Array.from({ length: 11 }, (_, j) => {
    const a = mid + (j - 5) * 4;
    const end = (j + 1) % 2 ? BAND_IN - 6 : BAND_IN - 2;
    const ok = (q: Pt) =>
      !inStar(q, W + GAP + 0.3) &&
      ![...starHoles, ...sealHoles].some(({ c, r }) => Math.hypot(q[0] - c[0], q[1] - c[1]) < r + 0.2);
    return runs(at(a, STAR_RING), at(a, end), ok);
  }).join('');
}).join('');

// The heart: the eye itself, as wide as the sun's inner ring lets it be.
const EYE = SUN - 1.6;

// The eye, after the Eye of Providence: an almond whose upper lid is cut
// twice and shades the eyeball below it in fine arcs; the iris half
// hooded, ringed and streaked, with a catchlight in the pupil; and a glory
// of fine rays about it. Each lid is an arc of a circle through the
// corners (±CORNER, 0) and the given height at the middle.
const CORNER = 22;
const lid = (h: number) => {
  const r = (CORNER * CORNER + h * h) / (2 * Math.abs(h));
  return { r, cy: h + Math.sign(-h) * r };
};
const [UPPER, LOWER, UPPER_RIM, LOWER_RIM] = [lid(-12.1), lid(9.9), lid(-14.1), lid(11.2)];
const C = f(CORNER);
const ALMOND = `M-${C} 0A${f(UPPER.r)} ${f(UPPER.r)} 0 0 1 ${C} 0A${f(LOWER.r)} ${f(LOWER.r)} 0 0 1 -${C} 0Z`;
const RIMS = `M-${C} 0A${f(UPPER_RIM.r)} ${f(UPPER_RIM.r)} 0 0 1 ${C} 0M${C} 0A${f(LOWER_RIM.r)} ${f(LOWER_RIM.r)} 0 0 1 -${C} 0`;
/** How far from `p` along the unit `u` a ray leaves the circle about (0, cy). */
const exit = (p: Pt, u: Pt, { r, cy }: { r: number; cy: number }) => {
  const [fx, fy] = [p[0], p[1] - cy];
  const b = fx * u[0] + fy * u[1];
  return -b + Math.sqrt(b * b - (fx * fx + fy * fy - r * r));
};
// Short strokes across the upper lid, from its edge to its rim.
const LID_HATCH = Array.from({ length: 45 }, (_, k) => {
  const phi = -44 + k * 2;
  const u: Pt = [Math.sin(rad(phi)), -Math.cos(rad(phi))];
  const p: Pt = [UPPER.r * u[0], UPPER.cy + UPPER.r * u[1]];
  const len = exit(p, u, UPPER_RIM);
  return len > 0.25 ? `M${pt(p)}L${pt([p[0] + u[0] * len, p[1] + u[1] * len])}` : '';
}).join('');
// The lid's shadow on the eyeball: arcs under its edge, shorter as they fall.
const SHADOW = [1, 2, 3, 4, 5, 6]
  .map((k) => {
    const r = UPPER.r - k * 0.8;
    const span = 42 - k * 6;
    const p = (phi: number) => pt([r * Math.sin(rad(phi)), UPPER.cy - r * Math.cos(rad(phi))]);
    return `M${p(-span)}A${f(r)} ${f(r)} 0 0 1 ${p(span)}`;
  })
  .join('');
const IRIS_Y = -1.8;
const IRIS_R = 11.4;
const STREAKS = Array.from({ length: 96 }, (_, k) => {
  const a = (k / 96) * 360;
  const [p, q] = [at(a, 4.6), at(a, k % 2 ? 8.4 : IRIS_R - 1.6)];
  return `M${pt(p)}L${pt(q)}`;
}).join('');
const COLLARETTE =
  'M' +
  Array.from({ length: 73 }, (_, k) => {
    const a = (k / 72) * 360;
    return pt(at(a, 6.4 + 0.5 * Math.sin(rad(a * 11))));
  }).join('L');
const PUPIL = 'M0 -3.5A3.5 3.5 0 1 1 0 3.5A3.5 3.5 0 1 1 0 -3.5ZM-1.3 -2.35A0.9 0.9 0 1 0 -1.3 -0.55A0.9 0.9 0 1 0 -1.3 -2.35Z';
// The glory: rays from just off the lids out to the ring, long and short,
// in two sets (the long rays and the short) that swell and shrink out of
// step.
const GLORY = Array.from({ length: 72 }, (_, k) => {
  const a = ((k + 0.5) / 72) * 360;
  const u = at(a, 1);
  const from = exit([0, 0], u, u[1] < 0 ? UPPER_RIM : LOWER_RIM) + 1.4;
  const to = k % 2 ? EYE - 3.4 : EYE - 1.2;
  return to - from > 1 ? `M${pt([u[0] * from, u[1] * from])}L${pt([u[0] * to, u[1] * to])}` : '';
});
const GLORY_SETS = [0, 1].map((n) => GLORY.filter((_, k) => k % 2 === n).join(''));

// Everything that wears, drawn twice: worn for the lines, whole for
// the glow under them. The wear is one seeded run through the lines in
// this order, so every circle is worn alike. Hollow, the sun's rays reach
// in to the hollow frame, drawn last.
const drawing = (worn: boolean, hollow: boolean) => {
  const w = worn ? wear(5) : null;
  return {
    band: [ringParts(O, 97.5, { wear: w }), ringParts(O, BAND_OUT, { holes: bandHoles, wear: w }), ringParts(O, BAND_IN, { holes: bandHoles, wear: w })].map(
      (parts, k) => stroke(parts, 0.55 + k * 0.1, 1.1),
    ),
    straps: straps.flatMap((_, i) =>
      [1, -1].map((side) => stroke(lineParts(...edgeOf(i, side), { holes: starHoles, under: unders[i], wear: w }), 0.4 + i * 0.09, 0.5)),
    ),
    starRing: stroke(ringParts(O, STAR_RING, { holes: starHoles, wear: w }), 0.3, 0.9),
    rays: rays(w, hollow ? HOLLOW_RING : SUN),
    sun: stroke(ringParts(O, SUN, { wear: w }), 0.15, 0.8),
    sunInner: stroke(ringParts(O, EYE, { wear: w }), 0.05, 0.8),
    // Hollow, the hollow frame in the sun's place, hugging the avatar.
    hollowRing: hollow ? hollowFrame(w) : [],
  };
};

// The layers (lib/engraver), each drawn twice: worn for the lines, whole for the glow under them.
const layers = (p: ReturnType<typeof drawing>, hollow: boolean): Record<string, Plate> => ({
  band: engrave((e) => {
    p.band.forEach((list, k) => e.pieces(list, k ? '' : 'thin'));
    seals.forEach((seal, k) => {
      // (Luna rides the band upright, in a layer of her own.)
      if (k === LUNA_SEAL) return;
      const turn = turned(seal.a);
      e.seal(0.95 + k * 0.07, (q) => {
        const [x, y] = turn(q);
        return [seal.x + x, seal.y + y];
      }, `translate(${f(seal.x)} ${f(seal.y)}) rotate(${seal.a})`, seal.a, SEAL, 1.2, 0.5, [[seal.d, 'sign', 1.1]]);
    });
    SCRIPT.forEach((m, k) => {
      const turn = turned(m.a);
      e.mark(m.d, 1.15 + (k / SCRIPT.length) * 0.8, `rotate(${f(m.a)}) translate(0 -${BAND})`, (q) => turn([q[0], q[1] - BAND]), m.a);
    });
  }),
  star: engrave((e) => {
    e.pieces(p.starRing, 'thin');
    for (const edge of p.straps) e.pieces(edge, 'thin');
    for (const ray of p.rays) {
      e.pieces(ray.lines, 'hair');
      e.line(ray.hatch, 'hatch', ray.delay, 0.5);
    }
    e.line(fine(hollow ? HOLLOW_RING : SUN), 'hair', 1, 0.6);
    e.line(GAPS_GLORY, 'hair', 1.2, 0.7);
  }),
  // The band's Luna, upright on the page as the band carries her round.
  bandLuna: engrave((e) => {
    const seal = seals[LUNA_SEAL];
    e.seal(0.95 + LUNA_SEAL * 0.07, (q) => [seal.x + q[0], seal.y + q[1]], `translate(${f(seal.x)} ${f(seal.y)})`, 0, SEAL, 1.2, 0.5, [[seal.d, 'sign', 1.1]]);
  }),
  // Sol's seal, upright as the star carries it round; his face in it
  // turning slowly sunwise.
  sol: engrave((e) => {
    const [sx, sy] = sol;
    e.seal(1, (q) => [sx + q[0], sy + q[1]], `translate(${f(sx)} ${f(sy)})`, 0, SOL_BIG, 1.7, 0.6, []);
  }),
  solFace: engrave((e) => {
    const k = SOL_BIG / BIG;
    const at = (d: string) => mapPath(d, ([x, y]) => [sol[0] + x * k, sol[1] + y * k], 0, k);
    e.line(at(SOL_FACE.lines), 'sign', 1.3, 0.6);
    e.line(at(SOL_FACE.hatched), 'hatch', 1.6, 0.5);
  }),
  luna: engrave((e) => {
    const [lx, ly] = luna;
    e.seal(1.12, (q) => [lx + q[0], ly + q[1]], `translate(${f(lx)} ${f(ly)})`, 0, BIG, 1.6, 0.6, [
      [LUNA_FACE.crescent, 'sign', 1],
      [LUNA_FACE.shade, 'hatch', 1],
      [LUNA_FACE.ghost, 'hair', 1],
    ]);
  }),
  heart: engrave((e) => {
    e.pieces(p.sun, 'thin');
    e.pieces(p.sunInner, 'hair');
  }),
  ...(hollow ? { hollowRing: engraveFrame(p.hollowRing) } : {}),
  glory0: engrave((e) => e.line(GLORY_SETS[0], 'hair', 1.35, 0.7)),
  glory1: engrave((e) => e.line(GLORY_SETS[1], 'hair', 1.4, 0.7)),
});
/** The layers, whole or hollow (lib/engraver's `staged`). */
const stage = (hollow: boolean) => {
  const GLOW = layers(drawing(false, hollow), hollow);
  const LINES = layers(drawing(true, hollow), hollow);
  const layer = (name: string, spin?: StageLayer['spin'], more: Partial<StageLayer> = {}): StageLayer => ({ name, lines: LINES[name], glow: GLOW[name], spin, ...more });
  // Each ring turns its own way and speed, and first winds into place; the
  // glory swells and shrinks, its long rays and its short out of step, and
  // Sol and Luna ride the star upright.
  return staged(
    [
      layer('band', { turn: 240, from: -24 }),
      layer('star', { turn: 160, from: 40, reverse: true }),
      layer('bandLuna', undefined, { within: 'band', pivot: [seals[LUNA_SEAL].x, seals[LUNA_SEAL].y], upright: true }),
      layer('sol', undefined, { within: 'star', pivot: sol, upright: true }),
      layer('solFace', { turn: 180, from: 0 }, { within: 'sol', pivot: sol }),
      layer('luna', undefined, { within: 'star', pivot: luna, upright: true }),
      layer('heart', { turn: 100, from: -70 }, { inner: true }),
      ...(hollow ? [layer('hollowRing', FRAME_SPIN)] : []),
      layer('glory0', undefined, { breathe: { low: 0.96, period: 4.4 }, inner: true }),
      layer('glory1', undefined, { breathe: { low: 0.93, period: 3.6, delay: -1.8 }, inner: true }),
    ],
    hollow,
  );
};

// The eye, the same while drawn and after (it opens as a whole); `@id@`
// stands for the circle's own id, which names its clip.
const eye = (key: string) =>
  `<defs><clipPath id="@id@-${key}"><path d="${ALMOND}"/></clipPath></defs>` +
  `<g clip-path="url(#@id@-${key})"><g class="gaze"><g transform="translate(0 ${IRIS_Y})">` +
  `<circle r="${IRIS_R}" class="iris"/><circle r="${f(IRIS_R - 1)}" class="hatch"/>` +
  `<path d="${STREAKS}" class="hatch"/><path d="${COLLARETTE}" class="hatch"/><path d="${PUPIL}" class="pupil"/>` +
  `</g></g><path d="${SHADOW}" class="hatch"/></g>` +
  `<path d="${ALMOND}" class="lid"/><path d="${RIMS}" class="hatch"/><path d="${LID_HATCH}" class="hatch"/>`;
const EYE_GLOW = eye('c');
const EYE_LINES = eye('w');

/** The plate, whole or `hollow`: its layers, and (whole) the eye drawn for the glow and for the lines (`@id@` standing for the circle's id). */
export const build = (hollow = false) => ({ layers: stage(hollow), eye: (hollow ? ['', ''] : [EYE_GLOW, EYE_LINES]) as [string, string] });
