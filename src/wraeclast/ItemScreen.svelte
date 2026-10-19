<script lang="ts">
  // An item, as the design lays it out: the tooltip (the name plate, the art
  // in its square frame beside what is known of it), the pack, the answer
  // line and the tiles, and the dock: what a miss costs and the gold a right
  // name pays, and Identify. After a miss the dock says what it cost. Phones
  // stack it all, the dock pinned at the foot; a short phone keeps the pack
  // in a tray the dock's pack key opens. Wide screens set the tooltip beside
  // the answer line, the dock under both.
  //
  // Named, the screen turns into the reveal: the tooltip whole, the gold
  // paid, and the way on in one tap: Next item in the dock at the boss, or
  // from a zone the places one step ahead as rows (the whole map one tap more).
  import { tick, untrack } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import NamePlate from '../components/NamePlate.svelte';
  import { motion } from '../lib/motion.svelte';
  import { CLUES, type Place, type Run } from './rules';
  import Veil from './Veil.svelte';
  import Clues from './Clues.svelte';
  import ItemPack from './ItemPack.svelte';
  import Inscription from './Inscription.svelte';
  import MapScreen from './MapScreen.svelte';
  import { placeDoes, placeKind, plural } from './words';

  /** `onmap`: the whole map, opened from the reveal's Where next. */
  let { run, onmap }: { run: Run; onmap?: () => void } = $props();
  const s = $derived(run.state);
  const it = $derived(s.item!);
  const named = $derived(s.phase === 'solved');
  const boss = $derived(it.boss !== null);
  const [lo, hi] = $derived(run.missRange());
  const [plo, phi] = $derived(run.payRange());
  const payLine = $derived(boss ? 'No gold at the boss' : plo === phi ? `Named: ${plo} gold` : `Named: ${plo} to ${phi} gold`);
  const last = $derived(it.log.submits.at(-1));
  /** The last wrong submit, while its marked line stands. */
  const miss = $derived(it.lineMarks && last && !last.right ? last : null);
  const ahead = $derived(run.ahead());
  /** The board's height, about (rows of tiles at a phone's width), for the art to give way to it on a short screen. */
  const boardH = $derived.by(() => {
    const dense = it.tiles.length > 26;
    return Math.ceil(it.tiles.length / (dense ? 7.5 : 6.5)) * (dense ? 38 : 45);
  });
  let plateScale = $state<number>();
  let art = $state<HTMLElement>();

  /** A short phone (375 by 667): the pack goes in a tray over the dock. */
  const short = new MediaQuery('(max-width: 699px) and (max-height: 740px)');
  let tray = $state(false);

  /** A supply used: what it changed brought into view (on a phone the art is above the pack). */
  function used() {
    tray = false;
    art?.scrollIntoView({ block: 'nearest', behavior: motion.still ? 'auto' : 'smooth' });
  }

  // ---- The reveal ----

  /** A zone's item named: the places one step ahead. */
  const ways = $derived(named && run.leaving() ? run.graph.next[s.at] : []);
  const nextStep = $derived(ways.length ? run.graph.byId.get(ways[0])!.step : 0);
  /** A wide desktop: the map stands beside the reveal (V4RevealDesk). */
  const mapCol = new MediaQuery('(min-width: 1400px)');
  const withMap = $derived(mapCol.current && ways.length > 0);

  let tipEl = $state<HTMLElement>();
  let headEl = $state<HTMLElement>();
  let sideEl = $state<HTMLElement>();
  /** The tooltip's body height on a phone: what the window leaves under the run bar, over Where next and the dock. */
  let rh = $state<number>();

  async function measure() {
    if (!tipEl || !headEl || !sideEl) return;
    const top = tipEl.getBoundingClientRect().top + scrollY;
    rh = Math.round(Math.max(150, Math.min(340, innerHeight - top - headEl.offsetHeight - sideEl.offsetHeight - 14)));
    await tick();
  }

  // Named: the reveal starts at the top of the page (the tiles above it are gone), sized to the window.
  $effect(() => {
    if (!named) return;
    untrack(() => {
      tray = false;
      scrollTo({ top: 0 });
    });
    const raf = requestAnimationFrame(() => void measure());
    return () => cancelAnimationFrame(raf);
  });

  /** A place's row under Where next: its kind, its line, and all of it said. */
  function row(id: string) {
    const n = run.graph.byId.get(id)!;
    const p: Place = s.places[id];
    const line = placeDoes(run, p);
    return { n, p, line, label: `Go to ${n.name}: ${placeKind(p)}, ${line}` };
  }
</script>

{#snippet placeMark(p: Place)}
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round" stroke-linecap="round">
    {#if p.kind === 'town' || p.kind === 'camp'}
      <path d="M4.5 20.5v-9L12 5.5l7.5 6v9M9.6 20.5v-5.4h4.8v5.4M2.8 20.5h18.4" /><path d="M12 2.5v3" stroke-width=".9" />
    {:else if p.kind === 'boss'}
      <path d="M4 17.5 5.6 7.8l4 4.2L12 5l2.4 7 4-4.2L20 17.5z" /><path d="M4 20.5h16" /><circle cx="12" cy="14.6" r="1.1" stroke-width=".9" />
    {:else}
      <path d="M12 3 20 12 12 21 4 12z" /><path d="M12 7.5 16.5 12 12 16.5 7.5 12z" stroke-width=".9" />
    {/if}
  </svg>
{/snippet}

{#snippet chev()}
  <svg class="chev" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 5.5 16 12l-6.5 6.5" /></svg>
{/snippet}

{#snippet plate()}
  <div class="head" bind:this={headEl} style:--plate-scale={plateScale}>
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
{/snippet}

<!-- One tree for the item and its reveal, so the tooltip (its Veil mid-finale) stays as it is named. -->
<div class="item" class:reveal={named} class:withmap={named && withMap} style:--board="{boardH}px" style:--rh={named && rh ? `${rh}px` : undefined}>
  <div class="desk">
    <div class="col">
      <section class="tip" class:good={named} bind:this={tipEl} aria-label="The item">
        {@render plate()}
        <div class="ibody">
          <div class="art" bind:this={art}>
            <div class="frame"><Veil {run} /></div>
          </div>
          <Clues {run} beside={short.current} />
        </div>
      </section>
      {#if !named && !short.current}<ItemPack {run} onuse={used} />{/if}
    </div>

  {#if named}
    <div class="side" bind:this={sideEl}>
      {#if ways.length}
        <section class="wn" aria-labelledby="wn-h">
          <div class="wn-head">
            <h2 id="wn-h">Where next</h2>
            <span class="stp">Step <span class="n">{nextStep}</span> of <span class="n">{run.graph.boss.step}</span></span>
            <span class="grow"></span>
            {#if onmap}
              <button class="btn ghost small" onclick={onmap} aria-label="The whole map">
                <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round"
                  ><path d="M3.5 6.2 9 4.2l6 2 5.5-2v13.6l-5.5 2-6-2-5.5 2z" /><path d="M9 4.2v13.6M15 6.2v13.6" stroke-width=".9" /></svg
                >Map
              </button>
            {/if}
          </div>
          {#each ways as id (id)}
            {@const r = row(id)}
            <button class="place" onclick={() => run.choose(id)} aria-label={r.label}>
              <span class="k">{@render placeMark(r.p)}</span>
              <span class="tx">
                <span class="nm">{r.n.name}<span class="kd">{placeKind(r.p)}</span></span>
                <span class="ln">{r.line}</span>
              </span>
              {@render chev()}
            </button>
          {/each}
        </section>
      {/if}

      <div class="dock">
        <div class="result" role="status">
          <span class="vsign" aria-hidden="true">✓</span>
          <p>
            {it.log.name}
            <!-- One idea a line. -->
            <small>{it.misses ? plural(it.misses, 'miss') : 'First try'}</small>
            {#if it.log.gold}<small><b>+{it.log.gold}</b> gold</small>{/if}
          </p>
        </div>
        {#if ahead === 'item' || ahead === 'win'}
          <button class="btn primary" onclick={() => run.next()}>{ahead === 'win' ? 'Claim the win' : 'Next item'}</button>
        {/if}
      </div>
    </div>
    {#if withMap}
      <div class="mapcol"><MapScreen {run} plate /></div>
    {/if}
  {:else}
    <div class="col"><Inscription {run} /></div>
  {/if}
  </div>

  {#if !named}
    <div class="dock" class:short={short.current}>
      {#if short.current && tray}
        <div class="tray" role="dialog" aria-label="Your pack">
          <div class="tray-head"><h2>Your pack</h2></div>
          <ItemPack {run} onuse={used} tray />
        </div>
      {/if}
      {#if miss}
        <div class="result" role="status">
          <span class="vsign bad" aria-hidden="true">✕</span>
          <span class="lost-vial" aria-hidden="true"></span>
          <p>
            <b class="minus">−{miss.lost}</b> life
            <small>A miss costs <b>{lo}</b> to <b>{hi}</b> life</small>
          </p>
        </div>
      {:else}
        <div class="stakes">
          <div class="row miss">Miss: <b>{lo}</b> to <b>{hi}</b> life</div>
          <div class="row reward">{payLine}</div>
          {#if run.blocked() === 'tried'}<div class="row warn">You tried this one. Change a tile</div>{:else if s.life <= lo}<div class="row warn">Low life: one miss ends the run</div>{/if}
        </div>
      {/if}
      {#if short.current}
        <button class="packbtn" class:on={tray} onclick={() => (tray = !tray)} aria-label="Your pack" aria-expanded={tray}>
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"
            ><path d="M9.4 6.5V5.2c0-.9.7-1.6 1.6-1.6h2c.9 0 1.6.7 1.6 1.6v1.3" /><path
              d="M5.6 9.2c0-1.5 1.2-2.7 2.7-2.7h7.4c1.5 0 2.7 1.2 2.7 2.7l.9 9.4c.1 1-.7 1.9-1.7 1.9H6.4c-1 0-1.8-.9-1.7-1.9z"
            /><path d="M5.7 10.6c4.1 1.9 8.5 1.9 12.6 0" /><path d="M10.6 11.6h2.8v2.6h-2.8z" /></svg
          >
        </button>
      {/if}
      <button class="btn primary" disabled={!run.canSubmit()} onclick={() => run.submit()}>Identify</button>
    </div>
  {/if}
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
     the boss's rules red, a zone's rule cool. */
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
  .frame {
    position: relative;
    width: 100%;
    height: 100%;
  }
  .ibody :global(.lines) {
    flex: 1;
  }

  /* ---- The reveal ---- */
  .reveal .desk {
    gap: 8px;
  }
  .side {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  /* Phones: the tooltip takes what the window leaves over Where next and the dock; its lines fade where they run out. */
  .reveal .ibody {
    height: var(--rh, 200px);
    container-type: size;
    overflow: hidden;
  }
  .reveal .art {
    width: min(46cqw, 100cqh);
    height: min(46cqw, 100cqh);
    aspect-ratio: auto;
    border-bottom: 1px solid #2a1c10;
  }
  .reveal .ibody :global(.lines) {
    overflow: hidden;
    mask: linear-gradient(180deg, #000 calc(100% - 40px), transparent);
  }

  /* Where next: the places one step ahead, as rows; a tap goes there. */
  .wn {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .wn-head {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 30px;
  }
  .wn-head h2 {
    margin: 0;
    font-family: var(--font-body);
    font-weight: 400;
    font-size: 17px;
    line-height: 1.2;
    letter-spacing: 0;
    text-transform: none;
    color: #e6dccb;
  }
  .stp {
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 11px;
    letter-spacing: 0.1em;
    color: var(--muted);
  }
  :global(.wr) .stp .n {
    font-size: 1em;
    color: inherit;
  }
  .grow {
    flex: 1;
  }
  .wn-head .btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .wn-head .btn svg {
    width: 14px;
    height: 14px;
  }
  .place {
    position: relative;
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr) 16px;
    align-items: center;
    column-gap: 10px;
    min-height: 48px;
    padding: 4px 10px;
    text-align: left;
    font: inherit;
    color: inherit;
    background: linear-gradient(90deg, rgba(40, 31, 22, 0.95), rgba(20, 16, 12, 0.95));
    border: 1px solid var(--gold-lo);
    border-radius: 4px;
    box-shadow:
      inset 0 1px 0 rgba(255, 220, 150, 0.06),
      0 6px 14px rgba(0, 0, 0, 0.35);
    cursor: pointer;
  }
  .place:hover:not(:disabled) {
    border-color: var(--gold);
    box-shadow:
      inset 0 1px 0 rgba(255, 220, 150, 0.1),
      0 0 16px rgba(201, 164, 92, 0.25);
  }
  .place .k {
    justify-self: center;
    width: 24px;
    height: 24px;
    color: var(--gold);
  }
  .place .k svg {
    display: block;
    width: 100%;
    height: 100%;
  }
  .place .tx {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .place .nm {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 15px;
    line-height: 1.15;
    color: #f6e7c6;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .place .kd {
    margin-left: 6px;
    font-family: var(--font-body);
    font-weight: 500;
    font-size: 13.5px;
    color: var(--gold);
  }
  .place .ln {
    font-size: 13.5px;
    line-height: 1.2;
    color: var(--muted);
  }
  .place .chev {
    width: 16px;
    height: 16px;
    color: var(--gold-lo);
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
  .stakes .warn {
    color: #ff9c86;
    font-size: 13.5px;
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

  /* A short phone: the pack's own key, round, in the run's
     bronze, and its tray rising out of the dock over the tiles' last rows. */
  .dock.short {
    gap: 8px;
    padding-left: 14px;
    padding-right: 14px;
  }
  .dock.short .stakes .row {
    font-size: 13.5px;
  }
  .dock.short .stakes b {
    font-size: 13px;
  }
  .dock.short .btn.primary {
    min-width: 112px;
    padding: 0.95em 1em;
  }
  .packbtn {
    flex: none;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    padding: 0;
    border: 1px solid var(--line);
    background: radial-gradient(circle at 50% 35%, rgba(201, 164, 92, 0.16), rgba(12, 10, 8, 0.9) 70%);
    color: var(--gold);
    box-shadow:
      inset 0 1px 0 rgba(255, 220, 150, 0.08),
      0 0 0 3px #0a0806,
      0 0 0 4px rgba(125, 99, 51, 0.45);
    cursor: pointer;
  }
  .packbtn svg {
    width: 21px;
    height: 21px;
  }
  .packbtn:hover,
  .packbtn.on {
    color: var(--gold-hi);
    border-color: var(--gold-lo);
  }
  .packbtn.on {
    box-shadow:
      inset 0 0 10px rgba(241, 217, 155, 0.18),
      0 0 0 3px #0a0806,
      0 0 0 4px rgba(201, 164, 92, 0.7);
  }
  .tray {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 100%;
    padding: 8px 16px 10px;
    background-color: rgb(10, 8, 6);
    border-top: 1px solid rgba(125, 99, 51, 0.35);
    box-shadow: 0 -10px 24px rgba(0, 0, 0, 0.6);
  }
  .tray-head {
    display: flex;
    justify-content: center;
    margin-bottom: 2px;
  }
  .tray-head h2 {
    margin: 0;
    font-family: var(--font-body);
    font-weight: 400;
    font-size: 15px;
    letter-spacing: 0;
    text-transform: none;
    color: #e6dccb;
  }
  /* With the pack in the tray, the art takes the room it left. */
  @media (max-width: 699px) and (max-height: 740px) {
    .art {
      width: clamp(84px, calc(100dvh - 330px - var(--board, 0px)), min(42%, 220px));
    }
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

    /* The reveal: the tooltip whole (its art over its lines), beside the
       verdict and Where next. */
    .reveal .desk {
      grid-template-columns: minmax(0, 400px) minmax(0, 460px);
      column-gap: 40px;
      justify-content: center;
    }
    .reveal .ibody {
      flex-direction: column;
      height: auto;
      container-type: normal;
      overflow: visible;
    }
    .reveal .art {
      width: 230px;
      height: 230px;
      align-self: center;
      margin: 10px 0 2px;
      border: 1px solid #2a1c10;
    }
    .reveal .ibody :global(.lines) {
      mask: none;
    }
    .side {
      gap: 14px;
    }
    .side .dock {
      order: -1;
      min-height: 0;
      padding: 0;
      border-top: none;
    }
    .place {
      min-height: 64px;
      grid-template-columns: 36px minmax(0, 1fr) 18px;
    }
    .place .k {
      width: 28px;
      height: 28px;
    }
    .place .nm {
      font-size: 17px;
    }
    .place .ln {
      font-size: 15px;
    }
    .wn-head h2 {
      font-size: 19px;
    }
  }
  /* A wide desktop's reveal: the map in a third column (V4RevealDesk), the three wider than the page's column, centred on it. */
  @media (min-width: 1400px) {
    .item.withmap {
      width: 1320px;
      margin-inline: calc((100% - 1320px) / 2);
    }
    .withmap .desk {
      grid-template-columns: 400px 460px 380px;
    }
    .mapcol {
      align-self: stretch;
      min-height: 560px;
      display: flex;
      flex-direction: column;
    }
  }

  /* A short window (a laptop's): the dock stays pinned, so Identify is never below the fold. */
  @media (max-height: 820px) {
    .item:not(.reveal) .dock {
      position: sticky;
      background-color: rgb(10, 8, 6);
    }
  }
</style>
