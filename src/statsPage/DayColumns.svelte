<script lang="ts">
  // Columns a day (or a week), each split into two stacked parts: the one
  // looked at in gold at the foot, the other in grey above it, so the
  // column's height is the whole. Pointing (or the arrow keys) reads a
  // column's figures, with `note` saying more about its day.
  import { axis, compact, fmt, labelled, longDay, shortDay } from './chart';
  import { Crosshair } from './crosshair.svelte';
  import { grouped } from './model';

  let {
    days,
    gold,
    grey,
    names,
    weekly,
    label,
    note,
    height = 320,
  }: {
    days: string[];
    gold: number[];
    grey: number[];
    names: { gold: string; grey: string };
    weekly: boolean;
    label: string;
    note?: (day: string) => string;
    height?: number;
  } = $props();

  const g = $derived(grouped(days, gold, weekly ? 7 : 1));
  const r = $derived(grouped(days, grey, weekly ? 7 : 1).values);
  const n = $derived(g.values.length);
  const total = (i: number) => (g.values[i] ?? 0) + (r[i] ?? 0);

  let width = $state(0);
  const PAD = { top: 12, right: 4, bottom: 34, left: 52 };
  const plotW = $derived(Math.max(0, width - PAD.left - PAD.right));
  const plotH = $derived(height - PAD.top - PAD.bottom);
  const ax = $derived(axis(Math.max(0, ...g.values.map((_, i) => total(i))), 4));
  const slot = $derived(n ? plotW / n : 0);
  const barW = $derived(Math.max(1, Math.min(56, slot * 0.72)));
  const x = (i: number) => PAD.left + slot * i + (slot - barW) / 2;
  const h = (v: number) => (plotH * v) / ax.top;
  const y0 = $derived(PAD.top + plotH);
  const ticks = $derived(labelled(n, plotW, 96));
  const hair = new Crosshair(
    () => n,
    (px) => Math.floor((px - PAD.left) / Math.max(1, slot)),
  );
  const tipLeft = $derived(hair.at === null ? 0 : Math.max(130, Math.min(width - 130, x(hair.at) + barW / 2)));
</script>

<div class="legend" aria-hidden="true">
  <span><i class="key gold"></i>{names.gold}</span>
  <span><i class="key grey"></i>{names.grey}</span>
</div>
<div class="chart" bind:clientWidth={width} style:height="{height}px">
  {#if width}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
    <svg
      {@attach hair.attach}
      {width}
      {height}
      role="img"
      tabindex="0"
      aria-label="{label}. Arrow keys step through."
      onpointermove={hair.move}
      onpointerdown={hair.down}
      onpointerleave={hair.leave}
      onkeydown={hair.key}
      onblur={hair.blur}
    >
      {#each ax.ticks as t (t)}
        <line class="grid" class:base={t === 0} x1={PAD.left} x2={PAD.left + plotW} y1={y0 - h(t)} y2={y0 - h(t)} />
        <text class="tick" x={PAD.left - 12} y={y0 - h(t) + 5} text-anchor="end">{compact(t)}</text>
      {/each}
      {#each g.values as v, i (i)}
        <g class:dim={hair.at !== null && hair.at !== i} class:so-far={i === n - 1}>
          <rect class="gold" x={x(i)} y={y0 - h(v)} width={barW} height={h(v)} />
          <rect class="grey" x={x(i)} y={y0 - h(v) - h(r[i] ?? 0)} width={barW} height={h(r[i] ?? 0)} />
        </g>
      {/each}
      {#each ticks as i (i)}
        <text class="tick" x={x(i) + barW / 2} y={height - 6} text-anchor={i === n - 1 && n > 1 ? 'end' : i === 0 && n > 1 ? 'start' : 'middle'}>{shortDay(g.days[i])}</text>
      {/each}
    </svg>
    {#if hair.at !== null}
      <div class="tip" style:left="{tipLeft}px" role="status">
        <div class="when">{longDay(g.days[hair.at], weekly)}{hair.at === n - 1 ? ', so far' : ''}</div>
        {#if note && !weekly}<div class="note">{note(g.days[hair.at])}</div>{/if}
        <div class="row"><i class="key gold"></i><b>{fmt(g.values[hair.at] ?? 0)}</b><span>{names.gold.toLowerCase()}</span></div>
        <div class="row"><i class="key grey"></i><b>{fmt(r[hair.at] ?? 0)}</b><span>{names.grey.toLowerCase()}</span></div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 1.6rem;
    margin-bottom: 1rem;
    font-size: 1.05rem;
  }
  .legend span {
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
  }
  .key {
    display: inline-block;
    width: 1rem;
    height: 1rem;
    border-radius: 2px;
  }
  .key.gold,
  .gold {
    background: var(--a-now);
    fill: var(--a-now);
  }
  .key.grey,
  .grey {
    background: var(--a-before);
    fill: var(--a-before);
  }
  .chart {
    position: relative;
    width: 100%;
  }
  svg {
    display: block;
    overflow: visible;
    touch-action: pan-y;
    outline-offset: 6px;
  }
  .grid {
    stroke: var(--a-rule);
  }
  .grid.base {
    stroke: rgba(163, 152, 131, 0.45);
  }
  .tick {
    font-family: var(--font-data);
    font-size: 15px;
    fill: var(--a-muted);
  }
  g {
    transition: opacity 0.15s;
  }
  g.so-far {
    opacity: 0.55;
  }
  g.dim {
    opacity: 0.4;
  }
  .tip {
    position: absolute;
    top: 0;
    translate: -50% -100%;
    z-index: 3;
    padding: 0.7rem 1rem;
    background: #0e0c09;
    border: 1px solid var(--gold-lo);
    border-radius: 4px;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.6);
    pointer-events: none;
    white-space: nowrap;
    font-size: 1.05rem;
  }
  .when {
    font-weight: 600;
    color: var(--a-ink);
  }
  .note {
    margin-bottom: 0.3rem;
    color: var(--gold-hi);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    color: var(--a-muted);
  }
  .row b {
    min-width: 3ch;
    font-size: 1.2rem;
    font-weight: 650;
    color: var(--a-ink);
  }
  @media (max-width: 600px) {
    .tick {
      font-size: 13px;
    }
  }
</style>
