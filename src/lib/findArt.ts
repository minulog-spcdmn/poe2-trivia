// The art of Delve's special cards (ChooseCategory): an Azurite Vein, a Flare
// Cache, a Dynamite Cache and a card blasted open. Each is the ordinary card,
// its gold engraving, emblem and nameplate untouched, with its find grown into
// the window beside the pedestal, drawn the way the card is engraved (exact
// geometry, one-sided hatching, a fine dark outline) but in colour and lit
// from the upper left: a cluster of azurite breaking out of the frame, a
// signal flare burning on the floor with two more at its foot, a bundle of
// dynamite with its fuse lit. A card blasted open has its corner blown off,
// scorched, cracks running from the break.
//
// Everything is laid out in pixels for the card's measured size, as the
// engraving is (lib/cardEngraving: TALL, ROW), and comes back as SVG markup
// whose ids start with `uid`. Moving parts carry a class (glint, sweep,
// flame, ember, spark, spit, smoulder) that ChooseCategory animates with
// transform and opacity only.

import { at, f, lerp, pt, seeded, type Pt } from './arcane.ts';

export type FindArtKind = 'azurite' | 'flare' | 'dynamite' | 'blast';

export interface FindArt {
  /** <defs> content and the drawing, for an svg with viewBox 0 0 w h. */
  svg: string;
  /** A CSS clip-path for the card's face (the corner a blast took off), or null. */
  clip: string | null;
}

// ---- colour ------------------------------------------------------------------

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
/** The colour `t` of the way from `a` to `b`. */
const mix = (a: string, b: string, t: number) =>
  '#' +
  hex(a)
    .map((v, i) => Math.round(v + (hex(b)[i] - v) * Math.max(0, Math.min(1, t))))
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
/** A colour along a ramp of evenly spaced stops. */
const ramp = (stops: string[], t: number) => {
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  return mix(stops[i], stops[i + 1], x - i);
};

/** Where the light comes from: the upper left, as on the engraving's hatching. */
const LIGHT = (() => {
  const [x, y] = [-0.62, -0.78];
  const k = Math.hypot(x, y);
  return [x / k, y / k] as Pt;
})();
/** How much a surface facing `deg` (clockwise from the top) faces the light, from -1 to 1. */
const lit = (deg: number) => {
  const r = (deg * Math.PI) / 180;
  return Math.sin(r) * LIGHT[0] - Math.cos(r) * LIGHT[1];
};

// ---- the drawing ---------------------------------------------------------------

type Stop = [number, string, number?];

class Art {
  defs: string[] = [];
  out: string[] = [];
  private n = 0;
  readonly uid: string;
  constructor(uid: string) {
    this.uid = uid;
  }
  private id(name: string) {
    return `${this.uid}-${name}${this.n++}`;
  }
  private stops(s: Stop[]) {
    return s.map(([o, c, a = 1]) => `<stop offset="${f(o)}" stop-color="${c}"${a < 1 ? ` stop-opacity="${f(a)}"` : ''}/>`).join('');
  }
  /** A linear gradient from `p` to `q` (in the card's pixels). */
  linear(p: Pt, q: Pt, s: Stop[]) {
    const id = this.id('l');
    this.defs.push(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${f(p[0])}" y1="${f(p[1])}" x2="${f(q[0])}" y2="${f(q[1])}">${this.stops(s)}</linearGradient>`);
    return `url(#${id})`;
  }
  /** A radial gradient about `c`, squashed to `k` of its height. */
  radial(c: Pt, r: number, s: Stop[], k = 1) {
    const id = this.id('r');
    const squash = k === 1 ? '' : ` gradientTransform="translate(0 ${f(c[1] * (1 - k))}) scale(1 ${f(k)})"`;
    this.defs.push(`<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${f(c[0])}" cy="${f(c[1])}" r="${f(r)}"${squash}>${this.stops(s)}</radialGradient>`);
    return `url(#${id})`;
  }
  /** A clip path of `d`; returns its reference. */
  clip(d: string) {
    const id = this.id('c');
    this.defs.push(`<clipPath id="${id}"><path d="${d}"/></clipPath>`);
    return `url(#${id})`;
  }
  path(d: string, attrs: string) {
    if (d) this.out.push(`<path d="${d}" ${attrs}/>`);
  }
  raw(s: string) {
    this.out.push(s);
  }
  done(clip: string | null = null): FindArt {
    return { svg: `<defs>${this.defs.join('')}</defs>${this.out.join('')}`, clip };
  }
}

const poly = (ps: Pt[]) => `M${ps.map(pt).join('L')}Z`;
const seg = (p: Pt, q: Pt) => `M${pt(p)}L${pt(q)}`;
const circle = (c: Pt, r: number) => `M${pt([c[0] + r, c[1]])}A${f(r)} ${f(r)} 0 1 1 ${pt([c[0] - r, c[1]])}A${f(r)} ${f(r)} 0 1 1 ${pt([c[0] + r, c[1]])}Z`;
/** Degrees clockwise from the top, from `p` toward `q`. */
const heading = (p: Pt, q: Pt) => (Math.atan2(q[0] - p[0], p[1] - q[1]) * 180) / Math.PI;

/** A small star of light: four long fine points and four short ones, about `c`. */
const sparkle = (c: Pt, r: number) => {
  const pts: Pt[] = Array.from({ length: 16 }, (_, k) => at(c, k * 22.5, k % 4 === 0 ? r : k % 2 === 0 ? r * 0.38 : r * 0.1));
  return poly(pts);
};

/**
 * A glint: a sparkle on a tip that flares up now and then (the class
 * animates it; `delay` staggers them).
 */
function glint(a: Art, c: Pt, r: number, delay: number, cls = 'glint') {
  a.raw(`<g class="${cls}" style="transform-origin:${f(c[0])}px ${f(c[1])}px;animation-delay:${f(delay)}s"><path d="${sparkle(c, r)}" fill="#fff"/><path d="${circle(c, r * 0.16)}" fill="#fff"/></g>`);
}

// ---- azurite -------------------------------------------------------------------

/** The azurite's colours from shade to light: deep, body, light, and the ice of its tips. */
const AZ = {
  dark: ['#030a1c', '#0a2052', '#163f8a'],
  body: ['#0f2e6e', '#2a64c2', '#5f9ce8'],
  light: ['#4a86d8', '#a6d2ff', '#effaff'],
  line: '#030916',
};

/**
 * A hexagonal crystal from `b` toward `a` degrees, `len` long and `hw` half
 * wide: three faces down its length and three facets at its tip, each shaded
 * by how it faces the light, the darker side hatched, the ridge toward the
 * light caught in a highlight. Returns its outline (for a clip) and its tip.
 */
function crystal(art: Art, b: Pt, a: number, len: number, hw: number, rnd: () => number) {
  const across = [-1, -0.5, 0.5, 1];
  const e = across.map((t) => at(b, a + 90, t * hw));
  // The near edges' shoulders sit a little lower: the tip is seen from a little in front.
  const sh = [0.76, 0.69, 0.69, 0.76].map((s) => s * len);
  const top = e.map((p, i) => at(p, a, sh[i]));
  const apex = at(b, a, len);
  const tone = { left: 0.5 + 0.5 * lit(a - 90), right: 0.5 + 0.5 * lit(a + 90) };
  const face = (t: number, light = 0) => {
    const c = (k: number) => ramp([ramp(AZ.dark, k), ramp(AZ.body, k), ramp(AZ.light, k)], t + light);
    return art.linear(b, apex, [
      [0, c(0)],
      [0.62, c(0.55)],
      [1, c(1)],
    ]);
  };
  const sides = [
    { ps: [e[0], e[1], top[1], top[0]], t: tone.left * 0.9 },
    { ps: [e[1], e[2], top[2], top[1]], t: 0.42 },
    { ps: [e[2], e[3], top[3], top[2]], t: tone.right * 0.9 },
  ];
  const tips = [
    { ps: [top[0], top[1], apex], t: tone.left * 0.9 + 0.22 },
    { ps: [top[1], top[2], apex], t: 0.7 },
    { ps: [top[2], top[3], apex], t: tone.right * 0.9 + 0.12 },
  ];
  for (const s of [...sides, ...tips]) art.path(poly(s.ps), `fill="${face(s.t)}"`);
  // The darker long face hatched down its length, as the engraving shades.
  const dark = tone.left < tone.right ? 0 : 2;
  const [p0, p1, q0, q1] = [e[dark], e[dark + 1], top[dark], top[dark + 1]];
  let h = '';
  const n = Math.max(2, Math.floor(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) / 0.9));
  for (let i = 1; i < n; i++) {
    const s = i / n;
    h += seg(lerp(p0, p1, s), lerp(lerp(p0, p1, s), lerp(q0, q1, s), 0.92 - 0.25 * Math.abs(s - 0.5)));
  }
  art.path(h, `class="ln" stroke="${AZ.line}" stroke-width=".3" opacity=".55"`);
  // Inner cleavage on the broad face: faint light lines down its length.
  const cleave = Array.from({ length: 2 }, () => {
    const s = 0.25 + rnd() * 0.5;
    const [u, v] = [0.12 + rnd() * 0.2, 0.45 + rnd() * 0.2];
    const p = lerp(e[1], e[2], s);
    const q = lerp(top[1], top[2], s);
    return seg(lerp(p, q, u), lerp(p, q, v));
  }).join('');
  art.path(cleave, `class="ln" stroke="#d8eeff" stroke-width=".3" opacity=".35"`);
  // The outline, then the ridge toward the light in a highlight brightening to the tip.
  const outline = poly([e[0], top[0], apex, top[3], e[3]]);
  art.path(outline + seg(e[1], top[1]) + seg(e[2], top[2]) + seg(top[0], top[1]) + seg(top[1], top[2]) + seg(top[2], top[3]) + seg(top[1], apex) + seg(top[2], apex), `class="ln" fill="none" stroke="${AZ.line}" stroke-width=".55" stroke-linejoin="miter"`);
  const ridge = tone.left >= tone.right ? 1 : 2;
  const hi = art.linear(b, apex, [
    [0, '#ffffff', 0],
    [0.55, '#ffffff', 0.55],
    [1, '#ffffff', 0.95],
  ]);
  art.path(`M${pt(lerp(e[ridge], top[ridge], 0.2))}L${pt(top[ridge])}L${pt(apex)}`, `class="ln" fill="none" stroke="${hi}" stroke-width=".55"`);
  return { outline, apex };
}

/**
 * Rough stone the crystals break out of, about `c`: a chiselled lump in the
 * card's dark, outlined and hatched in its gold.
 */
function rock(art: Art, c: Pt, rx: number, ry: number, rnd: () => number, spin = 0) {
  const n = 9;
  const rim: Pt[] = Array.from({ length: n }, (_, k) => {
    const a = spin + (k / n) * 360 + (rnd() - 0.5) * 20;
    const r = 0.78 + rnd() * 0.3;
    const p = at([0, 0], a, r);
    return [c[0] + p[0] * rx, c[1] + p[1] * ry];
  });
  const d = poly(rim);
  art.path(d, `fill="${art.linear([c[0] - rx, c[1] - ry], [c[0] + rx, c[1] + ry], [
    [0, '#2c241e'],
    [0.45, '#15110d'],
    [1, '#040303'],
  ])}"`);
  // Its facets: lines from the rim to a point off its middle, toward the light.
  const mid: Pt = [c[0] - rx * 0.18, c[1] - ry * 0.22];
  art.path(rim.filter((_, k) => k % 2 === 0).map((p) => seg(lerp(p, mid, 0.08), lerp(p, mid, 0.7))).join(''), `class="ln" stroke="#c9a05a" stroke-width=".35" opacity=".45"`);
  // Hatched down its shaded side, clipped to it.
  let h = '';
  for (let x = -rx * 1.2; x < rx * 1.6; x += 1.15) h += seg([c[0] + x, c[1] - ry * 1.2], [c[0] + x - ry * 0.9, c[1] + ry * 1.2]);
  art.raw(`<g clip-path="${art.clip(d)}"><path d="${h}" class="ln" stroke="#c9a05a" stroke-width=".28" opacity=".4" clip-path="${art.clip(poly([mid, at(mid, 60, rx * 3), at(mid, 200, rx * 3)]))}"/></g>`);
  art.path(d, `class="ln" fill="none" stroke="#c9a05a" stroke-width=".5" opacity=".75"`);
}

/**
 * A seam of azurite through the card from `p` heading `a`: straight runs that
 * turn a little at each joint (from `rnd`, so every card is worked alike), a
 * sliver narrowing to nothing, glowing.
 */
function seam(art: Art, p: Pt, a: number, runs: number, step: number, width: number, rnd: () => number) {
  const pts: Pt[] = [p];
  let dir = a;
  for (let i = 0; i < runs; i++) {
    dir = a + Math.max(-35, Math.min(35, dir + (rnd() - 0.5) * 60 - a));
    pts.push(at(pts[i], dir, step * (0.7 + rnd() * 0.6)));
  }
  const half = (i: number) => (width / 2) * (1 - i / runs);
  const side = (turn: number) => pts.map((q, i) => at(q, (i < runs ? heading(q, pts[i + 1]) : dir) + turn, half(i)));
  const d = `M${side(-90).map(pt).join('L')}L${side(90).reverse().map(pt).join('L')}Z`;
  art.path(d, `class="ln" fill="#4f9cff" stroke="#4f9cff" stroke-width="2.6" stroke-linejoin="round" opacity=".28"`);
  art.path(d, `fill="#cfe8ff" class="ln" stroke="#030916" stroke-width=".35"`);
}

/** A cluster of crystals out of a rock: [heading, length, half width, step along the rock] each, drawn back to front. */
type Cluster = { b: Pt; spread: number; rock: [number, number]; crystals: [number, number, number, number][] };

function cluster(art: Art, c: Cluster, rnd: () => number) {
  const out: { outline: string; apex: Pt }[] = [];
  // A bloom of the azurite's light round the crystals, under them.
  const mark = art.out.length;
  for (const [a, len, hw, along] of c.crystals) out.push(crystal(art, at(c.b, c.spread, along), a, len, hw, rnd));
  art.out.splice(mark, 0, `<path d="${out.map((k) => k.outline).join('')}" fill="#3f8cff" stroke="#3f8cff" stroke-width="7" stroke-linejoin="round" opacity=".22"/>`);
  rock(art, c.b, c.rock[0], c.rock[1], rnd, c.spread);
  return out;
}

/** A light band that sweeps over `shapes` now and then (class sweep). */
function sweep(art: Art, shapes: string, box: [number, number, number, number], delay: number) {
  const [x0, y0, x1, y1] = box;
  const wdt = x1 - x0;
  const band = art.linear([x0, 0], [x0 + wdt * 0.35, 0], [
    [0, '#ffffff', 0],
    [0.5, '#e6f4ff', 0.75],
    [1, '#ffffff', 0],
  ]);
  art.raw(
    `<g clip-path="${art.clip(shapes)}"><rect class="sweep" style="--sweep:${f(wdt * 1.4)}px;animation-delay:${f(delay)}s" x="${f(x0 - wdt * 0.4)}" y="${f(y0)}" width="${f(wdt * 0.35)}" height="${f(y1 - y0)}" fill="${band}" transform="skewX(-18)" transform-origin="${f(x0)} ${f(y1)}"/></g>`,
  );
}

function veinTall(art: Art, w: number) {
  const rnd = seeded(20251005);
  const MID = w / 2;
  const ri = MID - 26;
  const floor = 227;
  // Light from the azurite, under it all.
  art.path(`M0 0H${f(w)}V298H0Z`, `fill="${art.radial([MID - ri + 8, 190], 110, [
    [0, '#3f8cff', 0.5],
    [0.45, '#2a6ad8', 0.18],
    [1, '#1a4aa8', 0],
  ])}"`);
  art.path(`M0 0H${f(w)}V298H0Z`, `fill="${art.radial([w - 10, 96], 78, [
    [0, '#4f9cff', 0.4],
    [1, '#1a4aa8', 0],
  ])}"`);
  // Seams of it through the frame, from one cluster toward the other.
  seam(art, [MID - ri + 6, floor - 4], 18, 5, 15, 2.4, rnd);
  seam(art, [MID - ri - 4, floor - 30], -6, 4, 16, 1.8, rnd);
  seam(art, [w - 12, 108], 196, 4, 14, 2, rnd);
  seam(art, [w - 6, 80], 330, 3, 12, 1.6, rnd);
  seam(art, [MID + ri, floor - 2], 250, 3, 12, 1.5, rnd);
  const big = cluster(
    art,
    {
      b: [MID - ri - 1, floor + 5],
      spread: 90,
      rock: [24, 9],
      crystals: [
        [78, 24, 4.6, 21],
        [-40, 30, 5.4, -15],
        [56, 42, 6.6, 15],
        [-16, 58, 8, -9],
        [30, 66, 8.4, 8],
        [6, 94, 10.6, 0],
      ],
    },
    rnd,
  );
  const high = cluster(
    art,
    {
      b: [w - 2, 100],
      spread: 180,
      rock: [11, 19],
      crystals: [
        [302, 24, 4.4, -12],
        [234, 30, 5, 12],
        [282, 36, 5.8, -6],
        [256, 50, 7.4, 2],
      ],
    },
    rnd,
  );
  const low = cluster(
    art,
    {
      b: [MID + ri - 2, floor + 4],
      spread: 90,
      rock: [14, 6],
      crystals: [
        [-62, 16, 3.4, -8],
        [-40, 19, 3.8, -2],
        [-20, 28, 4.6, 3],
      ],
    },
    rnd,
  );
  const all = [...big, ...high, ...low];
  sweep(art, all.map((k) => k.outline).join(''), [0, 0, w, 298], 0);
  glint(art, big.at(-1)!.apex, 8, 0.4);
  glint(art, high.at(-1)!.apex, 6, 2.1);
  glint(art, low.at(-1)!.apex, 4.5, 3.4);
  glint(art, big.at(-3)!.apex, 4.5, 4.6);
}

function veinRow(art: Art, w: number, h: number) {
  const rnd = seeded(20251005);
  art.path(`M0 0H${f(w)}V${f(h)}H0Z`, `fill="${art.radial([w - 24, h], 80, [
    [0, '#3f8cff', 0.4],
    [1, '#1a4aa8', 0],
  ])}"`);
  const main = cluster(
    art,
    {
      b: [w - 20, h + 3],
      spread: 90,
      rock: [20, 8],
      crystals: [
        [-74, 16, 3.4, -17],
        [36, 18, 3.6, 13],
        [-50, 30, 5, -11],
        [16, 34, 5.4, 7],
        [-28, 44, 6.4, -4],
        [-6, 58, 7.4, 2],
      ],
    },
    rnd,
  );
  const top = cluster(
    art,
    {
      b: [w - 2, 18],
      spread: 180,
      rock: [6, 11],
      crystals: [
        [292, 14, 3, -5],
        [250, 18, 3.6, 4],
        [270, 24, 4.4, 0],
      ],
    },
    rnd,
  );
  sweep(art, [...main, ...top].map((k) => k.outline).join(''), [w - 90, 0, w, h], 0);
  glint(art, main.at(-1)!.apex, 6, 0.4);
  glint(art, top.at(-1)!.apex, 4.5, 2.4);
  glint(art, main.at(-3)!.apex, 4, 3.6);
}

// ---- a cylinder, for flares and dynamite ---------------------------------------

/**
 * One band of a cylinder standing on `b` toward `a`, radius `r`, from `s0` to
 * `s1` along it, seen from a little above: its front bulges down at both
 * ends. Filled across its width from shade to light to shade.
 */
function band(art: Art, b: Pt, a: number, r: number, s0: number, s1: number, colours: [string, string, string, string], extra = '') {
  const [l0, r0, l1, r1] = [at(at(b, a, s0), a - 90, r), at(at(b, a, s0), a + 90, r), at(at(b, a, s1), a - 90, r), at(at(b, a, s1), a + 90, r)];
  const ry = r * 0.32;
  const front = (p: Pt, q: Pt) => {
    const m = lerp(p, q, 0.5);
    return at(m, a + 180, ry * 2);
  };
  const d = `M${pt(l0)}Q${pt(front(l0, r0))} ${pt(r0)}L${pt(r1)}Q${pt(front(l1, r1))} ${pt(l1)}Z`;
  const [shade, body, light, rim] = colours;
  art.path(
    d,
    `fill="${art.linear(at(at(b, a, s0), a - 90, r), at(at(b, a, s0), a + 90, r), [
      [0, rim],
      [0.12, shade],
      [0.32, light],
      [0.5, body],
      [0.86, shade],
      [1, rim],
    ])}" ${extra}`,
  );
  return { d, l0, r0, l1, r1, front: front(l1, r1), front0: front(l0, r0) };
}

/** The top of a cylinder band: an ellipse across it at `s`. */
function cap(art: Art, b: Pt, a: number, r: number, s: number, fill: string, stroke: string) {
  const c = at(b, a, s);
  const ry = r * 0.32;
  const d = `M${pt(at(c, a - 90, r))}A${f(r)} ${f(ry)} ${f(a)} 0 1 ${pt(at(c, a + 90, r))}A${f(r)} ${f(ry)} ${f(a)} 0 1 ${pt(at(c, a - 90, r))}Z`;
  art.path(d, `fill="${fill}" class="ln" stroke="${stroke}" stroke-width=".45"`);
  return c;
}

/** Lines across a cylinder band at `ss` (rings, seams), bulging to the front. */
function rings(b: Pt, a: number, r: number, ss: number[]) {
  const ry = r * 0.32;
  return ss
    .map((s) => {
      const c = at(b, a, s);
      const [l, rr] = [at(c, a - 90, r), at(c, a + 90, r)];
      return `M${pt(l)}Q${pt(at(c, a + 180, ry * 2))} ${pt(rr)}`;
    })
    .join('');
}

/** Engraver's shading down a cylinder's shaded side: lines along it, crowding to its edge. */
function shadeLines(b: Pt, a: number, r: number, s0: number, s1: number, from = 0.45) {
  let d = '';
  for (const t of [from, from + 0.18, from + 0.32, from + 0.42, from + 0.49].filter((t) => t < 0.97)) {
    const x = -r + 2 * r * (0.5 + t);
    if (x > r - 0.3) continue;
    d += seg(at(at(b, a, s0 + 0.8), a + 90, x), at(at(b, a, s1 - 0.8), a + 90, x));
  }
  return d;
}

// ---- flares --------------------------------------------------------------------

const BRASS: [string, string, string, string] = ['#6e4a1c', '#b88a3e', '#f6dfa0', '#2a1a08'];
const RED: [string, string, string, string] = ['#5c0f1c', '#b3243c', '#f0707f', '#24050b'];
const PAPER: [string, string, string, string] = ['#8c7558', '#d9c4a0', '#fff4dc', '#3a2e20'];

/** A teardrop flame on `c`, `wd` wide and `ht` tall, pointing up. */
const tongue = (c: Pt, wd: number, ht: number) => {
  const [x, y] = c;
  const r = wd / 2;
  return `M${f(x - r)} ${f(y)}C${f(x - r)} ${f(y - ht * 0.42)} ${f(x - r * 0.25)} ${f(y - ht * 0.66)} ${f(x)} ${f(y - ht)}C${f(x + r * 0.25)} ${f(y - ht * 0.66)} ${f(x + r)} ${f(y - ht * 0.42)} ${f(x + r)} ${f(y)}C${f(x + r)} ${f(y + r * 0.7)} ${f(x - r)} ${f(y + r * 0.7)} ${f(x - r)} ${f(y)}Z`;
};

/**
 * A signal flare standing on `b`, leaning `a` degrees, `k` times the tall
 * card's size: a brass foot, a red paper body wound and labelled, a brass
 * collar, and its head burning rose red, throwing light and embers.
 */
function flareStick(art: Art, b: Pt, a: number, k: number, burning: boolean) {
  const r = 6.2 * k;
  const S = (v: number) => v * k;
  // Its shadow on the floor.
  art.path(`M${pt([b[0] - r * 2.4, b[1]])}A${f(r * 2.6)} ${f(r * 0.55)} 0 1 0 ${pt([b[0] + r * 2.8, b[1]])}A${f(r * 2.6)} ${f(r * 0.55)} 0 1 0 ${pt([b[0] - r * 2.4, b[1]])}Z`, `fill="${art.radial([b[0] + r * 0.4, b[1]], r * 2.8, [
    [0, '#000', 0.7],
    [1, '#000', 0],
  ], 0.22)}"`);
  band(art, b, a, r + S(0.5), 0, S(10), BRASS);
  art.path(rings(b, a, r + S(0.5), [S(3.2), S(6.8)]), `class="ln" fill="none" stroke="#3a2408" stroke-width=".4"`);
  const body = band(art, b, a, r, S(10), S(48), RED);
  // The paper wound round it: a fine spiral, and its shaded side hatched.
  let wind = '';
  for (let s = S(11); s < S(47); s += S(2.6)) wind += seg(at(at(b, a, s), a - 90, r), at(at(b, a, s + S(3.4)), a + 90, r));
  art.raw(`<g clip-path="${art.clip(body.d)}"><path d="${wind}" class="ln" stroke="#3a0610" stroke-width=".3" opacity=".55"/><path d="${shadeLines(b, a, r, S(10), S(48))}" class="ln" stroke="#2a030a" stroke-width=".35" opacity=".6"/></g>`);
  // A paper label round it.
  band(art, b, a, r + S(0.15), S(22), S(31), PAPER);
  art.path(rings(b, a, r + S(0.15), [S(23.6), S(29.4)]), `class="ln" fill="none" stroke="#6a5234" stroke-width=".3"`);
  art.path(`M${pt(at(at(b, a, S(26.5)), a - 90, S(1.6)))}L${pt(at(b, a, S(27.9)))}L${pt(at(at(b, a, S(26.5)), a + 90, S(1.6)))}L${pt(at(b, a, S(25.1)))}Z`, `fill="#8a1a2c"`);
  band(art, b, a, r + S(0.35), S(48), S(52.5), BRASS);
  art.path(rings(b, a, r + S(0.35), [S(50.2)]), `class="ln" fill="none" stroke="#3a2408" stroke-width=".35"`);
  // The head: dark, charred where it burns.
  band(art, b, a, r - S(0.9), S(52.5), S(56), ['#1a1010', '#3a2a26', '#6a5550', '#050303']);
  const head = cap(art, b, a, r - S(0.9), S(56), burning ? art.radial(at(b, a, S(56)), r, [
    [0, '#fff6f0'],
    [0.45, '#ffb0bc'],
    [1, '#d02848'],
  ]) : '#2a1c18', burning ? '#ff8a9c' : '#0a0606');
  // The outline over it all.
  art.path(`M${pt(at(b, a - 90, r + S(0.5)))}L${pt(at(at(b, a, S(56)), a - 90, r - S(0.9)))}M${pt(at(b, a + 90, r + S(0.5)))}L${pt(at(at(b, a, S(56)), a + 90, r - S(0.9)))}`, `class="ln" fill="none" stroke="#1a0606" stroke-width=".3" opacity=".5"`);
  return head;
}

/** A flare lying on the floor from `p` (its foot) toward `q` (its head), unlit. */
function flareLying(art: Art, p: Pt, q: Pt, r: number) {
  const a = heading(p, q);
  const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
  band(art, p, a, r + 0.3, 0, len * 0.18, BRASS);
  band(art, p, a, r, len * 0.18, len * 0.82, RED);
  band(art, p, a, r + 0.1, len * 0.42, len * 0.56, PAPER);
  band(art, p, a, r + 0.2, len * 0.82, len * 0.9, BRASS);
  band(art, p, a, r - 0.6, len * 0.9, len, ['#1a1010', '#3a2a26', '#6a5550', '#050303']);
  cap(art, p, a, r - 0.6, len, '#2a1c18', '#0a0606');
}

/** The flame on a burning head at `c`, `k` times the tall card's size, with its light and embers. */
function flame(art: Art, c: Pt, k: number, light: number) {
  art.path(`M${f(c[0] - light)} ${f(c[1] - light)}h${f(light * 2)}v${f(light * 2)}h${f(-light * 2)}Z`, `class="flare-light" fill="${art.radial(c, light, [
    [0, '#ff4d6a', 0.55],
    [0.3, '#ff3a5c', 0.22],
    [1, '#ff2a50', 0],
  ])}"`);
  // Fine rays of its light, long and short in turn, as the engraving's glory.
  const rays = Array.from({ length: 16 }, (_, i) => {
    const a = i * 22.5 + 11.25;
    return seg(at(c, a, 9 * k), at(c, a, (i % 2 ? 16 : 26) * k));
  }).join('');
  art.path(rays, `class="ln rays" stroke="#ffc2cc" stroke-width=".35" opacity=".55"`);
  const base: Pt = [c[0], c[1] + 1.2 * k];
  art.raw(
    `<g class="flame" style="transform-origin:${f(base[0])}px ${f(base[1])}px">` +
      `<path d="${tongue(base, 15 * k, 40 * k)}" fill="${art.linear(base, [base[0], base[1] - 40 * k], [
        [0, '#ff9aac', 0.95],
        [0.35, '#ff3d5e', 0.85],
        [0.75, '#c8183c', 0.35],
        [1, '#a0102c', 0],
      ])}"/>` +
      `<path d="${tongue(base, 9 * k, 25 * k)}" fill="${art.linear(base, [base[0], base[1] - 25 * k], [
        [0, '#ffffff'],
        [0.4, '#ffd2da', 0.95],
        [1, '#ff6a84', 0],
      ])}"/>` +
      `<path d="${tongue([base[0], base[1] + 0.4 * k], 4.6 * k, 11 * k)}" fill="#fff"/>` +
      `</g>`,
  );
  // Embers rising off it.
  const rnd = seeded(77);
  for (let i = 0; i < 7; i++) {
    const p: Pt = [c[0] + (rnd() - 0.5) * 12 * k, c[1] - (14 + rnd() * 10) * k];
    const r = (0.55 + rnd() * 0.75) * k;
    art.raw(`<circle class="ember" cx="${f(p[0])}" cy="${f(p[1])}" r="${f(r)}" fill="${i % 3 ? '#ffd0d8' : '#fff4f6'}" style="--rise:${f(-(34 + rnd() * 30) * k)}px;--drift:${f((rnd() - 0.5) * 16 * k)}px;animation-delay:${f(-rnd() * 2.6)}s;animation-duration:${f(1.8 + rnd() * 1.4)}s"/>`);
  }
}

function flareTall(art: Art, w: number) {
  const x = 0.75 * w + 16;
  // Two more at its foot, then the one that burns.
  flareLying(art, [x - 28, 231], [x + 14, 225], 4);
  const head = flareStick(art, [x + 2, 229], 6, 1.3, true);
  flareLying(art, [x + 26, 232.5], [x - 8, 234.5], 3.8);
  flame(art, head, 1.3, 96);
}

function flareRow(art: Art, w: number, h: number) {
  const x = w - 30;
  flareLying(art, [x - 18, h - 9.5], [x + 10, h - 12.5], 2.6);
  const head = flareStick(art, [x + 1, h - 9], 4, 0.78, true);
  flareLying(art, [x + 16, h - 6], [x - 6, h - 4.5], 2.5);
  flame(art, head, 0.78, 58);
}

// ---- dynamite ------------------------------------------------------------------

const STICK: [string, string, string, string] = ['#6a160a', '#b8341c', '#f2825a', '#2a0603'];
const TWINE: [string, string, string, string] = ['#6a4a24', '#b08850', '#e8cc94', '#2a1a08'];

/**
 * A bundle of three sticks of dynamite standing on `b`, `k` times the tall
 * card's size, bound twice with twine, the middle one's fuse curling `side`
 * (-1 left, 1 right) up to a sputtering spark.
 */
function bundle(art: Art, b: Pt, a: number, k: number, side: number, fuseTo: Pt) {
  const r = 4.7 * k;
  const len = 54 * k;
  // Its shadow.
  art.path(circle([b[0] + r * 0.6, b[1]], r * 4), `fill="${art.radial([b[0] + r * 0.6, b[1]], r * 4, [
    [0, '#000', 0.7],
    [1, '#000', 0],
  ], 0.2)}"`);
  const feet: Pt[] = [-1, 1, 0].map((i) => at(b, a + 90, i * r * 1.86));
  const tops: Pt[] = [];
  feet.forEach((foot, i) => {
    const l = len - (i === 2 ? 0 : 3 * k);
    const s = band(art, foot, a, r, 0, l, STICK);
    // A seam down the paper, its shaded side hatched, and the paper's crimped end.
    art.raw(`<g clip-path="${art.clip(s.d)}"><path d="${shadeLines(foot, a, r, 0, l, 0.4)}" class="ln" stroke="#2a0603" stroke-width=".32" opacity=".7"/><path d="${seg(at(foot, a + 90, -r * 0.35), at(at(foot, a, l), a + 90, -r * 0.35))}" class="ln" stroke="#ffb090" stroke-width=".3" opacity=".35"/></g>`);
    const top = cap(art, foot, a, r, l, art.radial(at(foot, a, l), r, [
      [0, '#5a2a1a'],
      [0.3, '#c89a70'],
      [1, '#f0d6b0'],
    ]), '#3a1408');
    // The crimp of the paper round its end.
    art.path(
      Array.from({ length: 8 }, (_, j) => {
        const t = (j / 8) * 360;
        const [cx, cy] = top;
        const p = (rr: number): Pt => [cx + Math.cos((t * Math.PI) / 180) * rr, cy + Math.sin((t * Math.PI) / 180) * rr * 0.32];
        return seg(p(r * 0.35), p(r * 0.85));
      }).join(''),
      `class="ln" stroke="#6a3a20" stroke-width=".3" opacity=".7"`,
    );
    tops.push(top);
  });
  // Twine twice round the bundle.
  for (const t of [0.24, 0.7]) {
    const s0 = len * t;
    const wide = r * 2.86 + 0.6;
    const twine = band(art, b, a, wide, s0, s0 + 3.4 * k, TWINE);
    let twist = '';
    for (let x = -wide; x < wide; x += 1.3 * k) twist += seg(at(at(b, a, s0 + 0.3), a + 90, x), at(at(b, a, s0 + 3.4 * k - 0.3), a + 90, x + 1.6 * k));
    art.raw(`<g clip-path="${art.clip(twine.d)}"><path d="${twist}" class="ln" stroke="#4a2e10" stroke-width=".35" opacity=".75"/></g>`);
  }
  // The fuse, a braided cord curling up from the middle stick to its spark.
  const from = tops[2];
  const c1 = at(from, a, 14 * k);
  const c2: Pt = [fuseTo[0] - side * 16 * k, fuseTo[1] + 10 * k];
  const fuse = `M${pt(from)}C${pt(c1)} ${pt(c2)} ${pt(fuseTo)}`;
  art.path(fuse, `fill="none" stroke="#120a06" stroke-width="${f(1.9 * k)}" stroke-linecap="round"`);
  art.path(fuse, `fill="none" stroke="#7a5a38" stroke-width="${f(1.2 * k)}"`);
  art.path(fuse, `fill="none" stroke="#d8b888" stroke-width="${f(1.2 * k)}" stroke-dasharray="${f(0.5 * k)} ${f(1.1 * k)}"`);
  return fuseTo;
}

/** A fuse's spark at `c`, `k` times the tall card's size: a hot core, fine rays, a glow, and bits spitting off. */
function spark(art: Art, c: Pt, k: number, light: number) {
  art.path(`M${f(c[0] - light)} ${f(c[1] - light)}h${f(light * 2)}v${f(light * 2)}h${f(-light * 2)}Z`, `class="spark-light" fill="${art.radial(c, light, [
    [0, '#ff9a3a', 0.6],
    [0.3, '#ff7a1a', 0.2],
    [1, '#ff6a00', 0],
  ])}"`);
  art.path(circle(c, 1.6 * k), `fill="#1a0a04"`);
  const rays = Array.from({ length: 12 }, (_, i) => {
    const a = i * 30 + 8;
    return `M${pt(at(c, a - 7, 1.4 * k))}L${pt(at(c, a, (i % 2 ? 5 : 9) * k))}L${pt(at(c, a + 7, 1.4 * k))}Z`;
  }).join('');
  art.raw(`<g class="spark" style="transform-origin:${f(c[0])}px ${f(c[1])}px"><path d="${rays}" fill="#ffe2a8"/><path d="${circle(c, 2.1 * k)}" fill="#fff8e8"/></g>`);
  const rnd = seeded(13);
  for (let i = 0; i < 6; i++) {
    const a = rnd() * 360;
    const len = (2.5 + rnd() * 2.5) * k;
    const p = at(c, a, 3 * k);
    art.raw(`<path class="spit" d="${seg(p, at(p, a, len))}" stroke="#ffd890" stroke-width="${f(0.7 * k)}" stroke-linecap="round" style="--dx:${f(Math.sin((a * Math.PI) / 180) * 14 * k)}px;--dy:${f(-Math.cos((a * Math.PI) / 180) * 14 * k)}px;animation-delay:${f(-rnd() * 0.9)}s"/>`);
  }
}

function dynamiteTall(art: Art, w: number) {
  const x = 0.25 * w - 15;
  const end = bundle(art, [x + 2, 229], -3, 1.3, -1, [x - 6, 128]);
  spark(art, end, 1.3, 64);
}

function dynamiteRow(art: Art, w: number, h: number) {
  const x = w - 32;
  const end = bundle(art, [x, h - 8], -3, 0.76, 1, [x + 17, 20]);
  spark(art, end, 0.8, 34);
}

// ---- a card blasted open --------------------------------------------------------

/**
 * A jagged break across the corner at the top right, `k` of the tall card's
 * size: a curve bowing into the card, split again and again with each half
 * pushed in or out a little, as stone breaks.
 */
function breakLine(w: number, k: number, rnd: () => number): Pt[] {
  const [x0, y1] = [w - 54 * k, 68 * k];
  let pts: Pt[] = [
    [x0, 0],
    [w - 24 * k, 30 * k],
    [w, y1],
  ];
  for (let pass = 0; pass < 3; pass++) {
    const next: Pt[] = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const [p, q] = [pts[i - 1], pts[i]];
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const m = at(lerp(p, q, 0.35 + rnd() * 0.3), heading(p, q) + 90, (rnd() - 0.45) * len * 0.42);
      next.push(m, q);
    }
    pts = next;
  }
  return pts;
}

function cracks(art: Art, w: number, h: number, k: number) {
  const rnd = seeded(31);
  const edge = breakLine(w, k, rnd);
  const c: Pt = [w - 14 * k, 12 * k];
  // The scorch round the break, and a hot glow at it.
  art.path(`M0 0H${f(w)}V${f(h)}H0Z`, `fill="${art.radial(c, 130 * k, [
    [0, '#000', 0.95],
    [0.4, '#050201', 0.8],
    [0.7, '#140803', 0.35],
    [1, '#1a0a04', 0],
  ])}"`);
  art.path(`M0 0H${f(w)}V${f(h)}H0Z`, `class="smoulder" fill="${art.radial(c, 80 * k, [
    [0, '#ff7a2a', 0.5],
    [0.5, '#ff5a10', 0.16],
    [1, '#ff5a10', 0],
  ])}"`);
  // Cracks running into the card from the break: tapering slivers that turn a
  // little at each joint, glowing near the break, cold further in.
  let d = '';
  for (let i = 1; i < edge.length - 1; i += 1) {
    const p = edge[i];
    const dir = heading(c, p) + (rnd() - 0.5) * 30;
    const pts: Pt[] = [p];
    let a = dir;
    const runs = 2 + Math.floor(rnd() * (i % 2 ? 4 : 2));
    for (let j = 0; j < runs; j++) {
      a = dir + Math.max(-18, Math.min(18, a + (rnd() - 0.5) * 36 - dir));
      pts.push(at(pts[j], a, (10 + rnd() * 14) * k));
    }
    // A branch off the longer ones.
    const wid = (1.1 + rnd() * 0.9) * k;
    const side = (turn: number) => pts.map((q, j) => at(q, (j < runs ? heading(q, pts[j + 1]) : a) + turn, (wid / 2) * (1 - j / runs)));
    d += `M${side(-90).map(pt).join('L')}L${side(90).reverse().map(pt).join('L')}Z`;
    if (runs > 4) {
      const m = pts[2];
      const b = at(m, a + (rnd() < 0.5 ? -45 : 45), (8 + rnd() * 8) * k);
      const bw = wid * 0.35;
      const ah = heading(m, b);
      d += poly([at(m, ah - 90, bw), b, at(m, ah + 90, bw)]);
    }
  }
  const hot = art.radial(c, 100 * k, [
    [0, '#fff0c0'],
    [0.3, '#ff9a3a'],
    [0.45, '#a02a08'],
    [0.6, '#1a0603'],
    [1, '#050302'],
  ]);
  art.path(d, `fill="#000" class="ln" stroke="#000" stroke-width="${f(1.2 * k)}" stroke-linejoin="round" opacity=".6"`);
  art.path(d, `fill="${hot}"`);
  // The broken edge: charred just inside it, embers glowing along it.
  const line = `M${edge.map(pt).join('L')}`;
  art.path(line, `fill="none" stroke="#000" stroke-width="${f(12 * k)}" stroke-linejoin="round" opacity=".9"`);
  art.path(line, `class="smoulder" fill="none" stroke="#ff5a10" stroke-width="${f(4 * k)}" stroke-linejoin="round" opacity=".55"`);
  // The card's thickness, seen along the break: a lit bevel just inside it.
  const bevel = edge.map((p) => at(p, heading(p, c) + 180, 2.4 * k));
  art.path(`M${edge.map(pt).join('L')}L${bevel.reverse().map(pt).join('L')}Z`, `fill="${art.linear([w - 54 * k, 0], [w, 68 * k], [
    [0, '#6a4a2a'],
    [0.5, '#3a2614'],
    [1, '#1a0e06'],
  ])}"`);
  art.path(line, `fill="none" stroke="#ffb860" stroke-width="${f(0.9 * k)}" stroke-linejoin="round"`);
  for (let i = 1; i < edge.length - 1; i += 2) glint(art, edge[i], 3.4 * k, i * 0.6, 'glint ember-glint');
  // Embers drifting up off it.
  for (let i = 0; i < 6; i++) {
    const p = lerp(edge[1 + Math.floor(rnd() * (edge.length - 2))], c, 0.1);
    art.raw(`<circle class="ember" cx="${f(p[0])}" cy="${f(p[1] + 6 * k)}" r="${f((0.6 + rnd() * 0.7) * k)}" fill="#ffc070" style="--rise:${f(-(18 + rnd() * 26) * k)}px;--drift:${f(-(4 + rnd() * 14) * k)}px;animation-delay:${f(-rnd() * 2.6)}s;animation-duration:${f(1.6 + rnd() * 1.4)}s"/>`);
  }
  // The corner it took: a clip for the card's face (its border included, 1px
  // out), reaching well past the card elsewhere so its shadow and glow stay.
  const [first, last] = [edge[0], edge.at(-1)!];
  const x = (v: number) => `calc(100% - ${f(w - v)}px)`;
  return `polygon(-80px -80px, ${x(first[0])} -80px, ${edge.map(([ex, ey]) => `${x(ex)} ${f(ey + 1)}px`).join(', ')}, calc(100% + 80px) ${f(last[1] + 1)}px, calc(100% + 80px) calc(100% + 80px), -80px calc(100% + 80px))`;
}

// ---- all together ----------------------------------------------------------------

/** The art of a special card of kind `kind`, laid out for a card `w` by `h` (a row when wider than tall). */
export function findArt(kind: FindArtKind, w: number, h: number, uid: string): FindArt {
  const art = new Art(uid);
  const row = w > h;
  if (kind === 'azurite') row ? veinRow(art, w, h) : veinTall(art, w);
  else if (kind === 'flare') row ? flareRow(art, w, h) : flareTall(art, w);
  else if (kind === 'dynamite') row ? dynamiteRow(art, w, h) : dynamiteTall(art, w);
  else return art.done(cracks(art, w, h, row ? 0.62 : 1));
  return art.done();
}
