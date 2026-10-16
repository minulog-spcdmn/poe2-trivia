<script lang="ts">
  // A section of the ledger: a title, a line saying what it shows, and its
  // chart. One with a `numbers` snippet gets a Chart / Numbers switch in its
  // corner, the same figures as a plain table (for a screen reader, or to
  // read a value exactly). Drawn as the game's panels are: a dark plate, a
  // hairline, gold filigree on its corners.
  import type { Snippet } from 'svelte';

  let {
    title,
    note = '',
    wide = false,
    children,
    numbers,
  }: { title: string; note?: string; wide?: boolean; children: Snippet; numbers?: Snippet } = $props();

  let table = $state(false);
</script>

<section class="card" class:wide>
  <header>
    <div>
      <h2>{title}</h2>
      {#if note}<p class="note">{note}</p>{/if}
    </div>
    {#if numbers}
      <div class="switch" role="group" aria-label="Show as">
        <button type="button" aria-pressed={!table} onclick={() => (table = false)}>Chart</button>
        <button type="button" aria-pressed={table} onclick={() => (table = true)}>Numbers</button>
      </div>
    {/if}
  </header>
  {#if table && numbers}
    <div class="numbers">{@render numbers()}</div>
  {:else}
    {@render children()}
  {/if}
</section>

<style>
  .card {
    position: relative;
    min-width: 0;
    padding: 1.3rem 1.4rem 1.4rem;
    background: var(--plate);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    box-shadow:
      0 0 0 1px rgba(0, 0, 0, 0.6),
      inset 0 1px 0 rgba(255, 220, 150, 0.06);
  }
  .card::before {
    content: '';
    position: absolute;
    inset: -2px;
    background: var(--filigree);
    pointer-events: none;
    opacity: 0.8;
  }
  .wide {
    grid-column: 1 / -1;
  }
  header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1.1rem;
  }
  h2 {
    font-size: 1.05rem;
    letter-spacing: 0.08em;
    color: var(--gold-hi);
  }
  .note {
    margin: 0.2rem 0 0;
    font-size: 0.95rem;
    line-height: 1.35;
    color: var(--muted);
  }
  .switch {
    flex: none;
    display: flex;
    border: 1px solid var(--line);
    border-radius: 3px;
    overflow: hidden;
  }
  .switch button {
    padding: 0.3em 0.7em;
    font-family: var(--font-cinzel);
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--muted);
    background: none;
    border: 0;
    cursor: pointer;
    transition: color 0.2s, background-color 0.2s;
  }
  .switch button + button {
    border-left: 1px solid var(--line);
  }
  .switch button:hover {
    color: var(--gold-hi);
  }
  .switch button[aria-pressed='true'] {
    color: var(--gold-hi);
    background: rgba(201, 164, 92, 0.14);
    cursor: default;
  }
  .numbers {
    max-height: 22rem;
    overflow: auto;
  }
  .numbers :global(table) {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.95rem;
  }
  .numbers :global(th) {
    position: sticky;
    top: 0;
    background: var(--plate);
    font-family: var(--font-cinzel);
    font-size: 0.68rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    font-weight: 700;
    color: var(--muted);
    text-align: left;
    padding: 0.35rem 0.5rem;
    border-bottom: 1px solid var(--line);
  }
  .numbers :global(td) {
    padding: 0.3rem 0.5rem;
    border-bottom: 1px solid rgba(59, 48, 36, 0.5);
  }
  .numbers :global(td.n),
  .numbers :global(th.n) {
    text-align: right;
    font-family: var(--font-cinzel);
    font-variant-numeric: tabular-nums;
  }
  @media (max-width: 520px) {
    .card {
      padding: 1.1rem 1rem 1.2rem;
    }
    header {
      flex-direction: column;
      gap: 0.6rem;
    }
  }
</style>
