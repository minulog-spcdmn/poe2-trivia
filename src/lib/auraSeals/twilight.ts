// The Twilight Order aura's seal and sign (lib/auraEngraving: the seal in
// Sol's place on the face and at the back's heart, the sign in Luna's place).

import { angleOf, at, lerp, line, pt, ring, type Pt } from '../arcane.ts';
import { poly, disc, dist, cutLine, ringCuts, sealRing, type Clear, type Seal, type Sign, type AuraSeal } from './kit.ts';

/** A lancet window standing on `foot`, `w` across and `h` tall, its head a pointed arch: its outline. */
function lancet(foot: Pt, w: number, h: number): Pt[] {
  // The head drawn up a little past an equilateral arch's, as a lancet's is.
  const stretch = 1.15;
  const spring = foot[1] - h + w * 0.866 * stretch;
  const [l, r] = [foot[0] - w / 2, foot[0] + w / 2];
  // Each side of the head an arc about the other side's springing, as an equilateral arch is struck.
  const side = (s: 1 | -1): Pt[] =>
    Array.from({ length: 9 }, (_, i) => {
      const t = (i / 8) * (Math.PI / 3);
      return [s < 0 ? r - w * Math.cos(t) : l + w * Math.cos(t), spring - w * Math.sin(t) * stretch] as Pt;
    });
  return [[l, foot[1]], ...side(-1), ...side(1).reverse(), [r, foot[1]]];
}

/** The part of the outline `ps` on one side of the upright line through `x`: left of it (`side` -1) or right (1). */
function halfOf(ps: Pt[], x: number, side: 1 | -1): Pt[] {
  const inSide = (q: Pt) => (q[0] - x) * side >= 0;
  const out: Pt[] = [];
  ps.forEach((q, i) => {
    const r = ps[(i + 1) % ps.length];
    if (inSide(q)) out.push(q);
    if (inSide(q) !== inSide(r)) out.push(lerp(q, r, (x - q[0]) / (r[0] - q[0])));
  });
  return out;
}

/**
 * The Order's seal: its lantern, the pierced golden orb its heralds carry,
 * hung as a censer is. The ring is the orb; round its waist its lancet
 * windows, glazed as the Order's church in Arastas is, the middle one full
 * on and those either side turned away; the orb shaded round its lower
 * right, away from the light; each window's glass lit from within by its
 * candle, bright either side of its lead; a cap and a ring above to hang it
 * by, a finial below.
 */
const twilight: Seal = (p, c, R, room) => {
  const Ri = R - 1.3;
  // The waist: an ellipse seen from a little above, its near half below the middle.
  const [ea, eb, ey] = [Ri, R * 0.26, R * 0.16];
  const near = (x: number): Pt => [c[0] + x, c[1] + ey + eb * Math.sqrt(Math.max(0, 1 - (x / ea) ** 2))];
  const windows = [
    { x: 0, w: 0.32, h: 0.78 },
    { x: -0.56, w: 0.22, h: 0.64 },
    { x: 0.56, w: 0.22, h: 0.64 },
  ].map(({ x, w, h }) => lancet(near(R * x), R * w, R * h));
  // The cap and the hanging ring above, the finial below, as the room allows.
  const capR = R * 0.24;
  const capC = at(c, 0, R - capR * 0.2);
  const hang = { c: at(c, 0, R + capR * 0.8 + R * 0.12), r: R * 0.12 };
  const withCap = room(0) > R + capR * 0.8 + 0.6;
  const withHang = withCap && room(0) > dist(c, hang.c) + hang.r + 0.6;
  const finial: Pt[] = [at(c, 180 - 9, R + 0.3), at(c, 180, R + R * 0.62), at(c, 180 + 9, R + 0.3)];
  const withFinial = finial.every((q) => dist(c, q) < room(angleOf(c, q)) - 0.8);
  const outside: Clear = { polys: [], holes: withCap ? [{ c: capC, r: capR + 0.6 }] : [], pad: 0.7 };
  if (withFinial) outside.polys.push(finial);
  sealRing(p, c, R, ringCuts(c, R, outside));
  // The windows, and the waist's two mouldings, below them and over them, stopping short of them.
  const lit: Clear = { polys: windows, holes: [], pad: 0.7 };
  p.add(windows.map((w) => poly(w)).join(''), 'thin');
  // Each window lit from within by the candle: its glass in two lights either side of its lead, each bright.
  const glass = windows.flatMap((w) => {
    const mid = (w[0][0] + w[w.length - 1][0]) / 2;
    const inset = w.map((q) => lerp(q, [mid, (w[0][1] + w[9][1]) / 2], 0.75 / Math.max(0.75, dist(q, [mid, (w[0][1] + w[9][1]) / 2])) * 1.4) as Pt);
    return [halfOf(inset, mid - 0.35, -1), halfOf(inset, mid + 0.35, 1)];
  });
  p.add(glass.map((g) => poly(g)).join(''), 'fill');
  let mould = '';
  for (const lift of [0, R * 0.92]) {
    let prev: Pt | null = null;
    for (let x = -ea; x <= ea + 1e-6; x += ea / 30) {
      const q: Pt = [near(x)[0], near(x)[1] + 0.9 - lift];
      if (prev && dist(c, q) < Ri - 0.6 && dist(c, prev) < Ri - 0.6) mould += cutLine(prev, q, lit);
      prev = q;
    }
  }
  p.add(mould, 'hair');
  // The orb's shade: round its lower right, in level strokes, stopping short of the windows.
  const Rs = Ri - 0.7;
  const o: Pt = [-R * 0.3, -R * 0.3];
  let shade = '';
  for (let y = -Rs + 0.5; y < Rs; y += 0.75) {
    const x1 = Math.sqrt(Rs * Rs - y * y);
    const dy = y - o[1];
    const from = Math.abs(dy) < Rs ? o[0] + Math.sqrt(Rs * Rs - dy * dy) : -x1;
    if (x1 - Math.max(from, -x1) > 0.8) shade += cutLine([c[0] + Math.max(from, -x1) + 0.3, c[1] + y], [c[0] + x1 - 0.3, c[1] + y], lit);
  }
  p.add(shade, 'hatch');
  if (withCap) {
    const capPts = Array.from({ length: 13 }, (_, i) => at(capC, -80 + (160 * i) / 12, capR));
    p.add(`M${capPts.map((q) => `${q[0].toFixed(2)} ${q[1].toFixed(2)}`).join('L')}`, 'thin');
  }
  if (withHang) p.add(ring(hang.c, hang.r), 'thin');
  if (withFinial) {
    p.add(poly(finial), 'thin');
    p.add(line(lerp(finial[0], finial[2], 0.5), lerp(lerp(finial[0], finial[2], 0.5), finial[1], 0.8)), 'hatch');
  }
  p.knockout +=
    disc(c, R + 1.4) +
    (withCap ? disc(capC, capR + 1.2) : '') +
    (withHang ? disc(hang.c, hang.r + 1.2) : '') +
    (withFinial ? poly(finial.map((q) => lerp(c, q, 1.06))) : '');
};

/**
 * The Order's bell, which tolls when the lantern is lit and when it blazes:
 * a church bell, cast, hung from the timber headstock it swings on (a
 * beam across, its ends on gudgeons), its shoulder round, its waist drawn
 * in and flaring out to a heavy lip, the clapper hanging below; shaded down
 * its right, away from the light. The headstock is what sets it apart from
 * a bare bell's outline.
 */
const bellSign: Sign = (p, c, r) => {
  const X = (x: number, y: number): Pt => [c[0] + x * r, c[1] + y * r];
  // One side of its profile, from the top of the shoulder down to the lip, mirrored for the other.
  const side = (s: 1 | -1): Pt[] => {
    const pts: Pt[] = [];
    // The shoulder: a quarter round from the top to the waist's head.
    for (let i = 0; i <= 8; i++) {
      const t = (i / 8) * (Math.PI / 2);
      pts.push(X(s * 0.36 * Math.sin(t), -0.42 - 0.3 * Math.cos(t)));
    }
    // The waist, drawn in a little, then flaring out to the lip.
    for (let i = 1; i <= 14; i++) {
      const t = i / 14;
      pts.push(X(s * (0.36 + 0.06 * t + 0.4 * t ** 3.2), -0.42 + 1.02 * t));
    }
    return pts;
  };
  const [l, rt] = [side(-1), side(1)];
  const lip = 0.6;
  let d = `M${[...l.slice().reverse(), ...rt.slice(1)].map(pt).join('L')}`;
  // The lip, a band across the mouth.
  d += line(X(-0.82, lip), X(0.82, lip)) + line(X(-0.74, lip - 0.14), X(0.74, lip - 0.14));
  p.add(d, 'sign');
  // The headstock: a beam across over the crown, the crown's straps up into it, a gudgeon at each end.
  const [bt, bb] = [-1.02, -0.84];
  p.add(poly([X(-0.62, bt), X(0.62, bt), X(0.62, bb), X(-0.62, bb)]) + line(X(-0.16, bb), X(-0.16, -0.72)) + line(X(0.16, bb), X(0.16, -0.72)), 'sign');
  p.add(disc(X(-0.76, (bt + bb) / 2), r * 0.08) + disc(X(0.76, (bt + bb) / 2), r * 0.08), 'fill');
  // The clapper, hanging inside: only its ball shows, on a short stem just below the lip.
  p.add(line(X(0, lip + 0.08), X(0, 0.7)), 'sign');
  p.add(disc(X(0, 0.78), r * 0.13), 'fill');
  // Shade down its right side.
  let h = '';
  for (let y = -0.5; y < lip - 0.22; y += 0.75 / r) {
    const q = rt.reduce((a, b) => (Math.abs(b[1] - X(0, y)[1]) < Math.abs(a[1] - X(0, y)[1]) ? b : a));
    const w = q[0] - c[0];
    if (w > r * 0.2) h += line([c[0] + w * 0.5, q[1]], [q[0] - 0.55, q[1]]);
  }
  p.add(h, 'hatch');
};

export const seals: AuraSeal = { seal: twilight, sign: bellSign };
