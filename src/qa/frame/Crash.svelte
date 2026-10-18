<script lang="ts">
  // Throws, inside the app's error boundary, each time a scene asks (crashCue.svelte.ts).
  import { CRASH_MESSAGE, crash } from './crashCue.svelte.ts';

  $effect(() => {
    if (crash.left > 0) {
      crash.left--;
      throw new Error(CRASH_MESSAGE);
    }
  });
</script>
