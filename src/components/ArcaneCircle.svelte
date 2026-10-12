<script module lang="ts">
  import { LUNA, LUNA_HATCH, MARKS, PLANETS, SOL_RAYS } from '../lib/alchemy';

  // An alchemist's circle, engraved, that draws itself behind the item art
  // and turns slowly, in layers:
  // • the band: the seven planets of the old metals in seals, with lines
  //   of an unreadable alchemical script between them;
  // • a heptagram of double straps woven over and under, one point per
  //   planet, with Sol and Luna sealed between its arms, and a sun whose
  //   long rays run out under the straps into the arms;
  // • at the heart, a hatched compass star around an eye that stays upright.
  // Lines stop short of every seal they meet, as if drawn around it, and
  // carry the odd nick, like a worn plate.
  // `state` colours it at the reveal.
  //
  // Each layer is turned as a whole, so the browser can spin it on the
  // compositor without repainting; the glow is a soft, wide copy of the
  // strokes underneath rather than a filter (which would repaint).
  // `size`, `color` and `strength` (opacity) override the stage defaults for
  // other places, like behind the winner on the victory screen.
  type Pt = [number, number];
  type Hole = { x: number; y: number; r: number };
  /** A strap: a straight band `w` either side of the line from `p` to `q`. */
  type Strap = { p: Pt; q: Pt; w: number };
  type Cut = [number, number];
  const f = (v: number) => v.toFixed(2);
  const pt = (p: Pt) => `${f(p[0])} ${f(p[1])}`;
  const rad = (a: number) => (a * Math.PI) / 180;
  /** The point at `a` degrees clockwise from the top, `r` from the centre. */
  const at = (a: number, r: number): Pt => [r * Math.sin(rad(a)), -r * Math.cos(rad(a))];
  const lerp = (p: Pt, q: Pt, t: number): Pt => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];

  /** A piece of a line, and where it runs along the whole (0 to 1). */
  type Part = { d: string; from: number; to: number };
  const joined = (parts: Part[]) => parts.map((p) => p.d).join('');
  const sec = (v: number) => `${v.toFixed(3)}s`;
  /**
   * Timing for drawing a broken line in one stroke: each piece starts when
   * the pen reaches it and draws at the pen's speed, the pen sweeping the
   * whole in `t` seconds after `delay`, fast at first and slowing at the end.
   * (A dash can't run on from one piece to the next by itself.)
   */
  const stroke = (parts: Part[], delay: number, t: number) => {
    const when = (y: number) => 1 - Math.sqrt(1 - Math.min(1, Math.max(0, y)));
    return parts.map(({ d, from, to }) => ({
      d,
      delay: delay + when(from) * t,
      t: Math.max(0.03 * t, (when(to) - when(from)) * t),
    }));
  };
  type Stroke = ReturnType<typeof stroke>;

  /** What's left of [lo, hi] once the `cuts` are taken out. */
  const subtract = (lo: number, hi: number, cuts: Cut[]) => {
    let parts: Cut[] = [[lo, hi]];
    for (const [c0, c1] of cuts)
      parts = parts.flatMap(([a, b]): Cut[] =>
        c1 <= a || c0 >= b ? [[a, b]] : ([[a, c0], [c1, b]] as Cut[]).filter(([p, q]) => q - p > 1e-3),
      );
    return parts;
  };

  // The wear on the plate: a nick every 30 units or so, from a fixed seed.
  // Only the lines are worn: the glow under them runs on unbroken, so a
  // nick reads as a worn spot rather than a cut.
  let wearing = false;
  let wearSeed = 5;
  const wearRnd = () => (wearSeed = (wearSeed * 16807) % 2147483647) / 2147483647;
  /** Nicks along a line `len` long, as cuts in [0, `span`]. */
  const nicks = (len: number, span = 1): Cut[] =>
    !wearing
      ? []
      : Array.from({ length: Math.round((len / 30) * (0.4 + wearRnd() * 1.2)) }, () => {
          const t = wearRnd() * span;
          const w = ((0.4 + wearRnd() * 0.8) / len) * span;
          return [t - w / 2, t + w / 2];
        });

  /** Where a line from `p` to `q` runs inside a strap, as a cut in [0, 1]. */
  const underStrap = (p: Pt, q: Pt, { p: a, q: b, w }: Strap): Cut[] => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const [ux, uy] = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    // Signed distance from the strap's centre line, and position along it.
    const dist = (s: Pt) => (s[0] - a[0]) * -uy + (s[1] - a[1]) * ux;
    const along = (s: Pt) => (s[0] - a[0]) * ux + (s[1] - a[1]) * uy;
    const [d0, d1] = [dist(p), dist(q)];
    if (Math.abs(d1 - d0) < 1e-9) return [];
    const [t0, t1] = [(-w - d0) / (d1 - d0), (w - d0) / (d1 - d0)].sort((x, y) => x - y);
    const s = along(lerp(p, q, (t0 + t1) / 2));
    return s < 0 || s > len ? [] : [[t0, t1]];
  };

  /** Where a line from `p` to `q` runs inside a circle, as a cut in [0, 1]. */
  const inside = (p: Pt, q: Pt, { x, y, r }: Hole): Cut | null => {
    const [dx, dy] = [q[0] - p[0], q[1] - p[1]];
    const [fx, fy] = [p[0] - x, p[1] - y];
    const a = dx * dx + dy * dy;
    const b = 2 * (fx * dx + fy * dy);
    const disc = b * b - 4 * a * (fx * fx + fy * fy - r * r);
    return disc > 0 ? [(-b - Math.sqrt(disc)) / (2 * a), (-b + Math.sqrt(disc)) / (2 * a)] : null;
  };

  /**
   * A straight line, broken where it meets a hole or passes under a strap
   * or a ring about the centre (`rings`: radius and half-width).
   */
  const lineParts = (
    p: Pt,
    q: Pt,
    {
      holes = [],
      under = [],
      rings = [],
      cuts = [],
      worn = true,
    }: { holes?: Hole[]; under?: Strap[]; rings?: [number, number][]; cuts?: Cut[]; worn?: boolean } = {},
  ) => {
    const [dx, dy] = [q[0] - p[0], q[1] - p[1]];
    const all = [...cuts, ...under.flatMap((s) => underStrap(p, q, s))];
    for (const h of holes) {
      const c = inside(p, q, h);
      if (c) all.push(c);
    }
    for (const [r, w] of rings) {
      const outer = inside(p, q, { x: 0, y: 0, r: r + w });
      const inner = inside(p, q, { x: 0, y: 0, r: r - w });
      if (outer) all.push(...(inner ? ([[outer[0], inner[0]], [inner[1], outer[1]]] as Cut[]) : [outer]));
    }
    if (worn) all.push(...nicks(Math.hypot(dx, dy)));
    return subtract(0, 1, all).map(([t0, t1]) => ({ d: `M${pt(lerp(p, q, t0))}L${pt(lerp(p, q, t1))}`, from: t0, to: t1 }));
  };
  const line = (...args: Parameters<typeof lineParts>) => joined(lineParts(...args));

  /** A circle about the centre, broken wherever it passes through a hole. */
  const ringParts = (r: number, holes: Hole[] = [], worn = true): Part[] => {
    const cuts: Cut[] = [];
    for (const h of holes) {
      const d = Math.hypot(h.x, h.y);
      const cos = (r * r + d * d - h.r * h.r) / (2 * r * d);
      if (Math.abs(cos) >= 1) continue;
      const mid = (Math.atan2(h.x, -h.y) * 180) / Math.PI;
      const half = (Math.acos(cos) * 180) / Math.PI;
      // Put the cut in [0, 360), split in two if it wraps past the top.
      const m = ((mid % 360) + 360) % 360;
      cuts.push([m - half, m + half], [m - half - 360, m + half - 360], [m - half + 360, m + half + 360]);
    }
    if (worn) cuts.push(...nicks(2 * Math.PI * r, 360));
    const arcs = subtract(0, 360, cuts);
    // Join the arc that ends at the top to the one that starts there, so
    // the ring has no seam.
    if (arcs.length > 1 && arcs[0][0] === 0 && arcs.at(-1)![1] === 360) arcs.push([arcs.pop()![0], arcs.shift()![1] + 360]);
    return arcs.map(([a0, a1]) => {
      // Arcs under 180° each, so the sweep flags never need to change.
      const n = Math.ceil((a1 - a0) / 170);
      let d = `M${pt(at(a0, r))}`;
      for (let k = 1; k <= n; k++) d += `A${r} ${r} 0 0 1 ${pt(at(a0 + ((a1 - a0) * k) / n, r))}`;
      return { d: a1 - a0 >= 360 ? d + 'Z' : d, from: a0 / 360, to: a1 / 360 };
    });
  };
  const ring = (...args: Parameters<typeof ringParts>) => joined(ringParts(...args));

  /** Engraver's shading: lines across the triangle `o`, `l`, `t`, parallel to its side from `o` to `t`. */
  const hatch = (o: Pt, l: Pt, t: Pt, gap: number, opts: Parameters<typeof lineParts>[2] = {}) => {
    const n = Math.floor(Math.hypot(l[0] - o[0], l[1] - o[1]) / gap);
    return Array.from({ length: n }, (_, i) => {
      const s = (i + 1) / (n + 1);
      return line(lerp(o, l, s), lerp(t, l, s), { ...opts, worn: false });
    }).join('');
  };

  // The band: seals on the planets' circle, the script between each pair.
  const BAND_IN = 81;
  const BAND_OUT = 94;
  const BAND = (BAND_IN + BAND_OUT) / 2;
  const SEAL = 7.2;
  const seals = PLANETS.map((d, k) => {
    const a = (k / 7) * 360;
    const [x, y] = at(a, BAND);
    return { a, x, y, d };
  });
  const bandHoles = seals.map(({ x, y }) => ({ x, y, r: SEAL + 1.2 }));

  // Between the seals, a script nobody can read: small alchemical marks
  // (lib/alchemy) in words of two to four, picked from a fixed seed so every circle carries the same lines.
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const SCRIPT = Array.from({ length: 7 }, (_, k) => {
    const from = (k / 7) * 360 + 7.5;
    const to = ((k + 1) / 7) * 360 - 7.5;
    const step = 3.1;
    const marks: { a: number; d: string }[] = [];
    let a = from;
    while (a <= to) {
      const n = 2 + Math.floor(rnd() * 3);
      for (let i = 0; i < n && a <= to; i++, a += step) marks.push({ a, d: MARKS[Math.floor(rnd() * MARKS.length)] });
      a += step * 0.7;
    }
    // Centre the line between the seals.
    const shift = (to - (marks.at(-1)?.a ?? to)) / 2;
    return marks.map((m) => ({ ...m, a: m.a + shift }));
  }).flat();

  // The heptagram {7/2}: seven straps, each a pair of lines, their points
  // just inside the band, half a step round from the planets. Walking the
  // star in one go, the straps go over and under in turn at every crossing.
  const W = 0.8;
  const GAP = 0.7;
  const R = BAND_IN - 1.8;
  const INNER = R * Math.cos((2 * Math.PI) / 7);
  const BIG = 13;
  const sol = at(0, 65.5);
  const luna = at(180, 65.5);
  const starHoles = [sol, luna].map(([x, y]) => ({ x, y, r: BIG + 1.4 }));
  const tips = Array.from({ length: 7 }, (_, k) => at(((k + 0.5) / 7) * 360, R));
  const straps: Strap[] = Array.from({ length: 7 }, (_, i) => ({ p: tips[(i * 2) % 7], q: tips[(i * 2 + 2) % 7], w: W }));
  const cross = (a: Strap, b: Strap) => {
    const [r, s] = [
      [a.q[0] - a.p[0], a.q[1] - a.p[1]],
      [b.q[0] - b.p[0], b.q[1] - b.p[1]],
    ];
    const den = r[0] * s[1] - r[1] * s[0];
    const [ex, ey] = [b.p[0] - a.p[0], b.p[1] - a.p[1]];
    const t = (ex * s[1] - ey * s[0]) / den;
    const u = (ex * r[1] - ey * r[0]) / den;
    return t > 0.01 && t < 0.99 && u > 0.01 && u < 0.99 ? t : null;
  };
  // Each strap's crossings in order along it; every second one goes under.
  let turn = 0;
  const unders = straps.map((a, i) =>
    straps
      .map((b, j) => ({ j, t: i === j ? null : cross(a, b) }))
      .filter((c): c is { j: number; t: number } => c.t !== null)
      .sort((x, y) => x.t - y.t)
      .filter(() => turn++ % 2 === 1)
      .map(({ j }) => ({ ...straps[j], w: W + GAP })),
  );
  /** One edge of strap `i`, `side` (±1) of its centre line, mitred to its neighbours at both tips. */
  const edgeOf = (i: number, side: number): [Pt, Pt] => {
    const { p, q } = straps[i];
    const n = (s: Strap): Pt => {
      const len = Math.hypot(s.q[0] - s.p[0], s.q[1] - s.p[1]);
      return [-(s.q[1] - s.p[1]) / len, (s.q[0] - s.p[0]) / len];
    };
    // At a tip both straps' outer edges meet beyond it, their inner edges
    // short of it; each tip turns the star the same way, so the same side
    // of each strap faces out.
    const [nx, ny] = n(straps[i]);
    const miter = (tip: Pt, other: Strap): Pt => {
      const [ox, oy] = n(other);
      const [bx, by] = [nx + ox, ny + oy];
      const k = (side * W) / (nx * bx + ny * by);
      return [tip[0] + bx * k, tip[1] + by * k];
    };
    return [miter(p, straps[(i + 6) % 7]), miter(q, straps[(i + 1) % 7])];
  };
  const STAR_RING = INNER - W - GAP;

  // Sol and Luna (lib/alchemy), Luna turned so her horns face out.

  // The sun: seven long pointed rays out into the star's arms, passing
  // under the inner ring and the straps, and seven short ones between,
  // each hatched down one side.
  const SUN = 31;
  const rayStraps = straps.map((s) => ({ ...s, w: W + GAP }));
  const rays = () =>
    Array.from({ length: 14 }, (_, k) => {
      const a = ((k + 1) / 14) * 360;
      const long = k % 2 === 0;
      const [base, l, r, tip] = [at(a, SUN), at(a - (long ? 4.5 : 3.6), SUN), at(a + (long ? 4.5 : 3.6), SUN), at(a, long ? R - 8 : STAR_RING - 1.4)];
      const opts = { holes: starHoles, under: rayStraps, rings: [[STAR_RING, GAP]] as [number, number][] };
      const delay = 0.7 + k * 0.035;
      return {
        lines: [lineParts(l, tip, opts), lineParts(r, tip, opts), lineParts(base, tip, { ...opts, worn: false })].flatMap((parts) =>
          stroke(parts, delay, long ? 0.6 : 0.4),
        ),
        hatch: hatch(base, l, tip, 0.55, opts),
        delay: delay + 0.25,
      };
    });
  // Fine rays between, half as long.
  const FINE = Array.from({ length: 14 }, (_, k) => {
    const a = ((k + 0.5) / 14) * 360;
    return line(at(a, SUN + 1), at(a, SUN + 10), { worn: false });
  }).join('');

  // The heart: a compass star of eight points from a ring round the eye,
  // each hatched down one side.
  const EYE = 15;
  const COMPASS = Array.from({ length: 8 }, (_, k) => {
    const a = k * 45;
    const tip = at(a, k % 2 ? 22 : 28.5);
    const base = at(a, EYE);
    const l = at(a - 22.5, EYE / Math.cos(rad(22.5)));
    const r = at(a + 22.5, EYE / Math.cos(rad(22.5)));
    return `M${pt(l)}L${pt(tip)}L${pt(r)}M${pt(base)}L${pt(tip)}` + hatch(base, l, tip, 0.6);
  }).join('');

  // The eye, after the Eye of Providence: an almond whose upper lid is cut
  // twice and shades the eyeball below it in fine arcs; the iris half
  // hooded, ringed and streaked, with a catchlight in the pupil; and a glory
  // of fine rays about it. Each lid is an arc of a circle through the
  // corners (±12, 0) and the given height at the middle.
  const lid = (h: number) => {
    const r = (144 + h * h) / (2 * Math.abs(h));
    return { r, cy: h + Math.sign(-h) * r };
  };
  const [UPPER, LOWER, UPPER_RIM, LOWER_RIM] = [lid(-6.6), lid(5.4), lid(-7.7), lid(6.1)];
  const ALMOND = `M-12 0A${f(UPPER.r)} ${f(UPPER.r)} 0 0 1 12 0A${f(LOWER.r)} ${f(LOWER.r)} 0 0 1 -12 0Z`;
  const RIMS = `M-12 0A${f(UPPER_RIM.r)} ${f(UPPER_RIM.r)} 0 0 1 12 0M12 0A${f(LOWER_RIM.r)} ${f(LOWER_RIM.r)} 0 0 1 -12 0`;
  /** How far from `p` along the unit `u` a ray leaves the circle about (0, cy). */
  const exit = (p: Pt, u: Pt, { r, cy }: { r: number; cy: number }) => {
    const [fx, fy] = [p[0], p[1] - cy];
    const b = fx * u[0] + fy * u[1];
    return -b + Math.sqrt(b * b - (fx * fx + fy * fy - r * r));
  };
  // Short strokes across the upper lid, from its edge to its rim.
  const LID_HATCH = Array.from({ length: 23 }, (_, k) => {
    const phi = -44 + k * 4;
    const u: Pt = [Math.sin(rad(phi)), -Math.cos(rad(phi))];
    const p: Pt = [UPPER.r * u[0], UPPER.cy + UPPER.r * u[1]];
    const len = exit(p, u, UPPER_RIM);
    return len > 0.25 ? `M${pt(p)}L${pt([p[0] + u[0] * len, p[1] + u[1] * len])}` : '';
  }).join('');
  // The lid's shadow on the eyeball: arcs under its edge, shorter as they fall.
  const SHADOW = [1, 2, 3, 4]
    .map((k) => {
      const r = UPPER.r - k * 0.75;
      const span = 40 - k * 8;
      const p = (phi: number) => pt([r * Math.sin(rad(phi)), UPPER.cy - r * Math.cos(rad(phi))]);
      return `M${p(-span)}A${f(r)} ${f(r)} 0 0 1 ${p(span)}`;
    })
    .join('');
  const IRIS_Y = -1;
  const IRIS_R = 6.2;
  const STREAKS = Array.from({ length: 44 }, (_, k) => {
    const a = (k / 44) * 360;
    const [p, q] = [at(a, 2.5), at(a, k % 2 ? 4.6 : IRIS_R - 0.9)];
    return `M${pt(p)}L${pt(q)}`;
  }).join('');
  const COLLARETTE =
    'M' +
    Array.from({ length: 73 }, (_, k) => {
      const a = (k / 72) * 360;
      return pt(at(a, 3.5 + 0.28 * Math.sin(rad(a * 9))));
    }).join('L');
  const PUPIL = 'M0 -2.2A2.2 2.2 0 1 1 0 2.2A2.2 2.2 0 1 1 0 -2.2ZM-0.8 -1.45A0.55 0.55 0 1 0 -0.8 -0.35A0.55 0.55 0 1 0 -0.8 -1.45Z';
  // The glory: rays from just off the lids out to the ring, long and short.
  const GLORY = Array.from({ length: 48 }, (_, k) => {
    const a = ((k + 0.5) / 48) * 360;
    const u = at(a, 1);
    const from = exit([0, 0], u, u[1] < 0 ? UPPER_RIM : LOWER_RIM) + 1.4;
    const to = k % 2 ? EYE - 2.6 : EYE - 1.2;
    return to - from > 1 ? `M${pt([u[0] * from, u[1] * from])}L${pt([u[0] * to, u[1] * to])}` : '';
  }).join('');

  // Everything that wears, drawn twice: worn for the lines, whole for
  // the glow under them.
  const drawing = (worn: boolean) => {
    wearing = worn;
    wearSeed = 5;
    return {
      band: [ringParts(97.5), ringParts(BAND_OUT, bandHoles), ringParts(BAND_IN, bandHoles)].map((parts, k) => stroke(parts, 0.55 + k * 0.1, 1.1)),
      straps: straps.flatMap((_, i) =>
        [1, -1].map((side) => stroke(lineParts(...edgeOf(i, side), { holes: starHoles, under: unders[i] }), 0.4 + i * 0.09, 0.5)),
      ),
      starRing: stroke(ringParts(STAR_RING, starHoles), 0.3, 0.9),
      rays: rays(),
      sun: stroke(ringParts(SUN), 0.15, 0.8),
      sunInner: stroke(ringParts(SUN - 1.6), 0.2, 0.8),
      eyeRing: stroke(ringParts(EYE), 0.05, 0.7),
    };
  };

  // ---- the markup, built once for every circle on the page ----------
  //
  // A circle is made of some six hundred lines, most of them pieces of a
  // broken line, each drawn in by its own animation. Built as markup once
  // (not as six hundred components each time a circle mounts) and put on
  // the page a layer at a time, just before each draws, no frame carries
  // much of it. Once a layer is drawn, its
  // pieces give way to a still copy: the same lines merged into one path
  // per weight, with nothing animated (finished animations keep holding
  // their last frame and are styled again with every change of the
  // circle's colour), so a reveal recolours a few dozen paths, not the
  // whole drawing.

  /** A drawing's lines as they draw in, the same lines still, and when the first of them starts and the last is drawn (s). */
  type Plate = { drawing: string; still: string; start: number; end: number };

  /** Maps a path of absolute commands (as the signs are drawn) point by point; `turn` (degrees) and `k` for its arcs. */
  const mapPath = (d: string, m: (p: Pt) => Pt, turn = 0, k = 1) => {
    const tok = d.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) ?? [];
    let i = 0;
    let cmd = '';
    let cur: Pt = [0, 0];
    let start: Pt = [0, 0];
    let out = '';
    const num = () => Number(tok[i++]);
    const to = (p: Pt) => ((cur = p), pt(m(p)));
    while (i < tok.length) {
      if (/[A-Za-z]/.test(tok[i])) cmd = tok[i++];
      switch (cmd) {
        case 'M':
          out += `M${to([num(), num()])}`;
          start = cur;
          cmd = 'L';
          break;
        case 'L':
          out += `L${to([num(), num()])}`;
          break;
        case 'H':
          out += `L${to([num(), cur[1]])}`;
          break;
        case 'V':
          out += `L${to([cur[0], num()])}`;
          break;
        case 'C':
          out += `C${pt(m([num(), num()]))} ${pt(m([num(), num()]))} ${to([num(), num()])}`;
          break;
        case 'S':
          out += `S${pt(m([num(), num()]))} ${to([num(), num()])}`;
          break;
        case 'A': {
          const [rx, ry, rot, large, sweep] = [num(), num(), num(), num(), num()];
          out += `A${f(rx * k)} ${f(ry * k)} ${f(rot + turn)} ${large} ${sweep} ${to([num(), num()])}`;
          break;
        }
        case 'Z':
          out += 'Z';
          cur = start;
          cmd = '';
          break;
        default:
          throw new Error(`ArcaneCircle: no ${cmd} in a sign's path`);
      }
    }
    return out;
  };
  /** Turned `a` degrees about the origin (clockwise on screen, as SVG's rotate). */
  const turned = (a: number) => {
    const [c, s] = [Math.cos(rad(a)), Math.sin(rad(a))];
    return ([x, y]: Pt): Pt => [x * c - y * s, x * s + y * c];
  };
  const circlePath = (r: number) => `M0 ${-r}A${r} ${r} 0 1 1 0 ${r}A${r} ${r} 0 1 1 0 ${-r}Z`;

  /** Builds one drawing's markup, collecting the still copy's paths by their weight (class) as it goes. */
  const engrave = (draw: (e: ReturnType<typeof engraver>) => void): Plate => {
    const e = engraver();
    draw(e);
    return { drawing: e.drawing(), still: e.still(), start: e.start(), end: e.end() };
  };
  const engraver = () => {
    let drawing = '';
    let start = Infinity;
    let end = 0;
    const still = new Map<string, string>();
    const keep = (cls: string, d: string) => still.set(cls, (still.get(cls) ?? '') + d);
    /** A line that starts at `from` and is done at `to`. */
    const span = (from: number, to: number) => {
      start = Math.min(start, from);
      end = Math.max(end, to);
    };
    const style = (delay: number, t: number) => `style="--d:${sec(delay)};--t:${sec(t)}"`;
    return {
      /** A line drawn in, eased, as one stroke. */
      line(d: string, cls: string, delay: number, t: number) {
        drawing += `<path d="${d}" class="draw ${cls}" ${style(delay, t)} pathLength="100"/>`;
        keep(cls, d);
        span(delay, delay + t);
      },
      /** A broken line drawn in one sweep of the pen, piece by piece (see stroke()). */
      pieces(list: Stroke, cls: string) {
        for (const { d, delay, t } of list) {
          drawing += `<path d="${d}" class="draw piece ${cls}" ${style(delay, t)} pathLength="100"/>`;
          keep(cls, d);
          span(delay, delay + t);
        }
      },
      /**
       * A seal stamped in at `delay`: its double ring (`r`, the inner one
       * `inner` inside it) drawn in `t`, its signs ([path, class, scale])
       * set down after; `place` puts a point of it on the circle, as
       * `transform` (turning it `turn` degrees) does.
       */
      seal(delay: number, place: (p: Pt) => Pt, transform: string, turn: number, r: number, inner: number, t: number, signs: [string, string, number][]) {
        drawing += `<g class="seal" style="--d:${sec(delay)}"><g transform="${transform}">`;
        drawing += `<circle r="${r}" class="draw" style="--t:${sec(t)}" pathLength="100"/>`;
        drawing += `<circle r="${f(r - inner)}" class="draw hair" style="--t:${sec(t)}" pathLength="100"/>`;
        for (const [d, cls, k] of signs) drawing += `<path d="${d}"${k === 1 ? '' : ` transform="scale(${k})"`} class="${cls} carve"/>`;
        drawing += '</g></g>';
        keep('', mapPath(circlePath(r), place));
        keep('hair', mapPath(circlePath(r - inner), place));
        for (const [d, cls, k] of signs) keep(k === 1 ? cls : `${cls} big`, mapPath(d, (p) => place([p[0] * k, p[1] * k]), turn, k));
        span(delay, delay + Math.max(0.55, t, 0.3 + 0.6));
      },
      /** A mark of the script, written at `delay`, `transform` and `place` putting it on the band. */
      mark(d: string, delay: number, transform: string, place: (p: Pt) => Pt, turn: number) {
        drawing += `<path d="${d}" transform="${transform}" class="sign mark" style="--d:${sec(delay)}"/>`;
        keep('sign', mapPath(d, place, turn));
        span(delay, delay + 0.35);
      },
      drawing: () => drawing,
      still: () => [...still].map(([cls, d]) => `<path d="${d}"${cls ? ` class="${cls}"` : ''}/>`).join(''),
      start: () => start,
      end: () => end,
    };
  };

  // The layers, each drawn twice: worn for the lines, whole for the glow under them.
  const layers = (p: ReturnType<typeof drawing>) => ({
    band: engrave((e) => {
      p.band.forEach((list, k) => e.pieces(list, k ? '' : 'thin'));
      seals.forEach((seal, k) => {
        const turn = turned(seal.a);
        e.seal(0.95 + k * 0.07, (q) => {
          const [x, y] = turn(q);
          return [seal.x + x, seal.y + y];
        }, `translate(${f(seal.x)} ${f(seal.y)}) rotate(${seal.a})`, seal.a, SEAL, 1.2, 0.5, [[seal.d, 'sign', 1.05]]);
      });
      SCRIPT.forEach((m, k) => {
        const turn = turned(m.a);
        e.mark(m.d, 1.15 + (k / SCRIPT.length) * 0.8, `rotate(${f(m.a)}) translate(0 -${BAND})`, (q) => turn([q[0], q[1] - BAND]), m.a);
      });
    }),
    star: engrave((e) => {
      e.pieces(p.starRing, 'thin');
      for (const edge of p.straps) e.pieces(edge, 'thin');
      for (const ray of p.rays) {
        e.pieces(ray.lines, 'hair');
        e.line(ray.hatch, 'hatch', ray.delay, 0.5);
      }
      e.line(FINE, 'hair', 1, 0.6);
      const [sx, sy] = sol;
      e.seal(1, (q) => [sx + q[0], sy + q[1]], `translate(${f(sx)} ${f(sy)})`, 0, BIG, 1.6, 0.6, [
        [circlePath(5), 'sign', 1],
        [circlePath(1.1), 'sign', 1],
        [SOL_RAYS, 'sign', 1],
      ]);
      const [lx, ly] = luna;
      e.seal(1.12, (q) => [lx - q[0], ly - q[1]], `translate(${f(lx)} ${f(ly)}) rotate(180)`, 180, BIG, 1.6, 0.6, [
        [LUNA, 'sign', 1],
        [LUNA_HATCH, 'sign hatch', 1],
      ]);
    }),
    heart: engrave((e) => {
      e.pieces(p.eyeRing, 'thin');
      e.pieces(p.sun, 'thin');
      e.pieces(p.sunInner, 'hair');
      e.line(COMPASS, 'hair', 0.3, 0.9);
    }),
    glory: engrave((e) => e.line(GLORY, 'hair', 1.35, 0.7)),
  });
  const GLOW = layers(drawing(false));
  const LINES = layers(drawing(true));
  wearing = false;
  type Layer = keyof typeof LINES;
  const LAYERS = Object.keys(LINES) as Layer[];
  /** How long before its first line draws a layer's lines go on the page (s). */
  const AHEAD = 0.2;
  /** The layers that turn, outermost first; the glory stays still. */
  const SPUN = ['band', 'star', 'heart'] as const;

  // The eye, the same while drawn and after (it opens as a whole); `@id@`
  // stands for the circle's own id, which names its clip.
  const eye = (key: string) =>
    `<defs><clipPath id="@id@-${key}"><path d="${ALMOND}"/></clipPath></defs>` +
    `<g clip-path="url(#@id@-${key})"><g transform="translate(0 ${IRIS_Y})">` +
    `<circle r="${IRIS_R}" class="iris"/><circle r="${f(IRIS_R - 0.7)}" class="hatch"/>` +
    `<path d="${STREAKS}" class="hatch"/><path d="${COLLARETTE}" class="hatch"/><path d="${PUPIL}" class="pupil"/>` +
    `</g><path d="${SHADOW}" class="hatch"/></g>` +
    `<path d="${ALMOND}" class="lid"/><path d="${RIMS}" class="hatch"/><path d="${LID_HATCH}" class="hatch"/>`;
  const EYE_GLOW = eye('c');
  const EYE_LINES = eye('w');
</script>

<script lang="ts">
  let {
    state: mood = 'idle',
    size,
    color,
    strength,
  }: { state?: 'idle' | 'good' | 'bad'; size?: string; color?: string; strength?: number } = $props();

  const uid = $props.id();
  const eyeGlow = EYE_GLOW.replaceAll('@id@', uid);
  const eyeLines = EYE_LINES.replaceAll('@id@', uid);

  // Each layer's lines go on the page a moment before they start to draw,
  // not all on the frame that shows the question; `late` says how long after
  // the circle they came, which their delays leave out, so the summoning
  // plays as if they had been there all along. Once drawn, a layer takes its
  // still copy. Both are timed on the summoning's own clock (its settle
  // animation's), not from when this ran: a slow first frame starts the CSS
  // animations late, and a layer swapped on the page's clock would jump to
  // drawn before its lines had finished.
  const due = (name: Layer) => Math.max(0, Math.min(LINES[name].start, GLOW[name].start) - AHEAD);
  let late = $state<Partial<Record<Layer, number>>>(Object.fromEntries(LAYERS.filter((name) => !due(name)).map((name) => [name, 0])));
  let drawn = $state<Partial<Record<Layer, true>>>({});
  let summon: HTMLDivElement;
  $effect(() => {
    let timers: ReturnType<typeof setTimeout>[] = [];
    let stopped = false;
    /** Times each layer from `start` (performance.now()'s clock), when the summoning began. */
    const time = (start: number) => {
      if (stopped) return;
      const at = (s: number, fn: () => void) => timers.push(setTimeout(fn, Math.max(0, s * 1000 - (performance.now() - start))));
      for (const name of LAYERS) {
        if (due(name)) at(due(name), () => (late[name] = (performance.now() - start) / 1000));
        at(Math.max(LINES[name].end, GLOW[name].end) + 0.15, () => (drawn[name] = true));
      }
    };
    // (Its only animation: the circle's settling in.)
    const settle = summon.getAnimations()[0];
    if (settle)
      settle.ready.then(
        () => time(performance.now() - Number(settle.currentTime ?? 0)),
        () => {},
      );
    else time(performance.now());
    return () => {
      stopped = true;
      timers.forEach(clearTimeout);
      timers = [];
    };
  });
  const plate = (p: Plate, name: Layer) => (drawn[name] ? p.still : late[name] === undefined ? '' : p.drawing);
  const lateOf = (name: Layer) => `${(late[name] ?? 0).toFixed(3)}s`;
</script>

<!--
  The summoning, in seconds from the start: a light blooms at the centre,
  the rings draw outward from the eye, the heptagram is traced strap by
  strap, the sun's rays shoot out, the planets are stamped round the band
  and the script written after them, and last of all the eye opens. Each
  layer winds into place meanwhile, and the glow swells up under it all.
-->

<div class="arcane {mood}" aria-hidden="true" style:--size={size} style:color={color} style:opacity={strength}>
  <div class="summon" bind:this={summon}>
    <div class="bloom"></div>
    {#each SPUN as name (name)}
      <div class="layer spin {name}">
        <svg class="glow" viewBox="-100 -100 200 200" style:--late={lateOf(name)}>{@html plate(GLOW[name], name)}</svg>
        <svg viewBox="-100 -100 200 200" style:--late={lateOf(name)}>{@html plate(LINES[name], name)}</svg>
      </div>
    {/each}
    <div class="layer">
      <svg class="glow" viewBox="-100 -100 200 200" style:--late={lateOf('glory')}>{@html plate(GLOW.glory, 'glory')}</svg>
      <svg viewBox="-100 -100 200 200" style:--late={lateOf('glory')}>{@html plate(LINES.glory, 'glory')}</svg>
    </div>
    <div class="layer eye">
      <svg class="glow" viewBox="-100 -100 200 200">{@html eyeGlow}</svg>
      <svg viewBox="-100 -100 200 200">{@html eyeLines}</svg>
    </div>
    <div class="wave"></div>
  </div>
</div>

<style>
  .arcane {
    position: absolute;
    inset: 0;
    margin: auto;
    /* The stage is a size container (see QuestionView). */
    width: var(--size, min(92cqw, 92cqh, 420px));
    height: var(--size, min(92cqw, 92cqh, 420px));
    pointer-events: none;
    opacity: 0.22;
    color: #d9a45a;
    /* Only the opacity eases (on the compositor). The colour changes at
       once: every stroke of the circle takes it (currentColor), and easing
       it restyled and repainted each of those hundreds of strokes every
       frame for most of a second, right as a reveal's effects began, which
       made them stutter. The reveal's flare covers the change. */
    transition: opacity 0.8s;
    --draw-ease: cubic-bezier(0.55, 0, 0.25, 1);
  }
  .arcane.good {
    opacity: 0.3;
    color: #d8dfa0;
  }
  .arcane.bad {
    opacity: 0.16;
    color: #d98a6e;
  }
  .summon,
  .layer,
  svg,
  .bloom,
  .wave {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  /* The whole circle settles in from a touch larger as it is drawn. */
  .summon {
    animation: settle 2.4s var(--ease-out) both;
  }
  .layer {
    will-change: transform;
  }

  /* Each ring turns its own way and speed, and first winds into place. */
  .band {
    --turn: 240s;
    --from: -24deg;
  }
  .star {
    --turn: 160s;
    --dir: reverse;
    --from: 40deg;
  }
  .heart {
    --turn: 100s;
    --from: -70deg;
  }
  .spin {
    animation:
      turn var(--turn) linear infinite var(--dir, normal),
      wind 2.6s var(--ease-out) both;
  }
  /* A wrong answer jars the circle. */
  .bad .spin {
    animation:
      turn var(--turn) linear infinite var(--dir, normal),
      falter 0.7s var(--ease-out) both;
  }

  /* The lines are put on the page as markup (see engrave()), so their
     rules reach them as global ones within the circle. */
  .arcane :global(path),
  .arcane :global(circle) {
    fill: none;
    stroke: currentColor;
    stroke-width: 0.5;
    stroke-linecap: butt;
    stroke-linejoin: miter;
    stroke-miterlimit: 12;
  }
  /* A circle has no ends, but its dash for the drawing does. */
  .arcane :global(circle) {
    stroke-linecap: round;
  }
  .arcane :global(.thin) {
    stroke-width: 0.35;
  }
  .arcane :global(.hair) {
    stroke-width: 0.22;
  }
  .arcane :global(.sign) {
    stroke-width: 0.42;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  /* A planet's sign is drawn 1.05 times its size, and its line with it. */
  .arcane :global(.big) {
    stroke-width: 0.441;
  }
  .arcane :global(.hatch) {
    stroke-width: 0.2;
    stroke-linecap: round;
  }
  .arcane :global(.lid) {
    stroke-width: 0.45;
  }
  .arcane :global(.iris) {
    stroke-width: 0.35;
  }
  .arcane :global(.pupil) {
    fill: currentColor;
    fill-rule: evenodd;
    stroke: none;
    transform-box: fill-box;
    transform-origin: center;
    transition: transform 0.9s var(--ease-out);
  }
  /* The eye widens at a right answer and narrows at a wrong one. */
  .good :global(.pupil) {
    transform: scale(1.3);
  }
  .bad :global(.pupil) {
    transform: scale(0.72);
  }

  /* The glow: the same strokes, wide and faint, on their own layer so it
     can breathe without repainting. It swells up as the circle is drawn. */
  .glow {
    opacity: 0.22;
    animation:
      glow-in 1.4s 0.8s ease-out both,
      breathe 6s 2.2s ease-in-out infinite alternate;
  }
  .arcane .glow :global(*) {
    stroke-width: 2;
  }
  .arcane .glow :global(.big) {
    stroke-width: 2.1;
  }
  .arcane .glow :global(.hair),
  .arcane .glow :global(.hatch) {
    stroke-width: 1;
  }

  .arcane :global(.draw) {
    stroke-dasharray: 100;
    animation: draw var(--t, 1s) calc(var(--d, 0s) - var(--late, 0s)) var(--draw-ease) both;
  }
  /* A piece of a longer stroke keeps the pen's pace (see stroke()). */
  .arcane :global(.piece) {
    animation-timing-function: linear;
  }
  /* Signs are set down once their lines are drawn. */
  .arcane :global(.carve) {
    animation: carve 0.6s calc(var(--d, 0s) + 0.3s - var(--late, 0s)) var(--ease-out) both;
  }
  /* The script is written mark by mark. */
  .arcane :global(.mark) {
    animation: carve 0.35s calc(var(--d) - var(--late, 0s)) var(--ease-out) both;
  }
  /* Seals are pressed in like a stamp. */
  .arcane :global(.seal) {
    transform-box: fill-box;
    transform-origin: center;
    animation: stamp 0.55s calc(var(--d) - var(--late, 0s)) var(--ease-out) both;
  }

  /* The eye opens last, and now and then it blinks. */
  .eye {
    animation: open 0.8s 1.55s cubic-bezier(0.3, 1.35, 0.5, 1) both;
  }
  .eye svg {
    animation: blink 9s 5s infinite;
  }
  .eye .glow {
    animation:
      glow-in 1.4s 0.8s ease-out both,
      breathe 6s 2.2s ease-in-out infinite alternate,
      blink 9s 5s infinite;
  }

  /* A light at the centre: it blooms as the circle is summoned and flares
     at a right answer, with a ring of light running out over the circle. */
  .bloom {
    background: radial-gradient(closest-side, color-mix(in srgb, currentColor 55%, transparent), transparent);
    opacity: 0;
    animation: bloom 1.5s ease-out both;
  }
  .good .bloom {
    animation: flare 1.6s ease-out both;
  }
  .wave {
    border: 1.5px solid currentColor;
    border-radius: 50%;
    box-shadow:
      0 0 18px currentColor,
      inset 0 0 18px currentColor;
    opacity: 0;
  }
  .good .wave {
    animation: wave 1.3s var(--ease-out) both;
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
  @keyframes stamp {
    from {
      opacity: 0;
      transform: scale(1.6);
    }
  }
  @keyframes settle {
    from {
      transform: scale(1.06);
    }
  }
  @keyframes wind {
    from {
      transform: rotate(var(--from));
    }
  }
  @keyframes falter {
    20% {
      transform: rotate(-2.5deg);
    }
    45% {
      transform: rotate(1.6deg);
    }
    70% {
      transform: rotate(-0.6deg);
    }
  }
  @keyframes turn {
    to {
      rotate: 360deg;
    }
  }
  @keyframes open {
    from {
      opacity: 0;
      scale: 1 0.05;
    }
    30% {
      opacity: 1;
    }
  }
  @keyframes blink {
    0%,
    94% {
      scale: 1 1;
    }
    95.5% {
      scale: 1 0.06;
    }
    97.5% {
      scale: 1 1;
    }
  }
  @keyframes glow-in {
    from {
      opacity: 0;
    }
    55% {
      opacity: 0.42;
    }
    to {
      opacity: 0.28;
    }
  }
  @keyframes breathe {
    from {
      opacity: 0.28;
    }
    to {
      opacity: 0.1;
    }
  }
  @keyframes bloom {
    from {
      opacity: 0;
      transform: scale(0.15);
    }
    25% {
      opacity: 0.9;
    }
    to {
      opacity: 0;
      transform: scale(0.9);
    }
  }
  @keyframes flare {
    from {
      opacity: 0;
      transform: scale(0.3);
    }
    20% {
      opacity: 1;
    }
    to {
      opacity: 0;
      transform: scale(1.1);
    }
  }
  @keyframes wave {
    from {
      opacity: 1;
      transform: scale(0.2);
    }
    to {
      opacity: 0;
      transform: scale(1.15);
    }
  }
</style>
