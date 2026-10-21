<script lang="ts">
  // The seal of a pairing (SyncDialog): the vesica, two rings each through
  // the other's centre, two made one, its lens hatched on one side, in a
  // ring of points (docs/arcane-style.md: fine lines in currentColor, a
  // soft copy of them twice as wide underneath for the glow, breathing as
  // the circles' light does: arcane-breathe, ArcaneStage's). Set in a
  // hollow circle, its frame is the circle's own; drawn in, line by line,
  // as it's set. At the heart of the QR code it is the same seal in the
  // code's ink (`inked`): heavier, to read at that size, in a ring of its
  // own, with no glow, no hatching and no drawing in.
  import { draw } from 'svelte/transition';
  import { calm } from '../lib/motion.svelte';

  let { inked = false }: { inked?: boolean } = $props();
  const uid = $props.id();
  /** Drawn in, or (inked) there at once. */
  const drawn = (node: SVGGeometryElement, p: { duration: number; delay?: number }) => draw(node, inked ? { duration: 0 } : calm(p));

  /** Eight points round the vesica. */
  const points = Array.from({ length: 8 }, (_, i) => [37 * Math.sin((i * Math.PI) / 4), -37 * Math.cos((i * Math.PI) / 4)]);
  /** The vesica: two rings, each through the other's centre, and the points where they cross. */
  const R = 21;
  const cross = (R * Math.sqrt(3)) / 2;
  /** The lens where the rings overlap: two arcs between the crossings. */
  const lens = `M0 ${-cross}A${R} ${R} 0 0 1 0 ${cross}A${R} ${R} 0 0 1 0 ${-cross}z`;
  /** Its left half hatched, the strokes slanting as an engraver's do. */
  const hatch = Array.from({ length: 8 }, (_, i) => {
    const x = -R / 2 - 3 + i * 1.6;
    return `M${x.toFixed(2)} ${(cross + 2).toFixed(2)}L${(x + 5).toFixed(2)} ${(-cross - 2).toFixed(2)}`;
  }).join('');
</script>

{#snippet lines(glow: boolean)}
  <g class:glow>
    {#if inked}<circle r="46" class="fine" />{/if}
    <circle cx={-R / 2} r={R} class="bold" in:drawn|global={{ duration: 900, delay: 200 }} />
    <circle cx={R / 2} r={R} class="bold" in:drawn|global={{ duration: 900, delay: 450 }} />
  </g>
{/snippet}

<svg class="seal" class:inked viewBox="-50 -50 100 100" aria-hidden="true">
  {#if !inked}
    {@render lines(true)}
    <defs><clipPath id="lens-{uid}"><path d={lens} /></clipPath></defs>
    <g clip-path="url(#lens-{uid})"><path d={hatch} class="hair" in:drawn|global={{ duration: 600, delay: 1200 }} /></g>
  {/if}
  {@render lines(false)}
  {#each points as [x, y], i (i)}<circle cx={x} cy={y} r={inked ? 2 : 0.9} class="dot" />{/each}
  <circle cy={-cross} r={inked ? 3 : 1.3} class="dot" />
  <circle cy={cross} r={inked ? 3 : 1.3} class="dot" />
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
    stroke-width: 0.35;
  }
  .fine {
    stroke-width: 0.5;
  }
  .bold {
    stroke-width: 0.9;
  }
  .dot {
    fill: currentColor;
    stroke: none;
  }
  /* The glow: the lines twice as wide underneath, breathing. */
  .glow .bold {
    stroke-width: 1.8;
  }
  .glow {
    opacity: 0.28;
    animation: arcane-breathe 6s ease-in-out infinite alternate;
  }
  .inked .fine {
    stroke-width: 2.8;
  }
  .inked .bold {
    stroke-width: 5;
  }
</style>
