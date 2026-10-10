<script lang="ts">
  import type { Snippet } from 'svelte';
  import ArcaneCircle from '../ArcaneCircle.svelte';

  // The medallion at the heart of each Codex page's summary, between its four
  // figures: the rune circle round a dark disc and its track, the page's
  // figure inside (the children, styled by the page). `share` (0 to 1) fills
  // an arc along the track; without it there is none (Delve: depth has no end
  // to fill to). It takes its place in the summary's grid, the same on every page.
  let { share, children }: { share?: number; children: Snippet } = $props();
  const uid = $props.id();
</script>

<div class="medallion">
  <ArcaneCircle size="100%" strength={0.3} />
  <svg class="ring" viewBox="-100 -100 200 200" aria-hidden="true">
    {#if share}
      <defs>
        <linearGradient id="{uid}-arc" x1="0" y1="-1" x2="0" y2="1">
          <stop offset="0" stop-color="#fbe6b0" />
          <stop offset="0.5" stop-color="#c9a45c" />
          <stop offset="1" stop-color="#e08a44" />
        </linearGradient>
      </defs>
    {/if}
    <circle class="track" r="80" />
    {#if share}<circle class="arc" r="80" pathLength="100" style:stroke="url(#{uid}-arc)" style:stroke-dasharray="{share * 100} 100" />{/if}
  </svg>
  <div class="medal-text">{@render children()}</div>
</div>

<style>
  .medallion {
    grid-column: 2;
    position: relative;
    isolation: isolate;
    width: 240px;
    height: 240px;
    display: grid;
    place-items: center;
  }
  .medallion :global(.arcane) {
    z-index: -1;
  }
  /* Turned so the arc starts at the top. */
  .ring {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    rotate: -90deg;
    overflow: visible;
  }
  .track {
    fill: rgba(8, 6, 4, 0.75);
    stroke: rgba(125, 99, 51, 0.35);
    stroke-width: 6;
  }
  .arc {
    fill: none;
    stroke-width: 4;
    stroke-linecap: round;
    filter: drop-shadow(0 0 4px rgba(224, 138, 68, 0.8));
    animation: fill-arc 1.6s var(--ease-out) 0.4s both;
  }
  @keyframes fill-arc {
    from {
      stroke-dasharray: 0 100;
    }
  }
  /* Narrow enough to stay inside the disc, a line that wraps (Delve's zone) included. */
  .medal-text {
    position: relative;
    width: 150px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    line-height: 1.1;
  }

  @media (max-width: 900px) {
    .medallion {
      grid-column: 1 / -1;
      grid-row: 1;
      justify-self: center;
    }
  }
  @media (max-width: 560px) {
    .medallion {
      width: 210px;
      height: 210px;
    }
  }
</style>
