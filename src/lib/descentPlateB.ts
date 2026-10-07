// Plate B of the descent (components/descent/PlateB.svelte): the world cut
// open under the sun, as an alchemist would draw it. Its strata are arcs of
// circles about one centre far below, ten of them for the zones, so each
// bows down a little more than the one above, and below the tenth the deep
// runs on toward that centre, without end. The player's deepest is the face
// they have dug to: above it the strata are open and named, below it solid
// rock. The key's words for the finds are here too, every number from the
// rules (lib/delve).
//
// Everything here is pure: lengths are in px of the drawing as shown, so
// its words keep their real size at every width. Depths in and out are the
// internal ones (1 at the start of a run) unless they say "shown".

import {
  DELVE_MAX_BLASTS,
  DELVE_MAX_DYNAMITE,
  DELVE_MAX_FLARES,
  DELVE_MAX_WARDS,
  DELVE_MIN_TIMER,
  FINDS,
  FIND_FADE_FROM,
  FLARE_MS,
  SHARDS_PER_WARD,
  delveTimer,
  findLosses,
  shownDepth,
  type FindKind,
} from './delve.ts';
import { STRATA, stratumName } from './descent.ts';
import { f, seeded, type Pt } from './arcane.ts';

/** Zones (each ten depths). */
export const ZONES = STRATA.length;
/** Depths in a zone. */
export const PER_ZONE = 10;
/** The first internal depth past the zones: the endless deep. */
export const DEEP_FROM = ZONES * PER_ZONE + 1;

/** A zone as the plate may show it once reached: its name and colour (the header's), and the shown depth it starts at. */
export const ZONE_INFO = STRATA.map((z, k) => ({
  name: z.name,
  color: `rgb(${z.look.accent.join(', ')})`,
  from: shownDepth(k * PER_ZONE + 1),
}));

/** Seconds on the clock at the first depth of zone `k` (k = ZONES: the deep). */
export const clockAt = (k: number) => delveTimer(k * PER_ZONE + 1);

/** The shown depth from which the clock is at its shortest. */
export const SHORTEST_FROM = (() => {
  let d = 1;
  while (delveTimer(d) > DELVE_MIN_TIMER) d++;
  return shownDepth(d);
})();

/** The finds that turn up, shallowest first, with the shown depth each starts at. */
export const FINDS_BY_DEPTH = FINDS.filter((x) => x.cap > 0)
  .map((x) => ({ kind: x.kind as FindKind, from: shownDepth(x.from), max: x.max }))
  .sort((a, b) => a.from - b.from);

/** The shown depth past which finds grow scarcer. */
export const FINDS_FADE = shownDepth(FIND_FADE_FROM + 1);

/** How many zones a player whose deepest is `deepest` has reached (entered): 0 before any run. */
export function zonesReached(deepest: number | null): number {
  if (deepest === null || !Number.isFinite(deepest) || deepest < 1) return 0;
  return Math.min(ZONES, Math.floor((Math.floor(deepest) - 1) / PER_ZONE) + 1);
}

/** Whether the deepest is past the zones, in the endless deep. */
export const inDeep = (deepest: number | null) => deepest !== null && Number.isFinite(deepest) && Math.floor(deepest) >= DEEP_FROM;

/**
 * Where the face sits, in "units" down from the surface: ten to a zone, and
 * -1 before any run (just above the surface). A depth sits inside its
 * zone's band, never on a line: the first depth of a zone `EDGE` units under
 * its top, the last `EDGE` above its bottom, so the first depth of a zone
 * can't be taken for the last of the one above. Past the zones, see deepShare.
 */
export const EDGE = 1.4;
export function unitsOf(deepest: number | null): number {
  if (deepest === null || !Number.isFinite(deepest) || deepest < 1) return -1;
  const d = Math.min(Math.floor(deepest), DEEP_FROM - 1);
  const k = Math.floor((d - 1) / PER_ZONE);
  const i = (d - 1) % PER_ZONE;
  return k * PER_ZONE + EDGE + (i * (PER_ZONE - 2 * EDGE)) / (PER_ZONE - 1);
}

/**
 * How far into the deep the deepest is, from 0 at its first depth toward 1,
 * ever more slowly, so 9999 still lands inside the drawing, below 999.
 * Null short of the deep.
 */
export function deepShare(deepest: number | null): number | null {
  if (!inDeep(deepest)) return null;
  return 1 - Math.exp(-(Math.floor(deepest!) - DEEP_FROM) / 150);
}

/** Where the deep's name (or its note, unreached) sits, and the face's reach in it: px under the deep's crown. */
export const DEEP_LABEL = 13;
export const DEEP_FACE: [number, number] = [23, 47];

/** How far under the surface's crown (px) the face of `deepest` sits in section `s`. */
export function faceDepth(s: Section, deepest: number | null): number {
  const share = deepShare(deepest);
  if (share === null) return unitsOf(deepest) * s.unit;
  return ZONES * PER_ZONE * s.unit + DEEP_FACE[0] + (DEEP_FACE[1] - DEEP_FACE[0]) * share;
}

/**
 * Every name the plate shows for `deepest`: the zones reached, then past the
 * zones the deepest's own stratum. Nothing unreached is ever named.
 */
export const namesOnPlate = (deepest: number | null): string[] => [
  ...ZONE_INFO.slice(0, zonesReached(deepest)).map((z) => z.name),
  ...(inDeep(deepest) ? [deepName(deepest)!] : []),
];

/** The name the deep shows for the deepest past the zones (its stratum's own, as the game announces it); null short of the deep. */
export const deepName = (deepest: number | null) => (inDeep(deepest) ? stratumName(Math.floor((Math.floor(deepest!) - 1) / PER_ZONE)) : null);

// ---- the drawing -------------------------------------------------------------

export interface Section {
  w: number;
  h: number;
  /** The section's walls (the strata run between them). */
  x0: number;
  x1: number;
  cx: number;
  /** The centre of every stratum's arc, far below. */
  cy: number;
  /** The surface's radius, and how much less each unit down is. */
  r0: number;
  unit: number;
  /** The surface's crown. */
  top: number;
}

/**
 * The section for a drawing `w` × `h`: the walls `left` and `right` in from
 * its sides, the surface's crown `top` down, the ten zones' bands under it,
 * and `deep` at the bottom for the endless deep, under the crown of the
 * tenth zone's floor. That floor bows down by `bow` of the half-width to
 * meet the walls; the arcs above it share its centre, so each bows a little
 * less than the one below.
 */
export function section(w: number, h: number, { left = 4, right = 4, top = 30, deep = 56, bow = 0.21 } = {}): Section {
  const [x0, x1] = [left, w - right];
  const half = (x1 - x0) / 2;
  const unit = (h - top - deep) / (ZONES * PER_ZONE);
  const sag = Math.min(deep - 8, bow * half);
  const floor = (half * half + sag * sag) / (2 * sag);
  const r0 = floor + ZONES * PER_ZONE * unit;
  return { w, h, x0, x1, cx: x0 + half, cy: top + r0, r0, unit, top };
}

/** The radius of the arc `u` units down. */
export const radiusAt = (s: Section, u: number) => s.r0 - u * s.unit;

/** The point on the arc `u` units down at `x`. */
export const pointAt = (s: Section, u: number, x: number): Pt => {
  const r = radiusAt(s, u);
  return [x, s.cy - Math.sqrt(Math.max(0, r * r - (x - s.cx) ** 2))];
};

/** The angle (degrees from straight up) at which the arc of radius `r` meets the walls. */
const wallAngle = (s: Section, r: number) => (Math.asin(Math.min(1, (s.x1 - s.cx) / r)) * 180) / Math.PI;

const polar = (s: Section, a: number, r: number): Pt => [s.cx + r * Math.sin((a * Math.PI) / 180), s.cy - r * Math.cos((a * Math.PI) / 180)];

/** An arc about the section's centre from angle `a0` to `a1`, as path data. */
const arcPath = (s: Section, r: number, a0: number, a1: number) => {
  const [p, q] = [polar(s, a0, r), polar(s, a1, r)];
  return `M${f(p[0])} ${f(p[1])}A${f(r)} ${f(r)} 0 0 1 ${f(q[0])} ${f(q[1])}`;
};

/** The arc `u` units down from wall to wall (a text path runs along it left to right). */
export const wallToWall = (s: Section, u: number) => {
  const r = radiusAt(s, u);
  const a = wallAngle(s, r);
  return { d: arcPath(s, r, -a, a), length: (2 * a * Math.PI * r) / 180 };
};

/**
 * A worn line along the arc `u` units down, wall to wall: pieces with the
 * share of the whole each starts and ends at, so the pen can sweep once
 * across the gaps. Nicks from a fixed seed, every 40 px or so.
 */
export function wornArc(s: Section, u: number, seed: number): { d: string; t0: number; t1: number }[] {
  const r = radiusAt(s, u);
  const a = wallAngle(s, r);
  const rnd = seeded(seed);
  const len = (2 * a * Math.PI * r) / 180;
  const nicks = Array.from({ length: Math.max(1, Math.round((len / 40) * (0.5 + rnd()))) }, () => {
    const t = 0.06 + rnd() * 0.88;
    const w = (0.6 + rnd() * 0.9) / len;
    return [t - w / 2, t + w / 2] as [number, number];
  }).sort((p, q) => p[0] - q[0]);
  const pieces: { d: string; t0: number; t1: number }[] = [];
  let from = 0;
  for (const [c0, c1] of [...nicks, [1, 1] as [number, number]]) {
    if (c0 > from + 1e-3) pieces.push({ d: arcPath(s, r, -a + 2 * a * from, -a + 2 * a * c0), t0: from, t1: c0 });
    from = Math.max(from, c1);
  }
  return pieces;
}

/**
 * The band of rock between the arcs `u0` and `u1` units down (u1 > u0), wall
 * to wall, closed: for a wash of colour or a clip.
 */
export function bandPath(s: Section, u0: number, u1: number): string {
  const [ra, rb] = [radiusAt(s, u0), radiusAt(s, u1)];
  const [aa, ab] = [wallAngle(s, ra), wallAngle(s, rb)];
  const [p, q] = [polar(s, -aa, ra), polar(s, aa, ra)];
  const [m, n] = [polar(s, ab, rb), polar(s, -ab, rb)];
  return `M${f(p[0])} ${f(p[1])}A${f(ra)} ${f(ra)} 0 0 1 ${f(q[0])} ${f(q[1])}L${f(m[0])} ${f(m[1])}A${f(rb)} ${f(rb)} 0 0 0 ${f(n[0])} ${f(n[1])}Z`;
}

/** Everything under the arc `u` units down, between the walls, to the bottom of the drawing (the rock not yet dug). */
export function belowPath(s: Section, u: number): string {
  const r = radiusAt(s, u);
  if (r <= 0) return '';
  const a = wallAngle(s, r);
  const [p, q] = [polar(s, -a, r), polar(s, a, r)];
  const bottom = s.h + 2;
  // Above the surface (before any run) the rock still starts at the surface.
  return `M${f(s.x0)} ${f(Math.min(p[1], bottom))}A${f(r)} ${f(r)} 0 0 1 ${f(s.x1)} ${f(Math.min(q[1], bottom))}L${f(s.x1)} ${f(bottom)}L${f(s.x0)} ${f(bottom)}Z`;
}

/** How far along the arc `u` units down, from the left wall, the point over `x` lies. */
export function alongAt(s: Section, u: number, x: number): number {
  const r = radiusAt(s, u);
  const a = Math.asin(Math.min(1, (s.x1 - s.cx) / r));
  return (Math.asin(Math.max(-1, Math.min(1, (x - s.cx) / r))) + a) * r;
}

/** The point at `along` px from the left wall on the arc `u` units down, and the arc's slope there (degrees). */
export function pointAlong(s: Section, u: number, along: number): { p: Pt; deg: number } {
  const r = radiusAt(s, u);
  const a = Math.asin(Math.min(1, (s.x1 - s.cx) / r));
  const th = along / r - a;
  return { p: [s.cx + r * Math.sin(th), s.cy - r * Math.cos(th)], deg: (th * 180) / Math.PI };
}

/**
 * Rock, as an engraver shades strata: under each floor, short strokes
 * pointing down at the centre, `gap` apart, over the top `share` of every
 * zone's band, so each reads as a ledge in shadow (clip it to the rock not
 * dug yet). Under the tenth floor, fine strokes run on toward the centre
 * for the deep, long and short in turn.
 */
export function rockHatch(s: Section, gap = 3, share = 0.42): { ledges: string; deep: string } {
  let ledges = '';
  for (let k = 0; k < ZONES; k++) {
    const r = radiusAt(s, k * PER_ZONE);
    const r1 = r - share * PER_ZONE * s.unit;
    const a = Math.asin(Math.min(1, (s.x1 - s.cx) / r));
    const n = Math.floor((2 * a * r) / gap);
    for (let i = 1; i < n; i++) {
      const th = -a + (i * 2 * a) / n;
      const [sn, cs] = [Math.sin(th), Math.cos(th)];
      // Kept inside the walls.
      const p: Pt = [s.cx + r * sn, s.cy - r * cs];
      const q: Pt = [s.cx + r1 * sn, s.cy - r1 * cs];
      if (q[0] < s.x0 + 0.5 || q[0] > s.x1 - 0.5) continue;
      ledges += `M${f(p[0])} ${f(p[1])}L${f(q[0])} ${f(q[1])}`;
    }
  }
  let deep = '';
  const r = radiusAt(s, ZONES * PER_ZONE);
  const a = Math.asin(Math.min(1, (s.x1 - s.cx) / r));
  const n = Math.floor((2 * a * r) / (gap * 1.6));
  for (let i = 1; i < n; i++) {
    const th = -a + (i * 2 * a) / n;
    const len = i % 2 ? 14 : 30;
    const [sn, cs] = [Math.sin(th), Math.cos(th)];
    const p: Pt = [s.cx + r * sn, s.cy - r * cs];
    const q: Pt = [s.cx + (r - len) * sn, s.cy - (r - len) * cs];
    deep += `M${f(p[0])} ${f(p[1])}L${f(q[0])} ${f(q[1])}`;
  }
  return { ledges, deep };
}

/**
 * The sun over the surface: a disc in a ring, sixteen rays long and short in
 * turn, and a glory of fine rays between them.
 */
export function sun(c: Pt, r = 4.6) {
  const ray = (a: number, r0: number, r1: number) => {
    const t = (a * Math.PI) / 180;
    return `M${f(c[0] + r0 * Math.sin(t))} ${f(c[1] - r0 * Math.cos(t))}L${f(c[0] + r1 * Math.sin(t))} ${f(c[1] - r1 * Math.cos(t))}`;
  };
  const rays = Array.from({ length: 16 }, (_, k) => ray(k * 22.5, r + 2.6, k % 2 ? r + 6.2 : r + 9.6)).join('');
  const glory = Array.from({ length: 16 }, (_, k) => ray(k * 22.5 + 11.25, r + 3.2, r + 7.6)).join('');
  return { r, ring: r + 1.4, rays, glory };
}

/** An eight-pointed star at `c`, its points long and short in turn: the face's mark. */
export function star(c: Pt, r: number): string {
  const pts = Array.from({ length: 16 }, (_, k) => {
    const a = (k * 22.5 * Math.PI) / 180;
    const rr = k % 4 === 0 ? r : k % 2 === 0 ? r * 0.62 : r * 0.26;
    return `${f(c[0] + rr * Math.sin(a))} ${f(c[1] - rr * Math.cos(a))}`;
  });
  return `M${pts.join('L')}Z`;
}

// ---- the key -------------------------------------------------------------

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const words = (n: number) => WORDS[n] ?? String(n);
const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${words(n)} times`);

/**
 * The finds as the plate's key tells them, each in its own words: its name,
 * what a right answer brings and what that does, then what it risks. Every
 * number comes from lib/delve.
 */
export const FIND_KEY: Record<FindKind, { name: string; gives: string; risk: string }> = {
  azurite: {
    name: 'Azurite Vein',
    gives: `Answer in the first half of the clock for a ward, which takes a lost life for you; later, a shard (${words(SHARDS_PER_WARD)} make a ward).`,
    risk: `A miss costs ${words(findLosses('azurite'))} lives.`,
  },
  dynamite: {
    name: 'Dynamite Cache',
    gives: `Dynamite blasts a question away for a new one at the same depth, ${times(DELVE_MAX_BLASTS)} a depth at most; when time runs out it goes off by itself, once any flare has burnt.`,
    risk: 'A miss blows up something you carry.',
  },
  flare: {
    name: 'Flare Cache',
    gives: `A flare burns when your time runs out: ${words(FLARE_MS / 1000)} seconds more.`,
    risk: 'Its question has less time.',
  },
};

/** The most of each item a player carries (the same for all three). */
export const CARRY = Math.min(DELVE_MAX_WARDS, DELVE_MAX_FLARES, DELVE_MAX_DYNAMITE);
