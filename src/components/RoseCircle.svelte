<script lang="ts">
  import ArcaneStage, { type StageLayer } from './ArcaneStage.svelte';
  import { usePlate } from '../lib/plateStore.svelte';

  let { state, size, color, strength, hollow = false }: { state?: 'idle' | 'good' | 'bad'; size?: string; color?: string; strength?: number; hollow?: boolean } = $props();

  // Its plate (src/lib/plates/rose.ts), built away from the page; the circle
  // is put on the page as soon as it's at hand.
  const plate = usePlate<StageLayer[]>('rose');
</script>

<!--
  The summoning, in seconds from the start: a light blooms at the centre,
  the window's ring draws, its lancets and roundels are struck and cusped
  and the morning star cut in its oculus, and five rays shoot out from it;
  the Sun's round is drawn and Venus's path traced within it as she runs
  it, eight years in a second and a half, and the glory shines out after
  her; the band's rings sweep round, the moons are stamped into them and
  the script written; and last, the seals are stamped in her petals and
  the wheel's inner ring set turning.
-->

<!-- Hollow (with something set over its heart): without what lies within the heart's ring, a plain frame in its place where it has one. -->
<!-- (Set again when it turns hollow or whole: the stage takes its layers once, as it mounts.) -->
{#if plate.value}{#key hollow}<ArcaneStage layers={plate.value.filter((l) => (hollow ? !l.inner : !l.hollow))} {state} {size} {color} {strength} />{/key}{/if}
