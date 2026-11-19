// The Slayer aura's seal and sign (lib/auraEngraving: the seal in Sol's
// place on the face and at the back's heart, the sign in Luna's place).

import { angleOf, at, lerp, line, pt, ring, type Pt } from '../arcane.ts';
import { poly, disc, dist, LIGHT, blocked, cutLine, ringCuts, piecesOf, sealRing, type Clear, type Seal, type Sign, type AuraSeal } from './kit.ts';

/** A straight blade from `root` to `tip`, `hw` either side, its edges parallel until the last `point` of its length, where they meet: its spine and its two edges, root first. */
function straightBlade(root: Pt, tip: Pt, hw: number, point: number) {
  const n = 30;
  const L = dist(root, tip) || 1;
  const nrm: Pt = [-(tip[1] - root[1]) / L, (tip[0] - root[0]) / L];
  const spine: Pt[] = [];
  const [left, right]: Pt[][] = [[], []];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const m = lerp(root, tip, t);
    const w = t < 1 - point ? hw : (hw * (1 - t)) / point;
    spine.push(m);
    left.push([m[0] + nrm[0] * w, m[1] + nrm[1] * w]);
    right.push([m[0] - nrm[0] * w, m[1] - nrm[1] * w]);
  }
  return { spine, left, right, outline: [...left, ...right.slice(0, -1).reverse()] };
}

/**
 * The Slayer's seal: his blade, and the blood it lives on. A sword stood
 * point down in the ring, its hilt within it (pommel, wrapped grip, a
 * straight guard across), its broad blade straight out through the ring and
 * down past it, a fuller down its middle, hatched down the side turned from
 * the light; and thrown off its edge, two drops of blood, each drawn to a
 * point behind it in flight. Upright, so the blade never reads as the bar
 * across a ring that forbids.
 */
const slayer: Seal = (p, c, R, room) => {
  const A = 180;
  const u = at([0, 0], A, 1);
  const n: Pt = [-u[1], u[0]];
  const along = (q: Pt, s: number, t = 0): Pt => [q[0] + u[0] * s + n[0] * t, q[1] + u[1] * s + n[1] * t];
  // The blade: from the guard down through the ring and past it, as far as the room lets it.
  const guard = along(c, R * 0.12);
  const reach = Math.min(R * 2.1, room(A) - 1.2);
  const b = straightBlade(along(guard, R * 0.05), at(c, A, reach), R * 0.13, 0.22);
  const spine = b.spine;
  // The guard: a straight bar across, its ends squared.
  const [gw, gt] = [R * 0.38, R * 0.055];
  const guardPoly: Pt[] = [along(guard, -gt, -gw), along(guard, -gt, gw), along(guard, gt, gw), along(guard, gt, -gw)];
  // The grip and the pommel, back from the guard into the ring.
  const gripEnd = along(guard, -R * 0.62);
  const gh = R * 0.075;
  const gripPoly: Pt[] = [along(guard, -R * 0.04, -gh), along(gripEnd, 0, -gh), along(gripEnd, 0, gh), along(guard, -R * 0.04, gh)];
  const pommel = { c: along(gripEnd, -R * 0.12), r: R * 0.13 };
  // The blood thrown off the point, ahead of its swing: each drop round at its head, drawn to a point behind it, each further on smaller.
  const drops = [
    { a: A - 22, d: 0.86, s: 0.13 },
    { a: A - 36, d: 0.76, s: 0.1 },
  ].flatMap(({ a, d, s }) => {
    const head = at(c, a, reach * d);
    const r = R * s;
    // Its point runs back along the way it was thrown, toward the blade.
    const back = angleOf(head, at(c, a + 14, reach * d * 0.97));
    const len = r * 3;
    // The outline: from the point, tangent onto the round, round its front and back to the point.
    const tipP = at(head, back, len);
    const tang = (Math.acos(r / len) * 180) / Math.PI;
    const outline: Pt[] = [tipP, ...Array.from({ length: 19 }, (_, i) => at(head, back + tang + ((360 - 2 * tang) * i) / 18, r))];
    return outline.every((q) => dist(c, q) < room(angleOf(c, q)) - 0.8) ? [{ head, r, outline }] : [];
  });
  const bladeAll: Clear = { polys: [...piecesOf(b.left, b.right), guardPoly, gripPoly], holes: [pommel], pad: 0.7 };
  sealRing(p, c, R, ringCuts(c, R, bladeAll));
  // The blade: edges, its fuller down the middle, hatched down the side turned from the light.
  const overGuard: Clear = { polys: [guardPoly], holes: [], pad: 0.6 };
  let edges = '';
  for (const side of [b.left, b.right]) for (let k = 0; k + 1 < side.length; k++) edges += cutLine(side[k], side[k + 1], overGuard);
  let shade = '';
  for (let k = 2; k + 6 < spine.length; k++) shade += cutLine(spine[k], spine[k + 1], overGuard);
  const m = Math.floor(spine.length / 2);
  const dark = (b.left[m][0] - spine[m][0]) * LIGHT[0] + (b.left[m][1] - spine[m][1]) * LIGHT[1] < 0 ? b.left : b.right;
  let run = 0;
  for (let k = 1; k + 2 < spine.length; k++) {
    run += dist(spine[k - 1], spine[k]);
    if (run < 0.62) continue;
    run = 0;
    shade += cutLine(lerp(spine[k], dark[k], 0.18), lerp(spine[k], dark[k], 0.88), overGuard);
  }
  p.add(edges, 'thin');
  p.add(poly(guardPoly), 'thin');
  // The grip, wrapped, and the pommel.
  const overGrip: Clear = { polys: [guardPoly], holes: [pommel], pad: 0.55 };
  p.add(cutLine(gripPoly[0], gripPoly[1], overGrip) + cutLine(gripPoly[3], gripPoly[2], overGrip), 'thin');
  let wraps = '';
  for (let s = R * 0.1; s < R * 0.58; s += 0.85) wraps += cutLine(along(guard, -s, -gh), along(guard, -s - 0.6, gh), overGrip);
  p.add(wraps, 'hatch');
  p.add(ring(pommel.c, pommel.r), 'thin');
  p.add(disc(pommel.c, pommel.r * 0.35), 'fill');
  p.add(shade, 'hatch');
  // The blood, bright.
  p.add(drops.map((d) => poly(d.outline)).join(''), 'fill');
  p.knockout +=
    disc(c, R + 1.4) +
    poly(b.outline) +
    b.left.slice(1).map((_, i) => poly([b.left[i], b.left[i + 1], b.right[i + 1], b.right[i]].map((q) => lerp(spine[i], q, 1.35)))).join('') +
    drops.map((d) => poly(d.outline.map((q) => lerp(d.head, q, 1 + 1.1 / dist(d.head, q))))).join('');
};

/** Where the level line at height `y` crosses the closed outline `ps`, left to right. */
function crossings(ps: Pt[], y: number): number[] {
  const xs: number[] = [];
  ps.forEach((q, i) => {
    const s = ps[(i + 1) % ps.length];
    if (q[1] <= y !== s[1] <= y) xs.push(q[0] + ((y - q[1]) / (s[1] - q[1])) * (s[0] - q[0]));
  });
  return xs.sort((a, b) => a - b);
}

/**
 * A goblet of blood: every kill drawn in to feed him. A cup on a knopped
 * stem, its bowl brimming, a drop falling into it and another run over its lip and
 * down its side; the blood's face hatched dark, the bowl shaded down its
 * right, away from the light.
 */
const gobletSign: Sign = (p, c, r) => {
  const X = (x: number, y: number): Pt => [c[0] + x * r, c[1] + y * r];
  const mirror = (q: Pt): Pt => [2 * c[0] - q[0], q[1]];
  // The rim, seen from a little above; the bowl a half round under it, narrowing to the stem.
  const [rimY, rimA, rimB, bowlFoot] = [-0.5, 0.52, 0.1, 0.16];
  const rim = Array.from({ length: 32 }, (_, i) => {
    const t = (i / 32) * Math.PI * 2;
    return X(rimA * Math.cos(t), rimY + rimB * Math.sin(t));
  });
  const bowl = (s: 1 | -1): Pt[] =>
    Array.from({ length: 13 }, (_, i) => {
      const t = i / 12;
      return X(s * (0.07 + (rimA - 0.07) * Math.sqrt(Math.max(0, 1 - t ** 1.6))), rimY + (bowlFoot - rimY) * t);
    });
  // The stem with its knop, and the foot flaring out to a band.
  const stemL: Pt[] = [X(-0.07, bowlFoot), X(-0.05, 0.22), X(-0.1, 0.27), X(-0.1, 0.33), X(-0.05, 0.38), X(-0.05, 0.62), X(-0.12, 0.72), X(-0.38, 0.8), X(-0.4, 0.88)];
  const body = [...bowl(-1), ...stemL.slice(1), ...stemL.slice(1).reverse().map(mirror), ...bowl(1).reverse()];
  let d = `M${body.map(pt).join('L')}`;
  d += poly(rim) + line(X(-0.38, 0.8), X(0.38, 0.8));
  // The drop falling in, its point up; and one run over the lip down the bowl's left, ending round.
  const drop = (head: Pt, rr: number, len: number): Pt[] => {
    const tang = (Math.acos(rr / len) * 180) / Math.PI;
    return [at(head, 0, len), ...Array.from({ length: 13 }, (_, i) => at(head, tang + ((360 - 2 * tang) * i) / 12, rr))];
  };
  const falling = drop(X(0, -0.8), r * 0.08, r * 0.22);
  const runX = -0.3;
  const runFoot = X(runX, -0.18);
  d += line(X(runX - 0.035, rimY + 0.08), [runFoot[0] - 0.035 * r, runFoot[1]]) + line(X(runX + 0.035, rimY + 0.085), [runFoot[0] + 0.035 * r, runFoot[1]]);
  p.add(d, 'sign');
  p.add(poly(falling) + disc(X(runX, -0.13), r * 0.06), 'fill');
  // The blood's face, inside the rim, hatched dark; the bowl shaded down its right.
  let h = '';
  const face = rim.map((q) => [c[0] + (q[0] - c[0]) * 0.86, c[1] + rimY * r + (q[1] - c[1] - rimY * r) * 0.8] as Pt);
  for (let y = c[1] + (rimY - rimB * 0.8) * r + 0.6; y < c[1] + (rimY + rimB * 0.8) * r - 0.3; y += 0.6) {
    const xs = crossings(face, y);
    if (xs.length === 2 && xs[1] - xs[0] > 1.2) h += line([xs[0] + 0.5, y], [xs[1] - 0.5, y]);
  }
  for (let y = rimY + rimB + 0.08; y < bowlFoot - 0.04; y += 0.8 / r) {
    const yy = c[1] + y * r;
    const edge = crossings(body, yy).at(-1)!;
    const from = Math.max(c[0] + r * 0.06, edge - r * 0.2);
    if (edge - 0.55 - from > 0.6) h += line([from, yy], [edge - 0.55, yy]);
  }
  p.add(h, 'hatch');
};

export const seals: AuraSeal = { seal: slayer, sign: gobletSign };
