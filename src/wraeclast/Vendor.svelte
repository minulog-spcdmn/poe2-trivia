<script lang="ts">
  // A vendor: at the camp, in a town (the rest first), and after an
  // Expedition zone. Its wares are small cards with their stack and price
  // ("2 for 8"); tap to buy. A bought card stays where it lay, saying Bought
  // (dealt again on the next visit). Bought into a full pack, the ware waits
  // for a space to replace, or is handed back with its gold. Then the pack,
  // and the way on (Where next opens the map).
  // Phones stack it all; wide screens put the pack beside the wares.
  import { untrack } from 'svelte';
  import { SUPPLY_NAMES, type Run } from './rules';
  import DealtCard from './DealtCard.svelte';
  import PackList from './PackList.svelte';
  import { BOUGHT_FULL, CAMP_SAYS, EXPEDITION_SAYS, PACK_NOTE, REST, does, handBack, handBackLabel, supplies } from './words';

  let { run, onmap }: { run: Run; onmap: () => void } = $props();
  const s = $derived(run.state);
  const at = $derived(s.vendor?.at ?? 'camp');
  const heal = $derived(s.vendor?.heal ?? 0);
  /** The wares as dealt this visit (their places on the table don't move as cards are taken). */
  const dealt = untrack(() => [...run.state.stock]);
  /** The pack space a ware just went into, lit. */
  let lit = $state<number | null>(null);

  function buy(k: number) {
    const ware = s.stock[k];
    if (!run.buy(k)) return;
    lit = s.bought ? null : s.pack.findLastIndex((st) => st.supply === ware);
  }
  function place(slot: number | null) {
    if (run.placeBought(slot)) lit = slot;
  }
</script>

<div class="vendor">
  <h1 class="sr">{at === 'expedition' ? 'Expedition vendor' : run.node.name}</h1>
  <div class="cols">
    <div class="shop">
      {#if at === 'town'}
        <p class="say rest">{#if heal}{REST.before}<b>+{heal}</b>{REST.after}{:else}{REST.full}{/if}</p>
      {:else}
        <p class="say">{at === 'camp' ? CAMP_SAYS : EXPEDITION_SAYS}</p>
      {/if}

      <section aria-labelledby="shop-h">
        <h2 id="shop-h" class="sr">For sale</h2>
        <ul class="wares">
          {#each dealt as ware, i (ware)}
            {@const k = s.stock.indexOf(ware)}
            {@const price = s.tuning.price[ware]}
            {@const q = s.tuning.stack[ware]}
            <li>
              <DealtCard
                mark={ware}
                title={SUPPLY_NAMES[ware]}
                line={does(run, ware)}
                {q}
                {price}
                label="Buy {supplies(q, ware)} for {price} gold. {does(run, ware)}{s.gold < price ? ' Not enough gold.' : !run.fits(ware, q) ? ` ${BOUGHT_FULL}` : ''}"
                {i}
                bought={k < 0}
                dear={s.gold < price}
                disabled={k < 0 || !run.canBuy(k)}
                onpick={() => buy(k)}
              />
            </li>
          {/each}
        </ul>
      </section>
    </div>

    <section class="side" aria-labelledby="pack-h">
      <div class="head">
        <h2 id="pack-h">Your pack</h2>
        <span class="note">{PACK_NOTE}</span>
      </div>
      <PackList {run} row compact tall {lit} onpick={s.bought ? (slot) => place(slot) : undefined} />
    </section>
  </div>

  <div class="go dock">
    {#if s.bought}
      <p class="swap" role="status">{BOUGHT_FULL}</p>
      <button class="btn ghost" onclick={() => place(null)} aria-label={handBackLabel(s.bought.n, s.bought.supply, s.bought.price)}
        >{handBack(s.bought.n)}</button
      >
    {/if}
    <button class="btn primary big" disabled={!!s.bought} onclick={onmap}>Where next</button>
  </div>
</div>

<style>
  .vendor {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .cols {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0.9rem;
    align-items: start;
  }
  .shop,
  .side {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    min-width: 0;
  }
  .say {
    margin: 0;
    font-size: 14px;
    line-height: 1.25;
    color: #b5a993;
    text-align: center;
  }
  .say.rest {
    font-size: 16px;
    color: #e6dccb;
  }
  .say b {
    font-family: var(--font-cinzel);
    font-weight: 700;
    color: #a9cf8f;
  }
  .wares {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
  }
  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }
  .note {
    font-size: 13px;
    color: var(--muted);
    text-align: right;
  }
  .swap {
    flex-basis: 100%;
    margin: 0;
    font-size: 15px;
    text-align: center;
    color: var(--gold-hi);
  }
  /* Phones: the pack's heading and note give way to the wares (the slots say themselves). */
  @media (max-width: 699px) {
    .head {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }
  @media (min-width: 700px) {
    .wares {
      gap: 12px;
    }
    .say {
      font-size: 16px;
    }
    .say.rest {
      font-size: 18px;
    }
  }
  /* Wide screens (the desktop board): the pack beside the wares. */
  @media (min-width: 1000px) {
    .cols {
      grid-template-columns: minmax(0, 19fr) minmax(0, 11fr);
      column-gap: 40px;
    }
    .shop {
      gap: 16px;
    }
    .side {
      gap: 18px;
    }
    .say {
      text-align: left;
    }
  }
</style>
