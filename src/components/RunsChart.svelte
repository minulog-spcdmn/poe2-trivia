<script lang="ts">
  // The end of a Delve run: this device's runs of its kind (alone or
  // together, lib/delveRecord.ts), oldest first, the last of them this one,
  // as engraved columns. Earlier runs hatched and outlined in their zone's
  // accent, this one solid in it; this run's depth over it, the best's with
  // a star (one label when this run is the best); a dotted line at the
  // median of the runs shown, "usual" beside it. Depths as players count them.
  import { shownDepth } from '../lib/delve';
  import type { DelveRun } from '../lib/delveRecord';
  import { accentAt } from '../lib/descent';
  import { chartLayout, median } from '../lib/recap';

  /** `height`: the whole drawing's, its labels and ticks included; `width`: the columns' (the median's label runs on past it). */
  let { runs, height: whole = 150, width = 180 }: { runs: DelveRun[]; height?: number; width?: number } = $props();

  const uid = $props.id();
  /** Room over the columns for the labels, under them for the ticks, and beside them for "usual". */
  const TOP = 26;
  const FOOT = 6;
  const SIDE = 56;
  const height = $derived(whole - TOP - FOOT);

  const depths = $derived(runs.map((r) => shownDepth(r.depth)));
  const top = $derived(Math.max(1, ...depths) + 1);
  const best = $derived(depths.indexOf(Math.max(...depths)));
  const last = $derived(depths.length - 1);
  const usual = $derived(median(depths));
  const lay = $derived(chartLayout(runs.length, width));
  const y = (d: number) => TOP + height - (d / top) * height;
  const bars = $derived(
    runs.map((r, i) => {
      const accent = accentAt(r.depth);
      return { x: i * (lay.col + lay.gap), y: y(depths[i]), h: (depths[i] / top) * height, accent, hatch: `${uid}-h${i}` };
    }),
  );
  const label = (i: number) => bars[i].x + lay.col / 2;
</script>

<svg
  class="runs-chart"
  width={width + SIDE}
  height={whole}
  viewBox="0 0 {width + SIDE} {whole}"
  role="img"
  aria-label="Your runs, oldest first: depths {depths.join(', ')}; this run {depths[last]}, the best {depths[best]}"
>
  <defs>
    {#each bars as b, i (i)}
      {#if i !== last}
        <!-- Hatched at 45°, a 1 px line every 4 px, in the run's zone accent. -->
        <pattern id={b.hatch} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="4" style:stroke="color-mix(in srgb, {b.accent} 80%, #fff 20%)" stroke-width="1" />
        </pattern>
      {/if}
    {/each}
  </defs>
  <!-- The median of the runs shown. -->
  <line class="usual" x1="0" x2={width} y1={y(usual)} y2={y(usual)} />
  <text class="usual-label" x={width + 8} y={y(usual) + 4}>usual {usual}</text>
  {#each bars as b, i (i)}
    {#if i === last}
      <rect class="this" x={b.x} y={b.y} width={lay.col} height={b.h} style:fill="color-mix(in srgb, {b.accent} 86%, transparent)" />
    {:else}
      <rect
        class="earlier"
        x={b.x + 0.5}
        y={b.y + 0.5}
        width={lay.col - 1}
        height={Math.max(0, b.h - 1)}
        fill="url(#{b.hatch})"
        style:stroke="color-mix(in srgb, {b.accent} 80%, #fff 20%)"
      />
    {/if}
    <line class="tick" x1={b.x + lay.col / 2} x2={b.x + lay.col / 2} y1={TOP + height} y2={TOP + height + 4} />
  {/each}
  <line class="base" x1="0" x2={width} y1={TOP + height + 0.5} y2={TOP + height + 0.5} />
  {#if best === last}
    <text class="depth now" x={label(last)} y={bars[last].y - 7}>✦ {depths[last]}</text>
  {:else}
    <text class="depth best" x={label(best)} y={bars[best].y - 7}>✦ {depths[best]}</text>
    <text class="depth now" x={label(last)} y={bars[last].y - 7}>{depths[last]}</text>
  {/if}
</svg>

<style>
  .runs-chart {
    display: block;
    flex: none;
    overflow: visible;
  }
  .earlier {
    stroke-width: 1;
  }
  .base {
    stroke: color-mix(in srgb, var(--gold) 70%, transparent);
    stroke-width: 1;
  }
  .tick {
    stroke: color-mix(in srgb, var(--gold) 70%, transparent);
    stroke-width: 1;
  }
  .usual {
    stroke: rgba(201, 164, 92, 0.55);
    stroke-width: 1;
    stroke-dasharray: 1 3;
  }
  .usual-label {
    font-family: var(--font-body);
    font-style: italic;
    font-size: 13px;
    fill: var(--muted);
  }
  .depth {
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 13px;
    text-anchor: middle;
  }
  .depth.now {
    fill: #fff1cf;
  }
  .depth.best {
    fill: #ddd3c2;
  }
</style>
