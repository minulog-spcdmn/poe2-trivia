<script lang="ts">
  import ArcaneStage, { type StageLayer } from './ArcaneStage.svelte';
  import { usePlate } from '../lib/plateStore.svelte';

  let { state, size, color, strength, hollow = false }: { state?: 'idle' | 'good' | 'bad'; size?: string; color?: string; strength?: number; hollow?: boolean } = $props();

  // Its plate (src/lib/plates/eye.ts), built away from the page; the circle
  // is put on the page as soon as it's at hand.
  const plate = usePlate<{ layers: StageLayer[]; eye: [string, string] }>('eye');
  const uid = $props.id();
  const eyeGlow = $derived(plate.value?.eye[0].replaceAll('@id@', uid) ?? '');
  const eyeLines = $derived(plate.value?.eye[1].replaceAll('@id@', uid) ?? '');
</script>

<!--
  The summoning, in seconds from the start: a light blooms at the centre,
  the rings draw outward from the eye, the heptagram is traced strap by
  strap, the sun's rays shoot out, the planets are stamped round the band
  and the script written after them, and last of all the eye opens. Each
  layer winds into place meanwhile, and the glow swells up under it all.
-->

{#snippet eye()}
  <div class="layer eye">
    <svg class="glow" viewBox="-100 -100 200 200">{@html eyeGlow}</svg>
    <svg viewBox="-100 -100 200 200">{@html eyeLines}</svg>
  </div>
{/snippet}

<!-- Hollow (with something set over its heart), without the eye and its glory. -->
<!-- (Set again when it turns hollow or whole: the stage takes its layers once, as it mounts.) -->
{#if plate.value}
  {#key hollow}
    <ArcaneStage layers={plate.value.layers.filter((l) => (hollow ? !l.inner : !l.hollow))} {state} {size} {color} {strength} heart={hollow ? undefined : eye} />
  {/key}
{/if}

<style>
  .eye :global(.lid) {
    stroke-width: 0.45;
  }
  .eye :global(.iris) {
    stroke-width: 0.35;
  }
  .eye :global(.pupil) {
    fill: currentColor;
    fill-rule: evenodd;
    stroke: none;
    transform-box: fill-box;
    transform-origin: center;
    transition: transform 0.9s var(--ease-out);
  }
  /* The eye widens at a right answer and narrows at a wrong one. */
  :global(.arcane.good) .eye :global(.pupil) {
    transform: scale(1.3);
  }
  :global(.arcane.bad) .eye :global(.pupil) {
    transform: scale(0.72);
  }

  /* The eye opens last; now and then it blinks, and now and then it looks
     aside, one way and later the other, and back. */
  .eye :global(.gaze) {
    animation: gaze 23s 7s ease-in-out infinite;
  }
  .eye {
    animation: open 0.8s 1.55s cubic-bezier(0.3, 1.35, 0.5, 1) both;
  }
  .eye svg {
    animation: blink 9s 5s infinite;
  }
  .eye .glow {
    animation:
      arcane-glow-in 1.4s 0.8s ease-out both,
      arcane-breathe 6s 2.2s ease-in-out infinite alternate,
      blink 9s 5s infinite;
  }

  @keyframes open {
    from {
      opacity: 0;
      scale: 1 0.05;
    }
    30% {
      opacity: 1;
    }
  }
  @keyframes gaze {
    0%,
    30%,
    46%,
    72%,
    86%,
    100% {
      translate: 0 0;
    }
    34%,
    42% {
      translate: -5px 0.5px;
    }
    76%,
    82% {
      translate: 4px -0.3px;
    }
  }
  @keyframes blink {
    0%,
    94% {
      scale: 1 1;
    }
    95.5% {
      scale: 1 0.06;
    }
    97.5% {
      scale: 1 1;
    }
  }
</style>
