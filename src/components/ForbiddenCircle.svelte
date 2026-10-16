<script module lang="ts">
  import type { StageLayer } from './ArcaneStage.svelte';
  import { plate } from 'virtual:plate/moth';

  // Its plate is built with the site (src/lib/plates/moth.ts), and read the
  // first time a circle of it mounts.
</script>

<script lang="ts">
  import ArcaneStage from './ArcaneStage.svelte';

  let { state, size, color, strength }: { state?: 'idle' | 'good' | 'bad'; size?: string; color?: string; strength?: number } = $props();

  const LAYERS: StageLayer[] = plate();
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

<ArcaneStage layers={LAYERS} {state} {size} {color} {strength} />
