<script lang="ts">
  import { MIN_RUNS, zoneOf, type DelveSummary } from '../../lib/codexStats';
  import type { DelveRun, Frontier } from '../../lib/delveRecord';
  import { backdropShadow } from '../../lib/backdropShadow';
  import { scrub } from './scrub';
  import Num from './Num.svelte';

  // How you have climbed: your typical depth, your best over time (a step up
  // at every new best), and the depths of your latest runs.
  let { climb, runs, summary, kindWord }: { climb: Frontier[]; runs: DelveRun[]; summary: DelveSummary; kindWord: string } = $props();

  const date = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const when = (t: number) =>
    new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const typical = (m: number) => (Number.isInteger(m) ? `${m}` : m.toFixed(1));
  const enough = $derived(summary.runs >= MIN_RUNS);

  // ---- your best over time ----

  const W = 300;
  const H = 100;
  const now = Date.now();
  const line = $derived.by(() => {
    if (!climb.length) return null;
    const t0 = climb[0].at;
    const t1 = Math.max(now, climb.at(-1)!.at);
    const span = Math.max(1, t1 - t0);
    const top = Math.max(10, Math.ceil((climb.at(-1)!.depth * 1.15) / 5) * 5);
    const pts = climb.map((f) => ({ ...f, x: (f.at - t0) / span, y: 1 - f.depth / top }));
    const d = pts.reduce((p, q, i) => (i ? `${p} H ${(q.x * W).toFixed(1)} V ${(q.y * H).toFixed(1)}` : `M 0 ${(q.y * H).toFixed(1)}`), '') + ` H ${W}`;
    return { pts, d, top, t0, t1 };
  });
  let lineAt = $state<number | null>(null);
  const linePick = $derived(line ? Math.min(lineAt ?? line.pts.length - 1, line.pts.length - 1) : 0);
  const lineText = $derived.by(() => {
    if (!line) return '';
    const p = line.pts[linePick];
    const before = line.pts[linePick - 1];
    return `${date(p.at)}: best ${kindWord} ${p.depth}${before ? `, ${p.depth - before.depth} deeper than before` : ', your first'}`;
  });
  const lineScrub = scrub(
    () => line?.pts.map((p) => p.x) ?? [],
    () => linePick,
    (i) => (lineAt = i),
  );

  // ---- the latest runs ----

  const RECENT = 20;
  const recent = $derived(runs.slice(0, RECENT).reverse());
  const deepest = $derived(Math.max(1, ...recent.map((r) => r.depth)));
  /** Linear, unless one run goes so much deeper than the rest that it would flatten them: then a log scale. */
  const logScale = $derived.by(() => {
    const sorted = recent.map((r) => r.depth).sort((a, b) => a - b);
    return deepest > 3 * Math.max(1, sorted[sorted.length >> 1] ?? 1);
  });
  const scale = (d: number) => (logScale ? Math.log1p(d) / Math.log1p(deepest) : d / deepest);
  const capNote = $derived([logScale ? 'log scale' : '', summary.median !== null ? 'dashed: typical' : ''].filter(Boolean).join('; '));
  let barAt = $state<number | null>(null);
  const barPick = $derived(Math.min(barAt ?? recent.length - 1, recent.length - 1));
  const barText = $derived.by(() => {
    const r = recent[barPick];
    if (!r) return '';
    return `${when(r.at)}: ${r.left ? 'left at' : 'fell at'} ${r.depth}, ${zoneOf(r.depth).name}`;
  });
  const barScrub = scrub(
    () => recent.map((_, i) => (i + 0.5) / recent.length),
    () => barPick,
    (i) => (barAt = i),
  );
</script>

<section class="panel" use:backdropShadow={{ fill: 'linear' }} aria-labelledby="prog-h">
  <header><h2 id="prog-h">Progress</h2></header>
  {#if !enough}
    <p class="hint">After {MIN_RUNS} runs {kindWord}: your typical depth, your best over time and your latest runs.</p>
  {:else}
    <p class="typical">
      {#if summary.median !== null}
        Typical depth <b class="n">{typical(summary.median)}</b><span class="muted-i"
          >: the median of <Num text="{summary.fell} falls{summary.left ? `; ${summary.left} left early don't count` : ''}" /></span
        >
      {:else}
        <span class="muted-i">Typical depth after <span class="n">{MIN_RUNS}</span> falls {kindWord}{summary.left ? ` (runs left early don't count)` : ''}.</span>
      {/if}
    </p>

    {#if line}
      <figure class="chart">
        <figcaption class="cap">Best {kindWord}, over time</figcaption>
        <div
          class="plot line-plot"
          role="slider"
          tabindex="0"
          aria-label="Best {kindWord} over time"
          aria-valuemin={0}
          aria-valuemax={line.pts.length - 1}
          aria-valuenow={linePick}
          aria-valuetext={lineText}
          {...lineScrub}
        >
          <span class="y-top n" aria-hidden="true">{line.top}</span>
          <svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" aria-hidden="true">
            <path class="climb-fill" d="{line.d} V {H} H 0 Z" />
            <path class="climb" d={line.d} vector-effect="non-scaling-stroke" />
          </svg>
          {#each line.pts as p, i (p.at)}
            <span class="dot" class:on={i === linePick} style:left="{p.x * 100}%" style:top="{p.y * 100}%" aria-hidden="true"></span>
          {/each}
        </div>
        <div class="x-ends n" aria-hidden="true"><span>{date(line.t0)}</span><span>today</span></div>
        <p class="readout" aria-hidden="true"><Num text={lineText} /></p>
      </figure>
    {/if}

    {#if recent.length >= MIN_RUNS}
      <figure class="chart">
        <figcaption class="cap">
          Your last <span class="n">{recent.length}</span> runs {kindWord}
          {#if capNote}<span class="muted-i">({capNote})</span>{/if}
        </figcaption>
        <div
          class="plot bars-plot"
          role="slider"
          tabindex="0"
          aria-label="Your last {recent.length} runs {kindWord}"
          aria-valuemin={0}
          aria-valuemax={recent.length - 1}
          aria-valuenow={barPick}
          aria-valuetext={barText}
          {...barScrub}
        >
          <span class="y-top n" aria-hidden="true">{deepest}</span>
          {#if summary.median !== null}
            <span class="median" style:bottom="{scale(summary.median) * 100}%" aria-hidden="true"></span>
          {/if}
          <ol class="cols" aria-hidden="true">
            {#each recent as r, i (`${r.id}:${r.who ?? ''}`)}
              <li class:on={i === barPick} class:left={r.left}><span class="col" style:height="{Math.max(0.03, scale(r.depth)) * 100}%"></span></li>
            {/each}
          </ol>
        </div>
        <div class="x-ends" aria-hidden="true"><span>older</span><span>latest</span></div>
        <p class="readout" aria-hidden="true"><Num text={barText} /></p>
      </figure>
    {/if}
  {/if}
</section>

<style>
  .typical {
    margin: 0 0 0.6rem;
    font-size: 1.02rem;
  }
  .typical .n {
    color: var(--gold-hi);
  }
  .muted-i {
    font-style: italic;
    color: var(--muted);
  }
  .chart {
    margin: 0.9rem 0 0;
  }
  .cap {
    margin-bottom: 0.45rem;
    font-family: var(--font-display);
    font-size: 0.72rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #d8a26a;
  }
  .cap .muted-i {
    font-family: var(--font-body);
    font-size: 0.85rem;
    letter-spacing: 0;
    text-transform: none;
  }
  .plot {
    position: relative;
    height: 96px;
    margin-left: 1.8rem;
    border-bottom: 1px solid var(--gold-lo);
    background: repeating-linear-gradient(0deg, transparent 0 calc(25% - 1px), rgba(125, 99, 51, 0.14) calc(25% - 1px) 25%);
    touch-action: pan-y;
    cursor: crosshair;
    outline-offset: 4px;
  }
  .y-top {
    position: absolute;
    top: -0.45rem;
    right: calc(100% + 0.4rem);
    font-size: 0.7rem;
    font-weight: 400;
    color: var(--muted);
  }
  .plot svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  .climb {
    fill: none;
    stroke: #e8a36a;
    stroke-width: 2;
    stroke-linejoin: round;
  }
  .climb-fill {
    fill: rgba(224, 138, 68, 0.12);
  }
  .dot {
    position: absolute;
    width: 8px;
    height: 8px;
    translate: -50% -50%;
    rotate: 45deg;
    border: 1px solid #e6c47e;
    background: #1a120a;
    pointer-events: none;
  }
  .dot.on {
    width: 11px;
    height: 11px;
    border-color: #ffd59a;
    background: radial-gradient(circle, #fff1c9, #ff8a32 45%, #c22a10);
    box-shadow: 0 0 8px rgba(255, 120, 50, 0.8);
  }
  .x-ends {
    display: flex;
    justify-content: space-between;
    margin: 0.3rem 0 0 1.8rem;
    font-size: 0.72rem;
    font-weight: 400;
    color: var(--muted);
  }
  .x-ends:not(.n) {
    font-style: italic;
    font-size: 0.85rem;
  }
  .readout :global(.n) {
    font-size: 0.85em;
  }
  .readout {
    min-height: 1.4em;
    margin: 0.35rem 0 0 1.8rem;
    font-size: 0.95rem;
    color: var(--gold-hi);
  }
  .cols {
    list-style: none;
    position: absolute;
    inset: 0;
    margin: 0;
    padding: 0;
    display: flex;
    align-items: stretch;
    gap: 3px;
  }
  .cols li {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
  }
  .col {
    display: block;
    width: 100%;
    max-width: 16px;
    margin: 0 auto;
    border-radius: 2px 2px 0 0;
    background: linear-gradient(180deg, #ff9a4a, #c22a10 60%, #6d0f07);
    opacity: 0.75;
  }
  /* Left standing: hollow, as its phial wasn't emptied. */
  .left .col {
    background: none;
    box-shadow: inset 0 0 0 1px #c9864a;
  }
  .on .col {
    opacity: 1;
    box-shadow: 0 0 10px rgba(255, 120, 50, 0.7);
  }
  .left.on .col {
    box-shadow:
      inset 0 0 0 1px #ffd59a,
      0 0 10px rgba(255, 120, 50, 0.5);
  }
  .median {
    position: absolute;
    left: 0;
    right: 0;
    height: 0;
    border-top: 1px dashed rgba(241, 217, 155, 0.55);
    z-index: 1;
    pointer-events: none;
  }
  .bars-plot .y-top {
    top: -0.55rem;
  }
</style>
