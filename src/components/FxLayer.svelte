<script lang="ts">
  import { onMount } from 'svelte';
  import { startFx } from '../lib/fx/core';

  // The effects overlay: sparks, flares, shockwaves and bloom, drawn by
  // lib/fx over the whole UI and added to it as light (plus-lighter). Light
  // can't darken, so under it lies a second canvas, blended normally, for
  // the dark a player aura lays over the page (lib/fx/shade.ts): nothing is
  // made on it, and it stays hidden, until such an aura shows.
  let canvas: HTMLCanvasElement;
  let shade: HTMLCanvasElement;
  onMount(() => startFx(canvas, shade));
</script>

<canvas bind:this={shade} class="fx shade" aria-hidden="true"></canvas>
<canvas bind:this={canvas} class="fx light" aria-hidden="true"></canvas>

<style>
  /* A fixed height, so a phone's toolbars sliding don't resize (and clear)
     the canvas (see --screen-h in app.css). Effects are placed by the
     elements they play on; the edge glow follows the visible area. While
     those elements scroll with the page, it's set in the page instead
     (lib/fx/core.ts placeCanvas), so it scrolls with them. Both canvases
     alike, the shade first: at one z-index, the light is drawn over it. */
  .fx {
    position: fixed;
    inset: 0;
    width: 100%;
    height: var(--screen-h);
    z-index: 95;
    pointer-events: none;
  }
  .shade {
    visibility: hidden;
  }
  .light {
    mix-blend-mode: screen;
  }
  @supports (mix-blend-mode: plus-lighter) {
    .light {
      mix-blend-mode: plus-lighter;
    }
  }
</style>
