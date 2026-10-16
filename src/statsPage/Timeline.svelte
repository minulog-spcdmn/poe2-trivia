<script lang="ts" module>
  export interface Metric {
    key: string;
    name: string;
    /** Per day, this period and the one before (as many days, oldest first). */
    now: number[];
    before: number[];
  }
</script>

<script lang="ts">
  // The ledger's lead: a few figures set large, each with its change against
  // the days before, and the one picked drawn under them, this period in gold
  // over a faint wash and the period before as a grey ghost on the same axis.
  // Over 90 days the points are weeks. A hairline follows the pointer (a
  // finger dragged, the arrow keys) and a note reads out both periods there.
  import { change, grouped } from './model';
  import { niceStep } from './TimeChart.svelte';

  let { days, metrics, height = 220 }: { days: string[]; metrics: Metric[]; height?: number } = $props();

  let picked = $state(0);
  const m = $derived(metrics[Math.min(picked, metrics.length - 1)]);
  const weekly = $derived(days.length > 90);
  const now = $derived(grouped(days, m.now, weekly ? 7 : 1));
  const before = $derived(grouped(days, m.before, weekly ? 7 : 1).values);
  const n = $derived(now.values.length);

  let width = $state(0);
  let at = $state<number | null>(null);
  let pinned = $state(false);
  const PAD = { top: 12, right: 8, bottom: 24, left: 36 };
  const plotW = $derived(Math.max(0, width - PAD.left - PAD.right));
  const plotH = $derived(height - PAD.top - PAD.bottom);
  const peak = $derived(Math.max(0, ...now.values, ...before));
  const step = $derived(niceStep(peak, 4));
  const top = $derived(Math.max(step, Math.ceil(peak / step) * step));
  const ticks = $derived(Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step));
  const x = (i: number) => PAD.left + (n > 1 ? (plotW * i) / (n - 1) : plotW / 2);
  const y = (v: number) => PAD.top + plotH - (plotH * v) / top;
  const path = (vs: number[]) => vs.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('');
  const line = $derived(path(now.values));
  const ghost = $derived(path(before));
  const wash = $derived(n ? `${line}L${x(n - 1).toFixed(1)} ${y(0)}L${x(0).toFixed(1)} ${y(0)}Z` : '');

  const short = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const long = (d: string) =>
    (weekly ? 'Week of ' : '') + new Date(`${d}T12:00:00Z`).toLocaleDateString('en', { weekday: weekly ? undefined : 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const labelled = $derived.by(() => {
    if (!n || !plotW) return [];
    const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(plotW / 70))));
    const out: number[] = [];
    for (let i = n - 1; i >= 0; i -= every) out.unshift(i);
    return out;
  });
  const fmt = (v: number) => v.toLocaleString('en');
  const compact = (v: number) => (v >= 1000 ? new Intl.NumberFormat('en', { notation: 'compact' }).format(v) : String(v));
  const sum = (vs: number[]) => vs.reduce((a, b) => a + b, 0);

  let svg = $state<SVGSVGElement>();
  const nearest = (clientX: number) =>
    !svg || !n ? null : Math.max(0, Math.min(n - 1, Math.round(((clientX - svg.getBoundingClientRect().left - PAD.left) / Math.max(1, plotW)) * (n - 1))));
  function key(e: KeyboardEvent) {
    if (e.key === 'Escape') at = null;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const d = e.key === 'ArrowRight' ? 1 : -1;
    at = Math.max(0, Math.min(n - 1, (at ?? (d > 0 ? -1 : n)) + d));
  }
  const tipLeft = $derived(at === null ? 0 : Math.max(80, Math.min(width - 80, x(at))));
</script>

<svelte:window
  onpointerdown={(e) => {
    if (pinned && svg && !svg.contains(e.target as Node)) {
      pinned = false;
      at = null;
    }
  }}
/>

<div class="figures" role="tablist" aria-label="Drawn below">
  {#each metrics as f, i (f.key)}
    {@const total = sum(f.now)}
    {@const delta = change(total, sum(f.before))}
    <button type="button" role="tab" aria-selected={i === picked} class="figure" onclick={() => (picked = i)}>
      <span class="name">{f.name}</span>
      <span class="big">{fmt(total)}</span>
      <span class="delta" class:up={delta !== null && delta > 0} class:down={delta !== null && delta < 0}>
        {delta === null ? 'new' : `${delta > 0 ? '+' : ''}${delta}%`}
      </span>
    </button>
  {/each}
</div>

<div class="chart" bind:clientWidth={width} style:height="{height}px">
  {#if width}
    <!-- An image of the days that can be stepped through with the arrow keys, its note read out (role=status). -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
    <svg
      bind:this={svg}
      {width}
      {height}
      role="img"
      tabindex="0"
      aria-label="{m.name} per {weekly ? 'week' : 'day'}, this period against the one before. Arrow keys step through."
      onpointermove={(e) => {
        if (e.pointerType === 'mouse' || pinned) at = nearest(e.clientX);
      }}
      onpointerdown={(e) => {
        if (e.pointerType === 'mouse') return;
        pinned = true;
        at = nearest(e.clientX);
      }}
      onpointerleave={(e) => {
        if (e.pointerType === 'mouse') at = null;
      }}
      onkeydown={key}
      onblur={() => {
        if (!pinned) at = null;
      }}
    >
      {#each ticks as t (t)}
        <line class="grid" x1={PAD.left} x2={PAD.left + plotW} y1={y(t)} y2={y(t)} />
        <text class="tick" x={PAD.left - 8} y={y(t) + 4} text-anchor="end">{compact(t)}</text>
      {/each}
      {#each labelled as i (i)}
        <text class="tick" x={x(i)} y={height - 6} text-anchor={i === n - 1 ? 'end' : i === 0 ? 'start' : 'middle'}>{short(now.days[i])}</text>
      {/each}
      <path class="ghost" d={ghost} />
      <path class="wash" d={wash} />
      <path class="line" d={line} />
      {#if at !== null}
        <line class="cross" x1={x(at)} x2={x(at)} y1={PAD.top} y2={PAD.top + plotH} />
        <circle class="ghost-dot" cx={x(at)} cy={y(before[at] ?? 0)} r="3.5" />
        <circle class="dot" cx={x(at)} cy={y(now.values[at] ?? 0)} r="4.5" />
      {/if}
    </svg>
    {#if at !== null}
      <div class="tip" style:left="{tipLeft}px" role="status">
        <div class="when">{long(now.days[at])}</div>
        <div class="row"><i class="key now"></i><b>{fmt(now.values[at] ?? 0)}</b></div>
        <div class="row was"><i class="key before"></i>{fmt(before[at] ?? 0)} the period before</div>
      </div>
    {/if}
  {/if}
</div>
<div class="legend" aria-hidden="true">
  <span><i class="key now"></i>{m.name}, {weekly ? 'by week' : 'by day'}</span>
  <span><i class="key before"></i>The {days.length} days before</span>
</div>

<style>
  .figures {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    margin-bottom: 1.6rem;
    border-bottom: 1px solid var(--line);
  }
  .figure {
    position: relative;
    display: grid;
    justify-items: start;
    gap: 0.15rem;
    padding: 0 1.2rem 1.1rem;
    text-align: left;
    background: none;
    border: 0;
    border-left: 1px solid var(--line);
    cursor: pointer;
  }
  .figure:first-child {
    padding-left: 0;
    border-left: 0;
  }
  /* The figure drawn below: a gold rule along its foot. */
  .figure::after {
    content: '';
    position: absolute;
    left: 1.2rem;
    right: 1.2rem;
    bottom: -1px;
    height: 2px;
    background: var(--gold);
    scale: 0 1;
    transform-origin: left;
    transition: scale 0.3s var(--ease-out);
  }
  .figure:first-child::after {
    left: 0;
  }
  .figure[aria-selected='true']::after {
    scale: 1 1;
  }
  .figure[aria-selected='true'] {
    cursor: default;
  }
  .name {
    font-family: var(--font-cinzel);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
    transition: color 0.2s;
  }
  .figure:hover .name,
  .figure[aria-selected='true'] .name {
    color: var(--gold-hi);
  }
  .big {
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: clamp(2rem, 7vw, 3.6rem);
    line-height: 1.05;
    color: var(--text);
  }
  .figure[aria-selected='true'] .big {
    color: var(--gold-hi);
  }
  .delta {
    font-family: var(--font-cinzel);
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--muted);
  }
  .up {
    color: var(--gold);
  }
  .down {
    color: #e88a73;
  }
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
  .tick {
    font-family: var(--font-cinzel);
    font-size: 10px;
    fill: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .line {
    fill: none;
    stroke: var(--gold);
    stroke-width: 2;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  .wash {
    fill: var(--gold);
    opacity: 0.1;
  }
  .ghost {
    fill: none;
    stroke: var(--ghost);
    stroke-width: 1.5;
    stroke-linejoin: round;
  }
  .cross {
    stroke: var(--gold-hi);
    opacity: 0.5;
  }
  .dot {
    fill: var(--gold-hi);
    stroke: var(--plate);
    stroke-width: 2;
  }
  .ghost-dot {
    fill: var(--ghost);
    stroke: var(--plate);
    stroke-width: 2;
  }
  .tip {
    position: absolute;
    top: 0;
    translate: -50% -100%;
    z-index: 2;
    padding: 0.45rem 0.7rem;
    background: #0e0c09;
    border: 1px solid var(--gold-lo);
    border-radius: 4px;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.6);
    pointer-events: none;
    white-space: nowrap;
    font-size: 0.88rem;
  }
  .when {
    font-family: var(--font-cinzel);
    font-size: 0.7rem;
    color: var(--muted);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }
  .row b {
    font-family: var(--font-cinzel);
    font-size: 1.05rem;
  }
  .was {
    color: var(--muted);
  }
  .key {
    display: inline-block;
    width: 0.9rem;
    height: 2px;
    border-radius: 1px;
  }
  .key.now {
    background: var(--gold);
  }
  .key.before {
    background: var(--ghost);
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem 1.4rem;
    margin-top: 0.6rem;
    font-size: 0.85rem;
    color: var(--muted);
  }
  .legend span {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
  }
  @media (prefers-reduced-motion: reduce) {
    .figure::after {
      transition: none;
    }
  }
  @media (max-width: 520px) {
    .figure {
      padding: 0 0.6rem 0.8rem;
    }
    .figure::after {
      left: 0.6rem;
      right: 0.6rem;
    }
    .name {
      font-size: 0.6rem;
      letter-spacing: 0.08em;
    }
  }
</style>
