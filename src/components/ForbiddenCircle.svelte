<script module lang="ts">
  import { angleOf, at as atAbout, f, hatch, lerp, line, lineParts, pt, ring as round, ringParts, seeded, wear, wovenPolygons, type Hole, type Part, type Pt, type Strap, type Wear } from '../lib/arcane';
  import { engrave, mapPath, stroke, turned, type Engraver, type Plate } from '../lib/engraver';
  import { inscribe } from '../lib/tongue';
  import { whenIdle } from '../lib/idle';
  import type { StageLayer } from './ArcaneStage.svelte';

  // The plate is built once, the first time a circle is mounted, or before
  // that in an idle moment when a page about to show it asks (`warm`, through
  // circles.ts), so its geometry never weighs on a page's first frames and
  // a page never builds a circle it won't show.
  let built: StageLayer[] | undefined;
  const build = (): StageLayer[] => {
    // The forbidden circle, a sibling of the rune circle (ArcaneCircle; see
    // docs/arcane-style.md): the circle drawn to call a soul back from the
    // dead, the art no alchemist may practise. From the outside in, turning
    // in layers:
    // • the band: the black of the work, the matter's death, in seven signs
    //   of the old tables in seals, from quicklime round to the dead head
    //   left in the retort; the script between them;
    // • a heptagon, the wall the seals are set in, and a circle inside it;
    // • in the heptagon's corners a point, cut down one side, all but the
    //   one straight down, under the triangle's own point;
    // • a triangle pointing down, the triangle of art in which a called
    //   spirit must appear, each point cut in close strokes down one side
    //   and held in a crescent of the script that reaches out to the circle;
    //   beside its sides, in three seals, Saturn's own seal as Agrippa
    //   printed it, the seal of Sabnock, who rots the flesh, and the seal of
    //   Murmur, who calls the dead to answer; a
    //   glory of fine rays out from the heart to the circle, under the
    //   triangle;
    // • at the heart, still and upright, the soul called back: a death's-head
    //   hawkmoth, its wings spread and now and then stirring, in a glory of
    //   its own.
    // Lines stop short of whatever lies over them and carry the odd nick.
    // It is set on the ArcaneStage, which turns, lights and colours it.
    const O: Pt = [0, 0];
    /** The point at `a` degrees clockwise from the top, `r` from the centre. */
    const at = (a: number, r: number) => atAbout(O, a, r);
    const dist = (p: Pt, q: Pt) => Math.hypot(p[0] - q[0], p[1] - q[1]);
    /** The arc about `c` from `a0` to `a1` degrees (clockwise, `a0` < `a1`), as path data. */
    const arcD = (c: Pt, r: number, a0: number, a1: number) => {
      const n = Math.max(1, Math.ceil((a1 - a0) / 170));
      let d = `M${pt(atAbout(c, a0, r))}`;
      for (let k = 1; k <= n; k++) d += `A${f(r)} ${f(r)} 0 0 1 ${pt(atAbout(c, a0 + ((a1 - a0) * k) / n, r))}`;
      return d;
    };
    /** The arc about `c` from `a0` to `a1` degrees in pieces (broken at holes, worn), each placed along the arc (0 to 1). */
    const arcParts = (c: Pt, r: number, a0: number, a1: number, opts: { holes?: Hole[]; wear?: Wear } = {}): Part[] =>
      ringParts(c, r, { ...opts, cuts: [[a1, a0 + 360]] }).map((p) => {
        const from = ((((p.from * 360 - a0) % 360) + 360) % 360) / (a1 - a0);
        return { ...p, from, to: from + ((p.to - p.from) * 360) / (a1 - a0) };
      });
    /** Where along the arc about `c` from `a0` to `a1` the points satisfy `ok`, as [from, to] in degrees (sampled, drawn as true arcs). */
    const spans = (c: Pt, r: number, a0: number, a1: number, ok: (q: Pt) => boolean, step = 0.2) => {
      const out: [number, number][] = [];
      let from: number | null = null;
      for (let a = a0; a <= a1 + 1e-9; a += step) {
        const yes = ok(atAbout(c, a, r));
        if (yes && from === null) from = a;
        if (!yes && from !== null) out.push([from, a - step]), (from = null);
      }
      if (from !== null) out.push([from, a1]);
      return out.filter(([x, y]) => y - x > step);
    };
    /** The straight line from `p` to `q` where its points satisfy `ok` (sampled, drawn as straight pieces). */
    const runs = (p: Pt, q: Pt, ok: (q: Pt) => boolean, step = 0.05) => {
      const n = Math.max(1, Math.ceil(dist(p, q) / step));
      let d = '';
      let from: Pt | null = null;
      let last: Pt | null = null;
      const flush = () => {
        if (from && last && dist(from, last) > 0.25) d += `M${pt(from)}L${pt(last)}`;
        from = null;
      };
      for (let i = 0; i <= n; i++) {
        const s: Pt = [p[0] + ((q[0] - p[0]) * i) / n, p[1] + ((q[1] - p[1]) * i) / n];
        if (ok(s)) {
          from ??= s;
          last = s;
        } else flush();
      }
      flush();
      return d;
    };
    type Arc = { c: Pt; r: number; a0: number; a1: number };
    /** The arc from `p` through `m` to `q`. */
    const through = (p: Pt, m: Pt, q: Pt): Arc => {
      const [ax, ay] = p;
      const [bx, by] = m;
      const [cx, cy] = q;
      const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
      const c: Pt = [
        ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d,
        ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d,
      ];
      const cw = (x: number, y: number) => (((y - x) % 360) + 360) % 360;
      const [ap, am, aq] = [p, m, q].map((s) => angleOf(c, s));
      return cw(ap, am) < cw(ap, aq) ? { c, r: dist(c, p), a0: ap, a1: ap + cw(ap, aq) } : { c, r: dist(c, p), a0: aq, a1: aq + cw(aq, ap) };
    };
    /** The arc `p`, `q` bowed `sag` to the right of the way from `p` to `q` (on the page). */
    const bowed = (p: Pt, q: Pt, sag: number) => {
      const len = dist(p, q);
      const [nx, ny] = [-(q[1] - p[1]) / len, (q[0] - p[0]) / len];
      return through(p, [(p[0] + q[0]) / 2 + nx * sag, (p[1] + q[1]) / 2 + ny * sag], q);
    };
    const flip = (p: Pt): Pt => [-p[0], p[1]];
    const flipArc = ({ c, r, a0, a1 }: Arc): Arc => ({ c: flip(c), r, a0: -a1, a1: -a0 });
    const arcPath = ({ c, r, a0, a1 }: Arc) => arcD(c, r, a0, a1);
    const arcPts = ({ c, r, a0, a1 }: Arc, step = 0.3) => {
      const n = Math.max(2, Math.ceil(((((a1 - a0) * Math.PI) / 180) * r) / step));
      return Array.from({ length: n + 1 }, (_, i) => atAbout(c, a0 + ((a1 - a0) * i) / n, r));
    };
    /** The pieces of `arc` whose points satisfy `ok`, as arcs. */
    const trimmed = (arc: Arc, ok: (q: Pt) => boolean): Arc[] => spans(arc.c, arc.r, arc.a0, arc.a1, ok, 0.1).map(([a0, a1]) => ({ ...arc, a0, a1 }));
    const inDisc = (q: Pt, a: Arc, g = 0) => dist(q, a.c) < a.r - g;
    /** Whether `q` lies within `g` of the line of `arc`. */
    const nearArc = (q: Pt, arc: Arc, g: number) => {
      if (Math.abs(dist(q, arc.c) - arc.r) > g) return false;
      const t = (((angleOf(arc.c, q) - arc.a0) % 360) + 360) % 360;
      return t <= arc.a1 - arc.a0;
    };
    /** Arcs end to end as one line from `p`, each from where the last ended, so they meet in a mitred corner. */
    const chain = (p: Pt, arcs: Arc[]) => {
      let d = `M${pt(p)}`;
      let cur = p;
      for (const { c, r, a0, a1 } of arcs) {
        const [s, e] = [atAbout(c, a0, r), atAbout(c, a1, r)];
        const fwd = dist(s, cur) <= dist(e, cur);
        const n = Math.max(1, Math.ceil((a1 - a0) / 170));
        for (let k = 1; k <= n; k++) d += `A${f(r)} ${f(r)} 0 0 ${fwd ? 1 : 0} ${pt(atAbout(c, fwd ? a0 + ((a1 - a0) * k) / n : a1 - ((a1 - a0) * k) / n, r))}`;
        cur = fwd ? e : s;
      }
      return d;
    };
    /**
     * The corners of a closed polygon's line, each side drawn on its own in
     * pieces (`parts`, along `sides`): where both sides run unbroken into a
     * corner, the last of the one and the first of the next as one short
     * line, so the corner is mitred and not notched; each set when the pen
     * reaches it (`done`, by side).
     */
    const corners = (sides: [Pt, Pt][], parts: Part[][], done: (i: number) => number) =>
      sides.flatMap(([p, q], i) => {
        const j = (i + 1) % sides.length;
        const [a, b] = [parts[i].at(-1), parts[j][0]];
        if (!a || !b || a.to < 1 - 1e-6 || b.from > 1e-6) return [];
        const s = sides[j][1];
        return [{ d: `M${pt(lerp(q, p, 0.4 / dist(p, q)))}L${pt(q)}L${pt(lerp(q, s, 0.4 / dist(q, s)))}`, delay: done(i), t: 0.03 }];
      });

    // ---- the band: the seven signs of the black ---------------------------------
    const RIM = 97.5;
    const BAND_OUT = 94;
    const BAND_IN = 81;
    const BAND = (BAND_IN + BAND_OUT) / 2;
    const SEAL = 7.2;
    const seals = Array.from({ length: 7 }, (_, k) => ({ a: (k * 360) / 7, c: at((k * 360) / 7, BAND) }));
    const bandHoles: Hole[] = seals.map(({ c }) => ({ c, r: SEAL + 1.2 }));
    const rnd = seeded(97);
    const SCRIPT = seals.flatMap(({ a }) => inscribe(a + 7.5, a + 360 / 7 - 7.5, BAND, rnd, 1.2));
    /** A circle about (`x`, `y`), as path data. */
    const ring = (x: number, y: number, r: number) => round([x, y], r);
    // The black of the work, the nigredo, in seven signs of the old tables,
    // read clockwise from the top as the matter goes down into it, each on a
    // grid of about ±4.5 and drawn with the pen's curves, as the planets'
    // are, each with about as much line as the next: burnt, ashed, eaten,
    // buried, rotted, sunk, and what is left at the last.
    const NIGREDO = [
      // Quicklime, calx viva, the fire that burns the body: a cup of two
      // horns, their tips turned out, on a crossed stem.
      'M-2.6 -4.1C-2.6 -1.9 -1.3 -1 0 -1C1.3 -1 2.6 -1.9 2.6 -4.1M-2.6 -4.1C-2.9 -4.5 -3.5 -4.3 -3.4 -3.7M2.6 -4.1C2.9 -4.5 3.5 -4.3 3.4 -3.7M0 -1V4.4M-1.9 2H1.9',
      // Ashes: an E turned about, its arms bowed and flicked at their ends,
      // its middle arm run on out through the spine.
      'M-2.7 -3.5C-1.1 -4.17 0.3 -4.3 1.5 -3.9V3.9C0.3 4.3 -1.1 4.17 -2.7 3.5M-2.2 0H3.6M-2.7 -3.5L-3 -2.9M-2.7 3.5L-3 2.9',
      // Vinegar, the sharp water that eats the body: a cross, each arm
      // ending in a cusp bowed outward.
      'M0 -3.6V3.6M-3.6 0H3.6M-1.1 -3.2C-0.37 -4 0.37 -4 1.1 -3.2M-1.1 3.2C-0.37 4 0.37 4 1.1 3.2M-3.2 -1.1C-4 -0.37 -4 0.37 -3.2 1.1M3.2 -1.1C4 -0.37 4 0.37 3.2 1.1',
      // Horse dung, the horse's belly, whose slow heat the matter is buried
      // in to rot: a stem parting into two arms that curve up to rings, a
      // bar between the rings.
      (() => {
        const [x, y, r] = [2.4, -3.3, 0.65];
        return (
          ring(-x, y, r) +
          ring(x, y, r) +
          `M${f(-x + r)} ${f(y)}H${f(x - r)}M0 4.4V0.2C0 -1.2 ${f(-x)} -1.4 ${f(-x)} ${f(y + r)}M0 0.2C0 -1.2 ${f(x)} -1.4 ${f(x)} ${f(y + r)}`
        );
      })(),
      // Putrefaction: a barred stem between two horns, the right one running
      // out into an arrow.
      (() => {
        const [R, y, th] = [3, -1.9, (62 * Math.PI) / 180];
        const tip: Pt = [R * Math.sin(th), y - R + R * Math.cos(th)];
        const back = Math.atan2(Math.sin(th), -Math.cos(th));
        const barb = (s: number): Pt => [tip[0] + 1.3 * Math.cos(back + s * 0.5), tip[1] + 1.3 * Math.sin(back + s * 0.5)];
        return `M0 -4.4V4.4M-1.5 2.4H1.5M-2.1 -4.4V-4A2.1 2.1 0 0 0 0 ${y}A${R} ${R} 0 0 0 ${pt(tip)}M${pt(barb(1))}L${pt(tip)}L${pt(barb(-1))}`;
      })(),
      // Tartar, the lees that sink to the foot of the cask: a pointed oval
      // on a crossed stem.
      'M0 -4.6A2.2 2.2 0 0 1 0 -0.6A2.2 2.2 0 0 1 0 -4.6ZM0 -0.6V4.4M-1.7 2.2H1.7',
      // The caput mortuum, the dead head left in the retort when all the
      // spirit is drawn off: a round open at its foot, three points within.
      (() => {
        const r = 3.3;
        return `M${pt(at(215, r))}A${f(r)} ${f(r)} 0 1 1 ${pt(at(145, r))}` + ring(0, -1.25, 0.45) + ring(-1.2, 0.85, 0.45) + ring(1.2, 0.85, 0.45);
      })(),
    ];

    // ---- the wall: the heptagon and its circle ---------------------------------
    // The heptagon in double straps, its corners between the seals, one
    // straight down; the circle inside it.
    const W = 0.9;
    const TW = 1.2;
    const GAP = 0.7;
    const H = 78.4;
    const hept = wovenPolygons([Array.from({ length: 7 }, (_, k) => at(((k + 0.5) * 360) / 7, H))], W, GAP);
    const INRAD = H * Math.cos(Math.PI / 7);
    const CIRCLE = INRAD - W - GAP - 0.3;
    // In its corners a point, ridged and cut down its anticlockwise side,
    // from the circle toward the band between two seals; all but the corner
    // straight down, which the triangle's own point stands over.
    const [POINT_IN, POINT_OUT] = [CIRCLE + GAP + 0.3, H - W / Math.sin((5 * Math.PI) / 14) - 1.5];
    const CORNER_POINTS = [0, 1, 2, 4, 5, 6].map((k) => {
      const a = ((k + 0.5) * 360) / 7;
      const [base, l, r, tip] = [at(a, POINT_IN), at(a - 2.6, POINT_IN), at(a + 2.6, POINT_IN), at(a, POINT_OUT)];
      return { k, lines: `M${pt(l)}L${pt(tip)}L${pt(r)}` + line(base, tip), hatch: hatch(base, l, tip, 0.5) };
    });

    // ---- the triangle -------------------------------------------------------------
    // In triple straps, pointing down, its points well clear of the circle.
    const T = 61;
    const CORNERS = [60, 180, 300];
    const tri = wovenPolygons([CORNERS.map((a) => at(a, T))], TW, GAP);
    const TRI_SIDES = [1, 0, -1];
    const triUnder: Strap[] = tri.straps.map((s) => ({ p: s.p, q: s.q, w: TW + GAP }));

    // ---- the crescents at the points ------------------------------------------------
    // Each a band about its point, on the heart's side, lying over the
    // triangle and reaching out either way to the circle, where it passes
    // under; a phrase of the script at its foot, run out to both ends in a
    // double rule.
    const CR_IN = 14.5;
    const CR_OUT = 20.5;
    const CR = (CR_IN + CR_OUT) / 2;
    const RULE = 0.7;
    const points = CORNERS.map((a, k) => {
      const C = at(a, T);
      const toward = angleOf(C, O);
      /** How far round from the heart's side a circle about the point of radius `r` runs before it meets the circle. */
      const reach = (r: number) => spans(C, r, toward - 179, toward + 179, (q) => dist(q, O) < CIRCLE - GAP)[0];
      return { k, C, toward, reach };
    });
    const crRings = points.map(({ C }) => ({ c: C, r: CR, w: (CR_OUT - CR_IN) / 2 + GAP }));
    const crRnd = seeded(131);
    const CR_SCRIPT = points.flatMap(({ C, toward }) => {
      const half = ((8 / CR) * 180) / Math.PI;
      return inscribe(toward - half, toward + half, CR, crRnd, 0.75).map((m) => ({ ...m, C }));
    });
    // (Each rule stops as far short of the letters' own ends as the other.)
    const RULE_CLEAR = 0.75;
    /** How far a mark of the script reaches either side of its place, along its line, in degrees. */
    const reachOf = (d: string) => {
      const xs: number[] = [];
      mapPath(d, (q) => (xs.push(q[0]), q));
      return [Math.min(...xs), Math.max(...xs)].map((x) => ((x / CR) * 180) / Math.PI);
    };
    const CR_RULES = points
      .map(({ C, reach }) => {
        const marks = CR_SCRIPT.filter((m) => m.C === C);
        const clear = ((RULE_CLEAR / CR) * 180) / Math.PI;
        const [lo, hi] = [Math.min(...marks.map((m) => m.a + reachOf(m.d)[0])) - clear, Math.max(...marks.map((m) => m.a + reachOf(m.d)[1])) + clear];
        return [CR - RULE, CR + RULE]
          .map((r) => {
            const [a0, a1] = reach(r);
            return arcD(C, r, a0, lo) + arcD(C, r, hi, a1);
          })
          .join('');
      })
      .join('');
    // Within each crescent, a ridge down the point's middle and its
    // anticlockwise half cut in close strokes along it.
    const TIPS = points.map(({ C, toward }) => {
      const u = atAbout(O, toward, 1);
      const side = atAbout(O, toward - 90, 1);
      const [near, far] = [2 * (TW + 0.6), CR_IN - GAP];
      const along = (s: number, x: number): Pt => [C[0] + u[0] * s + side[0] * x, C[1] + u[1] * s + side[1] * x];
      let shade = '';
      for (let x = 0.5; x < far; x += 0.5) {
        const s0 = near + x / Math.tan(Math.PI / 6);
        const s1 = Math.sqrt(far * far - x * x);
        if (s1 - s0 > 0.3) shade += `M${pt(along(s0, x))}L${pt(along(s1, x))}`;
      }
      return { ridge: `M${pt(along(near, 0))}L${pt(along(far, 0))}`, shade };
    });

    // ---- the sigils --------------------------------------------------------------------
    // Beside the triangle's sides, each upright in a seal: over the moth,
    // the seal of Saturn as Agrippa printed it (De occulta philosophia,
    // 1533, book II, its table of Saturn), three strokes crossing, six rings
    // at their ends; and either side of it, from the Goetia, the seals of
    // two of its spirits (below). Drawn from the printed figures, their
    // hand's wavering made straight and round, the seal of Saturn turned
    // exactly about its middle, each sized so the three fill their seals
    // alike. Where two of the seal of Saturn's strokes cross, the later
    // stops short.
    const SIGIL_SEAL = 9.2;
    const SIGIL_AT = (T / 2 + TW + CIRCLE) / 2;
    const spirits = [0, 120, 240].map((a) => ({ a, c: at(a, SIGIL_AT) }));
    const sigilHoles: Hole[] = spirits.map(({ c }) => ({ c, r: SIGIL_SEAL + 1.4 }));
    const [END, UNDER] = [0.62, 0.5];
    /** Where along `p` to `q` (as distances from `p`) it crosses each of `under`'s strokes. */
    const crossings = (p: Pt, q: Pt, under: [Pt, Pt][]) =>
      under
        .map(([r, t]) => {
          const [dx, dy, ex, ey] = [q[0] - p[0], q[1] - p[1], t[0] - r[0], t[1] - r[1]];
          const den = dx * ey - dy * ex;
          if (Math.abs(den) < 1e-9) return null;
          const a = ((r[0] - p[0]) * ey - (r[1] - p[1]) * ex) / den;
          const b = ((r[0] - p[0]) * dy - (r[1] - p[1]) * dx) / den;
          return a > 0.01 && a < 0.99 && b > 0.01 && b < 0.99 ? a * dist(p, q) : null;
        })
        .filter((t): t is number => t !== null)
        .sort((x, y) => x - y);
    /**
     * Straight strokes through `pts`, a ring at either end (`rings`), each
     * stroke stopping short where it crosses one drawn before it (`under`,
     * which it joins).
     */
    const strokes = (pts: Pt[], under: [Pt, Pt][], rings: [boolean, boolean] = [true, true]) => {
      let d = rings[0] ? ring(pts[0][0], pts[0][1], END) : '';
      if (rings[1]) d += ring(pts[pts.length - 1][0], pts[pts.length - 1][1], END);
      pts.slice(1).forEach((q, i) => {
        const p = pts[i];
        const len = dist(p, q);
        const u: Pt = [(q[0] - p[0]) / len, (q[1] - p[1]) / len];
        const along = (t: number): Pt => [p[0] + u[0] * t, p[1] + u[1] * t];
        let from = i === 0 && rings[0] ? END : 0;
        const to = i === pts.length - 2 && rings[1] ? len - END : len;
        // (A piece too short to read as a line between two crossings is left out.)
        const piece = (a: number, b: number) => (b - a > 0.45 ? `M${pt(along(a))}L${pt(along(b))}` : '');
        for (const c of crossings(p, q, under)) {
          d += piece(from, c - UNDER);
          from = c + UNDER;
        }
        d += piece(from, to);
      });
      pts.slice(1).forEach((q, i) => under.push([pts[i], q]));
      return d;
    };
    // The seal of Saturn: a stroke from corner to corner, and two bent
    // strokes, each the other turned half round.
    const SATURN_SEAL = (() => {
      const k = 0.94;
      const bent: Pt[] = [
        [0.52 * k, -4.79 * k],
        [-3.25 * k, 2.66 * k],
        [5.84 * k, -0.52 * k],
      ];
      const under: [Pt, Pt][] = [];
      return [
        strokes([[-4.4 * k, -4.32 * k], [4.4 * k, 4.32 * k]], under),
        strokes(bent, under),
        strokes(bent.map(([x, y]): Pt => [-x, y * -1]), under),
      ];
    })();
    // Sabnock, the Goetia's forty-third spirit, who sends wounds that rot
    // and fill with worms: his seal, a scroll curled at its end, a cup
    // standing through it on two rings, its stem down to a ring, and across
    // the stem an arrow, from a barb at the left through a point and a comb
    // to a double ring at the right.
    const SABNOCK = (() => {
      const k = 0.93;
      const P = (x: number, y: number) => `${f(x * k)} ${f((y + 0.35) * k)}`;
      const R = (r: number) => f(r * k);
      const circleAt = (x: number, y: number, r: number) => `M${P(x, y - r)}A${R(r)} ${R(r)} 0 1 1 ${P(x, y + r)}A${R(r)} ${R(r)} 0 1 1 ${P(x, y - r)}Z`;
      // The scroll: two lines closed round at the left, the upper curled up
      // into a spiral at the right.
      const scroll =
        `M${P(1.9, -2.5)}H${f(-5.1 * k)}A${R(0.45)} ${R(0.45)} 0 0 1 ${P(-5.1, -3.4)}H${f(2.8 * k)}` +
        `A${R(0.85)} ${R(0.85)} 0 1 0 ${P(3.65, -4.25)}A${R(0.42)} ${R(0.42)} 0 1 0 ${P(3.2, -4.25)}`;
      // The cup, its arms up through the scroll to the two rings.
      const [L, Rt, CUP] = [-3.35, -0.15, -1.6];
      const cup = `M${P(L, -3.35)}V${f((CUP + 0.35) * k)}A${R(1.6)} ${R(1.6)} 0 0 0 ${P(Rt, CUP)}V${f((-3.35 + 0.35) * k)}`;
      const rings = circleAt(L, -3.9, 0.55) + circleAt(Rt, -3.9, 0.55);
      const stem = `M${P(-1.75, 0)}V${f((3.05 + 0.35) * k)}` + circleAt(-1.75, 3.6, 0.55);
      // The arrow: a barb at its left, a point on it, a comb across it, a double ring at its end.
      const Y = 1.75;
      const arrow =
        `M${P(-6.1, Y)}L${P(-4.95, Y - 0.95)}V${f((Y + 0.35) * k)}M${P(-6.1, Y)}H${f(4.9 * k)}` +
        `M${P(1.05, Y - 0.75)}L${P(2.35, Y)}L${P(1.05, Y + 0.75)}Z` +
        `M${P(2.85, 0.1)}H${f(3.75 * k)}V${f((3.4 + 0.35) * k)}H${f(2.85 * k)}Z` +
        [0.92, 2.58].map((y) => `M${P(2.85, y)}H${f(3.75 * k)}`).join('') +
        circleAt(5.65, Y, 0.75) +
        circleAt(5.65, Y, 0.3);
      return [scroll + rings, cup + stem, arrow];
    })();
    // Murmur, the Goetia's fifty-fourth spirit, who calls the souls of the
    // dead to come and answer: his seal, a saltire barred at its ends, a
    // bar across between two crescents turned outward, and an upright with
    // a trident above, crossed below it, and crossed twice at its foot.
    const MURMUR = (() => {
      const k = 0.86;
      const [X, B, C, R, IN] = [4.5 * k, 0.75 * k, 4.75 * k, 1.4 * k, 1.35 * k];
      const p = (x: number, y: number) => `${f(x)} ${f(y)}`;
      const saltire = [1, -1]
        .map((s) => `M${p(-X * s, -X)}L${p(X * s, X)}`)
        .join('');
      const bars = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ]
        .map(([sx, sy]) => {
          // Across the arm's end, square to it.
          const [nx, ny] = [-sy * B * Math.SQRT1_2, sx * B * Math.SQRT1_2];
          return `M${p(sx * X + nx, sy * X + ny)}L${p(sx * X - nx, sy * X - ny)}`;
        })
        .join('');
      // Each crescent: its back to the middle, its horns turned outward.
      const crescent = (s: 1 | -1) => {
        const cx = s * C;
        const hx = cx + s * 0.6 * k;
        const hy = Math.sqrt(R * R - (0.6 * k) ** 2);
        return `M${p(hx, -hy)}A${f(R)} ${f(R)} 0 1 ${s > 0 ? 0 : 1} ${p(hx, hy)}A${f(IN)} ${f(IN)} 0 0 ${s > 0 ? 1 : 0} ${p(hx, -hy)}`;
      };
      const across = `M${p(-(C - R), 0)}H${f(C - R)}`;
      const [TOP, FOOT] = [-6.1 * k, 5.6 * k];
      const upright = `M0 ${f(TOP)}V${f(FOOT)}`;
      const trident = `M${p(-1.35 * k, TOP + 0.4 * k)}V${f(-4.75 * k)}A${f(1.35 * k)} ${f(1.35 * k)} 0 0 0 ${p(1.35 * k, -4.75 * k)}V${f(TOP + 0.4 * k)}`;
      const crossed = [-3.0, 3.1].map((y) => `M${p(-0.9 * k, y * k)}H${f(0.9 * k)}`).join('') + `M${p(-1.25 * k, FOOT)}H${f(1.25 * k)}`;
      return [saltire + bars, across + crescent(-1) + crescent(1), upright + trident + crossed];
    })();
    const SIGILS = [SATURN_SEAL, SABNOCK, MURMUR];

    // ---- the glory ---------------------------------------------------------------------
    // Fine rays from the heart out to the circle, long and short in turn,
    // passing under the triangle, stopping short of the seals and the
    // crescents.
    const HEART = 26.8;
    const HEART_IN = HEART - 1.3;
    const GLORY_N = 72;
    const GLORY = Array.from({ length: GLORY_N }, (_, k) => {
      const a = ((k + 0.5) / GLORY_N) * 360;
      const u = at(a, 1);
      let end = CIRCLE - (k % 2 ? 5.5 : 1.4);
      for (let r = HEART + 1.4; r < end; r += 0.1)
        if (points.some(({ C }) => dist([u[0] * r, u[1] * r], C) < CR_OUT + GAP)) {
          end = r - 0.1;
          break;
        }
      // (No stub left where a ray passes close under the triangle.)
      return lineParts(at(a, HEART + 1.4), at(a, end), { under: triUnder, holes: sigilHoles }).filter((q) => (q.to - q.from) * (end - HEART - 1.4) > 1.2);
    });

    // ---- the moth -------------------------------------------------------------------
    // The death's-head hawkmoth, Acherontia atropos, named for the river of
    // the dead and the Fate who cuts the thread: seen from above, its wings
    // spread, every edge an arc, drawn on a grid of about ±30 and set down
    // at `MOTH_K` of that. Light falls from the upper left.
    const MOTH_K = 0.8;
    const both = (arcs: Arc[]) => [...arcs, ...arcs.map(flipArc)].map(arcPath).join('');
    const oval = (c: Pt, rx: number, ry: number) => `M${f(c[0])} ${f(c[1] - ry)}A${rx} ${ry} 0 1 1 ${f(c[0])} ${f(c[1] + ry)}A${rx} ${ry} 0 1 1 ${f(c[0])} ${f(c[1] - ry)}Z`;
    const inOval = (q: Pt, c: Pt, rx: number, ry: number, g = 0) => ((q[0] - c[0]) / (rx - g)) ** 2 + ((q[1] - c[1]) / (ry - g)) ** 2 < 1;
    // The body: the head and the thorax ovals, the abdomen a long lens ringed
    // in segments, each shaded down its right.
    const THX: Pt = [0, -1.6];
    const [TRX, TRY] = [3.6, 4.6];
    const HEAD: Pt = [0, -8.45];
    const [HRX, HRY] = [2.3, 1.8];
    const inThorax = (q: Pt, g = 0) => inOval(q, THX, TRX, TRY, g);
    // The thorax's shoulder plates, either side of its middle, where the point is.
    const TEGULA = trimmed(through([2.0, -5.6], [2.6, -1.4], [2.1, 2.6]), (q) => inThorax(q, 0.35));
    const ABD_TOP = 3.45;
    const abdR = through([2.9, ABD_TOP], [3.25, 9.5], [0, 22.5]);
    const abdL = flipArc(abdR);
    const abdTop = through([-2.9, ABD_TOP], [0, 3.3], [2.9, ABD_TOP]);
    const inAbdomen = (q: Pt, g = 0) => inDisc(q, abdR, g) && inDisc(q, abdL, g) && inDisc(q, abdTop, g);
    /** Where the abdomen's side stands at height `y`. */
    const abdX = (y: number) => abdR.c[0] + Math.sqrt(Math.max(0, abdR.r ** 2 - (y - abdR.c[1]) ** 2));
    const SEGMENTS = [5.9, 8.3, 10.6, 12.8, 14.9, 16.9, 18.8, 20.5].map((y) => {
      const x = abdX(y);
      return through([-x, y], [0, y + 0.45], [x, y]);
    });
    // The forewing (the right; the left is its mirror): its leading edge
    // nearly straight out to a sharp tip, its outer edge sweeping back.
    const FW = { b0: [3.9, -4.4] as Pt, apex: [28.2, -8.6] as Pt, tornus: [18.6, 6.4] as Pt, b1: [3.7, 0.6] as Pt };
    const costa = bowed(FW.b0, FW.apex, -1.1);
    const termen = bowed(FW.apex, FW.tornus, -1.6);
    const dorsum = bowed(FW.tornus, FW.b1, -0.5);
    const inFore = (q: Pt, g = 0) => q[0] > 2.8 && inDisc(q, costa, g) && inDisc(q, termen, g) && inDisc(q, dorsum, g);
    // A dark border along its outer edge, cut in short strokes; its veins
    // fanning out from the end of the cell to the border.
    const BORDER = termen.r - 3.0;
    const border = { ...termen, r: BORDER };
    const borderIn = { ...termen, r: BORDER - 0.6 };
    const strokesBetween = (arc: Arc, inner: number, ok: (q: Pt) => boolean) => {
      let d = '';
      const step = (0.5 / arc.r) * (180 / Math.PI);
      for (let a = arc.a0 + step / 2; a < arc.a1; a += step) {
        const [p, q] = [atAbout(arc.c, a, arc.r - 0.35), atAbout(arc.c, a, inner + 0.35)];
        if (ok(p) && ok(q)) d += `M${pt(p)}L${pt(q)}`;
      }
      return d;
    };
    const FORE_STROKES = strokesBetween(termen, BORDER, (q) => inFore(q, 0.3));
    // The wing's shadow along its inner edge: arcs within it, each shorter.
    const FORE_SHADOW_ARCS = [0.55, 1.1, 1.65].flatMap((g, i) =>
      trimmed({ ...dorsum, r: dorsum.r - g }, (q) => q[0] > 6.5 + i * 2.2 && inFore(q, 0.3) && dist(q, termen.c) < BORDER - 0.6 - 0.4),
    );
    // (They spread from the wing's root, hidden under the thorax.)
    const ROOT: Pt = [3.0, -1.6];
    /** The point `t` of the way along the outer edge, from the tip. */
    const termenAt = (t: number) => {
      const [p, q] = [atAbout(termen.c, termen.a0, termen.r), atAbout(termen.c, termen.a1, termen.r)];
      const fromApex = dist(p, FW.apex) < dist(q, FW.apex);
      return atAbout(termen.c, fromApex ? termen.a0 + (termen.a1 - termen.a0) * t : termen.a1 - (termen.a1 - termen.a0) * t, termen.r);
    };
    /** A vein from `p` toward `q` on the outer edge, as far as the border. */
    const vein = (p: Pt, q: Pt) => runs(p, q, (s) => dist(s, p) > 5.5 && inFore(s, 0.3) && dist(s, termen.c) < BORDER - 0.6 - 0.45);
    const FORE_VEINS = [0.06, 0.22, 0.38, 0.54, 0.7, 0.86].map((t) => vein(ROOT, termenAt(t))).join('');
    // The hindwing, out from under the forewing: its margin a round lobe, a
    // dark band along it cut in short strokes, veins out to the band.
    const hindMargin = through([20.5, 4.0], [15.0, 13.8], [2.5, 14.2]);
    const inHind = (q: Pt, g = 0) => q[0] > 0 && inDisc(q, hindMargin, g) && !inFore(q, -g - 0.45) && !inAbdomen(q, -g - 0.45);
    const HIND = trimmed(hindMargin, (q) => !inFore(q, -0.5) && !inAbdomen(q, -0.5) && q[0] > 0);
    const HIND_BAND = hindMargin.r - 2.6;
    const HIND_LINE = trimmed({ ...hindMargin, r: HIND_BAND }, (q) => inHind(q, 0.3));
    const HIND_STROKES = strokesBetween(hindMargin, HIND_BAND, (q) => inHind(q, 0.2));
    const HIND_ROOT: Pt = [4.6, 6.9];
    const HIND_VEINS = [0.3, 0.5, 0.7, 0.88]
      .map((t) => runs(HIND_ROOT, atAbout(hindMargin.c, hindMargin.a0 + (hindMargin.a1 - hindMargin.a0) * t, HIND_BAND), (s) => inHind(s, 0.3) && dist(s, hindMargin.c) < HIND_BAND - 0.45))
      .join('');
    // The antennae: fine arcs out from the head, hooked at their tips.
    const ANTENNA = bowed([0.9, -10.0], [7.4, -20.6], 0.8);
    const HOOK = bowed([7.4, -20.6], [8.7, -20.25], 0.45);
    // The outlines, each stopping short of what lies over it, and turning
    // their corners (the wing's tip and its hind corner, the abdomen's, the
    // antennae's hooks) as one line.
    const COSTA = trimmed(costa, (q) => !inThorax(q, -0.5));
    const DORSUM = trimmed(dorsum, (q) => !inThorax(q, -0.5) && !inAbdomen(q, -0.5));
    const FORE = [...COSTA, termen, ...DORSUM];
    const ends = ({ c, r, a0, a1 }: Arc): Pt[] => [atAbout(c, a0, r), atAbout(c, a1, r)];
    const touching = (arcs: Arc[], p: Pt) => arcs.find((a) => ends(a).some((e) => dist(e, p) < 0.01))!;
    const FORE_EDGE = [touching(COSTA, FW.apex), termen, touching(DORSUM, FW.tornus)];
    const FORE_FROM = ends(FORE_EDGE[0]).find((e) => dist(e, FW.apex) > 0.01)!;
    const FORE_REST = [...COSTA, ...DORSUM].filter((a) => !FORE_EDGE.includes(a));
    /** The line of `arcs` from `p`, and its mirror. */
    const twice = (p: Pt, arcs: Arc[]) => chain(p, arcs) + chain(flip(p), arcs.map(flipArc));
    const nearSegment = (q: Pt) => SEGMENTS.some((s) => nearArc(q, s, 0.32));
    const BODY_SHADE =
      [0.5, 1.0, 1.5, 2.0, 2.5].map((x) => runs([x, ABD_TOP], [x, 22.5], (q) => inAbdomen(q, 0.35) && !nearSegment(q))).join('') +
      [2.95, 3.4].map((x) => runs([x, THX[1] - TRY], [x, THX[1] + TRY], (q) => inThorax(q, 0.35) && !TEGULA.some((t) => nearArc(q, t, 0.3)))).join('') +
      [0.5, 1.0, 1.5].map((x) => runs([x, HEAD[1] - HRY], [x, HEAD[1] + HRY], (q) => inOval(q, HEAD, HRX, HRY, 0.35))).join('');
    const sized = (d: string) => mapPath(d, ([x, y]) => [x * MOTH_K, y * MOTH_K], 0, MOTH_K);
    /** Path data run through the middle, for the left wing from the right. */
    const flipD = (d: string) => d.replace(/([ML])(-?[\d.]+)/g, (_, c: string, x: string) => `${c}${f(-Number(x))}`);
    /** One wing, the right (`s` 1) or the left (-1), each a layer of its own so it can stir. */
    const wing = (s: 1 | -1) => {
      const side = (arcs: Arc[]) => (s > 0 ? arcs : arcs.map(flipArc)).map(arcPath).join('');
      const lines = (d: string) => (s > 0 ? d : flipD(d));
      return {
        fore: sized(chain(s > 0 ? FORE_FROM : flip(FORE_FROM), s > 0 ? FORE_EDGE : FORE_EDGE.map(flipArc)) + side(FORE_REST)),
        hind: sized(side(HIND)),
        veins: sized(lines(FORE_VEINS + HIND_VEINS)),
        bands: sized(side([...trimmed(border, (q) => inFore(q, 0.3)), ...trimmed(borderIn, (q) => inFore(q, 0.3)), ...HIND_LINE])),
        strokes: sized(lines(FORE_STROKES + HIND_STROKES)),
        shadow: sized(side(FORE_SHADOW_ARCS)),
      };
    };
    const WINGS = { wingR: wing(1), wingL: wing(-1) };
    /** Where each wing stirs from: its root, against the thorax. */
    const WING_ROOT: Pt = [ROOT[0] * MOTH_K, ROOT[1] * MOTH_K];
    const MOTH = {
      body: sized(oval(THX, TRX, TRY) + oval(HEAD, HRX, HRY) + chain([-2.9, ABD_TOP], [abdTop, abdR, abdL]) + 'Z'),
      segments: sized(SEGMENTS.map(arcPath).join('') + both(TEGULA)),
      shade: sized(BODY_SHADE),
      antennae: sized(twice([0.9, -10.0], [ANTENNA, HOOK])),
    };
    // Points along the moth, for its glory to stand clear of.
    const MOTH_PTS: Pt[] = [
      ...[...FORE, ...HIND, abdR, ANTENNA, HOOK].flatMap((a) => arcPts(a)),
      ...Array.from({ length: 48 }, (_, k): Pt => [HEAD[0] + HRX * Math.sin((k * Math.PI) / 24), HEAD[1] - HRY * Math.cos((k * Math.PI) / 24)]),
    ]
      .flatMap((p) => [p, flip(p)])
      .map(([x, y]): Pt => [x * MOTH_K, y * MOTH_K]);
    // The moth's glory: rays from just clear of it out to the heart's ring, long and short in turn.
    const MOTH_GLORY = Array.from({ length: 56 }, (_, k) => {
      const a = ((k + 0.5) / 56) * 360;
      const u = at(a, 1);
      let from = 0;
      for (let t = 0; t < HEART; t += 0.1) if (MOTH_PTS.some(([x, y]) => Math.hypot(x - u[0] * t, y - u[1] * t) < 1.3)) from = t + 0.1;
      const to = HEART_IN - (k % 2 ? 2.6 : 1.2);
      return to - from > 1.2 ? `M${pt(at(a, from))}L${pt(at(a, to))}` : '';
    });
    const MOTH_GLORY_SETS = [0, 1].map((n) => MOTH_GLORY.filter((_, k) => k % 2 === n).join(''));

    // Everything that wears, drawn twice: worn for the lines, whole for the
    // glow under them. The wear is one seeded run through the lines in this
    // order, so every circle is worn alike.
    const drawing = (worn: boolean) => {
      const w: Wear = worn ? wear(113) : null;
      // (Each side of the wall and the triangle in its pieces first, in the
      // order the wear runs through them, then their corners.)
      const ringsFirst = [ringParts(O, RIM, { wear: w }), ringParts(O, BAND_OUT, { holes: bandHoles, wear: w }), ringParts(O, BAND_IN, { holes: bandHoles, wear: w })];
      const heptParts = hept.straps.map((_, i) => [1, -1].map((side) => lineParts(...hept.edge(i, side), { wear: w })));
      const heptCorners = (n: number) =>
        corners(
          hept.straps.map((_, i) => hept.edge(i, n ? -1 : 1)),
          heptParts.map((sides) => sides[n]),
          (i) => 0.4 + i * 0.08 + 0.5,
        );
      const circleParts = ringParts(O, CIRCLE, { wear: w });
      const triParts = tri.straps.map((_, i) => TRI_SIDES.map((side) => lineParts(...tri.edge(i, side), { holes: sigilHoles, rings: crRings, wear: side ? w : null })));
      return {
        band: ringsFirst.map((parts, k) => stroke(parts, 0.55 + k * 0.1, 1.1)),
        hept: [...heptParts.flatMap((sides, i) => sides.map((parts) => stroke(parts, 0.4 + i * 0.08, 0.5))), ...[0, 1].map((n) => heptCorners(n))],
        circle: stroke(circleParts, 0.3, 0.9),
        tri: [
          ...triParts.flatMap((sides, i) => sides.map((parts, n) => ({ side: TRI_SIDES[n], list: stroke(parts, 0.35 + i * 0.12, 0.55) }))),
          ...TRI_SIDES.map((side, n) => ({
            side,
            list: corners(
              tri.straps.map((_, i) => tri.edge(i, side)),
              triParts.map((sides) => sides[n]),
              (i) => 0.35 + i * 0.12 + 0.55,
            ),
          })),
        ],
        crescents: points.flatMap(({ C, reach }, k) =>
          [CR_IN, CR_OUT].map((r) => {
            const [a0, a1] = reach(r);
            return stroke(arcParts(C, r, a0, a1, { wear: r === CR_OUT ? w : null }), 0.75 + k * 0.1, 0.6);
          }),
        ),
        sigils: spirits.flatMap(({ c }, k) => [SIGIL_SEAL, SIGIL_SEAL - 1.4].map((r, i) => stroke(ringParts(c, r, { wear: i ? null : w }), 1 + k * 0.1, 0.5))),
        heart: stroke(ringParts(O, HEART, { wear: w }), 0.05, 0.7),
        heartIn: stroke(ringParts(O, HEART_IN), 0.1, 0.7),
      };
    };

    /** A seal at `c`, stamped in at `delay` (lib/engraver), upright. */
    const seal = (e: Engraver, delay: number, c: Pt, r: number, inner: number, signs: [string, string, number][]) =>
      e.seal(delay, (q) => [c[0] + q[0], c[1] + q[1]], `translate(${f(c[0])} ${f(c[1])})`, 0, r, inner, 0.5, signs);
    /** A mark of the script round `c` at radius `r`, `a` degrees round. */
    const mark = (e: Engraver, d: string, delay: number, c: Pt, a: number, r: number) => {
      const turn = turned(a);
      e.mark(d, delay, `translate(${f(c[0])} ${f(c[1])}) rotate(${f(a)}) translate(0 -${f(r)})`, (q) => {
        const [x, y] = turn([q[0], q[1] - r]);
        return [c[0] + x, c[1] + y];
      }, a);
    };

    const layers = (p: ReturnType<typeof drawing>): Record<string, Plate> => ({
      band: engrave((e) => {
        p.band.forEach((list, k) => e.pieces(list, k ? '' : 'thin'));
        SCRIPT.forEach((m, k) => mark(e, m.d, 1.15 + (k / SCRIPT.length) * 0.8, O, m.a, BAND));
      }),
      // Each sign upright on the page as the band carries it round.
      ...Object.fromEntries(seals.map(({ c }, k) => [`seal${k}`, engrave((e) => seal(e, 0.95 + k * 0.07, c, SEAL, 1.2, [[NIGREDO[k], 'sign', 1]]))])),
      wall: engrave((e) => {
        p.hept.forEach((list) => e.pieces(list, 'thin'));
        e.pieces(p.circle, 'thin');
        CORNER_POINTS.forEach(({ k, ...ray }) => {
          e.line(ray.lines, 'hair', 0.7 + k * 0.04, 0.4);
          e.line(ray.hatch, 'hatch', 0.95 + k * 0.04, 0.4);
        });
      }),
      triangle: engrave((e) => {
        for (const { side, list } of p.tri) e.pieces(list, side ? 'thin' : 'hair');
        p.crescents.forEach((list) => e.pieces(list, 'thin'));
        e.line(CR_RULES, 'hair', 1.2, 0.5);
        GLORY.forEach((parts, k) => e.pieces(stroke(parts, 0.65 + k * 0.006, 0.35), 'hair'));
        TIPS.forEach((q, k) => {
          e.line(q.ridge, 'hair', 0.9 + k * 0.05, 0.3);
          e.line(q.shade, 'hatch', 1.05 + k * 0.05, 0.4);
        });
        p.sigils.forEach((list, i) => e.pieces(list, i % 2 ? 'hair' : ''));
        CR_SCRIPT.forEach((m, k) => mark(e, m.d, 1.25 + (k / CR_SCRIPT.length) * 0.6, m.C, m.a, CR));
      }),
      // The sigils, upright on the page as the triangle carries them round,
      // each traced stroke by stroke from its ring to its bar.
      ...Object.fromEntries(
        spirits.map(({ c }, k) => [
          `sigil${k}`,
          engrave((e) => {
            const placed = (d: string) => mapPath(d, (q) => [c[0] + q[0], c[1] + q[1]]);
            SIGILS[k].forEach((d, i) => e.line(placed(d), 'sign', 1.3 + k * 0.1 + i * 0.07, 0.18));
          }),
        ]),
      ),
      heart: engrave((e) => {
        e.pieces(p.heart, '');
        e.pieces(p.heartIn, 'hair');
      }),
      glory0: engrave((e) => e.line(MOTH_GLORY_SETS[0], 'hair', 1.3, 0.7)),
      glory1: engrave((e) => e.line(MOTH_GLORY_SETS[1], 'hair', 1.35, 0.7)),
      ...Object.fromEntries(
        Object.entries(WINGS).map(([name, w]) => [
          name,
          engrave((e) => {
            e.line(w.fore, '', 1.35, 0.45);
            e.line(w.hind, '', 1.45, 0.4);
            e.line(w.veins, 'hair', 1.65, 0.4);
            e.line(w.bands, 'hair', 1.7, 0.4);
            e.line(w.strokes, 'hatch', 1.8, 0.35);
            e.line(w.shadow, 'hatch', 1.85, 0.35);
          }),
        ]),
      ),
      moth: engrave((e) => {
        e.line(MOTH.body, '', 1.5, 0.45);
        e.line(MOTH.segments, 'hair', 1.75, 0.35);
        e.line(MOTH.shade, 'hatch', 1.85, 0.35);
        e.line(MOTH.antennae, 'thin', 1.9, 0.35);
      }),
    });
    const GLOW = layers(drawing(false));
    const LINES = layers(drawing(true));
    const layer = (name: string, more: Partial<StageLayer> = {}): StageLayer => ({ name, lines: LINES[name], glow: GLOW[name], ...more });
    // Each ring turns its own way and speed, and first winds into place:
    // the band one way, the wall the other, the triangle within it the
    // first way again; the signs ride the band upright, the sigils the
    // triangle; the moth stays still and upright but for its wings, which
    // stir now and then, its glory's long and short rays swelling and
    // shrinking out of step.
    const LAYERS = [
      layer('band', { spin: { turn: 240, from: 24, reverse: true } }),
      ...seals.map(({ c }, k) => layer(`seal${k}`, { within: 'band', pivot: c, upright: true })),
      layer('wall', { spin: { turn: 160, from: -40 } }),
      layer('triangle', { spin: { turn: 110, from: 55, reverse: true } }),
      ...spirits.map(({ c }, k) => layer(`sigil${k}`, { within: 'triangle', pivot: c, upright: true })),
      layer('heart', { spin: { turn: 90, from: -70 } }),
      layer('glory0', { breathe: { low: 0.97, period: 4.4 } }),
      layer('glory1', { breathe: { low: 0.95, period: 3.6, delay: -1.8 } }),
      // The wings stir together now and then, each toward its root.
      layer('wingR', { pivot: WING_ROOT, flutter: { fold: 0.84, period: 11, delay: 3 } }),
      layer('wingL', { pivot: flip(WING_ROOT), flutter: { fold: 0.84, period: 11, delay: 3 } }),
      layer('moth'),
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
  the heart's ring draws, the circle and the wall are drawn round, the
  triangle is traced side by side as the glory shoots out under it, the
  crescents are laid and written, the band's rings sweep round, the seven
  signs of the black are set into them and the script written, the three
  sigils are traced beside the triangle, each from ring to ring,
  and last the moth is engraved, wings, body and markings.
-->

<ArcaneStage layers={LAYERS} {state} {size} {color} {strength} />
