<script lang="ts">
  // The player auras try-out's view (./auras.ts): one aura on an avatar at
  // 32 px and at the size set, or every aura so. Its player has a moment as
  // the panel's buttons are pressed (what lib/fx/moments.ts tells the aura in
  // a game). (In the game's own screens, any scene's Auras.)
  import Avatar from '../../components/Avatar.svelte';
  import type { PieceProps } from '../bench.ts';
  import type { PlayerClass } from '../../lib/classSigils.ts';
  import { WORN, AURA_NAMES, type AuraKind } from '../../lib/auraKinds.ts';
  import { RUBY } from '../../lib/palette.ts';
  import { auraFeels } from '../../lib/fx/playerAura.ts';
  import type { AuraEvent } from '../../lib/fx/auras/common.ts';
  import { onAction } from '../frame/pieceState.svelte.ts';

  let { v }: PieceProps = $props();
  const sigil = $derived((v.sigil || undefined) as PlayerClass | undefined);
  let shown: HTMLElement | undefined = $state();

  // A score grows the streak until a point is lost; lives run 2, 1, 0, then start again.
  let streak = 0;
  let lives = 3;
  const feel = (e: AuraEvent) => {
    for (const a of shown?.querySelectorAll('.avatar') ?? []) auraFeels(a, e);
  };
  onAction('score', () => feel({ kind: 'score', streak: ++streak }));
  onAction('miss', () => ((streak = 0), feel({ kind: 'miss' })));
  onAction('hurt', () => {
    streak = 0;
    lives = lives > 0 ? lives - 1 : 2;
    feel({ kind: 'hurt', left: lives });
  });
  for (const kind of ['vote', 'arrive', 'win', 'touch'] as const) onAction(kind, () => feel({ kind }));
</script>

<div class="shown" bind:this={shown}>
  {#if v.show === 'every'}
    <div class="grid">
      {#each WORN as a, i (a)}
        <span class="says"><b>{AURA_NAMES[a].name}</b>{AURA_NAMES[a].about}</span>
        <span class="cell"><Avatar name="Kalguur" hue={(Number(v.hue) + i) % RUBY} size={32} {sigil} aura={a} /></span>
        <span class="cell"><Avatar name="Kalguur" hue={(Number(v.hue) + i) % RUBY} size={Number(v.size)} {sigil} aura={a} /></span>
      {/each}
    </div>
  {:else}
    {@const a = v.aura as AuraKind}
    <div class="one">
      <span class="says"><b>{AURA_NAMES[a].name}</b>{AURA_NAMES[a].about}</span>
      <div class="pair">
        <Avatar name="Kalguur" hue={Number(v.hue)} size={32} {sigil} aura={a} />
        <Avatar name="Kalguur" hue={Number(v.hue)} size={Number(v.size)} {sigil} aura={a} />
      </div>
    </div>
  {/if}
</div>

<style>
  .grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 90px auto;
    align-items: center;
    gap: 2.6rem 2rem;
    max-width: 680px;
  }
  .cell {
    display: flex;
    justify-content: center;
  }
  .says {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    color: var(--muted);
    font-size: 0.85rem;
  }
  .says b {
    color: var(--text);
    font-weight: normal;
    font-family: var(--font-display);
    font-size: 1rem;
  }
  .one {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3rem;
    padding: 2rem 3rem 5rem;
  }
  .pair {
    display: flex;
    align-items: center;
    gap: 6rem;
  }
</style>
