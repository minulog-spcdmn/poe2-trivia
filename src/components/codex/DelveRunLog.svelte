<script lang="ts">
  import { engine } from '../../lib/session.svelte';
  import type { Answer } from '../../lib/codex';
  import { runStory, zoneOf, type RulesGroup } from '../../lib/codexStats';
  import { RUN_LIMIT, runKey, type DelveRun } from '../../lib/delveRecord';
  import { itemImage } from '../../lib/ui';
  import type { Item } from '../../lib/game';

  // Every run kept in full, newest first, folded away until asked for: those
  // of the kind the page shows under the current rules, then those under
  // other rules (or whose rules changed as they were resumed), each group
  // with its own bests.
  let {
    runs,
    others,
    byRun,
    kindWord,
    total,
    onopen,
  }: { runs: DelveRun[]; others: RulesGroup[]; byRun: Map<number, Answer[]>; kindWord: string; total: number; onopen: (item: Item) => void } = $props();

  const when = (t: number) =>
    new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

  // Open from the start when there is nothing above it (only runs under other rules).
  let open = $state<boolean | null>(null);
  const opened = $derived(open ?? (!runs.length && total === 0 && others.length > 0));
  const SHORT = 10;
  let all = $state(false);
  const shown = $derived(all ? runs : runs.slice(0, SHORT));
  const otherCount = $derived(others.reduce((n, g) => n + g.runs.length, 0));

  const who = (r: DelveRun) => (r.hot ? `Hot-seat, ${r.players} players` : r.players < 2 ? 'Alone' : `${r.players} players`);
  function title(r: DelveRun) {
    const losses = r.losses?.length ? `; lives lost at ${r.losses.length > 1 ? 'depths' : 'depth'} ${r.losses.join(', ')}` : '';
    return `${who(r)}, ${when(r.at)}: ${r.left ? 'left at' : 'fell at'} depth ${r.depth}${losses}${r.won ? '; delved deepest of the group' : ''}`;
  }
  /** Where its lives went: a run from before they were kept only shows its fall. */
  const pips = (r: DelveRun) => r.losses ?? (r.left ? [] : [r.depth]);
  /** Ten-depth marks along a run's own length, where there aren't too many. */
  const ticks = (depth: number) => (depth <= 200 ? Array.from({ length: Math.floor((depth - 1) / 10) }, (_, i) => (i + 1) * 10 + 0.5) : []);
</script>

{#snippet row(r: DelveRun)}
  {@const took = runStory(r, byRun.get(r.id) ?? [], engine.byId).lives.filter((l) => l.item)}
  <li class="run" class:won={r.won} class:group={r.players > 1} class:left={r.left}>
    <span class="r-depth n">{r.depth}</span>
    <span class="r-main">
      <span class="r-head">
        <span class="r-who">{who(r)}</span>
        {#if r.won}<span class="badge">Won</span>{/if}
        {#if r.left}<span class="badge quiet">Left</span>{/if}
        <span class="r-zone">{zoneOf(r.depth).name}</span>
      </span>
      <!-- Each run on its own scale, from the first depth to its last: where in it each life went. -->
      <span class="r-track" role="img" aria-label={title(r)}>
        <span class="r-fill"></span>
        {#each ticks(r.depth) as t (t)}<span class="tick" style:left="{(t / r.depth) * 100}%"></span>{/each}
        {#each pips(r) as l, k (k)}
          <span class="pip" class:fall={!r.left && k === (r.losses?.length ?? 1) - 1} style:left="{(l / r.depth) * 100}%"></span>
        {/each}
        {#if r.left}<span class="pip end" style:left="100%"></span>{/if}
      </span>
    </span>
    <span class="r-side">
      <span class="r-date n">{when(r.at)}</span>
      {#if took.length}
        <span class="r-took">
          {#each took as t, k (k)}
            {@const it = t.item as Item}
            <button class="mini" onclick={() => onopen(it)} aria-label="Lost a life at depth {t.depth} to {it.name}">
              <img src={itemImage(it.id)} alt="" loading="lazy" />
            </button>
          {/each}
        </span>
      {/if}
    </span>
  </li>
{/snippet}

<section class="log">
  <button class="toggle" aria-expanded={opened} aria-controls="delve-run-log" onclick={() => (open = !opened)}>
    <span class="t-label">Run log</span>
    <span class="t-note">
      {#if runs.length}{plural(runs.length, 'run')} {kindWord}{/if}{#if runs.length && otherCount}{', '}{/if}{#if otherCount}{otherCount} under other rules{/if}
    </span>
    <span class="chev" class:up={opened} aria-hidden="true"></span>
  </button>
  {#if opened}
    <div id="delve-run-log" class="log-body">
      {#if runs.length}
        <ol class="runs">
          {#each shown as r (runKey(r))}{@render row(r)}{/each}
        </ol>
        {#if runs.length > SHORT}
          <button class="btn ghost small tall more" onclick={() => (all = !all)}>{all ? 'Fewer runs' : `And ${runs.length - SHORT} more`}</button>
        {/if}
        {#if total > runs.length}
          <p class="foot">The last {RUN_LIMIT} runs are kept in full; all {total} count in the numbers above.</p>
        {/if}
      {/if}
      {#each others as g (g.ruleset ?? 'mixed')}
        <div class="rules">
          <h3>{g.ruleset === null ? 'Rules changed during the run' : `Under other rules (${g.ruleset})`}</h3>
          <p class="foot">
            {#if g.ruleset === null}
              Resumed by a build with other rules: never a best, never counted.
            {:else}
              Never compared with today's depths.{' '}{#if g.solo !== null}Best alone <b class="n">{g.solo}</b>{/if}{#if g.solo !== null && g.group !== null}{' • '}{/if}{#if g.group !== null}best together <b class="n">{g.group}</b>{/if}
            {/if}
          </p>
          {#if g.runs.length}
            <ol class="runs">
              {#each g.runs.slice(0, all ? undefined : SHORT) as r (runKey(r))}{@render row(r)}{/each}
            </ol>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</section>

<style>
  .log {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }
  .toggle {
    display: flex;
    align-items: baseline;
    gap: 0.8rem;
    min-height: 44px;
    padding: 0.6rem 0.2rem 0.7rem;
    border: 0;
    border-bottom: 1px solid var(--line);
    background: none;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }
  .t-label {
    font-family: var(--font-display);
    font-size: 1.05rem;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: var(--gold-hi);
  }
  .t-note {
    flex: 1;
    font-size: 0.92rem;
    font-style: italic;
    color: var(--muted);
  }
  .toggle:hover .t-label {
    color: #fff1cf;
  }
  .chev {
    align-self: center;
    width: 8px;
    height: 8px;
    margin-right: 0.4rem;
    border-right: 1.5px solid var(--gold);
    border-bottom: 1.5px solid var(--gold);
    rotate: 45deg;
    translate: 0 -2px;
    transition: rotate 0.2s;
  }
  .chev.up {
    rotate: 225deg;
    translate: 0 2px;
  }
  .log-body {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
  }
  .rules h3 {
    margin: 0.6rem 0 0.2rem;
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.16em;
    color: var(--gold);
  }
  .rules .foot {
    margin: 0 0 0.6rem;
  }
  .runs {
    list-style: none;
    margin: 0;
    padding: 0.2rem 0;
    border: 1px solid #5a3a1c;
    background: rgba(5, 4, 3, 0.92);
    box-shadow: 0 0 0 1px #000;
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
    font-size: 1.6rem;
    line-height: 1;
    text-align: center;
    color: var(--gold-hi);
    text-shadow: 0 0 12px rgba(224, 138, 68, 0.35);
  }
  .left .r-depth {
    color: var(--muted);
    text-shadow: none;
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
  .badge.quiet {
    border-color: var(--line);
    color: var(--muted);
    background: none;
  }
  .r-track {
    position: relative;
    display: block;
    height: 8px;
    margin: 0 6px;
    border-radius: 4px;
    background: #0b0907;
    box-shadow:
      inset 0 0 0 1px rgba(125, 99, 51, 0.35),
      inset 0 1px 2px rgba(0, 0, 0, 0.8);
  }
  .r-fill {
    position: absolute;
    inset: 1px;
    border-radius: 3px;
    background: linear-gradient(90deg, #4d0705, #c22a10 55%, #ff8a32);
    box-shadow: 0 0 8px rgba(224, 85, 40, 0.4);
  }
  .group .r-fill {
    background: linear-gradient(90deg, #3d2205, #b06a1c 55%, #ffc26a);
  }
  .left .r-fill {
    opacity: 0.45;
  }
  .tick {
    position: absolute;
    top: 1px;
    bottom: 1px;
    width: 1px;
    background: rgba(8, 6, 4, 0.55);
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
  .pip.end {
    border-color: var(--muted);
    background: #0b0907;
  }
  .r-side {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.35rem;
  }
  .r-date {
    font-size: 0.74rem;
    font-weight: 400;
    color: var(--muted);
    white-space: nowrap;
  }
  .r-took {
    display: flex;
    gap: 0.25rem;
  }
  .mini {
    width: 40px;
    height: 40px;
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
    width: 32px;
    height: 32px;
    object-fit: contain;
    filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.8));
  }
  .more {
    align-self: center;
  }

  @media (max-width: 560px) {
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
