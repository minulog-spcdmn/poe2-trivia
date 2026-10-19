<script lang="ts">
  // The pack during an item: each supply it holds, how many, what it shows
  // (or why it can't be used here), and its Use button.
  import { backdropShadow } from '../lib/backdropShadow';
  import { SUPPLIES, SUPPLY_NAMES, type Run } from './rules';
  import { reveals, why } from './words';

  let { run }: { run: Run } = $props();
  const s = $derived(run.state);
  const it = $derived(s.item!);
  const held = $derived(SUPPLIES.map((sup) => ({ sup, count: s.pack.filter((p) => p === sup).length })).filter((h) => h.count));
</script>

<section class="panel pack" aria-labelledby="pack-h" use:backdropShadow>
  <h2 id="pack-h">Pack</h2>
  {#if it.flare > 0}
    <p class="flare" role="status">Tap {it.flare === 1 ? 'a patch' : `${it.flare} patches`} on the art to lift {it.flare === 1 ? 'it' : 'them'}.</p>
  {/if}
  {#if held.length}
    <ul>
      {#each held as h (h.sup)}
        {@const no = why(run, h.sup)}
        <li class:off={!!no}>
          <div class="what">
            <span class="name">{SUPPLY_NAMES[h.sup]} <span class="n">× {h.count}</span></span>
            <span class="does">{no ?? reveals(run, h.sup)}</span>
          </div>
          <button class="btn small" disabled={!run.canUse(h.sup)} onclick={() => run.use(h.sup)} aria-label="Use a {SUPPLY_NAMES[h.sup]}">Use</button>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="empty">The pack is empty.</p>
  {/if}
</section>

<style>
  h2 {
    margin-bottom: 0.4rem;
  }
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
  }
  li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.75rem;
    padding: 0.45rem 0;
    border-top: 1px solid rgba(125, 99, 51, 0.25);
  }
  li:first-child {
    border-top: 0;
  }
  .what {
    display: flex;
    flex-direction: column;
  }
  .name {
    font-family: var(--font-display);
    font-weight: 700;
    color: #e9c8a2;
  }
  .off .name {
    color: var(--muted);
  }
  .does {
    font-size: 0.92rem;
    line-height: 1.3;
    color: var(--muted);
  }
  .off .does {
    font-style: italic;
  }
  .flare {
    margin: 0 0 0.5rem;
    padding: 0.4rem 0.6rem;
    border: 1px solid rgba(224, 138, 68, 0.45);
    border-radius: 4px;
    background: rgba(224, 138, 68, 0.08);
    font-size: 0.95rem;
    color: #f1c99a;
  }
  .empty {
    margin: 0;
    font-size: 0.95rem;
    color: var(--muted);
  }
</style>
