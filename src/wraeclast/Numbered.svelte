<script lang="ts">
  // A line of words whose numbers are set as numbers (.n, Cinzel), as the
  // screens set the ones they write out themselves.
  let { text }: { text: string } = $props();
  const parts = $derived(text.split(/([+−]?\d+)/));
</script>

{#each parts as part, i (i)}{#if i % 2}<span class="n">{part}</span>{:else}{part}{/if}{/each}
