<script lang="ts" module>
  export interface DayRows {
    days: string[];
    visitors: number[];
    games: number[];
    answers: number[];
    named: number[];
  }
  export type MetricKey = 'visitors' | 'games' | 'answers';
  export const METRIC_NAMES: Record<MetricKey, string> = { visitors: 'Visitors', games: 'Games', answers: 'Daily answers' };
</script>

<script lang="ts">
  // The activity panel's body. As a chart: the metric picked, this period
  // in gold over a faint wash and the period before as a grey ghost on the
  // same axis; the newest point (today, or this week) only partly over, so
  // drawn faint, "so far". A hairline follows what's read (Crosshair). As a
  // table: every day (or week) newest first, all the metrics side by side.
  import { axis, compact, fmt, labelled, longDay, shortDay } from './chart';
  import { Crosshair } from './crosshair.svelte';
  import { grouped, percent } from './model';

  let {
    now,
    before,
    metric,
    view,
    weekly,
    height = 240,
  }: { now: DayRows; before: DayRows; metric: MetricKey; view: 'chart' | 'table'; weekly: boolean; height?: number } = $props();

  const size = $derived(weekly ? 7 : 1);
  const group = (r: DayRows, k: MetricKey | 'named') => grouped(r.days, r[k], size);
  const cur = $derived(group(now, metric));
  const was = $derived(group(before, metric).values);
  const n = $derived(cur.values.length);

  let width = $state(0);
  const PAD = { top: 12, right: 10, bottom: 26, left: 40 };
  const plotW = $derived(Math.max(0, width - PAD.left - PAD.right));
  const plotH = $derived(height - PAD.top - PAD.bottom);
  const ax = $derived(axis(Math.max(0, ...cur.values, ...was), 4));
  const x = (i: number) => PAD.left + (n > 1 ? (plotW * i) / (n - 1) : plotW / 2);
  const y = (v: number) => PAD.top + plotH - (plotH * v) / ax.top;
  const path = (vs: number[]) => vs.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('');
  /** Up to the last whole point, and the last stretch (to the point still filling) on its own. */
  const settled = (vs: number[]) => path(vs.slice(0, Math.max(1, n - 1)));
  const lastStretch = (vs: number[]) => (n > 1 ? `M${x(n - 2).toFixed(1)} ${y(vs[n - 2] ?? 0).toFixed(1)}L${x(n - 1).toFixed(1)} ${y(vs[n - 1] ?? 0).toFixed(1)}` : '');
  const wash = $derived(n ? `${path(cur.values)}L${x(n - 1).toFixed(1)} ${y(0)}L${x(0).toFixed(1)} ${y(0)}Z` : '');
  const ticks = $derived(labelled(n, plotW, 72));
  const hair = new Crosshair(
    () => n,
    (px) => Math.round(((px - PAD.left) / Math.max(1, plotW)) * (n - 1)),
  );
  const tipLeft = $derived(hair.at === null ? 0 : Math.max(90, Math.min(width - 90, x(hair.at))));

  const rows = $derived.by(() => {
    const v = group(now, 'visitors');
    const g = group(now, 'games').values;
    const a = group(now, 'answers').values;
    const r = group(now, 'named').values;
    return v.days.map((d, i) => ({ day: d, visitors: v.values[i], games: g[i], answers: a[i], named: r[i], partial: i === v.days.length - 1 })).reverse();
  });
  const peak = $derived({
    visitors: Math.max(1, ...rows.map((r) => r.visitors)),
    games: Math.max(1, ...rows.map((r) => r.games)),
    answers: Math.max(1, ...rows.map((r) => r.answers)),
  });
</script>

{#if view === 'chart'}
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
        aria-label="{METRIC_NAMES[metric]} per {weekly ? 'week' : 'day'}, this period against the one before. Arrow keys step through."
        onpointermove={hair.move}
        onpointerdown={hair.down}
        onpointerleave={hair.leave}
        onkeydown={hair.key}
        onblur={hair.blur}
      >
        {#each ax.ticks as t (t)}
          <line class="grid" class:base={t === 0} x1={PAD.left} x2={PAD.left + plotW} y1={y(t)} y2={y(t)} />
          <text class="tick" x={PAD.left - 10} y={y(t) + 4} text-anchor="end">{compact(t)}</text>
        {/each}
        {#each ticks as i (i)}
          <text class="tick" x={x(i)} y={height - 6} text-anchor={i === n - 1 ? 'end' : i === 0 ? 'start' : 'middle'}>{shortDay(cur.days[i])}</text>
        {/each}
        <path class="ghost" d={settled(was)} />
        <path class="ghost so-far" d={lastStretch(was)} />
        <path class="wash" d={wash} />
        <path class="line" d={settled(cur.values)} />
        <path class="line so-far" d={lastStretch(cur.values)} />
        {#if hair.at !== null}
          <line class="cross" x1={x(hair.at)} x2={x(hair.at)} y1={PAD.top} y2={PAD.top + plotH} />
          <circle class="ghost-dot" cx={x(hair.at)} cy={y(was[hair.at] ?? 0)} r="3.5" />
          <circle class="dot" cx={x(hair.at)} cy={y(cur.values[hair.at] ?? 0)} r="4.5" />
        {/if}
      </svg>
      {#if hair.at !== null}
        <div class="tip" style:left="{tipLeft}px" role="status">
          <div class="when">{longDay(cur.days[hair.at], weekly)}{hair.at === n - 1 ? ', so far' : ''}</div>
          <div class="row"><i class="key now"></i><b>{fmt(cur.values[hair.at] ?? 0)}</b><span>{METRIC_NAMES[metric].toLowerCase()}</span></div>
          <div class="row was"><i class="key before"></i><b>{fmt(was[hair.at] ?? 0)}</b><span>the period before</span></div>
        </div>
      {/if}
    {/if}
  </div>
  <div class="legend" aria-hidden="true">
    <span><i class="key now"></i>This period</span>
    <span><i class="key before"></i>The period before</span>
    <span class="hint">{weekly ? 'By week' : 'By day'}; the last {weekly ? 'week' : 'day'} so far</span>
  </div>
{:else}
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th scope="col">{weekly ? 'Week of' : 'Day'}</th>
          <th scope="col" class="n">Visitors</th>
          <th scope="col" class="n">Games</th>
          <th scope="col" class="n">Daily answers</th>
          <th scope="col" class="n">Named</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as r (r.day)}
          <tr class:partial={r.partial}>
            <th scope="row">{weekly ? shortDay(r.day) : longDay(r.day)}{#if r.partial}<em>so far</em>{/if}</th>
            <td class="n"><span class="cell"><i style:width="{(100 * r.visitors) / peak.visitors}%"></i><b>{fmt(r.visitors)}</b></span></td>
            <td class="n"><span class="cell"><i style:width="{(100 * r.games) / peak.games}%"></i><b>{fmt(r.games)}</b></span></td>
            <td class="n"><span class="cell"><i style:width="{(100 * r.answers) / peak.answers}%"></i><b>{fmt(r.answers)}</b></span></td>
            <td class="n muted">{percent(r.named, r.answers)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

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
  .grid.base {
    stroke: var(--line);
  }
  .tick {
    font-family: var(--font-cinzel);
    font-size: 10.5px;
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
    opacity: 0.09;
  }
  .ghost {
    fill: none;
    stroke: var(--ghost);
    stroke-width: 1.5;
    stroke-linejoin: round;
  }
  .so-far {
    opacity: 0.4;
  }
  .cross {
    stroke: var(--gold-hi);
    opacity: 0.45;
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
    z-index: 3;
    padding: 0.5rem 0.75rem;
    background: #0e0c09;
    border: 1px solid var(--gold-lo);
    border-radius: 4px;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.6);
    pointer-events: none;
    white-space: nowrap;
    font-size: 0.88rem;
  }
  .when {
    margin-bottom: 0.2rem;
    font-family: var(--font-cinzel);
    font-size: 0.7rem;
    letter-spacing: 0.04em;
    color: var(--muted);
  }
  .row {
    display: grid;
    grid-template-columns: 0.9rem 3.2rem auto;
    align-items: center;
    column-gap: 0.45rem;
    color: var(--muted);
  }
  .row b {
    font-family: var(--font-cinzel);
    color: var(--text);
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .row.was b {
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
    align-items: center;
    gap: 0.3rem 1.3rem;
    margin-top: 0.7rem;
    padding-left: 40px;
    font-size: 0.85rem;
    color: var(--muted);
  }
  .legend span {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
  }
  .hint {
    margin-left: auto;
    font-style: italic;
  }

  /* ---- the table ---- */
  .table-wrap {
    max-height: 340px;
    overflow: auto;
    border: 1px solid var(--line);
    border-radius: 4px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.95rem;
  }
  thead th {
    position: sticky;
    top: 0;
    z-index: 1;
    padding: 0.55rem 0.9rem;
    font-family: var(--font-cinzel);
    font-size: 0.66rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    text-align: left;
    color: var(--muted);
    background: #17130e;
    border-bottom: 1px solid var(--gold-lo);
  }
  tbody th,
  td {
    padding: 0.42rem 0.9rem;
    border-bottom: 1px solid rgba(59, 48, 36, 0.45);
  }
  tbody th {
    font-weight: 400;
    text-align: left;
    white-space: nowrap;
    color: var(--text);
  }
  tbody th em {
    margin-left: 0.5rem;
    font-size: 0.8rem;
    color: var(--muted);
  }
  tbody tr:nth-child(even) {
    background: rgba(255, 230, 180, 0.025);
  }
  tbody tr:hover {
    background: rgba(201, 164, 92, 0.07);
  }
  tbody tr.partial {
    color: var(--muted);
  }
  .n {
    text-align: right;
  }
  th.n {
    text-align: right;
  }
  /* A number with a faint bar behind it, as long as it is against the largest in its column. */
  .cell {
    position: relative;
    display: inline-block;
    min-width: 8rem;
    padding: 0 0.1rem;
  }
  .cell i {
    position: absolute;
    right: 0;
    top: 15%;
    bottom: 15%;
    background: rgba(201, 164, 92, 0.16);
    border-radius: 2px;
  }
  .cell b {
    position: relative;
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .muted {
    font-family: var(--font-cinzel);
    font-size: 0.85rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  @media (max-width: 520px) {
    .legend {
      padding-left: 0;
    }
    .hint {
      margin-left: 0;
      flex-basis: 100%;
    }
    thead th,
    tbody th,
    td {
      padding-left: 0.5rem;
      padding-right: 0.5rem;
    }
    .cell {
      min-width: 3rem;
    }
  }
</style>
