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
  .fx {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
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
