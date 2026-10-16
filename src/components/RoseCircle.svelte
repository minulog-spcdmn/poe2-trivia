<script module lang="ts">
  import { angleOf, at as atAbout, f, hatch, lerp, pt, ring as round, ringParts, seeded, wear, type Cut, type Hole, type Part, type Pt, type Wear } from '../lib/arcane';
  import { engrave, mapPath, stroke, turned, type Engraver, type Plate } from '../lib/engraver';
  import { glyph, inscribe } from '../lib/tongue';
  import type { StageLayer } from './ArcaneStage.svelte';
  import { whenIdle } from '../lib/idle';

  // The plate is built once, the first time a circle is mounted, or before
  // that in an idle moment when a page about to show it asks (`warm`, through
  // circles.ts), so its geometry never weighs on a page's first frames and
  // a page never builds a circle it won't show.
  let built: StageLayer[] | undefined;
  const build = (): StageLayer[] => {
    // The rose, a sibling of the rune circle (ArcaneCircle; see
    // docs/arcane-style.md): the rose of Venus, the path the morning and
    // evening star draws about the Earth in the eight years in which she
    // goes thirteen times round the Sun, a rose of five petals, each petal
    // rising from a loop where she passes between the Earth and the Sun;
    // and sub rosa, under the rose, the old sign of what is kept secret.
    // From the outside in, turning in layers:
    // • the band: the moon's eight phases in seals, for the eight years after
    //   which the moon's phases come round to the same days again as Venus
    //   comes round to the same place (the old octaeteris); full at the top
    //   and new at the bottom, waning down the right and waxing up the left;
    //   the script between them;
    // • the Sun's round about the Earth, a strap, and within it her path,
    //   from her real periods and the real size of her orbit: a strap woven
    //   over and under itself wherever it crosses, which runs in under the
    //   Sun's round wherever she goes further from the Earth than the Sun,
    //   behind him and lost in his light;
    // • in her five petals, the seals, upright as she carries them: below,
    //   the plate's one great seal, a cipher wheel, its inner ring turning,
    //   laid over the petal and the Sun's round; above, the seal of Hagith,
    //   the spirit who rules Venus in the Arbatel, and the nine chambers of
    //   the cipher such seals are written in; at the sides, her two figures
    //   of the sand, Puella and Amissio;
    // • at the heart, where the Earth she is watched from would be, the rose
    //   made stone: a rose window of ten lancets and ten cusped roundels,
    //   the morning star in its oculus, turning against her path; between
    //   her five loops, five rays from its ring, each ridged and cut down
    //   one side, in a glory that swells and ebbs.
    // Lines stop short of every seal and of every strand they pass under, and
    // carry the odd nick. It is set on the ArcaneStage, which turns, lights
    // and colours it.
    const O: Pt = [0, 0];
    /** The point at `a` degrees clockwise from the top, `r` from the centre. */
    const at = (a: number, r: number) => atAbout(O, a, r);
    const circle = (r: number) => round(O, r);
    const dist = (p: Pt, q: Pt) => Math.hypot(p[0] - q[0], p[1] - q[1]);
    const len = (p: Pt) => Math.hypot(p[0], p[1]);
    /** What's left of [lo, hi] once the `cuts` are taken out. */
    const keep = (lo: number, hi: number, cuts: Cut[]) => {
      let parts: Cut[] = [[lo, hi]];
      for (const [c0, c1] of cuts) parts = parts.flatMap(([a, b]): Cut[] => (c1 <= a || c0 >= b ? [[a, b]] : ([[a, c0], [c1, b]] as Cut[]).filter(([p, q]) => q - p > 1e-5)));
      return parts;
    };

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
     * part cut in level strokes up to it.
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
    /** How far in the band's seals reach, which nothing on another layer may come near. */
    const MOONS_IN = BAND - SEAL;
    const rnd = seeded(71);
    const SCRIPT = moons.flatMap(({ a }) => inscribe(a + 7.5, a + 45 - 7.5, BAND, rnd, 1.2));

    // ---- the path of Venus --------------------------------------------------------
    // Venus about the Sun (her orbit 0.7233 of his round about us) less the
    // Earth about it, thirteen of her years to eight of ours: an epitrochoid
    // that closes after eight turns, nearest the Earth (0.277) in its five
    // loops, which turn her for a while backward against the stars. Drawn
    // with the Sun's round at SUN; wherever she is further out than the Sun
    // she runs in under his round and is lost.
    const VENUS = 0.7233;
    const SUN = 73;
    const TAU = 2 * Math.PI;
    const W = 0.8;
    const GAP = 0.7;
    /** How far in from the Sun's round the path's edges go under it. */
    const UNDER_SUN = SUN - W - GAP;
    /** Venus seen from the Earth at `t` (0 to 2π over the eight years), or its `k`th derivative; her first loop straight down, the others a fifth of the round apart. */
    const venus = (t: number, k = 0): Pt => {
      const q = (k * Math.PI) / 2;
      const [a, b] = [13 * t + q, 8 * t + q];
      const re = VENUS * 13 ** k * Math.cos(a) - 8 ** k * Math.cos(b);
      const im = VENUS * 13 ** k * Math.sin(a) - 8 ** k * Math.sin(b);
      return [-im * SUN, -re * SUN];
    };
    /** The path's edge `side` (±1) `w` from its middle at `t`, and how fast it runs there. */
    const edgeAt = (t: number, side: number, w = W): [Pt, Pt] => {
      const [p, d1, d2] = [venus(t), venus(t, 1), venus(t, 2)];
      const L = Math.hypot(d1[0], d1[1]);
      const n: Pt = [-d1[1] / L, d1[0] / L];
      const dot = (d1[0] * d2[0] + d1[1] * d2[1]) / (L * L);
      const dn: Pt = [-d2[1] / L - n[0] * dot, d2[0] / L - n[1] * dot];
      return [
        [p[0] + side * w * n[0], p[1] + side * w * n[1]],
        [d1[0] + side * w * dn[0], d1[1] + side * w * dn[1]],
      ];
    };
    // Samples along the middle, for finding where it crosses itself and how far a point is from it.
    const N = 8000;
    const TS = Array.from({ length: N }, (_, i) => (i / N) * TAU);
    const PS = TS.map((t) => venus(t));
    const CELL = 2;
    const cellKey = (cx: number, cy: number) => (cx + 100) * 1000 + cy + 100;
    /** The samples by the cells of a grid they pass through: all of them, or those `seen`. */
    const gridOf = (seen: boolean) => {
      const grid = new Map<number, number[]>();
      for (let i = 0; i < N; i++) {
        if (seen && len(PS[i]) > SUN + 4) continue;
        const [p, q] = [PS[i], PS[(i + 1) % N]];
        // (In every cell its box touches, so two that cross share a cell.)
        for (let cx = Math.floor(Math.min(p[0], q[0]) / CELL); cx <= Math.floor(Math.max(p[0], q[0]) / CELL); cx++)
          for (let cy = Math.floor(Math.min(p[1], q[1]) / CELL); cy <= Math.floor(Math.max(p[1], q[1]) / CELL); cy++) {
            const k = cellKey(cx, cy);
            grid.set(k, [...(grid.get(k) ?? []), i]);
          }
      }
      return grid;
    };
    const GRID = gridOf(true);
    /** How far `q` lies from the middle of the seen path (or of the samples `only` lets through), up to about 2, beyond which it says Infinity. */
    const fromVenus = (q: Pt, only?: (i: number) => boolean) => {
      let best = Infinity;
      const [cx, cy] = [Math.floor(q[0] / CELL), Math.floor(q[1] / CELL)];
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
          for (const i of GRID.get(cellKey(cx + dx, cy + dy)) ?? []) {
            if (only && !only(i)) continue;
            const [p, r] = [PS[i], PS[(i + 1) % N]];
            const [ex, ey] = [r[0] - p[0], r[1] - p[1]];
            const s = Math.max(0, Math.min(1, ((q[0] - p[0]) * ex + (q[1] - p[1]) * ey) / (ex * ex + ey * ey || 1)));
            best = Math.min(best, Math.hypot(q[0] - p[0] - ex * s, q[1] - p[1] - ey * s));
          }
      return best;
    };
    // How far along it each sample lies, for wearing it evenly.
    const ALONG = PS.reduce((acc, p, i) => (acc.push(i ? acc[i - 1] + dist(PS[i - 1], p) : 0), acc), [] as number[]);
    const LENGTH = ALONG[N - 1] + dist(PS[N - 1], PS[0]);
    /** Where (in t) the path is `s` of the way along it. */
    const tAlong = (s: number) => {
      const x = s * LENGTH;
      let [lo, hi] = [0, N - 1];
      while (hi - lo > 1) {
        const m = (lo + hi) >> 1;
        if (ALONG[m] <= x) lo = m;
        else hi = m;
      }
      if (x >= ALONG[N - 1]) return TS[N - 1] + ((TAU / N) * (x - ALONG[N - 1])) / (LENGTH - ALONG[N - 1]);
      return TS[lo] + ((TAU / N) * (x - ALONG[lo])) / (ALONG[lo + 1] - ALONG[lo]);
    };
    /** How far `q` lies from the middle of the seen path, anywhere. */
    const SEEN = PS.filter((p) => len(p) < SUN);
    const clearOf = (q: Pt) => {
      let best = Infinity;
      for (const p of SEEN) best = Math.min(best, (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2);
      return Math.sqrt(best);
    };
    // Breaks for drawing it as curves: every 20 degrees it turns, or 12 along.
    const BREAKS = (() => {
      const out: number[] = [0];
      let [turn, run] = [0, 0];
      for (let i = 1; i <= N; i++) {
        const [a, b] = [venus(TS[i - 1], 1), venus(i === N ? TAU : TS[i], 1)];
        turn += Math.abs(Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1]));
        run += dist(PS[i - 1], PS[i % N]);
        if (turn > (20 * Math.PI) / 180 || run > 12) {
          out.push(i === N ? TAU : TS[i]);
          turn = run = 0;
        }
      }
      if (out.at(-1)! < TAU) out.push(TAU);
      return out;
    })();
    /** The edge from `t0` to `t1` as curves. */
    const edgeD = (t0: number, t1: number, side: number, w = W) => {
      const ks = [t0, ...BREAKS.filter((b) => b > t0 + 1e-6 && b < t1 - 1e-6), t1];
      let d = `M${pt(edgeAt(t0, side, w)[0])}`;
      for (let i = 1; i < ks.length; i++) {
        const [s0, s1] = [ks[i - 1], ks[i]];
        const [[p0, d0], [p3, d3]] = [edgeAt(s0, side, w), edgeAt(s1, side, w)];
        const h = (s1 - s0) / 3;
        d += `C${pt([p0[0] + d0[0] * h, p0[1] + d0[1] * h])} ${pt([p3[0] - d3[0] * h, p3[1] - d3[1] * h])} ${pt(p3)}`;
      }
      return d;
    };
    // Where it crosses itself, each found between samples and refined: all
    // of them, so that walking it, over and under keep their turns where it
    // runs unseen too.
    const ALL_CROSSINGS = (() => {
      const found: [number, number][] = [];
      for (const ids of gridOf(false).values())
        for (const i of ids)
          for (const j of ids) {
            if (j <= i + 2 || (i === 0 && j >= N - 2)) continue;
            const [p, q, r, s] = [PS[i], PS[(i + 1) % N], PS[j], PS[(j + 1) % N]];
            const den = (q[0] - p[0]) * (s[1] - r[1]) - (q[1] - p[1]) * (s[0] - r[0]);
            if (Math.abs(den) < 1e-12) continue;
            const u = ((r[0] - p[0]) * (s[1] - r[1]) - (r[1] - p[1]) * (s[0] - r[0])) / den;
            const v = ((r[0] - p[0]) * (q[1] - p[1]) - (r[1] - p[1]) * (q[0] - p[0])) / den;
            if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
            let [a, b] = [TS[i] + (u * TAU) / N, TS[j] + (v * TAU) / N];
            for (let n = 0; n < 8; n++) {
              const [pa, pb, da, db] = [venus(a), venus(b), venus(a, 1), venus(b, 1)];
              const [ex, ey] = [pa[0] - pb[0], pa[1] - pb[1]];
              const det = -da[0] * db[1] + db[0] * da[1];
              a += (ex * db[1] - db[0] * ey) / det;
              b += (da[1] * ex - da[0] * ey) / det;
            }
            [a, b] = [((a % TAU) + TAU) % TAU, ((b % TAU) + TAU) % TAU];
            if (!found.some(([x, y]) => (Math.abs(x - a) < 1e-4 && Math.abs(y - b) < 1e-4) || (Math.abs(x - b) < 1e-4 && Math.abs(y - a) < 1e-4))) found.push([a, b]);
          }
      return found;
    })();
    /** The crossings within the Sun's round. */
    const CROSSINGS = ALL_CROSSINGS.filter(([a]) => len(venus(a)) < UNDER_SUN);
    // Walking the path, it goes over and under in turn.
    const VISITS = ALL_CROSSINGS.flatMap(([a, b]) => [
      { t: a, other: b },
      { t: b, other: a },
    ]).sort((x, y) => x.t - y.t);
    const UNDER = VISITS.filter((_, i) => i % 2 === 1);
    /** How far `q` lies from the middle of the path between `t0` and `t1` (up to about 2). */
    const fromStretch = (q: Pt, t0: number, t1: number) => {
      const i0 = Math.floor((t0 / TAU) * N);
      const span = Math.ceil(((t1 - t0) / TAU) * N);
      return fromVenus(q, (i) => (((i - i0) % N) + N) % N <= span);
    };
    /** The stretch about `t0` for which `inside` holds, refined at both ends. */
    const around = (t0: number, inside: (t: number) => boolean, step = 0.0004, reach = 0.1): Cut => {
      const end = (dir: number) => {
        let [lo, hi] = [t0, t0];
        for (let s = step; s < reach; s += step) {
          hi = t0 + dir * s;
          if (!inside(hi)) break;
          lo = hi;
        }
        for (let n = 0; n < 18; n++) {
          const m = (lo + hi) / 2;
          if (inside(m)) lo = m;
          else hi = m;
        }
        return lo;
      };
      return [end(-1), end(1)];
    };
    /** Where the path's edges pass under it: for each crossing it goes under at, the stretch of each edge (side 1, side -1). */
    const underCutsOf = (holes: Hole[]) =>
      UNDER.filter(({ t }) => len(venus(t)) < UNDER_SUN && !holes.some((h) => dist(venus(t), h.c) < h.r + 1)).map(({ t, other }) => {
        const [a, b] = [1, -1].map((side) => around(t, (s) => fromStretch(edgeAt(s, side)[0], other - 0.09, other + 0.09) < W + GAP));
        const [da, db] = [venus(t, 1), venus(other, 1)];
        const angle = Math.abs(Math.asin((da[0] * db[1] - da[1] * db[0]) / (Math.hypot(...da) * Math.hypot(...db))));
        // (Where the two cross at a slant, the one beneath stays under until both its edges are clear.)
        const both: Cut = [Math.min(a[0], b[0]), Math.max(a[1], b[1])];
        return angle < (25 * Math.PI) / 180 ? [both, both] : [a, b];
      });
    let UNDER_CUTS: Cut[][] | undefined;
    const underCuts = (holes: Hole[]) => (UNDER_CUTS ??= underCutsOf(holes));
    /** The stretches of edge `side` (0, its middle) that run under the Sun's round or into a hole. */
    const HOLE_CUTS = new Map<number, Cut[]>();
    const holeCuts = (side: number, holes: Hole[]): Cut[] => HOLE_CUTS.get(side) ?? (HOLE_CUTS.set(side, holeCutsOf(side, holes)), HOLE_CUTS.get(side)!);
    const holeCutsOf = (side: number, holes: Hole[]): Cut[] => {
      const out: Cut[] = [];
      const step = 0.0008;
      const inHole = (t: number) => {
        const e = edgeAt(t, side)[0];
        return len(e) > UNDER_SUN || holes.some((h) => dist(e, h.c) < h.r);
      };
      /** Where between `a` (outside) and `b` (inside) the edge enters the hole. */
      const edge = (a: number, b: number) => {
        for (let n = 0; n < 16; n++) {
          const m = (a + b) / 2;
          if (inHole(m)) b = m;
          else a = m;
        }
        return a;
      };
      let from: number | null = null;
      for (let t = 0; t <= TAU + 1e-9; t += step) {
        const now = inHole(t);
        if (now && from === null) from = edge(t - step, t);
        if (!now && from !== null) out.push([from, edge(t, t - step)]), (from = null);
      }
      if (from !== null) out.push([from, TAU]);
      return out;
    };
    /**
     * Stretches that only run along the Sun's round, never far in from it,
     * or that just touch in between two dives under it: left out, so the
     * strand seems to run on under the round rather than double it.
     */
    let STUBS: Cut[] | undefined;
    const stubs = (holes: Hole[]): Cut[] => (STUBS ??= stubsOf(holes));
    const stubsOf = (holes: Hole[]): Cut[] => {
      const under = underCuts(holes).map(([a, b]): Cut => [Math.min(a[0], b[0]), Math.max(a[1], b[1])]);
      const runs = keep(0, TAU, [...under, ...holeCuts(0, holes)]);
      const along = (a: number, b: number) => {
        let s = 0;
        for (let i = 0; i < 40; i++) s += dist(venus(a + ((b - a) * i) / 40), venus(a + ((b - a) * (i + 1)) / 40));
        return s;
      };
      const far = (t: number) => len(venus(t)) > UNDER_SUN - 2;
      const hugs = (a: number, b: number) => Array.from({ length: 41 }, (_, i) => len(venus(a + ((b - a) * i) / 40))).every((r) => r > UNDER_SUN - 4.5);
      return runs.filter(([a, b]) => (along(a, b) < 4 && far(a) && far(b)) || hugs(a, b)).map(([a, b]): Cut => [a - 0.002, b + 0.002]);
    };
    /** Edge `side` of the path (0, the hairline down its middle) in pieces, broken under the path, under the Sun's round and at `holes`, and worn (never in the loops or by a crossing, where a nick would read as a break in the weave). */
    const pathParts = (side: number, holes: Hole[], w: Wear): Part[] => {
      const under = underCuts(holes).map(([a, b]): Cut => (side > 0 ? a : side < 0 ? b : [Math.min(a[0], b[0]), Math.max(a[1], b[1])]));
      const cuts: Cut[] = [...under, ...holeCuts(side, holes), ...stubs(holes)].flatMap(([a, b]): Cut[] =>
        [-TAU, 0, TAU].map((k) => [a + k, b + k]),
      );
      if (w)
        for (const [a, b] of w(LENGTH)) {
          const [t0, t1] = [tAlong(Math.max(0, a)), tAlong(Math.min(1, b))];
          const m = venus((t0 + t1) / 2);
          if (len(m) > LOOP_OUT + 2 && CROSSINGS.every(([x, y]) => dist(venus(x), m) > 3.5 && dist(venus(y), m) > 3.5)) cuts.push([t0, t1]);
        }
      // (No crumbs: a piece too short to read as a line is left out.)
      return keep(0, TAU, cuts)
        .filter(([a, b]) => dist(venus(a), venus(b)) > 0.6)
        .map(([a, b]) => ({ d: edgeD(a, b, side), from: a / TAU, to: b / TAU }));
    };
    // The loops: from where she comes nearest the Earth out to where each
    // crosses itself.
    const LOOP_IN = SUN * (1 - VENUS);
    const LOOP_OUT = (() => {
      let t = 1e-4;
      const x0 = Math.sign(venus(t)[0]);
      while (Math.sign(venus(t)[0]) === x0) t += 1e-5;
      return len(venus(t));
    })();

    /** A straight line from `p` to `q` in pieces, stopping where it comes within `clear` of the path or at `holes`; a piece shorter than `least` (as in the little lozenge where two strands cross) is left out. */
    const underPath = (p: Pt, q: Pt, holes: Hole[] = [], clear = W + GAP, worn: Wear = null, least = 1.4): Part[] => {
      const total = dist(p, q);
      const n = Math.max(2, Math.ceil(total / 0.15));
      const hidden = (s: number) => {
        const x = lerp(p, q, s);
        return fromVenus(x) < clear || holes.some((h) => dist(x, h.c) < h.r);
      };
      /** Where between `a` and `b` (one hidden, the other not) it changes. */
      const edge = (a: number, b: number) => {
        const ha = hidden(a);
        for (let k = 0; k < 10; k++) {
          const m = (a + b) / 2;
          if (hidden(m) === ha) a = m;
          else b = m;
        }
        return ha ? b : a;
      };
      const cuts: Cut[] = [];
      let from: number | null = null;
      let was = false;
      for (let i = 0; i <= n; i++) {
        const s = i / n;
        const now = hidden(s);
        if (now && from === null) from = i ? edge((i - 1) / n, s) : 0;
        if (!now && was && from !== null) cuts.push([from, edge(s, (i - 1) / n)]), (from = null);
        was = now;
      }
      if (from !== null) cuts.push([from, 1]);
      // (A piece cut short by wear is kept if it still reads as a line.)
      const free = keep(0, 1, cuts);
      if (worn) cuts.push(...worn(total));
      return keep(0, 1, cuts)
        .filter(([a, b]) => (b - a) * total > 0.8 && free.some(([c, d]) => c <= a + 1e-9 && d >= b - 1e-9 && (d - c) * total >= least))
        .map(([a, b]) => ({ d: `M${pt(lerp(p, q, a))}L${pt(lerp(p, q, b))}`, from: a, to: b }));
    };
    const joinedParts = (ps: Part[]) => ps.map((x) => x.d).join('');

    /** Moves a path drawn about the origin to `c`, turned `a` degrees, `k` times its size. */
    const placed = (d: string, c: Pt, a: number, k = 1) => {
      const turn = turned(a);
      return mapPath(d, (q) => {
        const [x, y] = turn([q[0] * k, q[1] * k]);
        return [c[0] + x, c[1] + y];
      }, a, k);
    };
    /** A path drawn about the origin at `k` times its size (its line kept as it is). */
    const grown = (d: string, k: number) => mapPath(d, (q) => [q[0] * k, q[1] * k], 0, k);

    // ---- the cipher wheel ---------------------------------------------------------
    // In her lowest petal, the plate's one great seal, as large as the band's
    // moons and her loop above it let it be: laid over the petal and the
    // Sun's round, which break round it.
    const WHEEL_OUT = MOONS_IN - 1.3;
    const WHEEL_IN = LOOP_OUT + 2.4;
    const KEY_SEAL = (WHEEL_OUT - WHEEL_IN - 1.6) / 2;
    const keyAt = WHEEL_OUT - KEY_SEAL;
    const key = at(180, keyAt);
    const WK = KEY_SEAL / 15;
    const keyHole: Hole = { c: key, r: KEY_SEAL + 1.6 };
    /**
     * The cipher wheel, the key to what is said under the rose, as the secret
     * writers of the Renaissance turned them (Alberti, Trithemius): a fixed
     * ring of the script's letters round a ring that turns, so each letter
     * stands for another as the wheel is set; an index at the top where the
     * setting is read; and at its hub an eight-pointed star, each point
     * ridged and cut down one side.
     */
    // (Only the letters that keep between the headline and the baseline,
    // so none reaches across a ring.)
    const SHORT = [0, 1, 2, 3, 6, 7, 8, 9, 10, 13, 15, 16, 17, 19];
    /** A ring of the wheel between `r0` and `r1`: its two circles, `cells` walls, and a letter in each cell, `first` letter on, `step` letters apart. */
    const dialRing = (r0: number, r1: number, cells: number, first: number, step: number, k: number) => {
      let lines = circle(r0) + circle(r1);
      let letters = '';
      for (let n = 0; n < cells; n++) {
        const a = (n / cells) * 360;
        lines += `M${pt(at(a, r0 + 0.2))}L${pt(at(a, r1 - 0.2))}`;
        const m = a + 180 / cells;
        letters += placed(glyph(SHORT[(first + n * step) % SHORT.length], k), at(m, (r0 + r1) / 2), m);
      }
      return { lines, letters };
    };
    const WHEEL = (() => {
      const outer = dialRing(9.9, 12.7, 20, 3, 3, 0.72);
      const index = 'M-0.7 -9.9L0 -9.1L0.7 -9.9';
      let star = '';
      let shade = '';
      for (let k = 0; k < 8; k++) {
        const [r1, half] = k % 2 ? [4.4, 13] : [5.6, 15];
        const [base, l, r, tip] = [at(k * 45, 1.4), at(k * 45 - half, 1.4), at(k * 45 + half, 1.4), at(k * 45, r1)];
        star += `M${pt(l)}L${pt(tip)}L${pt(r)}M${pt(base)}L${pt(tip)}`;
        shade += hatch(base, l, tip, 0.38 / WK);
      }
      return {
        lines: grown(outer.lines + index + circle(1.4), WK),
        letters: grown(outer.letters, WK),
        star: grown(star, WK),
        shade: grown(shade, WK),
      };
    })();
    // The ring that turns.
    const DIAL = dialRing(6.3, 8.5, 16, 11, 5, 0.6);

    // ---- the seals in her petals ----------------------------------------------------
    /** Where along `a`, between `r0` and `r1`, a circle clear of the path can be largest: its middle and its reach. */
    const widest = (a: number, r0: number, r1: number) => {
      let best = [0, 0];
      for (let r = r0; r < r1; r += 1) {
        const v = Math.min(clearOf(at(a, r)), SUN - r);
        if (v > best[1]) best = [r, v];
      }
      for (let r = best[0] - 1; r < best[0] + 1; r += 0.05) {
        const v = Math.min(clearOf(at(a, r)), SUN - r);
        if (v > best[1]) best = [r, v];
      }
      return best;
    };
    const PETAL_AT = widest(36, LOOP_OUT, SUN);
    const LESSER = PETAL_AT[1] - W - 1.4 - 0.4;
    const lesser = [36, 108, 252, 324].map((a) => ({ a, c: at(a, PETAL_AT[0]) }));
    const lesserHoles: Hole[] = lesser.map(({ c }) => ({ c, r: LESSER + 1.4 }));
    const pathHoles = [keyHole, ...lesserHoles];
    /**
     * A figure of geomancy, the divining in sand, its four rows (head to
     * feet) of one point or two, pricked as points and joined row to row,
     * as the geomancers made characters of their figures, each stroke
     * stopping short of the points.
     */
    const figure = (rows: number[]) => {
      const R = 1.25;
      const [dy, dx] = [5.5, 4];
      const pts = rows.map((n, i) => (n === 1 ? [[0, (i - 1.5) * dy]] : [[-dx, (i - 1.5) * dy], [dx, (i - 1.5) * dy]]) as Pt[]);
      const points = pts.flat().map((q) => round(q, R)).join('');
      const joins = pts
        .slice(1)
        .flatMap((row, i) => row.flatMap((q) => pts[i].map((p) => [p, q] as [Pt, Pt])))
        .map(([p, q]) => {
          const g = (R + 0.55) / dist(p, q);
          return `M${pt(lerp(p, q, g))}L${pt(lerp(q, p, g))}`;
        })
        .join('');
      return { points, joins };
    };
    const [PUELLA, AMISSIO] = [figure([1, 2, 1, 1]), figure([1, 2, 1, 2])];
    /** A word of the script's letters `ids`, `k` times their size, centred on (`x`, `y`), its headline over them (or the letters alone, `bare`). */
    const word = (ids: number[], k: number, x: number, y: number, bare = false) => {
      const widths = ids.map((i) => {
        const xs: number[] = [];
        mapPath(glyph(i, 1), (q) => (xs.push(q[0]), q));
        return (Math.max(...xs) - Math.min(...xs) + 0.6) * k;
      });
      const track = 0.3 * k;
      const total = widths.reduce((s0, w0) => s0 + w0, 0) + track * (ids.length - 1);
      let at0 = x - total / 2;
      let d = bare ? '' : `M${f(at0)} ${f(y - 1.2 * k)}H${f(at0 + total)}`;
      ids.forEach((i, n) => {
        const c = at0 + widths[n] / 2;
        d += mapPath(glyph(i, k), (q) => [c + q[0], y + q[1]]);
        at0 += widths[n] + track;
      });
      return d;
    };
    // The nine chambers (the Kabbalists' AIQ BKR), the cipher in which the
    // spirits' seals are written: a lattice of nine, three letters to each,
    // so a name can be drawn as the line from chamber to chamber.
    const CHAMBERS = (() => {
      const h = 9.3;
      const c = h / 3;
      // The walls: the upright ones whole, the level ones stopping short where they cross them.
      const g = 0.5;
      let lines = '';
      for (const v of [-c, c]) lines += `M${f(v)} ${f(-h)}V${f(h)}`;
      for (const v of [-c, c]) lines += `M${f(-h)} ${f(v)}H${f(-c - g)}M${f(-c + g)} ${f(v)}H${f(c - g)}M${f(c + g)} ${f(v)}H${f(h)}`;
      let letters = '';
      for (let i = 0; i < 9; i++) {
        const [cx, cy] = [((i % 3) - 1) * 2 * c, (Math.floor(i / 3) - 1) * 2 * c];
        letters += word([0, 1, 2].map((j) => i * 3 + j + 2), 0.58, cx, cy + 0.15, true);
      }
      return { lines, letters };
    })();
    // The seal of Hagith, the Olympic spirit of Venus, who turns copper into
    // gold, as the Arbatel (Basel, 1575) prints it, its broad stroke drawn
    // round both its edges and cut in level strokes, as the band's moons
    // and the Earth's waters are: a frame open at its foot, and in it a comb
    // of four teeth whose middle two run down to the opening.
    const HAGITH = (() => {
      const k = 0.0098;
      const P = (x: number, y: number): Pt => [(x - 2472.5) * k, (y - 416) * k];
      const outer = [[1587, -178], [1587, 1010], [2345, 1010], [2345, 680], [2596, 680], [2596, 1010], [3358, 1010], [3358, -178]].map(([x, y]) => P(x, y));
      const inner = [
        [1698, -67], [3248, -67], [3248, 899], [2725, 899], [2725, 680], [3104, 680], [3104, 141], [2976, 141], [2976, 551], [2725, 551], [2725, 141], [2596, 141],
        [2596, 551], [2345, 551], [2345, 141], [2217, 141], [2217, 551], [1966, 551], [1966, 141], [1837, 141], [1837, 680], [2217, 680], [2217, 899], [1698, 899],
      ].map(([x, y]) => P(x, y));
      const ring = (ps: Pt[]) => 'M' + ps.map(pt).join('L') + 'Z';
      /** Whether `q` lies inside the polygon `ps`. */
      const within = (q: Pt, ps: Pt[]) => {
        let inside = false;
        for (let i = 0, j = ps.length - 1; i < ps.length; j = i++) {
          const [a, b] = [ps[i], ps[j]];
          if (a[1] > q[1] !== b[1] > q[1] && q[0] < ((b[0] - a[0]) * (q[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
        }
        return inside;
      };
      // (The stroke is what lies inside the outer edge and outside the
      // inner, kept 0.3 clear of both.)
      const ink = (x: number, y: number) =>
        [[0, 0], [0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3], [0.21, 0.21], [-0.21, 0.21], [0.21, -0.21], [-0.21, -0.21]].every(
          ([dx, dy]) => within([x + dx, y + dy], outer) && !within([x + dx, y + dy], inner),
        );
      let shade = '';
      const [x0, x1] = [Math.min(...outer.map((q) => q[0])), Math.max(...outer.map((q) => q[0]))];
      const [y0, y1] = [Math.min(...outer.map((q) => q[1])), Math.max(...outer.map((q) => q[1]))];
      for (let y = y0 + 0.4; y < y1; y += 0.42) {
        let from: number | null = null;
        for (let x = x0; x <= x1 + 0.05; x += 0.05) {
          const on = ink(x, y);
          if (on && from === null) from = x;
          if (!on && from !== null) {
            if (x - 0.05 - from > 0.2) shade += `M${f(from)} ${f(y)}H${f(x - 0.05)}`;
            from = null;
          }
        }
      }
      return { lines: ring(outer) + ring(inner), shade };
    })();
    // Round from the upper right: the nine chambers; Amissio, loss, and
    // Puella, the girl, the two figures of Venus; Hagith's seal.
    const LESSER_SIGNS: [string, string, number][][] = [
      [
        [CHAMBERS.lines, 'sign', 1],
        [CHAMBERS.letters, 'hatch', 1],
      ],
      [
        [AMISSIO.points, 'ink', 1],
        [AMISSIO.joins, 'sign', 1],
      ],
      [
        [PUELLA.points, 'ink', 1],
        [PUELLA.joins, 'sign', 1],
      ],
      [
        [HAGITH.lines, 'sign', 1],
        [HAGITH.shade, 'hatch', 1],
      ],
    ];

    // ---- the heart: the rose window -------------------------------------------------
    // The rose made stone, as the cathedral builders set it in their west
    // fronts: a wheel of tracery struck with the compass alone. Ten lancets
    // radiate from the oculus like spokes, each closed by a pointed arch of
    // the equilateral kind, a moulding drawn inside it; between their heads
    // ten great roundels, each cusped into a pointed quatrefoil, and beyond
    // each head, by the rim, a small plain one; and in the oculus the
    // morning star, five points ridged and cut down one side, its points
    // toward the five rays. Nothing else comes within its ring.
    const HUB = LOOP_IN - W - 2.1;
    /** How far out the window's stone may reach, clear of the ring's inner line. */
    const PANE = HUB - 1.2 - 1.0;
    /** Half the stone between two openings. */
    const BAR = 0.5;
    const MOULD = 0.42;
    const OCULUS = 3.6;
    const FOOT_R = OCULUS + 2 * BAR;
    const LIGHTS = 10;
    const HALF = 180 / LIGHTS;
    /** The point `u` out along the axis at `a` degrees and `v` across it (clockwise). */
    const P = (a: number, u: number, v: number): Pt => {
      const [b, n] = [at(a, u), at(a + 90, v)];
      return [b[0] + n[0], b[1] + n[1]];
    };
    /** An arc about `c` from `p` to `q` (the short way, unless `long`). */
    const arcTo = (c: Pt, p: Pt, q: Pt, long = false) => {
      const r = dist(c, p);
      const cross = (p[0] - c[0]) * (q[1] - c[1]) - (p[1] - c[1]) * (q[0] - c[0]);
      return `A${f(r)} ${f(r)} 0 ${long ? 1 : 0} ${(cross > 0) !== long ? 1 : 0} ${pt(q)}`;
    };
    /** Points along the arc about `c` from `p` to `q` (the short way). */
    const arcPts = (c: Pt, p: Pt, q: Pt, n = 12) => {
      const [a0, a1] = [angleOf(c, p), angleOf(c, q)];
      const da = ((a1 - a0 + 540) % 360) - 180;
      return Array.from({ length: n + 1 }, (_, i) => atAbout(c, a0 + (da * i) / n, dist(c, p)));
    };
    // The lancet: as wide as the bars let it be at its foot, its sides
    // parallel, its arch two arcs each struck from the other's springing.
    const SPAN = FOOT_R * Math.sin((HALF * Math.PI) / 180) - BAR;
    const APEX = 10.2;
    const SPRING = APEX - Math.sqrt(3) * SPAN;
    /** One lancet at `a`, drawn `m` inside its stone: its outline, its outline as points, and its apex. */
    const lancet = (a: number, m: number) => {
      const [b, R, r1] = [SPAN - m, 2 * SPAN - m, FOOT_R + m];
      const footU = Math.sqrt(r1 * r1 - b * b);
      const apex = P(a, SPRING + Math.sqrt(R * R - SPAN * SPAN), 0);
      const side = (s: number) => ({ foot: P(a, footU, s * b), spring: P(a, SPRING, s * b), centre: P(a, SPRING, -s * SPAN) });
      const [r, l] = [side(1), side(-1)];
      const d = `M${pt(r.foot)}L${pt(r.spring)}` + arcTo(r.centre, r.spring, apex) + arcTo(l.centre, apex, l.spring) + `L${pt(l.foot)}` + arcTo(O, l.foot, r.foot) + 'Z';
      const pts = [r.foot, ...arcPts(r.centre, r.spring, apex), ...arcPts(l.centre, apex, l.spring), ...arcPts(O, l.foot, r.foot)];
      return { d, pts, apex };
    };
    /**
     * A roundel's cusping, `n` foils about `c` (the first toward `a`), as
     * far out as `reach`: each foil an arc of a circle struck from a point
     * round the middle, meeting the next at a sharp cusp.
     */
    const foils = (c: Pt, a: number, reach: number, n: number, spread: number) => {
      const phi = Math.PI / n;
      const rf = reach / (1 + spread);
      const d = spread * rf;
      const s0 = d * Math.cos(phi) + Math.sqrt(rf * rf - (d * Math.sin(phi)) ** 2);
      const cusp = (j: number) => atAbout(c, a + (j + 0.5) * (360 / n), s0);
      let out = `M${pt(cusp(-1))}`;
      for (let j = 0; j < n; j++) out += arcTo(atAbout(c, a + j * (360 / n), d), cusp(j - 1), cusp(j), s0 * Math.cos(phi) < d);
      return out + 'Z';
    };
    /** The largest roundel on the axis at `a` between `r0` and `r1` that keeps `clear` of every point of `walls`, and within the pane. */
    const roundelOn = (a: number, r0: number, r1: number, walls: Pt[], clear: number) => {
      let best = [0, 0];
      for (let rc = r0; rc < r1; rc += 0.02) {
        const c = at(a, rc);
        const room = Math.min(PANE - rc, ...walls.map((q) => dist(q, c) - clear));
        if (room > best[1]) best = [rc, room];
      }
      return { rc: best[0], rho: best[1] };
    };
    const WINDOW = (() => {
      const outer = Array.from({ length: LIGHTS }, (_, k) => lancet(k * 2 * HALF, 0));
      const inner = Array.from({ length: LIGHTS }, (_, k) => lancet(k * 2 * HALF, MOULD));
      // The great roundels between the heads, as large as the heads, the
      // ring and one another let them be; then the small ones beyond the
      // heads, in what room the great ones leave.
      const great = (() => {
        let best = { rc: 0, rho: 0 };
        for (let rc = SPRING; rc < PANE; rc += 0.02) {
          const c = at(HALF, rc);
          const rho = Math.min(PANE - rc, rc * Math.sin((HALF * Math.PI) / 180) - BAR, ...[0, 1].flatMap((n) => outer[n].pts.map((q) => dist(q, c) - 2 * BAR)));
          if (rho > best.rho) best = { rc, rho };
        }
        return best;
      })();
      const greatAt = (a: number) => at(a, great.rc);
      const greatWall = (a: number): Pt[] => [a - HALF, a + HALF].flatMap((b) => arcPts(greatAt(b), at(b, great.rc - great.rho), at(b, great.rc + great.rho), 24).concat(arcPts(greatAt(b), at(b, great.rc + great.rho), at(b, great.rc - great.rho), 24)));
      const small = roundelOn(0, APEX, PANE, [outer[0].apex, ...greatWall(0)], 2 * BAR);
      let roundels = '';
      let mould = inner.map((l) => l.d).join('');
      let cusps = '';
      for (let k = 0; k < LIGHTS; k++) {
        const a = k * 2 * HALF;
        const [g, sm] = [at(a + HALF, great.rc), at(a, small.rc)];
        roundels += round(g, great.rho) + round(sm, small.rho);
        mould += round(g, great.rho - MOULD);
        cusps += foils(g, a + HALF, great.rho - MOULD - 0.32, 4, 1.25);
      }
      // The morning star in the oculus.
      let star = '';
      let starShade = '';
      for (let k = 0; k < 5; k++) {
        const a = k * 72;
        const [l, r, tip] = [at(a - 36, 1.05), at(a + 36, 1.05), at(a, OCULUS - MOULD - 0.45)];
        star += `M${pt(l)}L${pt(tip)}L${pt(r)}M${pt(at(a, 0.35))}L${pt(tip)}`;
        starShade += hatch(O, r, tip, 0.4);
      }
      return { lights: outer.map((l) => l.d).join(''), mould, roundels, cusps, star, starShade };
    })();

    // ---- the rays and the glory ------------------------------------------------------
    // Five rays from the window's ring, between her loops, out under the
    // crossing where her petals meet, nearly to the Sun's round; each
    // ridged and cut down its clockwise side.
    const FOOT = HUB + 0.7;
    const RAY_TIP = UNDER_SUN - 2.2;
    const POINTS = Array.from({ length: 5 }, (_, k) => {
      const a = k * 72;
      const half = 7;
      const [base, l, r, tip] = [at(a, FOOT), at(a - half, FOOT), at(a + half, FOOT), at(a, RAY_TIP)];
      const n = Math.floor(dist(base, r) / 0.5);
      const strokes = Array.from({ length: n }, (_, i) => [lerp(base, r, (i + 1) / (n + 1)), lerp(tip, r, (i + 1) / (n + 1))] as [Pt, Pt]);
      return { k, a, outline: [l, tip, r], left: [l, tip] as [Pt, Pt], right: [r, tip] as [Pt, Pt], ridge: [base, tip] as [Pt, Pt], strokes };
    });
    /** How far `q` lies outside the outline `ps` (0 inside it). */
    const outside = (q: Pt, ps: Pt[]) => {
      let inside = false;
      let best = Infinity;
      for (let i = 0, j = ps.length - 1; i < ps.length; j = i++) {
        const [a, b] = [ps[i], ps[j]];
        if (a[1] > q[1] !== b[1] > q[1] && q[0] < ((b[0] - a[0]) * (q[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
        const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
        const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
        best = Math.min(best, Math.hypot(q[0] - a[0] - dx * t, q[1] - a[1] - dy * t));
      }
      return inside ? 0 : best;
    };
    // The glory: fine rays from the window's ring, long and short in turn,
    // seen only in the open heart between her loops, each stopping short of
    // every strand, ray and seal.
    const GLORY = Array.from({ length: 120 }, (_, k) => {
      const a = ((k + 0.5) / 120) * 360;
      const u = at(a, 1);
      // (Only the rays either side of it can come near it.)
      const near = POINTS.filter((ray) => Math.abs(((a - ray.a + 540) % 360) - 180) < 40);
      const open = (r: number) => {
        const q: Pt = [u[0] * r, u[1] * r];
        return fromVenus(q) > W + 1.3 && !pathHoles.some((h) => dist(q, h.c) < h.r + 0.6) && near.every(({ outline }) => outside(q, outline) > 1.1);
      };
      const step = 0.3;
      let r = HUB + 1.8;
      if (!open(r)) return '';
      while (r < SUN && open(r + step)) r += step;
      let [lo, hi] = [r, r + step];
      for (let n = 0; n < 6; n++) {
        const m = (lo + hi) / 2;
        if (open(m)) lo = m;
        else hi = m;
      }
      const end = lo - (k % 2 ? 2.6 : 0);
      return end - (HUB + 1.8) > 2.5 ? `M${pt(at(a, HUB + 1.8))}L${pt(at(a, end))}` : '';
    });
    // (In two sets, the long rays and the short, which swell and shrink out of step.)
    const GLORY_SETS = [0, 1].map((n) => GLORY.filter((_, k) => k % 2 === n).join(''));

    // Everything that wears, drawn twice: worn for the lines, whole for the
    // glow under them. The wear is one seeded run through the lines in this
    // order, so every circle is worn alike.
    const drawing = (worn: boolean) => {
      const w: Wear = worn ? wear(41) : null;
      return {
        band: [ringParts(O, RIM, { wear: w }), ringParts(O, BAND_OUT, { holes: bandHoles, wear: w }), ringParts(O, BAND_IN, { holes: bandHoles, wear: w })].map(
          (parts, k) => stroke(parts, 0.55 + k * 0.1, 1.1),
        ),
        sun: [SUN + W, SUN - W, SUN].map((r) => stroke(ringParts(O, r, { holes: [keyHole], wear: r === SUN ? null : w }), 0.35, 1.0)),
        path: [1, -1, 0].map((side) => stroke(pathParts(side, pathHoles, side ? w : null), 0.3, 1.4)),
        hub: stroke(ringParts(O, HUB, { wear: w }), 0.05, 0.6),
        rays: POINTS.map(({ k, left, right }) => [left, right].flatMap((edge) => stroke(underPath(...edge, pathHoles, W + GAP, w), 0.3 + k * 0.06, 0.5))),
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
      // Her path, traced as she runs it, both edges at once, eight years in
      // under a second and a half, inside the Sun's round; and the rays
      // between her loops, shooting out from the window.
      path: engrave((e) => {
        p.sun.forEach((list, k) => e.pieces(list, k < 2 ? 'thin' : 'hair'));
        p.path.forEach((list, k) => e.pieces(list, k < 2 ? 'thin' : 'hair'));
        p.rays.forEach((list) => e.pieces(list, 'thin'));
        POINTS.forEach(({ k, ridge, strokes }) => {
          e.line(joinedParts(underPath(...ridge, pathHoles)), 'hair', 0.35 + k * 0.06, 0.45);
          e.line(strokes.map((s) => joinedParts(underPath(...s, pathHoles))).join(''), 'hatch', 0.55 + k * 0.06, 0.45);
        });
      }),
      // The window's ring, still; and the window turning within it.
      heart: engrave((e) => {
        e.pieces(p.hub, 'thin');
        e.line(circle(HUB - 1.2), 'hair', 0.1, 0.5);
      }),
      window: engrave((e) => {
        e.line(WINDOW.lights, 'thin', 0.25, 0.5);
        e.line(WINDOW.roundels, 'thin', 0.4, 0.4);
        e.line(WINDOW.mould, 'hair', 0.45, 0.5);
        e.line(WINDOW.cusps, 'sign', 0.6, 0.5);
      }),
      // The oculus, and the morning star in it, turning on its own.
      oculus: engrave((e) => {
        e.line(circle(OCULUS), 'thin', 0.15, 0.4);
        e.line(circle(OCULUS - MOULD), 'hair', 0.25, 0.4);
      }),
      star: engrave((e) => {
        e.line(WINDOW.star, 'sign', 0.75, 0.4);
        e.line(WINDOW.starShade, 'hatch', 0.85, 0.3);
      }),
      ...Object.fromEntries(GLORY_SETS.map((d, n) => [`glory${n}`, engrave((e) => e.line(d, 'hair', 0.75 + n * 0.05, 0.7))])),
      // The seals in her petals, the wheel's seal, and the wheel's inner ring.
      ...Object.fromEntries(lesser.map(({ c }, k) => [`seal${k}`, engrave((e) => seal(e, 1.0 + k * 0.08, c, 0, LESSER, 1.4, LESSER_SIGNS[k]))])),
      key: engrave((e) =>
        seal(e, 1.05, key, 0, KEY_SEAL, 2.2, [
          [WHEEL.lines, '', 1],
          [WHEEL.letters, 'sign', 1],
          [WHEEL.star, 'sign', 1],
          [WHEEL.shade, 'hatch', 1],
        ]),
      ),
      dial: engrave((e) => {
        e.line(placed(DIAL.lines, key, 0, WK), '', 1.3, 0.4);
        e.line(placed(DIAL.letters, key, 0, WK), 'sign', 1.45, 0.4);
      }),
    });
    const GLOW = layers(drawing(false));
    const LINES = layers(drawing(true));
    const layer = (name: string, more: Partial<StageLayer> = {}): StageLayer => ({ name, lines: LINES[name], glow: GLOW[name], ...more });
    // Each ring turns its own way and speed, and first winds into place: the
    // band one way, the path and all it carries the other, the window at the
    // heart against the path and the morning star in its oculus against the
    // window, swelling and ebbing as it goes. The moons ride the band
    // upright, the seals and the wheel the path, the wheel's inner ring
    // turning; the glory swells and shrinks, its long rays and its short out
    // of step.
    const LAYERS = [
      layer('band', { spin: { turn: 240, from: 24, reverse: true } }),
      ...moons.map(({ c }, k) => layer(`moon${k}`, { within: 'band', pivot: c, upright: true })),
      layer('path', { spin: { turn: 160, from: -40 } }),
      layer('heart'),
      layer('window', { spin: { turn: 100, from: 18, reverse: true } }),
      layer('oculus', { spin: { turn: 60, from: -30 } }),
      layer('star', { within: 'oculus', breathe: { low: 0.88, period: 5.2 } }),
      layer('glory0', { within: 'path', breathe: { low: 0.97, period: 4.4 } }),
      layer('glory1', { within: 'path', breathe: { low: 0.95, period: 3.6, delay: -1.8 } }),
      ...lesser.map(({ c }, k) => layer(`seal${k}`, { within: 'path', pivot: c, upright: true })),
      layer('key', { within: 'path', pivot: key, upright: true }),
      layer('dial', { within: 'key', pivot: key, spin: { turn: 70, from: -60 } }),
    ];
    return LAYERS;
  };
  const plate = () => (built ??= build());
  export const warm = () => whenIdle(() => plate(), { timeout: 5000, fallback: 1500 });
</script>

<script lang="ts">
  import ArcaneStage from './ArcaneStage.svelte';

  let { state, size, color, strength }: { state?: 'idle' | 'good' | 'bad'; size?: string; color?: string; strength?: number } = $props();

  const LAYERS = plate();
</script>

<!--
  The summoning, in seconds from the start: a light blooms at the centre,
  the window's ring draws, its lancets and roundels are struck and cusped
  and the morning star cut in its oculus, and five rays shoot out from it;
  the Sun's round is drawn and Venus's path traced within it as she runs
  it, eight years in a second and a half, and the glory shines out after
  her; the band's rings sweep round, the moons are stamped into them and
  the script written; and last, the seals are stamped in her petals and
  the wheel's inner ring set turning.
-->

<ArcaneStage layers={LAYERS} {state} {size} {color} {strength} />
