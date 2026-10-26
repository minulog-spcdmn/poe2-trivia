<script lang="ts">
  // The fullscreen tip's view (./tip.ts): the tip in the game's own notice
  // stack, as the controls set it. Closed or run out, it comes up again a
  // moment later.
  import Toasts from '../../components/Toasts.svelte';
  import { untrack } from 'svelte';
  import { showTip, type TipFor } from '../../lib/fullscreenTip';
  import { toasts } from '../../lib/toasts.svelte';
  import type { PieceProps } from '../bench.ts';

  let { v }: PieceProps = $props();

  const tipFor = $derived(String(v.for) as TipFor);
  const progress = $derived(v.progress === true);
  let shown = $state<number | null>(null);
  const up = $derived(shown !== null && toasts.list.some((t) => t.id === shown));

  // Put up afresh whenever the controls change (and only then: showing reads
  // the notice list it writes, so that's untracked), whatever's up taken down.
  $effect(() => {
    const f = tipFor;
    const p = progress;
    untrack(() => (shown = showTip(f, p)));
    return () => {
      const s = untrack(() => shown);
      if (s !== null) toasts.dismiss(s);
    };
  });
  $effect(() => {
    if (up || shown === null) return;
    const t = setTimeout(() => untrack(() => (shown = showTip(tipFor, progress))), 900);
    return () => clearTimeout(t);
  });
</script>

<Toasts />
