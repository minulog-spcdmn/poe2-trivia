// The Precursor Engine aura's seal and sign (lib/auraEngraving: the seal in
// Sol's place on the face and at the back's heart, the sign in Luna's place).
//
// The seal is the tower the engine crowns (fx/auras/tower.ts): its shaft
// rising in the ring and narrowing; about its head the engine, three tiers
// of bronze one over another, the core's light pouring through the gaps
// between their segments; over them the beacon, lit as a streak charges it,
// its light fanning up out of the ring and over the arch. The sign is a
// Precursor relic whose use no one knows: the bronze dodecahedron, a round
// hole through each of its twelve faces and a knob on every corner.

import { angleOf, at, lerp, line, type Pt } from '../arcane.ts';
import { poly, disc, dist, inPoly, fromOutline, cutLine, ringCuts, sealRing, type Clear, type Seal, type Sign, type AuraSeal } from './kit.ts';

/** Points along a band's edge: the band `w` either side of `x0`, its edge at `y` bowed down by `sag` in the middle (seen a little from above). */
const N = 16;
function edge(x0: number, y: number, w: number, sag: number) {
  return Array.from({ length: N + 1 }, (_, i) => {
    const u = -1 + (2 * i) / N;
    return [x0 + u * w, y + sag * (1 - u * u)] as Pt;
  });
}
/** The point `u` of the way (0 to N) along an edge. */
const along = (e: Pt[], u: number) => lerp(e[Math.floor(u)], e[Math.min(N, Math.floor(u) + 1)], u % 1);

/**
 * Precursor's seal: the tower in its ring, the beacon's light breaking out
 * over the top. The ring stops short of the beacon and its light; the
 * shaft stops short of the crown, and each tier of the crown stops short
 * of the one over it.
 */
const tower: Seal = (p, c, R, room) => {
  const X = (x: number, y: number): Pt => [c[0] + x * R, c[1] + y * R];
  // The shaft, from the ring's foot up to the crown, narrowing.
  // Its foot stands on the inner ring, its corners short of it.
  const [neckY, wf, wn] = [-0.12, 0.32, 0.17];
  const footY = Math.sqrt(Math.max(0, (R - 2.1) ** 2 - (wf * R) ** 2)) / R;
  const shaft = [X(-wf, footY), X(wf, footY), X(wn, neckY), X(-wn, neckY)];
  // The crown: three tiers, the gaps between their segments lit (where they face us).
  const tiers = [
    { y: -0.2, w: 0.5, gaps: [-0.42, 0.18, 0.66] },
    { y: -0.43, w: 0.44, gaps: [-0.1, 0.52] },
    { y: -0.64, w: 0.38, gaps: [-0.55, 0.3] },
  ].map((t) => {
    const [top, foot] = [edge(c[0], c[1] + t.y * R, t.w * R, R * 0.055), edge(c[0], c[1] + (t.y + 0.15) * R, t.w * R, R * 0.055)];
    return { ...t, top, foot, outline: [...top, ...foot.slice().reverse()] };
  });
  // The beacon: a lozenge of light over the crown, its light fanning up out of the ring.
  const lamp = X(0, -0.86);
  const lampPts = [at(lamp, 0, R * 0.2), at(lamp, 90, R * 0.1), at(lamp, 180, R * 0.13), at(lamp, 270, R * 0.1)];
  // The fan as long as it may be, all its rays shortened together, so it stays a fan:
  // each ray's end short of where the room at its heading runs out.
  const fan = (k: number) => [-34, -17, 0, 17, 34].map((a) => [at(lamp, a, R * 0.3), at(lamp, a, R * 0.3 + k * R * (a ? 0.6 : 0.75))] as [Pt, Pt]);
  let k = 1;
  while (k > 0.1 && fan(k).some(([, b]) => dist(c, b) > room(angleOf(c, b)) - 1.5)) k -= 0.02;
  const rays = fan(k);
  const light: Clear = { polys: [lampPts.map((q) => lerp(lamp, q, 1.3)), ...rays.map(([a, b]) => [a, b, b, a] as Pt[])], holes: [], pad: 0.9 };
  sealRing(p, c, R, ringCuts(c, R, light));
  // The shaft: its edges up to the crown; its right side, turned from the light, hatched upright.
  const crown: Clear = { polys: tiers.map((t) => t.outline), holes: [], pad: 0.6 };
  p.add(cutLine(shaft[0], shaft[3], crown) + cutLine(shaft[1], shaft[2], crown) + line(shaft[0], shaft[1]), 'thin');
  let h = '';
  for (let x = 0.03; x < wf - 0.04; x += 0.95 / R) {
    const yEdge = x > wn ? neckY + ((footY - neckY) * (x - wn)) / (wf - wn) : neckY;
    h += cutLine(X(x, yEdge + 0.06), X(x, footY - 0.05), crown);
  }
  p.add(h, 'hatch');
  // The tiers, each in front of the shaft and behind the one over it.
  let bands = '';
  let walls = '';
  let lit = '';
  tiers.forEach((t, i) => {
    const over: Clear = { polys: tiers.slice(i + 1).map((u) => u.outline), holes: [], pad: 0.55 };
    const run = (ps: Pt[]) => ps.slice(1).map((q, k) => cutLine(ps[k], q, over)).join('');
    bands += run(t.top) + run(t.foot) + cutLine(t.top[0], t.foot[0], over) + cutLine(t.top[N], t.foot[N], over);
    const gapAt = t.gaps.map((g) => ((g + 1) / 2) * N);
    for (const k of gapAt) lit += poly([along(t.top, k - 0.6), along(t.top, k + 0.6), along(t.foot, k + 0.6), along(t.foot, k - 0.6)]);
    // The right of each band, turned from the light, hatched upright, but not across a gap.
    for (let j = N / 2 + 1; j < N; j++) {
      if (gapAt.some((k) => Math.abs(k - j) < 1.1)) continue;
      walls += cutLine(lerp(t.top[j], t.foot[j], 0.22), lerp(t.top[j], t.foot[j], 0.8), over);
    }
  });
  p.add(bands, 'thin');
  p.add(walls, 'hatch');
  p.add(lit, 'fill');
  // The beacon and its light.
  p.add(poly(lampPts), 'thin');
  p.add(poly(lampPts.map((q) => lerp(lamp, q, 0.45))), 'fill');
  p.add(rays.map(([a, b]) => line(a, b)).join(''), 'hair');
  p.knockout += disc(c, R + 1.4) + disc(lamp, R * 0.3) + rays.map(([a, b]) => poly([at(a, 270, 1.3), at(b, 270, 1.3), at(b, 90, 1.3), at(a, 90, 1.3)])).join('');
};

type V3 = [number, number, number];
const PHI = (1 + Math.sqrt(5)) / 2;
const dot3 = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const unit3 = (a: V3): V3 => {
  const l = Math.hypot(...a);
  return [a[0] / l, a[1] / l, a[2] / l];
};
const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** `q` turned about the x axis by `ax`, then about y by `ay`, then about z by `az` (degrees). */
function spin(q: V3, ax: number, ay: number, az: number): V3 {
  const [x0, y0, z0] = q;
  const [a, b, g] = [ax, ay, az].map((d) => (d * Math.PI) / 180);
  const [y1, z1] = [y0 * Math.cos(a) - z0 * Math.sin(a), y0 * Math.sin(a) + z0 * Math.cos(a)];
  const [x2, z2] = [x0 * Math.cos(b) + z1 * Math.sin(b), -x0 * Math.sin(b) + z1 * Math.cos(b)];
  return [x2 * Math.cos(g) - y1 * Math.sin(g), x2 * Math.sin(g) + y1 * Math.cos(g), z2];
}
/** The dodecahedron's twenty corners and twelve faces (each five corners, in order round it), turned as the sign shows it. */
const DODECA = (() => {
  const corners: V3[] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) corners.push([x, y, z]);
  for (const a of [-1, 1]) for (const b of [-1, 1]) corners.push([0, a / PHI, b * PHI], [a / PHI, b * PHI, 0], [a * PHI, 0, b / PHI]);
  const normals: V3[] = [];
  for (const a of [-1, 1]) for (const b of [-1, 1]) normals.push([a, 0, b * PHI], [0, a * PHI, b], [a * PHI, b, 0]);
  // One face turned nearly to us, then tipped a little down and to the side, so it stands as an object, not a diagram.
  const lean = (q: V3) => spin(spin(q, 0, (-Math.atan2(1, PHI) * 180) / Math.PI, 0), -20, 16, 8);
  const turned = corners.map(lean);
  const faces = normals.map((n) => {
    const top = Math.max(...corners.map((q) => dot3(q, n)));
    const ids = corners.map((q, i) => [dot3(q, n), i] as const).filter(([d]) => d > top - 1e-6).map(([, i]) => i);
    const nn = unit3(lean(n));
    const cen = ids.reduce<V3>((m, i) => [m[0] + turned[i][0] / 5, m[1] + turned[i][1] / 5, m[2] + turned[i][2] / 5], [0, 0, 0]);
    const u = unit3(sub3(turned[ids[0]], cen));
    const v = cross3(nn, u);
    ids.sort((i, j) => Math.atan2(dot3(sub3(turned[i], cen), v), dot3(sub3(turned[i], cen), u)) - Math.atan2(dot3(sub3(turned[j], cen), v), dot3(sub3(turned[j], cen), u)));
    return { ids, n: nn, cen, u, v };
  });
  return { corners: turned, faces };
})();

/**
 * The Precursors' dodecahedron: a hollow bronze body of twelve faces, a round
 * hole of its own size through each, a knob on every corner (the Roman
 * dodecahedron, whose use no one knows). The faces turned from the light, to
 * the lower right, hatched; the knobs catch the light.
 */
const dodecaSign: Sign = (p, c, r) => {
  const s = r * 0.5;
  const P = (q: V3): Pt => [c[0] + q[0] * s, c[1] - q[1] * s];
  const { corners, faces } = DODECA;
  const light = unit3([-0.6, 0.75, 0.7]);
  const shown = faces.map((f, i) => ({ ...f, i })).filter((f) => f.n[2] > 0.04);
  // Each edge once.
  const edges = new Map<string, number>();
  for (const f of shown) for (let k = 0; k < 5; k++) {
    const [a, b] = [f.ids[k], f.ids[(k + 1) % 5]];
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    edges.set(key, (edges.get(key) ?? 0) + 1);
  }
  const kr = r * 0.055;
  const knobAt = (i: number) => P([corners[i][0] * 1.08, corners[i][1] * 1.08, corners[i][2] * 1.08]);
  let rim = '';
  let inner = '';
  for (const [key, n] of edges) {
    const [a, b] = key.split('-').map(Number);
    if (n === 1) rim += line(P(corners[a]), P(corners[b]));
    else inner += line(P(corners[a]), P(corners[b]));
  }
  p.add(rim + inner, 'sign');
  // The holes, each its own size, round in its face's plane; the faces from the light hatched round them.
  const sizes = [0.62, 0.5, 0.68, 0.56, 0.46, 0.6, 0.52, 0.66, 0.48, 0.58, 0.5, 0.64];
  const IN = 0.851;
  let holes = '';
  let h = '';
  for (const f of shown) {
    const hr = IN * sizes[f.i];
    const ring = Array.from({ length: 28 }, (_, k) => {
      const t = (k / 28) * Math.PI * 2;
      return P([f.cen[0] + hr * (Math.cos(t) * f.u[0] + Math.sin(t) * f.v[0]), f.cen[1] + hr * (Math.cos(t) * f.u[1] + Math.sin(t) * f.v[1]), 0]);
    });
    holes += poly(ring);
    if (dot3(f.n, light) > 0.2) continue;
    // In the face's own plane: lines across it, inside its edges and clear of the hole.
    const flat = f.ids.map((i) => [dot3(sub3(corners[i], f.cen), f.u), dot3(sub3(corners[i], f.cen), f.v)] as Pt);
    const to = (x: number, y: number): Pt => P([f.cen[0] + x * f.u[0] + y * f.v[0], f.cen[1] + x * f.u[1] + y * f.v[1], 0]);
    const step = 1 / s;
    for (let y = -1; y <= 1; y += step) {
      let run: Pt | null = null;
      let last: Pt | null = null;
      for (let x = -1.05; x <= 1.06; x += 0.03) {
        const ok = inPoly([x, y], flat) && Math.hypot(x, y) > hr + 0.12 && fromOutline([x, y], flat) > 0.1;
        if (ok) {
          if (!run) run = [x, y];
          last = [x, y];
        } else if (run && last) {
          if (dist(run, last) > 0.08) h += line(to(...run), to(...last));
          run = null;
        }
      }
      if (run && last && dist(run, last) > 0.08) h += line(to(...run), to(...last));
    }
  }
  p.add(holes, 'sign');
  p.add(h, 'hatch');
  // The knobs on the corners we see.
  const seen = new Set(shown.flatMap((f) => f.ids));
  p.add([...seen].map((i) => disc(knobAt(i), kr)).join(''), 'fill');
};

export const seals: AuraSeal = { seal: tower, sign: dodecaSign };
