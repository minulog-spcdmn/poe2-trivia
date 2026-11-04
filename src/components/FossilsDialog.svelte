<script lang="ts">
  // The fossil set over the end screen (GameOver's fossil line opens it): the
  // codex's own set (codex/DelveFossils, embedded: no frame or heading of its
  // own), read only. In a room the codex can't open (App.svelte: it would be
  // a cheat sheet), but the set shows no item's knowledge, so it can.
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { dialogBackdrop } from '../lib/behindDialog';
  import { dialogIn, dialogOut } from '../lib/dialogIn';
  import type { FossilStore } from '../lib/fossilStore';
  import DelveFossils from './codex/DelveFossils.svelte';

  let { store, onclose }: { store: FossilStore; onclose: () => void } = $props();

  let box = $state<HTMLElement>();
  onMount(() => box?.focus());

  /** Escape closes; Tab keeps cycling through the dialog's own buttons. */
  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onclose();
      return;
    }
    if (e.key !== 'Tab' || !box) return;
    const items = [...box.querySelectorAll<HTMLElement>('button:not(:disabled)')];
    const first = items[0];
    const last = items.at(-1)!;
    const at = document.activeElement;
    if (e.shiftKey && (at === first || at === box)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && at === last) {
      e.preventDefault();
      first.focus();
    }
  }
</script>

<div class="backdrop" use:dialogBackdrop transition:fade={{ duration: 150 }} onclick={onclose} role="presentation">
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="set panel"
    bind:this={box}
    in:dialogIn
    out:dialogOut
    onclick={(e) => e.stopPropagation()}
    {onkeydown}
    role="dialog"
    aria-modal="true"
    aria-labelledby="fossils-title"
    tabindex="-1"
  >
    <header>
      <h3 id="fossils-title">Fossils</h3>
      <button class="close" onclick={onclose} aria-label="Close" title="Close">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
      </button>
    </header>
    <DelveFossils {store} embedded />
  </div>
</div>

<style>
  /* The page behind scrolls the dialog on a short screen (a phone on its side), so it never shows a scrollbar of its own. */
  .backdrop {
    position: fixed;
    inset: 0;
    /* Below the effects layer, like the leave dialog (App.svelte). */
    z-index: 94;
    display: grid;
    padding: max(0.75rem, env(safe-area-inset-top)) max(0.75rem, env(safe-area-inset-right)) max(0.75rem, env(safe-area-inset-bottom))
      max(0.75rem, env(safe-area-inset-left));
    overflow-y: auto;
    scrollbar-width: none;
  }
  .backdrop::-webkit-scrollbar {
    display: none;
  }
  /* As wide as the set (DelveFossils) needs: its packing at full size, the rare ones beside it. */
  .set {
    margin: auto;
    width: min(36rem, 100%);
    padding: 1rem 1.4rem 1.4rem;
    outline: none;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.6rem;
  }
  h3 {
    margin: 0;
    color: var(--gold-hi);
    font-size: 1.2rem;
  }
  .close {
    flex: none;
    width: 32px;
    height: 32px;
    margin-right: -0.5rem;
    display: grid;
    place-items: center;
    padding: 0;
    background: none;
    border: 0;
    border-radius: 50%;
    cursor: pointer;
    color: var(--muted);
    transition: color 0.2s;
  }
  .close:hover {
    color: var(--gold-hi);
  }
  .close svg {
    width: 12px;
    height: 12px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
  }
  @media (max-width: 520px), (max-height: 420px) {
    .set {
      padding: 0.7rem 0.9rem 1rem;
    }
  }
</style>
