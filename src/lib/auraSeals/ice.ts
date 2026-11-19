// The Herald of Ice aura's seal and sign (lib/auraEngraving: the seal in Sol's
// place on the face and at the back's heart, the sign in Luna's place).

import { at, lerp, line, ring, type Pt } from '../arcane.ts';
import { disc, dist, inPoly, LIGHT, poly, ringCuts, type AuraSeal, type Clear, type Seal, type Sign } from './kit.ts';

/** The parts of the line from `p` to `q` where `keep` holds, found by walking it in small steps. */
function keepAlong(p: Pt, q: Pt, keep: (x: Pt) => boolean) {
  const n = Math.max(2, Math.ceil(dist(p, q) / 0.2));
  let d = '';
  let from: number | null = null;
  for (let i = 0; i <= n; i++) {
    const open = keep(lerp(p, q, i / n));
    if (open && from === null) from = i;
    if ((!open || i === n) && from !== null) {
      const to = open ? i : i - 1;
      if (to - from >= 2) d += line(lerp(p, q, from / n), lerp(p, q, to / n));
      from = null;
    }
  }
  return d;
}

/** The polygon `ps` less what lies past the line through `m` facing `nrm` (Sutherland and Hodgman's clip). */
function clipHalf(ps: Pt[], m: Pt, nrm: Pt): Pt[] {
  const side = (q: Pt) => (q[0] - m[0]) * nrm[0] + (q[1] - m[1]) * nrm[1];
  const out: Pt[] = [];
  ps.forEach((q, i) => {
    const r = ps[(i + 1) % ps.length];
    const [a, b] = [side(q), side(r)];
    if (a <= 0) out.push(q);
    if (a <= 0 !== b <= 0) out.push(lerp(q, r, a / (a - b)));
  });
  return out;
}
const centroid = (ps: Pt[]): Pt => [ps.reduce((t, q) => t + q[0], 0) / ps.length, ps.reduce((t, q) => t + q[1], 0) / ps.length];

/**
 * A facet engraved as cut ice is: its edges; a ridge from the corner nearest
 * `from` to the corner farthest, splitting it in two; and the half turned
 * from the light hatched along the ridge, `gap` apart.
 */
function facet(ps: Pt[], from: Pt, gap: number) {
  let [near, far] = [0, 0];
  ps.forEach((q, i) => {
    if (dist(q, from) < dist(ps[near], from)) near = i;
    if (dist(q, from) > dist(ps[far], from)) far = i;
  });
  const [a, b] = [ps[near], ps[far]];
  const L = dist(a, b) || 1;
  const u: Pt = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  let nrm: Pt = [-u[1], u[0]];
  if (nrm[0] * LIGHT[0] + nrm[1] * LIGHT[1] > 0) nrm = [-nrm[0], -nrm[1]];
  // The dark half: the side `nrm` points to (away from the light).
  const dark = clipHalf(ps, a, [-nrm[0], -nrm[1]]);
  let hatch = '';
  if (dark.length > 2) {
    const m = centroid(dark);
    const inner = dark.map((q) => lerp(m, q, 0.86));
    for (let s = gap * 0.7; s < L; s += gap) {
      const o: Pt = [a[0] + nrm[0] * s, a[1] + nrm[1] * s];
      hatch += keepAlong([o[0] - u[0] * L, o[1] - u[1] * L], [o[0] + u[0] * L * 2, o[1] + u[1] * L * 2], (q) => inPoly(q, inner));
    }
  }
  return { edges: poly(ps), ridge: line(lerp(a, b, 0.06), lerp(a, b, 0.94)), hatch };
}

/**
 * The Herald of Ice's seal: the herald's shatter. The token's face frozen
 * through has burst, as the herald's frozen foes do: it breaks along the
 * cracks of its ice into faceted pieces, each cut as ice is (a ridge, its
 * side from the light shaded), flying apart from the heart of the burst;
 * those at the sides, where the nova rolls out, fly furthest, out over the
 * ring, which they break.
 */
const ice: Seal = (p, c, R, room) => {
  const Ri = R - 1.9;
  // Where it bursts from, a little off the middle, and the seeds of its cracked ice: one at the burst, one beside it, the rest round them, uneven.
  const burst: Pt = [c[0] - R * 0.06, c[1] + R * 0.04];
  const seeds: Pt[] = [
    burst,
    ...[
      [128, 0.36],
      [8, 0.66],
      [58, 0.72],
      [100, 0.7],
      [160, 0.74],
      [206, 0.6],
      [252, 0.72],
      [300, 0.62],
      [336, 0.76],
    ].map(([a, r]) => at(c, a, Ri * r)),
  ];
  const face: Pt[] = Array.from({ length: 64 }, (_, i) => at(c, (i / 64) * 360, Ri));
  // Each piece: the face less every half-plane nearer another seed.
  const pieces = seeds.map((s, i) => {
    let cell = face;
    seeds.forEach((t, j) => {
      if (j !== i) cell = clipHalf(cell, lerp(s, t, 0.5), [t[0] - s[0], t[1] - s[1]]);
    });
    return cell;
  });
  // Flying apart: each pushed out from the burst, further the more it lies to the sides, and turned a little as it tumbles; a hair of crack left between.
  const flown = pieces.map((cell, i) => {
    const m = centroid(cell);
    const d = dist(burst, m) || 1;
    const u: Pt = [(m[0] - burst[0]) / d, (m[1] - burst[1]) / d];
    // Only the pieces right at the sides fly; the rest have just begun to part.
    const sideways = Math.max(0, (Math.abs(u[0]) - 0.8) / 0.2);
    let push = i === 0 ? 0 : 0.25 + sideways * R * 0.5;
    // Never past the room there is.
    const reach = Math.max(...cell.map((q) => dist(c, q)));
    const a = (Math.atan2(u[0], -u[1]) * 180) / Math.PI;
    push = Math.min(push, Math.max(0, room(a) - reach - 1.6));
    const turn = (i % 2 ? 1 : -1) * (1 + sideways * 12) * (Math.PI / 180);
    return cell.map((q): Pt => {
      const k = lerp(m, q, 1 - 0.3 / Math.max(1.5, dist(m, q)));
      const [x, y] = [k[0] - m[0], k[1] - m[1]];
      return [m[0] + x * Math.cos(turn) - y * Math.sin(turn) + u[0] * push, m[1] + x * Math.sin(turn) + y * Math.cos(turn) + u[1] * push];
    });
  });
  // The ring, broken where the pieces fly over it.
  const over: Clear = { polys: flown, holes: [], pad: 0.7 };
  p.add(ring(c, R, { cuts: ringCuts(c, R, over) }), 'thin');
  p.add(ring(c, R - 1.3, { cuts: ringCuts(c, R - 1.3, over) }), 'hair');
  let [edges, ridges, hatch] = ['', '', ''];
  // Only the pieces flying off are shaded, so they stand out from the cracked face they leave.
  flown.forEach((cell, i) => {
    const f = facet(cell, burst, 0.7);
    edges += f.edges;
    ridges += f.ridge;
    if (dist(centroid(cell), centroid(pieces[i])) > R * 0.15) hatch += f.hatch;
  });
  p.add(edges, 'thin');
  p.add(ridges, 'hair');
  p.add(hatch, 'hatch');
  p.knockout += disc(c, R + 1.4) + flown.map((cell) => poly(cell.map((q) => lerp(centroid(cell), q, 1 + 1.4 / Math.max(2, dist(centroid(cell), q)))))).join('');
};

/**
 * A star of frost, the frost that grows over the wearer's face before the
 * herald breaks it: six arms, each a long facet cut as ice is, with a pair
 * of barbs, round a hexagon.
 */
const frostSign: Sign = (p, c, r) => {
  let [edges, ridges, hatch] = ['', '', ''];
  const hex = r * 0.2;
  edges += poly([0, 60, 120, 180, 240, 300].map((a) => at(c, a + 30, hex)));
  const add = (ps: Pt[], from: Pt) => {
    const f = facet(ps, from, 0.55);
    edges += f.edges;
    ridges += f.ridge;
    hatch += f.hatch;
  };
  for (let k = 0; k < 6; k++) {
    const a = k * 60;
    const base = at(c, a, hex);
    const sh = at(c, a, r * 0.42);
    add([at(base, a - 90, r * 0.07), at(sh, a - 90, r * 0.14), at(c, a, r), at(sh, a + 90, r * 0.14), at(base, a + 90, r * 0.07)], c);
    // The barbs, leaning out, each a small facet off the arm's shoulder.
    for (const s of [-1, 1]) {
      const root = at(c, a, r * 0.5);
      const tip = at(root, a + s * 52, r * 0.38);
      const side = at(root, a, r * 0.12);
      add([at(root, a + s * 90, r * 0.12), tip, side], root);
    }
  }
  p.add(edges, 'sign');
  p.add(ridges, 'hatch');
  p.add(hatch, 'hatch');
};

export const seals: AuraSeal = { seal: ice, sign: frostSign };
