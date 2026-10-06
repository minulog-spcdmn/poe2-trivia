// Delve: the mark a new zone (or the last one standing, or a new best) leaves
// on the head of the stage, the kicker and the banner (Game.svelte), worked
// out from where they lie. Engraved as the alchemist's circle is
// (docs/arcane-style.md): exact geometry, lines that stop short of every
// seal, worn main lines over an unbroken glow, one-sided hatching, and an
// entrance in which the pen sweeps out from the middle. Pure: the component
// (ZoneMark.svelte) measures the head and draws what comes back. Three
// designs, of which the app uses one:
// • banner: the banner's rules run in and rise into a pointed cartouche
//   round the name, which takes the kicker's line; one engraved line;
// • ribbon: a slim pointed ribbon in the kicker's line, a seal holding the
//   biome's sigil in each end, the zone's ornament running out from its
//   points, the banner left as it is;
// • seal: a seal holding the sigil stamped on each rule beside the heading,
//   the name on the kicker's line.
// Coordinates are px in the head's box, y down.

import { seeded, type Pt } from './arcane.ts';

export type Variant = 'banner' | 'ribbon' | 'seal';

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

export type Kind = 'main' | 'hair' | 'hatch';
/** A piece of a line, with when the pen reaches it and how long it takes over it (s). */
export type Stroke = { d: string; kind: Kind; delay: number; t: number };
export type Seal = { c: Pt; r: number; delay: number };
export type Mark = {
  strokes: Stroke[];
  /** The same lines unbroken by wear, for the glow under them. */
  glow: { d: string; kind: Kind }[];
  seals: Seal[];
  /** The ground the name is set on: a polygon (filled dark), or an oval of shadow. */
  plate: Pt[] | null;
  shade: { cx: number; cy: number; rx: number; ry: number } | null;
  /** Where the name's middle goes. */
  name: Pt;
  /** The box the mark's light and sparks come from (lib/fx/moments milestoneReached). */
  box: { x: number; y: number; w: number; h: number };
  /** The banner's own rules give way to the mark's. */
  rules: boolean;
  /** Where the zone's ornament (lib/zoneOrnaments) runs out from its points: `L` px long, within ±`s`. */
  ends: { at: Pt; dir: -1 | 1 }[];
  L: number;
  s: number;
};

type Hole = { c: Pt; r: number };
type Line = { pts: Pt[]; kind: Kind; delay: number; t: number; worn?: boolean };

const f = (v: number) => v.toFixed(2);
const dist = (p: Pt, q: Pt) => Math.hypot(q[0] - p[0], q[1] - p[1]);
const poly = (pts: Pt[]) => 'M' + pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L');

/** The polyline through `pts`, cut into points about `step` apart (so holes can be cut from it). */
function dense(pts: Pt[], step = 0.4): Pt[] {
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [p, q] = [pts[i - 1], pts[i]];
    const n = Math.max(1, Math.ceil(dist(p, q) / step));
    for (let k = 1; k <= n; k++) out.push([p[0] + ((q[0] - p[0]) * k) / n, p[1] + ((q[1] - p[1]) * k) / n]);
  }
  return out;
}

/** The plate's wear: a nick (0.6 to 1.4 px) every 90 px or so along a main line, from a fixed seed. */
function nicks(len: number, rnd: () => number): [number, number][] {
  return Array.from({ length: Math.round((len / 90) * (0.4 + rnd() * 1.2)) }, () => {
    const t = 0.08 + rnd() * 0.84;
    const w = (0.6 + rnd() * 0.8) / len;
    return [t - w / 2, t + w / 2];
  });
}

/**
 * A line drawn in one sweep of the pen, broken where it passes a hole (and,
 * if worn, at its nicks): each piece starts when the pen reaches it and
 * takes as long as the pen does over it, the pen fast at first and slowing
 * at the end (as ArcaneCircle's stroke()).
 */
function pieces(l: Line, holes: Hole[], rnd: (() => number) | null): Stroke[] {
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
  pts.forEach((p, i) => {
    const u = run[i] / len;
    if (holes.some((h) => dist(p, h.c) < h.r) || cuts.some(([a, b]) => u > a && u < b)) flush();
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
    return [-1, 1].map((v) => [[cx, cy + v * half], corner(v), tip] as Pt[]);
  });
}

/** The cartouche's outline as a polygon (its ground). */
function outline(cx: number, cy: number, W: number, H: number): Pt[] {
  const [x0, x1, h] = [cx - W / 2, cx + W / 2, H / 2];
  return [
    [x0, cy],
    [x0 + h, cy - h],
    [x1 - h, cy - h],
    [x1, cy],
    [x1 - h, cy + h],
    [x0 + h, cy + h],
  ];
}

/** The mark's height and the space its name keeps from its ends, for a name `nameH` tall. */
const sizeFor = (nameH: number) => Math.round(Math.max(22, nameH * 1.32));

export function layout(v: Variant, head: Head): Mark {
  const cx = head.w / 2;
  const H = sizeFor(head.nameH);
  const lines: Line[] = [];
  const holes: Hole[] = [];
  const seals: Seal[] = [];
  let plate: Pt[] | null = null;
  let shade: Mark['shade'] = null;
  let name: Pt = [cx, head.ky];
  let box = { x: cx - head.nameW / 2, y: head.ky - H / 2, w: head.nameW, h: H };
  let rules = false;
  let ends: Mark['ends'] = [];
  let L = 0;

  if (v === 'ribbon') {
    // The seals sit in the ends, nestled into the points; the name between.
    const rs = H / 2 - 4.2;
    const reach = H / 2 + 1 + rs + 7;
    const W = Math.min(head.w - 4, head.nameW + 2 * reach);
    // On the kicker's line, or a little above it where that would crowd the heading.
    const cy = Math.min(head.ky, head.capTop - 6 - H / 2);
    plate = outline(cx, cy, W, H);
    for (const pts of cartouche(cx, cy, W, H, 0.5)) lines.push({ pts, kind: 'main', delay: 0.05, t: 0.6, worn: true });
    for (const pts of cartouche(cx, cy, W, H, 2.6)) lines.push({ pts, kind: 'hair', delay: 0.2, t: 0.55 });
    for (const s of [-1, 1]) {
      const c: Pt = [cx + s * (W / 2 - H / 2 - 1), cy];
      seals.push({ c, r: rs, delay: 0.42 });
      holes.push({ c, r: rs + 1.3 });
    }
    name = [cx, cy];
    // Its light comes off its upper edge: the streak runs along the rule, not across the name.
    box = { x: cx - W / 2, y: cy - H / 2 - 1, w: W, h: 2 };
    // The zone's ornament runs out from each point, as long as there is room.
    L = Math.floor(Math.min(H * 2.2, (head.w - W) / 2 - 4));
    if (L >= 16) ends = [-1, 1].map((d) => ({ at: [cx + (d * W) / 2, cy] as Pt, dir: d as -1 | 1 }));
    else L = 0;
  } else if (v === 'banner') {
    // The cartouche round the name, kept clear of the heading's capitals and
    // at least as wide as the heading, so its legs come down beside it.
    const cy = Math.min(head.ky, head.capTop - 6 - H / 2);
    const W = Math.min(head.w - 4, Math.max(head.nameW + 2 * (H / 2 + 9), head.hx1 - head.hx0 + 14));
    plate = outline(cx, cy, W, H);
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
        seals.push({ c, r: rs, delay: 0.25 });
        holes.push({ c, r: rs + 2.2 });
        // The rule, from the seal out to where the banner's ends.
        const end: Pt = [s < 0 ? head.rl0 : head.rr1, head.by];
        lines.push({ pts: [[c[0] - s * rs, head.by], end], kind: 'main', delay: 0.4, t: 0.7, worn: true });
      }
      rules = true;
    }
    shade = { cx, cy: head.ky, rx: head.nameW / 2 + 28, ry: head.nameH * 0.85 };
    box = { x: cx - head.nameW / 2, y: head.ky - head.nameH / 2, w: head.nameW, h: head.nameH };
  }

  const rnd = seeded(7919);
  const strokes = lines.flatMap((l) => pieces(l, l.kind === 'hatch' ? [] : holes, l.worn ? rnd : null));
  const glow = lines.filter((l) => l.kind !== 'hatch').flatMap((l) => pieces(l, holes, null).map(({ d, kind }) => ({ d, kind })));
  return { strokes, glow, seals, plate, shade, name, box, rules, ends, L, s: H / 2 };
}

/**
 * A seal's engraving for a ring of radius `r` about the origin: a double
 * ring, and a glory of fine rays, long and short in turn, from round the
 * sigil out to the inner ring. The sigil itself (lib/zoneSigils) goes in at
 * `sigilScale`.
 */
export function sealArt(r: number) {
  const inner = r - Math.max(1.3, r * 0.1);
  const sigilR = r * 0.56;
  const n = r >= 13 ? 24 : 0;
  let rays = '';
  for (let k = 0; k < n; k++) {
    const a = (k / n) * 2 * Math.PI;
    const [r0, r1] = [sigilR + 2.2, k % 2 ? inner - 2.6 : inner - 1.1];
    rays += `M${f(r0 * Math.sin(a))} ${f(-r0 * Math.cos(a))}L${f(r1 * Math.sin(a))} ${f(-r1 * Math.cos(a))}`;
  }
  return { outer: r, inner, rays, sigilScale: sigilR / 10 };
}
