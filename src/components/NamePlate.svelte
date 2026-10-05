<script module lang="ts">
  // The plate behind a unique's name, after the game's own header: a dark
  // bar in a copper frame whose ends are gothic tracery, drawn as the
  // circle is drawn: flat lines with a soft glow behind them. The tracery is
  // exact geometry, drawn with compasses (see
  // docs/arcane-style.md), and it holds one of the alchemist's circle's two
  // great seals at each end, the mouldings stopping short of it.
  // • The frame: a double rule, its corners cut like the panels' filigree,
  //   drawn out from the ends to meet under the name.
  // • The ends, alike but for their seals (Sol on the left, Luna on the
  //   right): two cusped ogees, one inside the other, springing from the
  //   post and swelling in two lobes before drawing in, hollow, to a point
  //   aimed at the name; and in each corner a mouchette, a teardrop of
  //   tracery, its head under the rule and its tail on the post.
  // • The field: an interlace of waves against their mirror images, each
  //   strap crossing its neighbours in the rows above and below too, over
  //   and under in turn, tiled over the whole plate; faint, as if cut into
  //   the dark.

  import { LUNA, LUNA_HATCH, SOL_RAYS } from '../lib/alchemy';

  type Pt = [number, number];
  type Hole = { c: Pt; r: number };
  const f = (v: number) => v.toFixed(2);
  const pt = (p: Pt) => `${f(p[0])} ${f(p[1])}`;
  const dist = (p: Pt, q: Pt) => Math.hypot(q[0] - p[0], q[1] - p[1]);
  const flipY = (pts: Pt[]): Pt[] => pts.map(([x, y]) => [x, -y]);
  const poly = (pts: Pt[]) => 'M' + pts.map(pt).join('L');
  /** The point at angle `a` (radians, screen coordinates) and radius `r` about `c`. */
  const on = (c: Pt, r: number, a: number): Pt => [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)];
  /** Points along the arc about `c` of radius `r` from angle `a0` to `a1`, about a pixel apart. */
  const arc = (c: Pt, r: number, a0: number, a1: number): Pt[] => {
    const n = Math.max(4, Math.ceil(Math.abs(a1 - a0) * r));
    return Array.from({ length: n + 1 }, (_, k) => on(c, r, a0 + ((a1 - a0) * k) / n));
  };

  // ---- strokes ------------------------------------------------------------------

  /** A piece of a line, and where it runs along the whole (0 to 1). */
  type Part = { d: string; from: number; to: number };

  /** A line through `pts`, broken where it passes within a hole (it stops short of a seal there). */
  function pieces(pts: Pt[], holes: Hole[] = []): Part[] {
    const run = [0];
    for (let i = 1; i < pts.length; i++) run.push(run[i - 1] + dist(pts[i - 1], pts[i]));
    const len = run.at(-1)!;
    const parts: Part[] = [];
    let cur: number[] = [];
    const flush = () => {
      if (cur.length > 1) parts.push({ d: poly(cur.map((i) => pts[i])), from: run[cur[0]] / len, to: run[cur.at(-1)!] / len });
      cur = [];
    };
    pts.forEach((p, i) => (holes.some((h) => dist(p, h.c) < h.r) ? flush() : cur.push(i)));
    flush();
    return parts;
  }

  const sec = (v: number) => `${v.toFixed(3)}s`;
  /**
   * Timing for drawing a broken line in one stroke, as the circle does: each
   * piece starts when the pen reaches it and draws at the pen's pace, the pen
   * sweeping the whole in `t` seconds after `delay`, fast at first and
   * slowing at the end.
   */
  const stroke = (parts: Part[], delay: number, t: number) => {
    const when = (y: number) => 1 - Math.sqrt(1 - Math.min(1, Math.max(0, y)));
    return parts.map(({ d, from, to }) => ({ d, delay: sec(delay + when(from) * t), t: sec(Math.max(0.03 * t, (when(to) - when(from)) * t)) }));
  };
  type Stroke = ReturnType<typeof stroke>;

  // ---- the end (the left one; the right is its mirror) ----------------------
  // In pixels: the plate's edge at x 0, its middle at y 0. Plates are 64 high.

  // Traced from a sketch of the end drawn 84 high, its middle at y 42, and
  // scaled to the plate: the sketch's curves, cleaned up and made exactly
  // symmetric about the middle. Upper halves; the lower are their mirrors.
  const S = 64 / 84;
  const T = ([x, y]: Pt): Pt => [x * S, (y - 42) * S];
  /** A cubic Bézier from `a` to `d`, as points. */
  const cubic = (a: Pt, b: Pt, c: Pt, d: Pt, n = 40): Pt[] =>
    Array.from({ length: n + 1 }, (_, k) => {
      const t = k / n;
      const u = 1 - t;
      return [0, 1].map((j) => u * u * u * a[j] + 3 * u * u * t * b[j] + 3 * u * t * t * c[j] + t * t * t * d[j]) as Pt;
    });
  /** A run of cubic Béziers in the sketch's coordinates, as points on the plate. */
  const trace = (start: Pt, ...curves: [Pt, Pt, Pt][]): Pt[] => {
    const out: Pt[] = [T(start)];
    let p = start;
    for (const [b, c, d] of curves) {
      out.push(...cubic(T(p), T(b), T(c), T(d)).slice(1));
      p = d;
    }
    return out;
  };
  /** A sketch y on the plate's outer and inner rules (2.5 and 5.5 in from its edge). */
  const OUTER_RULE = 42 - 29.5 / S;
  const INNER_RULE = 42 - 26.5 / S;

  /** The seal's middle, `SOCKET_X` in from the plate's edge (the dialog's close button sits there), in the ogee's swell. */
  export const SOCKET_X = 27.5;
  const SEAL: Pt = [SOCKET_X, 0];
  /** The seal's ring; the circle draws its signs for a ring of 13. */
  const SEAL_R = 10;
  const SIGN_SCALE = SEAL_R / 13;
  const HOLES = [{ c: SEAL, r: SEAL_R + 1.6 }];

  /** The cusp where the ogee meets the flame. */
  const CUSP: Pt = [40.6, 22.7];
  // The ogee: from the post it rises, hollow then swelling, over its crown
  // and down to the cusp.
  const OGEE = trace([3.6, 40.7], [[7, 40.7], [14.9, 38.6], [20.1, 30.2]], [[26.6, 19.7], [31.6, 19.7], [33.1, 19.7]], [[34.8, 19.7], [38.9, 20.4], CUSP]);
  // The flame: from the point it sweeps back in two lobes to sharp cusps,
  // the second the ogee's, then rises and runs on as the frame's inner rule.
  const FLAME_LOBES = trace([66.1, 42], [[61.1, 34.3], [50.9, 24], [50.1, 33.2]], [[52.6, 24.2], [47.8, 13.5], CUSP]);
  const FLAME_RISE = trace(CUSP, [[41, 19.7], [36.1, 12.7], [35.1, 9.2]], [[33.6, 4.6], [53.1, INNER_RULE], [70.6, INNER_RULE]]);
  /** Where the flame becomes the inner rule. */
  const INNER_RULE_X = 70.6 * S;
  // A fine line from the seal on to the point, inside the flame.
  const SPINE = trace([40.6, 31.2], [[44.6, 29.2], [49.6, 38.2], [56.1, 42]]);
  // The spandrel in the corner: its back an arc from the post up to the
  // outer rule, its face scalloped in three lobes meeting in cusps that
  // point into the corner.
  const SPANDREL = trace(
    [33.6, OUTER_RULE],
    [[32.4, 8.9], [25, 8.2], [21.6, 6.7]],
    [[27.6, 28.7], [13.6, 26.7], [9.6, 19.7]],
    [[9.6, 35.2], [4.6, 35.2], [1.6, 36.2]],
    [[0.9, 29], [3.2, 12.1], [21.6, OUTER_RULE]],
  );
  /** Where the spandrel meets the outer rule, which runs on from there. */
  const OUTER_RULE_X = 21.6 * S;

  const both = (pts: Pt[]) => [pts, flipY(pts)];
  const END = {
    spandrels: both(SPANDREL).flatMap((l) => stroke(pieces(l, HOLES), 0.1, 0.8)),
    ogees: both(OGEE).flatMap((l) => stroke(pieces(l, HOLES), 0.2, 0.7)),
    flames: both([...FLAME_LOBES, ...FLAME_RISE.slice(1)]).flatMap((l) => stroke(pieces(l, HOLES), 0.3, 0.9)),
    spines: both(SPINE).flatMap((l) => stroke(pieces(l, HOLES), 0.6, 0.4)),
    ring: stroke(pieces(arc(SEAL, SEAL_R, -Math.PI / 2, 1.5 * Math.PI)), 0.3, 0.6),
  };
  /** The grounds the tracery is set into: darker inside the ogee and flame, a deep red in the spandrels. */
  const GROUND = poly([...OGEE, ...[...FLAME_LOBES].reverse().slice(1), ...flipY(FLAME_LOBES).slice(1), ...flipY(OGEE).reverse().slice(1)]) + 'Z';
  const SPINE_PATHS = END.spines.map((p) => p.d).join('');
  const SPANDREL_GROUND = both(SPANDREL)
    .map((l) => poly(l) + 'Z')
    .join('');

  // ---- the field ---------------------------------------------------------------
  // Waves against their mirror images, the rows closer together than the
  // waves are tall, so that every strap crosses not just its own mirror but
  // the mirrors in the rows above and below. Six crossings a wave, and the
  // straps go over and under in turn along each, as the circle's star does.

  const BAY = 40;
  const AMP = 8.5;
  const ROW = 11;
  const W = 0.75;
  const GAP = 0.7;
  // The pattern repeats every row, so a tile one row high holds it; the rows
  // either side are drawn too, for the waves that reach into it.
  const ROWS = [-2, -1, 0, 1, 2, 3];
  /** Where along a wave (as an angle) it crosses a mirror in the next row up or down. */
  const SKEW = Math.asin(ROW / (2 * AMP));
  // Along a rising wave the crossings come at 0, SKEW, π - SKEW, π, π + SKEW
  // and 2π - SKEW; it goes under at every second one. Its mirror goes under
  // at the others.
  const UNDER = { rise: [SKEW, Math.PI, 2 * Math.PI - SKEW], fall: [0, Math.PI - SKEW, Math.PI + SKEW, 2 * Math.PI] };
  const wave = (c: number, sign: number): Pt[] =>
    Array.from({ length: 241 }, (_, k) => [(k / 240) * BAY, c + sign * AMP * Math.sin((2 * Math.PI * k) / 240)] as Pt);
  const STRANDS = ROWS.flatMap((r) => [1, -1].map((sign) => ({ sign, mid: wave(r * ROW, sign) })));
  /** One edge of a strap, `side` (±1) of its wave, cut where it passes under another. */
  const strapEdge = (s: (typeof STRANDS)[number], side: number) => {
    const others = STRANDS.filter((o) => o.sign !== s.sign);
    const under = s.sign > 0 ? UNDER.rise : UNDER.fall;
    const pieces: Pt[][] = [[]];
    s.mid.forEach((p, i) => {
      const [q, r] = [s.mid[Math.max(0, i - 1)], s.mid[Math.min(s.mid.length - 1, i + 1)]];
      const len = dist(q, r);
      const e: Pt = [p[0] - ((r[1] - q[1]) / len) * W * side, p[1] + ((r[0] - q[0]) / len) * W * side];
      const theta = (2 * Math.PI * p[0]) / BAY;
      const crossing = under.some((a) => Math.abs(theta - a) < 0.5);
      const near = crossing && others.some((o) => o.mid.some((m) => Math.abs(m[0] - e[0]) < 3 && dist(m, e) < W + GAP));
      if (near) {
        if (pieces.at(-1)!.length) pieces.push([]);
      } else pieces.at(-1)!.push(e);
    });
    return pieces.filter((q) => q.length > 1).map(poly).join('');
  };
  const WEAVE = STRANDS.flatMap((s) => [1, -1].map((side) => strapEdge(s, side))).join('');
  /**
   * One tile of the weave, as a CSS background: it repeats over the whole
   * plate whatever its height, in every browser (an SVG pattern fill fell
   * short of the plate's top and bottom on some phones).
   */
  const WEAVE_TILE = `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='${BAY}' height='${ROW}' viewBox='0 0 ${BAY} ${ROW}'><path d='${WEAVE}' fill='none' stroke='#c47a44' stroke-width='0.55'/></svg>`,
  )}")`;
</script>

<script lang="ts">
  // `lit` lights the seals' signs (an unidentified item keeps them dark
  // until the reveal, when they flare); `end` is what the right seal holds:
  // Luna, or nothing, for a button to sit in it (the dialog's close; see
  // SOCKET_X). The ends can be drawn smaller with `--end-scale`.
  let { lit = true, end = 'luna' }: { lit?: boolean; end?: 'luna' | 'empty' } = $props();

  const uid = $props.id();
  const id = (n: string) => `${uid}-${n}`;
</script>

<!-- A line of the tracery, drawn in one pen stroke across its gaps. -->
{#snippet moulding(list: Stroke)}
  {#each list as { d, delay, t }, k (k)}
    <path {d} class="draw piece metal" style:--d={delay} style:--t={t} pathLength="100" />
  {/each}
{/snippet}

<!-- One end of the plate. -->
{#snippet cap(sign: 'sol' | 'luna' | 'empty')}
  <g class="end">
    <path d={GROUND} class="ground" />
    <path d={SPANDREL_GROUND} class="ground leaf" />
    <path d={SPINE_PATHS} class="draw fine" style:--d="0.6s" pathLength="100" />
    <!-- The frame: the outer rule runs on from the spandrels, the inner from
         the flames, past the middle (the other end's rules overlap them
         there, unseen), so they scale with the end. -->
    {#each [-1, 1] as side (side)}
      <line x1={f(OUTER_RULE_X)} y1={side * 29.5} x2="70%" y2={side * 29.5} class="draw rule metal thin" style:--d="0.6s" pathLength="100" />
      <line x1={f(INNER_RULE_X)} y1={side * 26.5} x2="70%" y2={side * 26.5} class="draw rule metal" style:--d="1.1s" pathLength="100" />
      <line x1={f(OUTER_RULE_X)} y1={side * 29.5} x2="52%" y2={side * 29.5} class="spark" pathLength="100" />
    {/each}
    {@render moulding(END.spandrels)}
    {@render moulding(END.ogees)}
    {@render moulding(END.flames)}
    <!-- The seal, pressed in like the circle's. -->
    <g class="seal" style:--d="0.3s">
      <circle cx={SEAL[0]} cy={SEAL[1]} r={SEAL_R + 1} class="well" />
      <circle cx={SEAL[0]} cy={SEAL[1]} r={SEAL_R + 3.5} class="bloom" style:fill="url(#{id('bloom')})" />
      {@render moulding(END.ring)}
      {#if sign !== 'empty'}
        <g class="sign" style:--d="0.7s" transform="translate({pt(SEAL)}) scale({f(SIGN_SCALE)})">
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
{/snippet}

<span class="plate" class:lit aria-hidden="true">
  <span class="field" style:background-image={WEAVE_TILE} style:--tile="{BAY}px {ROW}px"></span>
  <!-- The lines twice, as on the circle: a soft, wide copy for the glow, and the lines. -->
  <svg class="art glow" width="100%" height="100%">{@render plate()}</svg>
  <svg class="art" width="100%" height="100%">
    <defs>
      <radialGradient id={id('bloom')}>
        <stop offset="0" stop-color="#f7a860" stop-opacity="0.9" />
        <stop offset="0.5" stop-color="#d9702e" stop-opacity="0.4" />
        <stop offset="1" stop-color="#d9702e" stop-opacity="0" />
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
    /* Near black, faintly warm, a touch lighter in the upper half, as in the game. */
    background:
      radial-gradient(ellipse 45% 90% at 50% 50%, rgba(160, 80, 30, 0.12), transparent 75%),
      linear-gradient(180deg, #2a1d17, #21160f 48%, #160e0a 52%, #120b08);
    box-shadow:
      inset 0 0 8px rgba(0, 0, 0, 0.55),
      inset 0 -1px 0 #5a3418;
  }
  .field,
  .art {
    position: absolute;
    inset: 0;
    overflow: visible;
  }
  .field {
    display: block;
  }
  .end {
    transform: scale(var(--end-scale, 1));
  }

  /* The interlace: over the whole plate, faint, as if cut into the dark;
     fainter still under the ends' tracery. */
  .field {
    background-size: var(--tile);
    background-position: center;
    background-repeat: repeat;
    opacity: 0.085;
    mask-image: linear-gradient(90deg, rgba(0, 0, 0, 0.35) 30px, #000 64px, #000 calc(100% - 64px), rgba(0, 0, 0, 0.35) calc(100% - 30px));
    animation: fade 1.2s 0.3s ease-out both;
  }

  path,
  circle,
  line {
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  /* The lines: flat copper, calmer than the name, as fine as the circle's. */
  .metal {
    stroke: #b06c3c;
    stroke-width: 1.3;
  }
  .rule {
    stroke-linecap: butt;
  }
  .metal.thin {
    stroke-width: 0.9;
  }
  .fine {
    stroke: #8a4d26;
    stroke-width: 0.7;
  }
  .ground {
    fill: rgba(8, 4, 2, 0.55);
  }
  .ground.leaf {
    fill: #3a150a;
  }
  .well {
    fill: #0c0603;
  }

  /* The glow: the same lines, wide and faint, breathing as the circle's
     does (on its own layer, so nothing repaints). */
  .glow {
    opacity: 0.2;
    animation:
      fade 1.4s 0.5s ease-out both,
      breathe-glow 6s 1.9s ease-in-out infinite alternate;
  }
  .glow .metal {
    stroke: #d98a4e;
    stroke-width: 3.6;
  }
  .glow .fine {
    stroke: #d98a4e;
    stroke-width: 1.8;
  }
  .glow .ground,
  .glow .well,
  .glow .bloom,
  .glow .sign,
  .glow .spark {
    display: none;
  }

  /* The signs, engraved as on the circle: dark until the item is known,
     then lit, with a bloom of light behind that flares and breathes. */
  .sign {
    animation: fade 0.6s var(--d) ease-out both;
  }
  .sign :global(*) {
    fill: none;
    stroke: #6a3a1e;
    stroke-width: 0.9;
    vector-effect: non-scaling-stroke;
    transition: stroke 0.8s;
  }
  .sign .hatch {
    stroke-width: 0.45;
  }
  .lit .sign :global(*) {
    stroke: #ffd2a0;
  }
  .bloom {
    opacity: 0;
    transform-box: fill-box;
    transform-origin: center;
    transition: opacity 0.8s;
  }
  .lit .bloom {
    opacity: 0.45;
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
    animation: draw var(--t, 0.9s) var(--d, 0s) cubic-bezier(0.55, 0, 0.25, 1) both;
  }
  /* A piece of a longer line keeps the pen's pace (see stroke()). */
  .piece {
    animation-timing-function: linear;
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
  @keyframes breathe-glow {
    from {
      opacity: 0.22;
    }
    to {
      opacity: 0.1;
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
