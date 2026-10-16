<script lang="ts">
  // The modes compared, one row each, one column per question: how many
  // games (a bar against the busiest mode, the share of all), how many were
  // finished, where they were played, and how many played them (a small
  // histogram under the sizes named once in the header). On a phone each mode
  // becomes a block of the same lines.
  import { fmt } from './chart';
  import { MODE_NAMES, SIZES, percent, type ModeSummary, type Size } from './model';

  let { modes, total }: { modes: ModeSummary[]; total: number } = $props();

  const SIZE_SHORT: Record<Size, string> = { '1p': '1', '2p': '2', '3-4p': '3–4', '5-8p': '5–8', '9-12p': '9+' };
  const top = $derived(Math.max(1, ...modes.map((m) => m.started)));
</script>

<div class="modes" role="table" aria-label="Games by mode">
  <div class="row head" role="row">
    <span role="columnheader">Mode</span>
    <span role="columnheader">Games</span>
    <span role="columnheader">Finished</span>
    <span role="columnheader">Online · Hot-seat</span>
    <span role="columnheader" class="sizes-head">
      <span>Players</span>
      <span class="ticks" aria-hidden="true">{#each SIZES as s (s)}<i>{SIZE_SHORT[s]}</i>{/each}</span>
    </span>
  </div>
  {#each modes as m (m.mode)}
    {@const sizeTop = Math.max(1, ...SIZES.map((s) => m.sizes[s]))}
    {@const sized = SIZES.some((s) => m.sizes[s])}
    <div class="row" class:none={!m.started} role="row">
      <span class="mode" role="rowheader">{MODE_NAMES[m.mode]}</span>
      <span class="games" role="cell">
        <span class="bar"><i style:width="{(100 * m.started) / top}%"></i></span>
        <b>{fmt(m.started)}</b><small>{percent(m.started, total)}</small>
      </span>
      <span class="finish" role="cell">
        {#if m.started}
          <span class="meter"><i style:width="{Math.min(100, (100 * m.finished) / m.started)}%"></i></span>
          <b>{percent(m.finished, m.started)}</b>
        {:else}<span class="dash">–</span>{/if}
      </span>
      <span class="where" role="cell">
        {#if m.started}
          <span class="split" aria-hidden="true">
            <i class="on" style:flex-grow={m.online}></i><i class="hs" style:flex-grow={m.hotseat}></i>
          </span>
          <small>{percent(m.online, m.started)} · {percent(m.hotseat, m.started)}</small>
        {:else}<span class="dash">–</span>{/if}
      </span>
      <span class="sizes" role="cell" aria-label={SIZES.map((s) => `${SIZE_SHORT[s]} players: ${m.sizes[s]}`).join(', ')}>
        {#if sized}
          {#each SIZES as s (s)}
            <span class="sz" title="{SIZE_SHORT[s]} players: {m.sizes[s]}">
              <span class="col"><i class:zero={!m.sizes[s]} style:height="{Math.max(6, (100 * m.sizes[s]) / sizeTop)}%"></i></span>
              <em aria-hidden="true">{SIZE_SHORT[s]}</em>
            </span>
          {/each}
        {:else}<span class="dash">–</span>{/if}
      </span>
    </div>
  {/each}
</div>
<div class="legend" aria-hidden="true"><span><i class="on"></i>Online</span><span><i class="hs"></i>Hot-seat</span></div>

<style>
  .modes {
    display: grid;
    grid-template-columns: minmax(6.5rem, 1fr) minmax(9rem, 1.6fr) minmax(8rem, 1.3fr) minmax(8rem, 1.3fr) 8.5rem;
    column-gap: 1.4rem;
  }
  .row {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: subgrid;
    align-items: center;
    min-height: 3.2rem;
    border-top: 1px solid rgba(59, 48, 36, 0.55);
  }
  .row.head {
    min-height: 0;
    padding-bottom: 0.5rem;
    border-top: 0;
    align-items: end;
    font-family: var(--font-cinzel);
    font-size: 0.64rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .sizes-head {
    display: grid;
    gap: 0.3rem;
  }
  .ticks,
  .sizes {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 4px;
  }
  .ticks i {
    font-style: normal;
    text-align: center;
    letter-spacing: 0;
  }
  .mode {
    font-family: var(--font-display);
    font-size: 1.02rem;
    letter-spacing: 0.03em;
  }
  .none {
    color: var(--muted);
  }
  b {
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  small {
    font-family: var(--font-cinzel);
    font-size: 0.72rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .games,
  .finish {
    display: grid;
    grid-template-columns: minmax(2rem, 1fr) 3.3rem 2.6rem;
    align-items: center;
    column-gap: 0.6rem;
  }
  .finish {
    grid-template-columns: minmax(2rem, 1fr) 2.8rem;
  }
  .games b,
  .finish b,
  .games small {
    text-align: right;
  }
  .bar,
  .meter {
    height: 0.55rem;
    background: rgba(125, 99, 51, 0.22);
    border-radius: 0 3px 3px 0;
    overflow: hidden;
  }
  .bar i,
  .meter i {
    display: block;
    height: 100%;
    background: var(--gold);
    border-radius: 0 3px 3px 0;
    transition: width 0.5s var(--ease-out);
  }
  .where {
    display: grid;
    gap: 0.3rem;
  }
  .split {
    display: flex;
    gap: 2px;
    height: 0.55rem;
  }
  .split i {
    flex-basis: 0;
  }
  .on {
    background: var(--gold);
  }
  .hs {
    background: var(--dim);
  }
  .sz {
    display: grid;
    gap: 0.15rem;
  }
  .col {
    display: flex;
    align-items: flex-end;
    height: 1.9rem;
  }
  .col i {
    width: 100%;
    background: var(--gold);
    border-radius: 2px 2px 0 0;
  }
  .col i.zero {
    height: 2px !important;
    background: var(--line);
  }
  /* The sizes are named once in the header; a phone, with no header, names them under each. */
  .sz em {
    display: none;
    font-style: normal;
    font-family: var(--font-cinzel);
    font-size: 0.6rem;
    text-align: center;
    color: var(--muted);
  }
  .dash {
    color: var(--muted);
  }
  .legend {
    display: flex;
    gap: 1.2rem;
    margin-top: 0.8rem;
    font-size: 0.85rem;
    color: var(--muted);
  }
  .legend span {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
  .legend i {
    width: 0.65rem;
    height: 0.65rem;
    border-radius: 2px;
  }
  @media (prefers-reduced-motion: reduce) {
    .bar i,
    .meter i {
      transition: none;
    }
  }
  /* A phone: each mode a block, a line for each column, its header as a label. */
  @media (max-width: 640px) {
    .modes {
      display: block;
    }
    .row.head {
      display: none;
    }
    .row {
      display: grid;
      grid-template-columns: 5.5rem minmax(0, 1fr);
      row-gap: 0.55rem;
      padding: 0.9rem 0;
    }
    .mode {
      grid-column: 1 / -1;
      font-size: 1.1rem;
    }
    .row > :not(.mode)::before {
      grid-column: 1;
      font-family: var(--font-cinzel);
      font-size: 0.62rem;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .games,
    .finish,
    .where,
    .sizes {
      grid-column: 1 / -1;
      grid-template-columns: 5.5rem minmax(2rem, 1fr) 3.3rem 2.6rem;
    }
    .games::before {
      content: 'Games';
    }
    .finish {
      grid-template-columns: 5.5rem minmax(2rem, 1fr) 2.8rem;
    }
    .finish::before {
      content: 'Finished';
    }
    .where {
      grid-template-columns: 5.5rem minmax(0, 1fr) auto;
      align-items: center;
      column-gap: 0.6rem;
    }
    .where::before {
      content: 'Played';
    }
    .sizes {
      grid-template-columns: 5.5rem repeat(5, minmax(0, 1fr));
    }
    .sizes::before {
      content: 'Players';
      align-self: center;
    }
    .col {
      height: 1.4rem;
    }
    .sz em {
      display: block;
    }
  }
</style>
