<script lang="ts">
  // What the pack holds, each supply once with how many: at the vendors.
  import { PACK_SLOTS, SUPPLIES, SUPPLY_NAMES, type Run } from './rules';

  let { run }: { run: Run } = $props();
  const s = $derived(run.state);
  const held = $derived(SUPPLIES.map((sup) => ({ sup, count: s.pack.filter((p) => p === sup).length })).filter((h) => h.count));
</script>

<div class="pack">
  <ul class="slots" aria-label="{s.pack.length} of {PACK_SLOTS} slots filled">
    {#each Array.from({ length: PACK_SLOTS }, (_, i) => i) as i (i)}
      <li class="slot" class:full={i < s.pack.length}></li>
    {/each}
  </ul>
  {#if held.length}
    <ul class="held">
      {#each held as h (h.sup)}
        <li>{SUPPLY_NAMES[h.sup]} <span class="n">× {h.count}</span></li>
      {/each}
    </ul>
  {:else}
    <p class="muted">Eight slots, one supply each.</p>
  {/if}
</div>

<style>
  .pack {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .slots {
    display: flex;
    gap: 5px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .slot {
    width: 22px;
    height: 22px;
    border: 1px solid var(--line);
    border-radius: 3px;
    background: rgba(0, 0, 0, 0.35);
  }
  .slot.full {
    border-color: var(--gold-lo);
    background: linear-gradient(180deg, rgba(201, 164, 92, 0.35), rgba(125, 99, 51, 0.15));
  }
  .held {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }
  p {
    margin: 0;
    font-size: 0.95rem;
  }
</style>
