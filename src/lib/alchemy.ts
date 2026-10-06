// The alchemist's signs, shared by the circle behind the item art
// (ArcaneCircle), the plate behind the item's name (NamePlate) and the
// achievements' seals (AchievementSeal).

type Pt = [number, number];
const f = (v: number) => v.toFixed(2);
const pt = (p: Pt) => `${f(p[0])} ${f(p[1])}`;
const rad = (a: number) => (a * Math.PI) / 180;
/** The point at `a` degrees clockwise from the top, `r` from the centre. */
const at = (a: number, r: number): Pt => [r * Math.sin(rad(a)), -r * Math.cos(rad(a))];

// Small alchemical marks on a grid of about ±2 (the four elements, salt,
// sulphur and the like), for a script nobody can read.
export const MARKS = [
  'M0 -2L1.7 1.5H-1.7Z', // fire
  'M0 2L1.7 -1.5H-1.7Z', // water
  'M0 -2L1.7 1.5H-1.7ZM-1.4 0.4H1.4', // air
  'M0 2L1.7 -1.5H-1.7ZM-1.4 -0.4H1.4', // earth
  'M0 -1.6A1.6 1.6 0 1 1 0 1.6A1.6 1.6 0 1 1 0 -1.6M-1.6 0H1.6', // salt
  'M0 -2.2L1.2 -0.2H-1.2ZM0 -0.2V2.2M-1 1H1', // sulphur
  'M0 -0.6A1.3 1.3 0 1 1 0 2A1.3 1.3 0 1 1 0 -0.6M0 -0.6V-2.4M-0.9 -1.6H0.9', // antimony
  'M-1.4 -2L0 2L1.4 -2M-0.9 -0.6H0.9', // arsenic
  'M-1.2 -2H1.2L-0.6 0C1.8 0 1.8 2.2 -1.2 2', // dram
  'M-1.5 1C-1.5 -2 1.5 -2 1.5 0S-0.4 2 -0.4 0', // a turn of the pen
  'M0 -2V2M-1.2 -0.8H1.2', // cross
  'M0.6 -2A2 2 0 1 0 0.6 2A1.5 1.5 0 1 1 0.6 -2', // crescent
  'M-1.4 2V-2L1.4 2V-2', // a zigzag
  'M-1.3 -1.6C0 -2.6 1.6 -1 0 0C-1.6 1 0 2.6 1.3 1.6', // an S
];

// The seven planets and their metals, drawn on a small grid (about ±4).
export const PLANETS = [
  'M0 -3.6A3.6 3.6 0 1 1 0 3.6A3.6 3.6 0 1 1 0 -3.6M0 -0.6A0.6 0.6 0 1 1 0 0.6A0.6 0.6 0 1 1 0 -0.6', // Sol • gold
  'M1 -4A4.2 4.2 0 1 0 1 4A3.3 3.3 0 1 1 1 -4Z', // Luna • silver
  'M-2.2 -4.6A2.2 2.2 0 0 0 2.2 -4.6M0 -3.2A1.9 1.9 0 1 1 0 0.6A1.9 1.9 0 1 1 0 -3.2M0 0.6V4.6M-1.6 2.8H1.6', // Mercury • quicksilver
  'M0 -4.4A2.4 2.4 0 1 1 0 0.4A2.4 2.4 0 1 1 0 -4.4M0 0.4V4.6M-1.8 2.6H1.8', // Venus • copper
  'M-1 -1.4A2.6 2.6 0 1 1 -1 3.8A2.6 2.6 0 1 1 -1 -1.4M0.9 -0.5L3.6 -3.2M1.2 -3.4H3.6V-1', // Mars • iron
  'M-3 -2.2C-3 -4.6 0.4 -4.6 0.2 -2.2C0 -0.4 -2 0.8 -3 1.4H3.2M1.6 -3.8V4.4', // Jupiter • tin
  'M-1 -4.4V2M-2.6 -2.8H0.6M-1 -0.4C0.2 -1.8 2.8 -1.6 2.6 0.6C2.4 2.4 0.4 2.6 1.2 4.4', // Saturn • lead
];

// The two great seals, drawn for a ring of radius 13 (about ±10 inside it).
// Sol: a disc (radius 5) with a point at its heart (1.1) and twelve rays,
// long and short in turn.
export const SOL_RAYS = Array.from({ length: 12 }, (_, k) => `M${pt(at(k * 30, 6.6))}L${pt(at(k * 30, k % 2 ? 8.4 : 10))}`).join('');
// Luna: a crescent shaded in hatching, its horns to the right.
export const LUNA = 'M4.67 -7.11A8.5 8.5 0 1 0 4.67 7.11A7.2 7.2 0 1 1 4.67 -7.11Z';
export const LUNA_HATCH = Array.from({ length: 13 }, (_, i) => {
  const y = -6 + i;
  const x0 = -Math.sqrt(8.5 ** 2 - y * y) + 0.7;
  const x1 = 3.5 - Math.sqrt(7.2 ** 2 - y * y) - 0.7;
  return x1 - x0 > 0.3 ? `M${f(x0)} ${y}H${f(x1)}` : '';
}).join('');

// ---- signs for the achievements' seals ----------------------------------------
// Classic alchemical signs beyond the planets and the marks, drawn on the
// planets' grid (about ±4) from exact geometry. Where two strokes cross as
// strands (the woven star, the linked rings) the one beneath stops short of
// the one on top, as the engraver draws it.

/** Where two segments cross, if they do: the point, and how far along each it is. */
function crossing(p: Pt, q: Pt, r: Pt, s: Pt): { at: Pt; t: number; u: number } | null {
  const [dx, dy] = [q[0] - p[0], q[1] - p[1]];
  const [ex, ey] = [s[0] - r[0], s[1] - r[1]];
  const den = dx * ey - dy * ex;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((r[0] - p[0]) * ey - (r[1] - p[1]) * ex) / den;
  const u = ((r[0] - p[0]) * dy - (r[1] - p[1]) * dx) / den;
  return t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6 ? { at: [p[0] + dx * t, p[1] + dy * t], t, u } : null;
}

/** The gap a strand leaves where it passes beneath another, either side of the crossing. */
const UNDER = 0.8;

/**
 * Closed polygons woven together: walking the first in order, it goes over
 * and under the others in turn at each crossing. Each side is one stroke
 * broken where it passes beneath.
 */
function woven(polys: Pt[][]): string {
  const sides = polys.flatMap((poly, k) => poly.map((p, i) => ({ k, p, q: poly[(i + 1) % poly.length] })));
  const cuts = new Map<number, [number, number][]>();
  let over = true;
  for (const [i, a] of sides.entries()) {
    if (a.k !== 0) continue;
    const hits = sides
      .map((b, j) => ({ j, b, c: b.k !== 0 ? crossing(a.p, a.q, b.p, b.q) : null }))
      .filter((h) => h.c)
      .sort((x, y) => x.c!.t - y.c!.t);
    for (const { j, b, c } of hits) {
      // Over: the other strand breaks; under: this one does.
      const [side, t, len] = over ? [j, c!.u, Math.hypot(b.q[0] - b.p[0], b.q[1] - b.p[1])] : [i, c!.t, Math.hypot(a.q[0] - a.p[0], a.q[1] - a.p[1])];
      const gap = UNDER / len;
      cuts.set(side, [...(cuts.get(side) ?? []), [t - gap, t + gap]]);
      over = !over;
    }
  }
  return sides
    .map(({ p, q }, i) => {
      let from = 0;
      let d = '';
      for (const [t0, t1] of (cuts.get(i) ?? []).sort((x, y) => x[0] - y[0])) {
        d += `M${pt([p[0] + (q[0] - p[0]) * from, p[1] + (q[1] - p[1]) * from])}L${pt([p[0] + (q[0] - p[0]) * t0, p[1] + (q[1] - p[1]) * t0])}`;
        from = t1;
      }
      return d + `M${pt([p[0] + (q[0] - p[0]) * from, p[1] + (q[1] - p[1]) * from])}L${pt(q)}`;
    })
    .join('');
}

const circle = (cx: number, cy: number, r: number) => `M${f(cx)} ${f(cy - r)}A${f(r)} ${f(r)} 0 1 1 ${f(cx)} ${f(cy + r)}A${f(r)} ${f(r)} 0 1 1 ${f(cx)} ${f(cy - r)}Z`;

/** An arc of the circle about (cx, cy) from `a0` to `a1` degrees, clockwise from the top. */
function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const p = at(a0, r);
  const q = at(a1, r);
  return `M${f(cx + p[0])} ${f(cy + p[1])}A${f(r)} ${f(r)} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${f(cx + q[0])} ${f(cy + q[1])}`;
}

const triangle = (r: number, up: boolean): Pt[] => [0, 120, 240].map((a) => at(up ? a : a + 180, r));

/** The Seal of Solomon: the triangles of fire and water, woven over and under at their six crossings. */
export const HEXAGRAM = woven([triangle(4.2, true), triangle(4.2, false)]);

/** The {7/2} star of the seven planets, one unbroken stroke, as the rune circle's. */
export const HEPTAGRAM = `M${[0, 2, 4, 6, 1, 3, 5].map((k) => pt(at((k * 360) / 7, 4.2))).join('L')}Z`;

/**
 * The philosopher's stone, the squared circle: a circle holding a triangle,
 * the triangle a square standing on its base, the square a circle, each
 * touching the next.
 */
export const STONE = (() => {
  const R = 4.2;
  const tri = triangle(R, true);
  const base = tri[1][1];
  // The square's top corners lie on the triangle's sides: half its side is x = (y + R) tan 30°.
  const side = (2 * (base + R) * Math.tan(rad(30))) / (1 + 2 * Math.tan(rad(30)));
  const h = side / 2;
  return [
    circle(0, 0, R),
    `M${tri.map(pt).join('L')}Z`,
    `M${f(-h)} ${f(base)}V${f(base - side)}H${f(h)}V${f(base)}Z`,
    circle(0, base - h, h),
  ].join('');
})();

/** The engraved eye: an almond of two arcs, the iris and a ring for the pupil (no lashes, no solid pupil). */
export const EYE = 'M-4.2 0A4.95 4.95 0 0 1 4.2 0A5.6 5.6 0 0 1 -4.2 0Z' + circle(0, -0.2, 1.95) + circle(0, -0.2, 0.62);

/** The hour: an hourglass, two triangles point to point, closed at top and bottom. */
export const HOUR = 'M-2.9 -4H2.9L-2.9 4H2.9Z';

/** Sublimation: the pure part rises clear in an arc, the dross stays below. */
export const SUBLIMATION = 'M-4.2 0.6H-2.5A2.5 2.5 0 0 1 2.5 0.6H4.2M-4.2 2.7H4.2';

/**
 * The pelican: the vessel whose two arms bend back from the head of its neck
 * into the foot of its belly, as the bird feeds its young: a round with a
 * neck, held between two wide handles.
 */
export const PELICAN = (() => {
  const [cy, r, top] = [1.6, 2.2, -3.4];
  const arm = (s: 1 | -1) => {
    const [x, y] = at(s * 115, r);
    return `M0 ${f(top)}A3.53 3.53 0 0 ${s > 0 ? 1 : 0} ${f(x)} ${f(cy + y)}`;
  };
  return circle(0, cy, r) + `M0 ${f(cy - r)}V-4.2` + arm(1) + arm(-1);
})();

/** Aquarius, the sign of multiplication: two waves, one over the other, as a tide that turns. */
export const WAVES = [-1.15, 1.15]
  .map((y) => `M${[-4.2, -2.1, 0, 2.1, 4.2].map((x, i) => `${f(x)} ${f(y + (i % 2 ? -0.95 : 0.95))}`).join('L')}`)
  .join('');

/**
 * Pisces, the sign of projection, the last work, where the stone is cast and
 * all is changed at once: two arcs back to back, bound by a bar.
 */
export const PROJECTION = 'M-3.6 -3.8A5.31 5.31 0 0 1 -3.6 3.8M3.6 -3.8A5.31 5.31 0 0 0 3.6 3.8M-2 0H2';

/**
 * Two rings linked, the coniunctio: neither can fall away. Each passes over
 * the other once, so the left ring stops short at the foot and the right one
 * at the head.
 */
export const RINGS = (() => {
  const [r, off] = [2.75, 1.45];
  const y = Math.sqrt(r * r - off * off);
  // Where each ring meets the other, in degrees clockwise from the top, about its own centre.
  const meet = (Math.atan2(off, y) * 180) / Math.PI;
  const gap = (UNDER / r) * (180 / Math.PI);
  // Left ring (centre -off): crosses at the head (meet) and the foot (180 - meet); it breaks at the foot.
  const foot = 180 - meet;
  // Right ring (centre +off): crosses at the head (360 - meet) and the foot (180 + meet); it breaks at the head.
  const head = 360 - meet;
  return arcPath(-off, 0, r, foot + gap, foot - gap + 360) + arcPath(off, 0, r, head + gap - 360, head - gap);
})();
