<script lang="ts">
  // One figure over the days: this period as a gold line, the period before
  // as a grey one on the same axis, so a glance says whether it's growing.
  // The newest point (today, or this week) isn't over, so its last stretch is
  // drawn faint. Pointing (or the arrow keys) reads a day's two figures.
  // `marks`: days ringed on the line (the busiest, insights.ts spikesOf).
  // `back`: how many days before a day its counterpart before is, where
  // only some of the period's days are drawn (all of them: their number).
  // A dashed line across is this period's average a day (or week), over the
  // whole ones, its figure at its end: what a usual day is, so a day's
  // swing reads against it.
  // A day of the period before with nothing to set against (null: Today's
  // unique hadn't begun) has no grey line, rather than one flat at nothing;
  // nor does a period before that wasn't counted in full (COMPARE), its
  // legend and its row in the note left out.
  // Its labels, and the room around the plot for them, follow the page's
  // type (rootFont), so a big screen's chart reads like the rest of it.
  import { getContext } from 'svelte';
  import { average, axis, compact, fmt, labelled, longDay, shortDay } from './chart';
  import { Crosshair } from './crosshair.svelte';
  import { grouped } from './model';
  import { COMPARE } from './read';
  import { rootFont } from './rootFont.svelte';
  import { addDays } from './zone';

  let {
    days,
    now,
    before,
    weekly,
    what,
    names,
    height = 360,
    marks = [],
    back,
  }: { days: string[]; now: number[]; before: (number | null)[]; weekly: boolean; what: string; names: { now: string; before: string }; height?: number; marks?: string[]; back?: number } = $props();

  const compare = getContext<(() => boolean) | undefined>(COMPARE) ?? (() => true);
  const cur = $derived(grouped(days, now, weekly ? 7 : 1));
  /** The period before's, a week null where any of its days is. */
  const was = $derived.by((): (number | null)[] => {
    if (!compare()) return cur.values.map(() => null);
    const sums = grouped(days, before.map((v) => v ?? 0), weekly ? 7 : 1).values;
    const gaps = grouped(days, before.map((v) => (v === null ? 1 : 0)), weekly ? 7 : 1).values;
    return sums.map((v, i) => (gaps[i] ? null : v));
  });
  const none = $derived(was.every((v) => v === null));
  /** This period's average a point, over the whole ones (the last, still going, left out unless it's all there is). */
  const mean = $derived.by(() => {
    const whole = n > 1 ? cur.values.slice(0, -1) : cur.values;
    return whole.length ? whole.reduce((a, b) => a + b, 0) / whole.length : null;
  });
  const n = $derived(cur.values.length);

  let width = $state(0);
  const font = rootFont();
  const fs = $derived(font.label);
  const PAD = $derived({ top: Math.max(16, fs), right: 12, bottom: Math.round(fs * 2.3), left: Math.round(fs * 3.5) });
  const plotW = $derived(Math.max(0, width - PAD.left - PAD.right));
  const plotH = $derived(height - PAD.top - PAD.bottom);
  const ax = $derived(axis(Math.max(0, ...cur.values, ...was.map((v) => v ?? 0)), 4));
  const x = (i: number) => PAD.left + (n > 1 ? (plotW * i) / (n - 1) : plotW / 2);
  const y = (v: number) => PAD.top + plotH - (plotH * v) / ax.top;
  /** A line through the points, broken where one is null. */
  const path = (vs: (number | null)[]) => vs.map((v, i) => (v === null ? '' : `${i && vs[i - 1] !== null ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)).join('');
  /** Up to the last whole point, and the last stretch (to the point still filling) on its own. */
  const settled = (vs: (number | null)[]) => path(vs.slice(0, Math.max(1, n - 1)));
  const lastStretch = (vs: (number | null)[]) =>
    n > 1 && vs[n - 2] != null && vs[n - 1] != null ? `M${x(n - 2).toFixed(1)} ${y(vs[n - 2]!).toFixed(1)}L${x(n - 1).toFixed(1)} ${y(vs[n - 1]!).toFixed(1)}` : '';
  const wash = $derived(n ? `${path(cur.values)}L${x(n - 1).toFixed(1)} ${y(0)}L${x(0).toFixed(1)} ${y(0)}Z` : '');
  const ticks = $derived(labelled(n, plotW, fs * 6.4));
  const hair = new Crosshair(
    () => n,
    (px) => Math.round(((px - PAD.left) / Math.max(1, plotW)) * (n - 1)),
  );
  const tipLeft = $derived(hair.at === null ? 0 : Math.max(120, Math.min(width - 120, x(hair.at))));
  const unit = $derived(weekly ? 'week' : 'day');
  /** Where each marked day falls (by the day; a week isn't marked). */
  const marked = $derived(weekly ? [] : marks.map((d) => cur.days.indexOf(d)).filter((i) => i >= 0));
</script>

<div class="legend" aria-hidden="true">
  <span><i class="key now"></i>{names.now}</span>
  {#if compare()}<span><i class="key before"></i>{names.before}{none ? ': nothing to compare' : ''}</span>{/if}
  <span class="hint">{what} a {unit}; the last {unit} isn't over yet</span>
</div>
<div class="chart" bind:clientWidth={width} style:height="{height}px">
  {#if width}
    <!-- An image of the days that can be stepped through with the arrow keys, its note read out (role=status). -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
    <svg
      {@attach hair.attach}
      {width}
      {height}
      style:font-size="{fs}px"
      role="img"
      tabindex="0"
      aria-label="{what} a {unit}, {names.now.toLowerCase()}{compare() ? ` against ${names.before.toLowerCase()}` : ''}. Arrow keys step through."
      onpointermove={hair.move}
      onpointerdown={hair.down}
      onpointerleave={hair.leave}
      onkeydown={hair.key}
      onblur={hair.blur}
    >
      {#each ax.ticks as t (t)}
        <line class="grid" class:base={t === 0} x1={PAD.left} x2={PAD.left + plotW} y1={y(t)} y2={y(t)} />
        <text class="tick" x={PAD.left - fs * 0.8} y={y(t) + fs * 0.33} text-anchor="end">{compact(t)}</text>
      {/each}
      {#each ticks as i (i)}
        <text class="tick" x={x(i)} y={height - fs * 0.4} text-anchor={i === n - 1 ? 'end' : i === 0 ? 'start' : 'middle'}>{shortDay(cur.days[i])}</text>
      {/each}
      <path class="before" d={settled(was)} />
      <path class="before so-far" d={lastStretch(was)} />
      <path class="wash" d={wash} />
      <path class="now" d={settled(cur.values)} />
      <path class="now so-far" d={lastStretch(cur.values)} />
      {#if mean !== null && mean > 0}
        <line class="mean" x1={PAD.left} x2={PAD.left + plotW} y1={y(mean)} y2={y(mean)} />
        <text class="mean-label" x={PAD.left + plotW} y={y(mean) - fs * 0.45} text-anchor="end">average {average(mean)} a {unit}</text>
      {/if}
      {#each marked as i (i)}
        <circle class="mark" cx={x(i)} cy={y(cur.values[i] ?? 0)} r="9" />
      {/each}
      {#if hair.at !== null}
        <line class="cross" x1={x(hair.at)} x2={x(hair.at)} y1={PAD.top} y2={PAD.top + plotH} />
        {#if was[hair.at] != null}<circle class="dot-before" cx={x(hair.at)} cy={y(was[hair.at]!)} r="5" />{/if}
        <circle class="dot" cx={x(hair.at)} cy={y(cur.values[hair.at] ?? 0)} r="6" />
      {/if}
    </svg>
    {#if hair.at !== null}
      <div class="tip" style:left="{tipLeft}px" role="status">
        <div class="when">{longDay(cur.days[hair.at], weekly)}{hair.at === n - 1 ? ', so far' : ''}</div>
        <div class="row"><i class="key now"></i><b>{fmt(cur.values[hair.at] ?? 0)}</b><span>{what.toLowerCase()}</span></div>
        {#if compare()}<div class="row was"><i class="key before"></i><b>{was[hair.at] == null ? '–' : fmt(was[hair.at]!)}</b><span>{longDay(addDays(cur.days[hair.at], -(back ?? days.length)), weekly)}</span></div>{/if}
      </div>
    {/if}
  {/if}
</div>

<style>
  .legend {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem 1.6rem;
    margin-bottom: 1rem;
    font-size: 1.05rem;
    color: var(--a-text);
  }
  .legend span {
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
  }
  .hint {
    margin-left: auto;
    color: var(--a-muted);
  }
  .key {
    display: inline-block;
    width: 1.4rem;
    height: 4px;
    border-radius: 2px;
  }
  .key.now {
    background: var(--a-now);
  }
  .key.before {
    background: var(--a-before);
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
    fill: var(--a-muted);
    font-variant-numeric: tabular-nums;
  }
  .now,
  .before {
    fill: none;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  .now {
    stroke: var(--a-now);
    stroke-width: 3;
  }
  .before {
    stroke: var(--a-before);
    stroke-width: 2.5;
  }
  .wash {
    fill: var(--a-now);
    opacity: 0.08;
  }
  .mean {
    stroke: var(--a-ink);
    stroke-width: 1.5;
    stroke-dasharray: 6 6;
    opacity: 0.55;
  }
  .mean-label {
    font-family: var(--font-data);
    fill: var(--a-ink);
    font-weight: 600;
    paint-order: stroke;
    stroke: var(--a-surface);
    stroke-width: 4px;
  }
  .so-far {
    opacity: 0.45;
    stroke-dasharray: 2 6;
  }
  .mark {
    fill: none;
    stroke: var(--gold-hi);
    stroke-width: 2.5;
  }
  .cross {
    stroke: var(--a-text);
    opacity: 0.35;
  }
  .dot {
    fill: var(--a-now);
    stroke: var(--bg);
    stroke-width: 2.5;
  }
  .dot-before {
    fill: var(--a-before);
    stroke: var(--bg);
    stroke-width: 2.5;
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
    margin-bottom: 0.3rem;
    font-weight: 600;
    color: var(--a-ink);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    color: var(--a-muted);
  }
  .row b {
    min-width: 3ch;
    font-size: 1.3rem;
    font-weight: 650;
    color: var(--a-ink);
  }
  .row.was b {
    font-size: 1.05rem;
    color: var(--a-text);
  }
  @media (max-width: 600px) {
    .legend {
      font-size: 0.95rem;
    }
    .hint {
      margin-left: 0;
      flex-basis: 100%;
    }
  }
</style>
