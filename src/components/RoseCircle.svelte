<script module lang="ts">
  import { at as atAbout, f, hatch, joined, lerp, lineParts, pointedRay, pt, ringParts, seeded, wear, wovenPolygons, type Hole, type LineOpts, type Pt, type Wear } from '../lib/arcane';
  import { engrave, mapPath, stroke, turned, type Engraver, type Plate } from '../lib/engraver';
  import { inscribe } from '../lib/tongue';
  import type { StageLayer } from './ArcaneStage.svelte';
  import { whenIdle } from '../lib/idle';

  // The plate is built once, the first time a circle is mounted, or before
  // that in an idle moment after the page has loaded, so its geometry
  // never weighs on the page's first frames.
  let built: StageLayer[] | undefined;
  const build = (): StageLayer[] => {

    // The rose, a sibling of the rune circle (ArcaneCircle; see
    // docs/arcane-style.md): sub rosa, under the rose, the old sign of what is
    // kept secret. From the outside in, turning in layers:
    // • the band: the moon's eight phases in seals, full at the top and new at
    //   the bottom, waning down the right and waxing up the left, so light and
    //   dark lie unevenly round the circle; the script between them;
    // • a pentagram of double straps, a rose leaf up each of its points, and
    //   a thorned briar woven through it, over and under in turn; in the gap
    //   below, alone, the plate's one great seal, holding a key, which breaks
    //   the briar; in the other four gaps, beyond the briar, a rose opening,
    //   closed to full, round from the key;
    // • at the heart a Tudor rose hatched down one side, and a point at its
    //   centre.
    // Lines stop short of every seal and of every strand they pass under, and
    // carry the odd nick. It is set on the ArcaneStage, which turns, lights
    // and colours it.
    const O: Pt = [0, 0];
    /** The point at `a` degrees clockwise from the top, `r` from the centre. */
    const at = (a: number, r: number) => atAbout(O, a, r);
    const circle = (r: number) => `M0 ${f(-r)}A${f(r)} ${f(r)} 0 1 1 0 ${f(r)}A${f(r)} ${f(r)} 0 1 1 0 ${f(-r)}Z`;

    // ---- the band: the moon's phases ----------------------------------------
    const BAND_IN = 81;
    const BAND_OUT = 94;
    const BAND = (BAND_IN + BAND_OUT) / 2;
    const RIM = 97.5;
    const SEAL = 7.2;
    const MOON = 4.9;
    /**
     * The moon `lit` (0 new to 1 full), waxing (lit on the right) or waning
     * (on the left): her disc, the terminator (half an ellipse), and the dark
     * part hatched across up to it.
     */
    const moon = (lit: number, waxing: boolean) => {
      const r = MOON;
      // Where the terminator crosses the middle, as a share of the half-width, from the dark side's edge (-1) to the lit side's (1).
      const k = 1 - 2 * lit;
      const s = waxing ? 1 : -1;
      const term = lit > 0.01 && lit < 0.99 ? `M0 ${-r}A${f(Math.max(0.01, Math.abs(k) * r))} ${r} 0 0 ${(k > 0) === waxing ? 1 : 0} 0 ${r}` : '';
      let shade = '';
      for (let y = -r + 0.6; y < r - 0.3; y += 0.6) {
        const w = Math.sqrt(r * r - y * y);
        // The dark side runs from its edge (-s·w) to the terminator (s·k·w), inset from both.
        const [x0, x1] = [-w + 0.4, k * w - 0.4].map((x) => x * s).sort((a, b) => a - b);
        if (x1 - x0 > 0.3) shade += `M${f(x0)} ${f(y)}H${f(x1)}`;
      }
      return { outline: circle(r) + term, shade };
    };
    // Full at the top, waning round the right to new at the bottom, waxing up the left.
    const PHASES = [
      [1, false],
      [0.75, false],
      [0.5, false],
      [0.22, false],
      [0, true],
      [0.22, true],
      [0.5, true],
      [0.75, true],
    ] as const;
    const moons = PHASES.map(([lit, waxing], k) => ({ a: k * 45, c: at(k * 45, BAND), ...moon(lit, waxing) }));
    const bandHoles: Hole[] = moons.map(({ c }) => ({ c, r: SEAL + 1.2 }));
    const rnd = seeded(71);
    const SCRIPT = moons.flatMap(({ a }) => inscribe(a + 7.5, a + 45 - 7.5, BAND, rnd, 1.2));

    // ---- the pentagram, the briar and the key -------------------------------------
    const W = 0.8;
    const GAP = 0.7;
    // The points stop short of the band's ring and the full moon's seal: their outer edges meet beyond the point, by W / sin 18°.
    const R = BAND - SEAL - 1.2 - 1 - W / Math.sin(Math.PI / 10);
    // The briar: a stem woven through the star, over and under in turn with
    // its straps (drawn as a polygon of many short sides), thorned.
    const BRIAR = 52;
    const BRIAR_SIDES = 120;
    const star = wovenPolygons(
      [[0, 2, 4, 1, 3].map((k) => at(k * 72, R)), Array.from({ length: BRIAR_SIDES }, (_, k) => at((k / BRIAR_SIDES) * 360, BRIAR))],
      W,
      GAP,
    );
    /** Distance from `q` to the middle of the nearest strap of the star itself (not the briar). */
    const toStar = (q: Pt) =>
      Math.min(
        ...star.straps
          .filter((o) => o.poly === 0)
          .map(({ p, q: e }) => {
            const [dx, dy] = [e[0] - p[0], e[1] - p[1]];
            const t = Math.max(0, Math.min(1, ((q[0] - p[0]) * dx + (q[1] - p[1]) * dy) / (dx * dx + dy * dy)));
            return Math.hypot(q[0] - p[0] - dx * t, q[1] - p[1] - dy * t);
          }),
      );

    // The key, sub rosa: alone in the gap below the rose, in the plate's one
    // great seal, which breaks the briar.
    const KEY_SEAL = 15;
    const key = at(180, 62);
    const keyHole: Hole = { c: key, r: KEY_SEAL + 1.6 };
    /** Moves a path drawn about the origin to `c`, turned `a` degrees. */
    const placed = (d: string, c: Pt, a: number, k = 1) => {
      const turn = turned(a);
      return mapPath(d, (q) => {
        const [x, y] = turn([q[0] * k, q[1] * k]);
        return [c[0] + x, c[1] + y];
      }, a, k);
    };
    /**
     * The key, its bow out toward the band: a ring with a ring inside it and
     * four lobes standing on it; a double collar; a shaft of two lines, shaded
     * down its right; and a bit with two wards cut in it.
     */
    const KEY = (() => {
      const bow: Pt = [0, -7.4];
      const ring = (c: Pt, r: number) => `M${f(c[0])} ${f(c[1] - r)}A${f(r)} ${f(r)} 0 1 1 ${f(c[0])} ${f(c[1] + r)}A${f(r)} ${f(r)} 0 1 1 ${f(c[0])} ${f(c[1] - r)}Z`;
      const lobes = [0, 90, 180, 270].map((a) => joined(ringParts(atAbout(bow, a, 3.7), 1.35, { holes: [{ c: bow, r: 3.7 }] }))).join('');
      const lines =
        ring(bow, 3.7) + ring(bow, 1.9) + lobes + 'M-1.9 -2.9H1.9M-1.5 -2.1H1.5M-0.8 -2.1V9.6M0.8 -2.1V9.6M-0.8 9.6H0.8' + 'M0.8 4.9H4.9V6.4H3.6V7.3H4.9V8.4H3.6V9.6H0.8';
      let shade = '';
      for (let y = -1.6; y < 9.3; y += 0.55) shade += `M0.2 ${f(y)}H0.55`;
      for (let x = 1.35; x < 3.4; x += 0.55) shade += `M${f(x)} 5.4V9.1`;
      for (let k = 0; k < 4; k++) {
        // Each lobe shaded on its far side.
        const c = atAbout(bow, k * 90, 3.7);
        shade += `M${pt(atAbout(c, k * 90 + 50, 0.85))}L${pt(atAbout(c, k * 90 + 100, 0.85))}`;
      }
      // Grown to fill the seal.
      const k = 1.05;
      const fit = ([x, y]: Pt): Pt => [x * k, (y + 1.45) * k];
      return { lines: mapPath(lines, fit, 0, k), shade: mapPath(shade, fit, 0, k) };
    })();

    // ---- the leaves in the star's points ------------------------------------------
    // A rose leaf up each point: a lens of two arcs, a midrib, veins down one
    // side slanting toward its tip, passing under the briar.
    // Up the whole arm: from just clear of its inner wall (the strap across it)
    // to as near the point as the point leaves room, slender enough to stay
    // clear of the point's sides all the way.
    const LEAF = { from: R * Math.cos((2 * Math.PI) / 5) + W + GAP + 1.3, to: R - 6.5, sag: 3.6 };
    /** An arc as short straight pieces, so it can be cut like a line. */
    const arcPts = (c: Pt, r: number, a0: number, a1: number, n = 24) => Array.from({ length: n + 1 }, (_, i) => atAbout(c, a0 + ((a1 - a0) * i) / n, r));
    const cutPath = (pts: Pt[], opts: LineOpts) => pts.slice(1).map((q, i) => joined(lineParts(pts[i], q, opts))).join('');
    const leafOpts: LineOpts = { under: star.straps.filter((o) => o.poly === 1).map((o) => ({ p: o.p, q: o.q, w: W + GAP })) };
    const LEAVES = Array.from({ length: 5 }, (_, k) => {
      const a = k * 72;
      const base = at(a, LEAF.from);
      const len = LEAF.to - LEAF.from;
      const rho = (len * len) / 4 / (2 * LEAF.sag) + LEAF.sag / 2;
      const mid = at(a, (LEAF.from + LEAF.to) / 2);
      const [ux, uy] = at(a, 1);
      const [nx, ny] = [-uy, ux];
      // Each side's arc about a centre across the midrib.
      const half = (Math.asin(len / 2 / rho) * 180) / Math.PI;
      const sides = [1, -1].map((s) => {
        const c: Pt = [mid[0] - s * nx * (rho - LEAF.sag), mid[1] - s * ny * (rho - LEAF.sag)];
        const toward = (Math.atan2(s * nx, -s * ny) * 180) / Math.PI;
        return { c, pts: arcPts(c, rho, toward - half, toward + half) };
      });
      const outline = sides.map(({ pts }) => cutPath(pts, leafOpts)).join('');
      const slant = (42 * Math.PI) / 180;
      const [vx, vy] = [ux * Math.cos(slant) + nx * Math.sin(slant), uy * Math.cos(slant) + ny * Math.sin(slant)];
      const c = sides[0].c;
      const veins = Array.from({ length: Math.floor(len / 1.15) - 3 }, (_, i) => {
        const m = at(a, LEAF.from + 1.15 * (i + 2));
        const [fx, fy] = [m[0] - c[0], m[1] - c[1]];
        const b = fx * vx + fy * vy;
        const reach = -b + Math.sqrt(Math.max(0, b * b - (fx * fx + fy * fy - rho * rho))) - 0.45;
        return reach > 0.6 ? joined(lineParts([m[0] + vx * 0.35, m[1] + vy * 0.35], [m[0] + vx * reach, m[1] + vy * reach], leafOpts)) : '';
      }).join('');
      return { outline, rib: joined(lineParts(base, at(a, LEAF.to - 2.5), leafOpts)), veins };
    });

    // ---- the briar's thorns ----------------------------------------------------------
    // Hooked back along the stem, out and in in turn, none where the stem
    // passes a strap, a leaf or the key.
    const THORNS = (() => {
      let lines = '';
      let shade = '';
      for (let i = 0; i < 40; i++) {
        const a = (i + 0.5) * 9;
        const out = i % 2 === 0 ? 1 : -1;
        const r0 = BRIAR + out * (W + 0.1);
        const [b0, b1, tip] = [at(a - 1.2, r0), at(a + 1.2, r0), at(a - 3.2, r0 + out * 3.4)];
        const near = [b0, b1, tip].some((q) => toStar(q) < W + GAP + 0.6 || Math.hypot(q[0] - key[0], q[1] - key[1]) < keyHole.r + 0.4);
        const leaf = [0, 72, 144, 216, 288].some((x) => Math.abs(((a - x + 540) % 360) - 180) < 8);
        if (near || leaf) continue;
        lines += `M${pt(b0)}L${pt(tip)}L${pt(b1)}`;
        shade += hatch(lerp(b0, b1, 0.5), b1, tip, 0.5);
      }
      return { lines, shade };
    })();

    // ---- the rosebuds -----------------------------------------------------------------
    // In the four other gaps, beyond the briar, a rose in four stages of
    // opening, round from the key: closed, parting, half open, open. Each drawn
    // pointing out from the centre, on a short stem with two sepals.
    /** An arc from `p` to `q` bowed `sag` to its left (negative: its right). */
    const bow = (p: Pt, q: Pt, sag: number) => {
      const c = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const r = (c * c) / 4 / (2 * Math.abs(sag)) + Math.abs(sag) / 2;
      return `M${pt(p)}A${f(r)} ${f(r)} 0 0 ${sag > 0 ? 0 : 1} ${pt(q)}`;
    };
    /** How far out the flowers reach, their heads all ending at the same ring short of the band. */
    const BUD_REACH = 78.5;
    /** Strokes down the right half of a lens `w` wide from `top` to `bottom`. */
    const budShade = (w: number, top: number, bottom: number) => {
      const len = bottom - top;
      const rho = (len * len) / 4 / (2 * w) + w / 2;
      const cy = (top + bottom) / 2;
      let d = '';
      for (let x = 0.45; x < w - 0.4; x += 0.5) {
        const h = Math.sqrt(rho * rho - (x + rho - w) ** 2) - 0.4;
        if (h > 0.4) d += `M${f(x)} ${f(cy - h)}V${f(cy + h)}`;
      }
      return d;
    };
    /** A pair of shapes, the one drawn for the left (`m` and `s` turn it into the right). */
    const pair = (draw: (m: (p: Pt) => Pt, s: number) => string) => [-1, 1].map((s) => draw(([x, y]) => [s * x, y], -s)).join('');
    /** The sepals, `spread` (0 hugging the bud, 1 spread wide) out from the base. */
    const sepals = (spread: number) => pair((m) => `M${pt(m([-0.3, 3.4]))}L${pt(m([-2.2 - 1.6 * spread, -0.2 - 1.1 * spread]))}L${pt(m([-1.1 - 0.4 * spread, 2]))}`);
    // Each stage a little taller and further open than the one before.
    const BUDS = [
      // Closed: a small lens of petals wrapped tight, the edge of the outer one across it.
      {
        lines: bow([0, 3], [0, -4.4], 1.6) + bow([0, -4.4], [0, 3], 1.6) + bow([0, -4.4], [0.8, 2.5], 0.8),
        shade: budShade(1.6, -4.4, 3),
        sepals: sepals(0),
        k: 2.4,
        top: 4.4,
      },
      // Parting: taller, its outer petals just coming away at their tips.
      {
        lines: bow([0, 3], [0, -5.6], 1.8) + bow([0, -5.6], [0, 3], 1.8) + pair((m, s) => bow(m([-0.9, 2.6]), m([-2.2, -4.6]), s * 0.8)),
        shade: budShade(1.8, -5.6, 3),
        sepals: sepals(0.4),
        k: 2.45,
        top: 5.6,
      },
      // Half open: taller again, its outer petals standing apart, their tips only beginning to turn out.
      {
        lines:
          bow([0, 3], [0, -6.2], 1.7) +
          bow([0, -6.2], [0, 3], 1.7) +
          pair((m, s) => bow(m([-0.7, 2.8]), m([-3.7, -5.4]), s * 2) + bow(m([-3.7, -5.4]), m([-1.7, -3.4]), s * -0.6)),
        shade: budShade(1.7, -6.2, 3),
        sepals: sepals(0.75),
        k: 2.5,
        top: 6.2,
      },
      // Open, seen from the side as the others are: the cup's petals spread
      // wide, a pair below them turned back, the stamens standing where the
      // bud was, and the sepals bent down where the stem joins.
      (() => {
        const lines = pair(
          (m, s) =>
            // The cup's petal, out and up, its tip curling out.
            bow(m([-0.6, 3]), m([-5.4, -3.2]), s * 2.3) +
            bow(m([-5.4, -3.2]), m([-1.5, -1.1]), s * -1) +
            // The petal below, turned back.
            bow(m([-0.9, 3.3]), m([-6.6, 2]), s * -1.2) +
            bow(m([-6.6, 2]), m([-2.6, 2.7]), s * 0.5),
        );
        const anther = (q: Pt) => `M${f(q[0])} ${f(q[1] - 0.4)}A0.4 0.4 0 1 1 ${f(q[0])} ${f(q[1] + 0.4)}A0.4 0.4 0 1 1 ${f(q[0])} ${f(q[1] - 0.4)}Z`;
        const stamens = ([[0, -4.6], [-1.6, -3.7], [1.6, -3.7]] as Pt[]).map((q) => `M0 1.8L${f(q[0])} ${f(q[1] + 0.4)}` + anther(q)).join('');
        // Shaded: the right petal of the cup, across its inside.
        let shade = '';
        for (let t = 0.15; t < 0.8; t += 0.12) {
          const [x, y] = [0.9 + 3.2 * t, 2.2 - 4.4 * t];
          shade += `M${f(x)} ${f(y)}L${f(x + 1.2 * (1 - t))} ${f(y + 0.9 * (1 - t))}`;
        }
        return { lines: lines + stamens, shade, sepals: 'M-0.35 3.4L-3.9 4.5L-1.5 2.9M0.35 3.4L3.9 4.5L1.5 2.9', k: 1.85, top: 5 };
      })(),
    ];
    // Each on a stem down to the briar.
    // Each grown to fill its gap, its head ending at the same ring.
    const buds = [252, 324, 36, 108].map((a, n) => {
      const bud = { base: 3.4, ...BUDS[n] };
      const r = BUD_REACH - bud.top * bud.k;
      const foot = BRIAR + W + 0.6;
      const root = r - bud.base * bud.k;
      return { a, c: at(a, r), stem: `M${pt(at(a, root))}L${pt(at(a, foot))}`, pivot: at(a, foot), ...bud };
    });

    // ---- the rose ---------------------------------------------------------------
    // A Tudor rose: two rows of five petals, each row's outline the round
    // petals' union, the inner row half a step round and over the outer; at
    // the centre a disc set with seeds. Each petal hatched down one side,
    // along its axis; five small sepals behind, between the outer petals.
    const K = 1.2;
    const PETALS = [
      { d: 8.4 * K, r: 7.9 * K, turn: 36 },
      { d: 4.6 * K, r: 4.85 * K, turn: 0 },
    ].map(({ d, r, turn }) => Array.from({ length: 5 }, (_, k) => ({ a: k * 72 + turn, c: at(k * 72 + turn, d), r })));
    const DISC = 3.3 * K;
    const PETAL_GAP = 0.6;
    const discHole: Hole = { c: O, r: DISC + PETAL_GAP };
    /** What petal `k` of `row` is drawn round: the rest of its row (its outline the row's union), the row over it, the disc. */
    const over = (row: number, k: number, gap: number): Hole[] => [
      ...PETALS[row].filter((_, j) => j !== k).map((p) => ({ c: p.c, r: p.r - gap })),
      ...(row === 0 ? PETALS[1].map((p) => ({ c: p.c, r: p.r + PETAL_GAP })) : []),
      discHole,
    ];
    const petals = PETALS.flatMap((row, i) =>
      row.map((p, k) => {
        const holes = over(i, k, 0);
        const inside = over(i, k, -PETAL_GAP);
        // Hatched down one side: chords along the petal's axis, inset from its edge.
        const [ax, ay] = at(p.a, 1);
        const [nx, ny] = [-ay, ax];
        const inset = p.r - 0.6;
        const gap = i ? 0.5 : 0.6;
        const shade = Array.from({ length: Math.floor(inset / gap) - 1 }, (_, n) => {
          const u = gap * (n + 1);
          const h = Math.sqrt(inset * inset - u * u);
          const m: Pt = [p.c[0] + nx * u, p.c[1] + ny * u];
          return joined(lineParts([m[0] - ax * h, m[1] - ay * h], [m[0] + ax * h, m[1] + ay * h], { holes: inside }));
        }).join('');
        return { row: i, p, holes, shade };
      }),
    );
    const SEEDS = Array.from({ length: 8 }, (_, k) => {
      const [x, y] = at(k * 45 + 22.5, 1.95 * K);
      const s = 0.42 * K;
      return `M${f(x)} ${f(y - s)}A${f(s)} ${f(s)} 0 1 1 ${f(x)} ${f(y + s)}A${f(s)} ${f(s)} 0 1 1 ${f(x)} ${f(y - s)}Z`;
    }).join('');
    const petalHoles: Hole[] = PETALS[0].map((p) => ({ c: p.c, r: p.r + PETAL_GAP }));
    // The heart's ring fits the pentagram's inner pentagon, clear of its straps.
    const HEART = R * Math.cos((2 * Math.PI) / 5) - W - GAP - 0.8;
    const CALYX = Array.from({ length: 5 }, (_, k) => pointedRay(O, k * 72, 8 * K, HEART - 2.2, 9, 0.5, { holes: petalHoles }));

    // Everything that wears, drawn twice: worn for the lines, whole for the
    // glow under them. The wear is one seeded run through the lines in this
    // order, so every circle is worn alike.
    const drawing = (worn: boolean) => {
      const w: Wear = worn ? wear(41) : null;
      return {
        band: [ringParts(O, RIM, { wear: w }), ringParts(O, BAND_OUT, { holes: bandHoles, wear: w }), ringParts(O, BAND_IN, { holes: bandHoles, wear: w })].map(
          (parts, k) => stroke(parts, 0.55 + k * 0.1, 1.1),
        ),
        // The star strap by strap, then the circle swept round in one stroke.
        star: star.straps.flatMap((s, i) =>
          [1, -1].map((side) => {
            const parts = lineParts(...star.edge(i, side), { holes: [keyHole], under: star.unders[i], wear: s.poly ? null : w });
            if (!s.poly) return stroke(parts, 0.4 + i * 0.1, 0.5);
            const [t0, t1] = [s.k / BRIAR_SIDES, (s.k + 1) / BRIAR_SIDES];
            return stroke(parts.map((q) => ({ ...q, from: t0 + (t1 - t0) * q.from, to: t0 + (t1 - t0) * q.to })), 0.75, 0.9);
          }),
        ),
        heart: stroke(ringParts(O, HEART, { wear: w }), 0.15, 0.8),
        heartIn: stroke(ringParts(O, HEART - 1.4), 0.2, 0.8),
        petals: petals.map(({ p, holes, row }) => stroke(ringParts(p.c, p.r, { holes }), (row ? 0.05 : 0.2) + p.a / 900, 0.5)),
      };
    };

    /** A seal at `c`, `a` degrees round, stamped in at `delay` (lib/engraver). */
    const seal = (e: Engraver, delay: number, c: Pt, a: number, r: number, inner: number, signs: [string, string, number][]) => {
      const turn = turned(a);
      e.seal(delay, (q) => {
        const [x, y] = turn(q);
        return [c[0] + x, c[1] + y];
      }, `translate(${f(c[0])} ${f(c[1])}) rotate(${f(a)})`, a, r, inner, 0.5, signs);
    };

    const layers = (p: ReturnType<typeof drawing>): Record<string, Plate> => ({
      band: engrave((e) => {
        p.band.forEach((list, k) => e.pieces(list, k ? '' : 'thin'));
        SCRIPT.forEach((m, k) => {
          const turn = turned(m.a);
          e.mark(m.d, 1.15 + (k / SCRIPT.length) * 0.8, `rotate(${f(m.a)}) translate(0 -${BAND})`, (q) => turn([q[0], q[1] - BAND]), m.a);
        });
      }),
      star: engrave((e) => {
        for (const edge of p.star) e.pieces(edge, 'thin');
        LEAVES.forEach((leaf, k) => {
          e.line(leaf.outline, 'thin', 0.7 + k * 0.06, 0.5);
          e.line(leaf.rib, 'hair', 0.8 + k * 0.06, 0.4);
          e.line(leaf.veins, 'hatch', 0.95 + k * 0.06, 0.4);
        });
        e.line(THORNS.lines, 'thin', 1.1, 0.4);
        e.line(THORNS.shade, 'hatch', 1.25, 0.3);
      }),
      // The moons, each upright on the page as the band carries it round, so
      // her phases read as they are seen.
      ...Object.fromEntries(
        moons.map(({ c, outline, shade }, k) => [
          `moon${k}`,
          engrave((e) =>
            seal(e, 0.95 + k * 0.07, c, 0, SEAL, 1.2, [
              [outline, 'sign', 1],
              [shade, 'hatch', 1],
            ]),
          ),
        ]),
      ),
      // The key's seal, the key lying level whatever the star's turn, its bow to the left.
      key: engrave((e) =>
        seal(e, 1.05, key, 270, KEY_SEAL, 1.6, [
          [KEY.lines, 'sign', 1],
          [KEY.shade, 'hatch', 1],
        ]),
      ),
      // Each rose on its stem, which sways from the briar.
      ...Object.fromEntries(
        buds.map(({ a, c, stem, sepals, lines, shade, k: size }, k) => [
          `bud${k}`,
          engrave((e) => {
            e.line(stem, 'thin', 1.1 + k * 0.1, 0.25);
            e.line(placed(sepals + lines, c, a, size), 'sign', 1.2 + k * 0.1, 0.5);
            e.line(placed(shade, c, a, size), 'hatch', 1.4 + k * 0.1, 0.3);
          }),
        ]),
      ),
      rose: engrave((e) => {
        e.pieces(p.heart, 'thin');
        e.pieces(p.heartIn, 'hair');
        p.petals.forEach((list) => e.pieces(list, ''));
        petals.forEach(({ shade, row, p: q }) => e.line(shade, 'hatch', (row ? 0.4 : 0.55) + q.a / 1200, 0.4));
        e.line(circle(DISC), 'thin', 0.05, 0.5);
        e.line(SEEDS, 'hair', 0.4, 0.4);
        CALYX.forEach((s, k) => {
          e.line(s.lines, 'thin', 0.5 + k * 0.04, 0.4);
          e.line(s.hatch, 'hatch', 0.65 + k * 0.04, 0.4);
        });
      }),
    });
    const GLOW = layers(drawing(false));
    const LINES = layers(drawing(true));
    const layer = (name: string, more: Partial<StageLayer> = {}): StageLayer => ({ name, lines: LINES[name], glow: GLOW[name], ...more });
    // Each ring turns its own way and speed, and first winds into place;
    // the moons ride the band upright, and the key the star lying level; the
    // roses sway on their stems, each to its own beat.
    const LAYERS = [
      layer('band', { spin: { turn: 240, from: 24, reverse: true } }),
      ...moons.map(({ c }, k) => layer(`moon${k}`, { within: 'band', pivot: c, upright: true })),
      layer('star', { spin: { turn: 160, from: -40 } }),
      layer('key', { within: 'star', pivot: key, upright: true }),
      ...buds.map(({ pivot }, k) => layer(`bud${k}`, { within: 'star', pivot, sway: { swing: 3.5, period: [5.5, 6.8, 6.1, 7.4][k], delay: -k * 1.7 } })),
      layer('rose', { spin: { turn: 100, from: 70, reverse: true } }),
    ];
    return LAYERS;
  };
  const plate = () => (built ??= build());
  whenIdle(() => plate(), { timeout: 5000, fallback: 1500 });
</script>

<script lang="ts">
  import ArcaneStage from './ArcaneStage.svelte';

  let { state, size, color, strength }: { state?: 'idle' | 'good' | 'bad'; size?: string; color?: string; strength?: number } = $props();

  const LAYERS = plate();
</script>

<!--
  The summoning, in seconds from the start: a light blooms at the centre,
  the rose opens petal by petal, its ring draws and the pentagram is traced
  strap by strap, the briar swept round through it, the leaves grow up its
  points, the key is stamped below and the buds open one after another,
  the band's rings sweep round, the moons are stamped into them and the
  script written, and last the rose's point is set.
-->

<ArcaneStage layers={LAYERS} point={{ r: 1.1, delay: 1.95 }} {state} {size} {color} {strength} />
