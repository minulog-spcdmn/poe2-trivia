<script lang="ts">
  // How a view's figures are counted: the caveats a caption would otherwise
  // carry, kept out of the way, folded at the foot of the view, a line each.
  let { items }: { items: (string | false | null | undefined)[] } = $props();
  const lines = $derived(items.filter((i): i is string => !!i));
</script>

{#if lines.length}
  <details class="how">
    <summary>How it's counted</summary>
    <ul>
      {#each lines as line (line)}<li>{line}</li>{/each}
    </ul>
  </details>
{/if}

<style>
  .how {
    color: var(--a-muted);
  }
  summary {
    width: fit-content;
    font-weight: 600;
    color: var(--a-text);
    cursor: pointer;
  }
  ul {
    display: grid;
    gap: 0.4rem;
    max-width: 62rem;
    margin: 0.7rem 0 0;
    padding-left: 1.2rem;
  }
</style>
