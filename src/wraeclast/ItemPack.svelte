<script lang="ts">
  // The pack during an item: each supply it holds, how many, what it does
  // (or why it does nothing here), and its Use button; the Vaal Orbs, whose
  // use flips a card with the item's corruption; and the flask. A supply
  // used calls onuse (the screen brings what changed into view).
  import { backdropShadow } from '../lib/backdropShadow';
  import { CORRUPTION_NAMES, SUPPLIES, SUPPLY_NAMES, type Run, type Supply } from './rules';
  import Glyph from './Glyph.svelte';
  import { CORRUPTION_DOES, FLASK_LINE, onItem, why } from './words';

  let { run, onuse }: { run: Run; onuse?: (what: Supply | 'vaal') => void } = $props();
  const s = $derived(run.state);
  const it = $derived(s.item!);
  const held = $derived(SUPPLIES.map((sup) => ({ sup, count: s.pack.filter((p) => p === sup).length })).filter((h) => h.count));
  const orbs = $derived(s.pack.filter((p) => p === 'vaal').length);
  const named = $derived(s.phase === 'solved');
  const vaalWhy = $derived(it.boss !== null ? 'Silent: only Flares work' : it.corruption ? 'Corrupted already' : null);
</script>

<section class="panel pack" aria-labelledby="pack-h" use:backdropShadow={{ fill: 'linear' }}>
  <h2 id="pack-h">Pack</h2>

  {#if it.corruption}
    <div class="corrupted" role="status">
      <span class="flip">
        <span class="name">Corrupted • {CORRUPTION_NAMES[it.corruption]}</span>
        <span class="does">{CORRUPTION_DOES[it.corruption]}</span>
      </span>
    </div>
  {/if}

  {#if held.length || orbs}
    <ul>
      {#each held as h (h.sup)}
        {@const no = why(run, h.sup)}
        <li class:off={!!no}>
          <span class="mark"><Glyph of={h.sup} /></span>
          <div class="what">
            <span class="name">{SUPPLY_NAMES[h.sup]} <span class="n">× {h.count}</span></span>
            <span class="does">{no ?? onItem(run, h.sup)}</span>
          </div>
          <button class="btn small" disabled={named || !run.canUse(h.sup)} onclick={() => run.use(h.sup) && onuse?.(h.sup)} aria-label="Use a {SUPPLY_NAMES[h.sup]}">Use</button>
        </li>
      {/each}
      {#if orbs}
        <li class="vaal" class:off={!!vaalWhy}>
          <span class="mark"><Glyph of="vaal" /></span>
          <div class="what">
            <span class="name">Vaal Orb <span class="n">× {orbs}</span></span>
            <span class="does">{vaalWhy ?? 'Corrupts this item: no more supplies on it. Its loot gambles.'}</span>
          </div>
          <button class="btn small" disabled={named || !run.canCorrupt()} onclick={() => run.corrupt() && onuse?.('vaal')} aria-label="Use a Vaal Orb on this item">Corrupt</button>
        </li>
      {/if}
    </ul>
  {:else}
    <p class="empty">No supplies in the pack.</p>
  {/if}

  <div class="flask">
    <span class="mark"><Glyph of="flask" /></span>
    <div class="what">
      <span class="name">Flask <span class="n">{s.flask.charges}</span> of <span class="n">{s.tuning.flask}</span></span>
      <span class="does">{FLASK_LINE}</span>
    </div>
    <button class="btn small ghost" disabled={named || !run.canDrink()} onclick={() => run.drink()}>Drink</button>
  </div>
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
  li,
  .flask {
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.7rem;
    padding: 0.45rem 0;
    border-top: 1px solid rgba(125, 99, 51, 0.25);
  }
  li:first-child {
    border-top: 0;
  }
  .mark {
    width: 26px;
    height: 26px;
    color: #d9b77e;
  }
  .vaal .mark {
    color: #e0503c;
  }
  .off .mark {
    opacity: 0.4;
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
  .empty {
    margin: 0 0 0.3rem;
    font-size: 0.95rem;
    color: var(--muted);
  }
  /* The corruption's card, flipped up when the orb is used: red, as the game marks a corrupted item. */
  .corrupted {
    perspective: 900px;
    margin-bottom: 0.5rem;
  }
  .flip {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    padding: 0.55rem 0.8rem;
    border: 1px solid rgba(210, 40, 30, 0.7);
    border-radius: 6px;
    background: linear-gradient(170deg, rgba(70, 14, 10, 0.9), rgba(24, 8, 6, 0.92));
    box-shadow: 0 0 16px rgba(210, 40, 30, 0.25);
    animation: flip 0.6s cubic-bezier(0.2, 0.9, 0.3, 1.1) backwards;
    transform-origin: 50% 50%;
  }
  .flip .name {
    color: #ff6a55;
  }
  .flip .does {
    color: #f0b8a8;
  }
  @keyframes flip {
    from {
      transform: rotateX(-90deg);
      opacity: 0;
    }
  }
</style>
