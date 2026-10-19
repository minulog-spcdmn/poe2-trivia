<script lang="ts">
  // A vendor: at the camp, and in a town (the rest first). Its wares are the
  // four supplies as small cards with their price; each tap buys one. Then
  // the pack (a count of each), and the way on (Where next opens the map).
  // Phones stack it all; wide screens put the pack beside the wares.
  import { SUPPLIES, SUPPLY_NAMES, type Run, type Supply } from './rules';
  import DealtCard from './DealtCard.svelte';
  import PackList from './PackList.svelte';
  import { CAMP_SAYS, REST, does } from './words';

  let { run, onmap }: { run: Run; onmap: () => void } = $props();
  const s = $derived(run.state);
  const at = $derived(s.vendor?.at ?? 'camp');
  const heal = $derived(s.vendor?.heal ?? 0);
  /** The supply just bought, lit in the pack. */
  let lit = $state<Supply | null>(null);

  function buy(sp: Supply) {
    if (run.buy(sp)) lit = sp;
  }
</script>

<div class="vendor">
  <h1 class="sr">{run.node.name}</h1>
  <div class="cols">
    <div class="shop">
      {#if at === 'town'}
        <p class="say rest">{#if heal}{REST.before}<b>+{heal}</b>{REST.after}{:else}{REST.full}{/if}</p>
      {:else}
        <p class="say">{CAMP_SAYS}</p>
      {/if}

      <section aria-labelledby="shop-h">
        <h2 id="shop-h" class="sr">For sale</h2>
        <ul class="wares">
          {#each SUPPLIES as ware, i (ware)}
            {@const price = s.tuning.price[ware]}
            <li>
              <DealtCard
                mark={ware}
                title={SUPPLY_NAMES[ware]}
                line={does(run, ware)}
                {price}
                label="Buy a {SUPPLY_NAMES[ware]} for {price} gold. {does(run, ware)}{s.gold < price ? ' Not enough gold.' : ''}"
                {i}
                dear={s.gold < price}
                disabled={!run.canBuy(ware)}
                onpick={() => buy(ware)}
              />
            </li>
          {/each}
        </ul>
      </section>
    </div>

    <section class="side" aria-labelledby="pack-h">
      <div class="head">
        <h2 id="pack-h">Your pack</h2>
      </div>
      <PackList {run} {lit} />
    </section>
  </div>

  <div class="go dock">
    <button class="btn primary big" onclick={onmap}>Where next</button>
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
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }
  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }
  /* Phones: the pack's heading gives way to the wares (the slots say themselves). */
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
