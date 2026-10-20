<script lang="ts">
  // The avatar bench's view (./avatar.ts): the token as the controls set it,
  // with the name beside it as the lobby and the scoreboard set it; or every
  // class's sigil at once, each in the next colour.
  import Avatar from '../../components/Avatar.svelte';
  import type { PieceProps } from '../bench.ts';
  import { CLASSES, className, type PlayerClass } from '../../lib/classSigils.ts';
  import { PALETTE } from '../../lib/palette.ts';
  import { onAction } from '../frame/pieceState.svelte.ts';

  let { v, set }: PieceProps = $props();
  onAction('turn', () => set({ wrong: !v.wrong }));
</script>

{#if v.every}
  <div class="every">
    {#each CLASSES as c, i (c)}
      <figure>
        <Avatar name={c} hue={(Number(v.hue) + i) % PALETTE.length} size={Number(v.size)} dim={!!v.dim} sigil={c} />
        <figcaption>{className(c)}</figcaption>
      </figure>
    {/each}
  </div>
{:else}
  <div class="row">
    <Avatar
      name={String(v.name)}
      hue={Number(v.hue)}
      size={Number(v.size)}
      dim={!!v.dim}
      wrong={!!v.wrong}
      sigil={(v.sigil || undefined) as PlayerClass | undefined}
    />
    {#if v.named}<span class="name" class:dim={v.dim}>{v.name || 'Exile'}</span>{/if}
  </div>
{/if}

<style>
  .every {
    display: grid;
    grid-template-columns: repeat(4, auto);
    gap: 1rem 1.4rem;
  }
  figure {
    margin: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
  }
  figcaption {
    color: var(--muted);
    font-size: 0.85rem;
  }
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
