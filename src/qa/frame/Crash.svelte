<script lang="ts">
  // Throws, inside the app's error boundary, each time a scene asks (crash.svelte.ts).
  import { CRASH_MESSAGE, crash } from './crash.svelte.ts';

  $effect(() => {
    if (crash.left > 0) {
      crash.left--;
      throw new Error(CRASH_MESSAGE);
    }
  });
</script>
