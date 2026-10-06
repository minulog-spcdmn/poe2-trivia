<script lang="ts">
  import { onMount } from 'svelte';
  import { onPressure, pressing, pressureLevel } from '../lib/darkness';

  // Delve: the dark of a question's clock running down (lib/darkness.ts).
  // The backdrop carries it: the light about you draws in from the edges
  // behind the UI. This only lays a soft shade along the very edges of the
  // screen over the UI, where on a phone the panels run nearly to the
  // sides and hide the backdrop's: a Gaussian falloff (an inset shadow), a
  // few px deep, that never reaches the question or the answers. It comes in
  // late, felt in the last seconds rather than seen before them. Only its
  // opacity changes, so it costs the compositor nothing more. Holding still
  // (effects off, reduced motion) it follows the clock in steps of a
  // twentieth rather than every frame.
  let { active }: { active: boolean } = $props();

  let el: HTMLDivElement;
  let wake = () => {};

  onMount(() => {
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const still = () => reduceMotion.matches || document.documentElement.hasAttribute('data-still');
    let raf = 0;
    let shown = -1;

    function frame(now: number) {
      raf = 0;
      const level = active ? pressureLevel(now) : 0;
      // Faint until the last seconds.
      const o = level ** 2;
      if (Math.abs(o - shown) > (still() ? 0.05 : 0.004) || (o === 0 && shown !== 0)) {
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
    box-shadow: inset 0 0 clamp(16px, 4vmin, 40px) 2px rgba(4, 3, 2, 0.8);
  }
</style>
