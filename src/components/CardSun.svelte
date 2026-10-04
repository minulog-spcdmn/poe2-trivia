<script module lang="ts">
  // Sol, as the old alchemical woodcuts cut him, behind a category card's
  // emblem (and round the seal on its back): a disc ringed in beads, and
  // sixteen rays about it, straight ones hatched down one side and wavy
  // ones like flames, in turn. Drawn once for every card, in currentColor,
  // and faded out toward its edge through a mask.
  type Pt = [number, number];
  const f = (v: number) => v.toFixed(2);
  const rad = (a: number) => (a * Math.PI) / 180;
  /** The point at `a` degrees clockwise from the top, `r` from the centre. */
  const at = (a: number, r: number): Pt => [r * Math.sin(rad(a)), -r * Math.cos(rad(a))];
  const pt = (p: Pt) => `${f(p[0])} ${f(p[1])}`;
  const lerp = (p: Pt, q: Pt, t: number): Pt => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];

  const DISC = 50;
  const FROM = DISC + 5;

  // The straight rays: a long thin point, hatched down its left side.
  const STRAIGHT = Array.from({ length: 8 }, (_, k) => {
    const a = k * 45;
    const [base, l, r, tip] = [at(a, FROM), at(a - 4.2, FROM), at(a + 4.2, FROM), at(a, 92)];
    // Lines along the ray, from its foot out to its left edge.
    const hatch = Array.from({ length: 5 }, (_, i) => {
      const s = (i + 1) / 6;
      return `M${pt(lerp(base, l, s))}L${pt(lerp(tip, l, s))}`;
    }).join('');
    return { outline: `M${pt(l)}L${pt(tip)}L${pt(r)}M${pt(base)}L${pt(tip)}`, hatch };
  });

  // The flames: a tapering point that waves once on its way out, with a
  // line down its middle.
  const FLAMES = Array.from({ length: 8 }, (_, k) => {
    const a = k * 45 + 22.5;
    const u: Pt = [Math.sin(rad(a)), -Math.cos(rad(a))];
    const n: Pt = [Math.cos(rad(a)), Math.sin(rad(a))];
    const n0 = 28;
    const side = (s: number) =>
      Array.from({ length: n0 + 1 }, (_, i) => {
        const t = i / n0;
        const r = FROM + (82 - FROM) * t;
        const o = 3.4 * Math.sin(t * Math.PI * 2) * Math.min(1, t * 3);
        const h = 4.6 * (1 - t);
        return pt([u[0] * r + n[0] * (o + s * h), u[1] * r + n[1] * (o + s * h)]);
      });
    const left = side(1);
    const right = side(-1).reverse();
    const mid = side(0).slice(0, n0 - 4);
    return { outline: `M${left.join('L')}L${right.join('L')}Z`, mid: `M${mid.join('L')}` };
  });
</script>

<script lang="ts">
  /** `drawn`: whether it is drawn in as the card turns face up in the deal (the face's, not the back's). */
  let { drawn = false }: { drawn?: boolean } = $props();
</script>

<span class="sun" class:drawn aria-hidden="true">
  <svg viewBox="-100 -100 200 200">
    <g class="turning">
      {#each STRAIGHT as ray, k (k)}
        <path d={ray.outline} class="ray" />
        <path d={ray.hatch} class="hatch" />
      {/each}
      {#each FLAMES as flame, k (k)}
        <path d={flame.outline} class="ray flame" />
        <path d={flame.mid} class="hatch" />
      {/each}
    </g>
    <circle r={DISC} class="ring" pathLength="100" />
    <circle r={DISC - 2.4} class="ring hair" pathLength="100" />
    <circle r={DISC + 2.4} class="beads" />
  </svg>
</span>

<style>
  .sun {
    position: absolute;
    left: 50%;
    top: calc(50% + var(--sun-dy, 0px));
    width: var(--plate, 200px);
    height: var(--plate, 200px);
    translate: -50% -50%;
    pointer-events: none;
    -webkit-mask: radial-gradient(closest-side, #000 66%, transparent 100%);
    mask: radial-gradient(closest-side, #000 66%, transparent 100%);
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
    stroke-linejoin: round;
  }
  .ray {
    stroke-width: 0.6;
  }
  /* The flames are filled in dark, so the rays behind don't show through. */
  .flame {
    fill: var(--ground, #120d09);
  }
  .hatch {
    stroke-width: 0.35;
    stroke-linecap: round;
  }
  .ring {
    stroke-width: 0.8;
  }
  .hair {
    stroke-width: 0.4;
  }
  /* A hundred beads round the disc (2π × 52.4 / 100 apart), from a dash with no length. */
  .beads {
    stroke-width: 1.4;
    stroke-dasharray: 0 3.2924;
    stroke-linecap: round;
  }

  /* The rays turn, very slowly. */
  .turning {
    animation: turn 300s linear infinite;
  }
  @keyframes turn {
    to {
      rotate: 360deg;
    }
  }

  /* As the card turns face up, the disc is drawn and the rays flare out. */
  :global(.dealt) .drawn .ring {
    stroke-dasharray: 100;
    animation: draw 0.9s var(--face, 0ms) cubic-bezier(0.55, 0, 0.25, 1) both;
  }
  :global(.dealt) .drawn .beads {
    animation: carve 0.6s calc(var(--face, 0ms) + 300ms) ease-out both;
  }
  :global(.dealt) .drawn .turning {
    animation:
      turn 300s linear infinite,
      flare 1.3s calc(var(--face, 0ms) + 100ms) var(--ease-out) both;
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
  @keyframes flare {
    from {
      opacity: 0;
      transform: rotate(-20deg) scale(0.6);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .turning {
      animation: none;
    }
  }
</style>
