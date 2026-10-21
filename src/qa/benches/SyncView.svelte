<script lang="ts">
  // The sync bench's view (./sync.ts): the pairing dialog, opened afresh at
  // the view picked, over the link's state as the controls set it (the
  // frame never syncs, so the state is all there is). Closed, it opens again.
  import SyncDialog from '../../components/SyncDialog.svelte';
  import type { PieceProps } from '../bench.ts';
  import { sync, type SyncStatus } from '../../lib/sync/link.svelte.ts';

  let { v }: PieceProps = $props();

  /** A code to show, the same every time so a shot of it is too. */
  const CODE = 'K7QXM2PA9FHE3TDW';

  $effect.pre(() => {
    sync.code = CODE;
    sync.met = v.status === 'linked';
    sync.status = v.status as SyncStatus;
    sync.linked = v.status === 'linked' ? Number(v.linked) : 0;
  });
  let opened = $state(0);
  const view = $derived(String(v.view));
</script>

{#key `${view}:${opened}`}
  <SyncDialog offered={view === 'offered' ? CODE : null} start={view === 'offered' ? undefined : (view as 'show' | 'type' | 'scan' | 'joined')} onclose={() => opened++} />
{/key}
