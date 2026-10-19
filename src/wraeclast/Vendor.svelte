<script lang="ts">
  // The camp (before zone 1) and the town (between zones 2 and 3): the
  // vendor selling every supply, the pack, the flask, and the road ahead.
  import { backdropShadow } from '../lib/backdropShadow';
  import { BOSS_ITEMS, FLASK_ITEMS, FLASK_STEP, PACK_SLOTS, SUPPLIES, SUPPLY_NAMES, ZONE_NAMES, ZONES, type Run } from './rules';
  import PackList from './PackList.svelte';
  import { BOSS_RULE, REVEALS, zoneLine } from './words';

  let { run }: { run: Run } = $props();
  const s = $derived(run.state);
  const camp = $derived(s.phase === 'camp');
  /** The zones still ahead: all four from the camp, 3 and 4 from the town. */
  const ahead = $derived(s.zones.map((z, i) => ({ z, no: i + 1 })).filter((z) => (camp ? true : z.no > 2)));
  const full = $derived(s.pack.length >= PACK_SLOTS);
</script>

<div class="vendor">
  <header class="screen-title">
    <p class="kicker">{camp ? 'Before zone 1' : 'Between zones 2 and 3'}</p>
    <h1>{camp ? 'Camp' : 'Town'}</h1>
    <p class="sub">
      {#if camp}Stock your pack for the road: nothing can be bought once an item is open.
      {:else if s.arrivalHeal}The town heals you <span class="n">{s.arrivalHeal}</span> life. The vendor sells again.
      {:else}You arrive at full life. The vendor sells again.{/if}
    </p>
  </header>

  <div class="cols">
    <section class="panel shop" aria-labelledby="shop-h" use:backdropShadow>
      <h2 id="shop-h">Vendor</h2>
      <ul class="wares">
        {#each SUPPLIES as sup (sup)}
          <li>
            <div class="what">
              <span class="name">{SUPPLY_NAMES[sup]}</span>
              <span class="does">{REVEALS[sup]}</span>
            </div>
            <span class="price"><span class="n">{s.tuning.price[sup]}</span> gold</span>
            <button class="btn small" disabled={!run.canBuy(sup)} onclick={() => run.buy(sup)} aria-label="Buy a {SUPPLY_NAMES[sup]}">Buy</button>
          </li>
        {/each}
      </ul>
      <p class="note">
        {#if full}The pack is full.{:else}You have <span class="n">{s.gold}</span> gold.{/if}
      </p>
    </section>

    <div class="side">
      <section class="panel" aria-labelledby="pack-h" use:backdropShadow>
        <h2 id="pack-h">Pack</h2>
        <PackList {run} />
      </section>
      <section class="panel" aria-labelledby="flask-h" use:backdropShadow>
        <h2 id="flask-h">Flask</h2>
        <p class="flask">
          <span><span class="n">{s.flask.charges}</span> {s.flask.charges === 1 ? 'charge' : 'charges'} left. A drink heals <span class="n">{FLASK_STEP}</span> after each of the next <span class="n">{FLASK_ITEMS}</span> items.</span>
          <button class="btn small ghost" disabled={!run.canDrink()} onclick={() => run.drink()}>Drink</button>
        </p>
      </section>
      <section class="panel" aria-labelledby="road-h" use:backdropShadow>
        <h2 id="road-h">The road</h2>
        <ol class="road">
          {#each ahead as z (z.no)}
            <li><span class="zn">Zone <span class="n">{z.no}</span> • {ZONE_NAMES[z.z]}</span> <span class="rule">{zoneLine(run, z.z)}</span></li>
          {/each}
          <li><span class="zn">The boss • <span class="n">{BOSS_ITEMS}</span> items</span> <span class="rule">{BOSS_RULE}.</span></li>
        </ol>
        {#if camp}<p class="note">The town comes after zone <span class="n">2</span> of <span class="n">{ZONES}</span>.</p>{/if}
      </section>
    </div>
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
  .cols {
    display: grid;
    grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
    gap: 1rem;
    align-items: start;
  }
  .side {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  h2 {
    margin-bottom: 0.6rem;
  }
  .wares {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
  }
  .wares li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 0.4rem 0.9rem;
    padding: 0.55rem 0;
    border-top: 1px solid rgba(125, 99, 51, 0.25);
  }
  .wares li:first-child {
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
  .does {
    font-size: 0.92rem;
    color: var(--muted);
    line-height: 1.3;
  }
  .price {
    white-space: nowrap;
    color: var(--muted);
  }
  .note {
    margin: 0.6rem 0 0;
    font-size: 0.95rem;
    color: var(--muted);
  }
  .flask {
    margin: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
    font-size: 0.95rem;
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
  @media (max-width: 760px) {
    .cols {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
