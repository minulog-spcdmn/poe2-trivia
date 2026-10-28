<script lang="ts">
  // The descent bench's view (./descent.ts): Delve's rules block in a rules
  // card as the lobby lays it out, at each width the controls ask for. Walk
  // down moves the deepest a depth on every 180 ms until it's pressed again.
  import { onDestroy, untrack } from 'svelte';
  import DelveRules from '../../components/DelveRules.svelte';
  import { FINDS_IN_ORDER, shownDepth } from '../../lib/delve';
  import type { PieceProps } from '../bench.ts';
  import { onAction } from '../frame/pieceState.svelte.ts';

  let { v, set, small }: PieceProps = $props();

  /** The rules card's content width at each size, as the lobby lays it out (measured at 375, 820 and 1440 px wide windows). */
  const WIDTHS = [
    { key: 'phone', name: 'Phone', px: 281 },
    { key: 'tablet', name: 'Tablet', px: 383 },
    { key: 'desktop', name: 'Desktop', px: 483 },
  ];
  /** Where Walk down turns back to the top. */
  const MAX = 300;

  // The records keep depths as they are; 0 is none.
  const deepest = $derived(Number(v.best) > 0 ? Number(v.best) : null);
  const last = $derived(Number(v.last) > 0 ? Number(v.last) : null);
  /** The deepest of any run, as the lobby passes it: these and the other kind's. */
  const seen = $derived(Math.max(Number(v.best), Number(v.other ?? 0)) || null);
  const met = $derived(FINDS_IN_ORDER.map((f) => f.kind).filter((k) => v[`met.${k}`]));
  let room = $state(1200);
  /** The cards that fit the frame (a card with its padding, and the frame's own): All three in a narrow frame leaves out what would run off its side. */
  const fits = $derived(WIDTHS.filter((w) => w.px + 45 + 32 <= room));
  // Side by side, the phone's card alone: three each would crowd them out.
  const shown = $derived(v.width === 'all' ? (small || !fits.length ? WIDTHS.slice(0, 1) : fits) : WIDTHS.filter((w) => w.key === v.width));
  const left = $derived(v.width === 'all' && !small ? WIDTHS.filter((w) => !shown.includes(w)) : []);

  // The ouroboros drawn one way to compare (DelveLadder reads it off html[data-ouro]); unset, it follows the state.
  $effect(() => {
    if (v.ouro) document.documentElement.dataset.ouro = String(v.ouro);
    else delete document.documentElement.dataset.ouro;
  });
  onDestroy(() => delete document.documentElement.dataset.ouro);

  let walking: ReturnType<typeof setInterval> | null = null;
  /** The depth the walk set last: the deepest at anything else was moved from outside (the panel, a state), which stops it. */
  let mine: number | null = null;
  function stop() {
    if (walking) clearInterval(walking);
    walking = null;
    mine = null;
  }
  $effect(() => {
    const d = Number(v.best);
    untrack(() => walking && d !== mine && stop());
  });
  const step = (d: number) => {
    mine = d;
    set({ best: d });
  };
  onAction('walk', () => {
    if (walking) return stop();
    step(Number(v.best) >= MAX ? 0 : Number(v.best));
    walking = setInterval(() => {
      const d = Math.min(MAX, Number(v.best) + 1);
      step(d);
      if (d >= MAX) stop();
    }, 180);
  });
  onDestroy(stop);
</script>

<svelte:window bind:innerWidth={room} />

<div class="cards" class:small>
  {#each shown as w (w.key)}
    <div class="card-wrap">
      {#if !small}<span class="size">{w.name}, card {w.px} px</span>{/if}
      <div class="panel card">
        <div style:width="{w.px}px">
          <DelveRules {deepest} {last} {seen} together={!!v.together} {met} />
        </div>
      </div>
    </div>
  {/each}
</div>
{#if !small}
  <p class="hint">
    {#if left.length}{left.map((w) => w.name).join(' and ')}: too wide for this size; Card width shows {left.length > 1 ? 'them' : 'it'} alone.<br />{/if}
    Deepest {deepest === null ? 'none yet' : `shown as ${shownDepth(deepest)}`}; last run {last === null ? 'none' : `shown as ${shownDepth(last)}`}
  </p>
{/if}

<style>
  .cards {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: flex-start;
    gap: 1.5rem;
  }
  .size {
    display: block;
    margin-bottom: 0.3rem;
    color: var(--muted);
    font-size: 0.85rem;
  }
  .card {
    padding: 1.4rem;
  }
  .small .card {
    padding: 0.8rem;
  }
  .hint {
    margin: 1.5rem 0 0;
    text-align: center;
    color: var(--muted);
    font-style: italic;
  }
</style>
