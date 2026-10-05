<script lang="ts">
  import { fly } from 'svelte/transition';
  import { shareText } from '../../lib/delveShare';

  // The end screen's share button (GameOver.svelte): three linked seals, a
  // tick and "Copied" once the dare is on the clipboard; on a phone, the
  // system's share sheet.
  let { depth }: { depth: number } = $props();

  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let shared = $state(false);
  async function share() {
    const text = shareText(depth);
    try {
      if (matchMedia('(pointer: coarse)').matches && navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        shared = true;
        setTimeout(() => (shared = false), 2000);
      }
    } catch {
      /* dismissed */
    }
  }
</script>

<span class="share">
  <button class="btn ghost" onclick={share} aria-label="Share your best, depth {depth}" title="Share your best">
    {#if shared}
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
    {:else}
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="18" cy="5.5" r="2.6" /><circle cx="6" cy="12" r="2.6" /><circle cx="18" cy="18.5" r="2.6" />
        <path d="M8.3 10.8l7.4-4M8.3 13.2l7.4 4" />
      </svg>
    {/if}
  </button>
  {#if shared}<span class="copied" role="status" transition:fly={{ y: 4, duration: still ? 0 : 200 }}>Copied</span>{/if}
</span>

<style>
  .share {
    position: relative;
    display: inline-flex;
  }
  .share .btn {
    padding: 0.7em;
  }
  .share svg {
    width: 1.45em;
    height: 1.45em;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .copied {
    position: absolute;
    left: 50%;
    bottom: calc(100% + 0.45rem);
    translate: -50% 0;
    padding: 0.2em 0.6em;
    font-family: var(--font-display);
    font-size: 0.68rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    white-space: nowrap;
    color: var(--gold-hi);
    background: rgba(13, 10, 7, 0.9);
    border: 1px solid var(--gold-lo);
    border-radius: 3px;
    pointer-events: none;
  }
</style>
