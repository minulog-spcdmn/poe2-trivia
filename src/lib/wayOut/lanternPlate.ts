// The Lantern's plate (see lantern.ts): the way out of a vein as the lamp
// of the lit path, engraved into the card's plate (lib/cardEngraving) as
// the finds' motifs are (lib/findEngraving), by the same hand: exact
// geometry, one-sided hatching, lines stopping short of what they meet.
//
// • In the window, a miner's lantern hangs on a short chain from the
//   arch's keystone: a ring and a knob, a pointed cap over a pierced vent,
//   a hood flaring out to its rim, then the cage, six-sided, seen a little
//   from above as the pedestal is, its posts and bars round a lancet flame
//   standing on its burner, light running out from the flame between the
//   bars; under it a stepped foot ending in a drop. Each tier is computed
//   from its hexagon, the faces turned from the light (upper left) hatched,
//   crowding toward the edge.
// • The glory is the lamp's light: fine rays out of the flame, long and
//   short in turn, and two rings of light round it, stopping short of the
//   lantern.
// • In Sol's place the dawn, a sun rising over the edge of the world, the
//   light the path leads back to; in Luna's, the lamp's star.
// • The back hangs the lantern in the mandorla, in its light.
//
// Laid in a row the lantern stands at the emblem's place, whole within the
// row, without its chain.

import { arc, at, f, lerp, line, pt, rad, type Hole, type Pt } from '../arcane.ts';
import type { BackLayout, Plate, RowLayout, TallLayout, Variant } from '../cardEngraving.ts';
import { NONE, grow, hull, poly, seg, type Shields } from '../findEngraving.ts';

// ---- geometry -------------------------------------------------------------------

// (Convex shapes, and lines that stop short of them, as the finds' plates have them: lib/findEngraving.)
const polyline = (ps: Pt[]) => `M${ps.map(pt).join('L')}`;
/** A disc, as one closed path. */
const disc = (c: Pt, r: number) => `M${pt([c[0] + r, c[1]])}A${f(r)} ${f(r)} 0 1 1 ${pt([c[0] - r, c[1]])}A${f(r)} ${f(r)} 0 1 1 ${pt([c[0] + r, c[1]])}Z`;

/**
 * Lines across the face `a`, `b`, `c`, `d` parallel to its side `a` to `b`,
 * `n` of them stepping toward `d` to `c`, crowding toward `a` to `b` as
 * `crowd` grows past 1 (as light falls off round a turning surface), kept
 * 0.5 in from its ends.
 */
function hatchFace(a: Pt, b: Pt, c: Pt, d: Pt, n: number, crowd = 1, s: Shields = NONE) {
  let out = '';
  for (let i = 1; i <= n; i++) {
    const t = (i / (n + 1)) ** crowd;
    const [p, q] = [lerp(a, d, t), lerp(b, c, t)];
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (len < 1.2) continue;
    const k = 0.5 / len;
    out += seg(lerp(p, q, k), lerp(p, q, 1 - k), s);
  }
  return out;
}

// ---- the lantern ----------------------------------------------------------------

/** How flat a level hexagon looks, seen a little from above (as the pedestal is). */
const FLAT = 0.085;
/** The corners of a hexagon seen from the front: right, front right, front left, left. */
const FRONT = [0, 60, 120, 180];
const ALL = [0, 60, 120, 180, 240, 300];

/**
 * A tier of the lantern, in its own units (the flame's heart at 0, 0, y
 * down): a six-sided frustum from radius `r0` at `y0` to `r1` at `y1`.
 * `top`: its upper edge is seen (not covered by what sits on it). `dark`
 * and `mid`: how many strokes shade its right face and its front face.
 */
type Tier = { y0: number; y1: number; r0: number; r1: number; top?: boolean; dark: number; mid?: number; rivets?: boolean };

/** The lantern's tiers, top to bottom, besides its cage and cap. */
const HOOD: Tier = { y0: -47, y1: -35, r0: 8.6, r1: 28.5, top: true, dark: 13 };
const TIERS: Tier[] = [
  // The cap's eave, the vent under it.
  { y0: -55, y1: -53.4, r0: 10.4, r1: 10.4, dark: 6 },
  { y0: -53.4, y1: -47, r0: 6.8, r1: 6.8, dark: 6 },
  HOOD,
  // The hood's rim, the band the cage hangs from.
  { y0: -35, y1: -31, r0: 28.5, r1: 28.5, dark: 9 },
  { y0: -31, y1: -27, r0: 25.6, r1: 25.6, dark: 9, rivets: true },
  // The band the cage stands in, and the foot, stepping in to the drop.
  { y0: 27, y1: 31, r0: 25.6, r1: 25.6, top: true, dark: 9, rivets: true },
  { y0: 31, y1: 38, r0: 25.6, r1: 15, dark: 12, mid: 5 },
  { y0: 38, y1: 43, r0: 15, r1: 15, dark: 8, mid: 3 },
  { y0: 43, y1: 49, r0: 15, r1: 4.6, dark: 8, mid: 4 },
];
/** The cage. */
const CAGE = { y0: -27, y1: 27, r: 24 };
/** The flame: a lancet, its foot a circle of `r` about `foot`, its tip at `tip`. */
const FLAME = { foot: 11, r: 5.6, tip: -20 };
const MIDDLE = { foot: 11.7, r: 3.9, tip: -10 };
const CORE = { foot: 12.5, r: 2.2, tip: -1 };
/** The ring it hangs by, and the knob under it. */
const RING = { y: -70.2, r: 6, w: 1.4 };
const KNOB = { y: -62, r: 2.2 };
const CAP_TIP = -60.5;

/** A lancet: a circle's lower half, its sides arcs meeting in a point at `tip`; as path data and as points round it. */
function lancet(P: (x: number, y: number) => Pt, s: number, { foot, r, tip }: { foot: number; r: number; tip: number }) {
  const h = foot - tip;
  const R = (h * h + r * r) / (2 * r);
  const [right, top, left] = [P(r, foot), P(0, tip), P(-r, foot)];
  const d = `M${pt(right)}A${f(R * s)} ${f(R * s)} 0 0 0 ${pt(top)}A${f(R * s)} ${f(R * s)} 0 0 0 ${pt(left)}A${f(r * s)} ${f(r * s)} 0 0 0 ${pt(right)}Z`;
  // Its half width at height y.
  const half = (y: number) => (y >= foot ? Math.sqrt(Math.max(0, r * r - (y - foot) ** 2)) : Math.sqrt(Math.max(0, R * R - (y - foot) ** 2)) - (R - r));
  const pts: Pt[] = [];
  for (let i = 0; i <= 12; i++) {
    const y = tip + ((foot + r - tip) * i) / 12;
    pts.push(P(half(y), y));
  }
  for (let i = 12; i >= 0; i--) {
    const y = tip + ((foot + r - tip) * i) / 12;
    pts.push(P(-half(y), y));
  }
  return { d, pts: hull(pts), half };
}

/** The angles of the lamp's rays (the glory's, which those in the cage follow). */
const RAYS = 96;
const rayAngle = (k: number) => ((k + 0.5) / RAYS) * 360;

/** A ring: a disc with a hole, as one path filled by its winding (the hole turned the other way). */
const annulus = (c: Pt, R: number, r: number) =>
  disc(c, R) + `M${pt([c[0] + r, c[1]])}A${f(r)} ${f(r)} 0 1 0 ${pt([c[0] - r, c[1]])}A${f(r)} ${f(r)} 0 1 0 ${pt([c[0] + r, c[1]])}Z`;

/**
 * The lantern, its flame's heart at `C`, `s` times its own size; on a
 * chain from `chain` (the y it hangs from, with a staple there if
 * `staple`). Its outline is knocked out of the plate. `gild`: on a face,
 * gilded as an item's emblem is (Plate.gilt), the chain left engraved.
 */
function lantern(p: Plate, C: Pt, s: number, chain?: { from: number; links: number; staple: boolean }, gild = false) {
  const P = (x: number, y: number): Pt => [C[0] + x * s, C[1] + y * s];
  const parts: NonNullable<Plate['gilt']>['parts'] = [];
  const gilt = (d: string, tone: 'glass' | 'body' | 'flame') => {
    if (gild) parts.push({ d, tone });
  };
  /** A hexagon's corner at `th` degrees round (0 to the right, 90 to the front), radius `r`, height `y`. */
  const V = (r: number, th: number, y: number): Pt => P(r * Math.cos(rad(th)), y + FLAT * r * Math.sin(rad(th)));
  const ko: Pt[][] = [];

  // The tiers.
  for (const t of TIERS) {
    const top = FRONT.map((th) => V(t.r0, th, t.y0));
    const bot = FRONT.map((th) => V(t.r1, th, t.y1));
    if (t.top) p.add(polyline(top), 'thin');
    p.add(polyline(bot), 'thin');
    p.add(line(top[0], bot[0]) + line(top[3], bot[3]), 'thin');
    p.add(line(top[1], bot[1]) + line(top[2], bot[2]), 'hair');
    // Shaded on the right face, crowding to its edge; the faces turned down, on the front too.
    const n = Math.max(2, Math.round(t.dark * Math.min(1, s * 1.15)));
    p.add(hatchFace(top[0], bot[0], bot[1], top[1], n, 1.5), 'hatch');
    if (t.mid) p.add(hatchFace(top[1], bot[1], bot[2], top[2], Math.max(1, Math.round(t.mid * Math.min(1, s * 1.15))), 1.6), 'hatch');
    if (t.rivets && s > 0.45) {
      const y = (t.y0 + t.y1) / 2;
      p.add(
        [30, 90, 150].map((th) => disc(lerp(V(t.r0, th - 30, y), V(t.r0, th + 30, y), 0.5), 0.55 * Math.min(1, s * 1.2))).join(''),
        'fill',
      );
    }
    ko.push(hull(ALL.flatMap((th) => [V(t.r0, th, t.y0), V(t.r1, th, t.y1)])));
    gilt(poly(ko[ko.length - 1]), 'body');
  }
  // The drop under the foot: a bead and a point.
  const bead = P(0, 51.2);
  p.add(arc(bead, 2 * s, 0, 360), 'thin');
  p.add(arc(bead, 1.2 * s, 25, 150), 'hatch');
  const drop = [P(-1.1, 52.9), P(0, 57.5), P(1.1, 52.9)];
  p.add(polyline(drop), 'thin');
  p.add(hatchFace(P(0.15, 53.3), P(0.1, 56.6), P(0.1, 56.6), P(0.85, 53.3), 2), 'hatch');
  p.knockout += disc(bead, 2 * s + 1.4);
  ko.push(drop);
  gilt(disc(bead, 2 * s) + poly(drop), 'body');

  // The vent's piercings: round on its front face, narrowed on the sides.
  if (s > 0.45) {
    const vy = -50.2;
    let vents = '';
    for (const th of [30, 90, 150]) {
      const c = lerp(V(6.8, th - 30, vy), V(6.8, th + 30, vy), 0.5);
      const rx = th === 90 ? 1.15 : 0.6;
      vents += `M${pt([c[0] + rx * s, c[1]])}A${f(rx * s)} ${f(1.3 * s)} 0 1 1 ${pt([c[0] - rx * s, c[1]])}A${f(rx * s)} ${f(1.3 * s)} 0 1 1 ${pt([c[0] + rx * s, c[1]])}Z`;
    }
    p.add(vents, 'hair');
  }

  // The cap: a pyramid on the eave, its point under the knob.
  const knob = P(0, KNOB.y);
  const knobHole: Hole = { c: knob, r: (KNOB.r + 0.6) * s };
  const capBase = FRONT.map((th) => V(10.4, th, -55));
  const tip = P(0, CAP_TIP);
  p.add(polyline(capBase), 'thin');
  p.add(line(tip, capBase[0], { holes: [knobHole] }) + line(tip, capBase[3], { holes: [knobHole] }), 'thin');
  p.add(line(tip, capBase[1], { holes: [knobHole] }) + line(tip, capBase[2], { holes: [knobHole] }), 'hair');
  p.add(hatchFace(capBase[0], tip, tip, capBase[1], Math.max(2, Math.round(7 * Math.min(1, s * 1.15))), 1.4, { polys: [], holes: [knobHole] }), 'hatch');
  ko.push(hull([tip, ...ALL.map((th) => V(10.4, th, -55))]));
  gilt(poly(ko[ko.length - 1]), 'body');

  // The knob, shaded round its right side, and the ring on it.
  p.add(arc(knob, KNOB.r * s, 0, 360), 'thin');
  p.add(arc(knob, KNOB.r * s * 0.6, 25, 150), 'hatch');
  const ringC = P(0, RING.y);
  const ringTop = RING.y - RING.r;
  // The chain's last link passes in front of the ring at its top.
  const linkW = 0.75 * s;
  const ringHoles: Hole[] = chain ? [{ c: P(0, ringTop + RING.w / 2), r: linkW + 0.7 }] : [];
  p.add(arc(ringC, RING.r * s, -180, 180, { holes: ringHoles }), 'thin');
  p.add(arc(ringC, (RING.r - RING.w) * s, -180, 180, { holes: ringHoles }), 'hair');
  let ringShade = '';
  for (let a = 30; a <= 150; a += 12) ringShade += line(at(ringC, a, (RING.r - RING.w + 0.35) * s), at(ringC, a, (RING.r - 0.35) * s));
  p.add(ringShade, 'hatch');
  p.knockout += disc(ringC, RING.r * s + 1.4) + disc(knob, KNOB.r * s + 1.4);
  gilt(annulus(ringC, RING.r * s, (RING.r - RING.w) * s), 'body');
  gilt(disc(knob, KNOB.r * s), 'body');

  // The chain, link by link: edge on and face on in turn, each edge-on link in front where it passes through the next.
  if (chain) {
    const x = C[0];
    const top = chain.from + (chain.staple ? 1.3 * s : 0);
    const end = P(0, ringTop + RING.w * 0.6)[1];
    const n = chain.links;
    const w = 1.05 * s;
    const L = (end - top + 2 * w * (n - 1)) / n;
    const a = 2.5 * s;
    const fronts: Hole[] = [];
    let thin = '';
    let hair = '';
    for (let i = 0; i < n; i++) {
      const t = top + i * (L - 2 * w);
      if (i % 2 === 0) {
        // Edge on: a slender loop.
        const e = linkW;
        thin += `M${pt([x - e, t + e])}L${pt([x - e, t + L - e])}A${f(e)} ${f(e)} 0 0 0 ${pt([x + e, t + L - e])}L${pt([x + e, t + e])}A${f(e)} ${f(e)} 0 0 0 ${pt([x - e, t + e])}Z`;
        fronts.push({ c: [x, t + w / 2], r: e + 0.7 }, { c: [x, t + L - w / 2], r: e + 0.7 });
      }
    }
    for (let i = 1; i < n; i += 2) {
      const t = top + i * (L - 2 * w);
      const holes = fronts;
      for (const [r, cls] of [
        [a, 'thin'],
        [a - w, 'hair'],
      ] as const) {
        const dy = a - r;
        const [y0, y1] = [t + dy + r, t + L - dy - r];
        const d = line([x - r, y0], [x - r, y1]) + line([x + r, y0], [x + r, y1]) + arc([x, y0], r, -90, 90, { holes }) + arc([x, y1], r, 90, 270, { holes });
        if (cls === 'thin') thin += d;
        else hair += d;
      }
      // The wire shaded down its right side.
      p.add(hatchFace([x + a - 0.3, t + a], [x + a - 0.3, t + L - a], [x + a - w + 0.3, t + L - a], [x + a - w + 0.3, t + a], 1), 'hatch');
    }
    if (chain.staple) {
      // A staple under the keystone, the first link through it.
      const c: Pt = [x, chain.from];
      thin += arc(c, 2.3 * s, 90, 270, { holes: fronts });
      hair += arc(c, (2.3 - 1.05) * s, 90, 270, { holes: fronts });
    }
    p.add(thin, 'thin');
    p.add(hair, 'hair');
    p.knockout += poly([
      [x - a - 1.2, chain.from + (chain.staple ? 0.6 : -2)],
      [x + a + 1.2, chain.from + (chain.staple ? 0.6 : -2)],
      [x + a + 1.2, end],
      [x - a - 1.2, end],
    ]);
  }

  // The cage: its posts at the corners seen, two bars on each face.
  const posts: Pt[][] = [];
  const bars: [Pt, Pt][] = [];
  const { y0: cy0, y1: cy1, r: cr } = CAGE;
  const edge = (x: number, z: number): [Pt, Pt] => [P(x, cy0 + FLAT * z), P(x, cy1 + FLAT * z)];
  const pw = 0.7;
  let postLines = '';
  let postHair = '';
  for (const th of FRONT) {
    const [x, z] = [cr * Math.cos(rad(th)), cr * Math.sin(rad(th))];
    if (th === 0 || th === 180) {
      const sgn = Math.sign(x);
      postLines += line(...edge(x, z));
      postHair += line(...edge(x - sgn * 1.4, z));
      posts.push([...edge(x, z), ...edge(x - sgn * 1.4, z).reverse()]);
    } else {
      postLines += line(...edge(x - pw, z));
      postHair += line(...edge(x + pw, z));
      posts.push([...edge(x - pw, z), ...edge(x + pw, z).reverse()]);
    }
  }
  p.add(postLines, 'thin');
  p.add(postHair, 'hair');
  let barLines = '';
  for (let i = 0; i < 3; i++) {
    const [ta, tb] = [FRONT[i], FRONT[i + 1]];
    for (const u of [1 / 3, 2 / 3]) {
      const [xa, za] = [cr * Math.cos(rad(ta)), cr * Math.sin(rad(ta))];
      const [xb, zb] = [cr * Math.cos(rad(tb)), cr * Math.sin(rad(tb))];
      const [x, z] = [xa + (xb - xa) * u, za + (zb - za) * u];
      const b = edge(x, z);
      bars.push(b);
      barLines += line(...b);
    }
  }
  p.add(barLines, 'thin');
  ko.push(hull(ALL.flatMap((th) => [V(cr, th, cy0), V(cr, th, cy1)])));
  // Gilded, its panes glow faintly behind its posts and bars.
  gilt(poly(ko[ko.length - 1]), 'glass');
  for (const ps of posts) gilt(poly(hull(ps)), 'body');
  for (const [a, b] of bars) gilt(poly([[a[0] - 0.45 * s, a[1]], [a[0] + 0.45 * s, a[1]], [b[0] + 0.45 * s, b[1]], [b[0] - 0.45 * s, b[1]]]), 'body');

  // The burner the flame stands on: a round collar on a cone, on the cage's floor.
  const ell = (c: Pt, rx: number, t0: number, t1: number) => {
    const n = Math.max(2, Math.ceil(Math.abs(t1 - t0) / 10));
    return polyline(Array.from({ length: n + 1 }, (_, i) => {
      const t = rad(t0 + ((t1 - t0) * i) / n);
      return [c[0] + rx * s * Math.cos(t), c[1] + rx * s * FLAT * Math.sin(t)] as Pt;
    }));
  };
  const [bTop, bMid, bFoot] = [17, 20.5, 27];
  const [bR, fR] = [3.6, 6.4];
  p.add(ell(P(0, bTop), bR, 0, 360) + ell(P(0, bMid), bR, 0, 180) + line(P(-bR, bTop), P(-bR, bMid)) + line(P(bR, bTop), P(bR, bMid)), 'thin');
  p.add(line(P(-bR, bMid), P(-fR, bFoot)) + line(P(bR, bMid), P(fR, bFoot)) + ell(P(0, bFoot), fR, 0, 180), 'thin');
  p.add(hatchFace(P(bR - 0.2, bTop + 0.3), P(bR - 0.2, bMid - 0.2), P(bR * 0.25, bMid), P(bR * 0.25, bTop + 0.3), 3, 1.4), 'hatch');
  p.add(hatchFace(P(bR - 0.1, bMid + 0.4), P(fR - 0.4, bFoot - 0.3), P(fR * 0.3, bFoot - 0.3), P(bR * 0.3, bMid + 0.6), Math.max(2, Math.round(6 * Math.min(1, s * 1.15))), 1.5), 'hatch');
  const burner: Pt[] = [P(-bR - 0.8, bTop - 0.8), P(bR + 0.8, bTop - 0.8), P(fR + 1, bFoot + 1), P(-fR - 1, bFoot + 1)];
  gilt(poly([P(-bR, bTop), P(bR, bTop), P(bR, bMid), P(fR, bFoot), P(-fR, bFoot), P(-bR, bMid)]), 'body');

  // The flame: a lancet with its heart drawn within, and its wick.
  const flame = lancet(P, s, FLAME);
  const core = lancet(P, s, CORE);
  gilt(flame.d, 'flame');
  p.add(flame.d, 'thin');
  p.add(lancet(P, s, MIDDLE).d + core.d, 'hair');
  // The flame's heart, darker than the flame round it: a few strokes down its right.
  let heart = '';
  for (let y = CORE.tip + 4; y < CORE.foot + CORE.r - 0.8; y += 1.5 / Math.max(0.6, s)) {
    const hw = core.half(y);
    if (hw > 0.9) heart += line(P(hw * 0.05 + 0.5 / s, y), P(hw - 0.5 / s, y));
  }
  if (s > 0.45) p.add(heart, 'hatch');
  p.add(line(P(0, FLAME.foot + FLAME.r - 0.2), P(0, bTop - 0.3)), 'thin');

  // The light in the cage: the lamp's rays from round the flame out to the
  // front pane's edges, every third of the glory's, long and short in turn,
  // passing behind the bars.
  const shields: Shields = {
    polys: [...posts.map((ps) => grow(hull(ps), 0.7)), ...bars.map(([a, b]) => grow(hull([[a[0] - 0.01, a[1]], [a[0] + 0.01, a[1]], b]), 0.85)), grow(flame.pts, 2.2), grow(hull(burner), 0.3)],
    holes: [],
  };
  // Only through the front pane: the side panes, turned away, are left dark.
  const pane = cr / 2 - pw - 0.9;
  const box = [C[0] - pane * s, C[1] + (cy0 + 1) * s, C[0] + pane * s, C[1] + (cy1 - 0.4) * s];
  let light = '';
  for (let k = 1; k < RAYS; k += 3) {
    const a = rayAngle(k);
    const u = at([0, 0], a, 1);
    const ts = [u[0] > 1e-9 ? (box[2] - C[0]) / u[0] : u[0] < -1e-9 ? (box[0] - C[0]) / u[0] : Infinity, u[1] > 1e-9 ? (box[3] - C[1]) / u[1] : u[1] < -1e-9 ? (box[1] - C[1]) / u[1] : Infinity];
    const r1 = Math.min(...ts);
    const r0 = 4 * s;
    const end = (k - 1) % 6 ? r0 + (r1 - r0) * 0.62 : r1;
    light += seg(at(C, a, r0), at(C, a, end), shields);
  }
  p.add(light, 'hatch');

  p.knockout += ko.map((ps) => poly(grow(ps, 1.4))).join('');
  if (gild) {
    // Glass first, the body over it, the flame over all.
    const order = { glass: 0, body: 1, flame: 2 };
    p.gilt = { parts: parts.sort((a, b) => order[a.tone] - order[b.tone]), span: [P(0, RING.y - RING.r)[1], P(0, 57.5)[1]], light: { c: C, r: 34 * s } };
  }
}

// ---- the glory ------------------------------------------------------------------

/** The lamp's light: fine rays out of the flame, long and short in turn, and two rings of light round it. */
function lampGlory(p: Plate, c: Pt, reach: (deg: number) => number, row: boolean, o: { r0?: number; rings?: number[]; holes?: Hole[] } = {}) {
  const r0 = o.r0 ?? (row ? 14 : 30);
  let rays = '';
  for (let k = 0; k < RAYS; k++) {
    const a = rayAngle(k);
    const r1 = reach(a) - 2;
    const end = k % 2 ? r0 + (r1 - r0) * 0.58 : r1;
    if (end - r0 > 4) rays += line(at(c, a, r0), at(c, a, end), { holes: o.holes });
  }
  p.add(rays, 'ray');
  // The rings as short straight runs (the glory is cut out of the pedestal line by line).
  let rings = '';
  for (const R of o.rings ?? (row ? [26, 29] : [47, 51.5])) {
    const n = Math.ceil((2 * Math.PI * R) / 2.5);
    for (let i = 0; i < n; i++) {
      const [a0, a1] = [(i / n) * 360, ((i + 1) / n) * 360];
      if (R < reach(a0) - 2 && R < reach(a1) - 2) rings += line(at(c, a0, R), at(c, a1, R), { holes: o.holes });
    }
  }
  p.add(rings, 'ray');
}

// ---- the spandrels --------------------------------------------------------------

/** The dawn, `r` across: a sun half risen over the world's edge, pointed rays hatched down one side and fine ones between, the ground under it in level strokes. */
function dawn(p: Plate, c: Pt, r: number) {
  const h: Pt = [c[0], c[1] + r * 0.22];
  // The horizon, and the sun on it.
  p.add(line([h[0] - r, h[1]], [h[0] + r, h[1]]), 'thin');
  p.add(arc(h, r * 0.36, -90, 90), 'thin');
  p.add(arc(h, r * 0.27, -90, 90), 'hair');
  let fine = '';
  for (let k = -3; k <= 3; k++) {
    const a = k * 22.5;
    const r0 = r * 0.46;
    const half = (Math.asin(Math.min(1, 1.05 / r0)) * 180) / Math.PI;
    const [base, l, rt, tip] = [at(h, a, r0), at(h, a - half, r0), at(h, a + half, r0), at(h, a, k % 2 ? r * 0.8 : r)];
    p.add(line(l, tip) + line(rt, tip) + line(base, tip), 'hair');
    p.add(hatchFace(base, tip, tip, rt, 3, 1, NONE), 'hatch');
    if (k < 3) fine += line(at(h, a + 11.25, r * 0.46), at(h, a + 11.25, r * 0.66));
  }
  fine += line(at(h, -78.75, r * 0.46), at(h, -78.75, r * 0.66));
  p.add(fine, 'hatch');
  // The ground under it: level strokes, shorter as they go down.
  let ground = '';
  for (let i = 1; i <= 4; i++) {
    const y = h[1] + i * r * 0.17;
    const half = r * (0.92 - i * 0.16);
    ground += line([h[0] - half, y], [h[0] + half, y]);
  }
  p.add(ground, 'hatch');
}

/** The lamp's star, `r` across: an eight-pointed star, each point hatched down one side, fine rays between. */
function lampStar(p: Plate, c: Pt, r: number) {
  p.star(c, r * 0.95);
  let fine = '';
  for (let k = 0; k < 8; k++) fine += line(at(c, k * 45 + 22.5, r * 0.36), at(c, k * 45 + 22.5, r * 0.72));
  p.add(fine, 'hatch');
}

// ---- the variant ----------------------------------------------------------------

function face(p: Plate, g: TallLayout | RowLayout) {
  if (g.row) {
    // From its ring's top (76 over the flame) to its drop's point (57.5 under), within the row, no chain.
    const s = Math.min(0.6, (g.h - 18) / 133.5);
    const c: Pt = [g.emblem[0], g.emblem[1] + 9.25 * s];
    lantern(p, c, s, undefined, true);
    p.fade = { c, from: 13, r: 64 };
    return;
  }
  const k = (g.w / 218) * 1.15;
  const { A, ri } = g.arch;
  lantern(p, g.emblem, k, { from: A[1] - ri + 0.4, links: 3, staple: true }, true);
  // The glory shows from close round the lantern.
  p.fade = { c: g.emblem, from: 26, r: 128 };
}

function back(p: Plate, g: BackLayout) {
  const s = g.row ? Math.min(0.4, (g.lens.r - Math.abs(g.lens.a[1] - g.c[1]) - 6) / 77) : 0.6;
  // The light sits back with the plate.
  p.motif = false;
  lampGlory(p, g.c, (deg) => g.room(deg) + 1, g.row, { r0: g.row ? 13 : 22, rings: g.row ? [17, 19.5] : [33, 36.5], holes: g.holes });
  p.motif = true;
  lantern(p, g.c, s);
}

/** The Lantern's plate. */
export const LANTERN_PLATE: Variant = {
  spandrels(p, sol, luna, w) {
    void w;
    dawn(p, sol.c, sol.r * 0.95);
    lampStar(p, luna.c, luna.r * 0.92);
  },
  glory: (p, c, reach, row) => lampGlory(p, c, reach, row),
  face,
  back,
};
