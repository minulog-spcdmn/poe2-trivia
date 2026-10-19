<script lang="ts">
  // The camp (before zone 1) and the town (between zones 2 and 3): the
  // vendor deals every ware as a card with its price, and buying takes the
  // card (dealt again on the next visit); the pack, the flask, and the road
  // ahead.
  import { untrack } from 'svelte';
  import { fade } from 'svelte/transition';
  import { backdropShadow } from '../lib/backdropShadow';
  import { motion } from '../lib/motion.svelte';
  import { BOSS_ITEMS, PACK_SLOTS, WARE_NAMES, ZONE_NAMES, ZONES, type Run } from './rules';
  import DealtCard from './DealtCard.svelte';
  import PackList from './PackList.svelte';
  import { BOSS_RULE, FLASK_LINE, does, zoneLines } from './words';

  let { run }: { run: Run } = $props();
  const s = $derived(run.state);
  const camp = $derived(s.phase === 'camp');
  /** The zones still ahead: all four from the camp, 3 and 4 from the town. */
  const ahead = $derived(s.zones.map((z, i) => ({ z, no: i + 1 })).filter((z) => (camp ? true : z.no > 2)));
  const full = $derived(s.pack.length >= PACK_SLOTS);
  /** The wares as dealt this visit (their places on the table don't move as cards are taken). */
  const dealt = untrack(() => [...run.state.stock]);
</script>

<div class="vendor">
  <header class="screen-title">
    <p class="kicker">{camp ? 'Before zone 1' : 'Between zones 2 and 3'}</p>
    <h1>{camp ? 'Camp' : 'Town'}</h1>
    <p class="sub">
      {#if camp}The vendor deals its wares. Stock your pack: nothing can be bought once an item is open.
      {:else if s.arrivalHeal}The town heals you <span class="n">{s.arrivalHeal}</span> life. The vendor deals its wares again.
      {:else}You arrive at full life. The vendor deals its wares again.{/if}
    </p>
  </header>

  <section class="table" aria-labelledby="shop-h">
    <h2 id="shop-h" class="sr">The vendor's wares</h2>
    <p class="purse">
      {#if full}The pack is full.{:else}<span class="n">{s.gold}</span> gold to spend, <span class="n">{PACK_SLOTS - s.pack.length}</span> {PACK_SLOTS - s.pack.length === 1 ? 'slot' : 'slots'} free.{/if}
    </p>
    <ul class="cards">
      {#each dealt as ware, i (ware)}
        {@const at = s.stock.indexOf(ware)}
        <li>
          {#if at >= 0}
            <div out:fade={{ duration: motion.still ? 0 : 260 }}>
              <DealtCard
                mark={ware}
                title={WARE_NAMES[ware]}
                line={does(run, ware)}
                tag="{s.tuning.price[ware]} gold"
                rare={ware === 'vaal'}
                label="Buy a {WARE_NAMES[ware]} for {s.tuning.price[ware]} gold"
                {i}
                n={dealt.length}
                disabled={!run.canBuy(at)}
                faded={!run.canBuy(at)}
                onpick={() => run.buy(at)}
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
    <section class="panel" aria-labelledby="pack-h" use:backdropShadow={{ fill: 'linear' }}>
      <h2 id="pack-h">Pack</h2>
      <PackList {run} />
    </section>
    <section class="panel" aria-labelledby="flask-h" use:backdropShadow={{ fill: 'linear' }}>
      <h2 id="flask-h">Flask</h2>
      <p class="flask"><span class="n">{s.flask.charges}</span> of <span class="n">{s.tuning.flask}</span> {s.tuning.flask === 1 ? 'charge' : 'charges'}. {FLASK_LINE}</p>
    </section>
    <section class="panel road-panel" aria-labelledby="road-h" use:backdropShadow={{ fill: 'linear' }}>
      <h2 id="road-h">The road</h2>
      <ol class="road">
        {#each ahead as z (z.no)}
          {@const l = zoneLines(run, z.z)}
          <li><span class="zn">Zone <span class="n">{z.no}</span> • {ZONE_NAMES[z.z]}</span> <span class="rule">{l.free}. {l.rule}.</span></li>
        {/each}
        <li><span class="zn">The boss • <span class="n">{BOSS_ITEMS}</span> items</span> <span class="rule">{BOSS_RULE}. No loot.</span></li>
      </ol>
      {#if camp}<p class="note">The town comes after zone <span class="n">2</span> of <span class="n">{ZONES}</span>.</p>{/if}
    </section>
  </div>

  <div class="go dock">
    <button class="btn primary big" onclick={() => run.leave()}>{camp ? 'Set out' : 'Leave town'}</button>
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
    grid-template-columns: repeat(3, minmax(0, 1fr));
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
  .road {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .road li {
    display: flex;
    flex-direction: column;
    line-height: 1.3;
  }
  .zn {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 0.95rem;
    color: #e9c8a2;
  }
  .rule {
    font-size: 0.92rem;
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
