<script lang="ts">
  import ArcaneStage, { type StageLayer } from './ArcaneStage.svelte';
  import { usePlate } from '../lib/plateStore.svelte';

  let { state, size, color, strength }: { state?: 'idle' | 'good' | 'bad'; size?: string; color?: string; strength?: number } = $props();

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

{#if plate.value}<ArcaneStage layers={plate.value} {state} {size} {color} {strength} />{/if}
