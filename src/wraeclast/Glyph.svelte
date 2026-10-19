<script lang="ts">
  // A ware's or a loot card's mark, engraved in one line (currentColor): the
  // supplies, the Vaal Orb, gold, the flask, the jackpot, an unidentified card.
  import type { LootKind, Ware } from './rules';

  let { of }: { of: Ware | LootKind | 'unid' } = $props();
</script>

<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  {#if of === 'flare'}
    <path d="M12 3c1 3 4 4.5 4 8.5a4 4 0 0 1-8 0c0-2 1-3 1.5-4 .3 1.5 1 2 1.8 2.3C11 8 11 5.5 12 3z" />
    <path d="M12 21v-2M5 13H3M21 13h-2M6.5 7.5 5 6M17.5 7.5 19 6" />
  {:else if of === 'wisdom'}
    <path d="M7 4h11a2 2 0 0 1 0 4H7" />
    <path d="M7 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h11a2 2 0 0 1-2-2V8" />
    <path d="M9 12h5M9 15h4" />
  {:else if of === 'strike'}
    <path d="M4 12h16" />
    <path d="M6 8h5M13 8h5M6 16h4M12 16h6" />
    <path d="m15 4-6 16" />
  {:else if of === 'lengths'}
    <path d="M4 17V9M8 17V7M14 17v-5M18 17V9" />
    <path d="M3 20h7M13 20h7" />
  {:else if of === 'first'}
    <rect x="4" y="9" width="7" height="7" rx="1" />
    <path d="M14 12.5h6M14 16h4" />
    <path d="M6 9V7a1.5 1.5 0 0 1 3 0v2" />
  {:else if of === 'decoy'}
    <path d="M5 8h4v4H5zM15 8h4v4h-4zM10 15h4v4h-4z" />
    <path d="m4 20 16-16" />
  {:else if of === 'vaal'}
    <circle cx="12" cy="13" r="6.5" />
    <path d="M12 6.5V3M9.5 3h5" />
    <path d="M9 13c1.5-2 4.5-2 6 0-1.5 2-4.5 2-6 0z" />
    <circle cx="12" cy="13" r="0.8" fill="currentColor" />
  {:else if of === 'gold'}
    <ellipse cx="12" cy="8" rx="6" ry="2.5" />
    <path d="M6 8v4c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V8" />
    <path d="M6 12v4c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-4" />
  {:else if of === 'flask'}
    <path d="M10 3h4M10.5 3v5L6 16a3 3 0 0 0 2.6 4.5h6.8A3 3 0 0 0 18 16l-4.5-8V3" />
    <path d="M8 14h8" />
  {:else if of === 'jackpot'}
    <path d="M4 10h16v9H4z" />
    <path d="M3 7h18v3H3zM12 7v12" />
    <path d="M12 7c-2-3-5-3-5-1s3 1 5 1c2 0 5 1 5-1s-3-2-5 1z" />
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
