<script module lang="ts">
  import type { StageLayer } from './ArcaneStage.svelte';
  import { plate } from 'virtual:plate/blackSun';

  // Its plate is built with the site (src/lib/plates/blackSun.ts), and read the
  // first time a circle of it mounts.
</script>

<script lang="ts">
  import ArcaneStage from './ArcaneStage.svelte';

  let { state, size, color, strength }: { state?: 'idle' | 'good' | 'bad'; size?: string; color?: string; strength?: number } = $props();

  const LAYERS: StageLayer[] = plate();
</script>

<!--
  The summoning, in seconds from the start: a light blooms at the centre,
  the black sun is ringed and its rays shoot out, the three bands sweep
  round one after another, the finds are set into them and the script is
  written along them, and last the rim closes round it all.
-->

<ArcaneStage layers={LAYERS} {state} {size} {color} {strength} />
