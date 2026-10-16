<script module lang="ts">
  import type { StageLayer } from './ArcaneStage.svelte';
  import { plate } from 'virtual:plate/rose';

  // Its plate is built with the site (src/lib/plates/rose.ts), and read the
  // first time a circle of it mounts.
</script>

<script lang="ts">
  import ArcaneStage from './ArcaneStage.svelte';

  let { state, size, color, strength }: { state?: 'idle' | 'good' | 'bad'; size?: string; color?: string; strength?: number } = $props();

  const LAYERS: StageLayer[] = plate();
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

<ArcaneStage layers={LAYERS} {state} {size} {color} {strength} />
