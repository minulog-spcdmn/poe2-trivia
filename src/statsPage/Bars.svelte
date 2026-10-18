<script lang="ts" module>
  export interface Bar {
    label: string;
    count: number;
  }
</script>

<script lang="ts">
  // A ranked list: each name, a bar as long as its count against the
  // largest, the count, and its share of them all. The first `top` show; the
  // rest open below. `link`: where a name leads (its player group), and
  // `fresh`: what the last update brought each, marked beside its count.
  import { fmt } from './chart';
  import { percent } from './model';

  let {
    bars,
    top = 8,
    empty = 'Nothing yet.',
    tone = 'now',
    link,
    fresh,
  }: { bars: Bar[]; top?: number; empty?: string; tone?: 'now' | 'down'; link?: (label: string) => string | null; fresh?: Map<string, number> } = $props();

  let all = $state(false);
  const total = $derived(bars.reduce((n, b) => n + b.count, 0));
  const max = $derived(Math.max(1, ...bars.map((b) => b.count)));
  const ranked = $derived([...bars].sort((a, b) => b.count - a.count));
  const shown = $derived(all ? ranked : ranked.slice(0, top));
</script>

{#if !bars.length}
  <p class="empty">{empty}</p>
{:else}
  <ol class="bars" class:down={tone === 'down'}>
    {#each shown as b (b.label)}
      {@const to = link?.(b.label)}
      {@const added = fresh?.get(b.label) ?? 0}
      <li class:new={added > 0}>
        {#if to}<a class="name pick" href={to} title="See how {b.label} plays">{b.label}</a>{:else}<span class="name">{b.label}</span>{/if}
        <span class="meter" aria-hidden="true"><i style:width="{(100 * b.count) / max}%"></i></span>
        <b>{#if added}<span class="added" title="New since the last update">+{fmt(added)}</span>{/if}{fmt(b.count)}</b>
        <span class="share">{percent(b.count, total)}</span>
      </li>
    {/each}
  </ol>
  {#if bars.length > top}
    <button type="button" class="more" onclick={() => (all = !all)}>{all ? 'Show fewer' : `Show all ${bars.length}`}</button>
  {/if}
{/if}

<style>
  .bars {
    display: grid;
    /* The name's column no wider than a name needs, so on a wide screen its bar and count stay beside it. */
    grid-template-columns: minmax(0, 15rem) minmax(3rem, 1fr) auto 3.4rem;
    column-gap: 1rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    display: grid;
    grid-column: 1 / -1;
    grid-template-columns: subgrid;
    align-items: center;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--a-rule);
  }
  li:last-child {
    border-bottom: 0;
  }
  .name {
    overflow-wrap: anywhere;
    line-height: 1.3;
    color: var(--a-ink);
  }
  b {
    font-weight: 650;
    text-align: right;
    color: var(--a-ink);
  }
  .pick {
    justify-self: start;
  }
  /* What the last update brought: the row lit, and how many it added. */
  li.new {
    background: rgba(217, 176, 98, 0.1);
  }
  .added {
    margin-right: 0.5rem;
    font-size: 0.85em;
    font-weight: 600;
    color: var(--a-now);
  }
  .share {
    text-align: right;
    color: var(--a-muted);
  }
  .down .meter > i {
    background: var(--a-down);
  }
  .empty {
    color: var(--a-muted);
  }
  .more {
    margin-top: 0.6rem;
    padding: 0.3rem 0;
    font: inherit;
    font-size: 1rem;
    font-weight: 600;
    color: var(--gold);
    background: none;
    border: 0;
    cursor: pointer;
  }
  .more:hover {
    color: var(--gold-hi);
    text-decoration: underline;
  }
  @media (max-width: 600px) {
    .bars {
      grid-template-columns: minmax(0, 1fr) minmax(2rem, 0.6fr) auto 2.8rem;
      column-gap: 0.6rem;
    }
  }
</style>
