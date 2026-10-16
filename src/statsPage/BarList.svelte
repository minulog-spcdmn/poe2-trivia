<script lang="ts" module>
  export interface Bar {
    label: string;
    count: number;
    /** A small mark before the label (a zone's colour): identity only, the bar stays gold. */
    mark?: string;
    /** A second line under the label, muted. */
    sub?: string;
    /** Called out: the bar in pale gold and a tag beside the label. */
    tag?: string;
  }
</script>

<script lang="ts">
  // A ranked list, each row its label, a bar as long as its count against the
  // largest, and the count with its share: every value written out, so the
  // list is its own table. `top` keeps the first rows and folds the rest into
  // "Other"; `keep`: the rows stay in the order given (depths), not by count.
  let {
    bars,
    top = 8,
    keep = false,
    tone = 'gold',
    unit = '',
    empty = 'Nothing counted yet.',
  }: { bars: Bar[]; top?: number; keep?: boolean; tone?: 'gold' | 'bad'; unit?: string; empty?: string } = $props();

  const shown = $derived.by(() => {
    const sorted = keep ? bars : [...bars].sort((a, b) => b.count - a.count);
    if (sorted.length <= top) return sorted;
    const rest = sorted.slice(top - 1);
    return [...sorted.slice(0, top - 1), { label: `Other (${rest.length})`, count: rest.reduce((n, b) => n + b.count, 0) }];
  });
  const total = $derived(bars.reduce((n, b) => n + b.count, 0));
  const max = $derived(Math.max(1, ...shown.map((b) => b.count)));
  const fmt = (n: number) => n.toLocaleString('en');
</script>

{#if !total}
  <p class="empty">{empty}</p>
{:else}
  <ul class="bars {tone}">
    {#each shown as b (b.label)}
      <li class:called={!!b.tag}>
        <span class="what">
          {#if b.mark}<i class="mark" style:background={b.mark}></i>{/if}
          <span class="name">{b.label}</span>
          {#if b.tag}<em class="tag">{b.tag}</em>{/if}
          {#if b.sub}<small>{b.sub}</small>{/if}
        </span>
        <span class="track" aria-hidden="true"><span class="fill" style:width="{(100 * b.count) / max}%"></span></span>
        <span class="value"><b>{fmt(b.count)}</b>{unit ? ` ${unit}` : ''} <span class="share">{Math.round((100 * b.count) / total)}%</span></span>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .bars {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: minmax(0, 11rem) minmax(3rem, 1fr) auto;
    column-gap: 0.8rem;
    row-gap: 0.55rem;
    align-items: center;
  }
  li {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: subgrid;
    grid-template-areas: 'what track value';
    align-items: center;
  }
  .what {
    grid-area: what;
  }
  .track {
    grid-area: track;
  }
  .value {
    grid-area: value;
  }
  .what {
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    column-gap: 0.4rem;
    line-height: 1.2;
  }
  .name {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .what small {
    flex-basis: 100%;
    font-size: 0.8rem;
    color: var(--muted);
  }
  .mark {
    flex: none;
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    align-self: center;
  }
  .tag {
    font-style: normal;
    font-family: var(--font-cinzel);
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--gold-hi);
    border: 1px solid var(--gold-lo);
    border-radius: 2px;
    padding: 0.05em 0.35em;
  }
  .track {
    height: 0.75rem;
    display: block;
  }
  .fill {
    display: block;
    height: 100%;
    min-width: 2px;
    background: var(--gold);
    border-radius: 0 4px 4px 0;
    transition: width 0.5s var(--ease-out);
  }
  .bad .fill {
    background: var(--bad);
  }
  .called .fill {
    background: var(--gold-hi);
  }
  .value {
    text-align: right;
    white-space: nowrap;
    font-size: 0.95rem;
    color: var(--muted);
  }
  .value b {
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--text);
  }
  .share {
    display: inline-block;
    min-width: 2.6em;
    font-family: var(--font-cinzel);
    font-size: 0.8rem;
    font-variant-numeric: tabular-nums;
  }
  .empty {
    margin: 0;
    color: var(--muted);
    font-style: italic;
  }
  @media (prefers-reduced-motion: reduce) {
    .fill {
      transition: none;
    }
  }
  /* A phone: the label and the count on a line, the bar under them. */
  @media (max-width: 520px) {
    .bars {
      grid-template-columns: minmax(0, 1fr) auto;
      row-gap: 0.65rem;
    }
    li {
      row-gap: 0.25rem;
      grid-template-areas:
        'what value'
        'track track';
    }
  }
</style>
