<script lang="ts">
  // An item: its terms (the card, what it pays, what a miss costs), its
  // tooltip as the game draws one (the nameplate, the art under the Veil,
  // the clues shown so far), the Inscription, and the pack. Clear and Submit
  // sit at the foot (docked on phones).
  import NamePlate from '../components/NamePlate.svelte';
  import { backdropShadow } from '../lib/backdropShadow';
  import { singular } from '../lib/game';
  import { motion } from '../lib/motion.svelte';
  import { ZONE_NAMES, reach, sectionOf, type Run } from './rules';
  import Veil from './Veil.svelte';
  import Clues from './Clues.svelte';
  import ItemPack from './ItemPack.svelte';
  import Inscription from './Inscription.svelte';
  import Numbered from './Numbered.svelte';
  import { times } from './markup';
  import { BOSS_RULE, ZONE_RULE } from './words';

  let { run }: { run: Run } = $props();
  const s = $derived(run.state);
  const it = $derived(s.item!);
  const section = $derived(sectionOf(it.n));
  const zone = $derived(run.zoneType(it.zoneNo));
  const pays = $derived(section === 'boss' ? 0 : Math.floor((s.tuning.reward[section] * it.multiplier) / 2 ** it.misses));
  const cost = $derived(s.tuning.missCost[section]);
  const taps = $derived(reach(it));
  let plateScale = $state<number>();
  let art = $state<HTMLElement>();
  /** A Flare taken from the pack: the art it's tapped on brought into view (a phone's pack is below it). */
  function flared() {
    art?.scrollIntoView({ block: 'nearest', behavior: motion.still ? 'auto' : 'smooth' });
  }
</script>

<div class="item">
  <p class="terms">
    <span class="term">{it.category} <span class="n">{times(it.multiplier)}</span></span>
    <span class="term">{#if section === 'boss'}The boss pays no gold{:else}Pays <span class="n">{pays}</span> gold{/if}</span>
    <span class="term">A miss costs <span class="n">{cost}</span> life</span>
    <span class="term rule"><Numbered text={zone ? `${ZONE_NAMES[zone]}: ${ZONE_RULE[zone]}` : BOSS_RULE} /></span>
  </p>

  <div class="layout">
    <div class="tooltip" use:backdropShadow={{ fill: 'linear' }}>
      <div class="head" style:--plate-scale={plateScale}>
        <NamePlate fit bind:scale={plateScale} />
        <div class="head-text">
          <span class="iname unknown">Unidentified</span>
          <span class="ibase">{singular(it.category)}</span>
        </div>
      </div>
      <div class="art" bind:this={art} use:backdropShadow={{ fill: 'stage' }}>
        <div class="frame"><Veil {run} /></div>
      </div>
      <p class="flare" role="status">{#if taps > 0}Tap <span class="n">{taps}</span> {taps === 1 ? 'patch' : 'patches'} on the art to lift {taps === 1 ? 'it' : 'them'}.{/if}</p>
      <Clues {run} />
    </div>
    <div class="ins-area"><Inscription {run} /></div>
    <div class="pack-area"><ItemPack {run} onflare={flared} /></div>
  </div>

  <div class="go dock">
    <button class="btn ghost" disabled={!it.build.length} onclick={() => run.clear()}>Clear</button>
    <button class="btn primary big" disabled={!run.canSubmit()} onclick={() => run.submit()}>Submit</button>
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

  /* A Flare's taps still to make, right under the art they're made on. */
  .flare {
    margin: 0;
    padding: 0.35rem 0.8rem;
    border-block: 1px solid rgba(224, 138, 68, 0.45);
    background: rgba(224, 138, 68, 0.1);
    font-size: 0.95rem;
    text-align: center;
    color: #f1c99a;
  }
  /* Empty, it takes no room but stays in the page, so a screen reader hears what comes into it. */
  .flare:empty {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
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
