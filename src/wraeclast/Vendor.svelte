<script lang="ts">
  // A vendor: at the camp, in a town, and after an Expedition zone. It deals
  // every supply as a card with its stack and price ("3 for 6 gold"), and
  // buying takes the card (dealt again on the next visit). The pack's stacks,
  // the flask, and the way on to the map.
  import { untrack } from 'svelte';
  import { fade } from 'svelte/transition';
  import { motion } from '../lib/motion.svelte';
  import { SUPPLY_NAMES, type Run } from './rules';
  import DealtCard from './DealtCard.svelte';
  import PackList from './PackList.svelte';
  import { FLASK_LINE, does, stackLine } from './words';

  let { run }: { run: Run } = $props();
  const s = $derived(run.state);
  const at = $derived(s.vendor?.at ?? 'camp');
  const heal = $derived(s.vendor?.heal ?? 0);
  /** The wares as dealt this visit (their places on the table don't move as cards are taken). */
  const dealt = untrack(() => [...run.state.stock]);
  const TITLE = { camp: 'Camp', town: 'Town', expedition: 'Expedition vendor' } as const;
</script>

<div class="vendor">
  <header class="screen-title">
    <p class="kicker">{run.node.name}</p>
    <h1>{TITLE[at]}</h1>
    <p class="sub">
      {#if at === 'camp'}The vendor deals its wares. Stock your pack: the next vendor is in a town, or after an Expedition.
      {:else if at === 'expedition'}The Expedition's vendor deals its wares after the zone.
      {:else if heal}The town heals you <span class="n">{heal}</span> life. The vendor deals its wares again.
      {:else}You arrive at full life. The vendor deals its wares again.{/if}
    </p>
  </header>

  <section class="table" aria-labelledby="shop-h">
    <h2 id="shop-h" class="sr">The vendor's wares</h2>
    <p class="purse"><span class="n">{s.gold}</span> gold to spend.</p>
    <ul class="cards">
      {#each dealt as ware, i (ware)}
        {@const k = s.stock.indexOf(ware)}
        <li>
          {#if k >= 0}
            <div out:fade={{ duration: motion.still ? 0 : 260 }}>
              <DealtCard
                mark={ware}
                title={SUPPLY_NAMES[ware]}
                line={does(run, ware)}
                tag={stackLine(run, ware)}
                label="Buy {s.tuning.stack[ware]} {SUPPLY_NAMES[ware]} for {s.tuning.price[ware]} gold"
                {i}
                n={dealt.length}
                disabled={!run.canBuy(k)}
                faded={!run.canBuy(k)}
                onpick={() => run.buy(k)}
              />
            </div>
          {:else}
            <div class="sold" in:fade={{ duration: motion.still ? 0 : 260, delay: motion.still ? 0 : 200 }}>Sold</div>
          {/if}
        </li>
      {/each}
    </ul>
  </section>

  <div class="cols">
    <section class="panel" aria-labelledby="pack-h">
      <h2 id="pack-h">Pack</h2>
      <PackList {run} />
      <p class="note">Eight stacks of up to five. A ware is bought only when its whole stack fits.</p>
    </section>
    <section class="panel" aria-labelledby="flask-h">
      <h2 id="flask-h">Flask</h2>
      <p class="flask"><span class="n">{s.flask.charges}</span> of <span class="n">{s.tuning.flask}</span> {s.tuning.flask === 1 ? 'charge' : 'charges'}. {FLASK_LINE} A Well refills every charge.</p>
    </section>
  </div>

  <div class="go dock">
    <button class="btn primary big" onclick={() => run.leave()}>{at === 'camp' ? 'Set out' : 'To the map'}</button>
  </div>
</div>

<style>
  .vendor {
    display: flex;
    flex-direction: column;
    gap: 1.1rem;
  }
  .purse {
    margin: 0 0 0.8rem;
    text-align: center;
    color: var(--muted);
  }
  .cards {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 1rem;
  }
  .sold {
    display: grid;
    place-items: center;
    height: 250px;
    border: 1px dashed rgba(125, 99, 51, 0.35);
    border-radius: 8px;
    font-family: var(--font-display);
    font-size: 0.8rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #6f665c;
  }
  .cols {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
    gap: 1rem;
    align-items: start;
  }
  h2 {
    margin-bottom: 0.6rem;
  }
  .flask {
    margin: 0;
    font-size: 0.95rem;
  }
  .note {
    margin: 0.6rem 0 0;
    font-size: 0.95rem;
    color: var(--muted);
  }
  @media (max-width: 900px) {
    .cols {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  @media (max-width: 700px) {
    .cards {
      grid-template-columns: minmax(0, 1fr);
      gap: 0.6rem;
    }
    .sold {
      height: 84px;
    }
  }
</style>
