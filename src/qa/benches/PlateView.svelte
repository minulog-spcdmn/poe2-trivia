<script lang="ts">
  // The name plate bench's view (./plate.ts): the plate at the size the
  // controls pick, its ends fit to its height as a question's are, a
  // unique's name over it. Right and Wrong darken it, then light it, as a
  // question's reveal does: with the glint, or quietly.
  import { onDestroy } from 'svelte';
  import NamePlate from '../../components/NamePlate.svelte';
  import type { PieceProps } from '../bench.ts';
  import { onAction } from '../frame/pieceState.svelte.ts';

  let { v, set, small }: PieceProps = $props();

  let scale = $state<number>();
  let lighting: ReturnType<typeof setTimeout> | undefined;
  onDestroy(() => clearTimeout(lighting));
  const reveal = (glint: boolean) => {
    clearTimeout(lighting);
    set({ lit: false, glint: false });
    lighting = setTimeout(() => set({ lit: true, glint }), 600);
  };
  onAction('right', () => reveal(true));
  onAction('wrong', () => reveal(false));
</script>

<div class="head" class:small style:width={small ? '100%' : `${v.width}px`} style:height="{v.height}px" style:--plate-scale={scale}>
  <NamePlate fit bind:scale lit={!!v.lit} glint={!!v.glint} start={v.seals === 'none' ? 'empty' : 'sol'} end={v.seals === 'both' ? 'luna' : 'empty'} />
  <span class="iname" class:unknown={!v.lit}>{v.lit ? 'Headhunter' : 'Unidentified'}</span>
</div>

<style>
  /* As a question's plate (QuestionView's .head): the name over it, clear of its ends. */
  .head {
    position: relative;
    display: grid;
    place-items: center;
    padding: 0 calc(3.6rem * var(--plate-scale, 1));
  }
  .iname {
    position: relative;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 1.2rem;
    color: var(--unique-hi);
    text-shadow: 0 0 12px rgba(224, 138, 68, 0.4);
  }
  .iname.unknown {
    color: #c8c8c8;
    letter-spacing: 0.1em;
    font-size: 1.05rem;
    text-shadow: none;
  }
</style>
