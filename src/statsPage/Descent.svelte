<script lang="ts">
  // Delve, drawn as the descent: each ten depths a stratum, its zone named
  // with the zone's colour beside it, and a band across the shaft as wide as
  // the share of runs that got that deep, so the shaft narrows as runs
  // perish. The deeper, the darker the band. Beside it, the share that got
  // there and the share that ended there.
  import { accentAt, stratumName } from '../lib/descent';
  import { descentOf } from './model';

  let { ranges }: { ranges: { from: number; count: number }[] } = $props();

  const strata = $derived(descentOf(ranges));
  const total = $derived(strata[0]?.reached ?? 0);
  const pc = (v: number) => (total ? Math.round((100 * v) / total) : 0);
  const fmt = (v: number) => v.toLocaleString('en');
</script>

{#if !total}
  <p class="empty">No runs ended.</p>
{:else}
  <ol class="shaft" aria-label="Share of Delve runs that reached each ten depths">
    {#each strata as s, i (s.from)}
      <li style:--shade={1 - (0.55 * i) / Math.max(1, strata.length - 1)}>
        <div class="zone">
          <span class="depth">{s.from}–{s.from + 9}</span>
          <span class="where"><i style:background={accentAt(s.from + 1)}></i>{stratumName(s.from / 10)}</span>
        </div>
        <div class="band" aria-hidden="true"><span style:width="{Math.max(0.6, (100 * s.reached) / total)}%"></span></div>
        <div class="share">
          <b>{pc(s.reached)}%</b>
          <span>{s.ended ? `${fmt(s.ended)} ended here` : 'none ended'}</span>
        </div>
      </li>
    {/each}
  </ol>
{/if}

<style>
  .shaft {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: minmax(0, 9.5rem) minmax(4rem, 1fr) minmax(0, 6.5rem);
    column-gap: 1rem;
  }
  li {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: subgrid;
    align-items: center;
    padding: 0.35rem 0;
    border-top: 1px solid rgba(59, 48, 36, 0.55);
  }
  li:first-child {
    border-top-color: var(--gold-lo);
  }
  .zone {
    display: grid;
    line-height: 1.15;
    min-width: 0;
  }
  .depth {
    font-family: var(--font-cinzel);
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--muted);
  }
  .where {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
    font-size: 0.95rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .where i {
    flex: none;
    width: 0.45rem;
    height: 0.45rem;
    border-radius: 50%;
  }
  /* The shaft: each band centred, so the runs still going narrow it downwards. */
  .band {
    display: flex;
    justify-content: center;
    height: 1.4rem;
  }
  .band span {
    height: 100%;
    background: var(--gold);
    opacity: var(--shade);
    border-radius: 2px;
    transition: width 0.5s var(--ease-out);
  }
  .share {
    display: grid;
    justify-items: end;
    line-height: 1.15;
  }
  .share b {
    font-family: var(--font-cinzel);
    font-size: 1rem;
  }
  .share span {
    font-size: 0.78rem;
    color: var(--muted);
    white-space: nowrap;
  }
  .empty {
    margin: 0;
    color: var(--muted);
    font-style: italic;
  }
  @media (prefers-reduced-motion: reduce) {
    .band span {
      transition: none;
    }
  }
  @media (max-width: 520px) {
    .shaft {
      grid-template-columns: minmax(0, 7.5rem) minmax(3rem, 1fr) auto;
      column-gap: 0.6rem;
    }
    .where {
      font-size: 0.85rem;
    }
  }
</style>
