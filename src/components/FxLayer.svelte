<script lang="ts">
  import { onMount } from 'svelte';
  import { startFx } from '../lib/fx/core';

  // The effects overlay: sparks, flares, shockwaves and bloom, drawn by
  // lib/fx over the whole UI and added to it as light (plus-lighter).
  let canvas: HTMLCanvasElement;
  onMount(() => startFx(canvas));
</script>

<canvas bind:this={canvas} class="fx" aria-hidden="true"></canvas>

<style>
  /* A fixed height, so a phone's toolbars sliding don't resize (and clear)
     the canvas (see --screen-h in app.css). Effects are placed by the
     elements they play on; the edge glow follows the visible area. */
  .fx {
    position: fixed;
    inset: 0;
    width: 100%;
    height: var(--screen-h);
    z-index: 95;
    pointer-events: none;
    mix-blend-mode: screen;
  }
  @supports (mix-blend-mode: plus-lighter) {
    .fx {
      mix-blend-mode: plus-lighter;
    }
  }
</style>
