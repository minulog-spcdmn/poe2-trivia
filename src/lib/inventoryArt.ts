// Delve's finds as small engravings (Inventory.svelte, the result line): an
// Azurite Ward as a crystal, a shard as the lower half of one broken across,
// a flare as a burst on a rod, dynamite as a banded stick with a lit fuse.
// Every line comes from the geometry below, shaded by hatching down one side
// (the left, away from the light), as docs/arcane-style.md asks. Each glyph is
// drawn in its own box, in units of about a pixel at the scoreboard's size.

import { arc, at, hatch, lerp, line, pt, type Pt } from './arcane.ts';
import type { Inventory } from './delve.ts';

/** A face of a glyph: its outline, and how it is lit (dark faces get hatched). */
export interface Face {
  d: string;
  tone: 'dark' | 'mid' | 'lit';
}

export interface Glyph {
  /** The SVG viewBox. */
  box: string;
  /** Width over height, for sizing it by its height. */
  aspect: number;
  faces: Face[];
  /** The outline, cut deepest. */
  rim: string;
  /** Edges between the faces. */
  edges: string;
  /** One-sided hatching. */
  hatch: string;
  /** A pale line where the light catches it. */
  catch: string;
}

const poly = (ps: Pt[]) => 'M' + ps.map(pt).join('L') + 'Z';
const open = (ps: Pt[]) => 'M' + ps.map(pt).join('L');

// ---- the crystal --------------------------------------------------------------

/** Half the crystal's width (a hexagonal prism seen face on), and the front face's half width. */
const R = 2.6;
const r = R / 2;
/** Where the prism meets its points, at the sides and (seen a little from above) at the front. */
const SHOULDER = -2.6;
const FOOT = 3.4;
const DIP = 0.7;
const TOP: Pt = [0, -6];
const BOTTOM: Pt = [0, 6];

/** The crystal's corners: the shoulders and feet, left to right (sides, then front). */
const sh = { L: [-R, SHOULDER] as Pt, l: [-r, SHOULDER + DIP] as Pt, rr: [r, SHOULDER + DIP] as Pt, R: [R, SHOULDER] as Pt };
const ft = { L: [-R, FOOT] as Pt, l: [-r, FOOT + DIP] as Pt, rr: [r, FOOT + DIP] as Pt, R: [R, FOOT] as Pt };

/** Horizontal-ish hatching across the quad from `a` down to `b` (left edge) and `c` down to `d` (right edge). */
function quadHatch(a: Pt, b: Pt, c: Pt, d: Pt, gap: number) {
  const n = Math.floor(Math.min(b[1] - a[1], d[1] - c[1]) / gap);
  let out = '';
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 1);
    out += line([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], [c[0] + (d[0] - c[0]) * t, c[1] + (d[1] - c[1]) * t]);
  }
  return out;
}

function crystal(): Glyph {
  const faces: Face[] = [
    // The point.
    { d: poly([TOP, sh.L, sh.l]), tone: 'dark' },
    { d: poly([TOP, sh.l, sh.rr]), tone: 'lit' },
    { d: poly([TOP, sh.rr, sh.R]), tone: 'mid' },
    // The prism.
    { d: poly([sh.L, sh.l, ft.l, ft.L]), tone: 'dark' },
    { d: poly([sh.l, sh.rr, ft.rr, ft.l]), tone: 'lit' },
    { d: poly([sh.rr, sh.R, ft.R, ft.rr]), tone: 'mid' },
    // The foot.
    { d: poly([ft.L, ft.l, BOTTOM]), tone: 'dark' },
    { d: poly([ft.l, ft.rr, BOTTOM]), tone: 'mid' },
    { d: poly([ft.rr, ft.R, BOTTOM]), tone: 'dark' },
  ];
  return {
    box: '-3.4 -6.8 6.8 13.6',
    aspect: 6.8 / 13.6,
    faces,
    rim: poly([TOP, sh.R, ft.R, BOTTOM, ft.L, sh.L]),
    edges:
      open([sh.L, sh.l, sh.rr, sh.R]) +
      open([ft.L, ft.l, ft.rr, ft.R]) +
      line(TOP, sh.l) +
      line(TOP, sh.rr) +
      line(sh.l, ft.l) +
      line(sh.rr, ft.rr) +
      line(ft.l, BOTTOM) +
      line(ft.rr, BOTTOM),
    // The shadowed side and its facet of the point, hatched across.
    hatch: quadHatch(sh.L, ft.L, sh.l, ft.l, 0.95) + hatch(sh.l, TOP, sh.L, 0.85),
    // The light catches the front face's right edge.
    catch: line([r - 0.35, SHOULDER + DIP + 0.6], [r - 0.35, FOOT + DIP - 0.8]),
  };
}

/**
 * Where a shard broke off, across the crystal from left to right: through
 * each corner of the prism in turn, jagged, so it reads as a break and not a
 * cut. Its points sit on the prism's edges (x = -R, -r, r, R) and between.
 */
const BREAK: Pt[] = [
  [-R, 2.3],
  [-r, 1.5],
  [0.15, 1.25],
  [r, 0.1],
  [R, -0.9],
];

function shard(): Glyph {
  const [b0, b1, b2, b3, b4] = BREAK;
  const faces: Face[] = [
    { d: poly([b0, b1, ft.l, ft.L]), tone: 'dark' },
    { d: poly([b1, b2, b3, ft.rr, ft.l]), tone: 'lit' },
    { d: poly([b3, b4, ft.R, ft.rr]), tone: 'mid' },
    { d: poly([ft.L, ft.l, BOTTOM]), tone: 'dark' },
    { d: poly([ft.l, ft.rr, BOTTOM]), tone: 'mid' },
    { d: poly([ft.rr, ft.R, BOTTOM]), tone: 'dark' },
  ];
  return {
    box: '-3.4 -1.6 6.8 8.4',
    aspect: 6.8 / 8.4,
    faces,
    rim: poly([...BREAK, ft.R, BOTTOM, ft.L]),
    edges: open([ft.L, ft.l, ft.rr, ft.R]) + line(b1, ft.l) + line(b3, ft.rr) + line(ft.l, BOTTOM) + line(ft.rr, BOTTOM),
    hatch: quadHatch(b0, ft.L, b1, ft.l, 0.95),
    catch: line([r - 0.35, 1.0], [r - 0.35, FOOT + DIP - 0.7]),
  };
}

// ---- the flare ---------------------------------------------------------------

/** The burst at the head of a flare, and the rod it sits on. */
const BURST: Pt = [0, -2.5];
const RAYS = 12;

function flare(): Glyph {
  // A rod that narrows to its foot, with a band at its head.
  const rod = { tl: [-0.95, 0.2] as Pt, tr: [0.95, 0.2] as Pt, bl: [-0.6, 6.2] as Pt, br: [0.6, 6.2] as Pt };
  const band = (y: number): [Pt, Pt] => {
    const t = (y - rod.tl[1]) / (rod.bl[1] - rod.tl[1]);
    return [
      [rod.tl[0] + (rod.bl[0] - rod.tl[0]) * t, y],
      [rod.tr[0] + (rod.br[0] - rod.tr[0]) * t, y],
    ];
  };
  // Rays long and short in turn, from just off the core, each a pointed ray with a ridge.
  let rays = '';
  let shade = '';
  for (let k = 0; k < RAYS; k++) {
    const a = (k / RAYS) * 360;
    const long = k % 2 === 0;
    const r1 = long ? 3.6 : 2.5;
    const half = long ? 11 : 8;
    const [l, rr, tip] = [at(BURST, a - half, 1.2), at(BURST, a + half, 1.2), at(BURST, a, r1)];
    // The rays below the head would run into the rod: they stop short of it.
    if (a > 150 && a < 210) continue;
    rays += line(l, tip) + line(rr, tip);
    if (long) shade += hatch(at(BURST, a, 1.2), l, tip, 0.45);
  }
  const [b1l, b1r] = band(1.3);
  const [b2l, b2r] = band(1.9);
  return {
    box: '-4 -6.4 8 13',
    aspect: 8 / 13,
    faces: [
      { d: poly([rod.tl, rod.tr, rod.br, rod.bl]), tone: 'mid' },
      { d: `M${pt([BURST[0] - 0.85, BURST[1]])}a0.85 0.85 0 1 0 1.7 0a0.85 0.85 0 1 0 -1.7 0Z`, tone: 'lit' },
    ],
    rim: poly([rod.tl, rod.tr, rod.br, rod.bl]) + arc(BURST, 0.85, 0, 360),
    edges: rays + line(b1l, b1r) + line(b2l, b2r),
    hatch: shade + hatch(rod.tl, rod.bl, [0, 0.2], 0.7),
    catch: line([0.45, 2.6], [0.32, 5.6]),
  };
}

// ---- dynamite ----------------------------------------------------------------

/** Half an ellipse across a cylinder at `y` (its near side), from left to right. */
const nearSide = (x0: number, x1: number, y: number, ry: number) => `M${pt([x0, y])}A${(x1 - x0) / 2} ${ry} 0 0 0 ${pt([x1, y])}`;

function dynamite(): Glyph {
  // A stick seen a little from above: its top an ellipse, its bands and foot curving round it.
  const [x0, x1, y0, y1, ry] = [-1.35, 1.35, -1.5, 6.0, 0.45];
  const cx = (x0 + x1) / 2;
  const shade = x0 + 0.75;
  const bands = [0.7, 1.2, 3.7, 4.2].map((y) => nearSide(x0, x1, y, ry)).join('');
  const top = `M${pt([x0, y0])}A${(x1 - x0) / 2} ${ry} 0 1 0 ${pt([x1, y0])}A${(x1 - x0) / 2} ${ry} 0 1 0 ${pt([x0, y0])}Z`;
  const body = `M${pt([x0, y0])}L${pt([x0, y1])}A${(x1 - x0) / 2} ${ry} 0 0 0 ${pt([x1, y1])}L${pt([x1, y0])}A${(x1 - x0) / 2} ${ry} 0 0 1 ${pt([x0, y0])}Z`;
  // The fuse curls up and over from the middle of the top, a spark at its end.
  const fuse = arc([cx + 1.4, y0], 1.4, 270, 360);
  const spark: Pt = [cx + 1.4, y0 - 1.4];
  // Eight rays, long and short in turn, standing off the fuse's end.
  const star = Array.from({ length: 8 }, (_, k) => line(at(spark, k * 45, 0.4), at(spark, k * 45, k % 2 ? 0.95 : 1.5))).join('');
  return {
    box: '-2.2 -4.8 5.6 11.6',
    aspect: 5.6 / 11.6,
    faces: [
      { d: body, tone: 'mid' },
      { d: poly([[x0, y0], [shade, y0 + ry * 0.75], [shade, y1 + ry * 0.75], [x0, y1]]), tone: 'dark' },
      { d: top, tone: 'lit' },
    ],
    rim: body + top,
    edges: bands + fuse + star,
    hatch: quadHatch([x0, y0 + 0.5], [x0, y1], [shade, y0 + ry * 0.75 + 0.5], [shade, y1 + ry * 0.75], 0.8),
    catch: line([x1 - 0.45, 1.75], [x1 - 0.45, 3.2]),
  };
}

export type GlyphKind = 'ward' | 'shard' | 'flare' | 'dynamite';

/** The glyphs, drawn once. */
export const GLYPHS: Record<GlyphKind, Glyph> = { ward: crystal(), shard: shard(), flare: flare(), dynamite: dynamite() };

/**
 * The crack a ward shatters along, as two clip polygons in the crystal's box
 * (left and right piece), for the pieces that fly apart.
 */
export const WARD_CRACK = (() => {
  const crack: Pt[] = [
    [0.4, -6.8],
    [-0.3, -2.4],
    [0.6, 0.4],
    [-0.4, 3.2],
    [0.2, 6.8],
  ];
  return {
    left: poly([[-3.4, -6.8], ...crack, [-3.4, 6.8]]),
    right: poly([...crack, [3.4, 6.8], [3.4, -6.8]]),
    line: open(crack.slice(1, -1)),
  };
})();

// ---- the casing: a ward on the phial -------------------------------------------

/*
 * An Azurite Ward is drawn on the phial itself (Phial.svelte), in the
 * phial's 64 x 12 units: a sleeve of crystal encasing one chamber. Above the
 * gold frame a lit band, below it a band hatched across, bevelled in to the
 * frame at each wall and following a pointed end round in two facets; over
 * the chamber's light a clear front face, its two long edges and a glaze
 * that thickens toward the frame. Wards encase the chambers from the base
 * (one each, up to three), and the outermost breaks first. A shard toward the
 * next ward is that casing's base half, broken off jagged.
 */

/** The phial's frame: its top and bottom, its middle, and the walls between chambers (Phial.svelte draws the same). */
const FRAME = { top: 0.6, bottom: 11.4, mid: 6, walls: [22.5, 41.5] };
/** Each chamber's ends: a wall's x, or the phial's pointed end. */
const CHAMBER_ENDS: [number | 'point', number | 'point'][] = [
  ['point', FRAME.walls[0]],
  [FRAME.walls[0], FRAME.walls[1]],
  [FRAME.walls[1], 'point'],
];
/** The pointed ends on the frame (tip, upper and lower corner), left and right. */
const POINTS = {
  left: { tip: [0.6, FRAME.mid] as Pt, top: [6.2, FRAME.top] as Pt, bot: [6.2, FRAME.bottom] as Pt },
  right: { tip: [63.4, FRAME.mid] as Pt, top: [57.8, FRAME.top] as Pt, bot: [57.8, FRAME.bottom] as Pt },
};
/** How far the casing stands off the frame, and how far short of a wall it stops (so two casings read as two). */
const STANDOFF = 2.2;
const WALL_GAP = 0.6;

/** Where the line through `p` along `u` meets the line through `q` along `v`. */
function meet(p: Pt, u: Pt, q: Pt, v: Pt): Pt {
  const t = ((q[0] - p[0]) * v[1] - (q[1] - p[1]) * v[0]) / (u[0] * v[1] - u[1] * v[0]);
  return [p[0] + u[0] * t, p[1] + u[1] * t];
}
/** The line from `a` to `b` moved `d` to its outer side (its left as drawn, clockwise round the frame). */
function outward(a: Pt, b: Pt, d: number): [Pt, Pt] {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n: Pt = [((b[1] - a[1]) / len) * d, (-(b[0] - a[0]) / len) * d];
  return [
    [a[0] + n[0], a[1] + n[1]],
    [b[0] + n[0], b[1] + n[1]],
  ];
}
const along = ([a, b]: [Pt, Pt]): Pt => [b[0] - a[0], b[1] - a[1]];

export interface Casing {
  faces: Face[];
  /** The outline, in gold. */
  rim: string;
  /** Edges where the bands bend round the frame. */
  edges: string;
  /** One-sided hatching across the lower band and the lower facet of a point. */
  hatch: string;
  /** A pale line where the light catches the front face. */
  catch: string;
  /** The chamber's hollow, which the glaze and the front's edges are clipped to. */
  hollow: string;
  /** The front face's long edges, across the light. */
  front: string;
  /** Where it is cut away (a shard: all but the base half; a breaking ward's piece: the other side of the crack). */
  clip?: string;
  /** A broken edge, cut bright. */
  crack?: string;
  /** How far along the phial it reaches, from its base end to its outer end (in units). */
  from: number;
  to: number;
}

function casing(k: number): Casing {
  const [le, re] = CHAMBER_ENDS[k];
  const { top, bottom, mid } = FRAME;
  const up = top - STANDOFF;
  const dn = bottom + STANDOFF;
  type End = { oTop: Pt; fTop: Pt; oBot: Pt; fBot: Pt; tip?: { o: Pt; f: Pt } };
  const end = (e: number | 'point', side: -1 | 1): End => {
    if (e === 'point') {
      const P = side < 0 ? POINTS.left : POINTS.right;
      // The slanted edges, moved out, meet the bands and each other.
      const sTop = side < 0 ? outward(P.tip, P.top, STANDOFF) : outward(P.top, P.tip, STANDOFF);
      const sBot = side < 0 ? outward(P.bot, P.tip, STANDOFF) : outward(P.tip, P.bot, STANDOFF);
      return {
        oTop: meet(sTop[0], along(sTop), [0, up], [1, 0]),
        fTop: P.top,
        oBot: meet(sBot[0], along(sBot), [0, dn], [1, 0]),
        fBot: P.bot,
        tip: { o: meet(sTop[0], along(sTop), sBot[0], along(sBot)), f: P.tip },
      };
    }
    const x = e - side * WALL_GAP;
    const bevel = STANDOFF * 0.8;
    return { oTop: [x - side * bevel, up], fTop: [x, top], oBot: [x - side * bevel, dn], fBot: [x, bottom] };
  };
  const L = end(le, -1);
  const R = end(re, 1);
  const faces: Face[] = [
    { d: poly([L.oTop, R.oTop, R.fTop, L.fTop]), tone: 'lit' },
    { d: poly([L.fBot, R.fBot, R.oBot, L.oBot]), tone: 'dark' },
  ];
  // The lower band, hatched across on a slant.
  let shade = '';
  const x0 = Math.max(L.oBot[0], L.fBot[0]);
  const x1 = Math.min(R.oBot[0], R.fBot[0]);
  for (let x = x0 + 0.7; x < x1 - 0.3; x += 1) shade += line([x, bottom + 0.4], [x - 1.1, dn - 0.3]);
  let edges = '';
  for (const E of [L, R]) {
    edges += line(E.oTop, E.fTop) + line(E.oBot, E.fBot);
    if (!E.tip) continue;
    faces.push({ d: poly([E.oTop, E.tip.o, E.tip.f, E.fTop]), tone: 'mid' });
    faces.push({ d: poly([E.tip.o, E.oBot, E.fBot, E.tip.f]), tone: 'dark' });
    edges += line(E.tip.o, E.tip.f);
    shade += hatch(E.tip.f, E.tip.o, E.fBot, 0.8);
  }
  // The hollow, as Phial.svelte's chambers sit in it.
  const inL = typeof le === 'number' ? le + WALL_GAP : 2.3;
  const inR = typeof re === 'number' ? re - WALL_GAP : 61.7;
  const hollow: Pt[] = typeof le === 'number' ? [[inL, 1.6], [inL, 10.4]] : [[6.9, 1.6], [2.3, mid], [6.9, 10.4]];
  hollow.push(...((typeof re === 'number' ? [[inR, 10.4], [inR, 1.6]] : [[57.1, 10.4], [61.7, mid], [57.1, 1.6]]) as Pt[]));
  const outline: Pt[] = [L.oTop, R.oTop, ...(R.tip ? [R.tip.o] : [R.fTop, R.fBot]), R.oBot, L.oBot, ...(L.tip ? [L.tip.o] : [L.fBot, L.fTop])];
  const span = inR - inL;
  return {
    faces,
    rim: poly(outline),
    edges,
    hatch: shade,
    catch: line([inL + span * 0.1, 2.5], [inR - span * 0.35, 2.5]),
    hollow: poly(hollow),
    front: line([0, 3.5], [64, 3.5]) + line([0, 8.5], [64, 8.5]),
    from: L.tip ? L.tip.o[0] : L.fTop[0],
    to: R.tip ? R.tip.o[0] : R.fTop[0],
  };
}

/** Points along a jagged break from `a` to `b`, swinging `swing` either side in turn at each of `n` steps. */
function jagged(a: Pt, b: Pt, n: number, swing: number): Pt[] {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const across: Pt = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
  // A fixed pattern of swings, so it reads as broken, not as a zigzag ruled by hand.
  const SW = [0.9, -0.6, 1, -0.8, 0.55, -1, 0.7];
  return Array.from({ length: n + 1 }, (_, i) => {
    const p = lerp(a, b, i / n);
    const w = i === 0 || i === n ? 0 : SW[i % SW.length] * swing;
    return [p[0] + across[0] * w, p[1] + across[1] * w] as Pt;
  });
}

/**
 * The casings, drawn once: for each chamber a whole ward, the shard (its base
 * half, broken off across the chamber), and the two pieces it breaks into
 * when it shatters (split along its length, so the bands burst off above and
 * below the light).
 */
export const CASINGS = [0, 1, 2].map((k) => {
  const whole = casing(k);
  const up = FRAME.top - STANDOFF - 0.6;
  const dn = FRAME.bottom + STANDOFF + 0.6;
  // The shard's break, a little past the chamber's middle.
  const m = (whole.from + whole.to) / 2;
  const brk = jagged([m + 0.6, up], [m - 0.2, dn], 5, 1);
  // The shatter's crack, along the casing from end to end.
  const crack = jagged([whole.from, FRAME.mid + 0.3], [whole.to, FRAME.mid - 0.3], 7, 1.1);
  const [a, z] = [whole.from - 4, whole.to + 4];
  const across = [[a, crack[0][1]], ...crack, [z, crack.at(-1)![1]]] as Pt[];
  return {
    whole,
    shard: { ...whole, clip: poly([[-4, up], ...brk, [-4, dn]]), crack: open(brk.slice(1, -1)) },
    pieces: [
      { ...whole, clip: poly([[a, up], ...across, [z, up]]), crack: open(crack) },
      { ...whole, clip: poly([[a, dn], ...across, [z, dn]]), crack: open(crack) },
    ] as [Casing, Casing],
  };
});

// ---- words -------------------------------------------------------------------

const many = (n: number, one: string, more: string) => `${n} ${n === 1 ? one : more}`;

/** What a player carries, in words: "1 Azurite Ward, 1 azurite shard, 2 flares". Empty for nothing. */
export function inventoryWords(inv: Inventory): string {
  const parts: string[] = [];
  if (inv.wards) parts.push(many(inv.wards, 'Azurite Ward', 'Azurite Wards'));
  if (inv.shards) parts.push(many(inv.shards, 'azurite shard', 'azurite shards'));
  if (inv.flares) parts.push(many(inv.flares, 'flare', 'flares'));
  if (inv.dynamite) parts.push(many(inv.dynamite, 'stick of dynamite', 'sticks of dynamite'));
  return parts.join(', ');
}

/** A phial's label: "2 lives left", or with what they carry, "2 lives, 1 Azurite Ward, 2 flares". */
export function vesselLabel(lives: number, inv: Inventory | null | undefined): string {
  const items = inv ? inventoryWords(inv) : '';
  return items ? `${many(lives, 'life', 'lives')}, ${items}` : `${many(lives, 'life', 'lives')} left`;
}

// ---- moments -----------------------------------------------------------------

/**
 * What just happened to a player's things, for the scoreboard to show: a ward
 * mined, forged from two shards or shattered in place of a life, a shard or a
 * flare found, a flare burning, dynamite found or lit. `key` tells one moment
 * from the next of the same kind.
 */
export interface InventoryMoment {
  kind: 'ward' | 'forge' | 'shatter' | 'shard' | 'flare' | 'burn' | 'dynamite' | 'blast';
  key: number;
  /** How many wards shatter at once (a cave-in breaks two); one if missing. */
  n?: number;
}

/** A change to one player's things (lib/delveSession.ts inventoryChanges). */
type Change = { item: keyof Inventory; change: 'gained' | 'used' };

/**
 * The moment a player's changes make, or null: a ward shattering before
 * anything else, then a ward forged (a shard used as a ward is gained), a ward
 * or shard mined, a flare or dynamite found, a flare burning, dynamite lit.
 */
export function momentOf(changes: Change[]): InventoryMoment['kind'] | null {
  const has = (item: keyof Inventory, change: Change['change']) => changes.some((c) => c.item === item && c.change === change);
  if (has('wards', 'used')) return 'shatter';
  if (has('wards', 'gained')) return has('shards', 'used') ? 'forge' : 'ward';
  if (has('shards', 'gained')) return 'shard';
  if (has('flares', 'gained')) return 'flare';
  if (has('dynamite', 'gained')) return 'dynamite';
  if (has('flares', 'used')) return 'burn';
  if (has('dynamite', 'used')) return 'blast';
  return null;
}
