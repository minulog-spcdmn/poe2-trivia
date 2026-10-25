<script lang="ts">
  // How deep Delve's runs go: where half of them end, the deepest any got,
  // and a row for each ten depths, how many ended there and the share that
  // got at least that deep. `against`: everyone's runs, for a group's
  // (GroupsView), a line on each bar where everyone's share stands and a
  // column of it; `whom` names the group.
  import { fmt } from './chart';
  import { descentOf, medianRange, percent } from './model';

  let { ranges, against, whom = '' }: { ranges: { from: number; count: number }[]; against?: { from: number; count: number }[] | null; whom?: string } = $props();

  const total = $derived(ranges.reduce((n, r) => n + r.count, 0));
  const descent = $derived(descentOf(ranges));
  const half = $derived(medianRange(ranges));
  const deepest = $derived([...ranges].reverse().find((r) => r.count > 0)?.from ?? null);
  const all = $derived(against ? descentOf(against) : null);
  const allTotal = $derived(against ? against.reduce((n, r) => n + r.count, 0) : 0);
  const allHalf = $derived(against ? medianRange(against) : null);
  /** Everyone's share that got as deep as a row, as a percent; null past everyone's deepest. */
  const allAt = (from: number) => {
    const r = all?.find((x) => x.from === from);
    return r && allTotal ? (100 * r.reached) / allTotal : null;
  };
  const depth = (from: number) => `${from}–${from + 9}`;
</script>

{#if !total}
  <p class="soft">No Delve run ended in these days.</p>
{:else}
  <div class="figs">
    <div>
      <span class="name">Half the runs end by</span>
      <b>depth {depth(half ?? 0)}</b>
      {#if against && allHalf !== null}<span class="soft">everyone: {depth(allHalf)}</span>{/if}
    </div>
    <div>
      <span class="name">Deepest</span>
      <b>depth {depth(deepest ?? 0)}</b>
    </div>
    <div>
      <span class="name">Runs that ended</span>
      <b>{fmt(total)}</b>
    </div>
  </div>
  <div class="scroll-x">
    <table class="table" aria-label="Delve runs by depth{whom ? `, ${whom}` : ''}">
      <thead>
        <tr>
          <th scope="col">Depth</th>
          <th scope="col" class="n opt">Ended there</th>
          <th scope="col" class="n">Got this deep</th>
          <th scope="col" class="bar"><span class="sr">The share that got this deep{against ? ", the line everyone's" : ''}</span></th>
          {#if against}<th scope="col" class="n">Everyone</th>{/if}
        </tr>
      </thead>
      <tbody>
        {#each descent as d (d.from)}
          {@const a = allAt(d.from)}
          <tr>
            <th scope="row">{depth(d.from)}<span class="on-phone">{fmt(d.ended)} ended there</span></th>
            <td class="n opt" class:soft={!d.ended}>{fmt(d.ended)}</td>
            <td class="n strong">{percent(d.reached, total)}</td>
            <td class="bar">
              <span class="meter held">
                <i style:width="{(100 * d.reached) / total}%"></i>
                {#if a !== null}<b class="was" style:left="{a}%"></b>{/if}
              </span>
            </td>
            {#if against}<td class="n soft">{a === null ? '–' : `${Math.round(a)}%`}</td>{/if}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<style>
  .figs {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem 3rem;
    margin-bottom: 1.25rem;
  }
  .figs > div {
    display: grid;
    gap: 0.1rem;
  }
  .name {
    color: var(--a-muted);
  }
  .figs b {
    font-size: 1.9rem;
    font-weight: 650;
    line-height: 1.1;
    color: var(--a-ink);
  }
  .soft {
    color: var(--a-muted);
  }
  .strong {
    font-weight: 650;
    color: var(--a-ink);
  }
  .held {
    position: relative;
  }
  .was {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    margin-left: -1px;
    background: var(--a-ink);
    box-shadow: 0 0 0 1px rgba(10, 8, 6, 0.7);
  }
</style>
