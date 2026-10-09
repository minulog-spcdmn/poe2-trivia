<script lang="ts">
  import { onMount } from 'svelte';
  import { motion } from '../lib/motion.svelte';
  import { CLOCK_PEAK, onPressure, pressing, pressureLevel } from '../lib/darkness';

  // Delve: the dark of a question's clock running down (lib/darkness.ts).
  // The backdrop carries it: the light about you draws in from the edges
  // behind the UI. This only lays a soft shade along the very edges of the
  // screen over the UI, where on a phone the panels run nearly to the
  // sides and hide the backdrop's: a Gaussian falloff (an inset shadow), a
  // few px deep, that never reaches the question or the answers. It comes in
  // late, felt in the last seconds rather than seen before them. Only its
  // opacity changes, so it costs the compositor nothing more. Holding still
  // (effects off, reduced motion) it follows the clock in steps of a
  // twentieth rather than every frame. Its colour is the dark's own, a deep
  // blue-black, not the warm black of the scene.
  let { active }: { active: boolean } = $props();

  let el: HTMLDivElement;
  let wake = () => {};

  onMount(() => {
    let raf = 0;
    let shown = -1;

    function frame(now: number) {
      raf = 0;
      const level = active ? pressureLevel(now) : 0;
      // Faint until the last seconds, and no deeper than there as a miss
      // swallows the scene behind (nor any lighter as a right answer's light
      // overshoots): it stays at the very edges, off the question and answers.
      const o = Math.min(1, Math.max(0, level) / CLOCK_PEAK) ** 2;
      if (Math.abs(o - shown) > (motion.still ? 0.05 : 0.004) || (o === 0 && shown !== 0)) {
        shown = o;
        el.style.opacity = o > 0.001 ? o.toFixed(3) : '0';
        el.style.visibility = o > 0.001 ? 'visible' : 'hidden';
      }
      if ((active && pressing()) || shown > 0) raf = requestAnimationFrame(frame);
    }
    wake = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const off = onPressure(wake);
    wake();
    return () => {
      off();
      cancelAnimationFrame(raf);
      wake = () => {};
    };
  });
  // Leaving a question's screen clears it at once; coming back picks it up.
  $effect(() => {
    void active;
    wake();
  });
</script>

<div bind:this={el} class="edge" aria-hidden="true"></div>

<style>
  /* Over the UI, under the toasts, dialogs and effects; it never takes a click. */
  .edge {
    position: fixed;
    inset: 0;
    z-index: 10;
    pointer-events: none;
    visibility: hidden;
    opacity: 0;
    /* The dark's deep blue-black (its smoke, behind, is indigo and violet). */
    box-shadow: inset 0 0 clamp(16px, 4vmin, 40px) 2px rgba(5, 4, 20, 0.82);
  }
</style>
