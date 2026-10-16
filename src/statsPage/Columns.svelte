<script lang="ts" module>
  export interface Series {
    name: string;
    values: number[];
    /** gold: the series the chart is about; dim: the rest of the stack, for context. */
    tone: 'gold' | 'dim';
  }
</script>

<script lang="ts">
  // Counts per day (or week) as columns, one or two series stacked, the one
  // the chart is about in gold over the other in grey, a 2px gap between
  // them. The newest (today, only partly over) is drawn faint and its note
  // says "so far". A column lifts while it's read (Crosshair), with a note
  // naming each series that day.
  import { axis, compact, fmt, labelled, longDay, shortDay } from './chart';
  import { Crosshair } from './crosshair.svelte';

  let { days, series, height = 150, weekly = false, label }: { days: string[]; series: Series[]; height?: number; weekly?: boolean; label: string } = $props();

  let width = $state(0);
  const PAD = { top: 10, right: 6, bottom: 24, left: 34 };
  const plotW = $derived(Math.max(0, width - PAD.left - PAD.right));
  const plotH = $derived(height - PAD.top - PAD.bottom);
  const totals = $derived(days.map((_, i) => series.reduce((n, s) => n + (s.values[i] ?? 0), 0)));
  const ax = $derived(axis(Math.max(0, ...totals)));
  const y = (v: number) => PAD.top + plotH - (plotH * v) / ax.top;
  const band = $derived(days.length ? plotW / days.length : 0);
  const x = (i: number) => PAD.left + band * (i + 0.5);
  const colW = $derived(Math.max(2, Math.min(24, band - 2)));
  const ticks = $derived(labelled(days.length, plotW));
  const hair = new Crosshair(
    () => days.length,
    (px) => Math.floor((px - PAD.left) / Math.max(1, band)),
  );

  /** A segment of a column: its top end rounded 4px when it's the top of the stack. */
  function segment(i: number, from: number, to: number, roundTop: boolean): string {
    const l = x(i) - colW / 2;
    const r = x(i) + colW / 2;
    const t = y(to);
    const b = y(from);
    if (b - t < 0.5) return '';
    const rad = roundTop ? Math.min(4, colW / 2, b - t) : 0;
    return `M${l} ${b}V${t + rad}${rad ? `Q${l} ${t} ${l + rad} ${t}H${r - rad}Q${r} ${t} ${r} ${t + rad}` : `H${r}`}V${b}Z`;
  }
  const stacks = $derived(
    days.map((_, i) => {
      let base = 0;
      const parts = series.map((s) => {
        const from = base;
        base += s.values[i] ?? 0;
        return { tone: s.tone, from, to: base };
      });
      const topIdx = parts.findLastIndex((p) => p.to > p.from);
      return parts.map((p, k) => ({ ...p, d: segment(i, p.from, p.to, k === topIdx), gapAbove: k < topIdx && p.to > p.from }));
    }),
  );
  const tipLeft = $derived(hair.at === null ? 0 : Math.max(70, Math.min(width - 70, x(hair.at))));
</script>

<div class="chart" bind:clientWidth={width} style:height="{height}px">
  {#if width}
    <!-- An image of the days that can be stepped through with the arrow keys, its note read out (role=status). -->
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
        <line class="grid" x1={PAD.left} x2={PAD.left + plotW} y1={y(t)} y2={y(t)} />
        <text class="tick" x={PAD.left - 6} y={y(t) + 4} text-anchor="end">{compact(t)}</text>
      {/each}
      {#each ticks as i (i)}
        <text class="tick" x={x(i)} y={height - 6} text-anchor="middle">{shortDay(days[i])}</text>
      {/each}
      {#each stacks as parts, i (i)}
        <g class:lit={hair.at === i} class:faded={hair.at !== null && hair.at !== i} class:so-far={i === days.length - 1}>
          {#each parts as p, k (k)}
            {#if p.d}
              <path class="col {p.tone}" d={p.d} />
              {#if p.gapAbove}<line class="gap" x1={x(i) - colW / 2} x2={x(i) + colW / 2} y1={y(p.to)} y2={y(p.to)} />{/if}
            {/if}
          {/each}
        </g>
      {/each}
      <line class="base" x1={PAD.left} x2={PAD.left + plotW} y1={y(0)} y2={y(0)} />
    </svg>
    {#if hair.at !== null}
      <div class="tip" style:left="{tipLeft}px" role="status">
        <div class="when">{longDay(days[hair.at], weekly)}{hair.at === days.length - 1 ? ', so far' : ''}</div>
        {#each [...series].reverse() as s (s.name)}
          <div class="row"><i class="key {s.tone}"></i><b>{fmt(s.values[hair.at] ?? 0)}</b> <span>{s.name}</span></div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .chart {
    position: relative;
    width: 100%;
  }
  svg {
    display: block;
    overflow: visible;
    touch-action: pan-y;
    outline-offset: 4px;
  }
  .grid {
    stroke: var(--grid);
  }
  .base {
    stroke: var(--line);
  }
  .tick {
    font-family: var(--font-cinzel);
    font-size: 10px;
    fill: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .col.gold {
    fill: var(--gold);
  }
  .col.dim {
    fill: var(--dim);
  }
  .gap {
    stroke: var(--plate);
    stroke-width: 2;
  }
  g {
    transition: opacity 0.15s;
  }
  .faded,
  .so-far {
    opacity: 0.55;
  }
  .so-far.faded {
    opacity: 0.35;
  }
  .lit .col.gold {
    fill: var(--gold-hi);
  }
  .tip {
    position: absolute;
    top: -0.4rem;
    translate: -50% -100%;
    z-index: 2;
    min-width: 8.5rem;
    padding: 0.45rem 0.65rem;
    background: #0e0c09;
    border: 1px solid var(--gold-lo);
    border-radius: 4px;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.6);
    pointer-events: none;
    white-space: nowrap;
    font-size: 0.9rem;
  }
  .when {
    margin-bottom: 0.15rem;
    font-family: var(--font-cinzel);
    font-size: 0.7rem;
    letter-spacing: 0.06em;
    color: var(--muted);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    color: var(--muted);
  }
  .row b {
    font-family: var(--font-cinzel);
    color: var(--text);
  }
  .key {
    width: 0.8rem;
    height: 2px;
    border-radius: 1px;
  }
  .key.gold {
    background: var(--gold);
  }
  .key.dim {
    background: var(--dim);
  }
</style>
