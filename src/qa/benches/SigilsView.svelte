<script lang="ts">
  // The class sigils bench's view (./sigils.ts): the picker over the sigils
  // as the controls set them, stored in the frame's own storage first.
  import SigilPicker from '../../components/SigilPicker.svelte';
  import type { PieceProps } from '../bench.ts';
  import { CLASSES } from '../../lib/classSigils.ts';
  import { serializeSigils } from '../../lib/sigils.ts';
  import { writeStored } from '../../lib/storage.ts';

  let { v }: PieceProps = $props();
  const set = $derived.by(() => {
    const unlocked = CLASSES.slice(0, Number(v.unlocked));
    writeStored('sigils', serializeSigils({ unlocked, worn: v.worn ? (unlocked.at(-1) ?? null) : null }));
    return `${v.unlocked}:${v.worn}`;
  });
</script>

<div class="page">
  {#key set}<SigilPicker achievements={Number(v.achievements)} />{/key}
</div>

<style>
  .page {
    width: min(760px, 100%);
  }
</style>
