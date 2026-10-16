<script module lang="ts">
  import type { StageLayer } from './ArcaneStage.svelte';
  import { plate } from 'virtual:plate/monad';

  // Its plate is built with the site (src/lib/plates/monad.ts), and read the
  // first time a circle of it mounts.
</script>

<script lang="ts">
  import ArcaneStage from './ArcaneStage.svelte';

  let { state, size, color, strength }: { state?: 'idle' | 'good' | 'bad'; size?: string; color?: string; strength?: number } = $props();

  const LAYERS: StageLayer[] = plate();
</script>

<!--
  The summoning, in seconds from the start: a light blooms at the centre,
  the heart's ring and the great circle draw, the Seal of Solomon is traced
  strap by strap and its letters stamped between its points, the square is
  laid over a glory that shoots out under it and its seals stamped, the
  band's rings sweep round and the archangels are stamped into them and the
  script written, and last
  the monad is engraved stroke by stroke, its sun's face and point last.
-->

<ArcaneStage layers={LAYERS} {state} {size} {color} {strength} />
