<script lang="ts">
  // An item's category: three cards dealt as the other modes deal them, each
  // with its multiplier, the player's pick locked for the next three picks;
  // at the boss, the one card the boss picked.
  import { motion } from '../lib/motion.svelte';
  import { LOCKOUT, ZONES, ZONE_ITEMS, type Run } from './rules';
  import CategoryCard from './CategoryCard.svelte';
  import Numbered from './Numbered.svelte';
  import { BOSS_RULE, BOSS_STEPS, zoneLine } from './words';

  let { run }: { run: Run } = $props();
  const s = $derived(run.state);
  const n = $derived(s.done);
  const bossNo = $derived(n >= ZONES * ZONE_ITEMS ? n - ZONES * ZONE_ITEMS : null);
  const zone = $derived(run.zoneType(Math.floor(n / ZONE_ITEMS) + 1));

  let chosen = $state<number | null>(null);
  /** Picks a card: it rises, the others fade, then the item opens. */
  function choose(i: number) {
    if (chosen !== null) return;
    chosen = i;
    setTimeout(() => run.pick(i), motion.still ? 0 : 450);
  }
</script>

<div class="deal">
  <header class="screen-title">
    {#if bossNo === null}
      <h1>Pick a category</h1>
      <p class="sub">{#if zone}<Numbered text={zoneLine(run, zone)} />{' '}{/if}A category you pick is locked for the next <span class="n">{LOCKOUT}</span> picks.</p>
    {:else}
      <h1>The boss picks</h1>
      <p class="sub">{BOSS_RULE}. <Numbered text={BOSS_STEPS[bossNo]} /> The boss pays no gold.</p>
    {/if}
  </header>

  <div class="cards" class:single={s.offer.length === 1} style:--n={s.offer.length}>
    {#each s.offer as card, i (card.category)}
      <CategoryCard
        {card}
        {i}
        n={s.offer.length}
        chosen={chosen === i}
        faded={chosen !== null && chosen !== i}
        disabled={chosen !== null}
        onpick={() => choose(i)}
      />
    {/each}
  </div>

  {#if bossNo === null && s.recent.length}
    <p class="note">Locked: {s.recent.join(' • ')}</p>
  {/if}

  {#if bossNo !== null}
    <div class="go dock">
      <button class="btn primary big" disabled={chosen !== null} onclick={() => choose(0)}>Face it</button>
    </div>
  {/if}
</div>

<style>
  .deal {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.4rem;
  }
  .deal > .go {
    align-self: stretch;
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(var(--n, 3), minmax(0, 220px));
    justify-content: center;
    gap: 1.4rem;
    width: 100%;
  }
  .note {
    margin: 0;
    font-style: italic;
    color: var(--muted);
    text-align: center;
  }
  @media (max-width: 700px) {
    .cards,
    .cards.single {
      grid-template-columns: minmax(0, 1fr);
      gap: 0.75rem;
    }
  }
</style>
