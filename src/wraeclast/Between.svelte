<script lang="ts">
  // Between items: the item just named (its art whole, what it paid, the
  // flask's heal), the flask to drink before the next, and what comes next.
  import ArtImage from '../components/ArtImage.svelte';
  import { backdropShadow } from '../lib/backdropShadow';
  import { itemImage } from '../lib/ui-paths';
  import { FLASK_ITEMS, FLASK_STEP, TOWN_AFTER, ZONES, ZONE_ITEMS, ZONE_NAMES, sectionOf, zoneOf, type Run } from './rules';
  import Numbered from './Numbered.svelte';
  import { BOSS_RULE, zoneLine } from './words';

  let { run }: { run: Run } = $props();
  const s = $derived(run.state);
  const last = $derived(s.last!);
  const item = $derived(run.engine.byId.get(last.itemId)!);
  const boss = $derived(sectionOf(s.done - 1) === 'boss');
  /** What comes next: the town, a new zone, the boss, or the next item here. */
  const next = $derived.by(() => {
    const n = s.done;
    if (n === TOWN_AFTER) return { label: 'On to the town', line: 'The town heals 20 life, and its vendor sells every supply.' };
    if (n === ZONES * ZONE_ITEMS) return { label: 'Face the boss', line: `Three items. ${BOSS_RULE}.` };
    if (n % ZONE_ITEMS === 0 && n < ZONES * ZONE_ITEMS) {
      const z = run.zoneType(zoneOf(n))!;
      return { label: `On to zone ${zoneOf(n)}`, line: `Zone ${zoneOf(n)} • ${ZONE_NAMES[z]}: ${zoneLine(run, z)}` };
    }
    return { label: 'Next item', line: '' };
  });
</script>

<div class="between">
  <header class="screen-title">
    <h1>{last.name}</h1>
    <p class="sub">
      Named {#if last.misses}after <span class="n">{last.misses}</span> {last.misses === 1 ? 'miss' : 'misses'}{:else}at the first try{/if}.
    </p>
  </header>

  <div class="show" use:backdropShadow={{ fill: 'stage' }}>
    <ArtImage src={itemImage(item.id)} alt={item.name} w={item.w} h={item.h} scale={2} float />
  </div>

  <ul class="gains">
    <li>{#if boss}The boss pays no gold{:else}<span class="n">+{last.gold}</span> gold{/if}</li>
    {#if last.healed}<li>The flask heals <span class="n">+{last.healed}</span> life</li>{/if}
  </ul>

  <section class="panel flask" aria-labelledby="flask-h" use:backdropShadow={{ fill: 'linear' }}>
    <div>
      <h2 id="flask-h">Flask</h2>
      <p>
        <span class="n">{s.flask.charges}</span> {s.flask.charges === 1 ? 'charge' : 'charges'} left.
        {#if s.flask.recovering}Still healing <span class="n">+{FLASK_STEP}</span> after the next <span class="n">{s.flask.recovering}</span> {s.flask.recovering === 1 ? 'item' : 'items'}; a drink now starts over.{:else}A drink heals <span class="n">+{FLASK_STEP}</span> after each of the next <span class="n">{FLASK_ITEMS}</span> items.{/if}
      </p>
    </div>
    <button class="btn small ghost" disabled={!run.canDrink()} onclick={() => run.drink()}>Drink</button>
  </section>

  {#if next.line}<p class="next"><Numbered text={next.line} /></p>{/if}

  <div class="go dock">
    <button class="btn primary big" onclick={() => run.next()}>{next.label}</button>
  </div>
</div>

<style>
  .between {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }
  .between > :global(*) {
    width: 100%;
    max-width: 34rem;
  }
  /* The dock spans the screen (screens.css bleeds it to the edges on phones). */
  .between > .go {
    width: auto;
    max-width: none;
    align-self: stretch;
  }
  .show {
    position: relative;
    height: 220px;
    border: 1px solid #5a3a1c;
    --bs-fill-a: rgba(175, 96, 37, 0.16);
    background: var(
      --bs-fill-paint,
      radial-gradient(ellipse 55% 50% at 50% 52%, var(--bs-fill-a), transparent 70%),
      radial-gradient(ellipse at center, transparent 45%, rgba(0, 0, 0, 0.55) 100%),
      linear-gradient(180deg, #0c0d12, #060709)
    );
    padding: 14px;
  }
  .gains {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.2rem 1.4rem;
    font-size: 1.05rem;
  }
  .flask {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .flask p {
    margin: 0.2rem 0 0;
    font-size: 0.95rem;
  }
  .next {
    margin: 0;
    text-align: center;
    font-style: italic;
    color: var(--muted);
  }
</style>
