<script lang="ts" module>
  export interface Series {
    name: string;
    values: number[];
    /** gold: the series the chart is about; dim: the rest of a stack, for context. */
    tone: 'gold' | 'dim';
  }

  /** A round step for an axis that reaches `max` in about `ticks` steps. */
  export function niceStep(max: number, ticks = 3): number {
    if (max <= 0) return 1;
    const raw = max / ticks;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const n = raw / mag;
    return Math.max(1, (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag);
  }

  const dayName = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  export const longDay = (d: string) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
</script>

<script lang="ts">
  // Counts per day: one series as a line over a faint wash (`area`), or one or
  // two stacked as columns (`columns`), the series the chart is about in gold
  // and the other dimmed under it. A hairline follows the pointer (or a
  // finger dragged across, or the arrow keys once it has focus) to the
  // nearest day, and a note there reads out every series that day. The axis
  // has a few round steps on a hairline grid; the dates run along the foot.
  let {
    days,
    series,
    kind = 'area',
    height = 150,
    weekly = false,
    label,
  }: { days: string[]; series: Series[]; kind?: 'area' | 'columns'; height?: number; weekly?: boolean; label: string } = $props();

  let width = $state(0);
  let at = $state<number | null>(null);
  let pinned = $state(false);

  const PAD = { top: 10, right: 6, bottom: 24, left: 34 };
  const plotW = $derived(Math.max(0, width - PAD.left - PAD.right));
  const plotH = $derived(height - PAD.top - PAD.bottom);
  const totals = $derived(days.map((_, i) => series.reduce((n, s) => n + (s.values[i] ?? 0), 0)));
  const step = $derived(niceStep(Math.max(...totals, 0)));
  const top = $derived(Math.max(step, Math.ceil(Math.max(...totals, 0) / step) * step));
  const ticks = $derived(Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step));
  const y = (v: number) => PAD.top + plotH - (plotH * v) / top;
  /** Columns: each day a band, the column in its middle. Area: the days spread edge to edge. */
  const band = $derived(days.length ? plotW / days.length : 0);
  const x = (i: number) => (kind === 'columns' ? PAD.left + band * (i + 0.5) : PAD.left + (days.length > 1 ? (plotW * i) / (days.length - 1) : plotW / 2));
  const colW = $derived(Math.max(2, Math.min(24, band - 2)));

  /** Dates along the foot: as many as fit without crowding, the last always among them. */
  const labelled = $derived.by(() => {
    if (!days.length || !plotW) return [];
    const fit = Math.max(2, Math.floor(plotW / 64));
    const every = Math.max(1, Math.ceil(days.length / fit));
    const out: number[] = [];
    for (let i = days.length - 1; i >= 0; i -= every) out.unshift(i);
    return out;
  });

  const line = $derived(
    kind === 'area' && series[0] ? series[0].values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('') : '',
  );
  const wash = $derived(line && days.length ? `${line}L${x(days.length - 1).toFixed(1)} ${y(0)}L${x(0).toFixed(1)} ${y(0)}Z` : '');

  /** A column's segment: rounded 4px at its top end only when it is the top of the stack. */
  function segment(i: number, from: number, to: number, roundTop: boolean): string {
    const cx = x(i);
    const l = cx - colW / 2;
    const r = cx + colW / 2;
    const t = y(to);
    const b = y(from);
    const rad = roundTop ? Math.min(4, colW / 2, b - t) : 0;
    if (b - t < 0.5) return '';
    return `M${l} ${b}V${t + rad}${rad ? `Q${l} ${t} ${l + rad} ${t}H${r - rad}Q${r} ${t} ${r} ${t + rad}` : `H${r}`}V${b}Z`;
  }
  const stacks = $derived(
    kind === 'columns'
      ? days.map((_, i) => {
          let base = 0;
          const parts = series.map((s) => {
            const from = base;
            base += s.values[i] ?? 0;
            return { tone: s.tone, from, to: base };
          });
          const topIdx = parts.findLastIndex((p) => p.to > p.from);
          // Touching segments are kept apart by a 2px gap in the plate's colour, not a stroke.
          return parts.map((p, k) => ({ ...p, d: segment(i, p.from, p.to, k === topIdx), gapAbove: k < topIdx }));
        })
      : [],
  );

  let svg = $state<SVGSVGElement>();
  function nearest(clientX: number) {
    if (!svg || !days.length) return null;
    const px = clientX - svg.getBoundingClientRect().left;
    if (kind === 'columns') return Math.max(0, Math.min(days.length - 1, Math.floor((px - PAD.left) / band)));
    return Math.max(0, Math.min(days.length - 1, Math.round(((px - PAD.left) / Math.max(1, plotW)) * (days.length - 1))));
  }
  function move(e: PointerEvent) {
    // A mouse shows the note as it passes; a finger only while it's down and after (pinned).
    if (e.pointerType === 'mouse' || pinned) at = nearest(e.clientX);
  }
  function down(e: PointerEvent) {
    if (e.pointerType === 'mouse') return;
    pinned = true;
    at = nearest(e.clientX);
  }
  function leave(e: PointerEvent) {
    if (e.pointerType === 'mouse') at = null;
  }
  function key(e: KeyboardEvent) {
    if (!days.length) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const d = e.key === 'ArrowRight' ? 1 : -1;
      at = Math.max(0, Math.min(days.length - 1, (at ?? (d > 0 ? -1 : days.length)) + d));
    } else if (e.key === 'Escape') at = null;
  }
  const fmt = (n: number) => n.toLocaleString('en');
  const compact = (n: number) => (n >= 1000 ? new Intl.NumberFormat('en', { notation: 'compact' }).format(n) : String(n));
  const tipLeft = $derived(at === null ? 0 : Math.max(70, Math.min(width - 70, x(at))));
</script>

<svelte:window
  onpointerdown={(e) => {
    if (pinned && svg && !svg.contains(e.target as Node)) {
      pinned = false;
      at = null;
    }
  }}
/>

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
      aria-label="{label}. Use the arrow keys to read each day."
      onpointermove={move}
      onpointerdown={down}
      onpointerleave={leave}
      onkeydown={key}
      onblur={() => {
        if (!pinned) at = null;
      }}
    >
      {#each ticks as t (t)}
        <line class="grid" x1={PAD.left} x2={PAD.left + plotW} y1={y(t)} y2={y(t)} />
        <text class="tick" x={PAD.left - 6} y={y(t) + 4} text-anchor="end">{compact(t)}</text>
      {/each}
      {#each labelled as i (i)}
        <text class="tick" x={x(i)} y={height - 6} text-anchor={i === days.length - 1 && kind === 'area' ? 'end' : i === 0 && kind === 'area' ? 'start' : 'middle'}
          >{dayName(days[i])}</text
        >
      {/each}

      {#if kind === 'area'}
        <path class="wash" d={wash} />
        <path class="line" d={line} />
        {#if at !== null}
          <line class="cross" x1={x(at)} x2={x(at)} y1={PAD.top} y2={PAD.top + plotH} />
          <circle class="dot" cx={x(at)} cy={y(series[0].values[at] ?? 0)} r="4.5" />
        {/if}
      {:else}
        {#each stacks as parts, i (i)}
          <g class:lit={at === i} class:faded={at !== null && at !== i}>
            {#each parts as p, k (k)}
              {#if p.d}
                <path class="col {p.tone}" d={p.d} />
                {#if p.gapAbove}<line class="gap" x1={x(i) - colW / 2} x2={x(i) + colW / 2} y1={y(p.to)} y2={y(p.to)} />{/if}
              {/if}
            {/each}
          </g>
        {/each}
      {/if}
      <line class="base" x1={PAD.left} x2={PAD.left + plotW} y1={y(0)} y2={y(0)} />
    </svg>

    {#if at !== null}
      <div class="tip" style:left="{tipLeft}px" role="status">
        <div class="when">{weekly ? `Week of ${dayName(days[at])}` : longDay(days[at])}</div>
        {#each [...series].reverse() as s (s.name)}
          <div class="row"><i class="key {s.tone}"></i><b>{fmt(s.values[at] ?? 0)}</b> <span>{s.name}</span></div>
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
    stroke-width: 1;
  }
  .base {
    stroke: var(--line);
    stroke-width: 1;
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
  .cross {
    stroke: var(--gold-hi);
    stroke-width: 1;
    opacity: 0.6;
  }
  .dot {
    fill: var(--gold-hi);
    stroke: var(--plate);
    stroke-width: 2;
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
  .faded {
    opacity: 0.55;
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
    font-family: var(--font-cinzel);
    font-size: 0.7rem;
    letter-spacing: 0.06em;
    color: var(--muted);
    margin-bottom: 0.15rem;
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
