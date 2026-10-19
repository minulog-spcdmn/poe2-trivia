<script lang="ts">
  // A supply's, a loot card's or a tool's mark, engraved in fine lines
  // (currentColor), as the design draws them: the eight supplies, gold, the
  // flask, the jackpot, an unidentified card, corruption (a Vaal Orb's
  // swirl), and the line's Clear.
  import type { LootKind, Supply } from './rules';

  let { of }: { of: Supply | LootKind | 'unid' | 'clear' | 'leave' | 'corrupt' } = $props();
</script>

<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
  {#if of === 'flare'}
    <circle cx="12" cy="12" r="2.6" />
    <path d="M12 2.6v5M12 16.4v5M2.6 12h5M16.4 12h5M5.4 5.4l3.3 3.3M15.3 15.3l3.3 3.3M18.6 5.4l-3.3 3.3M8.7 15.3l-3.3 3.3" />
    <path d="M12 6.2 12.6 9M12 17.8l-.6-2.8M6.2 12l2.8.6M17.8 12l-2.8-.6" stroke-width=".8" />
  {:else if of === 'wisdom'}
    <path d="M6.5 4.5h11a2 2 0 0 1 0 4h-11a2 2 0 0 1 0-4z" />
    <path d="M7.5 8.5v9.5a1.5 1.5 0 0 0 1.5 1.5h9.5M16.5 8.5v9M18.5 19.5a1.6 1.6 0 0 0 0-3.2h-2" />
    <path d="M10 11.5h4M10 14h4" stroke-width="1" />
  {:else if of === 'lore'}
    <path d="M12 7c-2.1-1.6-5-2.2-8.5-2v12.6c3.5-.2 6.4.4 8.5 2M12 7c2.1-1.6 5-2.2 8.5-2v12.6c-3.5-.2-6.4.4-8.5 2M12 7v12.6" />
    <path d="M6 9h3.5M6 11.5h3.5M14.5 9H18M14.5 11.5H18" stroke-width=".9" />
  {:else if of === 'category'}
    <path d="M12 3 20 12 12 21 4 12z" />
    <path d="M12 7.5 16.5 12 12 16.5 7.5 12z" stroke-width=".9" />
  {:else if of === 'base'}
    <path d="M12 3.2 19 5.8v5.4c0 4.4-3 7.7-7 9.6-4-1.9-7-5.2-7-9.6V5.8z" />
    <path d="M12 7v10M8.6 10.5h6.8" stroke-width=".9" />
  {:else if of === 'decoy'}
    <path d="M20.5 3.5 12 12" />
    <path d="M12 12c-2.6-.6-5.4.6-6.8 3.2L3.5 20.5l5.3-1.7C11.4 17.4 12.6 14.6 12 12z" />
    <path d="M6 19.2l2.4-3.2M8.6 19l1.9-2.8" stroke-width=".9" />
    <path d="M15 18.5h5.5M17 15.5h3.5" stroke-width=".9" />
  {:else if of === 'lengths'}
    <path d="M3 8h7M13.5 8h7.5M3 12.5h3.5M9.5 12.5h11.5M3 17h9M15 17h6" />
    <circle cx="12" cy="4" r=".9" fill="currentColor" stroke="none" />
  {:else if of === 'first'}
    <rect x="2.5" y="6.5" width="10" height="11" rx="1.2" />
    <path d="M15.5 9.5h6M15.5 14.5h4" stroke-dasharray="1.6 1.8" />
    <path d="M5.5 14.5l2-5 2 5M6.2 12.8h2.6" stroke-width="1.1" />
  {:else if of === 'gold'}
    <circle cx="12" cy="12" r="8.2" />
    <circle cx="12" cy="12" r="5.4" stroke-width="1" />
    <path d="M12 8.6l1 3.4-1 3.4-1-3.4z" fill="currentColor" stroke="none" />
  {:else if of === 'flask'}
    <path d="M9.5 3h5M10.3 3v4.4C7.4 8.5 5.6 11 5.6 14c0 3.8 2.9 6.8 6.4 6.8s6.4-3 6.4-6.8c0-3-1.8-5.5-4.7-6.6V3" />
    <path d="M6.4 13.2c1.9-.9 3.7.9 5.6 0s3.7-.9 5.6 0" stroke-width="1" />
  {:else if of === 'jackpot'}
    <path d="M4 10h16v9H4z" />
    <path d="M3 7h18v3H3zM12 7v12" />
    <path d="M12 7c-2-3-5-3-5-1s3 1 5 1c2 0 5 1 5-1s-3-2-5 1z" />
  {:else if of === 'corrupt'}
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 5.5c2.5 2.3 2.5 4.6 0 6.5s-2.5 4.2 0 6.5M7.5 9.2c1.6.6 3 .6 4.5 0M12 15c1.6-.6 3-.6 4.5 0" stroke-width="1.1" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" />
  {:else if of === 'clear'}
    <path d="M9 6h11v12H9l-5.5-6z" />
    <path d="M11.5 9.5l5 5M16.5 9.5l-5 5" />
  {:else if of === 'leave'}
    <path d="M14 4.5h4.5v15H14M15 12H5.5M9 8.5 5.5 12 9 15.5" />
  {:else}
    <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6" />
    <path d="M12 17.2v.1" />
    <path d="M12 2.5 21.5 12 12 21.5 2.5 12z" />
  {/if}
</svg>

<style>
  svg {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
