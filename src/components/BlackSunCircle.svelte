<script lang="ts">
  import ArcaneStage, { type StageLayer } from './ArcaneStage.svelte';
  import { usePlate } from '../lib/plateStore.svelte';

  let { state, size, color, strength, hollow = false }: { state?: 'idle' | 'good' | 'bad'; size?: string; color?: string; strength?: number; hollow?: boolean } = $props();

  // Its plate (src/lib/plates/blackSun.ts), built away from the page; the circle
  // is put on the page as soon as it's at hand.
  const plate = usePlate<StageLayer[]>('blackSun');
</script>

<!--
  The summoning, in seconds from the start: a light blooms at the centre,
  the black sun is ringed and its rays shoot out, the three bands sweep
  round one after another, the finds are set into them and the script is
  written along them, and last the rim closes round it all.
-->

<!-- Hollow (with something set over its heart): without what lies within the heart's ring, a plain frame in its place where it has one. -->
<!-- (Set again when it turns hollow or whole: the stage takes its layers once, as it mounts.) -->
{#if plate.value}{#key hollow}<ArcaneStage layers={plate.value.filter((l) => (hollow ? !l.inner : !l.hollow))} {state} {size} {color} {strength} />{/key}{/if}
