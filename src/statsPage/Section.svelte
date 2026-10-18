<script lang="ts">
  // A block of a view: its question as a heading, a line on how to read it,
  // and what answers it. `aside`: something at the heading's end (a choice,
  // a link to more).
  import type { Snippet } from 'svelte';

  let { title, says = '', aside, children, wide = false }: { title: string; says?: string; aside?: Snippet; children: Snippet; wide?: boolean } = $props();
</script>

<section class="section" class:wide>
  <header>
    <div>
      <h2>{title}</h2>
      {#if says}<p>{says}</p>{/if}
    </div>
    {#if aside}<div class="aside">{@render aside()}</div>{/if}
  </header>
  {@render children()}
</section>

<style>
  .section {
    min-width: 0;
    padding: 1.6rem 1.75rem 1.75rem;
    background: var(--a-surface);
    border: 1px solid var(--line);
    border-radius: 4px;
  }
  header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: 0.8rem 1.5rem;
    margin-bottom: 1.4rem;
  }
  h2 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.6rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    color: var(--gold-hi);
  }
  p {
    margin: 0.3rem 0 0;
    max-width: 52rem;
    color: var(--a-muted);
  }
  /* A big monitor: a little closer, so the overview keeps to one screen. */
  @media (min-width: 1900px) {
    .section {
      padding: 1.2rem 1.5rem 1.3rem;
    }
    header {
      margin-bottom: 1rem;
    }
  }
  @media (max-width: 600px) {
    .section {
      padding: 1.1rem 1rem 1.2rem;
    }
    h2 {
      font-size: 1.3rem;
    }
    /* A choice goes under the heading; a link to more (a short one) stays beside it. */
    header:not(:has(> .aside > :global(.to-view:only-child))) {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
