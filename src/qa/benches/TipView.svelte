<script lang="ts">
  // The fullscreen tip's view (./tip.ts): the tip in the game's own notice
  // stack, as the controls set it. Closed or run out, it comes up again a
  // moment later.
  import Toasts from '../../components/Toasts.svelte';
  import { showTip, type TipFor } from '../../lib/fullscreenTip';
  import { toasts } from '../../lib/toasts.svelte';
  import type { PieceProps } from '../bench.ts';

  let { v }: PieceProps = $props();

  const tipFor = $derived(String(v.for) as TipFor);
  const progress = $derived(v.progress === true);
  let shown = $state<number | null>(null);
  const up = $derived(shown !== null && toasts.list.some((t) => t.id === shown));

  // Put up afresh whenever the controls change, the one before taken down.
  $effect(() => {
    const id = showTip(tipFor, progress);
    shown = id;
    return () => toasts.dismiss(id);
  });
  $effect(() => {
    if (up || shown === null) return;
    const t = setTimeout(() => (shown = showTip(tipFor, progress)), 900);
    return () => clearTimeout(t);
  });
</script>

<Toasts />
