<script lang="ts">
  // The loot after a right answer in a zone: the deal's cards face up, as the
  // other modes deal them, all of them the player's (a tap to collect). A
  // supply that doesn't fit the pack can replace a stack, or be left. Then on.
  import { HIDDEN_NAMES, SUPPLY_NAMES, type Run } from './rules';
  import DealtCard from './DealtCard.svelte';
  import PackList from './PackList.svelte';
  import { lootLine, plural } from './words';

  let { run }: { run: Run } = $props();
  const s = $derived(run.state);
  const loot = $derived(s.loot!);
  const it = $derived(s.item!);
  const pending = $derived(loot.pending[0] ?? null);
  const visit = $derived(s.visit);
  const onward = $derived(visit && visit.done + 1 < visit.items ? 'Next item' : 'On to the map');
</script>

<div class="loot">
  <header class="screen-title">
    <p class="kicker">{it.log.name} named</p>
    <h1>Loot</h1>
    <p class="sub">
      {#if !loot.collected}
        {plural(loot.cards.length, 'card')}, all yours.{#if it.misses}{' '}{it.misses === 1 ? 'A miss' : 'Misses'} cost {plural(it.misses, 'card')}.{/if}{#if it.hidden}{' '}Corrupted ({HIDDEN_NAMES[it.hidden]}): the deal doubled.{/if}
      {:else if pending}
        The pack is full: the {SUPPLY_NAMES[pending.supply!]} can replace a stack, or be left.
      {:else}
        Collected.
      {/if}
    </p>
  </header>

  <ul class="cards" style:--n={loot.cards.length}>
    {#each loot.cards as c, i (i)}
      {@const l = lootLine(c)}
      <li>
        <DealtCard
          mark={c.kind === 'supply' ? c.supply! : c.kind}
          title={l.name}
          line={l.gives}
          tag={c.kind === 'gold' || c.kind === 'jackpot' ? `${c.gold} gold` : c.kind === 'supply' ? `× ${c.n}` : ''}
          rare={c.kind === 'jackpot'}
          label="Collect the loot"
          {i}
          n={loot.cards.length}
          chosen={loot.collected}
          disabled={loot.collected}
          onpick={() => run.collect()}
        />
      </li>
    {/each}
  </ul>

  {#if pending}
    <section class="panel swap" aria-labelledby="swap-h">
      <h2 id="swap-h">Replace a stack with {SUPPLY_NAMES[pending.supply!]} × {pending.n}</h2>
      <PackList {run} onpick={(slot) => run.keep(slot)} />
      <button class="btn ghost" onclick={() => run.keep(null)}>Leave the {SUPPLY_NAMES[pending.supply!]}</button>
    </section>
  {/if}

  <div class="go dock">
    {#if !loot.collected}
      <button class="btn primary big" onclick={() => run.collect()}>Collect</button>
    {:else}
      <button class="btn primary big" disabled={!!pending} onclick={() => run.next()}>{onward}</button>
    {/if}
  </div>
</div>

<style>
  .loot {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.3rem;
  }
  .loot > .go {
    align-self: stretch;
  }
  .cards {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    grid-template-columns: repeat(min(var(--n, 3), 4), minmax(0, 190px));
    justify-content: center;
    gap: 1.2rem;
    width: 100%;
  }
  .swap {
    width: min(100%, 40rem);
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
  }
  @media (max-width: 700px) {
    .cards {
      grid-template-columns: minmax(0, 1fr);
      gap: 0.6rem;
    }
  }
</style>
