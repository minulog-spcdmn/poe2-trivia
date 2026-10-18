<script lang="ts">
  // The avatar bench's view (./avatar.ts): the token as the controls set it,
  // with the name beside it as the lobby and the scoreboard set it.
  import Avatar from '../../components/Avatar.svelte';
  import type { PieceProps } from '../bench.ts';
  import { onAction } from '../frame/pieceState.svelte.ts';

  let { v, set }: PieceProps = $props();
  onAction('turn', () => set({ wrong: !v.wrong }));
</script>

<div class="row">
  <Avatar name={String(v.name)} hue={Number(v.hue)} size={Number(v.size)} dim={!!v.dim} wrong={!!v.wrong} />
  {#if v.named}<span class="name" class:dim={v.dim}>{v.name || 'Exile'}</span>{/if}
</div>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .name {
    color: var(--text);
    font-size: 1.05rem;
  }
  .name.dim {
    color: var(--muted);
  }
</style>
