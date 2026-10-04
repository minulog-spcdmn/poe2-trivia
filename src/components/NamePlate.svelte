<script module lang="ts">
  // The plate behind a unique's name, in the hand of the alchemist's circle
  // (ArcaneCircle): gilt lines (a bright line shading off, a dimmer one
  // inside it, as on the panels' corners) with a soft glow under them.
  // • The frame: a double rule, its corners cut like the panels' filigree,
  //   drawn out from the ends to meet under the name.
  // • The ends: the circle's two great seals, Sol on the left and Luna on
  //   the right, each in a pointed arch lying on its side, its point aimed
  //   at the name; the arch's inner line stops short of the seal, as the
  //   circle's lines stop short of its seals.
  // • The field: the seals' light. Sol throws fine rays, long and short in
  //   turn as on the circle; Luna rings herself in halos. Both fade out
  //   before the name, and both spread out as the signs light at the reveal.

  import { LUNA, LUNA_HATCH, SOL_RAYS } from '../lib/alchemy';

  type Pt = [number, number];
  const f = (v: number) => v.toFixed(2);
  const pt = (p: Pt) => `${f(p[0])} ${f(p[1])}`;
  const dist = (p: Pt, q: Pt) => Math.hypot(q[0] - p[0], q[1] - p[1]);
  const rad = (a: number) => (a * Math.PI) / 180;

  /**
   * An arc from `p` to `q` as points, bulging out to the left (going along)
   * by `bulge` of its chord.
   */
  function arc(p: Pt, q: Pt, bulge: number, n = 24): Pt[] {
    const c = dist(p, q);
    const s = bulge * c;
    const r = (c * c) / (8 * s) + s / 2;
    const [ux, uy] = [(q[0] - p[0]) / c, (q[1] - p[1]) / c];
    // The centre lies on the far side of the chord from the bulge.
    const o: Pt = [(p[0] + q[0]) / 2 - uy * (r - s), (p[1] + q[1]) / 2 + ux * (r - s)];
    const a0 = Math.atan2(p[1] - o[1], p[0] - o[0]);
    let da = Math.atan2(q[1] - o[1], q[0] - o[0]) - a0;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    return Array.from({ length: n + 1 }, (_, k) => [o[0] + r * Math.cos(a0 + (da * k) / n), o[1] + r * Math.sin(a0 + (da * k) / n)] as Pt);
  }

  /** A polyline through `pts`, broken where it passes within `r` of `c`. */
  function around(pts: Pt[], c: Pt, r: number) {
    const pieces: Pt[][] = [[]];
    for (const p of pts) {
      if (dist(p, c) < r) {
        if (pieces.at(-1)!.length) pieces.push([]);
      } else pieces.at(-1)!.push(p);
    }
    return pieces
      .filter((q) => q.length > 1)
      .map((q) => 'M' + q.map(pt).join('L'))
      .join('');
  }

  // ---- the end (the left one; the right is its mirror) ----------------------
  // In pixels: the plate's edge at x 0, its middle at y 0. Plates are 64 high.

  /** The seal's middle, `SOCKET_X` in from the plate's edge (the dialog's close button sits there). */
  export const SOCKET_X = 20;
  const SEAL: Pt = [SOCKET_X, 0];
  /** The seal's ring; the circle draws its signs for a ring of 13. */
  const SEAL_R = 15;
  const SIGN_SCALE = SEAL_R / 13;

  /** The arch: two arcs springing from the frame's corners and meeting in a point. */
  const TIP: Pt = [47, 0];
  const archSide = (from: Pt, to: Pt, bulge: number) => {
    const top = arc(from, to, bulge);
    return [top, top.map(([x, y]) => [x, -y] as Pt)];
  };
  const ARCH = archSide([8.5, -26.2], TIP, 0.1)
    .map((side) => 'M' + side.map(pt).join('L'))
    .join('');
  // The inner line, stopping short of the seal.
  const ARCH_IN = archSide([12, -22.4], [TIP[0] - 4.6, 0], 0.1)
    .map((side) => around(side, SEAL, SEAL_R + 2.2))
    .join('');
  /** The ground inside the arch, set darker. */
  const HOLLOW = (() => {
    const [top, bottom] = archSide([8.5, -26.2], TIP, 0.1);
    return `M2.5 -26.2${top.map((p) => 'L' + pt(p)).join('')}${[...bottom].reverse().map((p) => 'L' + pt(p)).join('')}L2.5 26.2Z`;
  })();
  /** A lozenge at the arch's point. */
  const POINT = `M${TIP[0] - 2.6} 0L${TIP[0]} -1.6L${TIP[0] + 2.6} 0L${TIP[0]} 1.6Z`;

  // The frame's corner, cut like the panels' filigree, with a lozenge in
  // the cut; the rules run on from it (see the markup).
  const CORNER = 'M2.5 19V8.5L8.5 2.5H14';
  const CORNER_IN = 'M5.5 16.5V10L10 5.5H16';
  const LOZENGE = 'M5 1.9 8.1 5 5 8.1 1.9 5Z';

  // ---- the light ---------------------------------------------------------------
  // From the seal's middle, starting clear of the arch. Long enough for any
  // plate; the markup fades them out well before the name.

  const LIGHT_FROM = 32;
  /** Sol's rays: one every 3.75° across the plate, long and short in turn. */
  const RAYS = Array.from({ length: 25 }, (_, k) => {
    const a = rad(-45 + k * 3.75);
    const to = k % 2 ? 140 : 420;
    return `M${pt([SEAL[0] + LIGHT_FROM * Math.cos(a), LIGHT_FROM * Math.sin(a)])}L${pt([SEAL[0] + to * Math.cos(a), to * Math.sin(a)])}`;
  }).join('');
  /** Luna's halos: rings about her, further apart as they spread (stippled, see the styles). */
  const HALOS = Array.from({ length: 12 }, (_, k) => LIGHT_FROM + k * 9 + k * k * 0.9)
    .map((r) => `M${f(SEAL[0] + r)} 0A${f(r)} ${f(r)} 0 1 1 ${f(SEAL[0] - r)} 0A${f(r)} ${f(r)} 0 1 1 ${f(SEAL[0] + r)} 0`)
    .join('');
</script>

<script lang="ts">
  // `lit` lights the seals' signs (an unidentified item keeps them dark
  // until the reveal, when they flare and their light spreads); `end` is
  // what the right seal holds: Luna, or nothing, for a button to sit in it
  // (the dialog's close; see SOCKET_X).
  let { lit = true, end = 'luna' }: { lit?: boolean; end?: 'luna' | 'empty' } = $props();

  const uid = $props.id();
  const id = (n: string) => `${uid}-${n}`;
</script>

<!-- One end of the plate. -->
{#snippet cap(sign: 'sol' | 'luna' | 'empty')}
  <path d={HOLLOW} class="hollow" />
  <path d={ARCH} class="draw gilt" style:--d="0.15s" pathLength="100" />
  <path d={ARCH_IN} class="draw dim" style:--d="0.3s" pathLength="100" />
  <path d={POINT} class="solid fade" style:--d="0.6s" />
  <!-- The seal, pressed in like the circle's. -->
  <g class="seal" style:--d="0.3s">
    <g transform="translate({pt(SEAL)})">
      <circle r={SEAL_R + 0.8} class="well" />
      <circle r={SEAL_R + 4} class="bloom" style:fill="url(#{id('bloom')})" />
      <circle r={SEAL_R} class="draw gilt" pathLength="100" />
      <circle r={SEAL_R - 1.8} class="draw dim" pathLength="100" />
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
  <!-- The seals' light, each in its own layer so it can spread without repainting. -->
  {#each ['sol', 'luna'] as side (side)}
    <svg class="light {side}" width="100%" height="100%">
      <defs>
        <clipPath id={id(`band-${side}`)}><rect y="-24" width="100%" height="48" /></clipPath>
      </defs>
      <svg y="50%" overflow="visible">
        {#if side === 'sol'}
          <path d={RAYS} clip-path="url(#{id('band-sol')})" />
        {:else}
          <svg x="100%" overflow="visible">
            <g transform="scale(-1 1)"><path d={HALOS} clip-path="url(#{id('band-luna')})" /></g>
          </svg>
        {/if}
      </svg>
    </svg>
  {/each}
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
  .light,
  .art {
    position: absolute;
    inset: 0;
    overflow: visible;
  }

  /* The seals' light: faint while the signs are dark, spreading out from
     the seals as they light, and gone before the name. */
  .light {
    opacity: 0.08;
    transition: opacity 0.9s;
  }
  .light.sol {
    transform-origin: 20px 50%;
    mask-image: linear-gradient(90deg, #000 min(30%, 130px), transparent min(44%, 210px));
  }
  .light.luna {
    transform-origin: calc(100% - 20px) 50%;
    mask-image: linear-gradient(270deg, #000 min(30%, 130px), transparent min(44%, 210px));
  }
  .lit .light {
    opacity: 0.3;
    animation: spread 1.6s 0.1s var(--ease-out) both;
  }
  .light path {
    fill: none;
    stroke: var(--ink);
    stroke-width: 0.45;
  }
  /* Moonlight in stipple: the halos as rows of fine dots. */
  .light.luna path {
    stroke-width: 0.9;
    stroke-dasharray: 0 2.4;
    stroke-linecap: round;
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
  /* The end is set into a darker ground. */
  .hollow {
    fill: rgba(10, 5, 2, 0.5);
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
    stroke-width: 0.9;
    vector-effect: non-scaling-stroke;
    stroke-linecap: round;
    stroke-linejoin: round;
    transition: stroke 0.8s;
  }
  .sign .hatch {
    stroke-width: 0.45;
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
  @keyframes spread {
    from {
      opacity: 0.08;
      transform: scale(0.4);
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
