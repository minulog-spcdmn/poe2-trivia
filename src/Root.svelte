<script lang="ts">
  // The whole app inside an error boundary. Whatever a host sends a guest is
  // only shape-checked (protocol.ts), so a host that means harm could send a
  // game no screen can show; and a bug of our own can do the same. Either
  // way the page comes back on its feet instead of going blank: a guest
  // leaves the room (not to be put straight back in by a reload), and a
  // second crash soon after leaves any game. A crash soon after that, with
  // nothing left to leave, would only come back on every try: the page then
  // stops and offers a reload.
  import type { Component } from 'svelte';
  import App from './App.svelte';
  import { session } from './lib/session.svelte';

  /** The QA desk's frames only (src/qa): something to put inside the boundary beside the app, which can crash on cue. */
  let { qaInside }: { qaInside?: Component } = $props();

  /** A crash this soon after the last means the game itself can't be shown (ms). */
  const AGAIN_MS = 10000;
  let lastCrash = -Infinity;
  let recovered = $state(false);
  let stuck = $state(false);

  function onerror(error: unknown, reset: () => void) {
    console.error(error);
    const again = performance.now() - lastCrash < AGAIN_MS;
    lastCrash = performance.now();
    const inGame = !!session.mode;
    session.crashed(again);
    recovered = true;
    if (again && !inGame) stuck = true;
    // Shown afresh once the boundary has let go of what failed.
    else setTimeout(reset);
  }
</script>

<svelte:boundary {onerror}>
  <App {recovered} />
  {#if qaInside}
    {@const Inside = qaInside}
    <Inside />
  {/if}
  {#snippet failed()}
    {#if stuck}
      <div class="stuck" role="alert">
        <p>Something went wrong showing the page.</p>
        <button class="btn primary" onclick={() => location.reload()}>Reload</button>
      </div>
    {/if}
  {/snippet}
</svelte:boundary>

<style>
  .stuck {
    min-height: var(--app-h);
    display: grid;
    place-content: center;
    gap: 1rem;
    justify-items: center;
    text-align: center;
    padding: 0 16px;
  }
</style>
