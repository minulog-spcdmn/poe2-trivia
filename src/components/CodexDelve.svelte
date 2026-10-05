<script lang="ts">
  import { fly } from 'svelte/transition';
  import { engine } from '../lib/session.svelte';
  import type { Codex, Tally } from '../lib/codex';
  import { accuracy, delveItemStats, delveSummary, depthBands, lostTo, nextZone, zoneAtlas, zoneOf, type DelveKind } from '../lib/codexStats';
  import { bestOf, deepestEver, type DelveRecords, type DelveRun } from '../lib/delveRecord';
  import { DELVE_RULESET } from '../lib/delve';
  import { itemImage } from '../lib/ui';
  import { backdropShadow } from '../lib/backdropShadow';
  import type { Item } from '../lib/game';
  import ArcaneCircle from './ArcaneCircle.svelte';

  // The Codex's Delve page: how deep this browser has been, where its lives
  // went, the named depths it has found, and the items that cost it.
  let { codex, records, onopen, onbegin }: { codex: Codex; records: DelveRecords; onopen: (item: Item) => void; onbegin: () => void } = $props();

  const date = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const pct = (t: Tally) => `${Math.round((accuracy(t) ?? 0) * 100)}%`;
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  /** A list read out: "4, 9 and 13". */
  const listed = (xs: (string | number)[]) => (xs.length < 2 ? `${xs[0] ?? ''}` : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
  /** A depth range as the page writes it (an en dash, not a hyphen). */
  const range = (from: number, to: number | null) => (to === null ? `${from}+` : from === to ? `${from}` : `${from}–${to}`);

  const soloBest = $derived(bestOf(records, true));
  const groupBest = $derived(bestOf(records, false));
  const deepest = $derived(deepestEver(records));
  const all = $derived(delveSummary(records));
  const hasRuns = $derived(records.runs.length > 0 || all.runs > 0);

  // ---- the medallion: the deepest, and the way to the next named depth ----

  const here = $derived(zoneOf(deepest));
  const ahead = $derived(nextZone(deepest));
  /** How far from the named depth it lies in toward the next one, never quite there. */
  const toNext = $derived.by(() => {
    if (!ahead || !deepest) return 0;
    const from = here?.depth ?? 1;
    return (deepest - from + 1) / (ahead.depth - from + 1);
  });

  // ---- lives lost by depth ----

  let kind = $state<DelveKind>('all');
  const both = $derived(all.solo > 0 && all.group > 0);
  const shown = $derived(both ? delveSummary(records, kind) : all);
  /** At most this many columns; deeper charts put several depths in one. */
  const MAX_COLUMNS = 50;
  const chart = $derived.by(() => {
    const depthsShown = Math.max(10, shown.depths.length);
    const size = Math.ceil(depthsShown / MAX_COLUMNS);
    const count = Math.ceil(depthsShown / size);
    const cols = Array.from({ length: count }, (_, i) => {
      const from = i * size + 1;
      const to = from + size - 1;
      const inside = shown.depths.filter((d) => d.depth >= from && d.depth <= to);
      const zone = Array.from({ length: size }, (_, k) => from + k).find((d) => zoneAt(d));
      return {
        from,
        to,
        ends: inside.reduce((n, d) => n + d.ends, 0),
        lost: inside.reduce((n, d) => n + d.lost, 0),
        zone: zone === undefined ? null : { depth: zone, name: zoneAt(zone)! },
      };
    });
    const top = Math.max(1, ...cols.map((c) => c.ends + c.lost));
    const last = count * size;
    const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find((s) => last / s <= 6) ?? 1000;
    const ticks = [1, ...Array.from({ length: Math.floor(last / step) }, (_, i) => (i + 1) * step)].filter((d, i, a) => d <= last && (i === 0 || d - a[0] >= step / 2));
    return { cols, top, size, last, ticks: ticks.map((d) => ({ depth: d, at: ((Math.floor((d - 1) / size) + 0.5) / count) * 100 })) };
  });
  /** Named depths in the chart, read through the atlas so a name is looked up once. */
  const atlas = $derived(zoneAtlas(records.frontier));
  const zoneNames = $derived(new Map(atlas.map((z) => [z.depth, z.name])));
  const zoneAt = (d: number) => zoneNames.get(d) ?? null;
  const chartLabel = $derived.by(() => {
    if (!shown.runs) return 'No runs yet.';
    const worst = shown.depths.reduce((a, b) => (b.ends + b.lost > a.ends + a.lost ? b : a));
    return `Lives lost by depth, depths 1 to ${chart.last}: most at depth ${worst.depth}, ${plural(worst.ends + worst.lost, 'life', 'lives')}.`;
  });
  const colTitle = (c: (typeof chart.cols)[number]) =>
    `${chart.size > 1 ? `Depths ${range(c.from, c.to)}` : `Depth ${c.from}`}: ${c.ends || c.lost ? [c.ends ? `${plural(c.ends, 'run')} ended` : '', c.lost ? `${plural(c.lost, 'earlier life', 'earlier lives')} lost` : ''].filter(Boolean).join(', ') : 'no lives lost'}${c.zone ? `. ${c.zone.name} begins at ${c.zone.depth}` : ''}`;

  // ---- the atlas ----

  const found = $derived(atlas.filter((z) => z.at !== null).length);
  /** Where the deepest goes in the atlas: after the last named depth it reached. */
  const markAfter = $derived(deepest && !atlas.some((z) => z.depth === deepest) ? atlas.findLastIndex((z) => z.depth <= deepest) : null);

  // ---- items ----

  const items = $derived(delveItemStats(codex, engine.items));
  const bands = $derived(depthBands(codex, deepest).filter((b) => b.tally.n || b.from <= deepest));

  // ---- the runs ----

  const lost = $derived(lostTo(codex, engine.items));
  const SHORT_LIST = 8;
  let allRuns = $state(false);
  const runs = $derived([...records.runs].reverse());
  const listedRuns = $derived(allRuns ? runs : runs.slice(0, SHORT_LIST));
  const runScale = $derived(Math.max(10, ...runs.map((r) => r.depth)));
  const who = (r: DelveRun) => (r.players < 2 ? 'Alone' : `${r.players} players`);
  function runTitle(r: DelveRun) {
    const losses = r.losses?.length ? `; lives lost at ${r.losses.length > 1 ? 'depths' : 'depth'} ${listed(r.losses)}` : '';
    return `${who(r)}, ${date(r.at)}: fell at depth ${r.depth}${losses}${r.won ? '; delved deepest of the group' : ''}`;
  }
</script>

{#snippet thumb(it: Item)}
  <span class="thumb"><img src={itemImage(it.id)} alt="" loading="lazy" /></span>
{/snippet}

{#snippet mark()}
  <li class="mark">
    <span class="node" aria-hidden="true"></span>
    <span class="z-depth">{deepest}</span>
    <span class="z-name">Your deepest</span>
    <span class="z-when"></span>
  </li>
{/snippet}

{#snippet meter(t: Tally)}
  <span class="meter"><span class="fill" style:width="{(accuracy(t) ?? 0) * 100}%"></span></span>
{/snippet}

<div class="delve-page">
  {#if hasRuns}
    <section class="summary" in:fly={{ y: 20, duration: 700, delay: 100 }}>
      <div class="side">
        <div class="stat">
          <span class="stat-label">Deepest alone</span>
          <span class="stat-value">{soloBest?.depth ?? '?'}</span>
          <span class="stat-note">{soloBest ? date(soloBest.at) : 'no run alone yet'}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Deepest together</span>
          <span class="stat-value">{groupBest?.depth ?? '?'}</span>
          <span class="stat-note">{groupBest ? `${groupBest.players} players${groupBest.won ? ', delved deepest' : ''}` : 'no group run yet'}</span>
        </div>
      </div>

      <div
        class="medallion"
        role="img"
        aria-label="Deepest you have been: depth {deepest}{here ? `, in ${here.name}` : ''}{ahead ? `. ${plural(ahead.depth - deepest, 'depth')} to the next named depth` : ''}."
      >
        <ArcaneCircle size="100%" strength={0.3} />
        <svg class="progress" viewBox="-100 -100 200 200" aria-hidden="true">
          <defs>
            <linearGradient id="delve-arc" x1="0" y1="-1" x2="0" y2="1">
              <stop offset="0" stop-color="#ffd59a" />
              <stop offset="0.5" stop-color="#e08a44" />
              <stop offset="1" stop-color="#c22a10" />
            </linearGradient>
          </defs>
          <circle class="track" r="80" />
          {#if toNext > 0}<circle class="arc" r="80" pathLength="100" style:stroke-dasharray="{toNext * 100} 100" />{/if}
        </svg>
        <div class="medal-text" aria-hidden="true">
          <span class="medal-label">deepest</span>
          <span class="medal-value">{deepest}</span>
          <span class="medal-zone">{here?.name ?? 'The surface'}</span>
          {#if ahead}<span class="medal-next">{ahead.depth - deepest} to the next</span>{/if}
        </div>
      </div>

      <div class="side">
        <div class="stat">
          <span class="stat-label">Runs</span>
          <span class="stat-value">{all.runs}</span>
          <span class="stat-note">{all.group ? `${all.solo} alone, ${all.group} together` : 'all of them alone'}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Typical depth</span>
          <span class="stat-value">{all.median === null ? '?' : Math.round(all.median)}</span>
          <span class="stat-note">{all.mean === null ? 'where runs end' : `average ${all.mean.toFixed(1)}`}{all.wins ? `; ${plural(all.wins, 'group win')}` : ''}</span>
        </div>
      </div>
    </section>
  {:else}
    <div class="empty" in:fly={{ y: 20, duration: 700, delay: 100 }}>
      <p>You have not delved yet.</p>
      <p class="muted">
        Three lives, one depth deeper every round, and the same rules for everyone. Your runs, the named depths you reach and the items that cost you
        lives are written here.
      </p>
      <button class="btn primary" onclick={onbegin}>Begin the descent</button>
    </div>
  {/if}

  <div class="split" class:solo-atlas={!hasRuns} in:fly={{ y: 20, duration: 700, delay: 200 }}>
    {#if hasRuns}
      <section class="panel" use:backdropShadow={{ fill: 'linear' }}>
        <header>
          <h2>Lives lost by depth</h2>
          {#if both}
            <div class="seg" role="group" aria-label="Runs shown">
              {#each [['all', 'All'], ['solo', 'Alone'], ['group', 'Together']] as [k, label] (k)}
                <button class:on={kind === k} aria-pressed={kind === k} onclick={() => (kind = k as DelveKind)}>{label}</button>
              {/each}
            </div>
          {/if}
        </header>
        <figure class="chart">
          <div class="plot" role="img" aria-label={chartLabel}>
            <span class="y-top" aria-hidden="true">{plural(chart.top, 'life', 'lives')}</span>
            <ol class="cols" class:dense={chart.cols.length > 30} aria-hidden="true">
              {#each chart.cols as c (c.from)}
                <li title={colTitle(c)} class:zone={!!c.zone}>
                  {#if c.ends}<span class="ends" style:height="{(c.ends / chart.top) * 100}%"></span>{/if}
                  {#if c.lost}<span class="lost" style:height="{(c.lost / chart.top) * 100}%"></span>{/if}
                </li>
              {/each}
            </ol>
          </div>
          <div class="x-axis" aria-hidden="true">
            {#each chart.ticks as t (t.depth)}<span style:left="{t.at}%">{t.depth}</span>{/each}
          </div>
          <table class="sr-only">
            <caption>Lives lost by depth</caption>
            <thead><tr><th>Depth</th><th>Runs ended</th><th>Earlier lives lost</th></tr></thead>
            <tbody>
              {#each shown.depths.filter((d) => d.ends || d.lost) as d (d.depth)}
                <tr><td>{d.depth}</td><td>{d.ends}</td><td>{d.lost}</td></tr>
              {/each}
            </tbody>
          </table>
          <figcaption class="legend">
            <span><i class="key ends"></i>Last life (where a run ended)</span>
            <span><i class="key lost"></i>Earlier lives</span>
            <span><i class="key zone"></i>Named depth</span>
          </figcaption>
        </figure>
      </section>
    {/if}

    <section class="panel" use:backdropShadow={{ fill: 'linear' }}>
      <header>
        <h2>Named depths</h2>
        <span class="col-label">{found} of {atlas.length} found</span>
      </header>
      <ol class="atlas">
        {#if markAfter === -1}{@render mark()}{/if}
        {#each atlas as z, i (z.depth)}
          <li class:found={z.at !== null} class:here={here?.depth === z.depth}>
            <span class="node" aria-hidden="true"></span>
            <span class="z-depth">{z.depth}</span>
            {#if z.at !== null}
              <span class="z-name">{z.name}</span>
              <span class="z-when" title="First reached {date(z.at)}">{date(z.at)}</span>
            {:else}
              <span class="z-name unknown" aria-label="Undiscovered">???</span>
              <span class="z-when"></span>
            {/if}
          </li>
          {#if i === markAfter}{@render mark()}{/if}
        {/each}
      </ol>
    </section>
  </div>

  {#if hasRuns}
    <div class="insights" in:fly={{ y: 20, duration: 700, delay: 300 }}>
      <section class="panel" use:backdropShadow={{ fill: 'linear' }}>
        <header><h2>Cost you lives</h2><span class="col-label">Lives</span></header>
        {#if items.costly.length}
          <ul class="rows">
            {#each items.costly as c (c.item.id)}
              <li>
                <button class="row" onclick={() => onopen(c.item)} title="Cost you {plural(c.lives, 'life', 'lives')}, the deepest at depth {c.at}">
                  {@render thumb(c.item)}
                  <span class="row-name"><span>{c.item.name}</span><small>{c.at ? `deepest at depth ${c.at}` : c.item.base}</small></span>
                  <b>{c.lives}</b>
                </button>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="hint">The items you miss in Delve, each one a life, show up here.</p>
        {/if}
      </section>

      <section class="panel" use:backdropShadow={{ fill: 'linear' }}>
        <header><h2>Deepest answers</h2><span class="col-label">Depth</span></header>
        {#if items.deepest.length}
          <ul class="rows">
            {#each items.deepest as d (d.item.id)}
              <li>
                <button class="row" onclick={() => onopen(d.item)} title="Named right at depth {d.depth}">
                  {@render thumb(d.item)}
                  <span class="row-name"><span>{d.item.name}</span><small>{zoneOf(d.depth)?.name ?? 'The surface'}</small></span>
                  <b>{d.depth}</b>
                </button>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="hint">The items you name right at your greatest depths show up here.</p>
        {/if}
      </section>

      <section class="panel" use:backdropShadow={{ fill: 'linear' }}>
        <header><h2>By depth</h2><span class="col-label">Accuracy</span></header>
        {#if items.answers.n}
          <ul class="bands">
            {#each bands as b (b.from)}
              <li title="Depths {range(b.from, b.to)}: {b.tally.n ? `${b.tally.ok} of ${plural(b.tally.n, 'answer')} right` : 'no answers'}">
                <span class="band-name"><span>{b.name ?? 'The surface'}</span><small>{range(b.from, b.to)}</small></span>
                {@render meter(b.tally)}
                <span class="band-value">{#if b.tally.n}{pct(b.tally)} <small>of {b.tally.n}</small>{:else}<small>none</small>{/if}</span>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="hint">How often you answer right, from one named depth to the next.</p>
        {/if}
      </section>
    </div>

    {#if runs.length}
      <section class="runs-section" in:fly={{ y: 20, duration: 700, delay: 350 }}>
        <div class="bar">
          <h2>Last runs</h2>
          <span class="muted">{runs.length > SHORT_LIST && !allRuns ? `${SHORT_LIST} of ${runs.length}` : plural(runs.length, 'run')}</span>
        </div>
        <ol class="runs" use:backdropShadow={{ fill: 'linear' }}>
          {#each listedRuns as r (r.id)}
            {@const took = lost.get(r.id) ?? []}
            {@const zone = zoneOf(r.depth)}
            <li class="run" class:won={r.won} class:group={r.players > 1}>
              <span class="r-depth" title="Fell at depth {r.depth}">{r.depth}</span>
              <span class="r-main">
                <span class="r-head">
                  <span class="r-who">{who(r)}</span>
                  {#if r.won}<span class="badge" title="Delved deepest of the group">Won</span>{/if}
                  {#if r.mixed || r.ruleset !== DELVE_RULESET}<span class="badge old" title="Played under other rules; never counts as a best">Older rules</span>{/if}
                  <span class="r-zone">{zone?.name ?? 'The surface'}</span>
                </span>
                <span class="r-track" role="img" aria-label={runTitle(r)} title={runTitle(r)}>
                  <span class="r-fill" style:width="{(r.depth / runScale) * 100}%"></span>
                  {#each r.losses ?? [r.depth] as l, k (k)}
                    <span class="pip" class:fall={k === (r.losses?.length ?? 1) - 1} style:left="{(l / runScale) * 100}%"></span>
                  {/each}
                </span>
              </span>
              <span class="r-side">
                <span class="r-date">{date(r.at)}</span>
                {#if took.length}
                  <span class="r-took">
                    <span class="r-took-label">lost to</span>
                    {#each took as t, k (k)}
                      <button class="mini" onclick={() => onopen(t.item)} title="Cost you a life at depth {t.depth}: {t.item.name}" aria-label="Cost you a life at depth {t.depth}: {t.item.name}">
                        <img src={itemImage(t.item.id)} alt="" loading="lazy" />
                      </button>
                    {/each}
                  </span>
                {/if}
              </span>
            </li>
          {/each}
        </ol>
        {#if runs.length > SHORT_LIST}
          <button class="btn ghost small more" onclick={() => (allRuns = !allRuns)}>{allRuns ? 'Fewer runs' : `All ${runs.length} runs`}</button>
        {/if}
      </section>
    {/if}
  {/if}
</div>

<style>
  .delve-page {
    display: flex;
    flex-direction: column;
    gap: 1.4rem;
  }

  /* ---- summary: as the collection's, the deepest in the medallion ---- */
  .summary {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 1.5rem;
  }
  .side {
    display: flex;
    justify-content: space-evenly;
    gap: 1rem;
  }
  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    min-width: 0;
  }
  .stat-label,
  .medal-label {
    font-family: var(--font-display);
    font-size: 0.74rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .stat-label {
    margin-bottom: 0.35rem;
  }
  .stat-value,
  .medal-value {
    font-family: var(--font-cinzel);
    font-weight: 700;
    line-height: 1;
    background: linear-gradient(180deg, #fff1c9 15%, #d7b068 55%, #9a7230 95%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.8));
  }
  .stat-value {
    font-size: 2.3rem;
    margin-bottom: 0.3rem;
  }
  .stat-note {
    font-size: 0.92rem;
    line-height: 1.3;
    font-style: italic;
    color: var(--muted);
  }
  .medallion {
    grid-column: 2;
    position: relative;
    isolation: isolate;
    width: 240px;
    height: 240px;
    display: grid;
    place-items: center;
  }
  .medallion :global(.arcane) {
    z-index: -1;
  }
  .progress {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    rotate: -90deg;
    overflow: visible;
  }
  .track {
    fill: rgba(8, 6, 4, 0.78);
    stroke: rgba(125, 99, 51, 0.35);
    stroke-width: 6;
  }
  .arc {
    fill: none;
    stroke: url(#delve-arc);
    stroke-width: 4;
    stroke-linecap: round;
    filter: drop-shadow(0 0 4px rgba(224, 108, 50, 0.85));
    animation: fill-arc 1.6s var(--ease-out) 0.4s both;
  }
  @keyframes fill-arc {
    from {
      stroke-dasharray: 0 100;
    }
  }
  .medal-text {
    position: relative;
    width: 150px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
  .medal-label {
    font-size: 0.68rem;
  }
  .medal-value {
    font-size: 3.2rem;
    margin: 0.15rem 0 0.25rem;
  }
  .medal-zone {
    font-family: var(--font-display);
    font-size: 0.78rem;
    line-height: 1.25;
    letter-spacing: 0.06em;
    color: var(--gold);
  }
  .medal-next {
    margin-top: 0.2rem;
    font-size: 0.82rem;
    font-style: italic;
    color: var(--muted);
  }

  .empty {
    width: min(520px, 100%);
    margin: 0 auto;
    text-align: center;
  }
  .empty p:first-child {
    margin: 0 0 0.4rem;
    font-family: var(--font-display);
    font-size: 1.3rem;
    color: var(--gold-hi);
  }
  .empty p {
    margin: 0 0 1.4rem;
  }

  /* ---- panels, as the collection's ---- */
  .split {
    display: grid;
    grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
    gap: 1rem;
  }
  .split.solo-atlas {
    grid-template-columns: minmax(0, 1fr);
    width: min(520px, 100%);
    margin: 0 auto;
  }
  .insights {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 1rem;
  }
  .panel {
    padding: 1.2rem 1.3rem 1.3rem;
    min-width: 0;
  }
  .panel header {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: center;
    gap: 0.4rem 0.8rem;
    margin-bottom: 0.9rem;
    padding-bottom: 0.6rem;
    border-bottom: 1px solid var(--line);
    min-height: 2.3rem;
  }
  .panel h2 {
    font-size: 0.95rem;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: var(--gold-hi);
  }
  .col-label {
    font-family: var(--font-display);
    font-size: 0.72rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #d8a26a;
  }
  .hint {
    margin: 0;
    font-size: 0.95rem;
    font-style: italic;
    color: var(--muted);
  }
  .seg {
    display: flex;
    gap: 0.25rem;
  }
  .seg > button {
    padding: 0.3rem 0.55rem;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 0.7rem;
    letter-spacing: 0.04em;
    color: var(--muted);
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid var(--line);
    border-radius: 3px;
    cursor: pointer;
    transition: all 0.2s;
  }
  .seg > button:hover {
    color: var(--gold-hi);
    border-color: var(--gold-lo);
  }
  .seg > button.on {
    color: #fff1cf;
    background: linear-gradient(180deg, #8a5a22, #452a0e);
    border-color: var(--gold);
    box-shadow: inset 0 1px 0 rgba(255, 230, 170, 0.3);
  }

  /* ---- the chart: a column per depth, ember for the falls, gold for the lives before ---- */
  .chart {
    margin: 0;
  }
  .plot {
    position: relative;
    height: 150px;
    padding-top: 1rem;
    border-bottom: 1px solid var(--gold-lo);
    background: repeating-linear-gradient(0deg, transparent 0 calc(25% - 1px), rgba(125, 99, 51, 0.14) calc(25% - 1px) 25%) 0 1rem / 100% calc(100% - 1rem) no-repeat;
  }
  .y-top {
    position: absolute;
    top: -0.2rem;
    left: 0;
    font-size: 0.8rem;
    font-style: italic;
    color: var(--muted);
  }
  .cols {
    list-style: none;
    margin: 0;
    padding: 0;
    height: 100%;
    display: flex;
    align-items: stretch;
    gap: 2px;
  }
  .cols.dense {
    gap: 1px;
  }
  .cols li {
    position: relative;
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column-reverse;
  }
  /* Where a named depth begins: a hairline up the plot, crowned with a small lozenge. */
  .cols li.zone::before {
    content: '';
    position: absolute;
    left: 50%;
    top: -0.5rem;
    bottom: 0;
    width: 1px;
    background: linear-gradient(180deg, rgba(185, 207, 240, 0.55), rgba(185, 207, 240, 0.05));
  }
  .cols li.zone::after {
    content: '';
    position: absolute;
    left: calc(50% - 3px);
    top: -0.75rem;
    width: 5px;
    height: 5px;
    rotate: 45deg;
    border: 1px solid #b9cff0;
    background: #10141c;
  }
  .ends,
  .lost {
    position: relative;
    display: block;
    width: 100%;
    max-width: 18px;
    margin: 0 auto;
  }
  .ends {
    border-radius: 0 0 1px 1px;
    background: linear-gradient(180deg, #ff9a4a, #c22a10 60%, #6d0f07);
    box-shadow: 0 0 8px rgba(224, 85, 40, 0.45);
  }
  .lost {
    border-radius: 2px 2px 0 0;
    background: linear-gradient(180deg, #e6c47e, #8a6428);
    opacity: 0.8;
  }
  .lost:last-child,
  .ends:last-child {
    border-top-left-radius: 2px;
    border-top-right-radius: 2px;
  }
  .x-axis {
    position: relative;
    height: 1.3rem;
    margin-top: 0.25rem;
  }
  .x-axis span {
    position: absolute;
    translate: -50% 0;
    font-family: var(--font-cinzel);
    font-size: 0.72rem;
    color: var(--muted);
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem 1rem;
    margin-top: 0.5rem;
    font-size: 0.88rem;
    font-style: italic;
    color: var(--muted);
  }
  .legend span {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
  .key {
    width: 10px;
    height: 10px;
    border-radius: 1px;
  }
  .key.ends {
    background: linear-gradient(180deg, #ff9a4a, #c22a10);
  }
  .key.lost {
    background: linear-gradient(180deg, #e6c47e, #8a6428);
  }
  .key.zone {
    width: 6px;
    height: 6px;
    margin: 0 2px;
    rotate: 45deg;
    border: 1px solid #b9cff0;
  }

  /* ---- the atlas: the named depths strung down a shaft ---- */
  .atlas {
    position: relative;
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: 14px auto minmax(0, 1fr) auto;
    column-gap: 0.6rem;
    row-gap: 0.45rem;
  }
  .atlas::before {
    content: '';
    position: absolute;
    left: 6px;
    top: 0.6rem;
    bottom: 0.6rem;
    width: 1px;
    background: linear-gradient(180deg, var(--gold-lo), rgba(125, 99, 51, 0.15));
  }
  .atlas li {
    display: contents;
  }
  .node {
    position: relative;
    align-self: center;
    justify-self: center;
    width: 8px;
    height: 8px;
    rotate: 45deg;
    border: 1px solid rgba(125, 99, 51, 0.6);
    background: var(--bg);
  }
  .found .node {
    border-color: var(--gold);
    background: linear-gradient(135deg, #fbe6b0, #8a6428);
    box-shadow: 0 0 6px rgba(224, 138, 68, 0.6);
  }
  .here .node {
    border-color: #ffd59a;
    background: linear-gradient(135deg, #ffd59a, #c22a10);
    box-shadow: 0 0 10px rgba(255, 120, 50, 0.8);
  }
  .z-depth {
    align-self: baseline;
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 0.82rem;
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: var(--muted);
  }
  .found .z-depth {
    color: var(--gold-hi);
  }
  .z-name {
    align-self: baseline;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-display);
    font-size: 0.86rem;
    letter-spacing: 0.04em;
    color: var(--text);
  }
  .here .z-name {
    color: var(--gold-hi);
  }
  .z-name.unknown {
    font-family: var(--font-cinzel);
    letter-spacing: 0.3em;
    color: rgba(150, 138, 119, 0.55);
  }
  .z-when {
    align-self: baseline;
    font-family: var(--font-cinzel);
    font-size: 0.72rem;
    color: var(--muted);
    white-space: nowrap;
  }
  .mark .node {
    width: 5px;
    height: 5px;
    border: 0;
    border-radius: 50%;
    rotate: none;
    background: #ff8a32;
    box-shadow: 0 0 8px 2px rgba(255, 110, 40, 0.7);
  }
  .mark .z-depth,
  .mark .z-name {
    font-family: var(--font-body);
    font-style: italic;
    font-weight: 400;
    font-size: 0.9rem;
    letter-spacing: 0;
    color: #e8a36a;
  }
  .mark .z-depth {
    font-family: var(--font-cinzel);
    font-style: normal;
    font-size: 0.78rem;
  }

  /* ---- rows of items, as the collection's ---- */
  .rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0.35rem 0.7rem 0.35rem 0.35rem;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid rgba(59, 48, 36, 0.6);
    color: var(--text);
    font-size: 1rem;
    text-align: left;
    cursor: pointer;
    transition:
      border-color 0.25s,
      background 0.25s,
      color 0.25s;
  }
  .row:hover {
    border-color: var(--gold-lo);
    background: rgba(0, 0, 0, 0.4);
    color: var(--gold-hi);
  }
  .row b {
    font-family: var(--font-cinzel);
    font-size: 0.95rem;
    color: var(--gold);
    white-space: nowrap;
  }
  .row-name {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    line-height: 1.2;
  }
  .row-name > * {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .row-name small {
    font-size: 0.85rem;
    font-style: italic;
    color: var(--muted);
  }
  .thumb {
    flex: none;
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    border-radius: 3px;
    background:
      radial-gradient(ellipse 60% 55% at 50% 50%, rgba(175, 96, 37, 0.22), transparent 70%),
      linear-gradient(180deg, #0c0d12, #060709);
    box-shadow: inset 0 0 0 1px rgba(90, 58, 28, 0.6);
  }
  .thumb img {
    width: 34px;
    height: 34px;
    object-fit: contain;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.8));
  }

  /* ---- accuracy by named depth ---- */
  .bands {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
  }
  .bands li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(36px, 5rem) 4.4rem;
    align-items: center;
    gap: 0.6rem;
  }
  .band-name {
    min-width: 0;
    display: flex;
    flex-direction: column;
    line-height: 1.15;
  }
  .band-name > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.95rem;
  }
  .band-name small {
    font-family: var(--font-cinzel);
    font-size: 0.7rem;
    color: var(--muted);
  }
  .band-value {
    font-family: var(--font-cinzel);
    font-size: 0.85rem;
    text-align: right;
    white-space: nowrap;
  }
  .band-value small {
    font-family: var(--font-body);
    font-size: 0.85rem;
    color: var(--muted);
  }
  .meter {
    position: relative;
    display: block;
    height: 6px;
    min-width: 0;
    border-radius: 3px;
    background: #0b0907;
    box-shadow:
      inset 0 0 0 1px rgba(125, 99, 51, 0.35),
      inset 0 1px 2px rgba(0, 0, 0, 0.8);
  }
  .fill {
    position: absolute;
    inset: 0 auto 0 0;
    border-radius: 3px;
    background: linear-gradient(90deg, #6d4a1c, #c9a45c 70%, #f1d99b);
    box-shadow: 0 0 8px rgba(224, 138, 68, 0.45);
  }

  /* ---- the runs: each one a phial laid on its side, as long as it went deep ---- */
  .runs-section {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }
  .runs-section > .bar {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding-bottom: 0.7rem;
    border-bottom: 1px solid var(--line);
  }
  .runs-section h2 {
    margin: 0;
    font-size: 1.05rem;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: var(--gold-hi);
  }
  .runs-section .muted {
    font-size: 0.92rem;
    font-style: italic;
  }
  .runs {
    list-style: none;
    margin: 0;
    padding: 0.2rem 0;
    border: 1px solid #5a3a1c;
    --bs-fill-a: rgba(5, 4, 3, 0.92);
    --bs-fill-b: rgba(5, 4, 3, 0.92);
    background: var(--bs-fill-paint, linear-gradient(var(--bs-fill-a), var(--bs-fill-b)));
    --bs2: 20px 60px;
    --bs2-color: rgba(0, 0, 0, 0.7);
    box-shadow:
      0 0 0 1px #000,
      var(--bs-soft-paint, 0 var(--bs2, 0 0) var(--bs2-color, transparent));
  }
  .run {
    display: grid;
    grid-template-columns: 3.4rem minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.4rem 1rem;
    padding: 0.6rem 1rem;
  }
  .run + .run {
    border-top: 1px solid #1d150c;
  }
  .r-depth {
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 1.6rem;
    line-height: 1;
    text-align: center;
    color: var(--gold-hi);
    text-shadow: 0 0 12px rgba(224, 138, 68, 0.35);
  }
  .r-main {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }
  .r-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.2rem 0.6rem;
    min-width: 0;
  }
  .r-who {
    font-family: var(--font-display);
    font-size: 0.85rem;
    letter-spacing: 0.08em;
    color: var(--text);
  }
  .r-zone {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.92rem;
    font-style: italic;
    color: var(--muted);
  }
  .badge {
    align-self: center;
    padding: 0.05rem 0.45rem 0;
    border: 1px solid var(--gold-lo);
    border-radius: 999px;
    font-family: var(--font-display);
    font-size: 0.62rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--gold-hi);
    background: rgba(138, 90, 34, 0.25);
  }
  .badge.old {
    border-color: var(--line);
    color: var(--muted);
    background: none;
  }
  .r-track {
    position: relative;
    display: block;
    height: 8px;
    margin-right: 6px;
    border-radius: 4px;
    background: #0b0907;
    box-shadow:
      inset 0 0 0 1px rgba(125, 99, 51, 0.35),
      inset 0 1px 2px rgba(0, 0, 0, 0.8);
  }
  .r-fill {
    position: absolute;
    inset: 1px auto 1px 1px;
    border-radius: 3px;
    background: linear-gradient(90deg, #4d0705, #c22a10 55%, #ff8a32);
    box-shadow: 0 0 8px rgba(224, 85, 40, 0.4);
  }
  .group .r-fill {
    background: linear-gradient(90deg, #3d2205, #b06a1c 55%, #ffc26a);
    box-shadow: 0 0 8px rgba(224, 138, 68, 0.35);
  }
  /* A life lost there: a notch in the phial; the last one, where the run ended, burns. */
  .pip {
    position: absolute;
    top: 50%;
    width: 8px;
    height: 8px;
    translate: -50% -50%;
    rotate: 45deg;
    border: 1px solid #e6c47e;
    background: #1a120a;
  }
  .pip.fall {
    width: 10px;
    height: 10px;
    border-color: #ffd59a;
    background: radial-gradient(circle, #fff1c9, #ff8a32 45%, #c22a10);
    box-shadow: 0 0 8px rgba(255, 120, 50, 0.8);
  }
  .r-side {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.35rem;
  }
  .r-date {
    font-family: var(--font-cinzel);
    font-size: 0.78rem;
    color: var(--muted);
    white-space: nowrap;
  }
  .r-took {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  .r-took-label {
    margin-right: 0.25rem;
    font-size: 0.85rem;
    font-style: italic;
    color: var(--muted);
  }
  .mini {
    width: 30px;
    height: 30px;
    padding: 0;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 3px;
    background:
      radial-gradient(ellipse 60% 55% at 50% 50%, rgba(194, 42, 16, 0.25), transparent 70%),
      linear-gradient(180deg, #0c0d12, #060709);
    box-shadow: inset 0 0 0 1px rgba(110, 40, 22, 0.7);
    cursor: pointer;
    transition: box-shadow 0.2s;
  }
  .mini:hover {
    box-shadow:
      inset 0 0 0 1px var(--gold),
      0 0 10px rgba(224, 138, 68, 0.35);
  }
  .mini img {
    width: 25px;
    height: 25px;
    object-fit: contain;
    filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.8));
  }
  .more {
    align-self: center;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }

  @media (max-width: 900px) {
    .summary {
      grid-template-columns: 1fr 1fr;
      row-gap: 1rem;
    }
    .medallion {
      grid-column: 1 / -1;
      grid-row: 1;
      justify-self: center;
    }
    .split {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  @media (max-width: 560px) {
    .summary {
      grid-template-columns: 1fr;
      row-gap: 1.75rem;
    }
    .side {
      justify-content: space-around;
    }
    .medallion {
      width: 210px;
      height: 210px;
    }
    .medal-value {
      font-size: 2.8rem;
    }
    .stat-value {
      font-size: 1.9rem;
    }
    .panel {
      padding: 1rem 1rem 1.1rem;
    }
    .run {
      grid-template-columns: 2.6rem minmax(0, 1fr);
      padding: 0.6rem 0.8rem;
      column-gap: 0.7rem;
    }
    .r-depth {
      grid-row: span 2;
      font-size: 1.35rem;
    }
    .r-side {
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
    }
  }
</style>
