<script lang="ts">
  // The loot after a right answer: cards dealt face up as the other modes
  // deal them, one face down (unidentified, turned up once taken); the player
  // takes one. A supply or Vaal Orb taken with the pack full can replace a
  // ware in it, or be left. Then on to the next item.
  import { backdropShadow } from '../lib/backdropShadow';
  import { CORRUPTION_NAMES, PACK_SLOTS, RARE_LOOT, TOWN_AFTER, WARE_NAMES, ZONE_ITEMS, ZONES, type Run } from './rules';
  import DealtCard from './DealtCard.svelte';
  import { lootLine, plural } from './words';

  let { run }: { run: Run } = $props();
  const s = $derived(run.state);
  const loot = $derived(s.loot!);
  const it = $derived(s.item!);
  const taken = $derived(loot.taken);
  const card = $derived(taken === null ? null : loot.cards[taken]);
  /** The pack's wares, each kind once with how many (any one of a kind swaps out the same). */
  const held = $derived([...new Set(s.pack)].map((ware) => ({ ware, count: s.pack.filter((w) => w === ware).length })));
  /** Where the button goes: the next item, or past the zone's end. */
  const onward = $derived.by(() => {
    const done = it.n + 1;
    if (done % ZONE_ITEMS) return 'Next item';
    return done === TOWN_AFTER ? 'On to the town' : done === ZONES * ZONE_ITEMS ? 'On to the boss' : 'On to the next zone';
  });
</script>

<div class="loot">
  <header class="screen-title">
    <p class="kicker">{it.log.name} named</p>
    <h1>Loot</h1>
    <p class="sub">
      {#if taken === null}
        Take one card.{#if it.misses}{' '}<span class="n">{it.misses}</span> {it.misses === 1 ? 'miss' : 'misses'} cost {it.misses === 1 ? 'a card' : 'cards'}.{/if}{#if it.corruption}{' '}{CORRUPTION_NAMES[it.corruption]}: more cards.{/if}
      {:else if loot.pending}
        The pack is full: the {WARE_NAMES[loot.pending]} can take a ware's place, or be left.
      {:else if card}
        {@const l = lootLine(card)}
        {l.name}: {card.kind === 'gold' || card.kind === 'jackpot' ? l.gives : card.kind === 'flask' ? 'a flask charge refilled' : it.log.took?.kept === false ? 'left behind' : 'into the pack'}.
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
          tag={c.kind === 'gold' || c.kind === 'jackpot' ? `${c.gold} gold` : ''}
          rare={RARE_LOOT.includes(c.kind)}
          label={c.unid && taken !== i ? 'Take the unidentified card' : `Take ${l.name}: ${l.gives}`}
          {i}
          n={loot.cards.length}
          down={c.unid && taken !== i}
          unid={c.unid}
          chosen={taken === i}
          faded={taken !== null && taken !== i}
          disabled={taken !== null}
          onpick={() => run.take(i)}
        />
      </li>
    {/each}
  </ul>

  {#if loot.pending}
    <section class="panel swap" aria-labelledby="swap-h" use:backdropShadow={{ fill: 'linear' }}>
      <h2 id="swap-h">Your pack, {plural(PACK_SLOTS, 'slot')} full</h2>
      <ul class="slots">
        {#each held as h (h.ware)}
          <li><button class="btn small" onclick={() => run.keep(s.pack.indexOf(h.ware))}>Swap out a {WARE_NAMES[h.ware]}{#if h.count > 1}{' '}<span class="n">(× {h.count})</span>{/if}</button></li>
        {/each}
      </ul>
      <button class="btn ghost" onclick={() => run.keep(null)}>Leave the {WARE_NAMES[loot.pending]}</button>
    </section>
  {/if}

  <div class="go dock">
    <button class="btn primary big" disabled={taken === null || !!loot.pending} onclick={() => run.next()}>{onward}</button>
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
    grid-template-columns: repeat(var(--n, 3), minmax(0, 190px));
    justify-content: center;
    gap: 1.2rem;
    width: 100%;
  }
  .swap {
    width: min(100%, 34rem);
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .slots {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  @media (max-width: 1100px) {
    .cards {
      grid-template-columns: repeat(min(var(--n, 3), 4), minmax(0, 190px));
    }
  }
  @media (max-width: 700px) {
    .cards {
      grid-template-columns: minmax(0, 1fr);
      gap: 0.6rem;
    }
  }
</style>
