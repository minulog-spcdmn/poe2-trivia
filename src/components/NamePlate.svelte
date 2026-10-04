<script module lang="ts">
  // The plate behind a unique's name, after the game's own: a framed bar
  // whose ends are gothic tracery, drawn in the hand of the site's gilded
  // corners (a bright line shading off, a dimmer one inside it) with a soft
  // glow under the lines, as on the alchemist's circle.
  // • The frame: a double rule, its corners cut like the panels' filigree,
  //   drawn out from the ends to meet under the name.
  // • The ends: three cusped ogees, one inside another, their lobes swelling
  //   like flames and all pointing in at the name, with a mouchette (a
  //   curved dagger of tracery) in each corner. The innermost ogee holds an
  //   ember that lights when the item is known.
  // • The field: a net of ogees, as in late gothic tracery, faint and
  //   fainter still under the name.

  type Pt = [number, number];
  const f = (v: number) => v.toFixed(2);
  const pt = (p: Pt) => `${f(p[0])} ${f(p[1])}`;
  const dist = (p: Pt, q: Pt) => Math.hypot(q[0] - p[0], q[1] - p[1]);
  const flipY = (pts: Pt[]): Pt[] => pts.map(([x, y]) => [x, -y]);
  const poly = (pts: Pt[]) => 'M' + pts.map(pt).join('L');

  /** A smooth curve through `pts` (Catmull-Rom), as a polyline `per` points to a span. */
  function smooth(pts: Pt[], per = 12): Pt[] {
    const out: Pt[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [p0, p1, p2, p3] = [pts[Math.max(0, i - 1)], pts[i], pts[i + 1], pts[Math.min(pts.length - 1, i + 2)]];
      for (let k = 0; k < per; k++) {
        const t = k / per;
        const [t2, t3] = [t * t, t * t * t];
        out.push(
          [0, 1].map(
            (j) => 0.5 * (2 * p1[j] + (p2[j] - p0[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (3 * p1[j] - p0[j] - 3 * p2[j] + p3[j]) * t3),
          ) as Pt,
        );
      }
    }
    out.push(pts.at(-1)!);
    return out;
  }

  /** `n` + 1 points along the polyline `c`, evenly spaced by length. */
  function even(c: Pt[], n: number): Pt[] {
    const run = c.map(() => 0);
    for (let i = 1; i < c.length; i++) run[i] = run[i - 1] + dist(c[i - 1], c[i]);
    const len = run.at(-1)!;
    return Array.from({ length: n + 1 }, (_, k) => {
      const s = (k / n) * len;
      const i = Math.max(1, run.findIndex((r) => r >= s));
      const t = (s - run[i - 1]) / (run[i] - run[i - 1] || 1);
      return [c[i - 1][0] + (c[i][0] - c[i - 1][0]) * t, c[i - 1][1] + (c[i][1] - c[i - 1][1]) * t] as Pt;
    });
  }

  /**
   * Arcs from point to point, meeting in cusps, each bulging out (to the
   * left, going along) by `bulge[i]` of its chord; a negative bulge curves in.
   */
  function lobes(pts: Pt[], bulge: number[]) {
    let d = '';
    for (let i = 1; i < pts.length; i++) {
      const c = dist(pts[i - 1], pts[i]);
      const s = Math.abs(bulge[i - 1]) * c;
      const r = (c * c) / (8 * s) + s / 2;
      d += `A${f(r)} ${f(r)} 0 0 ${bulge[i - 1] > 0 ? 1 : 0} ${pt(pts[i])}`;
    }
    return d;
  }

  /**
   * A cusped ogee lying on its side: from its foot at `x0` it swells to
   * `h` either side, its edges broken into `n` lobes, then draws in, the
   * line turning hollow, to a sharp point at `x1`. Clockwise, from the foot.
   */
  function ogee(x0: number, x1: number, h: number, n: number, bulge = 0.2) {
    const w = x1 - x0;
    const edge = smooth([
      [x0, 0],
      [x0 + w * 0.1, -h * 0.55],
      [x0 + w * 0.32, -h],
      [x0 + w * 0.6, -h * 0.78],
      [x0 + w * 0.8, -h * 0.32],
      [x1, 0],
    ]);
    // The lobes along the swell, and the last stretch to the point hollow.
    const top = [...even(edge.slice(0, Math.round(edge.length * 0.8)), n), [x1, 0] as Pt];
    const bulges = [...top.slice(2).map(() => bulge), -0.09];
    const bottom = flipY(top).reverse();
    return `M${pt(top[0])}${lobes(top, bulges)}${lobes(bottom, [...bulges].reverse())}Z`;
  }

  // ---- the end (the left one; the right is its mirror) ----------------------
  // In pixels: the plate's edge at x 0, its middle at y 0. Plates are 64 high.

  /** The ogees, outermost first (foot, point, half-height, lobes a side), each with a dimmer line inside. */
  const OGEES = [
    [3.5, 52, 15, 3],
    [3.5, 43.5, 10, 3],
    [3.5, 35, 5.6, 2],
  ].map(([x0, x1, h, n]) => ({ line: ogee(x0, x1, h, n), inner: ogee(x0 + 2.4, x1 - 2.8, h - 2.2, n) }));
  /** The ember in the innermost ogee. */
  const EMBER = ogee(6.5, 31.5, 3.2, 2, 0.08);
  /** How far in from the plate's edge the middle of the innermost ogee is (where the dialog's close button sits). */
  export const SOCKET_X = 17;

  // A mouchette in each corner: a teardrop of tracery, its head tucked under
  // the rule, its tail sweeping down along the outer ogee to their foot.
  const MOUCHETTE = smooth([
    [3.6, -2.4],
    [4.6, -12],
    [8.4, -21],
    [15.5, -25.2],
    [23.5, -24.6],
    [28, -21],
    [25.4, -17.6],
    [17.5, -16.6],
    [9.8, -11.4],
    [3.6, -2.4],
  ]);
  const MOUCHETTE_IN = smooth([
    [7, -10.5],
    [10, -19],
    [16, -22.4],
    [22.6, -22],
    [24.2, -20],
    [17.6, -18.8],
    [7, -10.5],
  ]);
  const CORNERS = [MOUCHETTE, flipY(MOUCHETTE)].map(poly).join('');
  const CORNERS_IN = [MOUCHETTE_IN, flipY(MOUCHETTE_IN)].map(poly).join('');

  // The frame's corner, cut like the panels' filigree, with a lozenge in
  // the cut; the rules run on from it (see the markup).
  const CORNER = 'M2.5 19V8.5L8.5 2.5H14';
  const CORNER_IN = 'M5.5 16.5V10L10 5.5H16';
  const LOZENGE = 'M5 1.9 8.1 5 5 8.1 1.9 5Z';

  // ---- the field ---------------------------------------------------------------
  // Reticulated tracery, the net of ogees in late gothic windows: waves
  // rising and falling against their mirror images, touching crest to
  // trough, so that every cell is an ogee lying on its side like the ends'.
  // Each wave is a moulding of two lines, with a bead in every cell.

  const BAY = 36;
  const AMP = 6.5;
  const ROW = 2 * AMP;
  const wave = (c: number, sign: number, dy: number) =>
    poly(Array.from({ length: 49 }, (_, k) => [(k / 48) * BAY, c + dy + sign * AMP * Math.sin((2 * Math.PI * k) / 48)] as Pt));
  const NET = [-2, -1, 0, 1, 2]
    .flatMap((r) => [1, -1].flatMap((sign) => [-0.7, 0.7].map((dy) => wave(r * ROW, sign, dy))))
    .join('');
  // The beads: in the middle of each cell between a wave and its mirror.
  const NET_BEADS = [-2, -1, 0, 1, 2]
    .flatMap((r) => [BAY / 4, (3 * BAY) / 4].map((x) => [x, r * ROW] as Pt))
    .map(([x, y]) => `M${f(x - 1)} ${f(y)}L${f(x)} ${f(y - 1.6)}L${f(x + 1)} ${f(y)}L${f(x)} ${f(y + 1.6)}Z`)
    .join('');
  const NET_RULES = [-19, -21, 19, 21].map((y) => `M-1 ${y}H${BAY + 1}`).join('');
</script>

<script lang="ts">
  // `lit` lights the embers (an unidentified item keeps them dark until the
  // reveal, when they flare); `end` is what the right end holds: an ember,
  // or nothing, for a button to sit there (the dialog's close; see SOCKET_X).
  let { lit = true, end = 'ember' }: { lit?: boolean; end?: 'ember' | 'empty' } = $props();

  const uid = $props.id();
  const id = (n: string) => `${uid}-${n}`;
</script>

<!-- One end of the plate. -->
{#snippet cap(holds: 'ember' | 'empty')}
  <path d={OGEES[0].line} class="hollow" />
  <path d={CORNERS} class="hollow" />
  {#if holds === 'ember'}
    <path d={EMBER} class="ember" style:fill="url(#{id('ember')})" />
  {/if}
  {#each OGEES as o, k (k)}
    <path d={o.line} class="draw gilt" style:--d="{0.15 + k * 0.12}s" pathLength="100" />
    <path d={o.inner} class="draw dim" style:--d="{0.3 + k * 0.12}s" pathLength="100" />
  {/each}
  <path d={CORNERS} class="draw gilt" style:--d="0.1s" pathLength="100" />
  <path d={CORNERS_IN} class="draw dim" style:--d="0.25s" pathLength="100" />
{/snippet}

{#snippet plate()}
  <!-- The ends, round the middle. -->
  <svg y="50%" overflow="visible">{@render cap('ember')}</svg>
  <svg x="100%" y="50%" overflow="visible"><g transform="scale(-1 1)">{@render cap(end)}</g></svg>
  <!-- The frame, from the corners: the rules run from each end to the middle. -->
  {#each [false, true] as right (right)}
    {#each [false, true] as bottom (bottom)}
      <svg x={right ? '100%' : 0} y={bottom ? '100%' : 0} overflow="visible">
        <g transform="scale({right ? -1 : 1} {bottom ? -1 : 1})">
          <path d={CORNER} class="draw rule" pathLength="100" />
          <path d={CORNER_IN} class="draw dim" pathLength="100" />
          <path d={LOZENGE} class="solid fade" style:--d="0.3s" />
          <line x1="14" y1="2.5" x2="50%" y2="2.5" class="draw rule" style:--d="0.3s" pathLength="100" />
          <line x1="16" y1="5.5" x2="50%" y2="5.5" class="draw dim" style:--d="0.4s" pathLength="100" />
          <line x1="14" y1="2.5" x2="50%" y2="2.5" class="spark" pathLength="100" />
        </g>
      </svg>
    {/each}
  {/each}
{/snippet}

<span class="plate" class:lit aria-hidden="true" style:--gilt="url(#{id('gilt')})">
  <svg class="field" width="100%" height="100%">
    <defs>
      <clipPath id={id('band')}><rect x="-1" y="-19" width={BAY + 2} height="38" /></clipPath>
      <pattern id={id('frieze')} patternUnits="userSpaceOnUse" width={BAY} height="64" x="50%" y="-32">
        <g transform="translate(0 32)">
          <g clip-path="url(#{id('band')})">
            <path d={NET} />
            <path d={NET_BEADS} class="bead" />
          </g>
          <path d={NET_RULES} />
        </g>
      </pattern>
    </defs>
    <svg y="50%" overflow="visible">
      <rect y="-32" width="100%" height="64" fill="url(#{id('frieze')})" />
    </svg>
  </svg>
  <!-- The lines twice, as on the circle: a soft, wide copy for the glow, and the lines. -->
  <svg class="art glow" width="100%" height="100%">{@render plate()}</svg>
  <svg class="art" width="100%" height="100%">
    <defs>
      <!-- Gilt as on the panels' corners: bright where it is lit from above, shading off below. -->
      <linearGradient id={id('gilt')} gradientUnits="userSpaceOnUse" x1="0" y1="-30" x2="0" y2="30">
        <stop offset="0" stop-color="#ffd9a6" />
        <stop offset="0.45" stop-color="#e59a58" />
        <stop offset="1" stop-color="#9a5226" />
      </linearGradient>
      <radialGradient id={id('ember')} cx="0.42" cy="0.5" r="0.62">
        <stop offset="0" stop-color="#ffe2b0" />
        <stop offset="0.35" stop-color="#f39a48" />
        <stop offset="1" stop-color="#a8441a" stop-opacity="0" />
      </radialGradient>
    </defs>
    {@render plate()}
  </svg>
</span>

<style>
  .plate {
    position: absolute;
    inset: 0;
    z-index: 0;
    overflow: hidden;
    pointer-events: none;
    --ink: #e59a58;
    /* A warm glow behind the name, darker towards the ends. */
    background:
      radial-gradient(ellipse 40% 80% at 50% 50%, rgba(224, 138, 68, 0.24), transparent 72%),
      linear-gradient(90deg, rgba(0, 0, 0, 0.5), transparent 18%, transparent 82%, rgba(0, 0, 0, 0.5)),
      linear-gradient(180deg, #3a2210, #26150a 55%, #1a0e06);
    box-shadow:
      inset 0 0 16px rgba(0, 0, 0, 0.5),
      inset 0 -1px 0 #6b4520;
  }
  .field,
  .art {
    position: absolute;
    inset: 0;
    overflow: visible;
  }
  /* The frieze: faint, gone under the ends and fainter under the name. */
  .field {
    opacity: 0.17;
    mask-image: linear-gradient(
      90deg,
      transparent 56px,
      #000 100px,
      rgba(0, 0, 0, 0.4) 38%,
      rgba(0, 0, 0, 0.4) 62%,
      #000 calc(100% - 100px),
      transparent calc(100% - 56px)
    );
    animation: fade 1.2s 0.3s ease-out both;
  }
  pattern path {
    fill: none;
    stroke: var(--ink);
    stroke-width: 0.45;
  }
  pattern .bead {
    fill: var(--ink);
    stroke: none;
  }

  path,
  line {
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .gilt {
    stroke: var(--gilt);
    stroke-width: 1.3;
  }
  .rule {
    stroke: #e8a466;
    stroke-width: 1.1;
  }
  .dim {
    stroke: #8a532a;
    stroke-width: 0.6;
  }
  .solid {
    fill: #f6c58e;
  }
  /* The end's tracery is set into a darker ground. */
  .hollow {
    fill: rgba(10, 5, 2, 0.55);
  }

  /* The glow: the same lines, wide and faint (no filter, so nothing repaints). */
  .glow {
    opacity: 0.16;
    animation: fade 1.4s 0.5s ease-out both;
  }
  .glow .gilt,
  .glow .rule {
    stroke: var(--ink);
    stroke-width: 3.4;
  }
  .glow .dim {
    stroke: var(--ink);
    stroke-width: 1.6;
  }
  .glow .hollow,
  .glow .ember,
  .glow .spark {
    display: none;
  }

  /* The ember: dark until the item is known, then it flares and breathes. */
  .ember {
    opacity: 0.12;
    transition: opacity 0.8s;
  }
  .lit .ember {
    opacity: 0.85;
    animation:
      flare 1.3s ease-out both,
      breathe 6s 1.3s ease-in-out infinite alternate;
  }

  .draw {
    stroke-dasharray: 100;
    animation: draw 0.9s var(--d, 0s) cubic-bezier(0.55, 0, 0.25, 1) both;
  }
  .fade {
    animation: fade 0.6s var(--d, 0s) ease-out both;
  }
  /* A spark that runs along the outer rules, from the ends to the middle, as the embers light. */
  .spark {
    stroke: #fff0d6;
    stroke-width: 1.2;
    stroke-dasharray: 7 200;
    stroke-dashoffset: 7;
    opacity: 0;
  }
  .lit .spark {
    animation: spark 1.1s 0.15s cubic-bezier(0.45, 0, 0.3, 1) both;
  }

  @keyframes draw {
    from {
      stroke-dashoffset: 100;
    }
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  @keyframes flare {
    from {
      opacity: 0.12;
    }
    25% {
      opacity: 1;
    }
    to {
      opacity: 0.85;
    }
  }
  @keyframes breathe {
    from {
      opacity: 0.85;
    }
    to {
      opacity: 0.5;
    }
  }
  @keyframes spark {
    from {
      stroke-dashoffset: 7;
      opacity: 1;
    }
    85% {
      opacity: 1;
    }
    to {
      stroke-dashoffset: -100;
      opacity: 0;
    }
  }
</style>
