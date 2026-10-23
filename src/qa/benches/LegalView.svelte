<script lang="ts">
  // The privacy sheet's view (./legal.ts): the sheet over a bare page, opened
  // as the control says. Sent back to the game while it's meant to be open,
  // it rises again a moment later.
  import LegalSheet from '../../components/LegalSheet.svelte';
  import { legalSheet } from '../../lib/legalSheet.svelte';
  import { PRIVACY_URL } from '../../lib/site';
  import type { PieceProps } from '../bench.ts';

  let { v }: PieceProps = $props();

  const open = $derived(v.open === true);
  $effect(() => {
    if (!open) return void (legalSheet.url = null);
    if (legalSheet.url) return;
    const t = setTimeout(() => (legalSheet.url = new URL(PRIVACY_URL, location.href).href), 900);
    return () => clearTimeout(t);
  });
</script>

<LegalSheet />
