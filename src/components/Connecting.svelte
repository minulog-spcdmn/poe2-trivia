<script lang="ts">
  // While a room opens or is joined: the rune turning with a small portal
  // swirling on it, what is happening, and a way out. Joining, and opening
  // a room, take a while on some networks: after a few seconds it says it's
  // still going, so no one gives up early.
  import { onMount } from 'svelte';
  import { fade } from '../lib/transitions';
  import { session } from '../lib/session.svelte';
  import { zoomOf } from '../lib/stage';
  import { connecting as portalFx } from '../lib/fx/moments';

  let slow = $state(false);
  onMount(() => {
    const t = setTimeout(() => (slow = true), 6000);
    return () => clearTimeout(t);
  });

  /** Svelte action: a portal swirls on the rune, sized to it on screen (the row is only 40px tall). */
  function portalOn(node: HTMLElement) {
    const h = portalFx(node, 17 * zoomOf(node));
    return { destroy: () => h.stop(0.3) };
  }

  const joining = $derived(session.mode === 'client');

  /** Each saying's width, so the words' box (and Cancel after it) is as wide as the one shown. */
  let firstW = $state(0);
  let slowW = $state(0);
  const shownW = $derived(slow ? slowW : firstW);
</script>

<div class="connecting" role="status" in:fade={{ duration: 200 }}>
  <span class="rune" use:portalOn aria-hidden="true"></span>
  <!-- Both sayings share one cell, its width the shown one's, so Cancel sits where the words end:
       saying it's still going (by itself, so slowly), the first fades out and the new words in where it stood,
       Cancel gliding to the new end (out first when the words grow, after the long words have gone when they shrink). -->
  <span class="what" class:grows={slowW > firstW} style:width={shownW ? `${shownW}px` : undefined}>
    <span class="say" class:on={!slow} aria-hidden={slow} bind:offsetWidth={firstW}>{#if !joining}Opening a portal…{:else}Travelling to <span class="num">{session.code}</span>…{/if}</span>
    <span class="say" class:on={slow} aria-hidden={!slow} bind:offsetWidth={slowW} title={joining ? 'Some networks take a little longer.' : undefined}>{joining ? 'Still on the way…' : 'Still opening the portal…'}</span>
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
    display: inline-grid;
    /* Each saying its own width (measured), not the cell's. */
    justify-items: start;
    transition: width 0.5s var(--ease-out) 0.35s;
    font-family: var(--font-display);
    font-size: 17px;
    color: var(--gold-hi);
    white-space: nowrap;
  }
  .say {
    grid-area: 1 / 1;
    opacity: 0;
    /* The faded one's title (the slow join's) stays out of the way. */
    pointer-events: none;
    transition: opacity 0.4s;
  }
  /* The new words once the old have mostly gone. */
  .say.on {
    opacity: 1;
    pointer-events: auto;
    transition: opacity 0.7s 0.3s;
  }
  .what.grows {
    transition-delay: 0s;
  }
  :global(html[data-still]) :is(.what, .say) {
    transition: none;
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
