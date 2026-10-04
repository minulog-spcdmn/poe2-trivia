<script lang="ts">
  // An alchemist's circle that draws itself behind the item art and turns
  // slowly, in three layers:
  // • the band: the seven planets of the old metals in seals, with lines
  //   of an unreadable alchemical script between them;
  // • a heptagram, one point per planet, with Sol and Luna sealed inside;
  // • at the heart, a compass star in a sun whose rays reach out to the
  //   heptagram's inner circle.
  // Lines stop short of every seal they meet, as if drawn around it.
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

  type Hole = { x: number; y: number; r: number };
  const f = (v: number) => v.toFixed(2);
  const rad = (a: number) => (a * Math.PI) / 180;
  /** The point at `a` degrees clockwise from the top, `r` from the centre. */
  const at = (a: number, r: number): [number, number] => [r * Math.sin(rad(a)), -r * Math.cos(rad(a))];

  /** What's left of [lo, hi] once the `cuts` are taken out. */
  const subtract = (lo: number, hi: number, cuts: [number, number][]) => {
    let parts: [number, number][] = [[lo, hi]];
    for (const [c0, c1] of cuts)
      parts = parts.flatMap(([a, b]): [number, number][] =>
        c1 <= a || c0 >= b ? [[a, b]] : ([[a, c0], [c1, b]] as [number, number][]).filter(([p, q]) => q - p > 1e-3),
      );
    return parts;
  };

  /** A straight line, broken wherever it passes through a hole. */
  const line = ([x0, y0]: number[], [x1, y1]: number[], holes: Hole[] = []) => {
    const [dx, dy] = [x1 - x0, y1 - y0];
    const cuts = holes.flatMap(({ x, y, r }): [number, number][] => {
      const [fx, fy] = [x0 - x, y0 - y];
      const a = dx * dx + dy * dy;
      const b = 2 * (fx * dx + fy * dy);
      const disc = b * b - 4 * a * (fx * fx + fy * fy - r * r);
      if (disc <= 0) return [];
      const s = Math.sqrt(disc);
      return [[(-b - s) / (2 * a), (-b + s) / (2 * a)]];
    });
    return subtract(0, 1, cuts)
      .map(([t0, t1]) => `M${f(x0 + dx * t0)} ${f(y0 + dy * t0)}L${f(x0 + dx * t1)} ${f(y0 + dy * t1)}`)
      .join('');
  };

  /** A circle about the centre, broken wherever it passes through a hole. */
  const ring = (r: number, holes: Hole[] = []) => {
    const cuts: [number, number][] = [];
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
    return subtract(0, 360, cuts)
      .map(([a0, a1]) => {
        // Arcs under 180° each, so the sweep flags never need to change.
        const n = Math.ceil((a1 - a0) / 170);
        let d = `M${at(a0, r).map(f).join(' ')}`;
        for (let k = 1; k <= n; k++) d += `A${r} ${r} 0 0 1 ${at(a0 + ((a1 - a0) * k) / n, r).map(f).join(' ')}`;
        return d;
      })
      .join('');
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

  // The band: seals on the planets' circle, a word between each pair.
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

  // The heptagram {7/2}, its points on the band's inner edge, half a step
  // round from the planets, and a circle in the heptagon at its middle.
  // Sol above and Luna below sit between that circle and the band.
  const R = BAND_IN;
  const INNER = R * Math.cos((2 * Math.PI) / 7);
  const BIG = 13;
  const sol = at(0, 65.5);
  const luna = at(180, 65.5);
  const starHoles = [sol, luna].map(([x, y]) => ({ x, y, r: BIG + 1.4 }));
  const points = Array.from({ length: 7 }, (_, k) => at(((k + 0.5) / 7) * 360, R));
  const STAR = Array.from({ length: 7 }, (_, i) => line(points[(i * 2) % 7], points[(i * 2 + 2) % 7], starHoles)).join('');
  const STAR_RING = ring(INNER, starHoles);
  // Sol: a disc with twelve rays, long and short in turn.
  const SOL_RAYS = Array.from({ length: 12 }, (_, k) => line(at(k * 30, 6.6), at(k * 30, k % 2 ? 8.4 : 10))).join('');

  // The heart: a compass star of eight faceted points in a sun in
  // splendour, pointed and flaming rays in turn reaching out to the
  // heptagram's inner circle.
  const SUN = 31;
  const HEART = Array.from({ length: 8 }, (_, k) => {
    const a = k * 45;
    const tip = at(a, k % 2 ? 19 : 29);
    const l = at(a - 22.5, 6);
    const r = at(a + 22.5, 6);
    return `M${l.map(f).join(' ')}L${tip.map(f).join(' ')}L${r.map(f).join(' ')}M0 0L${tip.map(f).join(' ')}`;
  }).join('');
  const RAYS = Array.from({ length: 16 }, (_, k) => {
    const a = k * 22.5;
    const p = (da: number, r: number) => at(a + da, r).map(f).join(' ');
    // A pointed ray, or a flame that waves out to its tip.
    if (k % 2 === 0) return `M${p(-4.2, SUN)}L${p(0, INNER - 1.5)}L${p(4.2, SUN)}M${p(0, SUN)}L${p(0, INNER - 6)}`;
    return (
      `M${p(-3.2, SUN)}C${p(4, SUN + 4)} ${p(-5, SUN + 8)} ${p(0.5, SUN + 11)}` +
      `S${p(-1, SUN + 14)} ${p(0, INNER - 4)}` +
      `C${p(1.5, SUN + 13)} ${p(-1.5, SUN + 10)} ${p(4, SUN + 7)}S${p(0, SUN + 3)} ${p(3.2, SUN)}`
    );
  }).join('');
</script>

{#snippet band()}
  <path d={ring(97.5)} class="draw thin" pathLength="100" />
  <path d={ring(BAND_OUT, bandHoles)} class="draw" pathLength="100" />
  <path d={ring(BAND_IN, bandHoles)} class="draw" pathLength="100" />
  {#each seals as s (s.a)}
    <circle cx={f(s.x)} cy={f(s.y)} r={SEAL} class="draw" pathLength="100" />
    <circle cx={f(s.x)} cy={f(s.y)} r={SEAL - 1.2} class="draw hair" pathLength="100" />
    <path d={s.d} transform="translate({f(s.x)} {f(s.y)}) rotate({s.a}) scale(1.05)" class="sign" />
  {/each}
  {#each SCRIPT as m (m.a)}
    <path d={m.d} transform="rotate({f(m.a)}) translate(0 -{BAND})" class="sign" />
  {/each}
{/snippet}

{#snippet star()}
  <path d={STAR} class="draw" pathLength="100" />
  <path d={STAR_RING} class="draw thin" pathLength="100" />
  {#each [sol, luna] as [x, y], k (k)}
    <circle cx={f(x)} cy={f(y)} r={BIG} class="draw" pathLength="100" />
    <circle cx={f(x)} cy={f(y)} r={BIG - 1.6} class="draw hair" pathLength="100" />
  {/each}
  <g transform="translate({f(sol[0])} {f(sol[1])})">
    <circle r="5" class="sign" />
    <circle r="1.1" class="sign" />
    <path d={SOL_RAYS} class="sign" />
  </g>
  <path d={PLANETS[1]} transform="translate({f(luna[0])} {f(luna[1])}) rotate(180) scale(2.2)" class="sign" style:--k="2.2" />
{/snippet}

{#snippet heart()}
  <path d={HEART} class="draw thin" pathLength="100" />
  <path d={ring(SUN)} class="draw thin" pathLength="100" />
  <path d={ring(SUN - 2)} class="draw hair" pathLength="100" />
  <path d={RAYS} class="draw thin" pathLength="100" />
  <path d={ring(24)} class="dashed" />
{/snippet}

<div class="arcane {state}" aria-hidden="true" style:--size={size} style:color={color} style:opacity={strength}>
  <div class="layer band">
    <svg class="glow" viewBox="-100 -100 200 200">{@render band()}</svg>
    <svg viewBox="-100 -100 200 200">{@render band()}</svg>
  </div>
  <div class="layer star">
    <svg class="glow" viewBox="-100 -100 200 200">{@render star()}</svg>
    <svg viewBox="-100 -100 200 200">{@render star()}</svg>
  </div>
  <div class="layer heart">
    <svg class="glow" viewBox="-100 -100 200 200">{@render heart()}</svg>
    <svg viewBox="-100 -100 200 200">{@render heart()}</svg>
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
  .thin {
    stroke-width: 0.35;
  }
  .hair {
    stroke-width: 0.22;
  }
  .dashed {
    stroke-width: 0.3;
    stroke-dasharray: 6 2 0.5 2;
  }
  /* A sign drawn at k times its size keeps the same line. */
  .sign {
    stroke-width: calc(0.42px / var(--k, 1));
    stroke-linecap: round;
    stroke-linejoin: round;
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
  .glow :global(.dashed) {
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
  /* The signs, the script and the dashed ring are set down once the lines
     are drawn. */
  .sign,
  .dashed {
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
