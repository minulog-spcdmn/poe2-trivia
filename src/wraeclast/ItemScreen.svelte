<script lang="ts">
  // An item: its terms (the zone's rule, what a miss costs, a corruption),
  // its tooltip as the game draws one (the nameplate, the art under the
  // Veil, the clues shown so far), the Inscription, and the pack. Clear and
  // Submit sit at the foot (docked on phones); once named, the way on.
  import NamePlate from '../components/NamePlate.svelte';
  import { backdropShadow } from '../lib/backdropShadow';
  import { motion } from '../lib/motion.svelte';
  import { BOSS_ITEMS, CLUES, CORRUPTION_NAMES, ZONE_NAMES, type Run, type Supply } from './rules';
  import Veil from './Veil.svelte';
  import Clues from './Clues.svelte';
  import ItemPack from './ItemPack.svelte';
  import Inscription from './Inscription.svelte';
  import { BOSS_RULE, ZONE_RULE } from './words';

  let { run }: { run: Run } = $props();
  const s = $derived(run.state);
  const it = $derived(s.item!);
  const named = $derived(s.phase === 'solved');
  const zone = $derived(it.zoneType);
  const [lo, hi] = $derived(run.missRange());
  const healed = $derived(it.log.healed);
  /** The way on, once named: the loot (none at the boss, or Bricked), or the next item. */
  const onward = $derived(it.boss !== null ? (it.boss === BOSS_ITEMS - 1 ? 'See the end' : 'Next item') : it.corruption === 'bricked' ? 'Go on' : 'Take your loot');
  let plateScale = $state<number>();
  let art = $state<HTMLElement>();
  let ins = $state<HTMLElement>();
  /** A supply used: what it changed brought into view (on a phone the art is above the pack, the line further up). */
  function used(what: Supply | 'vaal') {
    const to = what === 'flare' || what === 'vaal' ? art : what === 'wisdom' ? art : ins;
    to?.scrollIntoView({ block: 'nearest', behavior: motion.still ? 'auto' : 'smooth' });
  }
</script>

<div class="item" class:named>
  <p class="terms">
    <span class="term rule">{zone ? `${ZONE_NAMES[zone]}: ${ZONE_RULE[zone]}` : BOSS_RULE}</span>
    <span class="term">A miss costs <span class="n">{lo}</span> to <span class="n">{hi}</span> life</span>
    {#if it.corruption}<span class="term corrupt">Corrupted • {CORRUPTION_NAMES[it.corruption]}</span>{/if}
  </p>

  <div class="layout">
    <div class="tooltip" class:good={named} class:corrupt={!!it.corruption} use:backdropShadow={{ fill: 'linear' }}>
      <div class="head" style:--plate-scale={plateScale}>
        <NamePlate fit bind:scale={plateScale} />
        <div class="head-text">
          {#if named}
            <span class="iname">{it.log.name}</span>
            <span class="ibase">{CLUES[it.itemId].base}</span>
          {:else}
            <span class="iname unknown">Unidentified</span>
          {/if}
        </div>
      </div>
      <div class="art" bind:this={art} use:backdropShadow={{ fill: 'stage' }}>
        <div class="frame"><Veil {run} /></div>
      </div>
      <Clues {run} />
    </div>
    <div class="ins-area" bind:this={ins}><Inscription {run} /></div>
    <div class="pack-area"><ItemPack {run} onuse={used} /></div>
  </div>

  <div class="go dock">
    {#if named}
      <p class="result" role="status">
        <span class="tick" aria-hidden="true">✓</span> Named{#if healed}: the flask heals <span class="n">+{healed}</span>{/if}{#if it.corruption === 'bricked'}. Bricked: nothing drops{/if}.
      </p>
      <button class="btn primary big" onclick={() => run.next()}>{onward}</button>
    {:else}
      <button class="btn ghost" disabled={it.build.length <= it.locked} onclick={() => run.clear()}>Clear</button>
      <button class="btn primary big" disabled={!run.canSubmit()} onclick={() => run.submit()}>Submit</button>
    {/if}
  </div>
</div>

<style>
  /* Laid out by its own width (the page's, or a cell's on the QA desk). */
  .item {
    container: item / inline-size;
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }
  /* The item's terms, apart by space alone: a bullet would start a line when they wrap. */
  .terms {
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.2rem 1.4rem;
    font-size: 0.95rem;
    color: var(--muted);
    text-align: center;
  }
  .term:first-child {
    font-family: var(--font-display);
    font-weight: 700;
    color: #e9c8a2;
  }
  .term.corrupt {
    font-family: var(--font-display);
    font-weight: 700;
    color: #ff6a55;
  }
  /* Named: the tooltip turns green, as at the game's reveal. */
  .tooltip.good {
    border-color: #5d8a50;
  }
  .tooltip.corrupt:not(.good) {
    border-color: #7a2418;
  }
  .result {
    margin: 0;
    align-self: center;
    color: #cfe3b8;
  }
  .tick {
    color: #a9cf8f;
    font-weight: 700;
  }
  .iname:not(.unknown) {
    color: var(--unique-hi, #d8a26a);
  }
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    grid-template-areas:
      'tip ins'
      'tip pack';
    grid-template-rows: auto 1fr;
    gap: 1rem;
    align-items: start;
  }
  .tooltip {
    grid-area: tip;
  }
  .pack-area {
    grid-area: pack;
  }
  .ins-area {
    grid-area: ins;
  }

  /* The game's item tooltip (QuestionView.svelte's). */
  .tooltip {
    display: flex;
    flex-direction: column;
    border: 1px solid #5a3a1c;
    --bs-fill-a: rgba(5, 4, 3, 0.92);
    --bs-fill-b: rgba(5, 4, 3, 0.92);
    background: var(--bs-fill-paint, linear-gradient(var(--bs-fill-a), var(--bs-fill-b)));
    --bs2: 20px 60px;
    --bs2-color: rgba(0, 0, 0, 0.7);
    box-shadow:
      0 0 0 1px #000,
      var(--bs-soft-paint, 0 var(--bs2, 0 0) var(--bs2-color, transparent));
  }
  .head {
    position: relative;
    flex: none;
    display: grid;
    height: 64px;
    place-items: center;
    padding: 0 3.6rem;
  }
  .head-text {
    position: relative;
    grid-area: 1 / 1;
    display: flex;
    flex-flow: row wrap;
    justify-content: center;
    align-items: baseline;
    line-height: 1.15;
  }
  .iname {
    flex-basis: 100%;
    text-align: center;
    font-family: var(--font-display);
    font-weight: 700;
    color: #c8c8c8;
    letter-spacing: 0.1em;
    font-size: 1.05rem;
  }
  .ibase {
    font-family: var(--font-display);
    font-size: 0.95rem;
    color: #d8a26a;
    opacity: 0.85;
  }
  .art {
    position: relative;
    height: 340px;
    container-type: size;
    --bs-fill-a: rgba(175, 96, 37, 0.16);
    background: var(
      --bs-fill-paint,
      radial-gradient(ellipse 55% 50% at 50% 52%, var(--bs-fill-a), transparent 70%),
      radial-gradient(ellipse 80% 45% at 50% 0%, rgba(90, 110, 160, 0.1), transparent 70%),
      radial-gradient(ellipse at center, transparent 45%, rgba(0, 0, 0, 0.55) 100%),
      linear-gradient(180deg, #0c0d12, #060709)
    );
    box-shadow:
      inset 0 1px 0 rgba(201, 164, 92, 0.12),
      inset 0 0 40px rgba(0, 0, 0, 0.6);
    overflow: hidden;
  }
  .frame {
    position: absolute;
    inset: 0;
    margin: auto;
    width: 84%;
    height: 86%;
  }


  @container item (max-width: 860px) {
    .layout {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas: 'tip' 'ins' 'pack';
      grid-template-rows: none;
    }
  }
  @container item (max-width: 640px) {
    .art {
      height: 240px;
    }
    .terms {
      font-size: 0.9rem;
      column-gap: 1rem;
    }
  }
</style>
