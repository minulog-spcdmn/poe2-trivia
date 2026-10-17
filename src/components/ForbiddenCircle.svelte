<script lang="ts">
  import ArcaneStage, { type StageLayer } from './ArcaneStage.svelte';
  import { usePlate } from '../lib/plateStore.svelte';

  let { state, size, color, strength, hollow = false }: { state?: 'idle' | 'good' | 'bad'; size?: string; color?: string; strength?: number; hollow?: boolean } = $props();

  // Its plate (src/lib/plates/moth.ts), built away from the page; the circle
  // is put on the page as soon as it's at hand.
  const plate = usePlate<StageLayer[]>('moth');
</script>

<!--
  The summoning, in seconds from the start: a light blooms at the centre,
  the heart's ring draws, the circle and the wall are drawn round, the
  triangle is traced side by side as the glory shoots out under it, the
  crescents are laid and written, the band's rings sweep round, the seven
  signs of the black are set into them and the script written, the three
  sigils are traced beside the triangle, each from ring to ring,
  and last the moth is engraved, wings, body and markings.
-->

<!-- Hollow (with something set over its heart): without what lies within the heart's ring, a plain frame in its place where it has one. -->
<!-- (Set again when it turns hollow or whole: the stage takes its layers once, as it mounts.) -->
{#if plate.value}{#key hollow}<ArcaneStage layers={plate.value} {hollow} {state} {size} {color} {strength} />{/key}{/if}
