<script lang="ts">
  // Text whose numbers are set in Cinzel (the body font's digits don't match
  // the rest of the page's numbers): "Oct 4, 2026: fell at 33".
  let { text }: { text: string } = $props();
  const parts = $derived(text.split(/(\d+(?:[.:]\d+)*)/));
</script>

{#each parts as p, i (i)}{#if i % 2}<span class="n">{p}</span>{:else}{p}{/if}{/each}
