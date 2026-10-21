<script lang="ts" module>
  export interface ShareRow {
    name: string;
    /** Visitors who did it, or null where it wasn't counted. */
    count: number | null;
    /** Their share as a percent, and the period before's; null where it wasn't counted. */
    share: number | null;
    before: number | null;
  }
</script>

<script lang="ts">
  // Shares of visitors, a row each, in the order given (a journey's steps,
  // the minutes a visit stayed): how many, the share, a bar as long as it
  // with a line where the period before stood, and the change in points. A
  // share that wasn't counted says "–".
  import { fmt } from './chart';
  import Delta from './Delta.svelte';

  let { rows, head, label }: { rows: ShareRow[]; head: string; label: string } = $props();

  const pct = (v: number | null) => (v === null ? '–' : `${Math.round(v)}%`);
</script>

<div class="scroll-x shares">
  <table class="table" aria-label={label}>
    <thead>
      <tr>
        <th scope="col">{head}</th>
        <th scope="col" class="n opt">Visitors</th>
        <th scope="col" class="n">Share</th>
        <th scope="col" class="bar"><span class="sr">The share, the line where it stood before</span></th>
        <th scope="col">Change</th>
      </tr>
    </thead>
    <tbody>
      {#each rows as r (r.name)}
        <tr class:none={r.share === null}>
          <th scope="row">{r.name}</th>
          <td class="n opt">{r.count === null ? '–' : fmt(r.count)}</td>
          <td class="n strong">{pct(r.share)}</td>
          <td class="bar">
            <span class="meter held">
              <i style:width="{r.share ?? 0}%"></i>
              {#if r.before !== null}<b class="was" style:left="{r.before}%"></b>{/if}
            </span>
          </td>
          <td class="change"><Delta now={r.share} before={r.before} rate period="" /></td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .strong {
    font-weight: 650;
    color: var(--a-ink);
  }
  .none > * {
    color: var(--a-muted);
  }
  /* The bar holds a line where the period before stood. */
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
    /* Edged dark, so it shows over a bar that reaches past it too. */
    box-shadow: 0 0 0 1px rgba(10, 8, 6, 0.7);
  }
  .change {
    font-size: 1rem;
  }
  /* Kept to the width it's given, a half of the page among them: there the change says only by how much, without the bar or where it stood. */
  .shares {
    container-type: inline-size;
  }
  /* A long step ("5 games or more in one page load") takes two lines rather than the table more width. */
  .shares .table tbody th[scope='row'] {
    white-space: normal;
  }
  @container (max-width: 36rem) {
    .change :global(.was),
    .bar {
      display: none;
    }
    .change {
      white-space: nowrap;
    }
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
</style>
