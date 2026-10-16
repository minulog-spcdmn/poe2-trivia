<script lang="ts">
  // The whole app inside an error boundary. Whatever a host sends a guest is
  // only shape-checked (protocol.ts), so a host that means harm could send a
  // game no screen can show; and a bug of our own can do the same. Either
  // way the page comes back on its feet instead of going blank: a guest
  // leaves the room (not to be put straight back in by a reload), and a
  // second crash soon after leaves any game.
  import App from './App.svelte';
  import { session } from './lib/session.svelte';

  /** A crash this soon after the last means the game itself can't be shown (ms). */
  const AGAIN_MS = 10000;
  let lastCrash = -Infinity;
  let recovered = $state(false);

  function onerror(error: unknown, reset: () => void) {
    console.error(error);
    const again = performance.now() - lastCrash < AGAIN_MS;
    lastCrash = performance.now();
    session.crashed(again);
    recovered = true;
    // Shown afresh once the boundary has let go of what failed.
    setTimeout(reset);
  }
</script>

<svelte:boundary {onerror}>
  <App {recovered} />
</svelte:boundary>
