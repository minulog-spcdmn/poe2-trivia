<script lang="ts">
  import { DELVE_LADDER } from '../lib/difficultyText';
</script>

<!-- How a descent gets harder, depth by depth. -->
<ol class="ladder" aria-label="How Delve gets harder">
  {#each DELVE_LADDER as row (row.depth)}
    <li>
      <span class="depth">{row.depth}</span>
      <span class="text">{row.text}</span>
    </li>
  {/each}
</ol>

<style>
  .ladder {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: auto 1fr;
    column-gap: 0.8rem;
    row-gap: 0.3rem;
  }
  li {
    display: contents;
  }
  .depth {
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 0.85rem;
    color: var(--gold-hi);
    text-align: right;
    font-variant-numeric: tabular-nums;
    padding-top: 0.1rem;
  }
  .text {
    font-size: 0.95rem;
    line-height: 1.3;
    color: var(--muted);
  }
  li:nth-child(n + 4) .depth {
    color: #b9cff0;
  }
</style>
