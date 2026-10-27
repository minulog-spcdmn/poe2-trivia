<script lang="ts">
  // The fullscreen tip's view (./tip.ts): the tip in the game's own notice
  // stack, as the controls set it. Closed or run out, it comes up again a
  // moment later. Side by side (All states) each cell shows the tip's words
  // still: the notice stack is one for the whole page, so four live tips
  // would land in one corner and push each other out.
  import Toasts from '../../components/Toasts.svelte';
  import { untrack } from 'svelte';
  import { showTip, tipText, type TipFor } from '../../lib/fullscreenTip';
  import { toasts } from '../../lib/toasts.svelte';
  import type { PieceProps } from '../bench.ts';

  let { v, small }: PieceProps = $props();

  const tipFor = $derived(String(v.for) as TipFor);
  let shown = $state<number | null>(null);
  const up = $derived(shown !== null && toasts.list.some((t) => t.id === shown));

  // Put up afresh whenever the controls change (and only then: showing reads
  // the notice list it writes, so that's untracked), whatever's up taken down.
  $effect(() => {
    if (small) return;
    const f = tipFor;
    untrack(() => (shown = showTip(f)));
    return () => {
      const s = untrack(() => shown);
      if (s !== null) toasts.dismiss(s);
    };
  });
  $effect(() => {
    if (small || up || shown === null) return;
    const t = setTimeout(() => untrack(() => (shown = showTip(tipFor))), 900);
    return () => clearTimeout(t);
  });
</script>

{#if small}
  <p class="still">{tipText(tipFor)}</p>
{:else}
  <Toasts />
{/if}

<style>
  /* The words on the notice's own stone, at a cell's size. */
  .still {
    margin: 0;
    padding: 0.5rem 0.65rem;
    background: linear-gradient(180deg, rgba(36, 29, 21, 0.97), rgba(15, 12, 9, 0.98));
    border: 1px solid var(--line);
    border-radius: 4px;
    color: var(--text);
    font-size: 0.95rem;
  }
</style>
