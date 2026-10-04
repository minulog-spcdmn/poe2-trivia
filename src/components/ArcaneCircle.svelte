<script lang="ts">
  // An alchemist's circle that draws itself behind the item art and turns
  // slowly, in three layers:
  // • the band: the seven planets of the old metals in seals, with the
  //   seven words of V.I.T.R.I.O.L. written between them;
  // • a heptagram, one point per planet, with Sol and Luna sealed on the
  //   circle inside it;
  // • at the heart, a compass star in a ring of sun rays.
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

  const uid = $props.id();

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
  const WORDS = ['VISITA', 'INTERIORA', 'TERRAE', 'RECTIFICANDO', 'INVENIES', 'OCCULTUM', 'LAPIDEM'];
  const SEAL = 7.2;
  const seals = PLANETS.map((d, k) => {
    const a = (k / 7) * 360;
    const [x, y] = at(a, BAND);
    return { a, x, y, d };
  });
  const bandHoles = seals.map(({ x, y }) => ({ x, y, r: SEAL + 1.2 }));
  // Each word runs along the band from one seal to the next, centred.
  const words = WORDS.map((w, k) => {
    const a0 = (k / 7) * 360 + 7;
    const a1 = ((k + 1) / 7) * 360 - 7;
    const r = BAND - 1.7;
    return { w, d: `M${at(a0, r).map(f).join(' ')}A${r} ${r} 0 0 1 ${at(a1, r).map(f).join(' ')}` };
  });

  // The heptagram {7/2}, its points on the band's inner edge, half a step
  // round from the planets. Sol above, Luna below, each on the circle the
  // star's inner heptagon holds.
  const R = BAND_IN;
  const INNER = R * Math.cos((2 * Math.PI) / 7);
  const BIG = 11;
  const sol = at(0, INNER);
  const luna = at(180, INNER);
  const starHoles = [sol, luna].map(([x, y]) => ({ x, y, r: BIG + 1.4 }));
  const points = Array.from({ length: 7 }, (_, k) => at(((k + 0.5) / 7) * 360, R));
  const STAR = Array.from({ length: 7 }, (_, i) => line(points[(i * 2) % 7], points[(i * 2 + 2) % 7], starHoles)).join('');
  const STAR_RING = ring(INNER, starHoles);
  // Sol: a disc with eight rays, long and short in turn.
  const SOL_RAYS = Array.from({ length: 8 }, (_, k) => line(at(k * 45, 5.6), at(k * 45, k % 2 ? 7 : 8.2))).join('');

  // The heart: a compass star of eight faceted points in a sun in
  // splendour, pointed and flaming rays in turn.
  const HEART = Array.from({ length: 8 }, (_, k) => {
    const a = k * 45;
    const tip = at(a, k % 2 ? 22 : 34);
    const l = at(a - 22.5, 7);
    const r = at(a + 22.5, 7);
    return `M${l.map(f).join(' ')}L${tip.map(f).join(' ')}L${r.map(f).join(' ')}M0 0L${tip.map(f).join(' ')}`;
  }).join('');
  const RAYS = Array.from({ length: 16 }, (_, k) => {
    const a = k * 22.5;
    const p = (da: number, r: number) => at(a + da, r).map(f).join(' ');
    // A pointed ray, or a flame that waves out to its tip.
    if (k % 2 === 0) return `M${p(-3.2, 36)}L${p(0, 47)}L${p(3.2, 36)}`;
    return `M${p(-2.6, 36)}C${p(3, 39)} ${p(-3.5, 41.5)} ${p(0, 44.5)}C${p(-1, 41.5)} ${p(4.5, 39)} ${p(2.6, 36)}`;
  }).join('');
</script>

{#snippet band(glow: boolean)}
  <path d={ring(97.5)} class="draw thin" pathLength="100" />
  <path d={ring(BAND_OUT, bandHoles)} class="draw" pathLength="100" />
  <path d={ring(BAND_IN, bandHoles)} class="draw" pathLength="100" />
  {#each seals as s (s.a)}
    <circle cx={f(s.x)} cy={f(s.y)} r={SEAL} class="draw" pathLength="100" />
    <circle cx={f(s.x)} cy={f(s.y)} r={SEAL - 1.2} class="draw hair" pathLength="100" />
    <path d={s.d} transform="translate({f(s.x)} {f(s.y)}) rotate({s.a}) scale(1.05)" class="sign" />
  {/each}
  {#if !glow}
    {#each words as w, k (k)}
      <path id="{uid}-w{k}" d={w.d} class="guide" />
      <text class="word"><textPath href="#{uid}-w{k}" startOffset="50%">{w.w}</textPath></text>
    {/each}
  {/if}
{/snippet}

{#snippet star()}
  <path d={STAR} class="draw" pathLength="100" />
  <path d={STAR_RING} class="draw thin" pathLength="100" />
  {#each [sol, luna] as [x, y], k (k)}
    <circle cx={f(x)} cy={f(y)} r={BIG} class="draw" pathLength="100" />
    <circle cx={f(x)} cy={f(y)} r={BIG - 1.6} class="draw hair" pathLength="100" />
  {/each}
  <g transform="translate({f(sol[0])} {f(sol[1])})">
    <circle r="4" class="sign" />
    <circle r="0.9" class="sign" />
    <path d={SOL_RAYS} class="sign" />
  </g>
  <path d={PLANETS[1]} transform="translate({f(luna[0])} {f(luna[1])}) rotate(180) scale(1.7)" class="sign" />
{/snippet}

{#snippet heart()}
  <path d={HEART} class="draw thin" pathLength="100" />
  <path d={ring(36)} class="draw hair" pathLength="100" />
  <path d={RAYS} class="draw thin" pathLength="100" />
  <path d={ring(31)} class="dashed" />
{/snippet}

<div class="arcane {state}" aria-hidden="true" style:--size={size} style:color={color} style:opacity={strength}>
  <div class="layer band">
    <svg class="glow" viewBox="-100 -100 200 200">{@render band(true)}</svg>
    <svg viewBox="-100 -100 200 200">{@render band(false)}</svg>
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
    stroke-width: 0.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .thin {
    stroke-width: 0.55;
  }
  .hair {
    stroke-width: 0.35;
  }
  .dashed {
    stroke-width: 0.45;
    stroke-dasharray: 6 2 0.5 2;
  }
  .sign {
    stroke-width: 0.7;
  }
  .guide {
    stroke: none;
  }
  .word {
    fill: currentColor;
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 4.8px;
    letter-spacing: 0.6px;
    text-anchor: middle;
  }
  /* The glow: the same strokes, wide and faint, on their own layer so it
     can breathe without repainting. */
  .glow {
    opacity: 0.22;
    animation: breathe 6s ease-in-out infinite alternate;
  }
  .glow :global(*) {
    stroke-width: 3.2;
  }
  .glow :global(.hair),
  .glow :global(.dashed) {
    stroke-width: 1.6;
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
  /* The signs, the words and the dashed ring are set down once the lines
     are drawn. */
  .sign,
  .word,
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
