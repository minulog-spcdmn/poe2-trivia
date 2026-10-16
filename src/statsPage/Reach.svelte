<script lang="ts">
  // How deep Delve runs get: each ten depths a row, its zone named with the
  // zone's colour beside it, a bar from the left as long as the share of runs
  // that got that deep (all of them at the top, fewer each row down), and
  // how many ended there. The row half of all runs end by is marked.
  import { accentAt, stratumName } from '../lib/descent';
  import { fmt } from './chart';
  import { descentOf, medianRange } from './model';

  let { ranges }: { ranges: { from: number; count: number }[] } = $props();

  const rows = $derived(descentOf(ranges));
  const total = $derived(rows[0]?.reached ?? 0);
  const median = $derived(medianRange(ranges));
  const pc = (v: number) => (total ? Math.round((100 * v) / total) : 0);
</script>

{#if !total}
  <p class="empty">No Delve runs ended in these days.</p>
{:else}
  <div class="reach" role="table" aria-label="Share of Delve runs reaching each ten depths">
    <div class="row head" role="row">
      <span role="columnheader">Depth</span>
      <span role="columnheader">Reached</span>
      <span role="columnheader" class="n">Ended</span>
    </div>
    {#each rows as r (r.from)}
      <div class="row" class:median={r.from === median} role="row">
        <span class="zone" role="rowheader">
          <i style:background={accentAt(r.from + 1)}></i>
          <b>{r.from}–{r.from + 9}</b>
          <span>{stratumName(r.from / 10)}</span>
        </span>
        <span class="bar" role="cell">
          <span class="track"><i style:width="{Math.max(0.5, (100 * r.reached) / total)}%"></i></span>
          <b>{pc(r.reached)}%</b>
        </span>
        <span class="n" role="cell">{fmt(r.ended)}</span>
      </div>
    {/each}
  </div>
  <p class="foot"><i class="mark"></i>Half of all runs end by here</p>
{/if}

<style>
  .reach {
    display: grid;
    grid-template-columns: minmax(11.5rem, 1.1fr) minmax(5rem, 2fr) 3.4rem;
    column-gap: 1.2rem;
  }
  .row {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: subgrid;
    align-items: center;
    min-height: 2.35rem;
    border-top: 1px solid rgba(59, 48, 36, 0.55);
  }
  .row.head {
    min-height: 0;
    padding-bottom: 0.5rem;
    border-top: 0;
    font-family: var(--font-cinzel);
    font-size: 0.64rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .row.median {
    background: linear-gradient(90deg, rgba(201, 164, 92, 0.1), transparent 80%);
    box-shadow: inset 2px 0 0 var(--gold);
  }
  .zone {
    display: grid;
    grid-template-columns: 0.5rem 3.1rem minmax(0, 1fr);
    align-items: center;
    column-gap: 0.5rem;
    padding-left: 0.5rem;
    min-width: 0;
  }
  .zone i {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
  }
  .zone b {
    font-family: var(--font-cinzel);
    font-size: 0.78rem;
    font-variant-numeric: tabular-nums;
  }
  .zone span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.95rem;
  }
  .bar {
    display: grid;
    grid-template-columns: minmax(2rem, 1fr) 2.8rem;
    align-items: center;
    column-gap: 0.6rem;
  }
  .track {
    height: 0.7rem;
  }
  .track i {
    display: block;
    height: 100%;
    background: var(--gold);
    border-radius: 0 3px 3px 0;
    transition: width 0.5s var(--ease-out);
  }
  .bar b {
    font-family: var(--font-cinzel);
    font-size: 0.9rem;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .n {
    text-align: right;
    font-family: var(--font-cinzel);
    font-size: 0.85rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    padding-right: 0.2rem;
  }
  .foot {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0.8rem 0 0;
    font-size: 0.85rem;
    color: var(--muted);
  }
  .mark {
    width: 2px;
    height: 0.9rem;
    background: var(--gold);
  }
  .empty {
    margin: 0;
    color: var(--muted);
    font-style: italic;
  }
  @media (prefers-reduced-motion: reduce) {
    .track i {
      transition: none;
    }
  }
  @media (max-width: 520px) {
    .reach {
      grid-template-columns: minmax(0, 1fr) minmax(5rem, 1.1fr) 3.3rem;
      column-gap: 0.6rem;
    }
    .row.head {
      letter-spacing: 0.06em;
    }
    .zone {
      grid-template-columns: 0.5rem minmax(0, 1fr);
      row-gap: 0;
    }
    .zone span {
      grid-column: 2;
      font-size: 0.82rem;
    }
  }
</style>
