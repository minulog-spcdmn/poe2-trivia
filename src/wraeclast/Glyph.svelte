<script lang="ts">
  // A supply's or a tool's mark, engraved in fine lines (currentColor), as
  // the design draws them: the four supplies, gold, an unidentified card,
  // and the line's Clear.
  import type { Supply } from './rules';

  let { of }: { of: Supply | 'gold' | 'unid' | 'clear' } = $props();
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
  {:else if of === 'gold'}
    <circle cx="12" cy="12" r="8.2" />
    <circle cx="12" cy="12" r="5.4" stroke-width="1" />
    <path d="M12 8.6l1 3.4-1 3.4-1-3.4z" fill="currentColor" stroke="none" />
  {:else if of === 'clear'}
    <path d="M9 6h11v12H9l-5.5-6z" />
    <path d="M11.5 9.5l5 5M16.5 9.5l-5 5" />
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
