<script lang="ts">
  import { STRATA } from '../lib/descent';
  import { DELVE_LIVES, FINDS_FROM } from '../lib/delve';
  import { f, line, ring, wear, type Pt } from '../lib/arcane';

  // The descent, engraved: a slim shaft sunk from a headframe at the surface
  // down through the ten zones, each a band cut into the rock either side.
  // A zone you have reached shows its colour and its name; one you haven't is
  // dull rock, and the zones still ahead are marked only "uncharted", so the
  // names stay a surprise. Past 100 the shaft runs on, fading. A rope hangs
  // from the wheel down to a lamp at your deepest (at the mouth before a
  // first run).
  // Beside the shaft, a few short notes say what lies ahead (three lives,
  // finds, a new zone every ten, less time and trickier questions deeper
  // down, no end), never exactly what gets harder.
  // Drawn in the arcane style (docs/arcane-style.md): fine exact lines,
  // one-sided hatching that stops short of what it meets, a little wear, a
  // soft glow under the lines; it draws itself in from the surface down.
  let { deepest = null, label = 'Your deepest' }: { deepest?: number | null; label?: string } = $props();

  const W = 200;
  /** The shaft's middle, its walls either side, and the rock cut beside them. */
  const X = 92;
  const HALF = 4;
  const ROCK = 6;
  const TOP = 30;
  const BAND = 15;
  const BOTTOM = TOP + 10 * BAND;
  const BEYOND = 26;
  const H = BOTTOM + BEYOND;
  /** Zone names end left of the rock; the notes start right of it, after a pip. */
  const NAME_X = X - HALF - ROCK - 5;
  const PIP_X = X + HALF + ROCK + 4;
  const NOTE_X = PIP_X + 5;

  /** Where depth `d` sits on the shaft; past 100, in the depths beyond. */
  const y = (d: number) => (d > 100 ? BOTTOM + BEYOND * 0.45 : TOP + ((d - 0.5) * BAND) / 10);

  const rgb = (c: readonly number[]) => `rgb(${c.join(' ')})`;
  const BANDS = STRATA.slice(0, 10).map((z, k) => ({ name: z.name, color: rgb(z.look.accent), y0: TOP + k * BAND, from: 10 * k + 1 }));

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
  const WHEEL: Pt = [X, 11];
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

  const best = $derived(deepest && deepest > 0 ? Math.floor(deepest) : null);
  /** A zone is reached once a run has been as deep as its first depth; only then is it named and coloured. */
  const reached = $derived(BANDS.filter((b) => best !== null && best >= b.from).length);
  /** The rope runs from the wheel to the lamp: at your deepest, or at the mouth. */
  const lamp = $derived(y(best ?? 1));

  // "Uncharted": the zones not reached yet, bracketed together under one
  // quiet word, the bracket's line stopping short of it.
  const UNCHARTED_X = NAME_X - 19;
  const uncharted = $derived.by(() => {
    if (reached >= BANDS.length) return null;
    const y0 = BANDS[reached].y0 + 1.5;
    const y1 = BOTTOM - 1.5;
    const mid = (y0 + y1) / 2;
    const tick = (yy: number) => `M${f(UNCHARTED_X)} ${f(yy)}H${f(NAME_X + 2)}`;
    const d = y1 - y0 > 26 ? tick(y0) + tick(y1) + `M${f(UNCHARTED_X)} ${f(y0)}V${f(mid - 7)}M${f(UNCHARTED_X)} ${f(mid + 7)}V${f(y1)}` : '';
    return { d, y: mid };
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
  const NOTES: Note[] = [
    { id: 'lives', num: '1', lines: [`${LIVES} lives`], at: TOP - 6 },
    { id: 'finds', num: String(FINDS_FROM), lines: ['finds appear'], at: y(FINDS_FROM) },
    { id: 'zones', word: 'every', num: '10', lines: ['a new zone'], at: TOP + 2 * BAND },
    { id: 'deeper', word: 'deeper', lines: ['less time,', 'trickier questions'], at: y(60) },
    { id: 'endless', num: '100+', lines: ['endless'], at: BOTTOM + 3 },
  ];
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
        : reached === BANDS.length
          ? `Zones reached: all ten, ${BANDS.map((b) => b.name).join(', ')}.`
          : `Zones reached: ${BANDS.slice(0, reached)
              .map((b) => b.name)
              .join(', ')}; ${words(BANDS.length - reached)} more uncharted.`,
      best ? `${label}: depth ${best}.` : '',
    ]
      .filter(Boolean)
      .join(' '),
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

    <!-- The zones: each a band in the rock, coloured and named once reached, dull rock until then. -->
    {#each BANDS as b, k (b.from)}
      {@const known = k < reached}
      <g class="band" class:known style:--c={known ? b.color : null} style:--d="{(0.35 + k * 0.08).toFixed(2)}s">
        {#if known}
          <rect class="tint" x={X - HALF - ROCK} y={b.y0} width={ROCK} height={BAND} />
          <rect class="tint" x={X + HALF} y={b.y0} width={ROCK} height={BAND} />
        {/if}
        <path class="hatch" d={rock(b.y0, b.y0 + BAND, 2.1)} />
        {#if known}<text class="zone" x={NAME_X} y={b.y0 + BAND / 2}>{b.name}</text>{/if}
      </g>
    {/each}
    {#if uncharted}
      <g class="uncharted">
        <path d={uncharted.d} />
        <text x={UNCHARTED_X} y={uncharted.y}>uncharted</text>
      </g>
    {/if}

    <g mask="url(#{uid}-dark)">
      <path class="hatch beyond" d={rock(BOTTOM, H, 2.1)} />
      <path class="edge" d={EDGES} />
      <g class="glow">{@render frame(false)}</g>
      <g class="lines">{@render frame(true)}</g>
    </g>
    <path class="wheel" d={SPOKES} />
    <circle class="wheel" cx={WHEEL[0]} cy={WHEEL[1]} r="0.8" />

    <!-- What lies ahead, in a few words; and your deepest, lit. -->
    {#each notes as n (n.id)}
      <g class="note" class:best={n.best} style:--d="{n.best ? 1.7 : (0.45 + (n.y / H) * 0.9).toFixed(2)}s">
        <path class="pip" class:lit={n.best} d="M{PIP_X - 1.6} {f(n.y)}l1.6 -1.6l1.6 1.6l-1.6 1.6z" />
        <!-- The italic words ride RISE above the Cinzel depths' baseline, where they line up by eye. -->
        <text x={NOTE_X} y={n.y - RISE}>
          {#if n.word}<tspan class="key">{n.word}</tspan>{/if}
          {#if n.num}<tspan class="num" dy={RISE}>{n.word ? ' ' : ''}{n.num}</tspan>{/if}
          {#if n.lines.length}<tspan class="dot" dy={(n.num ? -RISE : 0) + DOT_DROP}>{' • '}</tspan><tspan class="say" dy={-DOT_DROP}>{n.lines[0]}</tspan>{/if}
        </text>
        {#each n.lines.slice(1) as l, i (i)}
          <text class="say" x={NOTE_X} y={n.y - RISE + (i + 1) * LINE}>{l}</text>
        {/each}
      </g>
    {/each}

    <!-- The rope down to the lamp at your deepest. -->
    <path class="rope draw" d="M{X} {WHEEL[1] + WHEEL_R}V{f(lamp - 2.6)}" pathLength="100" style:--d="1.1s" style:--t="0.7s" />
    <g class="lamp">
      <circle class="halo" cx={X} cy={lamp} r="7" />
      <path class="flame" d="M{X} {f(lamp - 2.6)}l2.2 2.6l-2.2 2.6l-2.2 -2.6z" />
    </g>
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

  /* A zone: reached, its colour as a faint tint and hatching in the rock, its name in a pale wash of it; not yet, dull rock. */
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
  .band:not(.known) .hatch {
    opacity: 0.4;
  }
  .beyond {
    opacity: 0.45;
  }
  text {
    dominant-baseline: central;
  }
  .zone {
    font-family: var(--font-display);
    font-size: 7.8px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    text-anchor: end;
    fill: color-mix(in srgb, var(--c) 55%, #e3d3b4);
  }
  .uncharted {
    opacity: 0.75;
    animation: carve 0.6s 1.1s var(--ease-out) both;
  }
  .uncharted path {
    stroke: var(--muted);
    stroke-width: 0.35;
  }
  .uncharted text {
    font-style: italic;
    font-size: 10px;
    letter-spacing: 0.03em;
    text-anchor: middle;
    fill: var(--muted);
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
    opacity: 0.18;
    filter: blur(2px);
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
