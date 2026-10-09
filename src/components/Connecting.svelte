<script lang="ts">
  // While a room opens or is joined: the rune turning with a small portal
  // swirling on it, what is happening, and a way out. Joining takes a while
  // on some networks: after a few seconds it says it's still going, so no one
  // gives up early.
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { session } from '../lib/session.svelte';
  import { connecting as portalFx } from '../lib/fx/moments';

  let slow = $state(false);
  onMount(() => {
    const t = setTimeout(() => (slow = true), 6000);
    return () => clearTimeout(t);
  });

  /** Svelte action: a portal swirls on the rune, sized to it (the row is only 40px tall). */
  function portalOn(node: HTMLElement) {
    const h = portalFx(node, 17);
    return { destroy: () => h.stop(0.3) };
  }

  const joining = $derived(session.mode === 'client');
</script>

<div class="connecting" role="status" in:fade={{ duration: 200 }}>
  <span class="rune" use:portalOn aria-hidden="true"></span>
  <span class="what" title={slow && joining ? 'Some networks take a little longer.' : undefined}>
    {#if !joining}Opening a portal…{:else if slow}Still on the way…{:else}Travelling to <span class="num">{session.code}</span>…{/if}
  </span>
  <button class="btn small ghost" type="button" onclick={() => session.leave()}>Cancel</button>
</div>

<style>
  .connecting {
    display: flex;
    align-items: center;
    gap: 14px;
    min-height: 40px;
  }
  .rune {
    flex: none;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    border: 2px solid rgba(201, 164, 92, 0.15);
    border-top-color: var(--gold);
    border-bottom-color: var(--unique-hi);
    animation: spin 1.1s linear infinite;
    box-shadow: 0 0 16px rgba(201, 164, 92, 0.2);
  }
  .what {
    font-family: var(--font-display);
    font-size: 17px;
    color: var(--gold-hi);
    white-space: nowrap;
  }
  .num {
    font-family: var(--font-cinzel);
    font-size: 15px;
    letter-spacing: 0.08em;
  }
  @keyframes spin {
    to {
      rotate: 360deg;
    }
  }
</style>
