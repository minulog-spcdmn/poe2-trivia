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
  const deg = (v: number) => (v * Math.PI) / 180;
  /** The point at angle `a` (radians, screen coordinates) and radius `r` about `c`. */
  const on = (c: Pt, r: number, a: number): Pt => [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)];
  /** Points along the arc about `c` of radius `r` from angle `a0` to `a1`, about a pixel apart. */
  const arc = (c: Pt, r: number, a0: number, a1: number): Pt[] => {
    const n = Math.max(4, Math.ceil(Math.abs(a1 - a0) * r));
    return Array.from({ length: n + 1 }, (_, k) => on(c, r, a0 + ((a1 - a0) * k) / n));
  };
  /** Points along the arc from `p` to `q` that bulges out (to the left, going along) by `bulge` of the chord; a negative bulge curves in. */
  const arcTo = (p: Pt, q: Pt, bulge: number): Pt[] => {
    const c = dist(p, q);
    const s = Math.abs(bulge) * c;
    const r = (c * c) / (8 * s) + s / 2;
    const [ux, uy] = [(q[0] - p[0]) / c, (q[1] - p[1]) / c];
    const side = Math.sign(bulge);
    const o: Pt = [(p[0] + q[0]) / 2 - uy * side * (r - s), (p[1] + q[1]) / 2 + ux * side * (r - s)];
    const a0 = Math.atan2(p[1] - o[1], p[0] - o[0]);
    let da = Math.atan2(q[1] - o[1], q[0] - o[0]) - a0;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    return arc(o, r, a0, a0 + da);
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

  /** The seal's middle, `SOCKET_X` in from the plate's edge (the dialog's close button sits there). */
  export const SOCKET_X = 14.5;
  const SEAL: Pt = [SOCKET_X, 0];
  /** The seal's ring; the circle draws its signs for a ring of 13. */
  const SEAL_R = 10.5;
  const SIGN_SCALE = SEAL_R / 13;
  const HOLES = [{ c: SEAL, r: SEAL_R + 1.8 }];

  /** The circle through three points: its centre and radius. */
  function circle3(p: Pt, q: Pt, r: Pt): { c: Pt; r: number } {
    const d = 2 * (p[0] * (q[1] - r[1]) + q[0] * (r[1] - p[1]) + r[0] * (p[1] - q[1]));
    const sq = (v: Pt) => v[0] * v[0] + v[1] * v[1];
    const c: Pt = [
      (sq(p) * (q[1] - r[1]) + sq(q) * (r[1] - p[1]) + sq(r) * (p[1] - q[1])) / d,
      (sq(p) * (r[0] - q[0]) + sq(q) * (p[0] - r[0]) + sq(r) * (q[0] - p[0])) / d,
    ];
    return { c, r: dist(c, p) };
  }

  /**
   * One side (the upper) of a flamed ogee arch lying on its side, drawn
   * with compasses. It is set out on the arc through its springing on the
   * post (`x0`, -`foot`), its crown (a third of the way, at -`h`) and its
   * point (`x1`, 0). At the fractions `knots` of the way along that arc the
   * edge rises to a spike, pushed `spike` out and leaning towards the point;
   * between spikes it swells out and sweeps hollow up into the next spike,
   * like a flame, and the last stretch draws in, hollow, to the point.
   */
  function flamedSide(x0: number, foot: number, x1: number, h: number, knots: number[], spike: number): Pt[] {
    const L = x1 - x0;
    const base = circle3([x0, -foot], [x0 + L * 0.34, -h], [x1, 0]);
    const a0 = Math.atan2(-foot - base.c[1], x0 - base.c[0]);
    let a1 = Math.atan2(-base.c[1], x1 - base.c[0]);
    if (a1 < a0) a1 += 2 * Math.PI;
    const at = (t: number) => on(base.c, base.r, a0 + (a1 - a0) * t);
    /** The spike at `t`: out from the arc's centre, and leaning on along it. */
    const spikeAt = (t: number): Pt => {
      const p = at(t);
      const a = a0 + (a1 - a0) * t;
      const out: Pt = [Math.cos(a), Math.sin(a)];
      const on_: Pt = [-Math.sin(a), Math.cos(a)];
      return [p[0] + out[0] * spike + on_[0] * spike * 1.25, p[1] + out[1] * spike + on_[1] * spike * 1.25];
    };
    const pts: Pt[] = [[x0, -foot]];
    let prev = 0;
    for (const t of knots) {
      // A flame: swell out to a waist set a little in from the arc, then
      // sweep up, hollow, into the spike.
      const waist = at(prev + (t - prev) * 0.5);
      pts.push(...arcTo(pts.at(-1)!, waist, 0.09).slice(1), ...arcTo(waist, spikeAt(t), -0.24).slice(1));
      prev = t;
    }
    const waist = at(prev + (1 - prev) * 0.45);
    pts.push(...arcTo(pts.at(-1)!, waist, 0.08).slice(1), ...arcTo(waist, [x1, 0], -0.14).slice(1));
    return pts;
  }
  /** A flamed ogee: both sides, from the post round to the post. */
  const flamed = (...args: Parameters<typeof flamedSide>) => {
    const top = flamedSide(...args);
    return [...top, ...flipY(top).reverse().slice(1)];
  };

  // Three arches, one inside another, springing from the post at their own
  // heights so their lines never meet; each with a fine line inside it.
  const ARCHES = [
    { x0: 3, foot: 13, x1: 48, h: 18.8, knots: [0.3, 0.62], spike: 4.2 },
    { x0: 3, foot: 7.5, x1: 41, h: 14.5, knots: [0.36, 0.66], spike: 3.2 },
  ];
  const OUTER = flamed(ARCHES[0].x0, ARCHES[0].foot, ARCHES[0].x1, ARCHES[0].h, ARCHES[0].knots, ARCHES[0].spike);
  const INNER = flamed(ARCHES[1].x0, ARCHES[1].foot, ARCHES[1].x1, ARCHES[1].h, ARCHES[1].knots, ARCHES[1].spike);
  const OUTER_IN = flamed(3, 13, 44.5, 16.9, [0.32, 0.63], 3);
  const INNER_IN = flamed(3, 7.5, 37.8, 12.8, [0.38, 0.67], 2.3);
  /** The innermost, from the seal's edge, a small flame pointing on at the name. */
  const HEART = flamed(SEAL[0] + SEAL_R + 2.4, 0.01, 34.5, 4.2, [0.5], 1.6);
  /** Lozenges on the arches' points. */
  const FINIALS = [48, 41].map((x) => `M${x - 0.8} 0L${x + 1.6} -1.5L${x + 4} 0L${x + 1.6} 1.5Z`).join('');

  /**
   * A mouchette: a round head of radius `r` about `head`, and two arcs from
   * the tail at `tail`, each tangent to the head (at angles `a1` and `a2`,
   * the first the side facing the frame). Its outline, from the tail round
   * the head and back.
   */
  function mouchette(head: Pt, r: number, tail: Pt, a1: number, a2: number): Pt[] {
    /** The arc from the tail that touches the head at angle `a`. */
    const flank = (a: number) => {
      const u: Pt = [Math.cos(a), Math.sin(a)];
      const p = on(head, r, a);
      const d: Pt = [p[0] - tail[0], p[1] - tail[1]];
      const R = (d[0] * d[0] + d[1] * d[1]) / (2 * (d[0] * u[0] + d[1] * u[1]));
      const c: Pt = [p[0] - u[0] * R, p[1] - u[1] * R];
      const t0 = Math.atan2(tail[1] - c[1], tail[0] - c[0]);
      let t1 = Math.atan2(p[1] - c[1], p[0] - c[0]);
      if (t1 - t0 > Math.PI) t1 -= 2 * Math.PI;
      if (t0 - t1 > Math.PI) t1 += 2 * Math.PI;
      return arc(c, Math.abs(R), t0, t1);
    };
    // Round the head the far way from the tail, from one flank to the other.
    return [...flank(a1), ...arc(head, r, a1, a2 > a1 ? a2 : a2 + 2 * Math.PI).slice(1), ...flank(a2).reverse().slice(1)];
  }
  // Tucked into the corner above the outer arch's springing, clear of it.
  const LEAF = mouchette([9.6, -23.4], 2.6, [4.6, -15.4], deg(-160), deg(20));

  // The frame's corner, cut like the panels' filigree, with a lozenge in
  // the cut; the rules run on from it (see the markup).
  const CORNER = 'M2.5 19V8.5L8.5 2.5H14';
  const CORNER_IN = 'M5.5 16.5V10L10 5.5H16';
  const LOZENGE = 'M5 1.9 8.1 5 5 8.1 1.9 5Z';

  const END = {
    ogees: [OUTER, INNER, HEART].map((o, k) => stroke(pieces(o, HOLES), 0.15 + k * 0.15, 0.9)),
    fine: [OUTER_IN, INNER_IN].map((o, k) => stroke(pieces(o, HOLES), 0.35 + k * 0.15, 0.9)),
    leaves: [LEAF, flipY(LEAF)].flatMap((l) => stroke(pieces(l, HOLES), 0.3, 0.7)),
    ring: stroke(pieces(arc(SEAL, SEAL_R, -Math.PI / 2, 1.5 * Math.PI)), 0.3, 0.6),
  };
  /** The grounds the tracery is set into: darker inside the ogees, a deep red in the leaves. */
  const GROUND = poly(OUTER) + 'Z';
  const LEAF_GROUND = [LEAF, flipY(LEAF)].map((l) => poly(l) + 'Z').join('');

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
    <path d={LEAF_GROUND} class="ground leaf" />
    {#each END.fine as list, k (k)}
      {#each list as { d, delay, t }, j (j)}
        <path {d} class="draw piece fine" style:--d={delay} style:--t={t} pathLength="100" />
      {/each}
    {/each}
    {#each END.ogees as o, k (k)}
      {@render moulding(o)}
    {/each}
    {@render moulding(END.leaves)}
    <path d={FINIALS} class="solid fade" style:--d="0.9s" />
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
  <!-- The frame, from the corners: the rules run from each end to the middle. -->
  {#each ['metal', 'inlay'] as layer (layer)}
    {#each [false, true] as right (right)}
      {#each [false, true] as bottom (bottom)}
        <svg x={right ? '100%' : 0} y={bottom ? '100%' : 0} overflow="visible">
          <g transform="scale({right ? -1 : 1} {bottom ? -1 : 1})">
            {#if layer === 'inlay'}
              <path d={CORNER_IN} class="draw fine" style:--t="0.4s" pathLength="100" />
              <line x1="16" y1="5.5" x2="50%" y2="5.5" class="draw rule fine" style:--d="0.4s" pathLength="100" />
              <path d={LOZENGE} class="solid fade" style:--d="0.3s" />
              <line x1="14" y1="2.5" x2="50%" y2="2.5" class="spark" pathLength="100" />
            {:else}
              <path d={CORNER} class="draw {layer}" style:--t="0.4s" pathLength="100" />
              <line x1="14" y1="2.5" x2="50%" y2="2.5" class="draw rule {layer}" style:--d="0.3s" pathLength="100" />
            {/if}
          </g>
        </svg>
      {/each}
    {/each}
  {/each}
{/snippet}

<span class="plate" class:lit aria-hidden="true">
  <svg class="field" width="100%" height="100%">
    <defs>
      <pattern id={id('weave')} patternUnits="userSpaceOnUse" width={BAY} height={ROW} x="50%" y="50%">
        <path d={WEAVE} />
      </pattern>
    </defs>
    <!-- Oversized (the plate clips it): a percentage height here resolved short of the plate. -->
    <rect y="-200" width="100%" height="400" fill="url(#{id('weave')})" />
  </svg>
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
  .end {
    transform: scale(var(--end-scale, 1));
  }

  /* The interlace: over the whole plate, faint, as if cut into the dark;
     fainter still under the ends' tracery. */
  .field {
    opacity: 0.085;
    mask-image: linear-gradient(90deg, rgba(0, 0, 0, 0.35) 30px, #000 64px, #000 calc(100% - 64px), rgba(0, 0, 0, 0.35) calc(100% - 30px));
    animation: fade 1.2s 0.3s ease-out both;
  }
  pattern path {
    fill: none;
    stroke: #c47a44;
    stroke-width: 0.55;
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
  /* The rules meet under the name; square ends overlap there, so the join doesn't show. */
  .rule {
    stroke-linecap: square;
  }
  .fine {
    stroke: #5e3219;
    stroke-width: 0.6;
  }
  .solid {
    fill: #c98552;
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
  .glow .solid,
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
