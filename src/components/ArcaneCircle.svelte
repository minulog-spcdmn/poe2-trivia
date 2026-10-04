<script lang="ts">
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
  let {
    state = 'idle',
    size,
    color,
    strength,
  }: { state?: 'idle' | 'good' | 'bad'; size?: string; color?: string; strength?: number } = $props();

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
  const line = (
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
    return subtract(0, 1, all)
      .map(([t0, t1]) => `M${pt(lerp(p, q, t0))}L${pt(lerp(p, q, t1))}`)
      .join('');
  };

  /** A circle about the centre, broken wherever it passes through a hole. */
  const ring = (r: number, holes: Hole[] = [], worn = true) => {
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
    return arcs
      .map(([a0, a1]) => {
        // Arcs under 180° each, so the sweep flags never need to change.
        const n = Math.ceil((a1 - a0) / 170);
        let d = `M${pt(at(a0, r))}`;
        for (let k = 1; k <= n; k++) d += `A${r} ${r} 0 0 1 ${pt(at(a0 + ((a1 - a0) * k) / n, r))}`;
        return a1 - a0 >= 360 ? d + 'Z' : d;
      })
      .join('');
  };

  /** Engraver's shading: lines across the triangle `o`, `l`, `t`, parallel to its side from `o` to `t`. */
  const hatch = (o: Pt, l: Pt, t: Pt, gap: number, opts: Parameters<typeof line>[2] = {}) => {
    const n = Math.floor(Math.hypot(l[0] - o[0], l[1] - o[1]) / gap);
    return Array.from({ length: n }, (_, i) => {
      const s = (i + 1) / (n + 1);
      return line(lerp(o, l, s), lerp(t, l, s), { ...opts, worn: false });
    }).join('');
  };

  // The seven planets and their metals, drawn on a small grid (about ±4).
  const PLANETS = [
    'M0 -3.6A3.6 3.6 0 1 1 0 3.6A3.6 3.6 0 1 1 0 -3.6M0 -0.6A0.6 0.6 0 1 1 0 0.6A0.6 0.6 0 1 1 0 -0.6', // Sol • gold
    'M1 -4A4.2 4.2 0 1 0 1 4A3.3 3.3 0 1 1 1 -4Z', // Luna • silver
    'M-2.2 -4.6A2.2 2.2 0 0 0 2.2 -4.6M0 -3.2A1.9 1.9 0 1 1 0 0.6A1.9 1.9 0 1 1 0 -3.2M0 0.6V4.6M-1.6 2.8H1.6', // Mercury • quicksilver
    'M0 -4.4A2.4 2.4 0 1 1 0 0.4A2.4 2.4 0 1 1 0 -4.4M0 0.4V4.6M-1.8 2.6H1.8', // Venus • copper
    'M-1 -1.4A2.6 2.6 0 1 1 -1 3.8A2.6 2.6 0 1 1 -1 -1.4M0.9 -0.5L3.6 -3.2M1.2 -3.4H3.6V-1', // Mars • iron
    'M-3 -2.2C-3 -4.6 0.4 -4.6 0.2 -2.2C0 -0.4 -2 0.8 -3 1.4H3.2M1.6 -3.8V4.4', // Jupiter • tin
    'M-1 -4.4V2M-2.6 -2.8H0.6M-1 -0.4C0.2 -1.8 2.8 -1.6 2.6 0.6C2.4 2.4 0.4 2.6 1.2 4.4', // Saturn • lead
  ];

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
  // (the four elements, salt, sulphur and the like) in words of two to
  // four, picked from a fixed seed so every circle carries the same lines.
  const MARKS = [
    'M0 -2L1.7 1.5H-1.7Z', // fire
    'M0 2L1.7 -1.5H-1.7Z', // water
    'M0 -2L1.7 1.5H-1.7ZM-1.4 0.4H1.4', // air
    'M0 2L1.7 -1.5H-1.7ZM-1.4 -0.4H1.4', // earth
    'M0 -1.6A1.6 1.6 0 1 1 0 1.6A1.6 1.6 0 1 1 0 -1.6M-1.6 0H1.6', // salt
    'M0 -2.2L1.2 -0.2H-1.2ZM0 -0.2V2.2M-1 1H1', // sulphur
    'M0 -0.6A1.3 1.3 0 1 1 0 2A1.3 1.3 0 1 1 0 -0.6M0 -0.6V-2.4M-0.9 -1.6H0.9', // antimony
    'M-1.4 -2L0 2L1.4 -2M-0.9 -0.6H0.9', // arsenic
    'M-1.2 -2H1.2L-0.6 0C1.8 0 1.8 2.2 -1.2 2', // dram
    'M-1.5 1C-1.5 -2 1.5 -2 1.5 0S-0.4 2 -0.4 0', // a turn of the pen
    'M0 -2V2M-1.2 -0.8H1.2', // cross
    'M0.6 -2A2 2 0 1 0 0.6 2A1.5 1.5 0 1 1 0.6 -2', // crescent
    'M-1.4 2V-2L1.4 2V-2', // a zigzag
    'M-1.3 -1.6C0 -2.6 1.6 -1 0 0C-1.6 1 0 2.6 1.3 1.6', // an S
  ];
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

  // Sol: a disc with twelve rays, long and short in turn.
  const SOL_RAYS = Array.from({ length: 12 }, (_, k) => line(at(k * 30, 6.6), at(k * 30, k % 2 ? 8.4 : 10), { worn: false })).join('');
  // Luna: a crescent shaded in hatching, its horns turned out.
  const LUNA = 'M4.67 -7.11A8.5 8.5 0 1 0 4.67 7.11A7.2 7.2 0 1 1 4.67 -7.11Z';
  const LUNA_HATCH = Array.from({ length: 13 }, (_, i) => {
    const y = -6 + i;
    const x0 = -Math.sqrt(8.5 ** 2 - y * y) + 0.7;
    const x1 = 3.5 - Math.sqrt(7.2 ** 2 - y * y) - 0.7;
    return x1 - x0 > 0.3 ? `M${f(x0)} ${y}H${f(x1)}` : '';
  }).join('');

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
      return line(l, tip, opts) + line(r, tip, opts) + line(base, tip, { ...opts, worn: false }) + hatch(base, l, tip, 0.55, opts);
    }).join('');
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

  // The eye: an almond under a lashed lid, the iris engraved in rays.
  const LIDS = 'M-11.5 0A14.02 14.02 0 0 1 11.5 0A15.73 15.73 0 0 1 -11.5 0Z';
  const LASHES = [-38, -19, 0, 19, 38]
    .map((phi) => {
      const [s, c] = [Math.sin(rad(phi)), Math.cos(rad(phi))];
      const p: Pt = [14.02 * s, 8.02 - 14.02 * c];
      const len = phi === 0 ? 2.6 : 2.1;
      return `M${pt(p)}L${pt([p[0] + s * len, p[1] - c * len])}`;
    })
    .join('');
  // Everything that wears, drawn twice: worn for the lines, whole for
  // the glow under them.
  const drawing = (worn: boolean) => {
    wearing = worn;
    wearSeed = 5;
    return {
      band: [ring(97.5), ring(BAND_OUT, bandHoles), ring(BAND_IN, bandHoles)],
      star: straps
        .map((_, i) => [1, -1].map((side) => line(...edgeOf(i, side), { holes: starHoles, under: unders[i] })).join(''))
        .join(''),
      starRing: ring(STAR_RING, starHoles),
      rays: rays(),
      sun: ring(SUN),
      sunInner: ring(SUN - 1.6),
      eyeRing: ring(EYE),
    };
  };
  const CLEAN = drawing(false);
  const WORN = drawing(true);
  wearing = false;
  type Drawing = typeof WORN;

  const IRIS = Array.from({ length: 24 }, (_, k) => line(at(k * 15, 2.4), at(k * 15, 4.4), { worn: false })).join('');
</script>

{#snippet band(p: Drawing)}
  {#each p.band as d, k (k)}
    <path {d} class={k ? 'draw' : 'draw thin'} pathLength="100" />
  {/each}
  {#each seals as s (s.a)}
    <circle cx={f(s.x)} cy={f(s.y)} r={SEAL} class="draw" pathLength="100" />
    <circle cx={f(s.x)} cy={f(s.y)} r={SEAL - 1.2} class="draw hair" pathLength="100" />
    <path d={s.d} transform="translate({f(s.x)} {f(s.y)}) rotate({s.a}) scale(1.05)" class="sign" />
  {/each}
  {#each SCRIPT as m (m.a)}
    <path d={m.d} transform="rotate({f(m.a)}) translate(0 -{BAND})" class="sign" />
  {/each}
{/snippet}

{#snippet star(p: Drawing)}
  <path d={p.star} class="draw thin" pathLength="100" />
  <path d={p.starRing} class="draw thin" pathLength="100" />
  <path d={p.rays} class="draw hair" pathLength="100" />
  <path d={FINE} class="draw hair" pathLength="100" />
  {#each [sol, luna] as [x, y], k (k)}
    <circle cx={f(x)} cy={f(y)} r={BIG} class="draw" pathLength="100" />
    <circle cx={f(x)} cy={f(y)} r={BIG - 1.6} class="draw hair" pathLength="100" />
  {/each}
  <g transform="translate({f(sol[0])} {f(sol[1])})">
    <circle r="5" class="sign" />
    <circle r="1.1" class="sign" />
    <path d={SOL_RAYS} class="sign" />
  </g>
  <g transform="translate({f(luna[0])} {f(luna[1])}) rotate(180)">
    <path d={LUNA} class="sign" />
    <path d={LUNA_HATCH} class="sign hatch" />
  </g>
{/snippet}

{#snippet heart(p: Drawing)}
  <path d={p.sun} class="draw thin" pathLength="100" />
  <path d={p.sunInner} class="draw hair" pathLength="100" />
  <path d={p.eyeRing} class="draw thin" pathLength="100" />
  <path d={COMPASS} class="draw hair" pathLength="100" />
{/snippet}

{#snippet eye(_: Drawing)}
  <path d={LIDS} class="draw thin" pathLength="100" />
  <path d={LASHES} class="sign" />
  <circle r="4.6" class="sign" />
  <path d={IRIS} class="sign hatch" />
  <circle r="1.9" class="pupil" />
{/snippet}

<div class="arcane {state}" aria-hidden="true" style:--size={size} style:color={color} style:opacity={strength}>
  {#each [band, star, heart, eye] as layer, k (k)}
    <div class="layer {['band', 'star', 'heart', 'eye'][k]}">
      <svg class="glow" viewBox="-100 -100 200 200">{@render layer(CLEAN)}</svg>
      <svg viewBox="-100 -100 200 200">{@render layer(WORN)}</svg>
    </div>
  {/each}
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
    transition:
      opacity 0.8s,
      color 0.8s;
  }
  .arcane.good {
    opacity: 0.3;
    color: #d8dfa0;
  }
  .arcane.bad {
    opacity: 0.16;
    color: #d98a6e;
  }
  .layer,
  svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  .layer {
    will-change: transform;
  }
  .band {
    animation: turn 240s linear infinite;
  }
  .star {
    animation: turn 160s linear infinite reverse;
  }
  .heart {
    animation: turn 100s linear infinite;
  }
  path,
  circle {
    fill: none;
    stroke: currentColor;
    stroke-width: 0.5;
    stroke-linecap: butt;
    stroke-linejoin: miter;
    stroke-miterlimit: 12;
  }
  /* A circle has no ends, but its dash for the drawing does. */
  circle {
    stroke-linecap: round;
  }
  .thin {
    stroke-width: 0.35;
  }
  .hair {
    stroke-width: 0.22;
  }
  /* A sign drawn at k times its size keeps the same line. */
  .sign {
    stroke-width: calc(0.42px / var(--k, 1));
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .hatch {
    stroke-width: 0.22;
  }
  .pupil {
    fill: currentColor;
    stroke: none;
  }
  /* The glow: the same strokes, wide and faint, on their own layer so it
     can breathe without repainting. */
  .glow {
    opacity: 0.22;
    animation: breathe 6s ease-in-out infinite alternate;
  }
  .glow :global(*) {
    stroke-width: 2;
  }
  .glow :global(.sign) {
    stroke-width: calc(2px / var(--k, 1));
  }
  .glow :global(.hair),
  .glow :global(.hatch) {
    stroke-width: 1;
  }
  .draw {
    stroke-dasharray: 100;
    animation: draw 2s var(--ease-out) both;
  }
  .star .draw {
    animation-delay: 0.3s;
  }
  .heart .draw {
    animation-delay: 0.6s;
  }
  .eye .draw {
    animation-delay: 0.9s;
  }
  /* The signs, the script and the eye are set down once the lines are
     drawn. */
  .sign,
  .pupil {
    animation: carve 1s 1.3s var(--ease-out) both;
  }
  @keyframes breathe {
    from {
      opacity: 0.14;
    }
    to {
      opacity: 0.34;
    }
  }
  @keyframes carve {
    from {
      opacity: 0;
    }
  }
  @keyframes draw {
    from {
      stroke-dashoffset: 100;
    }
  }
  @keyframes turn {
    to {
      rotate: 360deg;
    }
  }
</style>
