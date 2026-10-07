<script lang="ts">
  import { STRATA } from '../lib/descent';
  import { f, line, ring, wear, type Pt } from '../lib/arcane';

  // The descent, engraved: a slim shaft sunk from a headframe at the surface
  // down through the ten zones, each a band of its own colour cut into the
  // rock either side, the zone's name beside it. Depths 1, 50 and 100 are
  // marked; past 100 the shaft runs on, fading, "and beyond". A rope hangs
  // from the wheel down to a lamp at your deepest (at the mouth before a
  // first run). It shows where a run goes, never what gets harder.
  // Drawn in the arcane style (docs/arcane-style.md): fine exact lines,
  // one-sided hatching that stops short of what it meets, a little wear, a
  // soft glow under the lines; it draws itself in from the surface down.
  let { deepest = null, label = 'Your deepest' }: { deepest?: number | null; label?: string } = $props();

  const W = 200;
  /** The shaft's middle, its walls either side, and the rock cut beside them. */
  const X = 44;
  const HALF = 4;
  const ROCK = 6;
  const TOP = 26;
  const BAND = 14;
  const BOTTOM = TOP + 10 * BAND;
  const BEYOND = 24;
  const H = BOTTOM + BEYOND;
  const NAME_X = X + HALF + ROCK + 8;
  const NUM_X = X - HALF - ROCK - 5;

  /** Where depth `d` sits on the shaft; past 100, in the depths beyond. */
  const y = (d: number) => (d > 100 ? BOTTOM + BEYOND * 0.45 : TOP + ((d - 0.5) * BAND) / 10);

  const rgb = (c: readonly number[]) => `rgb(${c.join(' ')})`;
  const BANDS = STRATA.slice(0, 10).map((z, k) => ({ name: z.name, color: rgb(z.look.accent), y0: TOP + k * BAND }));

  /** One-sided hatching across the rect, falling to the left, `gap` apart, stopping `pad` short of its edges. */
  function hatchRect(x0: number, y0: number, x1: number, y1: number, gap: number, pad = 0.6): string {
    [x0, y0, x1, y1] = [x0 + pad, y0 + pad, x1 - pad, y1 - pad];
    const step = gap * Math.SQRT2;
    let d = '';
    for (let s = x0 + y0 + step / 2; s < x1 + y1; s += step) {
      // The line x + y = s, clipped to the rect.
      const a: Pt = [Math.max(x0, s - y1), 0];
      a[1] = s - a[0];
      const b: Pt = [Math.min(x1, s - y0), 0];
      b[1] = s - b[0];
      if (b[0] - a[0] > 0.3) d += `M${f(a[0])} ${f(a[1])}L${f(b[0])} ${f(b[1])}`;
    }
    return d;
  }
  /** Both strips of rock beside the shaft, from `y0` to `y1`. */
  const rock = (y0: number, y1: number, gap: number) =>
    hatchRect(X - HALF - ROCK, y0, X - HALF, y1, gap) + hatchRect(X + HALF, y0, X + HALF + ROCK, y1, gap);

  // The headframe: two legs up from the surface to a wheel, which they stop short of.
  const WHEEL: Pt = [X, 9];
  const WHEEL_R = 4.6;
  const hole = { c: WHEEL, r: WHEEL_R + 1.3 };
  const legs = (worn: boolean) => {
    const w = worn ? wear(7) : null;
    return line([X - 10, TOP], WHEEL, { holes: [hole], wear: w }) + line([X + 10, TOP], WHEEL, { holes: [hole], wear: w });
  };
  const SPOKES = Array.from({ length: 6 }, (_, k) => {
    const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
    const p = (r: number) => `${f(WHEEL[0] + r * Math.cos(a))} ${f(WHEEL[1] + r * Math.sin(a))}`;
    return `M${p(1.4)}L${p(WHEEL_R - 1.1)}`;
  }).join('');

  /** The surface, broken at the shaft's mouth. */
  const surface = (worn: boolean) => line([X - HALF - ROCK - 6, TOP], [X + HALF + ROCK + 6, TOP], { cuts: [[0.4, 0.6]], wear: worn ? wear(3) : null });
  /** The shaft's walls, down to the bottom of the zones and on into the dark. */
  const walls = () => line([X - HALF, TOP], [X - HALF, H]) + line([X + HALF, TOP], [X + HALF, H]);
  // The rock's outer edges and the seams between zones, in hairline.
  const EDGES =
    line([X - HALF - ROCK, TOP], [X - HALF - ROCK, H]) +
    line([X + HALF + ROCK, TOP], [X + HALF + ROCK, H]) +
    BANDS.slice(1)
      .map((b) => line([X - HALF - ROCK, b.y0], [X - HALF, b.y0]) + line([X + HALF, b.y0], [X + HALF + ROCK, b.y0]))
      .join('') +
    line([X - HALF - ROCK, BOTTOM], [X - HALF, BOTTOM]) +
    line([X + HALF, BOTTOM], [X + HALF + ROCK, BOTTOM]);

  // Depth marks, and your deepest; a mark too close to it gives way.
  const MARKS = [1, 50, 100];
  const best = $derived(deepest && deepest > 0 ? deepest : null);
  const marks = $derived(MARKS.filter((m) => best === null || Math.abs(y(m) - y(best)) > 9));
  /** The rope runs from the wheel to the lamp: at your deepest, or at the mouth. */
  const lamp = $derived(y(best ?? 1));

  const uid = $props.id();
  const summary = $derived(
    `The descent: ten zones, from ${BANDS[0].name} at depth 1 to ${BANDS[9].name} at depth 100, and on beyond.${best ? ` ${label}: depth ${best}.` : ''}`,
  );
</script>

{#snippet frame(worn: boolean)}
  <path class="draw" d={legs(worn)} pathLength="100" style:--d="0s" style:--t="0.45s" />
  <path class="draw" d={ring(WHEEL, WHEEL_R, { wear: null })} pathLength="100" style:--d="0.2s" style:--t="0.5s" />
  <path class="draw" d={surface(worn)} pathLength="100" style:--d="0.1s" style:--t="0.4s" />
  <path class="draw wall" d={walls()} pathLength="100" style:--d="0.3s" style:--t="1.1s" />
{/snippet}

<figure class="descent" role="img" aria-label={summary}>
  <svg viewBox="0 0 {W} {H}" width={W} height={H} aria-hidden="true">
    <defs>
      <linearGradient id="{uid}-fade" x1="0" y1={BOTTOM} x2="0" y2={H} gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#fff" />
        <stop offset="1" stop-color="#fff" stop-opacity="0" />
      </linearGradient>
      <mask id="{uid}-dark" maskUnits="userSpaceOnUse" x="0" y="0" width={W} height={H}>
        <rect x="0" y="0" width={W} height={BOTTOM} fill="#fff" />
        <rect x="0" y={BOTTOM} width={W} height={BEYOND} fill="url(#{uid}-fade)" />
      </mask>
    </defs>

    <!-- The zones: each a band of its colour in the rock, its name beside it. -->
    {#each BANDS as b, k (b.name)}
      <g class="band" style:--c={b.color} style:--d="{(0.35 + k * 0.08).toFixed(2)}s">
        <rect class="tint" x={X - HALF - ROCK} y={b.y0} width={ROCK} height={BAND} />
        <rect class="tint" x={X + HALF} y={b.y0} width={ROCK} height={BAND} />
        <path class="hatch" d={rock(b.y0, b.y0 + BAND, 2.1)} />
        <text class="zone" x={NAME_X} y={b.y0 + BAND / 2}>{b.name}</text>
      </g>
    {/each}

    <g mask="url(#{uid}-dark)">
      <path class="hatch beyond" d={rock(BOTTOM, H, 2.1)} />
      <path class="edge" d={EDGES} />
      <g class="glow">{@render frame(false)}</g>
      <g class="lines">{@render frame(true)}</g>
    </g>
    <path class="wheel" d={SPOKES} />
    <circle class="wheel" cx={WHEEL[0]} cy={WHEEL[1]} r="0.8" />
    <text class="beyond-text" x={NAME_X} y={BOTTOM + BEYOND * 0.45}>and beyond</text>

    {#each marks as m (m)}
      <g class="mark" style:--d="{(0.4 + (m / 100) * 0.9).toFixed(2)}s">
        <text class="depth" x={NUM_X} y={y(m)}>{m}</text>
        <path class="pip" d="M{NUM_X + 3.2} {f(y(m))}l1.6 -1.6l1.6 1.6l-1.6 1.6z" />
      </g>
    {/each}

    <!-- The rope down to the lamp at your deepest. -->
    <path class="rope draw" d="M{X} {WHEEL[1] + WHEEL_R}V{f(lamp - 2.6)}" pathLength="100" style:--d="1.1s" style:--t="0.7s" />
    <g class="lamp">
      <circle class="halo" cx={X} cy={lamp} r="7" />
      <path class="flame" d="M{X} {f(lamp - 2.6)}l2.2 2.6l-2.2 2.6l-2.2 -2.6z" />
    </g>
    {#if best}
      <text class="depth best" x={NUM_X} y={lamp}>{best}</text>
      <path class="pip lit" d="M{NUM_X + 3.2} {f(lamp)}l1.6 -1.6l1.6 1.6l-1.6 1.6z" />
    {/if}
  </svg>
</figure>

<style>
  .descent {
    margin: 0;
    color: var(--gold);
  }
  svg {
    display: block;
    width: 12.5rem;
    height: auto;
    overflow: visible;
  }
  path {
    fill: none;
    stroke: currentColor;
    stroke-width: 0.7;
    stroke-linecap: butt;
  }
  .edge {
    stroke-width: 0.35;
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

  /* A zone: its colour as a faint tint and hatching in the rock, its name in a pale wash of it. */
  .band {
    animation: carve 0.5s var(--d) var(--ease-out) both;
  }
  .tint {
    fill: var(--c);
    opacity: 0.12;
  }
  .hatch {
    stroke: var(--c, var(--muted));
    stroke-width: 0.45;
    stroke-linecap: round;
    opacity: 0.8;
  }
  .beyond {
    opacity: 0.45;
  }
  text {
    dominant-baseline: central;
  }
  .zone {
    font-family: var(--font-display);
    font-size: 8.4px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    fill: color-mix(in srgb, var(--c) 55%, #e3d3b4);
  }
  .beyond-text {
    font-style: italic;
    font-size: 11px;
    fill: var(--muted);
    animation: carve 0.6s 1.3s var(--ease-out) both;
  }
  .depth {
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 9px;
    text-anchor: end;
    fill: var(--gold);
  }
  .pip {
    fill: var(--bg);
    stroke: var(--gold);
    stroke-width: 0.6;
    stroke-linejoin: miter;
  }
  .mark {
    animation: carve 0.4s var(--d) var(--ease-out) both;
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
    opacity: 0.18;
    filter: blur(2px);
  }
  .flame {
    fill: var(--gold-hi);
    stroke: #fff4d6;
    stroke-width: 0.4;
    stroke-linejoin: miter;
  }
  .best,
  .pip.lit {
    fill: var(--gold-hi);
    animation: carve 0.5s 1.7s var(--ease-out) both;
  }

  .draw {
    stroke-dasharray: 100;
    animation: draw var(--t, 1s) var(--d, 0s) cubic-bezier(0.55, 0, 0.25, 1) both;
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
</style>
