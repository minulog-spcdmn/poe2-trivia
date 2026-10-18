<script lang="ts">
  import ArcaneStage, { type StageLayer } from './ArcaneStage.svelte';
  import { usePlate } from '../lib/plateStore.svelte';

  let { state, size, color, strength, hollow = false }: { state?: 'idle' | 'good' | 'bad'; size?: string; color?: string; strength?: number; hollow?: boolean } = $props();

  // Its plate (src/lib/plates/monad.ts), built away from the page; the circle
  // is put on the page as soon as it's at hand.
  const plate = usePlate<StageLayer[]>('monad', () => hollow);
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

<!-- Hollow (with something set over its heart): without what lies within the heart's ring, a plain frame in its place where it has one. -->
<!-- (Set again when it turns hollow or whole, its other plate: the stage takes its layers once, as it mounts.) -->
{#if plate.value}{#key plate.value}<ArcaneStage layers={plate.value} {state} {size} {color} {strength} />{/key}{/if}
