<script lang="ts">
  // The seal of a pairing (SyncDialog): the vesica, two rings each through
  // the other's centre, two made one, engraved in a ring of points
  // (docs/arcane-style.md: fine lines in currentColor, a soft wide copy of
  // them underneath for the glow). Drawn in, line by line, as it's set. At the heart of the QR code
  // it is the same seal in the code's ink, drawn by the code itself
  // (`inked`, no glow, no drawing in).
  import { draw } from 'svelte/transition';
  import { calm } from '../lib/motion.svelte';

  let { inked = false }: { inked?: boolean } = $props();
  /** Drawn in, or (inked) there at once. */
  const drawn = (node: SVGGeometryElement, p: { duration: number; delay?: number }) => draw(node, inked ? { duration: 0 } : calm(p));

  /** Eight points round the ring. */
  const points = Array.from({ length: 8 }, (_, i) => [37.5 * Math.sin((i * Math.PI) / 4), -37.5 * Math.cos((i * Math.PI) / 4)]);
  /** The vesica: two rings, each through the other's centre, and the points where they cross. */
  const R = 19;
  const cross = R * Math.sqrt(3) / 2;
</script>

{#snippet lines(glow: boolean)}
  <g class:glow>
    <circle r="46" class="hair" in:drawn|global={{ duration: 900 }} />
    <circle r="42.6" class="fine" in:drawn|global={{ duration: 900, delay: 150 }} />
    <circle cx={-R / 2} r={R} class="bold" in:drawn|global={{ duration: 800, delay: 450 }} />
    <circle cx={R / 2} r={R} class="bold" in:drawn|global={{ duration: 800, delay: 650 }} />
    {#if !glow}
      {#each points as [x, y], i (i)}<circle cx={x} cy={y} r="1.5" class="dot" />{/each}
      <circle cy={-cross} r="2.2" class="dot" />
      <circle cy={cross} r="2.2" class="dot" />
    {/if}
  </g>
{/snippet}

<svg class="seal" class:inked viewBox="-50 -50 100 100" aria-hidden="true">
  {#if !inked}{@render lines(true)}{/if}
  {@render lines(false)}
</svg>

<style>
  .seal {
    display: block;
    width: 100%;
    height: 100%;
    overflow: visible;
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
  }
  .hair {
    stroke-width: 0.8;
  }
  .fine {
    stroke-width: 1.2;
  }
  .bold {
    stroke-width: 2.4;
  }
  .dot {
    fill: currentColor;
    stroke: none;
  }
  .glow {
    opacity: 0.22;
    stroke-width: 5;
  }
  .glow > * {
    stroke-width: 6;
  }
  .glow .bold {
    stroke-width: 10;
  }
  .inked .hair {
    stroke-width: 2.4;
  }
  .inked .fine {
    stroke-width: 2.8;
  }
  .inked .bold {
    stroke-width: 5;
  }
</style>
