<script module lang="ts">
  // The plate behind a unique's name, after the game's own header and
  // engraved in the hand of the alchemist's circle (see docs/arcane-style.md
  // and ArcaneCircle): fine gilt lines from exact geometry, shading by
  // hatching on one side, the odd nick of wear, lines stopping short of
  // every seal, and a soft, unbroken glow under it all.
  // • The frame: a double rule, its corners cut like the panels' filigree,
  //   drawn out from the ends to meet under the name.
  // • The ends, alike but for their seals. Two gothic ogees, one inside the
  //   other, drawn with compasses: from a common foot an arc swells to the
  //   crown and a reverse arc, tangent to it, draws in to a needle point
  //   aimed at the name. Each is a moulding of two lines hatched on its
  //   shaded side. A mouchette (a curved dagger of tracery, a head and two
  //   arcs tangent to it) in each corner. Over the foot, one of the circle's
  //   two great seals: Sol on the left, Luna on the right. A small ogee runs
  //   on from each seal like a flame.
  // • The field: a net of ogees, waves against their mirror images, each a
  //   strap woven over and under the next as the circle's star is, with a
  //   lozenge in every cell; faint, and fainter still under the name.

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
  /** Points along the arc about `c` of radius `r` from angle `a0` to `a1`, `step` apart (a pixel by default). */
  const arc = (c: Pt, r: number, a0: number, a1: number, step = 1): Pt[] => {
    const n = Math.max(4, Math.ceil((Math.abs(a1 - a0) * r) / step));
    return Array.from({ length: n + 1 }, (_, k) => on(c, r, a0 + ((a1 - a0) * k) / n));
  };

  // ---- strokes ------------------------------------------------------------------

  // The wear on the plate: a nick every 30 units or so, 0.4 to 1.2 long, from
  // a fixed seed so every plate is worn alike. Only the lines wear; the glow
  // under them runs on unbroken.
  let wearing = false;
  let wearSeed = 5;
  const wearRnd = () => (wearSeed = (wearSeed * 16807) % 2147483647) / 2147483647;

  /** A piece of a line, and where it runs along the whole (0 to 1). */
  type Part = { d: string; from: number; to: number };

  /** A line through `pts`, broken where it passes within a hole (it stops short of a seal) and, when worn, nicked. */
  function pieces(pts: Pt[], holes: Hole[] = []): Part[] {
    const run = [0];
    for (let i = 1; i < pts.length; i++) run.push(run[i - 1] + dist(pts[i - 1], pts[i]));
    const len = run.at(-1)!;
    const nicks = wearing
      ? Array.from({ length: Math.round((len / 30) * (0.4 + wearRnd() * 1.2)) }, () => {
          const at = wearRnd() * len;
          const w = 0.4 + wearRnd() * 0.8;
          return [at - w / 2, at + w / 2];
        })
      : [];
    const parts: Part[] = [];
    let cur: number[] = [];
    const flush = () => {
      if (cur.length > 1) parts.push({ d: poly(cur.map((i) => pts[i])), from: run[cur[0]] / len, to: run[cur.at(-1)!] / len });
      cur = [];
    };
    pts.forEach((p, i) => {
      if (holes.some((h) => dist(p, h.c) < h.r) || nicks.some(([a, b]) => run[i] > a && run[i] < b)) flush();
      else cur.push(i);
    });
    flush();
    return parts;
  }

  const sec = (v: number) => `${v.toFixed(3)}s`;
  /**
   * Timing for drawing a broken line in one stroke, as the circle does: each
   * piece starts when the pen reaches it and draws at the pen's pace, the pen
   * sweeping the whole in `t` seconds after `delay`, fast at first and
   * slowing at the end. (A dash can't run on from one piece to the next.)
   */
  const stroke = (parts: Part[], delay: number, t: number) => {
    const when = (y: number) => 1 - Math.sqrt(1 - Math.min(1, Math.max(0, y)));
    return parts.map(({ d, from, to }) => ({ d, delay: sec(delay + when(from) * t), t: sec(Math.max(0.03 * t, (when(to) - when(from)) * t)) }));
  };
  type Stroke = ReturnType<typeof stroke>;

  // ---- the end (the left one; the right is its mirror) ----------------------
  // In pixels: the plate's edge at x 0, its middle at y 0. Plates are 64 high.

  /** The seal's middle, `SOCKET_X` in from the plate's edge (the dialog's close button sits there). */
  export const SOCKET_X = 17;
  const SEAL: Pt = [SOCKET_X, 0];
  /** The seal's ring; the circle draws its signs for a ring of 13. */
  const SEAL_R = 12.5;
  const SIGN_SCALE = SEAL_R / 13;
  const HOLES = [{ c: SEAL, r: SEAL_R + 1 }];

  /**
   * A gothic ogee lying on its side, drawn with compasses, as a moulding
   * `band` wide. From the end's post at (`x0`, ±`foot`) an arc of radius
   * `r1` swells out and round, like an onion dome, and a reverse arc
   * tangent to it draws in to a needle point at `x1`. Returns the outline,
   * the line inside it (the same arcs, `band` in), and hatching across the
   * moulding on its shaded (lower) side.
   */
  function ogee(x0: number, foot: number, x1: number, r1: number, band: number) {
    const c1: Pt = [x0 + r1, -foot];
    // The reverse arc's centre stands over the point, the two circles touching.
    const dx = x1 - c1[0];
    const r2 = (dx * dx + foot * foot - r1 * r1) / (2 * (r1 + foot));
    const c2: Pt = [x1, -r2];
    const knee = Math.atan2(c2[1] - c1[1], c2[0] - c1[0]) + 2 * Math.PI;
    const back = Math.atan2(c1[1] - c2[1], c1[0] - c2[0]);
    /** The upper side, `inset` in from the outline: the swell, and the reverse arc down to the axis. */
    const side = (inset: number, step = 1) => {
      const r = r2 + inset;
      return {
        swell: arc(c1, r1 - inset, Math.PI, knee, step),
        draw: arc(c2, r, back, Math.PI - Math.asin(Math.min(1, r2 / r)), step),
      };
    };
    const [outer, inner] = [side(0), side(band)];
    const spaced = side(0, 1.25);
    const whole = (t: { swell: Pt[]; draw: Pt[] }) => {
      const top = [...t.swell, ...t.draw.slice(1)];
      return [...top, ...flipY(top).reverse().slice(1)];
    };
    // Hatching: across the moulding, along the radii of the arcs it is
    // drawn with, as finely spaced as on the circle.
    const across = (pts: Pt[], c: Pt, inward: number) =>
      pts.map((p) => {
        const d = dist(p, c);
        return [p, [p[0] + ((c[0] - p[0]) / d) * inward, p[1] + ((c[1] - p[1]) / d) * inward]] as [Pt, Pt];
      });
    const hatch = [...across(spaced.swell, c1, band * 0.85), ...across(spaced.draw, c2, -band * 0.85)]
      .map(([p, q]) => [[p[0], -p[1]], [q[0], -q[1]]] as [Pt, Pt])
      .filter(([p]) => !HOLES.some((o) => dist(p, o.c) < o.r + 0.6));
    return { line: whole(outer), inner: whole(inner), hatch: hatch.map(([p, q]) => `M${pt(p)}L${pt(q)}`).join('') };
  }

  // Two ogees, one inside the other, springing from the post either side of
  // the seal, which sits in their swell.
  const OGEES = [ogee(3, 9, 50, 15, 2), ogee(3, 7, 43, 11, 1.7)];
  /** A lozenge on the outer ogee's point. */
  const FINIAL = 'M48.4 0L51.4 -1.7L54.4 0L51.4 1.7Z';

  // The frame's corner, cut like the panels' filigree, with a lozenge in
  // the cut; the rules run on from it (see the markup).
  const CORNER = 'M2.5 19V8.5L8.5 2.5H14';
  const CORNER_IN = 'M5.5 16.5V10L10 5.5H16';
  const LOZENGE = 'M5 1.9 8.1 5 5 8.1 1.9 5Z';

  /** Everything at the end that wears, drawn twice: worn for the lines, whole for the glow under them. */
  const drawing = (worn: boolean) => {
    wearing = worn;
    wearSeed = 5;
    const line = (pts: Pt[], delay: number, t: number) => stroke(pieces(pts, HOLES), delay, t);
    /** A secondary line: cut round the seal but never worn. */
    const fine = (pts: Pt[], delay: number, t: number) => {
      const was = wearing;
      wearing = false;
      const out = stroke(pieces(pts, HOLES), delay, t);
      wearing = was;
      return out;
    };
    return {
      key: worn ? 'w' : 'c',
      ogees: OGEES.map((o, k) => ({ line: line(o.line, 0.15 + k * 0.12, 0.9), inner: fine(o.inner, 0.3 + k * 0.12, 0.9) })),
      ring: stroke(pieces(arc(SEAL, SEAL_R, -Math.PI / 2, 1.5 * Math.PI)), 0.3, 0.6),
    };
  };
  const CLEAN = drawing(false);
  const WORN = drawing(true);
  wearing = false;
  type Drawing = typeof WORN;

  const HOLLOW = `${poly(OGEES[0].line)}Z`;

  // ---- the field ---------------------------------------------------------------
  // Waves rising and falling against their mirror images, so that every cell
  // between a wave and its mirror is an ogee lying on its side like the
  // ends'. Each wave is a strap of two lines; where a wave crosses its
  // mirror it goes over, then under at the next crossing, the strap
  // underneath cut clear of the one on top.

  const BAY = 36;
  const AMP = 5.5;
  const ROW = 14;
  const W = 0.7;
  const GAP = 0.7;
  const ROWS = [-1, 0, 1];
  const waveLine = (c: number, sign: number): Pt[] =>
    Array.from({ length: 145 }, (_, k) => [(k / 144) * BAY, c + sign * AMP * Math.sin((2 * Math.PI * k) / 144)] as Pt);
  /** A strap's edge `side` (±1) of the wave, cut where it passes under its mirror. */
  const strapEdge = (c: number, sign: number, side: number) => {
    const mid = waveLine(c, sign);
    const mirror = waveLine(c, -sign);
    const edge = mid.map((p, i) => {
      const [q, r] = [mid[Math.max(0, i - 1)], mid[Math.min(mid.length - 1, i + 1)]];
      const len = dist(q, r);
      return [p[0] - ((r[1] - q[1]) / len) * W * side, p[1] + ((r[0] - q[0]) / len) * W * side] as Pt;
    });
    // The rising wave goes over at the ends of the bay and under in the middle; its mirror the other way.
    const under = (x: number) => (sign > 0 ? Math.abs(x - BAY / 2) < BAY / 4 : Math.abs(x - BAY / 2) > BAY / 4);
    const out: Pt[][] = [[]];
    for (const p of edge) {
      const near = Math.min(...mirror.map((m) => dist(p, m)));
      if (under(p[0]) && near < W + GAP) {
        if (out.at(-1)!.length) out.push([]);
      } else out.at(-1)!.push(p);
    }
    return out.filter((q) => q.length > 1).map(poly).join('');
  };
  const NET = ROWS.flatMap((r) => [1, -1].flatMap((sign) => [1, -1].map((side) => strapEdge(r * ROW, sign, side)))).join('');
  /** A lozenge in the middle of each cell between a wave and its mirror. */
  const NET_BEADS = ROWS.flatMap((r) => [BAY / 4, (3 * BAY) / 4].map((x) => [x, r * ROW] as Pt))
    .map(([x, y]) => `M${f(x - 1)} ${f(y)}L${f(x)} ${f(y - 1.6)}L${f(x + 1)} ${f(y)}L${f(x)} ${f(y + 1.6)}Z`)
    .join('');
  const NET_RULES = [-19, -21, 19, 21].map((y) => `M-1 ${y}H${BAY + 1}`).join('');
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

{#snippet strokes(list: Stroke, cls: string)}
  {#each list as { d, delay, t }, k (k)}
    <path {d} class="draw piece {cls}" style:--d={delay} style:--t={t} pathLength="100" />
  {/each}
{/snippet}

<!-- One end of the plate. -->
{#snippet cap(p: Drawing, sign: 'sol' | 'luna' | 'empty')}
  <g class="end">
    <path d={HOLLOW} class="hollow" />
    {#each p.ogees as o, k (k)}
      {@render strokes(o.line, 'gilt')}
      {@render strokes(o.inner, 'dim')}
      <path d={OGEES[k].hatch} class="hatch fade" style:--d="{0.8 + k * 0.1}s" />
    {/each}
    <path d={FINIAL} class="solid fade" style:--d="0.9s" />
    <!-- The seal, pressed in like the circle's. -->
    <g class="seal" style:--d="0.3s">
      <circle cx={SEAL[0]} cy={SEAL[1]} r={SEAL_R + 0.8} class="well" />
      <circle cx={SEAL[0]} cy={SEAL[1]} r={SEAL_R + 3.5} class="bloom" style:fill="url(#{id('bloom')})" />
      {@render strokes(p.ring, 'gilt')}
      <circle cx={SEAL[0]} cy={SEAL[1]} r={SEAL_R - 1.5} class="draw dim ring" style:--d="0.4s" style:--t="0.6s" pathLength="100" />
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

{#snippet plate(p: Drawing)}
  <!-- The ends, round the middle. -->
  <svg y="50%" overflow="visible">{@render cap(p, 'sol')}</svg>
  <svg x="100%" y="50%" overflow="visible"><g transform="scale(-1 1)">{@render cap(p, end)}</g></svg>
  <!-- The frame, from the corners: the rules run from each end to the middle. -->
  {#each [false, true] as right (right)}
    {#each [false, true] as bottom (bottom)}
      <svg x={right ? '100%' : 0} y={bottom ? '100%' : 0} overflow="visible">
        <g transform="scale({right ? -1 : 1} {bottom ? -1 : 1})">
          <path d={CORNER} class="draw gilt" style:--t="0.4s" pathLength="100" />
          <path d={CORNER_IN} class="draw dim" style:--t="0.4s" pathLength="100" />
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
      <pattern id={id('net')} patternUnits="userSpaceOnUse" width={BAY} height="64" x="50%" y="-32">
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
      <rect y="-32" width="100%" height="64" fill="url(#{id('net')})" />
    </svg>
  </svg>
  <!-- The lines twice, as on the circle: a soft copy for the glow, unworn, and the lines. -->
  <svg class="art glow" width="100%" height="100%">{@render plate(CLEAN)}</svg>
  <svg class="art" width="100%" height="100%">
    <defs>
      <!-- Gilt as on the panels' corners: bright where it is lit from above, shading off below. -->
      <linearGradient id={id('gilt')} gradientUnits="userSpaceOnUse" x1="0" y1="-30" x2="0" y2="30">
        <stop offset="0" stop-color="#f6e3ad" />
        <stop offset="0.45" stop-color="#d9a45a" />
        <stop offset="1" stop-color="#8f6630" />
      </linearGradient>
      <radialGradient id={id('bloom')}>
        <stop offset="0" stop-color="#f7c271" stop-opacity="0.9" />
        <stop offset="0.5" stop-color="#e59a50" stop-opacity="0.4" />
        <stop offset="1" stop-color="#e59a50" stop-opacity="0" />
      </radialGradient>
    </defs>
    {@render plate(WORN)}
  </svg>
</span>

<style>
  .plate {
    position: absolute;
    inset: 0;
    z-index: 0;
    overflow: hidden;
    pointer-events: none;
    /* Old gold, as on the circle. */
    --ink: #d9a45a;
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
  .end {
    transform: scale(var(--end-scale, 1));
  }

  /* The net: faint, gone under the ends and fainter under the name. */
  .field {
    opacity: 0.2;
    mask-image: linear-gradient(
      90deg,
      transparent 52px,
      #000 92px,
      rgba(0, 0, 0, 0.4) 38%,
      rgba(0, 0, 0, 0.4) 62%,
      #000 calc(100% - 92px),
      transparent calc(100% - 52px)
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

  /* Geometry is cut, not painted: butt ends, mitred corners. */
  path,
  circle,
  line {
    fill: none;
    stroke-linecap: butt;
    stroke-linejoin: miter;
    stroke-miterlimit: 12;
  }
  .gilt {
    stroke: var(--gilt);
    stroke-width: 1;
  }
  .rule {
    stroke: #e3b56e;
    stroke-width: 1;
  }
  .dim {
    stroke: #8c6534;
    stroke-width: 0.55;
  }
  .hatch {
    stroke: #a87c42;
    stroke-width: 0.35;
    stroke-linecap: round;
  }
  .solid {
    fill: #f1d99b;
  }
  /* A circle has no ends, but its drawing dash does. */
  .ring {
    stroke-linecap: round;
  }
  /* The end is set into a darker ground. */
  .hollow {
    fill: rgba(10, 5, 2, 0.5);
  }
  .well {
    fill: #0d0703;
  }

  /* The glow: the same lines, unworn, wide and faint, breathing (no filter,
     so nothing repaints). */
  .glow {
    opacity: 0.2;
    animation:
      glow-in 1.4s 0.5s ease-out both,
      breathe-glow 6s 1.9s ease-in-out infinite alternate;
  }
  .glow .gilt,
  .glow .rule {
    stroke: var(--ink);
    stroke-width: 2;
  }
  .glow .dim,
  .glow .hatch {
    stroke: var(--ink);
    stroke-width: 1;
  }
  .glow .hollow,
  .glow .well,
  .glow .bloom,
  .glow .spark,
  .glow .solid {
    display: none;
  }

  /* The signs, engraved as on the circle: dark until the item is known,
     then lit, with a bloom of light behind that flares and breathes. */
  .sign {
    animation: fade 0.6s var(--d) ease-out both;
  }
  .sign :global(*) {
    fill: none;
    stroke: #6e4a2a;
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
    stroke: #f6e3ad;
  }
  .glow .sign :global(*) {
    stroke: transparent;
    stroke-width: 2;
  }
  .lit .glow .sign :global(*) {
    stroke: #f0b862;
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
    stroke-width: 1.1;
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
  @keyframes glow-in {
    from {
      opacity: 0;
    }
    55% {
      opacity: 0.38;
    }
    to {
      opacity: 0.28;
    }
  }
  @keyframes breathe-glow {
    from {
      opacity: 0.28;
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
