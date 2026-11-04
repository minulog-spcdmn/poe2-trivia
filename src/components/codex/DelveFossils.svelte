<script lang="ts" module>
  // The set of 25 fossils Delve turns up (lib/fossils.ts), as PoE's Delve
  // stash tab lays them out: a fixed slot for each, a recess cut into the
  // panel. The 17 common ones lie as tightly as 17 squares are known to go
  // into a square: John Bidwell's packing (lib/squarePacking.ts), seven of
  // them askew; the 8 rare ones stand in neat rows beside it (under it where
  // the width is too narrow). One kept sits in its slot lit from behind, the
  // lamp's amber light coming through it as through the resin; a rare one's
  // light is deeper, red-gold, the brightest. Now and then a band of
  // lamplight passes over the kept ones, a rare one's more often. One not
  // kept yet is a faint print of itself in its empty recess: knowing what's
  // missing is the hunt.
  import { passingLight } from '../../lib/glint';
  import { PACKED, PACKED_SIDE } from '../../lib/squarePacking';

  /** The lamplight passing over the kept ones (lib/glint.ts), all of a kind on the same beat: every `every` ms, `sweep` to cross. */
  const LAMP = passingLight(12000, 1500, { travel: true });
  const LAMP_RARE = passingLight(7000, 1400, { travel: true });
  const sweep = (slit: Element, rare: boolean) => (rare ? LAMP_RARE : LAMP).glintAt(slit, slit.closest('.slot') ?? slit);

  /** Where each common one lies in the packing, as CSS places it: its left and top, and its turn. */
  const PLACES = PACKED.map((p) => ({ left: `${((p.x - 0.5) / PACKED_SIDE) * 100}%`, top: `${((p.y - 0.5) / PACKED_SIDE) * 100}%`, rotate: `${p.turn}deg` }));
</script>

<script lang="ts">
  // Choosing one shows it in the detail box (beside the set on a wide
  // screen, under it on a narrower one) as the game's tooltip would: its
  // name in the currency colour, whether it is rare, and when and how deep
  // it was kept (one not kept yet, where it turns up). Where the width
  // allows, the box shows it big too, in a slot of its own. A mouse chooses
  // by resting on a slot, and the choice stays until it enters another (the
  // cells touch where the packing's squares lean on each other, and the rare
  // ones' touch, their spacing inside them, so moving across the set never
  // drops it); a touch chooses only by a tap, so a finger scrolling over the
  // set chooses nothing. The box is as tall as the tallest it can show,
  // every face laid in the same place with only the chosen one seen, so
  // nothing moves as the choice changes.
  //
  // Every size is fixed by the width alone (the packing's side, and all else
  // from it), so the Codex's scroll stays exact.
  //
  // `embedded`: in a dialog of its own (the end screen's), with no panel or
  // heading of the codex's; the dialog names it. Read-only either way.
  import { FOSSILS, FOSSIL_COUNT, FOSSIL_FROM, fossilArt, type Fossil, type FossilId } from '../../lib/fossils';
  import { FOSSILS_KEY, loadFossils, type FossilStore } from '../../lib/fossilStore';
  import { onStoredElsewhere } from '../../lib/storage';
  import { shownDepth } from '../../lib/delve';
  import { backdropShadow } from '../../lib/backdropShadow';
  import { motion } from '../../lib/motion.svelte';

  /** `store`: what to show instead of this browser's (the Codex's own, refreshed as it is erased; the QA desk's; the end screen's). */
  let { store = undefined, embedded = false }: { store?: FossilStore; embedded?: boolean } = $props();

  let own = $state.raw(loadFossils());
  $effect(() => onStoredElsewhere({ [FOSSILS_KEY]: () => (own = loadFossils()) }));
  const kept = $derived(store ?? own);
  const found = $derived(kept.found);
  const count = $derived(FOSSILS.filter((f) => found[f.id]).length);
  const complete = $derived(count === FOSSIL_COUNT);

  const GROUPS = [
    { key: 'common', name: 'Common', fossils: FOSSILS.filter((f) => !f.rare) },
    { key: 'rare', name: 'Rare', fossils: FOSSILS.filter((f) => f.rare) },
  ] as const;

  const date = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  /** The fossil chosen (the last a mouse rested on, or tapped); else the latest kept. */
  let chosen = $state<FossilId | null>(null);
  const latest = $derived(FOSSILS.filter((f) => found[f.id]).sort((a, b) => found[b.id]!.at - found[a.id]!.at)[0] ?? null);
  const shown: Fossil | null = $derived(FOSSILS.find((f) => f.id === chosen) ?? latest);
  /** The depths players see where fossils start to turn up. */
  const rareFrom = FOSSIL_FROM.rare;
  const commonFrom = FOSSIL_FROM.common;
  const uid = $props.id();
  /** Where a press began: a click that ends far from it was a drag or a scroll, and chooses nothing. */
  let pressed: { x: number; y: number } | null = null;
  const TAP = 10;
  const tapped = (e: MouseEvent) => !pressed || Math.hypot(e.clientX - pressed.x, e.clientY - pressed.y) <= TAP;
</script>

{#snippet slot(f: Fossil)}
  {@const got = found[f.id]}
  <span class="slot" class:got={!!got} class:rare={f.rare}>
    <img src={fossilArt(f.id, 128)} alt="" loading="lazy" draggable="false" />
    {#if got && !motion.still}
      <!-- The lamplight: a band of light passing over a brighter copy of it. -->
      <span class="lamp"><span class="slit" use:sweep={f.rare}><img src={fossilArt(f.id, 128)} alt="" loading="lazy" draggable="false" /></span></span>
    {/if}
  </span>
{/snippet}

{#snippet cell(f: Fossil)}
  {@const got = found[f.id]}
  <button
    class="cell"
    class:got={!!got}
    class:rare={f.rare}
    class:on={shown?.id === f.id}
    aria-label={got ? f.name : `${f.name}, not kept yet`}
    aria-pressed={shown?.id === f.id}
    aria-controls="{uid}-tip"
    onpointerdown={(e) => (pressed = { x: e.clientX, y: e.clientY })}
    onclick={(e) => {
      // A keyboard's click has no press, and counts.
      if (e.detail === 0 || tapped(e)) chosen = f.id;
      pressed = null;
    }}
    onpointerenter={(e) => {
      if (e.pointerType === 'mouse') chosen = f.id;
    }}
  >
    {@render slot(f)}
  </button>
{/snippet}

{#snippet set()}
  <p class="about">
    {#if complete}Every fossil kept.{:else}Now and then a Delve card holds a fossil: answer it right to keep one for your codex. Your run is unchanged.{/if}
  </p>
  <div class="body">
    <div class="sets">
      {#each GROUPS as g (g.key)}
        {@const n = g.fossils.filter((f) => found[f.id]).length}
        <div class="group {g.key}">
          <h3 class="head" id="{uid}-{g.key}"><span>{g.name}</span><span class="tally"><span class="n">{n}</span> of <span class="n">{g.fossils.length}</span></span></h3>
          <ul class="grid {g.key}" aria-labelledby="{uid}-{g.key}">
            {#each g.fossils as f, i (f.id)}
              {#if g.key === 'common'}
                <li style:left={PLACES[i].left} style:top={PLACES[i].top} style:rotate={PLACES[i].rotate}>{@render cell(f)}</li>
              {:else}
                <li>{@render cell(f)}</li>
              {/if}
            {/each}
          </ul>
        </div>
      {/each}
    </div>
    <!-- Every face the box can show, stacked in one place with only the chosen one seen: the box is as tall as
         the tallest of them, no taller, so nothing moves as the choice changes. -->
    <div class="tip" id="{uid}-tip" aria-live="polite">
      <!-- Where the width allows, the one chosen, big, in a slot of its own: every picture laid in it at once, only
           the chosen one seen, so a new choice only shows another. -->
      <div class="preview" aria-hidden="true">
        <span class="slot big" class:got={!!shown && !!found[shown.id]} class:rare={!!shown?.rare}>
          {#each FOSSILS as f (f.id)}
            <img class:shown={shown?.id === f.id} src={fossilArt(f.id)} alt="" loading="lazy" draggable="false" />
          {/each}
          {#if shown && found[shown.id] && !motion.still}
            {#key shown.rare}
              <span class="lamp"><span class="slit" use:sweep={shown.rare}><img src={fossilArt(shown.id)} alt="" draggable="false" /></span></span>
            {/key}
          {/if}
        </span>
      </div>
      <div class="faces">
        {#each FOSSILS as f (f.id)}
          {@const got = found[f.id]}
          <div class="face" class:shown={shown?.id === f.id} aria-hidden={shown?.id !== f.id}>
            {#if got}
              <p class="name">{f.name}</p>
              {#if f.rare}<p class="mark">Rare</p>{/if}
              <p class="when">Kept {date(got.at)} at depth <span class="n">{shownDepth(got.depth)}</span>{got.together ? ', in a run together' : ''}.</p>
            {:else}
              <p class="name unknown">{f.name}</p>
              {#if f.rare}<p class="mark">Rare</p>{/if}
              <p class="when">
                Not kept yet. {#if f.rare}From depth <span class="n">{rareFrom}</span>, more often the deeper you go.{:else}From depth <span class="n">{commonFrom}</span>, most often beside a find.{/if}
              </p>
            {/if}
          </div>
        {/each}
        {#if !count}
          <div class="face" class:shown={!shown} aria-hidden={!!shown}>
            <p class="name unknown">None kept yet</p>
            <p class="when">The first can turn up from depth <span class="n">{commonFrom}</span>.</p>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/snippet}

{#if embedded}
  <div class="fossils embedded" role="group" aria-label="Fossils, {count} of {FOSSIL_COUNT} kept">{@render set()}</div>
{:else}
  <section class="panel fossils" use:backdropShadow={{ fill: 'linear' }} aria-labelledby="{uid}-h">
    <header>
      <h2 id="{uid}-h">Fossils</h2>
      <span class="col-label">{#if complete}All <span class="n">{FOSSIL_COUNT}</span>{:else}<span class="n">{count}</span> of <span class="n">{FOSSIL_COUNT}</span>{/if}</span>
    </header>
    {@render set()}
  </section>
{/if}

<style>
  .fossils {
    /* (The amber is app.css's --fossil-*, the card's.) */
    container: fossils / inline-size;
    min-width: 0;
  }
  /* The panel as CodexDelve's (and the Collection's) are. */
  .panel {
    padding: 1.2rem 1.3rem 1.3rem;
  }
  .panel header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.8rem;
    margin-bottom: 0.6rem;
    padding-bottom: 0.6rem;
    border-bottom: 1px solid var(--line);
  }
  .panel h2 {
    font-size: 0.95rem;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: var(--gold-hi);
  }
  .col-label {
    font-family: var(--font-display);
    font-size: 0.72rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #d8a26a;
    white-space: nowrap;
  }
  .n {
    font-family: var(--font-cinzel);
    font-style: normal;
    font-variant-numeric: lining-nums;
    font-size: 0.88em;
  }
  .about {
    margin: 0 0 0.9rem;
    font-size: 0.95rem;
    font-style: italic;
    line-height: 1.4;
    color: var(--muted);
    text-wrap: pretty;
  }

  /*
   * The layout, by the width alone, from the packing's side (--P). Narrow:
   * the packing as wide as there is room (at most 320px), the rare ones
   * under it in two rows of four, as wide as it, the detail box under them.
   * From 520px, the rare ones beside it in two columns of four, as tall as
   * it. From 784px, the detail box beside them too, the one chosen shown
   * big in it.
   */
  .body {
    --P: min(100cqi, 320px);
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 1rem;
    align-items: start;
  }
  .sets {
    justify-self: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.8rem;
  }
  .group {
    width: var(--P);
  }
  .grid.rare {
    grid-template-columns: repeat(4, 1fr);
    aspect-ratio: 2;
  }
  .preview {
    display: none;
  }
  @container fossils (min-width: 520px) {
    .body {
      --P: min(320px, (100cqi - 1.75rem) / 1.5);
    }
    .sets {
      flex-direction: row;
      align-items: flex-start;
      gap: 1.75rem;
    }
    .group.rare {
      width: calc(var(--P) / 2);
    }
    .grid.rare {
      grid-template-columns: repeat(2, 1fr);
      aspect-ratio: 1 / 2;
    }
  }
  @container fossils (min-width: 784px) {
    .body {
      --P: min(330px, (100cqi - 4rem - 15rem) / 1.5);
      grid-template-columns: auto minmax(15rem, 19rem);
      justify-content: center;
      gap: 2.25rem;
      align-items: center;
    }
    .preview {
      display: block;
    }
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin: 0 0 0.3rem;
    padding: 0 0.2rem;
    font-family: var(--font-cinzel);
    font-size: 0.68rem;
    font-weight: 400;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #9a8f7c;
  }
  .rare .head > span:first-child {
    color: var(--fossil-rare-ink);
  }
  .tally {
    letter-spacing: 0.08em;
    color: var(--muted);
  }
  .tally .n {
    font-size: 1em;
    color: #c9bea8;
  }
  /*
   * The packing: a square PACKED_SIDE of its slots' cells across, each cell
   * laid where the packing puts it, turned as it is. The rare ones' cells
   * touch, each a quarter of the packing across, its slot as large as the
   * packing's.
   */
  .grid {
    --unit: calc(var(--P) / 4.67553);
    position: relative;
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .grid.common {
    aspect-ratio: 1;
  }
  .grid.common li {
    position: absolute;
    width: var(--unit);
    height: var(--unit);
  }
  .grid.rare {
    display: grid;
  }
  .grid.rare li {
    display: grid;
  }

  /* The spacing is inside each cell, so a pointer crossing the set is on one wherever they touch. */
  .cell {
    display: block;
    width: 100%;
    height: 100%;
    padding: calc(var(--unit) * 0.045);
    border: 0;
    background: none;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .rare .cell {
    padding: calc((var(--P) / 4 - var(--unit) * 0.91) / 2);
  }
  .cell:focus-visible {
    outline: 2px solid var(--fossil-core);
    outline-offset: -2px;
    border-radius: 18%;
  }

  /* The slot: a recess cut into the panel, its lip catching a little light along the bottom. */
  .slot {
    --hi: var(--fossil-core);
    --edge: var(--fossil-edge);
    --rim: rgba(255, 190, 120, 0.07);
    --spill: transparent;
    position: relative;
    display: block;
    width: 100%;
    height: 100%;
    border-radius: 18%;
    background: linear-gradient(165deg, #0a0806, #140f0a);
    box-shadow:
      inset 0 2px 5px rgba(0, 0, 0, 0.85),
      inset 0 0 0 1px var(--rim),
      0 1px 0 rgba(255, 225, 180, 0.05),
      0 0 12px var(--spill);
  }
  .slot.rare {
    --hi: var(--fossil-rare-core);
    --edge: var(--fossil-rare-edge);
    --rim: color-mix(in srgb, var(--fossil-rare-edge) 26%, transparent);
  }
  .slot img {
    position: absolute;
    left: 15%;
    top: 15%;
    width: 70%;
    height: 70%;
    object-fit: contain;
    pointer-events: none;
    -webkit-user-select: none;
    user-select: none;
  }
  /* Not kept yet: a faint print of it in the empty recess. */
  .slot:not(.got) > img {
    filter: grayscale(1) sepia(0.5) brightness(0.55);
    opacity: 0.2;
  }
  /* Kept: lit from behind, the light coming through it, its heart bright and its edge deep. */
  .slot.got {
    background:
      radial-gradient(
        circle,
        color-mix(in srgb, var(--hi) 55%, transparent) 0,
        color-mix(in srgb, var(--edge) 30%, transparent) 36%,
        color-mix(in srgb, var(--edge) 8%, transparent) 58%,
        transparent 72%
      ),
      linear-gradient(165deg, #0a0806, #140f0a);
  }
  .slot.got > img {
    filter: drop-shadow(0 0 3px color-mix(in srgb, var(--hi) 70%, transparent)) drop-shadow(0 0 7px color-mix(in srgb, var(--edge) 55%, transparent));
  }
  /* A rare one, the brightest: its light wider, spilling over the recess's lip. */
  .slot.got.rare {
    --rim: color-mix(in srgb, var(--fossil-rare-edge) 55%, transparent);
    --spill: color-mix(in srgb, var(--fossil-rare-edge) 35%, transparent);
  }
  .slot.got.rare > img {
    filter: drop-shadow(0 0 4px color-mix(in srgb, var(--hi) 85%, transparent)) drop-shadow(0 0 9px color-mix(in srgb, var(--edge) 70%, transparent));
  }
  /* The one shown: its rim lit in the amber's heart. */
  .cell.on .slot {
    --rim: color-mix(in srgb, var(--hi) 80%, transparent);
    --spill: color-mix(in srgb, var(--hi) 30%, transparent);
  }
  .cell.on .slot:not(.got) > img {
    opacity: 0.4;
  }

  /*
   * The lamplight (lib/glint.ts): a slanted slit masked to a narrow band,
   * holding a brighter copy of the fossil, the band sliding across it. Kept
   * to the recess.
   */
  .lamp {
    position: absolute;
    inset: 0;
    overflow: hidden;
    border-radius: inherit;
    pointer-events: none;
  }
  .slit {
    --band: 16%;
    position: absolute;
    inset: 0;
    -webkit-mask-image: linear-gradient(90deg, transparent calc(50% - var(--band) / 3), #000 50%, transparent calc(50% + var(--band) / 3));
    mask-image: linear-gradient(90deg, transparent calc(50% - var(--band) / 3), #000 50%, transparent calc(50% + var(--band) / 3));
    -webkit-mask-size: 300% 100%;
    mask-size: 300% 100%;
    -webkit-mask-repeat: no-repeat;
    mask-repeat: no-repeat;
    -webkit-mask-position: 100% 0;
    mask-position: 100% 0;
    transform: skewX(-20deg);
  }
  .slit img {
    transform: skewX(20deg);
    filter: brightness(1.9) saturate(1.15);
  }
  .rare .slit img {
    filter: brightness(2.1) saturate(1.3) hue-rotate(-8deg);
  }

  /* The detail box: the one chosen big (where it shows), and the game's tooltip under it. */
  .tip {
    display: grid;
    justify-items: center;
    gap: 1rem;
  }
  .preview {
    width: min(15rem, 100%);
    aspect-ratio: 1;
  }
  /*
   * The big one: the slot as the set's, its light grown with it. Its light
   * spreads wide enough to band, so it's dithered (app.css's --dither, over
   * the gradients, as a dark fill's is), and only the dither is drawn
   * pixelated. Its shadows stay the small slots' size: a box-shadow can't be
   * dithered, and grown with it they'd band.
   */
  .slot.big {
    border-radius: 12%;
    image-rendering: pixelated;
    background: var(--dither), linear-gradient(165deg, #0a0806, #140f0a);
  }
  .slot.big.got {
    background:
      var(--dither),
      radial-gradient(
        circle,
        color-mix(in srgb, var(--hi) 55%, transparent) 0,
        color-mix(in srgb, var(--edge) 30%, transparent) 36%,
        color-mix(in srgb, var(--edge) 8%, transparent) 58%,
        transparent 72%
      ),
      linear-gradient(165deg, #0a0806, #140f0a);
  }
  .slot.big img {
    left: 17%;
    top: 17%;
    width: 66%;
    height: 66%;
    image-rendering: auto;
  }
  .slot.big > img {
    visibility: hidden;
  }
  .slot.big > img.shown {
    visibility: visible;
  }
  .slot.big.got > img {
    filter: drop-shadow(0 0 6px color-mix(in srgb, var(--hi) 70%, transparent)) drop-shadow(0 0 16px color-mix(in srgb, var(--edge) 55%, transparent));
  }
  .slot.big.got.rare > img {
    filter: drop-shadow(0 0 7px color-mix(in srgb, var(--hi) 85%, transparent)) drop-shadow(0 0 20px color-mix(in srgb, var(--edge) 70%, transparent));
  }

  /* The game's tooltip: the name in the currency colour (ItemDetails.svelte), Fontin SmallCaps. */
  .faces {
    display: grid;
    text-align: center;
    font-family: var(--font-tooltip);
    font-variant-numeric: lining-nums;
  }
  .face {
    grid-area: 1 / 1;
    visibility: hidden;
  }
  .face.shown {
    visibility: visible;
  }
  .faces p {
    margin: 0;
  }
  .name {
    font-size: 1.2rem;
    color: #aa9e82;
  }
  .name.unknown {
    color: var(--muted);
  }
  .mark {
    margin-top: 0.15rem;
    font-size: 0.8rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--fossil-rare-ink);
  }
  .when {
    margin-top: 0.45rem;
    font-family: var(--font-body);
    font-size: 0.95rem;
    font-style: italic;
    line-height: 1.35;
    color: var(--muted);
    text-wrap: balance;
  }
</style>
