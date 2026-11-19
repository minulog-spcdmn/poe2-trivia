// The Azmeri Spirits aura's seal and sign (lib/auraEngraving: the seal in Sol's
// place on the face and at the back's heart, the sign in Luna's place).
//
// The seal is the beast a wisp has entered: a stag's head, seen from the
// front, its eyes lit from within, and the spirit antlers that rise from it
// when the aura's wearer scores (fx/auras/azmeri.ts), breaking out of the
// ring over the arch; the wisp's light hangs between their tips. The sign is
// another of the beast spirits a wisp wreathes its host in, the Spirit of the
// Owl: an owl perched front on, its eyes lit from within as the stag's are.

import { at, lerp, line, type Pt } from '../arcane.ts';
import { poly, disc, dist, cutLine, ringCuts, bow, blade, piecesOf, sealRing, type Clear, type Seal, type Sign, type AuraSeal } from './kit.ts';

/** One antler on the side `s` (1 right, -1 left): its beam and tines as outlines, and each one's edges. */
function antler(c: Pt, R: number, s: 1 | -1, reach: number, room: (a: number) => number) {
  const X = (x: number, y: number): Pt => [c[0] + s * x * R, c[1] + y * R];
  const base = X(0.13, -0.48);
  const tipA = 38;
  const tip = at(c, s * tipA, reach);
  // The beam sweeps out, then turns up, as a stag's does: bowed out, away from the middle.
  const spine = bow(base, tip, -s * R * 0.14, 18);
  const beam = blade(spine, R * 0.1, 0.75);
  // The tines rise off the beam's upper side, up and in, each a little shorter than the last.
  const tines = [
    { t: 0.12, a: -40, len: 0.4 },
    { t: 0.42, a: -6, len: 0.58 },
    { t: 0.7, a: -12, len: 0.48 },
  ].map(({ t, a, len }) => {
    const i = Math.round(t * (spine.length - 1));
    const root = spine[i];
    const end = at(root, s * a, len * R * Math.min(1, room(s * a) / R / 1.9));
    const sp = bow(root, end, -s * len * R * 0.12, 8);
    return blade(sp, R * 0.075 * (1 - t * 0.3), 0.8);
  });
  // What the plate stops short of: each piece a little wider, its point a little further.
  const ko = [blade([...spine, at(tip, s * tipA, 1.2)], R * 0.1 + 1.3, 0.5).outline];
  for (const t of tines) {
    const sp = t.left.map((q, i) => lerp(q, t.right[i] ?? q, 0.5));
    const end = sp[sp.length - 1];
    ko.push(blade([...sp, lerp(sp[sp.length - 2], end, 1 + 1.2 / Math.max(0.1, dist(sp[sp.length - 2], end)))], dist(t.left[0], t.right[0]) / 2 + 1.3, 0.5).outline);
  }
  return { beam, tines, spine, ko };
}

/** The stag's head, front on, about `c`: its outline (from the poll down the right and back up the left), its ears, eyes and muzzle. */
function head(c: Pt, R: number) {
  const X = (x: number, y: number): Pt => [c[0] + x * R, c[1] + y * R];
  const right: [number, number][] = [
    [0, -0.46],
    [0.14, -0.47],
    [0.28, -0.38],
    [0.33, -0.22],
    [0.3, -0.02],
    [0.22, 0.24],
    [0.16, 0.48],
    [0.13, 0.6],
    [0.07, 0.67],
    [0, 0.68],
  ];
  const outline = [...right.map(([x, y]) => X(x, y)), ...right.slice(1, -1).reverse().map(([x, y]) => X(-x, y))];
  // The ears: each a long leaf out to the side and a little up, from the temple.
  const ears = ([1, -1] as const).map((s) => {
    const [r0, r1, tip] = [X(s * 0.27, -0.4), X(s * 0.32, -0.2), X(s * 0.74, -0.44)];
    return [...bow(r0, tip, s * R * 0.08, 8), ...bow(tip, r1, s * R * 0.1, 8).slice(1)];
  });
  const eyes = ([1, -1] as const).map((s) => {
    const [a, b] = [X(s * 0.11, -0.1), X(s * 0.24, -0.16)];
    return [...bow(a, b, s * R * 0.045, 6), ...bow(b, a, s * R * 0.045, 6).slice(1)];
  });
  return { outline, ears, eyes, X };
}

/**
 * Azmeri's seal: the stag's head in its ring, the spirit antlers breaking out
 * over it; the antlers stand in front of the ring, which stops short of them.
 */
const azmeri: Seal = (p, c, R, room) => {
  const reach = Math.min(R * 1.85, room(38) - 1.5, room(-38) - 1.5);
  const antlers = ([1, -1] as const).map((s) => antler(c, R, s, reach, room));
  const all = antlers.flatMap((a) => [a.beam, ...a.tines]);
  const front: Clear = { polys: all.flatMap((b) => piecesOf(b.left, b.right)), holes: [], pad: 0.8 };
  sealRing(p, c, R, ringCuts(c, R, front));
  const h = head(c, R);
  const { X } = h;
  // The antlers: each beam's edges open where a tine rises from it, each tine's edges stop at the beam.
  let edges = '';
  for (const { beam, tines, spine } of antlers) {
    const tineClear: Clear = { polys: tines.flatMap((t) => piecesOf(t.left, t.right)), holes: [], pad: 0 };
    const beamClear: Clear = { polys: piecesOf(beam.left, beam.right), holes: [], pad: 0 };
    const path = (ps: Pt[], s: Clear) => ps.slice(1).map((q, i) => cutLine(ps[i], q, s)).join('');
    edges += path(beam.left, tineClear) + path(beam.right, tineClear);
    for (const t of tines) edges += path(t.left, beamClear) + path(t.right, beamClear) + line(t.left[t.left.length - 1], t.right[t.right.length - 1]);
  }
  p.add(edges, 'thin');
  // The head, its ears, and its eyes lit from within.
  p.add(poly(h.outline), 'thin');
  for (const e of h.ears) p.add(poly(e), 'hair');
  p.add(h.eyes.map(poly).join(''), 'fill');
  // The muzzle's end and the bridge of the nose; the right of the face, turned from the light, hatched down.
  p.add(line(X(-0.08, 0.56), X(0.08, 0.56)) + line(X(0, -0.36), X(0, 0.4)), 'hair');
  let face = '';
  for (let y = -0.3; y < 0.58; y += 0.075) {
    const edge = h.outline.slice(0, 10).reduce((b, q) => (Math.abs(q[1] - X(0, y)[1]) < Math.abs(b[1] - X(0, y)[1]) ? q : b));
    const x1 = edge[0] - c[0] - 0.9;
    const x0 = Math.max(0.6, x1 * 0.45);
    if (x1 - x0 > 0.5) face += line([c[0] + x0, X(0, y)[1]], [c[0] + x1, X(0, y)[1]]);
  }
  p.add(face, 'hatch');
  // The wisp's light, held between the antlers over the ring.
  const light = X(0, -1 - Math.min(0.42, (room(0) - R) / R / 2));
  p.add(disc(light, R * 0.09), 'fill');
  p.knockout += disc(c, R + 1.4) + antlers.flatMap((a) => a.ko).map(poly).join('') + disc(light, R * 0.09 + 1.4);
};

/**
 * The Spirit of the Owl, one of the beast spirits a wisp wreathes its host in:
 * an owl perched front on, ear tufts up, brows drawn down in a glare, its
 * eyes lit from within as the stag's are; the wings folded down its sides, a few feathers on its breast,
 * a branch under its feet. Its right side, turned from the light, hatched.
 */
const owl: Sign = (p, c, r) => {
  const X = (x: number, y: number): Pt => [c[0] + x * r, c[1] + y * r];
  // The right half of the outline, from the brow's dip out over the tuft and down to the tail.
  const half: [number, number][] = [
    [0, -0.6],
    [0.18, -0.66],
    [0.36, -0.95],
    [0.44, -0.6],
    [0.5, -0.32],
    [0.55, 0.05],
    [0.5, 0.4],
    [0.36, 0.66],
    [0.16, 0.8],
    [0, 0.82],
  ];
  const right = half.map(([x, y]) => X(x, y));
  const outline = [...right, ...half.slice(1, -1).reverse().map(([x, y]) => X(-x, y))];
  p.add(poly(outline), 'sign');
  // The face: two discs about the eyes, the eyes lit, the beak between.
  const eyes = ([-1, 1] as const).map((s) => X(s * 0.2, -0.36));
  p.add(eyes.map((q) => disc(q, r * 0.15)).join(''), 'hair');
  p.add(eyes.map((q) => disc(q, r * 0.055)).join(''), 'fill');
  // The brow: from each tuft down over the eye to the beak, so it glares.
  p.add(`M${[X(-0.34, -0.7), X(-0.2, -0.5), X(0, -0.3), X(0.2, -0.5), X(0.34, -0.7)].map((q) => `${q[0].toFixed(2)} ${q[1].toFixed(2)}`).join('L')}`, 'sign');
  p.add(poly([X(0, -0.27), X(0.06, -0.18), X(0, -0.06), X(-0.06, -0.18)]), 'hair');
  // The wings folded down its sides.
  const wings = ([-1, 1] as const).map((s) => bow(X(s * 0.46, -0.16), X(s * 0.2, 0.74), -s * r * 0.1, 10));
  p.add(wings.map((w) => `M${w.map((q) => `${q[0].toFixed(2)} ${q[1].toFixed(2)}`).join('L')}`).join(''), 'hair');
  // Feathers on the breast: a few small arcs.
  let breast = '';
  for (const [x, y] of [[-0.12, 0.12], [0.12, 0.12], [0, 0.32], [-0.13, 0.5], [0.13, 0.5]] as [number, number][])
    breast += `M${bow(X(x - 0.07, y), X(x + 0.07, y), r * 0.04, 5).map((q) => `${q[0].toFixed(2)} ${q[1].toFixed(2)}`).join('L')}`;
  p.add(breast, 'hair');
  // The wing on its right, turned from the light, hatched across.
  let h = '';
  for (let y = -0.08; y < 0.62; y += 0.11) {
    const w = wings[1].reduce((best, q) => (Math.abs(q[1] - X(0, y)[1]) < Math.abs(best[1] - X(0, y)[1]) ? q : best));
    const o = right.slice(3).reduce((best, q, i, arr) => {
      const nx = arr[i + 1];
      if (!nx) return best;
      const yy = X(0, y)[1];
      if ((q[1] - yy) * (nx[1] - yy) > 0) return best;
      return lerp(q, nx, (yy - q[1]) / (nx[1] - q[1] || 1));
    }, null as Pt | null);
    if (o && o[0] - w[0] > 1.6) h += line([w[0] + 0.7, X(0, y)[1]], [o[0] - 0.7, X(0, y)[1]]);
  }
  p.add(h, 'hatch');
  // The branch it grips.
  p.add(line(X(-0.7, 0.9), X(0.72, 0.86)), 'sign');
};

export const seals: AuraSeal = { seal: azmeri, sign: owl };
