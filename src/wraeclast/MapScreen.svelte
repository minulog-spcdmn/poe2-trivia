<script lang="ts">
  // The map: the region's 14 places where the owner placed them (map.ts),
  // the links between them, each place's mark (lit where it can be entered,
  // dimmed once cleared, a plain red ring while corrupted, the lair red).
  // A tap on a place shows its one line and Enter under the plate.
  import { LINKS, REGION, layoutRegion, type PlaceKind } from './map';
  import type { Run } from './rules';
  import { placeLine } from './words';

  let { run }: { run: Run } = $props();
  const s = $derived(run.state);

  let width = $state(0);
  let height = $state(0);
  const L = $derived(width > 0 && height > 0 ? layoutRegion(width, height) : null);

  /** The place tapped, its line shown under the plate. */
  let picked = $state<string | null>(null);
  const place = $derived(picked ? REGION.byId.get(picked)! : null);
  const open = $derived(picked ? run.canEnter(picked) : false);
  /** Why the place picked can't be entered. */
  const shut = $derived(!picked || open ? '' : s.places[picked].kind === 'zone' && s.places[picked].cleared ? 'Cleared' : 'Enter a place next to it first');

  const said = (id: string) => {
    const p = REGION.byId.get(id)!;
    return `${p.name}: ${placeLine(run, id)}${run.corrupted(id) ? ', corrupted' : ''}${run.canEnter(id) ? '' : ', not open'}`;
  };
</script>

{#snippet mark(kind: PlaceKind)}
  <svg class="ic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round" stroke-linecap="round">
    {#if kind === 'zone'}
      <path d="M12 3 20 12 12 21 4 12z" /><path d="M12 7.5 16.5 12 12 16.5 7.5 12z" stroke-width=".9" />
    {:else if kind === 'town'}
      <path d="M4.5 20.5v-9L12 5.5l7.5 6v9M9.6 20.5v-5.4h4.8v5.4M2.8 20.5h18.4" /><path d="M12 2.5v3" stroke-width=".9" />
    {:else if kind === 'lair'}
      <path d="M12 20.5c-4.5-3-8-6.2-8-10a4.2 4.2 0 0 1 8-1.8 4.2 4.2 0 0 1 8 1.8c0 3.8-3.5 7-8 10z" /><path d="M12 8.7v7" stroke-width=".9" />
    {:else}
      <path d="M3 20.2 12 5.2l9 15z" /><path d="M12 12.6l-3 7.6M12 12.6l3 7.6M12 5.2V2.8" stroke-width=".9" />
    {/if}
  </svg>
{/snippet}

<div class="map-screen">
  <h1 class="sr">The map</h1>
  <section class="plate" aria-label="The map" bind:clientWidth={width} bind:clientHeight={height}>
    {#if L}
      <svg class="links" width={width} height={height} aria-hidden="true">
        {#each LINKS as [a, b] (`${a}>${b}`)}
          <line class="lk" class:open={s.places[a].cleared || s.places[b].cleared} x1={L.at[a].x} y1={L.at[a].y} x2={L.at[b].x} y2={L.at[b].y} />
        {/each}
      </svg>
      {#each REGION.places as p (p.id)}
        {@const at = L.at[p.id]}
        {@const lb = L.labels[p.id]}
        <button
          class="node {p.kind}"
          class:lit={run.canEnter(p.id)}
          class:cleared={s.places[p.id].cleared && p.kind === 'zone'}
          class:bad={run.corrupted(p.id)}
          class:here={p.id === s.at}
          class:picked={p.id === picked}
          style:left="{at.x}px"
          style:top="{at.y}px"
          aria-label={said(p.id)}
          aria-pressed={p.id === picked}
          onclick={() => (picked = p.id)}>{@render mark(p.kind)}</button
        >
        <span class="nl" class:lit={run.canEnter(p.id)} style:left="{lb.x}px" style:top="{lb.y}px" style:width="{lb.w}px" aria-hidden="true">{p.name}</span>
      {/each}
    {/if}
  </section>

  <section class="pick" aria-live="polite">
    {#if place && picked}
      <div class="say">
        <h2 class="nm">{place.name}</h2>
        <p class="ln">{placeLine(run, picked)}{#if run.corrupted(picked)}<span class="cor">{' '}• corrupted</span>{/if}</p>
        {#if shut}<p class="why">{shut}</p>{/if}
      </div>
      <button class="btn primary" disabled={!open} onclick={() => run.enter(picked!)}>Enter</button>
    {:else}
      <p class="hint">Tap a place to see it. You can enter any place next to one you've cleared, and the lair at any time.</p>
    {/if}
  </section>
</div>

<style>
  .map-screen {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .plate {
    position: relative;
    height: clamp(400px, calc(100svh - 330px), 640px);
    border: 1px solid var(--line);
    border-radius: 6px;
    background: rgba(8, 6, 5, 0.9) var(--dither);
    image-rendering: pixelated;
    box-shadow:
      inset 0 0 0 3px #080605,
      inset 0 0 0 4px rgba(125, 99, 51, 0.28);
    overflow: hidden;
  }
  .links {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .lk {
    stroke: #3b3024;
    stroke-width: 1;
  }
  .lk.open {
    stroke: rgba(201, 164, 92, 0.55);
    stroke-width: 1.3;
  }
  .ic {
    display: block;
    width: 1em;
    height: 1em;
  }
  .node {
    position: absolute;
    translate: -50% -50%;
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    padding: 0;
    font: inherit;
    font-size: 12px;
    color: #8a7a60;
    background: none;
    border: 0;
    cursor: pointer;
    image-rendering: auto;
  }
  /* A tap target 44 px across. */
  .node::after {
    content: '';
    position: absolute;
    inset: -10px;
    border-radius: 50%;
  }
  .node::before {
    content: '';
    position: absolute;
    inset: 3px;
    rotate: 45deg;
    border: 1px solid currentColor;
    background: #0e0b08;
  }
  .node .ic {
    position: relative;
  }
  .node.camp,
  .node.town,
  .node.lair {
    width: 30px;
    height: 30px;
    font-size: 17px;
  }
  .node.camp::before,
  .node.town::before,
  .node.lair::before {
    rotate: none;
    border-radius: 50%;
    inset: 1px;
  }
  .node.lair {
    color: #e8735a;
  }
  .node.lair::before {
    background: #2a0d08;
  }
  .node.cleared {
    color: var(--gold-lo);
    opacity: 0.6;
  }
  .node.lit {
    color: var(--gold-hi);
  }
  .node.lit::before {
    background: #2a1f12;
    box-shadow:
      0 0 0 3px rgba(241, 217, 155, 0.12),
      0 0 12px rgba(241, 190, 90, 0.4);
  }
  .node.lair.lit {
    color: #ff9c86;
  }
  .node.lair.lit::before {
    background: #3a120b;
    box-shadow: 0 0 12px rgba(224, 85, 63, 0.45);
  }
  /* Corrupted: a plain red ring (the veins come later). */
  .node.bad::before {
    border-color: #d9442e;
    box-shadow: 0 0 0 2px rgba(217, 68, 46, 0.35);
  }
  .node.here::after {
    inset: -5px;
    border: 1.5px solid #d9a066;
  }
  .node.picked::after {
    inset: -6px;
    border: 2px solid var(--gold-hi);
  }
  .nl {
    position: absolute;
    padding: 1px 4px 2px;
    border-radius: 3px;
    background: rgba(8, 6, 5, 0.8);
    font-size: 11px;
    line-height: 12.5px;
    text-align: center;
    color: #8a7f6c;
    pointer-events: none;
    box-sizing: border-box;
    image-rendering: auto;
  }
  .nl.lit {
    color: #f6e7c6;
  }

  .pick {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 64px;
  }
  .say {
    flex: 1;
    min-width: 0;
  }
  .nm {
    margin: 0;
    font-family: var(--font-display);
    font-size: 16px;
    letter-spacing: 0;
    text-transform: none;
    color: #f6e7c6;
  }
  .ln,
  .why,
  .hint {
    margin: 2px 0 0;
    font-size: 14px;
    line-height: 1.25;
    color: #d8ccb6;
  }
  .why,
  .hint {
    color: var(--muted);
  }
  .cor {
    color: #e8735a;
  }
  .pick .btn {
    flex: none;
    min-width: 104px;
  }
</style>
