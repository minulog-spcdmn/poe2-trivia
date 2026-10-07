<script lang="ts">
  import { STRATA } from '../lib/descent';
  import { DELVE_LIVES, FINDS_FROM } from '../lib/delve';
  import { f, line, lerp, pt, ring, subtract, wear, type Cut, type Hole, type Pt } from '../lib/arcane';

  // The descent, engraved: a cross-section of the earth, a shaft sunk from a
  // headframe at the surface down through the ten zones, each a stratum of
  // rock hatched the other way from the last. A zone you have reached has a
  // gallery cut off the shaft with its name in it, its colour in the rock and
  // a mark of its own beside the shaft (the Mines' ladder and timbering and
  // an ammonite, a fissure glowing in the Magma Fissure, icicles in the
  // Frozen Hollow, ...). A zone you haven't is dark rock, the zones still
  // ahead marked only "uncharted", so the names stay a surprise. Past 100 the
  // shaft runs on into the dark, a well without a bottom. A rope hangs from
  // the wheel down to a lamp at your deepest (at the mouth before a first
  // run), its light catching the rock around it.
  // Beside the section, a few short notes say what lies ahead (three lives,
  // finds, a new zone every ten, less time and trickier questions deeper
  // down, no end), never exactly what gets harder.
  // Drawn in the arcane style (docs/arcane-style.md): fine exact lines,
  // one-sided hatching that stops short of what it meets, a little wear, a
  // soft glow under the lines; it draws itself in from the surface down.
  // The plate is drawn in px at the size it's given: as wide as its column,
  // and as tall as the figure (which grows to the finds' height beside them,
  // and keeps its min-height when stacked), so it never leaves a gap.
  let { deepest = null, label = 'Your deepest' }: { deepest?: number | null; label?: string } = $props();

  let w = $state(0);
  let h = $state(0);

  /** The surface, the depths beyond the tenth zone, and the shaft's middle and walls. */
  const TOP = 30;
  const BEYOND = 30;
  const HALF = 4;
  /** Where the zones' names start, in the rock left of the shaft. */
  const NAME_X = 6;
  /** The notes run from NOTE_X to the plate's right edge; their pips sit just right of the section, which ends at E. */
  const NOTE_W = 88;
  const noteX = $derived(w - NOTE_W);
  const pipX = $derived(noteX - 5);
  const E = $derived(pipX - 5);
  /** The shaft: far enough right for the names and their galleries, and on a wide plate further, to share the rock either side. */
  const X = $derived(Math.max(104, Math.round(E - 48)));
  const BOTTOM = $derived(h - BEYOND);
  const band = $derived((BOTTOM - TOP) / 10);

  /** Where depth `d` sits on the shaft; past 100, in the dark beyond. */
  const y = (d: number) => (d > 100 ? BOTTOM + BEYOND * 0.45 : TOP + ((d - 0.5) * band) / 10);

  const rgb = (c: readonly number[]) => `rgb(${c.join(' ')})`;
  const ZONES = STRATA.slice(0, 10).map((z, k) => ({ name: z.name, color: rgb(z.look.accent), from: 10 * k + 1 }));

  const best = $derived(deepest && deepest > 0 ? Math.floor(deepest) : null);
  /** A zone is reached once a run has been as deep as its first depth; only then is it named, coloured and marked. */
  const reached = $derived(ZONES.filter((z) => best !== null && best >= z.from).length);
  /** The rope runs from the wheel to the lamp: at your deepest, or at the mouth. */
  const lamp = $derived(y(best ?? 1));
  const ROPE_END = 2.6;
  /** How far (px) the lamp's light reaches into the rock. */
  const LIGHT = 26;

  const poly = (ps: Pt[], close = false) => ps.map((p, i) => `${i ? 'L' : 'M'}${pt(p)}`).join('') + (close ? 'Z' : '');

  /** A box (x0, y0, x1, y1) the rock's hatching stops short of. */
  type Box = [number, number, number, number];
  /** What hatching stops short of: boxes and circles. */
  type Gaps = { boxes: Box[]; holes: Hole[] };
  /** A box round the rect, `m` clear of it. */
  const grow = ([x0, y0, x1, y1]: Box, m = 1.2): Box => [x0 - m, y0 - m, x1 + m, y1 + m];

  /** Where the line from `p` to `q` runs inside the box, as a cut in [0, 1]. */
  function inBox(p: Pt, q: Pt, [x0, y0, x1, y1]: Box): Cut | null {
    const [dx, dy] = [q[0] - p[0], q[1] - p[1]];
    let [t0, t1] = [0, 1];
    for (const [a, b] of [
      [-dx, p[0] - x0],
      [dx, x1 - p[0]],
      [-dy, p[1] - y0],
      [dy, y1 - p[1]],
    ]) {
      if (a === 0) {
        if (b < 0) return null;
      } else if (a < 0) t0 = Math.max(t0, b / a);
      else t1 = Math.min(t1, b / a);
    }
    return t0 < t1 ? [t0, t1] : null;
  }

  /**
   * One-sided hatching across the rect, `gap` apart, falling to the left (or,
   * `flip`, to the right), stopping `pad` short of its edges and short of
   * every box and hole in `gaps`, as an engraver works round what's there.
   */
  function hatchRect(x0: number, y0: number, x1: number, y1: number, gap: number, flip: boolean, gaps: Gaps, pad = 0.6): string {
    [x0, y0, x1, y1] = [x0 + pad, y0 + pad, x1 - pad, y1 - pad];
    if (x1 - x0 < 1 || y1 - y0 < 1) return '';
    const fx = (x: number) => (flip ? x0 + x1 - x : x);
    const boxes = gaps.boxes.filter((b) => b[3] > y0 && b[1] < y1);
    const holes = gaps.holes.filter((o) => o.c[1] + o.r > y0 && o.c[1] - o.r < y1);
    const step = gap * Math.SQRT2;
    let d = '';
    for (let s = x0 + y0 + step / 2; s < x1 + y1; s += step) {
      // The line x + y = s, clipped to the rect (and mirrored when flipped).
      const a = Math.max(x0, s - y1);
      const b = Math.min(x1, s - y0);
      if (b - a < 0.3) continue;
      const [p, q]: Pt[] = [
        [fx(a), s - a],
        [fx(b), s - b],
      ];
      d += line(p, q, { holes, cuts: boxes.map((x) => inBox(p, q, x)).filter((c): c is Cut => !!c) });
    }
    return d;
  }

  /** A straight line drawn as its pieces (between cuts and nicks), each timed by where it sits, so the pen sweeps once down the whole. */
  type Piece = { d: string; delay: number; dur: number };
  const pieces = (p: Pt, q: Pt, cuts: Cut[], d0: number, t: number): Piece[] =>
    subtract(0, 1, cuts).map(([a, b]) => ({ d: `M${pt(lerp(p, q, a))}L${pt(lerp(p, q, b))}`, delay: d0 + t * a, dur: t * (b - a) }));

  // The headframe: two legs up from the surface to a wheel, which they stop
  // short of, braced across; a spoil heap beside it, hatched down its far
  // side, and a winding house on the other.
  const WHEEL: Pt = $derived([X, 11]);
  const WHEEL_R = 4.6;
  const headframe = (worn: boolean) => {
    const wr = worn ? wear(7) : null;
    const legs: [Pt, Pt][] = [
      [[X - 10, TOP], WHEEL],
      [[X + 10, TOP], WHEEL],
    ];
    const [l, r] = legs.map(([p, q]) => lerp(p, q, 0.42));
    return legs.map(([p, q]) => line(p, q, { holes: [{ c: WHEEL, r: WHEEL_R + 1.3 }], wear: wr })).join('') + line(l, r);
  };
  const spokes = $derived(
    Array.from({ length: 6 }, (_, k) => {
      const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
      const p = (r: number) => `${f(WHEEL[0] + r * Math.cos(a))} ${f(WHEEL[1] + r * Math.sin(a))}`;
      return `M${p(1.4)}L${p(WHEEL_R - 1.1)}`;
    }).join(''),
  );
  const heap = $derived(
    poly([
      [X - 46, TOP],
      [X - 31, TOP - 7.5],
      [X - 15, TOP],
    ]) +
      Array.from({ length: 9 }, (_, i) => {
        // Upright strokes down the heap's far side, from its crest to the foot, each stopping short of the slope.
        const x = X - 31 + ((i + 1) * 16) / 10;
        const top = TOP - 7.5 + (7.5 * (x - (X - 31))) / 16;
        return `M${f(x)} ${f(top + 0.8)}V${f(TOP - 0.6)}`;
      }).join(''),
  );
  const house = $derived.by(() => {
    const x0 = X + 15;
    const x1 = Math.min(X + 27, E - 2);
    if (x1 - x0 < 9) return '';
    const [m, eave, ridge] = [(x0 + x1) / 2, TOP - 5.5, TOP - 9.5];
    return (
      poly([
        [x0, TOP],
        [x0, eave],
        [x1, eave],
        [x1, TOP],
      ]) +
      poly([
        [x0 - 1.2, eave + 0.1],
        [m, ridge],
        [x1 + 1.2, eave + 0.1],
      ]) +
      poly([
        [m - 1.3, TOP],
        [m - 1.3, TOP - 3.2],
        [m + 1.3, TOP - 3.2],
        [m + 1.3, TOP],
      ])
    );
  });

  // The zones' names, measured once their font is in, so each gallery is cut just long enough for its name.
  let nameEls: (SVGTextElement | null)[] = $state([]);
  let nameW: number[] = $state([]);
  const nameWidth = (k: number) => nameW[k] || ZONES[k].name.length * 5.2;
  $effect(() => {
    const els = nameEls.slice(0, reached);
    let live = true;
    const measure = () => {
      if (live) nameW = ZONES.map((_, k) => els[k]?.getComputedTextLength() || 0);
    };
    measure();
    void document.fonts?.ready.then(measure);
    document.fonts?.addEventListener('loadingdone', measure);
    return () => {
      live = false;
      document.fonts?.removeEventListener('loadingdone', measure);
    };
  });

  /** How far the galleries run off the shaft at a few zones (px, where the name leaves room), and how far it sits below (or above) the name, as the miners found the seam. */
  const REACH = [34, 0, 30, 0, 0, 26, 0, 0, 30, 0];
  const SAG = [0, 1.6, -1.2, 2, 0.6, -1.6, 1.2, -0.6, 1.8, 0];

  /** A zone's mark beside the shaft: its lines, a glow under some of them, and what the rock's hatching stops short of. */
  type Mark = { d: string; glow?: string } & Gaps;

  /** The zones' marks, each drawn in a box about 12 units square round `c`, `u` px to the unit. */
  function mark(k: number, c: Pt, u: number, y0: number, y1: number, x0: number, x1: number): Mark {
    const P = (x: number, yy: number): Pt => [c[0] + x * u, c[1] + yy * u];
    const L = (...ps: [number, number][]) => poly(ps.map(([x, yy]) => P(x, yy)));
    const circle = (x: number, yy: number, r: number) => ring(P(x, yy), r * u);
    /** The box (x0, y0)-(x1, y1) in the mark's units, as a gap in the hatching. */
    const B = (bx0: number, by0: number, bx1: number, by1: number): Box => grow([...P(bx0, by0), ...P(bx1, by1)]);
    /** A circle at (x, yy) of radius r in the mark's units, as a gap in the hatching. */
    const O = (x: number, yy: number, r: number): Hole => ({ c: P(x, yy), r: r * u + 1.2 });
    const arcUp = (x: number, yy: number, r: number) => {
      // A half circle over (x, yy), left to right.
      const [a, b] = [P(x - r, yy), P(x + r, yy)];
      return `M${pt(a)}A${f(r * u)} ${f(r * u)} 0 0 1 ${pt(b)}`;
    };
    switch (k) {
      case 0: {
        // The Mines: an ammonite in the rock, its whorls ribbed.
        const R = (t: number) => 5.6 * Math.exp(-0.21 * t);
        const at = (t: number, s = 1): Pt => P(R(t) * s * Math.cos(t), R(t) * s * Math.sin(t));
        const spiral = poly(Array.from({ length: 72 }, (_, i) => at((i / 71) * 3 * Math.PI)));
        const ribs = Array.from({ length: 13 }, (_, i) => {
          const t = (i / 13) * 2.2 * Math.PI;
          return `M${pt(at(t, 0.94))}L${pt(at(t + 2 * Math.PI, 1.08))}`;
        }).join('');
        return { d: spiral + ribs, boxes: [], holes: [O(0, 0, 6.05)] };
      }
      case 1: {
        // Magma Fissure: a crack across the rock, glowing.
        const n = Math.max(5, Math.round((x1 - x0) / 5));
        const ys = [0, -2.2, 1.4, -0.8, 2.4, -1.6, 0.9, -2.4, 1.8, -0.6, 2, -1.2];
        const ps: Pt[] = Array.from({ length: n + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / n, c[1] + (ys[i % ys.length] * u) / 1.2]);
        const branch = poly([ps[2], [ps[2][0] + 2.4 * u, ps[2][1] + 3.4 * u], [ps[2][0] + 3.4 * u, ps[2][1] + 4.6 * u]]);
        const d = poly(ps) + branch;
        // The hatching stops short of the crack along its length.
        const along = [...ps.slice(1).map((q, i) => [ps[i], q]), [ps[2], [ps[2][0] + 2.4 * u, ps[2][1] + 3.4 * u]], [[ps[2][0] + 2.4 * u, ps[2][1] + 3.4 * u], [ps[2][0] + 3.4 * u, ps[2][1] + 4.6 * u]]] as Pt[][];
        const boxes = along.map(([a, b]): Box => grow([Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])], 1.4));
        return { d, glow: d, boxes, holes: [] };
      }
      case 2: {
        // Frozen Hollow: icicles hanging from the stratum's roof.
        const n = Math.max(3, Math.floor((x1 - x0) / 4.6));
        const long = [0.82, 0.46, 0.66, 0.34, 0.74, 0.52, 0.4, 0.7];
        const boxes: Box[] = [];
        const d = Array.from({ length: n }, (_, i) => {
          const x = x0 + ((x1 - x0) * (i + 0.5)) / n;
          const top = y0 + 0.9;
          const bottom = top + (y1 - y0 - 2) * long[i % long.length];
          boxes.push(grow([x - 1.15, top, x + 1.15, bottom], 1));
          return poly([[x - 1.15, top], [x, bottom], [x + 1.15, top]]) + `M${f(x)} ${f(top + 0.6)}V${f(top + (bottom - top) * 0.55)}`;
        }).join('');
        return { d, boxes, holes: [] };
      }
      case 3: {
        // Fungal Caverns: an alcove with mushrooms growing in it.
        const alcove = L([-6, 5], [-6, -0.5]) + `A${f(6 * u)} ${f(6 * u)} 0 0 1 ${pt(P(6, -0.5))}` + L([6, -0.5], [6, 5], [-6, 5]);
        const shroom = (x: number, hh: number, r: number) => L([x, 5], [x, 5 - hh]) + arcUp(x, 5 - hh, r) + L([x - r, 5 - hh], [x + r, 5 - hh]);
        const glow = shroom(-2.9, 3, 1.6) + shroom(0.7, 5.4, 2.4) + shroom(3.7, 2.2, 1.2);
        return { d: alcove + glow, glow, boxes: [B(-6, -0.5, 6, 5)], holes: [O(0, -0.5, 6)] };
      }
      case 4: {
        // Vaal Outpost: a stepped pyramid with a stair up its face.
        const steps: [number, number][] = [[-6.5, 5.5]];
        for (let i = 0; i < 4; i++) steps.push([-6.5 + i * 1.6, 5.5 - (i + 1) * 2.4], [-6.5 + (i + 1) * 1.6, 5.5 - (i + 1) * 2.4]);
        const outline = [...steps, ...steps.slice(0, -1).map(([x, yy]): [number, number] => [-x, yy]).reverse()];
        const stair = L([-1, 5.5], [-1, -4.1]) + L([1, 5.5], [1, -4.1]) + Array.from({ length: 7 }, (_, i) => L([-1, 4.3 - i * 1.25], [1, 4.3 - i * 1.25])).join('');
        const d = L(...outline) + stair;
        return { d, boxes: [0, 1, 2, 3].map((i) => B(-6.5 + i * 1.6, 5.5 - (i + 1) * 2.4, 6.5 - i * 1.6, 5.5 - i * 2.4)), holes: [] };
      }
      case 5: {
        // Abyssal Depths: a vortex, its arcs broken, round a dark eye.
        const swirl = [2, 3.5, 5]
          .map((r, i) => {
            const a0 = (i * 130 * Math.PI) / 180;
            return poly(Array.from({ length: 25 }, (_, j) => {
              const a = a0 + (j / 24) * ((250 * Math.PI) / 180);
              const rr = r * (1 + 0.12 * (j / 24));
              return P(rr * Math.cos(a), rr * Math.sin(a));
            }));
          })
          .join('');
        return { d: swirl + circle(0, 0, 0.7), boxes: [], holes: [O(0, 0, 5.6)] };
      }
      case 6: {
        // Petrified Forest: a stone trunk, broken off, a branch stub and roots.
        const trunk = L([-2.2, 6], [-1.7, -3.4], [1.7, -5.2], [2.2, 6]);
        const bough = L([1.95, 0.4], [4.8, -3.2]) + L([2.05, 1.8], [5.3, -2.2]) + L([4.8, -3.2], [5.3, -2.2]);
        const roots = L([-2.2, 6], [-4.4, 6]) + L([-2.1, 4.8], [-4, 6]) + L([2.2, 6], [4.6, 6]) + L([2.1, 4.8], [4.2, 6]);
        const bark = L([-0.6, 5.2], [-0.4, 0.4]) + L([0.6, 3], [0.7, -2.6]);
        return { d: trunk + bough + roots + bark, boxes: [B(-2.2, -5.2, 2.2, 6), B(2, -3.2, 5.3, 1.8), B(-4.6, 4.8, 4.6, 6)], holes: [] };
      }
      case 7: {
        // Sulphur Vents: a vent in the rock with fumes rising out of it.
        const vent = L([-3, 6], [-0.9, 3.6]) + L([3, 6], [0.9, 3.6]);
        const fumes = circle(0.4, 1.4, 1) + circle(-0.9, -1.6, 1.4) + circle(0.9, -5, 1.8);
        return { d: vent + fumes, glow: fumes, boxes: [B(-3, 3.6, 3, 6)], holes: [O(0.4, 1.4, 1), O(-0.9, -1.6, 1.4), O(0.9, -5, 1.8)] };
      }
      case 8: {
        // Abyssal City: an arcade of three arches under a cornice.
        const cols = [-6, -2, 2, 6].map((x) => L([x, 5.5], [x, 0])).join('');
        const arches = [-4, 0, 4].map((x) => arcUp(x, 0, 2)).join('');
        const d = L([-6.8, 5.5], [6.8, 5.5]) + cols + arches + L([-6.8, -3], [6.8, -3]) + L([-6, -4.2], [6, -4.2]);
        return { d, boxes: [B(-6.8, -4.2, 6.8, 5.5)], holes: [] };
      }
      default: {
        // Primeval Ruins: a broken column, fluted, a fallen drum beside it.
        const shaft = L([-2.4, 4.4], [-2.4, -3.2], [-1, -4.6], [0.2, -3.4], [1.3, -5.4], [2.4, -4.4], [2.4, 4.4]);
        const flutes = L([-0.8, 4.4], [-0.8, -3.6]) + L([0.8, 4.4], [0.8, -3.8]);
        const base = L([-3.6, 4.4], [3.6, 4.4], [3.6, 6], [-3.6, 6], [-3.6, 4.4]);
        const drum = circle(5, 4.2, 1.8) + circle(5, 4.2, 0.9);
        return { d: shaft + flutes + base + drum, boxes: [B(-2.4, -5.4, 2.4, 4.4), B(-3.6, 4.4, 3.6, 6)], holes: [O(5, 4.2, 1.8)] };
      }
    }
  }

  const plate = $derived.by(() => {
    if (!w || !h) return null;
    const wr = (seed: number) => wear(seed);
    // "Uncharted": the zones not reached yet, a quiet word in their dark rock, which stops short of it.
    const uncharted = reached < 10 ? { x: (X - HALF) / 2, y: (TOP + reached * band + BOTTOM) / 2 } : null;
    /** The gaps, and the shaft, which all the rock's hatching stops short of. */
    const shaftGaps = (g: Gaps): Gaps => ({ boxes: [[X - HALF - 0.9, -1e3, X + HALF + 0.9, 1e4], ...g.boxes], holes: g.holes });
    const zones = ZONES.map((z, k) => {
      const y0 = TOP + k * band;
      const y1 = y0 + band;
      const yc = (y0 + y1) / 2;
      const known = k < reached;
      // Its name, engraved in the rock at the left; and, where the name leaves room, a gallery cut off the shaft towards it, rounded at the end (the Mines' squared and timbered).
      const gh = Math.min(7.5, band - 7);
      const gy = yc + Math.min(1, (band - 7 - gh) / 4) * SAG[k];
      const [roof, floor] = [gy - gh / 2, gy + gh / 2];
      const mouth = X - HALF;
      const room = mouth - (NAME_X + nameWidth(k) + 9);
      const reach = Math.min(room, REACH[k]);
      let gallery = '';
      const gaps: Gaps = { boxes: [], holes: [] };
      if (known) gaps.boxes.push(grow([NAME_X, yc - 4.2, NAME_X + nameWidth(k), yc + 4.2], 1.6));
      if (known && reach >= 12) {
        const r = gh / 2;
        const xs = mouth - reach + (k === 0 ? 0 : r);
        gaps.boxes.push(grow([xs, roof, mouth, floor]));
        if (k === 0) {
          gallery = poly([[mouth, floor], [xs, floor], [xs, roof], [mouth, roof]]);
          for (let x = xs + 1.4; x < mouth - 3; x += 7) gallery += `M${f(x)} ${f(floor)}V${f(roof + 1.1)}M${f(x - 1.2)} ${f(roof + 1.1)}H${f(x + 1.2)}`;
        } else {
          gallery = `M${f(mouth)} ${f(floor)}H${f(xs)}A${f(r)} ${f(r)} 0 0 1 ${f(xs)} ${f(roof)}H${f(mouth)}`;
          gaps.holes.push({ c: [xs, gy], r: r + 1.2 });
        }
      }
      // Its mark, in the rock between the shaft and the section's edge.
      const [mx0, mx1] = [X + HALF + 3, E - 3];
      const u = Math.min(mx1 - mx0, band - 3.5, 15) / 13;
      const m = known ? mark(k, [(mx0 + mx1) / 2, yc], u, y0, y1, mx0, mx1) : null;
      if (m) gaps.boxes.push(...m.boxes), gaps.holes.push(...m.holes);
      if (uncharted && uncharted.y > y0 - 8 && uncharted.y < y1 + 8) gaps.boxes.push([uncharted.x - 24, uncharted.y - 6.5, uncharted.x + 24, uncharted.y + 6.5]);
      return {
        ...z,
        k,
        y0,
        y1,
        yc,
        known,
        roof,
        floor,
        gallery,
        mark: m,
        hatch: hatchRect(0, y0, E, y1, known ? 2.1 : 2.6, k % 2 === 1, shaftGaps(gaps)),
      };
    });
    // The shaft's walls, broken where a gallery opens off the left one, sunk on into the dark.
    const len = h - TOP;
    const mouths: Cut[] = zones.filter((z) => z.gallery).map((z) => [(z.roof - TOP) / len, (z.floor - TOP) / len]);
    const nicks = (seed: number) => wr(seed)!(len);
    const walls = (worn: boolean): Piece[] => [
      ...pieces([X - HALF, TOP], [X - HALF, h], [...mouths, ...(worn ? nicks(11) : [])], 0.3, 1.1),
      ...pieces([X + HALF, TOP], [X + HALF, h], worn ? nicks(13) : [], 0.3, 1.1),
    ];
    // The strata's seams and the section's edges, in hairline, stopping short of the shaft.
    const seams = Array.from({ length: 10 }, (_, j) => {
      const yy = TOP + (j + 1) * band;
      return { d: line([0, yy], [X - HALF - 0.8, yy], { wear: wr(20 + j) }) + line([X + HALF + 0.8, yy], [E, yy], { wear: wr(40 + j) }), known: j < reached };
    });
    const edges = line([0, TOP], [0, h]) + line([E, TOP], [E, h]);
    // The Mines' ladder down the shaft, its rungs stopping short of the rope.
    let ladder = '';
    if (reached > 0) {
      const [l, r] = [X - 2.3, X + 2.3];
      ladder = `M${f(l)} ${f(TOP + 0.8)}V${f(TOP + band)}M${f(r)} ${f(TOP + 0.8)}V${f(TOP + band)}`;
      for (let yy = TOP + 2.2; yy < TOP + band - 0.5; yy += 2.6)
        ladder += line([l, yy], [r, yy], { cuts: yy < lamp - ROPE_END ? [[0.5 - 0.9 / 4.6, 0.5 + 0.9 / 4.6]] : [] });
    }
    // The well past the tenth zone: rings down the shaft, ever closer, into the dark.
    const well = Array.from({ length: 8 }, (_, i) => {
      const yy = BOTTOM + BEYOND * (1 - Math.pow(0.68, i + 1));
      const ropeHere = best !== null && best > 100 && yy < lamp - ROPE_END;
      return line([X - HALF + 0.7, yy], [X + HALF - 0.7, yy], { cuts: ropeHere ? [[0.5 - 0.9 / 6.6, 0.5 + 0.9 / 6.6]] : [] });
    }).join('');
    const beyond = hatchRect(0, BOTTOM, E, h, 2.6, false, shaftGaps({ boxes: [], holes: [] }));
    return {
      zones,
      walls,
      seams,
      edges,
      ladder,
      well,
      uncharted,
      surface: (worn: boolean) => line([0, TOP], [E, TOP], { cuts: [[(X - HALF - 0.8) / E, (X + HALF + 0.8) / E]], wear: worn ? wr(3) : null }),
      beyond,
      // The hatching within the lamp's reach, to be lit by it.
      lit: [...zones.filter((z) => z.y1 > lamp - LIGHT && z.y0 < lamp + LIGHT).map((z) => z.hatch), lamp + LIGHT > BOTTOM ? beyond : ''].join(''),
    };
  });

  // The notes: a few words each at about the depth they're about, nudged
  // apart where they would touch (the deepest's number never moves).
  const LINE = 10.5;
  /** How far (px) the italic words of a note sit above its depths' baseline: EB Garamond's italic reads low beside Cinzel's lining figures. */
  const RISE = 0.75;
  /** How far (px) a note's bullet drops, onto the middle of its words. */
  const DOT_DROP = 1.05;
  const GAP = 11.5;
  const LIVES = ['no', 'one', 'two', 'three', 'four', 'five'][DELVE_LIVES] ?? String(DELVE_LIVES);
  /** A note: its key (a word in italic, a depth in Cinzel), its few words (a line each), and the `y` it belongs at. */
  type Note = { id: string; word?: string; num?: string; lines: string[]; at: number; best?: boolean };
  const NOTES: Note[] = $derived([
    { id: 'lives', num: '1', lines: [`${LIVES} lives`], at: TOP - 6 },
    { id: 'finds', num: String(FINDS_FROM), lines: ['finds appear'], at: y(FINDS_FROM) },
    { id: 'zones', word: 'every', num: '10', lines: ['a new zone'], at: TOP + 2 * band },
    { id: 'deeper', word: 'deeper', lines: ['less time,', 'trickier questions'], at: y(60) },
    { id: 'endless', num: '100+', lines: ['endless'], at: BOTTOM + 3 },
  ]);
  /** The notes and your deepest, top to bottom, each at its `y`, none closer than GAP to the next. */
  function spread(notes: Note[]): (Note & { y: number })[] {
    const out = notes.map((n) => ({ ...n, y: n.at })).sort((a, b) => a.y - b.y);
    for (let pass = 0; pass < 80; pass++) {
      let moved = false;
      for (let i = 1; i < out.length; i++) {
        const [a, b] = [out[i - 1], out[i]];
        const over = a.y + Math.max(0, a.lines.length - 1) * LINE + GAP - b.y;
        if (over < 0.01) continue;
        moved = true;
        if (a.best) b.y += over;
        else if (b.best) a.y -= over;
        else [a.y, b.y] = [a.y - over / 2, b.y + over / 2];
      }
      if (!moved) break;
    }
    return out;
  }
  const notes = $derived(spread(best ? [...NOTES, { id: 'best', num: String(best), lines: [], at: lamp, best: true }] : NOTES));

  const uid = $props.id();
  const words = (n: number) => ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][n] ?? String(n);
  const summary = $derived(
    [
      `The descent: ten zones of ten depths, then on for ever, each stratum new.`,
      `${LIVES[0].toUpperCase() + LIVES.slice(1)} lives; finds turn up from depth ${FINDS_FROM}; the deeper, the less time and the trickier the questions.`,
      reached === 0
        ? 'All ten zones are uncharted.'
        : reached === ZONES.length
          ? `Zones reached: all ten, ${ZONES.map((z) => z.name).join(', ')}.`
          : `Zones reached: ${ZONES.slice(0, reached)
              .map((z) => z.name)
              .join(', ')}; ${words(ZONES.length - reached)} more uncharted.`,
      best ? `${label}: depth ${best}.` : '',
    ]
      .filter(Boolean)
      .join(' '),
  );
</script>

{#snippet frame(worn: boolean)}
  {#if plate}
    <path class="draw" d={headframe(worn)} pathLength="100" style:--d="0s" style:--t="0.45s" />
    <path class="draw" d={ring(WHEEL, WHEEL_R, { wear: null })} pathLength="100" style:--d="0.2s" style:--t="0.5s" />
    <path class="draw" d={plate.surface(worn)} pathLength="100" style:--d="0.1s" style:--t="0.4s" />
    {#each plate.walls(worn) as p, i (i)}
      <path class="draw piece wall" d={p.d} pathLength="100" style:--d="{p.delay.toFixed(3)}s" style:--t="{p.dur.toFixed(3)}s" />
    {/each}
  {/if}
{/snippet}

<figure class="descent" role="img" aria-label={summary} bind:clientWidth={w} bind:clientHeight={h}>
  {#if plate}
    <svg viewBox="0 0 {w} {h}" width={w} height={h} aria-hidden="true">
      <defs>
        <linearGradient id="{uid}-fade" x1="0" y1={BOTTOM} x2="0" y2={h} gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#fff" />
          <stop offset="1" stop-color="#fff" stop-opacity="0" />
        </linearGradient>
        <!-- Past the tenth zone everything fades into the dark. -->
        <mask id="{uid}-dark" maskUnits="userSpaceOnUse" x="-10" y="-10" width={w + 20} height={h + 20}>
          <rect x="-10" y="-10" width={w + 20} height={BOTTOM + 10} fill="#fff" />
          <rect x="-10" y={BOTTOM} width={w + 20} height={BEYOND + 10} fill="url(#{uid}-fade)" />
        </mask>
        <!-- The lamp's light on the rock round it: the hatching near it drawn again in this, bright at the lamp and gone by its edge. -->
        <radialGradient id="{uid}-light" cx={X} cy={lamp} r={LIGHT} gradientUnits="userSpaceOnUse">
          <stop offset="0" style:stop-color="var(--gold-hi)" stop-opacity="1" />
          <stop offset="0.4" style:stop-color="var(--gold-hi)" stop-opacity="0.35" />
          <stop offset="1" style:stop-color="var(--gold-hi)" stop-opacity="0" />
        </radialGradient>
      </defs>

      <!-- Above ground: the spoil heap and the winding house either side of the headframe. -->
      <g class="above">
        <path d={heap} />
        <path d={house} />
      </g>

      <g mask="url(#{uid}-dark)">
        <!-- The rock, stratum by stratum: tinted and hatched in a zone's colour once reached, dark until then. -->
        {#each plate.zones as z (z.k)}
          <path
            class="band hatch"
            class:known={z.known}
            d={z.hatch}
            style:--c={z.known ? z.color : null}
            style:--dim={z.known ? null : (0.3 - (0.14 * (z.k - reached)) / Math.max(1, 9 - reached)).toFixed(3)}
            style:--d="{(0.35 + z.k * 0.08).toFixed(2)}s"
          />
        {/each}
        <path class="hatch beyond" d={plate.beyond} />
        <path class="lit" d={plate.lit} style:stroke="url(#{uid}-light)" />
        {#each plate.seams as s, j (j)}
          <path class="seam" class:known={s.known} d={s.d} style:--d="{(0.4 + j * 0.08).toFixed(2)}s" />
        {/each}
        <path class="edge" d={plate.edges} />
        <path class="well" d={plate.well} />
        <g class="glow">{@render frame(false)}</g>
        <g class="lines">{@render frame(true)}</g>
      </g>
      <path class="wheel" d={spokes} />
      <circle class="wheel" cx={WHEEL[0]} cy={WHEEL[1]} r="0.8" />

      <!-- The zones reached: each a gallery with its name, and its mark beside the shaft. -->
      {#each plate.zones as z (z.k)}
        {#if z.known}
          <g class="zone" style:--c={z.color} style:--d="{(0.35 + z.k * 0.08).toFixed(2)}s">
            <path class="gallery" d={z.gallery} />
            <text class="name" x={NAME_X} y={z.yc} bind:this={nameEls[z.k]}>{z.name}</text>
            {#if z.mark}
              <g class="mark">
                {#if z.mark.glow}<path class="mark-glow" d={z.mark.glow} />{/if}
                <path d={z.mark.d} />
              </g>
            {/if}
          </g>
        {/if}
      {/each}
      {#if plate.ladder}<path class="ladder" d={plate.ladder} style:--c={ZONES[0].color} />{/if}
      {#if plate.uncharted}
        <text class="uncharted-word" x={plate.uncharted.x} y={plate.uncharted.y}>uncharted</text>
      {/if}

      <!-- What lies ahead, in a few words; and your deepest, lit. -->
      {#each notes as n (n.id)}
        <g class="note" class:best={n.best} style:--d="{n.best ? 1.7 : (0.45 + (n.y / h) * 0.9).toFixed(2)}s">
          <path class="pip" class:lit={n.best} d="M{f(pipX - 1.6)} {f(n.y)}l1.6 -1.6l1.6 1.6l-1.6 1.6z" />
          <!-- The italic words ride RISE above the Cinzel depths' baseline, where they line up by eye. -->
          <text x={noteX} y={n.y - RISE}>
            {#if n.word}<tspan class="key">{n.word}</tspan>{/if}
            {#if n.num}<tspan class="num" dy={RISE}>{n.word ? ' ' : ''}{n.num}</tspan>{/if}
            {#if n.lines.length}<tspan class="dot" dy={(n.num ? -RISE : 0) + DOT_DROP}>{' • '}</tspan><tspan class="say" dy={-DOT_DROP}>{n.lines[0]}</tspan>{/if}
          </text>
          {#each n.lines.slice(1) as l, i (i)}
            <text class="say" x={noteX} y={n.y - RISE + (i + 1) * LINE}>{l}</text>
          {/each}
        </g>
      {/each}

      <!-- The rope down to the lamp at your deepest. -->
      <path class="rope draw" d="M{X} {WHEEL[1] + WHEEL_R}V{f(lamp - ROPE_END)}" pathLength="100" style:--d="1.1s" style:--t="0.7s" />
      <g class="lamp">
        <circle class="halo" cx={X} cy={lamp} r="7" />
        <path class="flame" d="M{X} {f(lamp - ROPE_END)}l2.2 2.6l-2.2 2.6l-2.2 -2.6z" />
      </g>
    </svg>
  {/if}
</figure>

<style>
  /* As wide as its column; as tall as it's let grow (beside the finds), else its min-height. The plate is laid out to fit, so it isn't part of the flow. */
  .descent {
    position: relative;
    flex: 1 1 auto;
    min-height: 14.5rem;
    margin: 0;
    color: var(--gold);
  }
  svg {
    position: absolute;
    inset: 0;
    display: block;
    overflow: visible;
  }
  path {
    fill: none;
    stroke: currentColor;
    stroke-width: 0.7;
    stroke-linecap: butt;
  }
  .edge {
    animation: carve 0.8s 0.3s var(--ease-out) both;
    stroke-width: 0.35;
    opacity: 0.45;
  }
  .seam {
    animation: carve 0.5s var(--d) var(--ease-out) both;
    stroke: var(--muted);
    stroke-width: 0.35;
    opacity: 0.4;
  }
  .seam.known {
    stroke: currentColor;
    opacity: 0.55;
  }
  .wall {
    stroke-width: 0.8;
  }
  .glow path {
    stroke-width: 2.2;
    opacity: 0.16;
  }
  .wheel {
    fill: none;
    stroke: currentColor;
    stroke-width: 0.45;
    animation: carve 0.4s 0.55s var(--ease-out) both;
  }
  circle.wheel {
    fill: currentColor;
    stroke: none;
  }
  .above {
    opacity: 0.7;
    animation: carve 0.5s 0.25s var(--ease-out) both;
  }
  .above path {
    stroke-width: 0.45;
    stroke-linejoin: miter;
  }

  /* A stratum: reached, its colour as a faint tint and hatching in the rock; not yet, dark rock, its hatching dim and sparse. */
  .band {
    animation: carve 0.5s var(--d) var(--ease-out) both;
  }
  .hatch {
    stroke: color-mix(in srgb, var(--c, var(--muted)) 70%, var(--muted));
    stroke-width: 0.45;
    stroke-linecap: round;
    opacity: 0.6;
  }
  /* Uncharted, the rock dims the deeper it lies. */
  .band:not(.known) {
    opacity: var(--dim);
  }
  .beyond {
    opacity: 0.22;
  }
  /* The lamp's light, catching the hatching round it. */
  .lit {
    stroke-width: 0.5;
    stroke-linecap: round;
    animation: carve 0.6s 1.8s var(--ease-out) both;
  }
  .well {
    animation: carve 0.6s 1.2s var(--ease-out) both;
    stroke-width: 0.4;
    opacity: 0.6;
  }
  text {
    dominant-baseline: central;
  }

  /* A zone reached: its gallery, its name in a pale wash of its colour, its mark. */
  .zone {
    animation: carve 0.5s var(--d) var(--ease-out) both;
  }
  .gallery {
    stroke: color-mix(in srgb, var(--c) 30%, var(--gold));
    stroke-width: 0.55;
    stroke-linejoin: miter;
  }
  .name {
    font-family: var(--font-display);
    font-size: 7.8px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    fill: color-mix(in srgb, var(--c) 55%, #e3d3b4);
  }
  .mark {
    animation: carve 0.6s calc(var(--d) + 0.35s) var(--ease-out) both;
  }
  .mark path {
    stroke: color-mix(in srgb, var(--c) 70%, #e3d3b4);
    stroke-width: 0.45;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  .mark .mark-glow {
    stroke: var(--c);
    stroke-width: 2;
    opacity: 0.22;
  }
  .ladder {
    stroke: color-mix(in srgb, var(--c) 45%, var(--gold));
    stroke-width: 0.4;
    opacity: 0.85;
    animation: carve 0.5s 0.6s var(--ease-out) both;
  }
  .uncharted-word {
    font-style: italic;
    font-size: 10px;
    letter-spacing: 0.03em;
    text-anchor: middle;
    fill: var(--muted);
    opacity: 0.8;
    animation: carve 0.6s 1.1s var(--ease-out) both;
  }

  /* The notes: a key in gold (depths in Cinzel), a few words in the body's italic. */
  .note {
    animation: carve 0.4s var(--d) var(--ease-out) both;
  }
  .note text {
    font-size: 10.5px;
  }
  .num {
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 9px;
    fill: var(--gold);
  }
  .key {
    font-style: italic;
    fill: var(--gold);
  }
  /* The bullet sits high in the type's x-height: it is set DOT_DROP lower (dy), the words after back on the line. */
  .dot {
    fill: var(--gold-lo);
  }
  .say {
    font-style: italic;
    fill: #cfc2a8;
  }
  .pip {
    fill: var(--bg);
    stroke: var(--gold);
    stroke-width: 0.6;
    stroke-linejoin: miter;
  }
  .best .num,
  .pip.lit {
    fill: var(--gold-hi);
  }
  .best .num {
    font-size: 10px;
  }

  /* The rope and the lamp at your deepest: the brightest thing on the plate. */
  .rope {
    stroke-width: 0.5;
    opacity: 0.85;
  }
  .lamp {
    animation: carve 0.5s 1.7s var(--ease-out) both;
  }
  .halo {
    fill: var(--gold-hi);
    opacity: 0.2;
    filter: blur(2px);
    transform-box: fill-box;
    transform-origin: center;
    animation: breathe 5s 2.2s ease-in-out infinite alternate;
  }
  .flame {
    fill: var(--gold-hi);
    stroke: #fff4d6;
    stroke-width: 0.4;
    stroke-linejoin: miter;
  }

  .draw {
    stroke-dasharray: 100;
    animation: draw var(--t, 1s) var(--d, 0s) cubic-bezier(0.55, 0, 0.25, 1) both;
  }
  /* A piece of a broken line: drawn at an even pace, so the pen runs on across the gaps. */
  .draw.piece {
    animation-timing-function: linear;
  }
  @keyframes draw {
    from {
      stroke-dashoffset: 100;
    }
  }
  @keyframes carve {
    from {
      opacity: 0;
    }
  }
  @keyframes breathe {
    to {
      opacity: 0.3;
      transform: scale(1.15);
    }
  }
</style>
