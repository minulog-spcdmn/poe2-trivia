<script lang="ts">
  // Days of Today's unique in a table: the day, its item, how many
  // answered, and the share who named it, with a bar to compare. Its items
  // are named from their art; a day that asked the other way round (finding
  // the art for a name) would say so under its item.
  import { fmt, longDay } from './chart';
  import type { DailyItem } from './dailyItems';
  import type { DailyDay } from './model';

  let {
    days,
    itemOf,
    label,
    today = '',
    compact = false,
  }: { days: DailyDay[]; itemOf: ((day: string) => DailyItem | null) | null; label: string; today?: string; compact?: boolean } = $props();

  const MODE: Record<DailyItem['mode'], string> = { name: 'Name it from its art', art: 'Find its art by name' };
</script>

{#if compact}
  <ol class="compact" aria-label={label}>
    {#each days as d (d.day)}
      {@const item = itemOf?.(d.day)}
      <li>
        <span class="item"><span class="iname">{item?.name ?? '…'}</span><span class="kind">{longDay(d.day)}, {fmt(d.answers)} players</span></span>
        <b>{d.named === null ? '–' : `${d.named}%`}</b>
      </li>
    {/each}
  </ol>
{:else}
<div class="scroll-x">
  <table class="table" aria-label={label}>
    <thead>
      <tr>
        <th scope="col" class="opt">Day</th>
        <th scope="col">Item</th>
        <th scope="col" class="n">Players</th>
        <th scope="col" class="n">Named it</th>
        <th scope="col" class="bar"><span class="sr">Share named</span></th>
      </tr>
    </thead>
    <tbody>
      {#each days as d (d.day)}
        {@const item = itemOf?.(d.day)}
        <tr>
          <th scope="row" class="day opt">{longDay(d.day)}{#if d.day === today}<em>so far</em>{/if}</th>
          <td class="item">
            {#if item}<span class="iname">{item.name}</span>{#if item.mode !== 'name'}<span class="kind">{MODE[item.mode]}</span>{/if}{:else}<span class="soft">…</span>{/if}
            <span class="on-phone">{longDay(d.day)}{d.day === today ? ', so far' : ''}</span>
          </td>
          <td class="n">{fmt(d.answers)}</td>
          <td class="n strong">{d.named === null ? '–' : `${d.named}%`}</td>
          <td class="bar"><span class="meter"><i style:width="{d.named ?? 0}%"></i></span></td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
{/if}

<style>
  .day {
    white-space: nowrap;
  }
  .day em {
    margin-left: 0.5rem;
    font-style: normal;
    font-weight: 400;
    color: var(--a-muted);
  }
  .item {
    min-width: 12rem;
  }
  @media (max-width: 600px) {
    .item {
      min-width: 0;
    }
  }
  @media (min-width: 1900px) {
    .iname {
      white-space: nowrap;
    }
  }
  .iname {
    display: block;
    font-weight: 600;
    color: var(--gold-hi);
  }
  .kind {
    display: block;
    font-size: 0.95rem;
    color: var(--a-muted);
  }
  .compact {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .compact li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.6rem 0;
    border-bottom: 1px solid var(--a-rule);
  }
  .compact li:last-child {
    border-bottom: 0;
  }
  .compact .item {
    min-width: 0;
  }
  .compact b {
    font-size: 1.3rem;
    font-weight: 650;
    color: var(--a-ink);
  }
  .strong {
    font-weight: 650;
    color: var(--a-ink);
  }
  .bar {
    width: 22%;
    min-width: 5rem;
  }
</style>
