<script lang="ts">
  // A share a day (or a week) as a gold line: of `whole` games, the `part`
  // that stuttered (`many` of them a lot), a point where there were any, the
  // line broken over a day with none. A point resting on fewer than
  // FEW_GAMES is hollow, and left out of the axis: one game of two is 50%. A
  // dashed line across is the share over the whole period, so a jump stands
  // out against it. Small, to stand beside others of its kind on one axis
  // (`top`, in percent: model.ts stutterTop). Pointing (or the arrow keys)
  // reads a day.
  import { axis, fmt, labelled, longDay, shortDay } from './chart';
  import { Crosshair } from './crosshair.svelte';
  import { FEW_GAMES, grouped } from './model';
  import { rootFont } from './rootFont.svelte';

  let {
    days,
    part,
    many,
    whole,
    weekly,
    top,
    label,
    height = 200,
  }: { days: string[]; part: number[]; many: number[]; whole: number[]; weekly: boolean; top: number; label: string; height?: number } = $props();

  const size = $derived(weekly ? 7 : 1);
  const g = $derived(grouped(days, whole, size));
  const p = $derived(grouped(days, part, size).values);
  const m = $derived(grouped(days, many, size).values);
  const n = $derived(g.values.length);
  /** Each point's share in percent; null where there were no games. */
  const shares = $derived(g.values.map((w, i) => (w ? (100 * p[i]) / w : null)));
  const all = $derived(g.values.reduce((a, b) => a + b, 0));
  const mean = $derived(all ? (100 * p.reduce((a, b) => a + b, 0)) / all : null);

  let width = $state(0);
  const font = rootFont();
  const fs = $derived(font.label);
  const PAD = $derived({ top: Math.max(12, fs), right: 12, bottom: Math.round(fs * 2.3), left: Math.round(fs * 3.2) });
  const plotW = $derived(Math.max(0, width - PAD.left - PAD.right));
  const plotH = $derived(height - PAD.top - PAD.bottom);
  const ax = $derived(axis(top, 2));
  const x = (i: number) => PAD.left + (n > 1 ? (plotW * i) / (n - 1) : plotW / 2);
  /** (A share over the axis, from a few games, sits on its top.) */
  const y = (v: number) => PAD.top + plotH - (plotH * Math.min(v, ax.top)) / ax.top;
  const line = $derived(shares.map((v, i) => (v === null ? '' : `${i && shares[i - 1] !== null ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)).join(''));
  const ticks = $derived(labelled(n, plotW, fs * 6.4));
  const hair = new Crosshair(
    () => n,
    (px) => Math.round(((px - PAD.left) / Math.max(1, plotW)) * (n - 1)),
  );
  const tipLeft = $derived(hair.at === null ? 0 : Math.max(110, Math.min(width - 110, x(hair.at))));
  const pct = (v: number) => `${Math.round(v)}%`;
</script>

<div class="chart" bind:clientWidth={width} style:height="{height}px">
  {#if width}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
    <svg
      {@attach hair.attach}
      {width}
      {height}
      style:font-size="{fs}px"
      role="img"
      tabindex="0"
      aria-label="{label}: the share of games that stuttered, a {weekly ? 'week' : 'day'}. Arrow keys step through."
      onpointermove={hair.move}
      onpointerdown={hair.down}
      onpointerleave={hair.leave}
      onkeydown={hair.key}
      onblur={hair.blur}
    >
      {#each ax.ticks as t (t)}
        <line class="grid" class:base={t === 0} x1={PAD.left} x2={PAD.left + plotW} y1={y(t)} y2={y(t)} />
        <text class="tick" x={PAD.left - fs * 0.7} y={y(t) + fs * 0.33} text-anchor="end">{t}%</text>
      {/each}
      {#each ticks as i (i)}
        <text class="tick" x={x(i)} y={height - fs * 0.4} text-anchor={i === n - 1 ? 'end' : i === 0 ? 'start' : 'middle'}>{shortDay(g.days[i])}</text>
      {/each}
      {#if mean !== null}
        <line class="mean" x1={PAD.left} x2={PAD.left + plotW} y1={y(mean)} y2={y(mean)} />
      {/if}
      <path class="line" d={line} />
      {#each shares as v, i (i)}
        {#if v !== null}
          <circle class="dot" class:few={g.values[i] < FEW_GAMES} class:so-far={i === n - 1} cx={x(i)} cy={y(v)} r="4" />
        {/if}
      {/each}
      {#if hair.at !== null}
        <line class="cross" x1={x(hair.at)} x2={x(hair.at)} y1={PAD.top} y2={PAD.top + plotH} />
      {/if}
    </svg>
    {#if hair.at !== null}
      {@const w = g.values[hair.at] ?? 0}
      <div class="tip" style:left="{tipLeft}px" role="status">
        <div class="when">{longDay(g.days[hair.at], weekly)}{hair.at === n - 1 ? ', so far' : ''}</div>
        {#if w}
          <div class="row"><b>{pct(shares[hair.at] ?? 0)}</b><span>stuttered</span></div>
          <div class="of">{fmt(p[hair.at])} of {fmt(w)} game{w === 1 ? '' : 's'}{m[hair.at] ? `, ${fmt(m[hair.at])} a lot` : ''}</div>
        {:else}
          <div class="of">No games</div>
        {/if}
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
  .line {
    fill: none;
    stroke: var(--a-now);
    stroke-width: 2;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  .dot {
    fill: var(--a-now);
    stroke: var(--a-surface);
    stroke-width: 2;
  }
  .dot.few {
    fill: var(--a-surface);
    stroke: var(--a-now);
  }
  .dot.so-far {
    opacity: 0.55;
  }
  .mean {
    stroke: var(--a-ink);
    stroke-width: 1.5;
    stroke-dasharray: 6 6;
    opacity: 0.55;
  }
  .cross {
    stroke: var(--a-text);
    opacity: 0.35;
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
    align-items: baseline;
    gap: 0.6rem;
    color: var(--a-muted);
  }
  .row b {
    font-size: 1.3rem;
    font-weight: 650;
    color: var(--a-ink);
  }
  .of {
    color: var(--a-muted);
  }
</style>
