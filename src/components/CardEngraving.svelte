<script module lang="ts">
  // The plate engraved on a category card, behind its emblem, in the same
  // engraver's hand as the alchemist's circle:
  // • a fan of fine rays out toward the card's edges, long and short;
  // • a ring of graduations, with a lozenge stamped at each quarter;
  // • a guilloche band, four waves braided round the emblem, as on old
  //   banknotes;
  // • a ring of dots inside it.
  // The same plate, with no emblem, sits around the seal on the card's back.
  //
  // It's drawn once for every card (the paths are the same), in currentColor,
  // and fades out toward the edges through a mask rather than a clip.
  type Pt = [number, number];
  const f = (v: number) => v.toFixed(2);
  const rad = (a: number) => (a * Math.PI) / 180;
  /** The point at `a` degrees clockwise from the top, `r` from the centre. */
  const at = (a: number, r: number): Pt => [r * Math.sin(rad(a)), -r * Math.cos(rad(a))];
  const seg = (p: Pt, q: Pt) => `M${f(p[0])} ${f(p[1])}L${f(q[0])} ${f(q[1])}`;

  // Rays: every sixth runs on furthest, the rest long and short in turn.
  const RAYS = Array.from({ length: 96 }, (_, k) => {
    const a = (k / 96) * 360;
    return seg(at(a, 76), at(a, k % 6 === 0 ? 125 : k % 2 ? 90 : 106));
  }).join('');

  // Graduations between the rings, a longer one every fifth.
  const TICKS = Array.from({ length: 120 }, (_, k) => {
    const a = (k / 120) * 360;
    return seg(at(a, k % 5 ? 66.5 : 64.5), at(a, 69));
  }).join('');

  // The guilloche: waves round the circle, each a quarter of a lobe on from
  // the last, so they cross in a braid.
  const LOBES = 12;
  const WAVES = Array.from({ length: 4 }, (_, k) => {
    const phase = (k / 4) * Math.PI;
    const n = 288;
    return (
      'M' +
      Array.from({ length: n }, (_, i) => {
        const a = (i / n) * 360;
        const p = at(a, 56 + 5 * Math.sin(LOBES * rad(a) + phase));
        return `${f(p[0])} ${f(p[1])}`;
      }).join('L') +
      'Z'
    );
  }).join('');

  // A small lozenge on the outer ring at each quarter.
  const LOZENGES = [0, 90, 180, 270].map((a) => {
    const [x, y] = at(a, 71);
    return { x, y, a };
  });
</script>

<script lang="ts">
  /** `drawn`: whether it is drawn in as the card turns face up in the deal (the face's, not the back's). */
  let { drawn = false }: { drawn?: boolean } = $props();
</script>

<span class="engraving" class:drawn aria-hidden="true">
  <svg viewBox="-125 -125 250 250">
    <g class="turning">
      <path d={RAYS} class="rays" />
      <path d={WAVES} class="waves" />
      <circle r="49" class="dots" />
    </g>
    <circle r="72.5" class="ring" pathLength="100" />
    <circle r="70" class="ring hair" pathLength="100" />
    <circle r="63" class="ring hair" pathLength="100" />
    <path d={TICKS} class="ticks" />
    {#each LOZENGES as { x, y, a } (a)}
      <path d="M0 -3.2L1.9 0L0 3.2L-1.9 0Z" transform="translate({f(x)} {f(y)}) rotate({a})" class="lozenge" />
    {/each}
  </svg>
</span>

<style>
  .engraving {
    position: absolute;
    left: 50%;
    top: 50%;
    width: var(--plate, 300px);
    height: var(--plate, 300px);
    translate: -50% -50%;
    pointer-events: none;
    -webkit-mask: radial-gradient(closest-side, #000 62%, transparent 100%);
    mask: radial-gradient(closest-side, #000 62%, transparent 100%);
  }
  svg {
    display: block;
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  path,
  circle {
    fill: none;
    stroke: currentColor;
  }
  .rays {
    stroke-width: 0.3;
    opacity: 0.55;
  }
  .waves {
    stroke-width: 0.3;
    opacity: 0.7;
  }
  /* Round dots, from a dash with no length. */
  .dots {
    stroke-width: 0.9;
    stroke-dasharray: 0 2.565;
    stroke-linecap: round;
    opacity: 0.8;
  }
  .ring {
    stroke-width: 0.55;
  }
  .hair {
    stroke-width: 0.3;
  }
  .ticks {
    stroke-width: 0.3;
  }
  .lozenge {
    fill: var(--lozenge-fill, #15100b);
    stroke-width: 0.55;
  }

  /* The fan and the braid turn slowly, the rings stay put. */
  .turning {
    animation: turn 180s linear infinite;
  }
  @keyframes turn {
    to {
      rotate: 360deg;
    }
  }

  /* As the card turns face up, the rings are drawn, the graduations cut and
     the braid and fan wound into place, after the alchemist's circle. */
  :global(.dealt) .drawn .ring {
    stroke-dasharray: 100;
    animation: draw 0.9s var(--face, 0ms) cubic-bezier(0.55, 0, 0.25, 1) both;
  }
  :global(.dealt) .drawn .hair {
    animation-delay: calc(var(--face, 0ms) + 120ms);
  }
  :global(.dealt) .drawn .ticks,
  :global(.dealt) .drawn .lozenge {
    animation: carve 0.6s calc(var(--face, 0ms) + 350ms) ease-out both;
  }
  :global(.dealt) .drawn .turning {
    animation:
      turn 180s linear infinite,
      wind 1.4s var(--face, 0ms) var(--ease-out) both;
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
  @keyframes wind {
    from {
      opacity: 0;
      transform: rotate(-30deg) scale(0.85);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .turning {
      animation: none;
    }
  }
</style>
