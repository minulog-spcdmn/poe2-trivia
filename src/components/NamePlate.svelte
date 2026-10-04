<script module lang="ts">
  // The plate behind a unique's name, engraved like the alchemist's circle
  // (ArcaneCircle): fine lines in one ink with a soft glow under them, bands
  // drawn as two edges and shaded in hatching, and the odd nick of wear.
  // • The frame: a double rule, its corners cut like the panels' filigree,
  //   drawn out from the ends to meet under the name.
  // • The field: pointed arches, each a strap woven over and under its
  //   neighbours, as the heptagram's straps are.
  // • At each end, a seal (Sol on the left, Luna on the right, like the two
  //   great seals of the circle) in a cartouche of four scrolls, with a ray
  //   pointing in at the name and a shorter one out to the frame.

  type Pt = [number, number];
  const f = (v: number) => v.toFixed(2);
  const pt = (p: Pt) => `${f(p[0])} ${f(p[1])}`;
  const rad = (a: number) => (a * Math.PI) / 180;
  /** The point at `a` degrees clockwise from the top, `r` from `c`. */
  const at = (a: number, r: number, c: Pt = [0, 0]): Pt => [c[0] + r * Math.sin(rad(a)), c[1] - r * Math.cos(rad(a))];
  const lerp = (p: Pt, q: Pt, t: number): Pt => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  const flipY = (pts: Pt[]): Pt[] => pts.map(([x, y]) => [x, -y]);
  const flipX = (pts: Pt[], about: number): Pt[] => pts.map(([x, y]) => [2 * about - x, y]);
  const poly = (pts: Pt[]) => (pts.length > 1 ? 'M' + pts.map(pt).join('L') : '');

  /** A smooth curve through `pts` (Catmull-Rom), as a polyline `per` points to a span. */
  function smooth(pts: Pt[], per = 10): Pt[] {
    const out: Pt[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [p0, p1, p2, p3] = [pts[Math.max(0, i - 1)], pts[i], pts[i + 1], pts[Math.min(pts.length - 1, i + 2)]];
      for (let k = 0; k < per; k++) {
        const t = k / per;
        const [t2, t3] = [t * t, t * t * t];
        out.push([0, 1].map(
          (j) => 0.5 * (2 * p1[j] + (p2[j] - p0[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (3 * p1[j] - p0[j] - 3 * p2[j] + p3[j]) * t3),
        ) as Pt);
      }
    }
    out.push(pts.at(-1)!);
    return out;
  }

  /**
   * A curl about `c`, from radius `r1` at angle `start` (degrees clockwise
   * from the top) winding inward, anticlockwise, over `turns` to `r0`.
   */
  function curl(c: Pt, r1: number, r0: number, turns: number, start: number): Pt[] {
    const n = Math.round(turns * 36);
    return Array.from({ length: n + 1 }, (_, i) => {
      const t = i / n;
      return at(start - turns * 360 * t, r1 + (r0 - r1) * Math.pow(t, 0.8), c);
    });
  }

  /** Unit normals along a polyline (to its left, going along). */
  const normals = (c: Pt[]) =>
    c.map((_, i) => {
      const [p, q] = [c[Math.max(0, i - 1)], c[Math.min(c.length - 1, i + 1)]];
      const len = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
      return [-(q[1] - p[1]) / len, (q[0] - p[0]) / len] as Pt;
    });
  const offset = (c: Pt[], n: Pt[], w: (t: number) => number, side: number): Pt[] =>
    c.map((p, i) => {
      const s = side * w(i / (c.length - 1));
      return [p[0] + n[i][0] * s, p[1] + n[i][1] * s];
    });

  // The wear on the plate: a nick now and then, from a fixed seed.
  let wearSeed = 7;
  const rnd = () => (wearSeed = (wearSeed * 16807) % 2147483647) / 2147483647;
  /** A polyline with a few short breaks in it, about one in every 40 units. */
  function worn(pts: Pt[]) {
    const len = pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);
    const cuts = Array.from({ length: Math.floor((len / 40) * (0.5 + rnd())) }, () => {
      const t = 0.1 + rnd() * 0.8;
      const w = (0.5 + rnd() * 0.7) / len;
      return [t - w, t + w];
    });
    const pieces: Pt[][] = [[]];
    let run = 0;
    pts.forEach((p, i) => {
      if (i) run += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
      const t = run / len;
      if (cuts.some(([a, b]) => t > a && t < b)) {
        if (pieces.at(-1)!.length) pieces.push([]);
      } else pieces.at(-1)!.push(p);
    });
    return pieces.map(poly).join('');
  }

  /**
   * An engraved band along the centre line `c`: its two edges, `w` either
   * side (tapering as `w` says), and hatching across it every `gap` units
   * from `t0` to `t1` of the way along.
   */
  function band(c: Pt[], w: (t: number) => number, { t0 = 0, t1 = 1, gap = 0.9, wear = true } = {}) {
    const n = normals(c);
    const [l, r] = [offset(c, n, w, 1), offset(c, n, w, -1)];
    let hatch = '';
    let run = 0;
    let next = 0;
    c.forEach((p, i) => {
      if (i) run += Math.hypot(p[0] - c[i - 1][0], p[1] - c[i - 1][1]);
      const t = i / (c.length - 1);
      if (t < t0 || t > t1 || run < next) return;
      next = run + gap;
      hatch += `M${pt(l[i])}L${pt(lerp(l[i], r[i], 0.85))}`;
    });
    return { edges: wear ? worn(l) + worn(r) : poly(l) + poly(r), hatch };
  }

  /**
   * A ray as the circle's sun throws them: two edges from a base `half`
   * either side of `base` to a point at `tip`, a line down the middle, and
   * one half hatched.
   */
  function ray(base: Pt, tip: Pt, half: number, gap = 0.75) {
    const len = Math.hypot(tip[0] - base[0], tip[1] - base[1]);
    const [ux, uy] = [(tip[0] - base[0]) / len, (tip[1] - base[1]) / len];
    const l: Pt = [base[0] - uy * half, base[1] + ux * half];
    const r: Pt = [base[0] + uy * half, base[1] - ux * half];
    const n = Math.floor(len / gap);
    const hatch = Array.from({ length: n - 1 }, (_, i) => {
      const s = (i + 1) / n;
      return `M${pt(lerp(base, tip, s))}L${pt(lerp(l, tip, s))}`;
    }).join('');
    return { lines: `M${pt(l)}L${pt(tip)}L${pt(r)}M${pt(base)}L${pt(tip)}`, hatch };
  }

  // ---- the end (the left one; the right is its mirror) ----------------------
  // In pixels: the plate's edge at x 0, its middle at y 0. Plates are 64 high.

  const SEAL: Pt = [30, 0];
  const SEAL_R = 11;

  // The cartouche: from the seal, a scroll up and out towards the frame,
  // curling in on itself, and a smaller one up and in towards the name;
  // the same below.
  const outer = smooth([at(-38, SEAL_R + 0.6, SEAL), [20.5, -15.5], [16, -19.6], ...curl([12.6, -14], 5.6, 0.6, 1.55, 0).slice(1)], 6);
  const inner = flipX(smooth([at(-38, SEAL_R + 0.6, SEAL), [21.6, -15.8], [18.2, -18.6], ...curl([14.4, -14.2], 4.4, 0.5, 1.35, 0).slice(1)], 6), SEAL[0]);
  const taper = (from: number, to: number) => (t: number) => from + (to - from) * Math.pow(t, 0.7);
  const scrolls = [outer, inner, flipY(outer), flipY(inner)].map((c, k) =>
    band(c, taper(k % 2 ? 1.1 : 1.35, 0.25), { t0: 0.2, t1: 0.7, gap: 1.25 }),
  );
  // A bead at the heart of each curl.
  const beads = [outer, inner, flipY(outer), flipY(inner)].map((c) => c.at(-1)!);

  // The rays: a long one in towards the name, a short one out to the frame.
  const rayIn = ray([SEAL[0] + SEAL_R + 0.8, 0], [63, 0], 2.1);
  const rayOut = ray([SEAL[0] - SEAL_R - 0.8, 0], [7.5, 0], 1.7);
  // Fine lines either side of the long ray, as the sun has between its rays.
  const FINE = [-4.2, 4.2].map((y) => `M${SEAL[0] + SEAL_R + 2.6} ${y * 0.75}L${51} ${y}`).join('');

  const RINGS = { outer: worn(smooth(Array.from({ length: 25 }, (_, k) => at(k * 15, SEAL_R, SEAL)), 4)), hair: SEAL_R - 1.5 };

  // Sol, as on the circle: a disc with a point at its heart and twelve
  // rays, long and short in turn.
  const SOL =
    `M0 -3.6A3.6 3.6 0 1 1 0 3.6A3.6 3.6 0 1 1 0 -3.6M0 -0.8A0.8 0.8 0 1 1 0 0.8A0.8 0.8 0 1 1 0 -0.8` +
    Array.from({ length: 12 }, (_, k) => `M${pt(at(k * 30, 5))}L${pt(at(k * 30, k % 2 ? 6.4 : 7.6))}`).join('');
  // Luna: a crescent shaded in hatching, horns to the right.
  const LUNA = 'M3.3 -5A6 6 0 1 0 3.3 5A5.1 5.1 0 1 1 3.3 -5Z';
  const LUNA_HATCH = Array.from({ length: 11 }, (_, i) => {
    const y = -5 + i;
    const x0 = -Math.sqrt(36 - y * y) + 0.6;
    const x1 = 2.4 - Math.sqrt(Math.max(0, 5.1 ** 2 - y * y)) - 0.5;
    return x1 - x0 > 0.3 ? `M${f(x0)} ${y}H${f(x1)}` : '';
  }).join('');

  // The frame's corner, cut like the panels' filigree, with a lozenge in
  // the cut; the rules run on from it (see the markup).
  const CORNER = 'M2.5 19V8.5L8.5 2.5H14M5.5 16.5V10L10 5.5H16';
  const LOZENGE = 'M5 1.9 8.1 5 5 8.1 1.9 5Z';

  // ---- the field ---------------------------------------------------------------
  // Pointed arches on a sill, each two bays wide, so that every arch crosses
  // its neighbours' legs: it passes under the one to its left and over the
  // one to its right, as the heptagram's straps go over and under in turn.

  const BAY = 16;
  const SILL = 21;
  const W = 0.75;
  const archLine = (x: number) =>
    smooth([[x, SILL], [x + 0.6, 4], [x + 4.6, -8.6], [x + BAY, -19], [x + 2 * BAY - 4.6, -8.6], [x + 2 * BAY - 0.6, 4], [x + 2 * BAY, SILL]], 14);
  const ARCH = archLine(0);
  const LEFT = archLine(-BAY);
  /** How far `p` is from the polyline `c`. */
  const away = (p: Pt, c: Pt[]) =>
    Math.min(
      ...c.slice(1).map((q, i) => {
        const o = c[i];
        const [dx, dy] = [q[0] - o[0], q[1] - o[1]];
        const t = Math.max(0, Math.min(1, ((p[0] - o[0]) * dx + (p[1] - o[1]) * dy) / (dx * dx + dy * dy)));
        return Math.hypot(p[0] - o[0] - dx * t, p[1] - o[1] - dy * t);
      }),
    );
  // Both edges of the arch, broken where it goes under its left neighbour.
  const archEdges = (() => {
    const n = normals(ARCH);
    return [1, -1]
      .map((side) => {
        const e = offset(ARCH, n, () => W, side);
        const pieces: Pt[][] = [[]];
        for (const p of e) {
          if (p[1] < SILL - 2 && away(p, LEFT) < W + 0.9) {
            if (pieces.at(-1)!.length) pieces.push([]);
          } else pieces.at(-1)!.push(p);
        }
        return pieces.map(poly).join('');
      })
      .join('');
  })();
  /** The arches, every bay from one tile's width before to one after. */
  const FIELD = (() => {
    const shift = (d: string, dx: number) => d.replace(/(-?\d+\.?\d*) (-?\d+\.?\d*)/g, (_, x, y) => `${f(+x + dx)} ${y}`);
    return [-2, -1, 0].map((k) => shift(archEdges, k * BAY)).join('') + `M-1 ${SILL}H${BAY + 1}M-1 ${SILL + 2.2}H${BAY + 1}`;
  })();
</script>

<script lang="ts">
  // `lit` lights the seals (an unidentified item keeps them dark until the
  // reveal, when they flare); `end` is what the right seal holds: Luna, or
  // nothing, for a button to sit in it (the dialog's close).
  let { lit = true, end = 'luna' }: { lit?: boolean; end?: 'luna' | 'empty' } = $props();

  const uid = $props.id();
</script>

<!-- One end of the plate: a seal in its cartouche. -->
{#snippet cap(sign: 'sol' | 'luna' | 'empty')}
  <g class="ink">
    {#each scrolls as s, k (k)}
      <path d={s.edges} class="draw" style:--d="{0.25 + k * 0.05}s" pathLength="100" />
      <path d={s.hatch} class="hatch fade" style:--d="0.6s" />
    {/each}
    {#each beads as b, k (k)}
      <circle cx={b[0]} cy={b[1]} r="0.9" class="solid fade" style:--d="0.75s" />
    {/each}
    <path d={rayIn.lines} class="draw thin" style:--d="0.45s" pathLength="100" />
    <path d={rayIn.hatch} class="hatch fade" style:--d="0.75s" />
    <path d={FINE} class="draw hair" style:--d="0.55s" pathLength="100" />
    <path d={rayOut.lines} class="draw thin" style:--d="0.4s" pathLength="100" />
    <path d={rayOut.hatch} class="hatch fade" style:--d="0.7s" />
  </g>
  <g class="seal">
    <circle cx={SEAL[0]} cy={SEAL[1]} r={SEAL_R + 0.4} class="well" />
    <circle cx={SEAL[0]} cy={SEAL[1]} r={SEAL_R} class="bloom" fill="url(#{uid}-bloom)" />
    <path d={RINGS.outer} class="ring" />
    <circle cx={SEAL[0]} cy={SEAL[1]} r={RINGS.hair} class="hair ring" />
    {#if sign !== 'empty'}
      <g class="sign" transform="translate({pt(SEAL)})">
        {#if sign === 'sol'}
          <path d={SOL} />
        {:else}
          <path d={LUNA} />
          <path d={LUNA_HATCH} class="hatch" />
        {/if}
      </g>
    {/if}
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
        <g class="ink" transform="scale({right ? -1 : 1} {bottom ? -1 : 1})">
          <path d={CORNER} class="draw thin" pathLength="100" />
          <path d={LOZENGE} class="solid fade" style:--d="0.3s" />
          <line x1="14" y1="2.5" x2="50%" y2="2.5" class="draw rule" style:--d="0.3s" pathLength="100" />
          <line x1="16" y1="5.5" x2="50%" y2="5.5" class="draw hair" style:--d="0.4s" pathLength="100" />
          <line x1="14" y1="2.5" x2="50%" y2="2.5" class="spark" pathLength="100" />
        </g>
      </svg>
    {/each}
  {/each}
{/snippet}

<span class="plate" class:lit aria-hidden="true">
  <svg class="field" width="100%" height="100%">
    <defs>
      <pattern id="{uid}-arches" patternUnits="userSpaceOnUse" width={BAY} height="64" x="50%" y="-32">
        <path d={FIELD} transform="translate(0 32)" />
      </pattern>
    </defs>
    <svg y="50%" overflow="visible">
      <rect y="-32" width="100%" height="64" fill="url(#{uid}-arches)" />
    </svg>
  </svg>
  <!-- The engraving twice, as on the circle: a soft, wide copy for the glow, and the lines. -->
  <svg class="art glow" width="100%" height="100%">{@render plate()}</svg>
  <svg class="art" width="100%" height="100%">
    <defs>
      <radialGradient id="{uid}-bloom">
        <stop offset="0" stop-color="#ffcf8a" stop-opacity="0.9" />
        <stop offset="0.45" stop-color="#e98a3e" stop-opacity="0.45" />
        <stop offset="1" stop-color="#e98a3e" stop-opacity="0" />
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
    /* The engraver's ink, a warm copper. */
    --ink: #e3a066;
    color: var(--ink);
    /* A warm glow behind the name, darker towards the ends. */
    background:
      radial-gradient(ellipse 40% 80% at 50% 50%, rgba(224, 138, 68, 0.24), transparent 72%),
      linear-gradient(90deg, rgba(0, 0, 0, 0.45), transparent 20%, transparent 80%, rgba(0, 0, 0, 0.45)),
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
  /* The arches: faint, gone under the ends and fainter under the name. */
  .field {
    opacity: 0.2;
    mask-image: linear-gradient(
      90deg,
      transparent 52px,
      #000 96px,
      rgba(0, 0, 0, 0.45) 40%,
      rgba(0, 0, 0, 0.45) 60%,
      #000 calc(100% - 96px),
      transparent calc(100% - 52px)
    );
    animation: fade 1.2s 0.3s ease-out both;
  }
  pattern path {
    fill: none;
    stroke: var(--ink);
    stroke-width: 0.45;
  }

  path,
  circle,
  line {
    fill: none;
    stroke: currentColor;
    stroke-width: 0.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .thin {
    stroke-width: 0.65;
  }
  .rule {
    stroke-width: 0.9;
  }
  .hair {
    stroke-width: 0.4;
  }
  .hatch {
    stroke-width: 0.35;
  }
  .solid {
    fill: currentColor;
    stroke: none;
  }
  .well {
    fill: #120904;
    stroke: none;
  }
  .ring {
    stroke-width: 0.9;
  }
  .ring.hair {
    stroke-width: 0.4;
  }

  /* The glow: the same lines, wide and faint (no filter, so nothing repaints). */
  .glow {
    opacity: 0.13;
    animation: fade 1.4s 0.5s ease-out both;
  }
  .glow :global(*) {
    stroke-width: 3;
  }
  .glow :global(.hair),
  .glow :global(.hatch) {
    stroke-width: 1.4;
  }
  .glow .well,
  .glow .bloom,
  .glow .spark {
    display: none;
  }

  /* The seals: their signs are dark until the item is known, then they
     flare, the light blooming out and running along the rules. */
  .sign path {
    stroke: #7a4a2a;
    stroke-width: 0.6;
    transition: stroke 0.8s;
  }
  .sign .hatch {
    stroke-width: 0.35;
  }
  .lit .sign path {
    stroke: #ffd29a;
  }
  .glow .sign path {
    stroke: transparent;
    stroke-width: 2.4;
  }
  .lit .glow .sign path {
    stroke: #ffb066;
  }
  .bloom {
    stroke: none;
    transform-box: fill-box;
    transform-origin: center;
    opacity: 0;
    transition: opacity 0.8s;
  }
  /* Once lit, the seals breathe like the circle's glow. */
  .lit .bloom {
    opacity: 0.45;
    animation:
      flare 1.4s ease-out both,
      breathe 6s 1.4s ease-in-out infinite alternate;
  }
  .seal {
    transform-box: fill-box;
    transform-origin: center;
    animation: stamp 0.55s 0.15s var(--ease-out) both;
  }

  .draw {
    stroke-dasharray: 100;
    animation: draw 0.9s var(--d, 0s) cubic-bezier(0.55, 0, 0.25, 1) both;
  }
  .fade {
    animation: fade 0.6s var(--d, 0s) ease-out both;
  }
  /* A spark that runs along the outer rules, from the seals to the middle, as they light. */
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
  @keyframes stamp {
    from {
      opacity: 0;
      transform: scale(1.6);
    }
  }
  @keyframes flare {
    from {
      opacity: 0;
      transform: scale(0.4);
    }
    25% {
      opacity: 1;
    }
    to {
      opacity: 0.45;
    }
  }
  @keyframes breathe {
    from {
      opacity: 0.45;
    }
    to {
      opacity: 0.22;
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
