// Delve: the mark a new zone (or the last one standing, or a new best) leaves
// on the head of the stage, the kicker and the banner (Game.svelte), worked
// out from where they lie. Engraved as the alchemist's circle is
// (docs/arcane-style.md): exact geometry, fine lines that stop short of every
// seal and of the name, one-sided hatching, an unbroken glow under the lines,
// and an entrance in which the pen sweeps out from the middle. Pure: the
// component (ZoneMark.svelte) measures the head and draws what comes back.
//
// The designs, of which the app uses one (Game.svelte):
// • nameplate: the category cards' nameplate laid on the kicker's line: a
//   panel with notched corners in a double line, a seal holding the zone's
//   sigil inside each end behind a divider with a lozenge, lozenges on its
//   ends where the zone's ornament runs out;
// • cartouche: a slim cartouche with pointed ends, a seal nestled in each
//   point, its lower bevels hatched;
// • medallion: two larger seals with the plate slung between them, its ends
//   cut concave round them, the zone's ornament running out from each;
// • ribbon: the first ribbon, kept to compare;
// • banner: the banner's rules run in and rise into a pointed cartouche
//   round the name, which takes the kicker's line;
// • seal: a seal holding the sigil stamped on each rule beside the heading,
//   the name on the kicker's line.
// In each, the panel's ground is shaded as if sunk (lighter under its upper
// edge, falling to dark), and a shadow of fine lines under its upper lip
// stops short of the name. Coordinates are px in the head's box, y down.

import { seeded, type Pt } from './arcane.ts';

export type Variant = 'nameplate' | 'cartouche' | 'medallion' | 'ribbon' | 'banner' | 'seal';

/** Whether a design draws the banner's rules itself (so the banner's own give way while it shows). */
export const drawsRules = (v: Variant) => v === 'banner' || v === 'seal';

/** Where the head's parts lie, px from its top left. */
export type Head = {
  /** The head's size. */
  w: number;
  h: number;
  /** The middle of the kicker's (first) line. */
  ky: number;
  /** The top of the heading's capitals, and the height of its rules. */
  capTop: number;
  by: number;
  /** The heading's left and right. */
  hx0: number;
  hx1: number;
  /** The outer ends of the rules. */
  rl0: number;
  rr1: number;
  /** The name's size as set. */
  nameW: number;
  nameH: number;
};

/** main: the outer line; thin: a second line; hair: the finest; hatch: shading; shade: the panel's shadow lines. */
export type Kind = 'main' | 'thin' | 'hair' | 'hatch' | 'shade';
/** A piece of a line, with when the pen reaches it and how long it takes over it (s). */
export type Stroke = { d: string; kind: Kind; delay: number; t: number };
/** A seal: its centre and ring, when it is stamped in, and how finely it is cut (`fine`: with a glory round the sigil). */
export type Seal = { c: Pt; r: number; delay: number; fine?: boolean };
export type Box = { x0: number; y0: number; x1: number; y1: number };
export type Mark = {
  strokes: Stroke[];
  /** The same lines unbroken by wear, for the glow under them (no shading). */
  glow: { d: string; kind: Kind }[];
  seals: Seal[];
  /** The ground the name is set on, as path data (filled dark), and its bounds. */
  ground: string | null;
  body: Box | null;
  /** Without a ground (the seals), an oval of shadow under the name. */
  shade: { cx: number; cy: number; rx: number; ry: number } | null;
  /** Where the name's middle goes. */
  name: Pt;
  /** The box the mark's light and sparks come from (lib/fx/moments milestoneReached). */
  box: { x: number; y: number; w: number; h: number };
  /** The banner's own rules give way to the mark's. */
  rules: boolean;
  /** Where the zone's ornament (lib/zoneOrnaments) runs out from: `L` px long, within ±`s`. */
  ends: { at: Pt; dir: -1 | 1 }[];
  L: number;
  s: number;
};

type Hole = { c: Pt; r: number };
type Line = { pts: Pt[]; kind: Kind; delay: number; t: number; worn?: boolean; free?: boolean };

const f = (v: number) => v.toFixed(2);
const dist = (p: Pt, q: Pt) => Math.hypot(q[0] - p[0], q[1] - p[1]);

/** Path data through `pts`, leaving out points that lie on a straight run (the dense points cut lines are made of). */
function poly(pts: Pt[]) {
  const keep = pts.filter((p, i) => {
    if (i === 0 || i === pts.length - 1) return true;
    const [a, b] = [pts[i - 1], pts[i + 1]];
    return Math.abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) > 0.02;
  });
  return 'M' + keep.map(([x, y]) => `${f(x)} ${f(y)}`).join('L');
}

/** The polyline through `pts`, cut into points about `step` apart (so holes can be cut from it). */
function dense(pts: Pt[], step = 0.35): Pt[] {
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [p, q] = [pts[i - 1], pts[i]];
    const n = Math.max(1, Math.ceil(dist(p, q) / step));
    for (let k = 1; k <= n; k++) out.push([p[0] + ((q[0] - p[0]) * k) / n, p[1] + ((q[1] - p[1]) * k) / n]);
  }
  return out;
}

/** Points along the circle about `c` of radius `r`, from `a0` to `a1` degrees (0 to the right, clockwise on screen). */
function arcPts(c: Pt, r: number, a0: number, a1: number): Pt[] {
  const n = Math.max(4, Math.ceil((Math.abs(a1 - a0) * Math.PI * r) / 180 / 0.5));
  return Array.from({ length: n + 1 }, (_, k) => {
    const a = ((a0 + ((a1 - a0) * k) / n) * Math.PI) / 180;
    return [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)] as Pt;
  });
}

/** The plate's wear: a nick (0.5 to 0.9 px) every 120 px or so along a main line, from a fixed seed. */
function nicks(len: number, rnd: () => number): [number, number][] {
  return Array.from({ length: Math.round((len / 120) * (0.4 + rnd() * 1.2)) }, () => {
    const t = 0.15 + rnd() * 0.7;
    const w = (0.5 + rnd() * 0.4) / len;
    return [t - w / 2, t + w / 2];
  });
}

/**
 * A line drawn in one sweep of the pen, broken where it passes a hole or a
 * box (and, if worn, at its nicks): each piece starts when the pen reaches
 * it and takes as long as the pen does over it, the pen fast at first and
 * slowing at the end (as ArcaneCircle's stroke()).
 */
function pieces(l: Line, holes: Hole[], boxes: Box[], rnd: (() => number) | null): Stroke[] {
  const pts = dense(l.pts);
  const run = [0];
  for (let i = 1; i < pts.length; i++) run.push(run[i - 1] + dist(pts[i - 1], pts[i]));
  const len = run.at(-1)! || 1;
  const cuts = rnd ? nicks(len, rnd) : [];
  const out: { from: number; to: number; pts: Pt[] }[] = [];
  let cur: number[] = [];
  const flush = () => {
    if (cur.length > 1) out.push({ from: run[cur[0]] / len, to: run[cur.at(-1)!] / len, pts: cur.map((i) => pts[i]) });
    cur = [];
  };
  const blocked = (p: Pt) => holes.some((h) => dist(p, h.c) < h.r) || boxes.some((b) => p[0] > b.x0 && p[0] < b.x1 && p[1] > b.y0 && p[1] < b.y1);
  pts.forEach((p, i) => {
    const u = run[i] / len;
    if (blocked(p) || cuts.some(([a, b]) => u > a && u < b)) flush();
    else cur.push(i);
  });
  flush();
  const when = (y: number) => 1 - Math.sqrt(1 - Math.min(1, Math.max(0, y)));
  return out.map(({ from, to, pts }) => ({
    d: poly(pts),
    kind: l.kind,
    delay: l.delay + when(from) * l.t,
    t: Math.max(0.03 * l.t, (when(to) - when(from)) * l.t),
  }));
}

/** Hatching across the triangle `o`, `l`, `t`, parallel to its side `o`-`t`, `gap` apart (lib/arcane hatch()). */
function hatch(o: Pt, l: Pt, t: Pt, gap: number, delay: number): Line[] {
  const n = Math.floor(dist(o, l) / gap);
  const at = (p: Pt, q: Pt, s: number): Pt => [p[0] + (q[0] - p[0]) * s, p[1] + (q[1] - p[1]) * s];
  return Array.from({ length: n }, (_, i) => {
    const s = (i + 1) / (n + 1);
    return { pts: [at(o, l, s), at(t, l, s)], kind: 'hatch' as const, delay: delay + i * 0.03, t: 0.25 };
  });
}

/**
 * A pointed cartouche of height `H` about (`cx`, `cy`), `W` wide from point
 * to point, its ends cut at 45°: its outline `inset` in from the edge, as
 * four strokes running from the middle of its top and bottom out to its
 * points.
 */
function cartouche(cx: number, cy: number, W: number, H: number, inset: number): Pt[][] {
  const [x0, x1] = [cx - W / 2 + inset * Math.SQRT2, cx + W / 2 - inset * Math.SQRT2];
  const half = H / 2 - inset;
  return [-1, 1].flatMap((s) => {
    const tip: Pt = [s < 0 ? x0 : x1, cy];
    const corner = (v: number): Pt => [tip[0] - s * half, cy + v * half];
    // Each half starts a hair past the middle, so the two overlap there instead of leaving a seam.
    return [-1, 1].map((v) => [[cx - s * 0.3, cy + v * half], corner(v), tip] as Pt[]);
  });
}

/** The cartouche's outline as path data (its ground). */
function outline(cx: number, cy: number, W: number, H: number): string {
  const [x0, x1, h] = [cx - W / 2, cx + W / 2, H / 2];
  return `${poly([
    [x0, cy],
    [x0 + h, cy - h],
    [x1 - h, cy - h],
    [x1, cy],
    [x1 - h, cy + h],
    [x0 + h, cy + h],
  ])}Z`;
}

/**
 * A panel `x0`..`x1` by `y0`..`y1` with its corners notched by quarter
 * circles of radius `n` about them, its sides `d` in: as four strokes from
 * the middle of its top and bottom round the corners to the middle of its
 * ends (as the category cards' frames, lib/cardEngraving).
 */
function notched(x0: number, y0: number, x1: number, y1: number, n: number, d: number): Pt[][] {
  const [cx, cy] = [(x0 + x1) / 2, (y0 + y1) / 2];
  const s = Math.sqrt(n * n - d * d);
  return [-1, 1].flatMap((sx) =>
    [-1, 1].map((sy) => {
      const corner: Pt = [sx < 0 ? x0 : x1, sy < 0 ? y0 : y1];
      // The notch, about the corner: from where it meets the long side to where it meets the end.
      const a0 = (Math.atan2(sy * -d, -sx * s) * 180) / Math.PI;
      const a1 = (Math.atan2(-sy * s, sx * -d) * 180) / Math.PI;
      let [from, to] = [a0, a1];
      if (Math.abs(to - from) > 180) to += to < from ? 360 : -360;
      return [[cx - sx * 0.3, corner[1] - sy * d], ...arcPts(corner, n, from, to), [corner[0] - sx * d, cy]] as Pt[];
    }),
  );
}

/** The notched panel's outline as path data (its ground). */
function notchedOutline(x0: number, y0: number, x1: number, y1: number, n: number): string {
  const q = (c: Pt, a0: number, a1: number) => arcPts(c, n, a0, a1);
  const pts: Pt[] = [
    ...q([x0, y0], 90, 0),
    ...q([x1, y0], 180, 90),
    ...q([x1, y1], 270, 180),
    ...q([x0, y1], 360, 270),
  ];
  return `${poly(pts)}Z`;
}

/** A lozenge on a line, `a` along it and `b` across, upright: its outline and a stroke down its middle. */
function lozenge(c: Pt, a: number, b: number, delay: number): Line[] {
  return [
    { pts: [[c[0], c[1] - b], [c[0] + a, c[1]], [c[0], c[1] + b], [c[0] - a, c[1]], [c[0], c[1] - b]], kind: 'thin', delay, t: 0.3, free: true },
    { pts: [[c[0], c[1] - b + 1], [c[0], c[1] + b - 1]], kind: 'hatch', delay: delay + 0.2, t: 0.15, free: true },
  ];
}

/** The mark's height, for a name `nameH` tall. */
const sizeFor = (nameH: number) => Math.round(Math.max(22, nameH * 1.32));

/** Where the plate's middle sits: on the kicker's line, or a little above it where that would crowd the heading. */
const lineOf = (head: Head, H: number) => Math.min(head.ky, head.capTop - 6 - H / 2);

/**
 * The shadow under a panel's upper lip: two fine lines under its inner top
 * line, from `xa` to `xb`, which stop short of the name (in `boxes`).
 */
const lipShadow = (y: number, xa: number, xb: number): Line[] =>
  [0.8, 1.6].map((dy, i) => ({ pts: [[xa, y + dy], [xb, y + dy]] as Pt[], kind: 'shade' as const, delay: 0.4 + i * 0.08, t: 0.45 }));

export function layout(v: Variant, head: Head): Mark {
  const cx = head.w / 2;
  const H = sizeFor(head.nameH);
  const lines: Line[] = [];
  const holes: Hole[] = [];
  const seals: Seal[] = [];
  let ground: string | null = null;
  let body: Box | null = null;
  let shade: Mark['shade'] = null;
  let name: Pt = [cx, head.ky];
  let box = { x: cx - head.nameW / 2, y: head.ky - H / 2, w: head.nameW, h: H };
  let rules = false;
  let ends: Mark['ends'] = [];
  let L = 0;
  const cy = lineOf(head, H);
  /** The name as set, which the shadow lines stop short of. */
  // Its letters, that is: the line box less the space above the capitals.
  const nameBox: Box = { x0: cx - head.nameW / 2 - 3, y0: cy - head.nameH * 0.38, x1: cx + head.nameW / 2 + 3, y1: cy + head.nameH / 2 };
  /** The ornaments run out from `x` either side, as far as there is room. */
  const ornament = (half: number, x: number) => {
    L = Math.floor(Math.min(H * 2.2, (head.w - 2 * half) / 2 - 4));
    if (L >= 16) ends = [-1, 1].map((d) => ({ at: [cx + d * x, cy] as Pt, dir: d as -1 | 1 }));
    else L = 0;
  };
  /** The plate's light comes off its upper edge: the streak runs along the rule, not across the name. */
  const topEdge = (half: number) => ({ x: cx - half, y: cy - H / 2 - 1, w: 2 * half, h: 2 });

  if (v === 'nameplate') {
    // The seal, then a divider (two lines and a lozenge), then the name, from each end in.
    const rs = H / 2 - 4;
    const inset = 2.6;
    const sealX = inset + 1.6 + rs;
    const divX = sealX + rs + 3.4;
    const half = Math.min(head.w / 2 - 6, head.nameW / 2 + divX + 6);
    const [x0, x1, y0, y1] = [cx - half, cx + half, cy - H / 2, cy + H / 2];
    ground = notchedOutline(x0, y0, x1, y1, 3.4);
    body = { x0, y0, x1, y1 };
    const endHoles: Hole[] = [
      { c: [x0, cy], r: 3.4 },
      { c: [x1, cy], r: 3.4 },
    ];
    for (const pts of notched(x0, y0, x1, y1, 3.4, 0.5)) lines.push({ pts, kind: 'main', delay: 0.05, t: 0.6, worn: false });
    for (const pts of notched(x0, y0, x1, y1, 5.8, inset)) lines.push({ pts, kind: 'hair', delay: 0.18, t: 0.55 });
    holes.push(...endHoles);
    for (const s of [-1, 1]) {
      // Lozenges on the ends, where the ornaments run out.
      lines.push(...lozenge([cx + s * half, cy], 2.1, 3.2, 0.62));
      const c: Pt = [cx + s * (half - sealX), cy];
      seals.push({ c, r: rs, delay: 0.42 });
      holes.push({ c, r: rs + 1.2 });
      // The divider: a line and a hair beside it, broken by a lozenge.
      const dx = cx + s * (half - divX);
      const mid: Pt = [dx, cy];
      for (const [off, kind] of [
        [-s * 0.8, 'thin'],
        [s * 0.8, 'hair'],
      ] as const)
        lines.push({ pts: [[dx + off, y0 + inset + 1], [dx + off, y1 - inset - 1]], kind, delay: 0.4, t: 0.3 });
      holes.push({ c: mid, r: 3 });
      lines.push(...lozenge(mid, 1.8, 2.6, 0.5));
    }
    lines.push(...lipShadow(y0 + inset, cx - half + divX + 2.5, cx + half - divX - 2.5));
    name = [cx, cy];
    box = topEdge(half);
    ornament(half + 3.4, half + 2.2);
  } else if (v === 'cartouche') {
    // The seals nestled into the points; the bevels on the lower slants hatched.
    const rs = H / 2 - 4.2;
    const reach = H / 2 + 1 + rs + 7;
    const W = Math.min(head.w - 4, head.nameW + 2 * reach);
    ground = outline(cx, cy, W, H);
    body = { x0: cx - W / 2, y0: cy - H / 2, x1: cx + W / 2, y1: cy + H / 2 };
    for (const pts of cartouche(cx, cy, W, H, 0.5)) lines.push({ pts, kind: 'main', delay: 0.05, t: 0.6, worn: false });
    for (const pts of cartouche(cx, cy, W, H, 2.6)) lines.push({ pts, kind: 'hair', delay: 0.18, t: 0.55 });
    for (const s of [-1, 1]) {
      const c: Pt = [cx + s * (W / 2 - H / 2 - 1), cy];
      seals.push({ c, r: rs, delay: 0.42 });
      holes.push({ c, r: rs + 1.2 });
      // The lower slant's bevel, between the two lines, in strokes across it.
      const tip: Pt = [cx + (s * W) / 2, cy];
      const foot: Pt = [tip[0] - s * (H / 2), cy + H / 2];
      const n = Math.floor(dist(tip, foot) / 1.15);
      for (let i = 2; i < n - 1; i++) {
        const u = i / n;
        const p: Pt = [tip[0] + (foot[0] - tip[0]) * u, tip[1] + (foot[1] - tip[1]) * u];
        // Across the band: inward, perpendicular to the slant.
        const k = 1 / Math.SQRT2;
        lines.push({ pts: [[p[0] - s * 0.55 * k, p[1] - 0.55 * k], [p[0] - s * 2.1 * k, p[1] - 2.1 * k]], kind: 'hatch', delay: 0.5 + u * 0.2, t: 0.15 });
      }
    }
    lines.push(...lipShadow(cy - H / 2 + 2.6, cx - W / 2 + H / 2 + 2, cx + W / 2 - H / 2 - 2));
    name = [cx, cy];
    box = topEdge(W / 2 - H / 2);
    ornament(W / 2, W / 2);
  } else if (v === 'medallion') {
    // Seals larger than the plate is tall, the plate's ends cut concave round them.
    const rs = H / 2 + 2;
    const [R1, R2] = [rs + 2.2, rs + 4.4];
    const [h1, h2] = [H / 2 - 0.5, H / 2 - 2.6];
    const sep = Math.min(head.w / 2 - rs - 6, head.nameW / 2 + R2 + 5);
    const seal = (s: number): Pt => [cx + s * sep, cy];
    for (const s of [-1, 1]) {
      seals.push({ c: seal(s), r: rs, delay: 0.3, fine: true });
      for (const [R, h, kind, delay] of [
        [R1, h1, 'main', 0.05],
        [R2, h2, 'hair', 0.18],
      ] as const) {
        const cusp = Math.sqrt(R * R - h * h);
        // From the middle of the top (and bottom) out to the cusp, and round the seal to the middle of the end.
        const c = seal(s);
        const a = (Math.asin(h / R) * 180) / Math.PI;
        for (const v of [-1, 1]) {
          const start: Pt = [cx - s * 0.3, cy + v * h];
          const cuspPt: Pt = [c[0] - s * cusp, cy + v * h];
          // The arc on the plate's side of the seal, from the cusp to its middle.
          const facing = s < 0 ? 0 : 180;
          const arc = arcPts(c, R, facing + v * (s < 0 ? a : -a), facing);
          lines.push({ pts: [start, cuspPt, ...arc.slice(1)], kind, delay, t: kind === 'main' ? 0.6 : 0.55, worn: false });
        }
      }
    }
    // The ground: the top between the cusps, the concave ends, the bottom.
    const c1 = Math.sqrt(R1 * R1 - h1 * h1);
    const a1 = (Math.asin(h1 / R1) * 180) / Math.PI;
    const [l, r] = [seal(-1), seal(1)];
    ground = `${poly([
      [l[0] + c1, cy - h1],
      [r[0] - c1, cy - h1],
      ...arcPts(r, R1, 180 + a1, 180 - a1),
      [r[0] - c1, cy + h1],
      [l[0] + c1, cy + h1],
      ...arcPts(l, R1, a1, -a1),
    ])}Z`;
    body = { x0: l[0] + c1, y0: cy - H / 2, x1: r[0] - c1, y1: cy + H / 2 };
    // The shadow under the lip, from where each of its lines meets the inner arc.
    [0.8, 1.6].forEach((dy, i) => {
      const x = Math.sqrt(R2 * R2 - (h2 - dy) * (h2 - dy)) + 0.9;
      lines.push({ pts: [[l[0] + x, cy - h2 + dy], [r[0] - x, cy - h2 + dy]], kind: 'shade', delay: 0.4 + i * 0.08, t: 0.45 });
    });
    for (const c of [l, r]) holes.push({ c, r: rs + 1.6 });
    name = [cx, cy];
    box = topEdge(sep - c1);
    ornament(sep + rs, sep + rs + 1.8);
  } else if (v === 'ribbon') {
    // The first ribbon: the seals nestled into the points; the name between.
    const rs = H / 2 - 4.2;
    const reach = H / 2 + 1 + rs + 7;
    const W = Math.min(head.w - 4, head.nameW + 2 * reach);
    ground = outline(cx, cy, W, H);
    body = { x0: cx - W / 2, y0: cy - H / 2, x1: cx + W / 2, y1: cy + H / 2 };
    for (const pts of cartouche(cx, cy, W, H, 0.5)) lines.push({ pts, kind: 'main', delay: 0.05, t: 0.6, worn: true });
    for (const pts of cartouche(cx, cy, W, H, 2.6)) lines.push({ pts, kind: 'hair', delay: 0.2, t: 0.55 });
    for (const s of [-1, 1]) {
      const c: Pt = [cx + s * (W / 2 - H / 2 - 1), cy];
      seals.push({ c, r: rs, delay: 0.42 });
      holes.push({ c, r: rs + 1.3 });
    }
    name = [cx, cy];
    box = topEdge(W / 2 - H / 2);
    ornament(W / 2, W / 2);
  } else if (v === 'banner') {
    // The cartouche round the name, kept clear of the heading's capitals and
    // at least as wide as the heading, so its legs come down beside it.
    const W = Math.min(head.w - 4, Math.max(head.nameW + 2 * (H / 2 + 9), head.hx1 - head.hx0 + 14));
    ground = outline(cx, cy, W, H);
    body = { x0: cx - W / 2, y0: cy - H / 2, x1: cx + W / 2, y1: cy + H / 2 };
    const drop = head.by - cy;
    for (const s of [-1, 1]) {
      const tip: Pt = [cx + (s * W) / 2 - s * 0.5 * Math.SQRT2, cy];
      const corner = (v: number): Pt => [tip[0] - (s * (H - 1)) / 2, cy + (v * (H - 1)) / 2];
      const bend: Pt = [tip[0] + s * drop, head.by];
      const end: Pt = [s < 0 ? Math.min(head.rl0, bend[0]) : Math.max(head.rr1, bend[0]), head.by];
      // Over the top and down the leg to the rule, one line; the bottom edge to the point.
      lines.push({ pts: [[cx, cy - (H - 1) / 2], corner(-1), tip, bend, end], kind: 'main', delay: 0.05, t: 0.85, worn: true });
      lines.push({ pts: [[cx, cy + (H - 1) / 2], corner(1), tip], kind: 'main', delay: 0.05, t: 0.45, worn: true });
      // The wedge under each point, hatched parallel to the leg.
      const foot: Pt = [tip[0] + (s * (H - 1)) / 2, cy + (H - 1) / 2];
      lines.push(...hatch(tip, foot, corner(1), 1.7, 0.55));
    }
    for (const pts of cartouche(cx, cy, W, H, 2.6)) lines.push({ pts, kind: 'hair', delay: 0.2, t: 0.5 });
    name = [cx, cy];
    box = { x: cx - W / 2, y: cy - H / 2, w: W, h: H };
    rules = true;
  } else {
    // A seal on each rule beside the heading, the rule stopping short of it;
    // as large as the rules leave room for.
    const gap = 7;
    const room = Math.min(head.hx0 - head.rl0, head.rr1 - head.hx1) - gap;
    // Clear of the name above it.
    const rs = Math.floor(Math.min(head.nameH * 0.8, head.by - head.ky - head.nameH * 0.3, room / 2 - 2));
    if (rs >= 8) {
      for (const s of [-1, 1]) {
        const c: Pt = [s < 0 ? head.hx0 - gap - rs : head.hx1 + gap + rs, head.by];
        seals.push({ c, r: rs, delay: 0.25, fine: true });
        holes.push({ c, r: rs + 2.2 });
        // The rule, from the seal out to where the banner's ends.
        const end: Pt = [s < 0 ? head.rl0 : head.rr1, head.by];
        lines.push({ pts: [[c[0] - s * rs, head.by], end], kind: 'main', delay: 0.4, t: 0.7, worn: true });
      }
      rules = true;
    }
    name = [cx, head.ky];
    shade = { cx, cy: head.ky, rx: head.nameW / 2 + 28, ry: head.nameH * 0.85 };
    box = { x: cx - head.nameW / 2, y: head.ky - head.nameH / 2, w: head.nameW, h: head.nameH };
  }

  const rnd = seeded(7919);
  const cut = (l: Line) => (l.free ? [] : holes);
  const strokes = lines.flatMap((l) => pieces(l, cut(l), l.kind === 'shade' ? [nameBox] : [], l.worn ? rnd : null));
  const glow = lines.filter((l) => l.kind !== 'hatch' && l.kind !== 'shade').flatMap((l) => pieces(l, cut(l), [], null).map(({ d, kind }) => ({ d, kind })));
  return { strokes, glow, seals, ground, body, shade, name, box, rules, ends, L, s: H / 2 };
}

/**
 * Hatching of a crescent: inside the circle of radius `r` about the origin
 * but outside the same circle moved `shift` toward the light (the upper
 * left), in strokes at 45° `gap` apart: the shadow inside a ring, cut down
 * its far side.
 */
function crescent(r: number, shift: number, gap: number): string {
  const [ox, oy] = [-shift * Math.SQRT1_2, -shift * Math.SQRT1_2];
  const u: Pt = [Math.SQRT1_2, -Math.SQRT1_2];
  const nrm: Pt = [Math.SQRT1_2, Math.SQRT1_2];
  let out = '';
  for (let k = -r + gap / 2; k < r; k += gap) {
    const half = Math.sqrt(r * r - k * k);
    const base: Pt = [nrm[0] * k, nrm[1] * k];
    // The span of the moved circle along this stroke, if it meets it.
    const bx = base[0] - ox;
    const by = base[1] - oy;
    const b = bx * u[0] + by * u[1];
    const c = bx * bx + by * by - r * r;
    const disc = b * b - c;
    const spans: [number, number][] = disc > 0 ? [[-half, -b - Math.sqrt(disc)], [-b + Math.sqrt(disc), half]] : [[-half, half]];
    for (const [t0, t1] of spans) {
      const [a0, a1] = [Math.max(-half, t0) + 0.25, Math.min(half, t1) - 0.25];
      if (a1 - a0 < 0.5) continue;
      out += `M${f(base[0] + u[0] * a0)} ${f(base[1] + u[1] * a0)}L${f(base[0] + u[0] * a1)} ${f(base[1] + u[1] * a1)}`;
    }
  }
  return out;
}

/**
 * A seal's engraving for a ring of radius `r` about the origin: a ring and
 * a hair inside it, and inside that a crescent of hatching down the side
 * away from the light (the lower right; it falls from the upper left, as on
 * the cards), as if the seal were pressed in; a `fine` seal, large enough,
 * also holds an inner ring round the sigil and a glory of fine rays, long
 * and short in turn, between the two. The sigil (lib/zoneSigils) goes in at
 * `sigilScale`.
 */
export function sealArt(r: number, fine = false) {
  const inner = r - Math.max(1.2, r * 0.09);
  const glory = fine && r >= 12;
  const core = glory ? r * 0.6 : inner - 1.3;
  const shadow = crescent(inner - 0.5, glory ? 1.6 : 1.3, glory ? 0.85 : 0.8);
  let rays = '';
  if (glory) {
    const n = 32;
    for (let k = 0; k < n; k++) {
      const t = ((k + 0.5) / n) * 2 * Math.PI;
      const [r0, r1] = [core + 1, k % 2 ? inner - 2.4 : inner - 1];
      rays += `M${f(r0 * Math.sin(t))} ${f(-r0 * Math.cos(t))}L${f(r1 * Math.sin(t))} ${f(-r1 * Math.cos(t))}`;
    }
  }
  return { outer: r, inner, core: glory ? core : 0, shadow, rays, sigilScale: (core - (glory ? 1.2 : 0.6)) / 10 };
}
