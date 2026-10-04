<script module lang="ts">
  // The plate behind a unique's name, after the game's own and in the hand
  // of the alchemist's circle (ArcaneCircle): a framed bar whose ends are
  // gothic tracery holding the circle's two great seals, drawn with a soft
  // glow under the lines.
  // • The frame: a double rule, its corners cut like the panels' filigree,
  //   drawn out from the ends to meet under the name.
  // • The ends: cusped ogees, one inside another, their lobes swelling like
  //   flames and pointing in at the name, a mouchette (a curved dagger of
  //   tracery) in each corner, and set over them a seal, Sol on the left and
  //   Luna on the right as on the circle, the tracery stopping short of it.
  //   A small flame runs from each seal towards the name. The signs stay
  //   dark until the item is known, then flare.
  // • The field: a net of ogees, as in late gothic tracery, with the
  //   circle's unreadable script in its cells, faint and fainter still
  //   under the name.

  import { LUNA, LUNA_HATCH, MARKS, SOL_RAYS } from '../lib/alchemy';

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
   * Points along an arc from `p` to `q` bulging out (to the left, going
   * along) by `bulge` of the chord; a negative bulge curves in.
   */
  function arc(p: Pt, q: Pt, bulge: number, n = 10): Pt[] {
    const c = dist(p, q);
    const s = Math.abs(bulge) * c;
    const r = (c * c) / (8 * s) + s / 2;
    const [ux, uy] = [(q[0] - p[0]) / c, (q[1] - p[1]) / c];
    const side = Math.sign(bulge);
    // The centre lies away from the bulge, r less the bulge from the chord's middle.
    const o: Pt = [(p[0] + q[0]) / 2 - uy * side * (r - s), (p[1] + q[1]) / 2 + ux * side * (r - s)];
    const a0 = Math.atan2(p[1] - o[1], p[0] - o[0]);
    let da = Math.atan2(q[1] - o[1], q[0] - o[0]) - a0;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    return Array.from({ length: n + 1 }, (_, k) => [o[0] + r * Math.cos(a0 + (da * k) / n), o[1] + r * Math.sin(a0 + (da * k) / n)] as Pt);
  }

  /**
   * A cusped ogee lying on its side: from its foot at `x0` it swells to
   * `h` either side, its edges broken into `n` lobes meeting in cusps, then
   * draws in, the line turning hollow, to a sharp point at `x1`. Its
   * outline as points, clockwise from the foot.
   */
  function ogee(x0: number, x1: number, h: number, n: number, bulge = 0.2): Pt[] {
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
    const knots = [...even(edge.slice(0, Math.round(edge.length * 0.8)), n), [x1, 0] as Pt];
    const top = knots.slice(1).flatMap((q, i) => arc(knots[i], q, i === knots.length - 2 ? -0.09 : bulge).slice(i ? 1 : 0));
    return [...top, ...flipY(top).reverse().slice(1)];
  }

  /** A line through `pts`, broken where it passes within `r` of `c` (it stops short of a seal there). */
  function around(pts: Pt[], c: Pt, r: number) {
    const pieces: Pt[][] = [[]];
    for (const p of pts) {
      if (dist(p, c) < r) {
        if (pieces.at(-1)!.length) pieces.push([]);
      } else pieces.at(-1)!.push(p);
    }
    return pieces.filter((q) => q.length > 1).map(poly).join('');
  }

  // ---- the end (the left one; the right is its mirror) ----------------------
  // In pixels: the plate's edge at x 0, its middle at y 0. Plates are 64 high.

  /** The seal: its middle (the dialog's close button sits there, `SOCKET_X` in from the plate's edge) and ring. */
  export const SOCKET_X = 17.5;
  const SEAL: Pt = [SOCKET_X, 0];
  const SEAL_R = 7.6;
  /** The circle's signs are drawn for a ring of 13. */
  const SIGN_SCALE = SEAL_R / 13;
  const CLEAR = SEAL_R + 1.4;

  /** The ogees, outermost first (foot, point, half-height, lobes a side), each with a dimmer line inside. */
  const OGEE_LINES = [
    [3.5, 52, 15, 3],
    [3.5, 43.5, 10, 3],
  ].flatMap(([x0, x1, h, n]) => [ogee(x0, x1, h, n), ogee(x0 + 2.4, x1 - 2.8, h - 2.2, n)]);
  const OGEES = OGEE_LINES.filter((_, k) => k % 2 === 0).map((o) => around(o, SEAL, CLEAR));
  const OGEES_IN = OGEE_LINES.filter((_, k) => k % 2 === 1).map((o) => around(o, SEAL, CLEAR));
  const HOLLOW = poly(OGEE_LINES[0]) + 'Z';
  /** The flame from the seal towards the name. */
  const FLAME = poly(ogee(SEAL[0] + SEAL_R + 0.9, 40.5, 3.6, 1, 0.14)) + 'Z';
  const FLAME_IN = poly(ogee(SEAL[0] + SEAL_R + 2.6, 37.5, 1.7, 1, 0.1)) + 'Z';

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
  // Each wave is a moulding of two lines. In the cells between a wave and
  // its mirror, the circle's script, a mark to a cell from a fixed seed; in
  // the cells between rows, a bead.

  const BAY = 36;
  const TILE = 2 * BAY;
  const AMP = 6.5;
  const ROW = 2 * AMP;
  const ROWS = [-2, -1, 0, 1, 2];
  const wave = (c: number, sign: number, dy: number) =>
    poly(Array.from({ length: 97 }, (_, k) => [(k / 96) * TILE, c + dy + sign * AMP * Math.sin((4 * Math.PI * k) / 96)] as Pt));
  const NET = ROWS.flatMap((r) => [1, -1].flatMap((sign) => [-0.7, 0.7].map((dy) => wave(r * ROW, sign, dy)))).join('');
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const NET_MARKS = [-1, 0, 1].flatMap((r) =>
    [0.25, 0.75, 1.25, 1.75].map((x) => ({ x: x * BAY, y: r * ROW, d: MARKS[Math.floor(rnd() * MARKS.length)] })),
  );
  const NET_BEADS = [-1.5, -0.5, 0.5, 1.5]
    .flatMap((r) => [0, 0.5, 1, 1.5, 2].map((x) => `M${f(x * BAY)} ${f(r * ROW - 0.8)}a0.8 0.8 0 1 1 0 1.6a0.8 0.8 0 1 1 0 -1.6Z`))
    .join('');
  const NET_RULES = [-19, -21, 19, 21].map((y) => `M-1 ${y}H${TILE + 1}`).join('');
</script>

<script lang="ts">
  // `lit` lights the seals' signs (an unidentified item keeps them dark
  // until the reveal, when they flare); `end` is what the right seal holds:
  // Luna, or nothing, for a button to sit in it (the dialog's close; see
  // SOCKET_X).
  let { lit = true, end = 'luna' }: { lit?: boolean; end?: 'luna' | 'empty' } = $props();

  const uid = $props.id();
  const id = (n: string) => `${uid}-${n}`;
</script>

<!-- One end of the plate. -->
{#snippet cap(sign: 'sol' | 'luna' | 'empty')}
  <path d={HOLLOW} class="hollow" />
  <path d={CORNERS} class="hollow" />
  {#each OGEES as d, k (k)}
    <path {d} class="draw gilt" style:--d="{0.15 + k * 0.12}s" pathLength="100" />
    <path d={OGEES_IN[k]} class="draw dim" style:--d="{0.3 + k * 0.12}s" pathLength="100" />
  {/each}
  <path d={CORNERS} class="draw gilt" style:--d="0.1s" pathLength="100" />
  <path d={CORNERS_IN} class="draw dim" style:--d="0.25s" pathLength="100" />
  <path d={FLAME} class="draw gilt" style:--d="0.5s" pathLength="100" />
  <path d={FLAME_IN} class="draw dim" style:--d="0.6s" pathLength="100" />
  <!-- The seal, pressed in like the circle's. -->
  <g class="seal" style:--d="0.35s">
    <g transform="translate({pt(SEAL)})">
      <circle r={SEAL_R + 0.6} class="well" />
      <circle r={SEAL_R + 3} class="bloom" style:fill="url(#{id('bloom')})" />
      <circle r={SEAL_R} class="draw gilt" pathLength="100" />
      <circle r={SEAL_R - 1.3} class="draw dim" pathLength="100" />
      {#if sign !== 'empty'}
        <g class="sign" transform="scale({f(SIGN_SCALE)})">
          {#if sign === 'sol'}
            <circle r="5" />
            <circle r="1.1" />
            <path d={SOL_RAYS} />
          {:else}
            <!-- Turned as on the circle, her horns facing out. -->
            <g transform="rotate(180)">
              <path d={LUNA} />
              <path d={LUNA_HATCH} class="hatch" />
            </g>
          {/if}
        </g>
      {/if}
    </g>
  </g>
{/snippet}

{#snippet plate()}
  <!-- The ends, round the middle. -->
  <svg y="50%" overflow="visible">{@render cap('sol')}</svg>
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
      <clipPath id={id('band')}><rect x="-1" y="-19" width={TILE + 2} height="38" /></clipPath>
      <pattern id={id('frieze')} patternUnits="userSpaceOnUse" width={TILE} height="64" x="50%" y="-32">
        <g transform="translate(0 32)">
          <g clip-path="url(#{id('band')})">
            <path d={NET} />
            <path d={NET_BEADS} class="bead" />
            {#each NET_MARKS as m, k (k)}
              <path d={m.d} transform="translate({f(m.x)} {f(m.y)}) scale(1.2)" class="mark" />
            {/each}
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
      <radialGradient id={id('bloom')}>
        <stop offset="0" stop-color="#f7b56c" stop-opacity="0.9" />
        <stop offset="0.5" stop-color="#ef9446" stop-opacity="0.4" />
        <stop offset="1" stop-color="#ef9446" stop-opacity="0" />
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
  pattern .mark {
    stroke-width: 0.4;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  path,
  circle,
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

  .well {
    fill: #0d0703;
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
  .glow .well,
  .glow .bloom,
  .glow .spark {
    display: none;
  }

  /* The signs, engraved as on the circle: dark until the item is known,
     then lit, with a bloom of light behind that flares and breathes. */
  .sign :global(*) {
    fill: none;
    stroke: #7a4a2a;
    stroke-width: 0.85;
    vector-effect: non-scaling-stroke;
    stroke-linecap: round;
    stroke-linejoin: round;
    transition: stroke 0.8s;
  }
  .sign .hatch {
    stroke-width: 0.4;
  }
  .lit .sign :global(*) {
    stroke: #ffdcaa;
  }
  .glow .sign :global(*) {
    stroke: transparent;
    stroke-width: 2.6;
  }
  .lit .glow .sign :global(*) {
    stroke: #ffb066;
  }
  .bloom {
    opacity: 0;
    transform-box: fill-box;
    transform-origin: center;
    transition: opacity 0.8s;
  }
  .lit .bloom {
    opacity: 0.5;
    animation:
      flare 1.3s ease-out both,
      breathe 6s 1.3s ease-in-out infinite alternate;
  }
  .seal {
    transform-box: fill-box;
    transform-origin: center;
    animation: stamp 0.55s var(--d) var(--ease-out) both;
  }

  .draw {
    stroke-dasharray: 100;
    animation: draw 0.9s var(--d, 0s) cubic-bezier(0.55, 0, 0.25, 1) both;
  }
  .fade {
    animation: fade 0.6s var(--d, 0s) ease-out both;
  }
  /* A spark that runs along the outer rules, from the ends to the middle, as the seals light. */
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
      opacity: 0;
      transform: scale(0.4);
    }
    25% {
      opacity: 0.8;
    }
    to {
      opacity: 0.5;
    }
  }
  @keyframes breathe {
    from {
      opacity: 0.5;
    }
    to {
      opacity: 0.25;
    }
  }
  @keyframes stamp {
    from {
      opacity: 0;
      transform: scale(1.6);
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
