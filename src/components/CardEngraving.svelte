<script lang="ts">
  // One side of a category card, engraved (see lib/cardEngraving): drawn
  // for the card's size as it is laid out, the worn lines over a soft,
  // unbroken glow, as the alchemist's circle is. It stands still.
  import { engrave } from '../lib/cardEngraving';

  let { side }: { side: 'face' | 'back' } = $props();
  let w = $state(0);
  let h = $state(0);
  const glow = $derived(w && h ? engrave(side, w, h, false) : []);
  const lines = $derived(w && h ? engrave(side, w, h, true) : []);
</script>

<span class="engraving" bind:clientWidth={w} bind:clientHeight={h} aria-hidden="true">
  {#if w && h}
    {#each [glow, lines] as strokes, k (k)}
      <svg class:glow={k === 0} viewBox="0 0 {w} {h}">
        {#each strokes as { cls, d } (cls)}
          <path {d} class={cls} />
        {/each}
      </svg>
    {/each}
  {/if}
</span>

<style>
  .engraving {
    position: absolute;
    inset: 0;
    pointer-events: none;
    color: var(--ink);
  }
  svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  path {
    fill: none;
    stroke: currentColor;
    stroke-linecap: butt;
    stroke-linejoin: miter;
    stroke-miterlimit: 12;
  }
  /* Lines as the circle's look on the stage: cut, never painted. */
  .main {
    stroke-width: 0.95;
  }
  .thin {
    stroke-width: 0.75;
  }
  .hair {
    stroke-width: 0.48;
  }
  .hatch {
    stroke-width: 0.42;
    stroke-linecap: round;
  }
  .sign {
    stroke-width: 0.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  /* The script is texture, as round the circle's band: finer and fainter than the signs. */
  .script {
    stroke-width: 0.65;
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: 0.75;
  }
  .fill {
    fill: currentColor;
    stroke: none;
  }
  /* The glow: the same strokes, whole, wide and faint, under the lines. */
  .glow {
    opacity: 0.2;
  }
  .glow path {
    stroke-width: 2.6;
  }
  .glow .hair,
  .glow .hatch,
  .glow .script {
    stroke-width: 1.4;
  }
</style>
