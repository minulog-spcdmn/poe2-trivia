<script lang="ts">
  // A clue's text as the tooltip sets it: values in their colour, and each
  // masked word of the item's name as a bar of one width, whatever the word.
  import { runs } from './markup';

  let { text }: { text: string } = $props();
</script>

{#each runs(text) as r, k (k)}{#if r.mask}<span class="mask {r.c}" title="A word of the name, hidden"><span class="sr">A word of the name, hidden</span></span>{:else if r.c}<span class={r.c}>{r.t}</span>{:else}{r.t}{/if}{/each}

<style>
  /* The values' colours, as ItemDetails has them. */
  .white {
    color: #f2efe8;
  }
  .aug {
    color: #8888ff;
  }
  .fire {
    color: #b8301f;
  }
  .cold {
    color: #4f7fb5;
  }
  .lightning {
    color: #ffd700;
  }
  .chaos {
    color: #d02090;
  }
  /* A word of the item's name, hidden: one width whatever its length. */
  .mask {
    position: relative;
    display: inline-block;
    width: 2.3em;
    height: 0.62em;
    margin-inline: 0.08em;
    vertical-align: 0.02em;
    border-radius: 1px;
    background: linear-gradient(90deg, rgba(175, 96, 37, 0.35), rgba(175, 96, 37, 0.2));
    box-shadow: inset 0 0 0 0.5px rgba(224, 138, 68, 0.45);
  }
</style>
