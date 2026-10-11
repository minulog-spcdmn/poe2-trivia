<script lang="ts">
  // One thing new in a zone, under its name on the title card (ZoneCard.svelte,
  // lib/zoneTitle.ts zoneNews): a small engraved seal holding a find's item, a
  // number or an alchemist's sign (a rule that from here holds on every
  // question gets a third ring, as the harder achievements' seals do), and
  // its label. Its rings draw, then its sign comes in, then its label rises.
  import { onMount } from 'svelte';
  import { ring } from '../../lib/arcane';
  import { EYE, GEMINI, LUNA, LUNA_HATCH, PROJECTION, RETORT, STONE, SUBLIMATION } from '../../lib/alchemy';
  import type { News, NewsSign } from '../../lib/zoneTitle';
  import ItemGlyph from '../ItemGlyph.svelte';
  import type { Ctx } from './family';

  let { news, play, at, still }: { news: News; play: Ctx['play']; at: number; still: boolean } = $props();

  /** Each rule's sign: art flipped (projection), burning in (sublimation), without colour (Luna, shaded), alike by art (the eye) or name (the twins), made up (the retort), finds growing scarce (the stone). */
  const SIGNS: Record<NewsSign, string[]> = {
    mirror: [PROJECTION],
    unveil: [SUBLIMATION],
    gray: [LUNA, LUNA_HATCH],
    looks: [EYE],
    names: [GEMINI],
    fakes: [RETORT],
    scarce: [STONE],
  };
  const GLYPH = { azurite: 'ward', flare: 'flare', dynamite: 'dynamite' } as const;
  const rings = $derived([12.6, 11.4, ...(news.all ? [13.8] : [])].map((r) => ring([0, 0], r)));

  let el: HTMLElement;
  let k = $state(1);
  onMount(() => {
    k = Math.max(0.5, el.querySelector('svg')!.clientWidth / 30);
    if (still) return;
    for (const r of el.querySelectorAll('.ring')) play(r, [{ strokeDashoffset: 100 }, { strokeDashoffset: 0 }], { at, ms: 300, easing: 'cubic-bezier(0.55, 0, 0.25, 1)' });
    play(el.querySelector('.sign')!, [{ opacity: 0, transform: 'scale(1.4)' }, { opacity: 1, transform: 'none' }], { at: at + 300, ms: 300, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    play(el.querySelector('.label')!, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 0.85, transform: 'none' }], { at: at + 420, ms: 250, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
  });
</script>

<span class="mark" bind:this={el} style:--k={k}>
  <span class="seal">
    <svg viewBox="-15 -15 30 30">
      {#each rings as d, i (i)}<path {d} class="ring" class:thin={i === 1} pathLength="100" />{/each}
    </svg>
    <span class="sign">
      {#if 'find' in news.mark}
        <span class="glyph"><ItemGlyph kind={GLYPH[news.mark.find]} /></span>
      {:else if 'count' in news.mark}
        <span class="count">{news.mark.count}</span>
      {:else}
        <svg viewBox="-15 -15 30 30"><g transform="scale(1.45)">{#each SIGNS[news.mark.sign] as d, i (i)}<path {d} class:hatch={i > 0} />{/each}</g></svg>
      {/if}
    </span>
  </span>
  <span class="label">{news.label}</span>
</span>

<style>
  .mark {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
    width: 6.5rem;
  }
  .seal {
    position: relative;
    width: 30px;
    height: 30px;
  }
  svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  path {
    fill: none;
    stroke: var(--ink);
    stroke-width: calc(0.7px / var(--k));
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .ring {
    stroke-dasharray: 100;
    stroke-linecap: butt;
  }
  .thin {
    stroke-width: calc(0.45px / var(--k));
  }
  .sign {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
  }
  .sign path {
    stroke: var(--ink-hi);
    stroke-width: calc(0.55px / var(--k));
  }
  .sign .hatch {
    stroke-width: calc(0.32px / var(--k));
    stroke: var(--ink);
  }
  .glyph {
    --h: 16px;
    display: flex;
  }
  .count {
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 0.82rem;
    line-height: 1;
    color: var(--ink-hi);
    padding-top: 0.06em;
  }
  .label {
    font-family: var(--font-cinzel);
    font-weight: 500;
    font-size: clamp(0.62rem, 0.2vw + 0.58rem, 0.72rem);
    letter-spacing: 0.08em;
    line-height: 1.25;
    text-align: center;
    text-wrap: balance;
    color: color-mix(in srgb, var(--accent) 18%, var(--text));
    opacity: 0.85;
  }
</style>
