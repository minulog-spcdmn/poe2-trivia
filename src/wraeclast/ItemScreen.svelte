<script lang="ts">
  // An item, as the design lays it out: the tooltip (the name plate, the art
  // in its square frame under the Veil beside what is known of it), the pack,
  // the Inscription, and the dock: what a miss costs and the deal a right
  // name drops, the flask's drink, and Identify. After a miss the dock says
  // what it cost; once named, the name and the way on. Phones stack it all,
  // the dock pinned at the foot; wide screens set the tooltip beside the
  // Inscription, the dock under both.
  import NamePlate from '../components/NamePlate.svelte';
  import { motion } from '../lib/motion.svelte';
  import { BOSS_MOD_NAMES, CLUES, HIDDEN_NAMES, type Run, type Supply } from './rules';
  import Veil from './Veil.svelte';
  import Clues from './Clues.svelte';
  import ItemPack from './ItemPack.svelte';
  import Inscription from './Inscription.svelte';
  import Glyph from './Glyph.svelte';
  import { BOSS_MOD_DOES, BOSS_RULE, HIDDEN_DOES, ZONE_RULE, plural } from './words';

  let { run }: { run: Run } = $props();
  const s = $derived(run.state);
  const it = $derived(s.item!);
  const named = $derived(s.phase === 'solved');
  const boss = $derived(it.boss !== null);
  const [lo, hi] = $derived(run.missRange());
  const healed = $derived(it.log.healed);
  const last = $derived(it.log.submits.at(-1));
  /** The last wrong submit, while its marked line stands. */
  const miss = $derived(it.lineMarks && last && !last.right ? last : null);
  /** The deal a right name drops now: the zone's cards (corruption's too) less one a miss, never below 1. */
  const full = $derived(run.dealHere());
  const deal = $derived(boss ? 0 : Math.max(1, full - it.misses));
  const lost = $derived(boss ? 0 : full - deal);
  const visit = $derived(s.visit);
  const onward = $derived(boss ? (visit && visit.done + 1 >= visit.items ? 'Claim the win' : 'Next item') : 'Take the loot');
  /** The zone's rule on the plate (none for a zone without one; the boss's own line says Silent). */
  const rule = $derived(!boss && it.zoneType && ZONE_RULE[it.zoneType] !== 'No rule' ? ZONE_RULE[it.zoneType] : '');
  /** The plate's terms in full, for a long press or a hover. */
  const terms = $derived(
    [it.hidden ? `${HIDDEN_NAMES[it.hidden]}: ${HIDDEN_DOES[it.hidden]}` : '', boss ? BOSS_RULE : rule, ...(boss ? s.bossMods.map((m) => `${BOSS_MOD_NAMES[m]}: ${BOSS_MOD_DOES[m]}`) : [])].filter(Boolean).join(' '),
  );
  /** The board's height, about (rows of tiles at a phone's width), for the art to give way to it on a short screen. */
  const boardH = $derived.by(() => {
    const dense = it.tiles.length > 26;
    return Math.ceil(it.tiles.length / (dense ? 7.5 : 6.5)) * (dense ? 38 : 45);
  });
  let plateScale = $state<number>();
  let art = $state<HTMLElement>();
  let ins = $state<HTMLElement>();
  /** A supply used: what it changed brought into view (on a phone the art is above the pack, the line under it). */
  function used(what: Supply) {
    const to = what === 'flare' ? art : what === 'first' || what === 'decoy' || what === 'lengths' ? ins : art;
    to?.scrollIntoView({ block: 'nearest', behavior: motion.still ? 'auto' : 'smooth' });
  }
</script>

<div class="item" class:named style:--board="{boardH}px">
  <div class="desk">
    <div class="col">
      <section class="tip" class:good={named} class:corrupted={!!it.hidden || (boss && s.bossMods.length > 0)} aria-label="The item">
        <div class="head" style:--plate-scale={plateScale}>
          <NamePlate fit bind:scale={plateScale} />
          <div class="head-text">
            {#if named}
              <span class="iname">{it.log.name}</span>
              <span class="ibase">{CLUES[it.itemId].base}</span>
            {:else}
              <span class="iname unknown">Unidentified</span>
              {#if it.hidden || boss || rule}
                <span class="terms" title={terms}>
                  {#if it.hidden}<span class="corrupt-line">Corrupted • {HIDDEN_NAMES[it.hidden]}</span>{/if}
                  {#if boss}<span class="corrupt-line">{['Silent', ...s.bossMods.map((m) => BOSS_MOD_NAMES[m])].join(' • ')}</span>{:else if rule}<span class="rule-line">{rule}</span>{/if}
                </span>
              {/if}
            {/if}
          </div>
        </div>
        <div class="ibody">
          <div class="art" bind:this={art}>
            <div class="frame"><Veil {run} /></div>
            {#if it.hidden === 'dark' && !named}<span class="dark" aria-hidden="true"></span>{/if}
          </div>
          <Clues {run} />
        </div>
      </section>
      {#if !named}<ItemPack {run} onuse={used} />{/if}
    </div>
    <div class="col" bind:this={ins}><Inscription {run} /></div>
  </div>

  <div class="dock">
    {#if named}
      <div class="result" role="status">
        <span class="vsign" aria-hidden="true">✓</span>
        <p>
          {it.log.name}
          <small>{#if boss}Named.{:else}Loot: <span class="deal" aria-hidden="true">{#each Array.from({ length: deal }, (_, k) => k) as k (k)}<i></i>{/each}</span>{plural(deal, 'card')}{/if}{#if healed}{' '}The flask heals <b>+{healed}</b>.{/if}</small>
        </p>
      </div>
      <button class="btn primary" onclick={() => run.next()}>{onward}</button>
    {:else}
      {#if miss}
        <div class="result" role="status">
          <span class="vsign bad" aria-hidden="true">✕</span>
          <span class="lost-vial" aria-hidden="true"></span>
          <p>
            <b class="minus">−{miss.lost}</b> life
            <small>{#if boss}Misses here cost <b>{lo}</b> to <b>{hi}</b>.{:else}<span class="deal" aria-hidden="true">{#each Array.from({ length: full }, (_, k) => k) as k (k)}<i class:lost={k >= deal}></i>{/each}</span>The deal: {plural(deal, 'card')}{/if}</small>
          </p>
        </div>
      {:else}
        <div class="stakes">
          <div class="row miss">Miss: <b>{lo}</b> to <b>{hi}</b> life</div>
          {#if boss}
            <div class="row reward">No loot at the boss</div>
          {:else}
            <div class="row reward"><span class="deal" aria-hidden="true">{#each Array.from({ length: full }, (_, k) => k) as k (k)}<i class:lost={k >= deal} class:extra={!!it.hidden && k >= full / 2 && k < deal}></i>{/each}</span>{plural(deal, 'card')}{#if lost}{' '}<s>{full}</s>{/if}</div>
          {/if}
          {#if run.blocked() === 'tried'}<div class="row warn">Sent already: change the line</div>{/if}
        </div>
      {/if}
      <button class="drink" disabled={!run.canDrink()} onclick={() => run.drink()} aria-label="Drink a flask charge: {s.flask.charges} left" title="Drink: +10 now, +10 after each of the next 2 items">
        <span class="ic" aria-hidden="true"><Glyph of="flask" /></span><span class="n" aria-hidden="true">{s.flask.charges}</span>
      </button>
      <button class="btn primary" disabled={!run.canSubmit()} onclick={() => run.submit()}>Identify</button>
    {/if}
  </div>
</div>

<style>
  /* Laid out by its own width (the page's, or a cell's on the QA desk). */
  .item {
    container: item / inline-size;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .desk {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .col {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  /* The game's tooltip box (QuestionView .tooltip). */
  .tip {
    display: flex;
    flex-direction: column;
    border: 1px solid #5a3a1c;
    background: rgba(5, 4, 3, 0.92);
    box-shadow:
      0 0 0 1px #000,
      0 20px 60px rgba(0, 0, 0, 0.7);
  }
  .tip.good {
    border-color: #4f7a45;
    box-shadow:
      0 0 0 1px #000,
      0 0 50px rgba(150, 190, 110, 0.12),
      0 20px 60px rgba(0, 0, 0, 0.7);
  }
  .tip.corrupted:not(.good) {
    border-color: #7a1c14;
    box-shadow:
      0 0 0 1px #000,
      0 0 40px rgba(210, 0, 0, 0.12),
      0 20px 60px rgba(0, 0, 0, 0.7);
  }
  .head {
    position: relative;
    flex: none;
    display: grid;
    min-height: 54px;
    place-items: center;
    padding: 0 3.2rem;
  }
  .head-text {
    position: relative;
    grid-area: 1 / 1;
    display: flex;
    flex-flow: row wrap;
    justify-content: center;
    align-items: baseline;
    column-gap: 0.6em;
    line-height: 1.15;
    text-align: center;
  }
  .iname {
    flex-basis: 100%;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 19px;
    color: var(--unique-hi);
    text-shadow: 0 0 12px rgba(224, 138, 68, 0.4);
  }
  .iname.unknown {
    font-size: 16.8px;
    letter-spacing: 0.1em;
    color: #c8c8c8;
    text-shadow: none;
  }
  .ibase {
    font-family: var(--font-display);
    font-size: 15.2px;
    color: #d8a26a;
    opacity: 0.85;
  }
  /* The item's terms under its name, as the game adds a line to the plate:
     a corruption and the boss's modifiers red, a zone's rule cool. */
  .terms {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    column-gap: 0.6em;
    font-family: var(--font-cinzel);
    font-weight: 500;
    font-size: 12px;
    line-height: 1.2;
    letter-spacing: 0.04em;
  }
  .corrupt-line {
    color: #f0574a;
  }
  .rule-line {
    color: #a9c3dc;
  }
  /* The body under the plate: the square frame beside what is known. */
  .ibody {
    display: flex;
    align-items: stretch;
  }
  /* The art stage, square for every item: a warm glow behind the art, cool
     rim light, a vignette, dithered (no banding). */
  .art {
    position: relative;
    flex: none;
    /* On a phone the art gives way to the board, so a full one (the boss's) still shows above the dock. */
    width: clamp(84px, calc(100dvh - 400px - var(--board, 0px)), min(42%, 220px));
    aspect-ratio: 1;
    align-self: flex-start;
    padding: 8px;
    border-right: 1px solid #2a1c10;
    border-bottom: 1px solid #2a1c10;
    background:
      var(--dither),
      radial-gradient(ellipse 55% 50% at 50% 52%, rgba(175, 96, 37, 0.16), transparent 70%),
      radial-gradient(ellipse 80% 45% at 50% 0%, rgba(90, 110, 160, 0.1), transparent 70%),
      radial-gradient(ellipse at center, transparent 45%, rgba(0, 0, 0, 0.55) 100%),
      linear-gradient(180deg, #0c0d12, #060709);
    image-rendering: pixelated;
    box-shadow:
      inset 0 1px 0 rgba(201, 164, 92, 0.12),
      inset 0 0 40px rgba(0, 0, 0, 0.6);
    overflow: hidden;
  }
  .art > * {
    image-rendering: auto;
  }
  .tip.good .art {
    background:
      var(--dither),
      radial-gradient(ellipse 55% 50% at 50% 52%, rgba(150, 185, 105, 0.16), transparent 70%),
      radial-gradient(ellipse at center, transparent 45%, rgba(0, 0, 0, 0.55) 100%),
      linear-gradient(180deg, #0c0d12, #060709);
  }
  .tip.corrupted:not(.good) .art {
    background:
      var(--dither),
      radial-gradient(ellipse 60% 55% at 50% 52%, rgba(200, 30, 20, 0.22), transparent 70%),
      radial-gradient(ellipse at center, transparent 45%, rgba(0, 0, 0, 0.55) 100%),
      linear-gradient(180deg, #0c0d12, #060709);
  }
  .frame {
    position: relative;
    width: 100%;
    height: 100%;
  }
  /* Dark: the art can't be revealed; a seal stands over the frame. */
  .dark {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: radial-gradient(closest-side, rgba(30, 8, 6, 0.4), transparent);
  }
  .dark::after {
    content: '';
    width: 46%;
    aspect-ratio: 1;
    border-radius: 50%;
    border: 1px solid rgba(226, 52, 43, 0.55);
    box-shadow:
      inset 0 0 0 5px rgba(0, 0, 0, 0.6),
      inset 0 0 0 6px rgba(226, 52, 43, 0.35),
      0 0 16px rgba(226, 52, 43, 0.3);
  }
  .ibody :global(.lines) {
    flex: 1;
  }

  /* The dock: the one gold button, in reach of a thumb (QuestionView .dock). */
  .dock {
    position: sticky;
    bottom: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 66px;
    margin: 0 -16px;
    padding: 10px 16px calc(10px + env(safe-area-inset-bottom));
    background-color: rgb(10, 8, 6);
    border-top: 1px solid rgba(125, 99, 51, 0.35);
    box-shadow: 0 -8px 22px rgba(0, 0, 0, 0.55);
  }
  .dock .btn.primary {
    flex: none;
    min-width: 132px;
    padding: 0.95em 1.2em;
    font-size: 14px;
  }
  .stakes {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
    line-height: 1.2;
  }
  .stakes .row {
    font-size: 15px;
    color: #cfc4b2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .stakes b {
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 14.5px;
    color: #f0a68c;
  }
  .stakes s {
    color: #7a6e5c;
    font-family: var(--font-cinzel);
    font-size: 12.5px;
    text-decoration-color: rgba(224, 85, 63, 0.8);
  }
  .stakes .warn {
    color: #ff9c86;
    font-size: 13.5px;
  }
  /* The coming deal: a small card for each card a right name drops; one a miss took, dashed. */
  .deal {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    vertical-align: -2px;
    margin-right: 5px;
  }
  .deal i {
    width: 9px;
    height: 13px;
    border-radius: 1.5px;
    border: 1px solid var(--gold);
    background: linear-gradient(180deg, #3a2a17, #1d140b);
  }
  .deal i.lost {
    border: 1px dashed rgba(224, 85, 63, 0.9);
    background: none;
    opacity: 0.8;
  }
  .deal i.extra {
    border-color: #e2342b;
    background: linear-gradient(180deg, #4a1a12, #1d0b07);
    box-shadow: 0 0 5px rgba(226, 52, 43, 0.6);
  }
  /* After a verdict: the sign, then the sentence (QuestionView .result). */
  .result {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 9px;
  }
  .result p {
    flex: 1;
    min-width: 0;
    margin: 0;
    font-size: 16px;
    line-height: 1.25;
    color: #e6dccb;
  }
  .result b {
    font-family: var(--font-cinzel);
    font-weight: 700;
  }
  .result .minus {
    color: #f0a68c;
  }
  .result small {
    display: block;
    font-size: 13.5px;
    color: var(--muted);
  }
  .result small b {
    font-size: 13px;
    color: var(--gold-hi);
  }
  .vsign {
    flex: none;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-size: 14px;
    --v-icon: #c2e3a6;
    --v-tint: 150, 200, 105;
    color: var(--v-icon);
    background: radial-gradient(circle at 50% 35%, rgba(var(--v-tint), 0.35), rgba(var(--v-tint), 0.12) 70%), #0c0a08;
    box-shadow:
      0 0 0 1px rgba(var(--v-tint), 0.75),
      0 0 12px rgba(var(--v-tint), 0.45);
  }
  .vsign.bad {
    --v-icon: #f0a68c;
    --v-tint: 220, 110, 80;
  }
  /* One chamber of the phial, its light pouring out of its tip (QuestionView .lost-vial). */
  .lost-vial {
    position: relative;
    flex: none;
    width: 24px;
    height: 10px;
    clip-path: polygon(0 0, 78% 0, 100% 50%, 78% 100%, 0 100%);
    background: #c9a45c;
  }
  .lost-vial::before {
    content: '';
    position: absolute;
    inset: 1.2px;
    clip-path: polygon(0 0, 78% 0, 100% 50%, 78% 100%, 0 100%);
    background: linear-gradient(90deg, #150d08 0 45%, #9c0f2c 60%, #ec3a48 80%, #ffe4cf);
  }
  /* The drink: the flask's own button, beside the gold one but not like it. */
  .drink {
    position: relative;
    flex: none;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    padding: 0;
    border: 1px solid #6b3a2c;
    background: radial-gradient(circle at 50% 35%, rgba(150, 40, 40, 0.35), rgba(30, 10, 8, 0.9) 70%);
    color: #f0a68c;
    box-shadow:
      inset 0 1px 0 rgba(255, 200, 180, 0.1),
      0 0 0 3px #0a0806,
      0 0 0 4px rgba(107, 58, 44, 0.5);
    cursor: pointer;
  }
  .drink:hover:not(:disabled) {
    border-color: #ff9a78;
    color: #fff0e8;
  }
  .drink .ic {
    width: 22px;
    height: 22px;
  }
  .drink .n {
    position: absolute;
    top: -5px;
    right: -5px;
    display: grid;
    place-items: center;
    min-width: 18px;
    height: 18px;
    padding: 0 4px;
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 11.5px;
    line-height: 1;
    color: #ffd2c2;
    background: #0c0a08;
    border: 1px solid #6b3a2c;
    border-radius: 9px;
  }
  .drink:disabled {
    opacity: 0.35;
    filter: saturate(0.4);
    cursor: not-allowed;
  }

  /* Wide screens: the game's two columns (QuestionView), the dock under both. */
  @container item (min-width: 700px) {
    .desk {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      column-gap: 28px;
      align-items: start;
    }
    .head {
      min-height: 64px;
    }
    .art {
      width: min(50%, 300px);
    }
    .dock {
      position: static;
      margin: 0;
      padding: 14px 0 0;
      background: none;
      border-top: 1px solid rgba(125, 99, 51, 0.25);
      box-shadow: none;
    }
    .dock .btn.primary {
      min-width: 170px;
      padding: 1em 1.8em;
      font-size: 15px;
    }
    .stakes .row {
      font-size: 17px;
    }
    .result p {
      font-size: 18px;
    }
  }
  /* A short window (a laptop's): the dock stays pinned, so Identify is never below the fold. */
  @media (max-height: 820px) {
    .dock {
      position: sticky;
      background-color: rgb(10, 8, 6);
    }
  }
</style>
