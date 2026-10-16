<script lang="ts">
  // One of the ledger's panels: the game's plate (a dark ground, a hairline
  // edge, gold filigree at the corners), and a header every panel shares: its
  // title and a line under it on the left, its controls or its answer on the
  // right, so every panel reads the same way.
  import type { Snippet } from 'svelte';

  let { title, sub = '', aside, children, span = 12 }: { title: string; sub?: string; aside?: Snippet; children: Snippet; span?: number } = $props();
</script>

<section class="panel-ledger" style:--span={span}>
  <header>
    <div class="titles">
      <h2>{title}</h2>
      {#if sub}<p>{sub}</p>{/if}
    </div>
    {#if aside}<div class="aside">{@render aside()}</div>{/if}
  </header>
  <div class="body">{@render children()}</div>
</section>

<style>
  .panel-ledger {
    grid-column: span var(--span);
    position: relative;
    min-width: 0;
    display: flex;
    flex-direction: column;
    padding: 20px 22px 22px;
    background: var(--plate);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    box-shadow:
      0 0 0 1px rgba(0, 0, 0, 0.6),
      inset 0 1px 0 rgba(255, 220, 150, 0.06);
  }
  .panel-ledger::before {
    content: '';
    position: absolute;
    inset: -2px;
    background: var(--filigree);
    opacity: 0.55;
    pointer-events: none;
  }
  /* The game's panels' thin light along the top edge. */
  .panel-ledger::after {
    content: '';
    position: absolute;
    top: -1px;
    left: 34px;
    right: 34px;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(241, 217, 155, 0.4), transparent);
    pointer-events: none;
  }
  header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.6rem 1rem;
    min-height: 2.6rem;
    margin-bottom: 18px;
  }
  .titles {
    min-width: 0;
  }
  h2 {
    font-size: 1.12rem;
    line-height: 1.2;
    letter-spacing: 0.04em;
    color: var(--gold-hi);
  }
  p {
    margin: 0.15rem 0 0;
    font-size: 0.9rem;
    line-height: 1.3;
    color: var(--muted);
  }
  .aside {
    flex: none;
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  /* A column, so a chart in it can take the height left over (one that fills its panel). */
  .body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  /* Under 1000px each panel takes the whole row. */
  @media (max-width: 1000px) {
    .panel-ledger {
      grid-column: 1 / -1;
    }
  }
  /* Narrow: the controls or the answer go under the title, wrapping as they need. */
  @media (max-width: 760px) {
    header {
      flex-wrap: wrap;
    }
    .aside {
      flex: 1 1 100%;
      flex-wrap: wrap;
    }
  }
  @media (max-width: 520px) {
    .panel-ledger {
      padding: 16px 16px 18px;
    }
  }
</style>
