<script lang="ts">
  // The Codex's Delve page: the set of 25 fossils (lib/fossils.ts), the 17
  // common ones first and the 8 rare ones after, with a line on what they
  // are (collectibles that don't change a run, one a day at most) and, once
  // today's is found, that another can turn up tomorrow. One found shows its
  // art; the rest stand as silhouettes.
  //
  // Choosing one shows it beside the grid (under it on a narrow screen) as
  // the game's tooltip would: its name in Fontin, whether it is one of the
  // rare ones, and when and how deep it was found. A mouse chooses by
  // resting on a cell, and the choice stays until it enters another (the
  // cells touch, their spacing inside them, so moving across the grid never
  // drops it); a touch chooses only by a tap, so a finger scrolling over the
  // grid chooses nothing. The tooltip's box is as tall as the tallest it can
  // show, every one of them laid in the same place with only the chosen one
  // seen, so nothing moves as the choice changes. Kept in this browser
  // (lib/fossilStore.ts), and on the devices it syncs with.
  import { FOSSILS, FOSSIL_COUNT, FOSSIL_DEAL, fossilArt, type Fossil, type FossilId } from '../../lib/fossils';
  import { FOSSILS_KEY, foundToday, loadFossils, type FossilStore } from '../../lib/fossilStore';
  import { onStoredElsewhere } from '../../lib/storage';
  import { shownDepth } from '../../lib/delve';
  import { backdropShadow } from '../../lib/backdropShadow';

  /** `store`: what to show instead of this browser's (the Codex's own, refreshed as it is erased; the QA desk's). */
  let { store = undefined }: { store?: FossilStore } = $props();

  let own = $state.raw(loadFossils());
  $effect(() => onStoredElsewhere({ [FOSSILS_KEY]: () => (own = loadFossils()) }));
  const kept = $derived(store ?? own);
  const found = $derived(kept.found);
  const count = $derived(FOSSILS.filter((f) => found[f.id]).length);
  /** Today's found, and another left to find tomorrow. */
  const today = $derived(foundToday(kept) && count < FOSSIL_COUNT);

  const date = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  /** The fossil chosen (the last a mouse rested on, or tapped); else the latest found. */
  let chosen = $state<FossilId | null>(null);
  const latest = $derived(FOSSILS.filter((f) => found[f.id]).sort((a, b) => found[b.id]!.at - found[a.id]!.at)[0] ?? null);
  const shown: Fossil | null = $derived(FOSSILS.find((f) => f.id === chosen) ?? latest);
  /** The depths players see where fossils start to turn up. */
  const rareFrom = shownDepth(FOSSIL_DEAL.rare.from);
  const commonFrom = shownDepth(FOSSIL_DEAL.common.from);
  const uid = $props.id();
  /** Where a press began: a click that ends far from it was a drag or a scroll, and chooses nothing. */
  let pressed: { x: number; y: number } | null = null;
  const TAP = 10;
  const tapped = (e: MouseEvent) => !pressed || Math.hypot(e.clientX - pressed.x, e.clientY - pressed.y) <= TAP;
</script>

<section class="panel fossils" use:backdropShadow={{ fill: 'linear' }} aria-labelledby="{uid}-h">
  <header><h2 id="{uid}-h">Fossils</h2><span class="col-label"><span class="n">{count}</span> of <span class="n">{FOSSIL_COUNT}</span></span></header>
  <p class="about">
    Collectibles for your codex, now and then on a Delve card; they don’t change a run. One a day at most.{#if today}
      <strong>Today’s is found; another can turn up tomorrow.</strong>{/if}
  </p>
  <div class="body">
    <ul class="grid" aria-label="The {FOSSIL_COUNT} fossils, {count} found">
      {#each FOSSILS as f (f.id)}
        {@const got = found[f.id]}
        <li>
          <button
            class="cell"
            class:got={!!got}
            class:rare={f.rare}
            class:on={shown?.id === f.id}
            aria-label={got ? f.name : f.rare ? 'A rare fossil, not found yet' : 'A fossil not found yet'}
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
            <span class="plate"><img src={fossilArt(f.id, 128)} alt="" loading="lazy" draggable="false" /></span>
          </button>
        </li>
      {/each}
    </ul>
    <!-- Every tooltip the grid can show, stacked in one place with only the chosen one seen: the box is as tall as
         the tallest of them, no taller, so nothing moves as the choice changes. -->
    <div class="tip" id="{uid}-tip" aria-live="polite">
      {#each FOSSILS as f (f.id)}
        {@const got = found[f.id]}
        <div class="face" class:shown={shown?.id === f.id} aria-hidden={shown?.id !== f.id}>
          {#if got}
            <p class="name" class:rare={f.rare}>{f.name}</p>
            {#if f.rare}<p class="mark">Rare</p>{/if}
            <p class="when">Found {date(got.at)} at depth <span class="n">{shownDepth(got.depth)}</span>{got.together ? ', in a run together' : ''}.</p>
          {:else}
            <p class="name unknown">Not found yet</p>
            {#if f.rare}<p class="mark">Rare</p>{/if}
            <p class="when">{f.rare ? `None above depth ${rareFrom}, and more often the deeper you go.` : `It can turn up from depth ${commonFrom}, and more often beside a find.`}</p>
          {/if}
        </div>
      {/each}
      {#if !count}
        <div class="face" class:shown={!shown} aria-hidden={!!shown}>
          <p class="name unknown">None found yet</p>
          <p class="when">Pick a fossil’s card and answer right, and it is yours.</p>
        </div>
      {/if}
    </div>
  </div>
</section>

<style>
  /* The panel as CodexDelve's (and the Collection's) are. */
  .panel {
    container: fossils / inline-size;
    padding: 1.2rem 1.3rem 1.3rem;
    min-width: 0;
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
  .about strong {
    font-weight: 600;
    color: #e2c48c;
  }

  /* Narrow: five across the panel's width, the tooltip under them.
     Wide: the cells fill the room beside the tooltip, as many across as fit. */
  .body {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0.9rem;
    align-items: start;
  }
  .grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
  @container fossils (min-width: 560px) {
    .body {
      grid-template-columns: minmax(0, 1fr) 14rem;
      gap: 1.4rem;
    }
    .grid {
      grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
    }
  }
  /* The cells touch: the spacing is inside each, so a pointer crossing the grid is always on one. */
  .cell {
    display: block;
    width: 100%;
    aspect-ratio: 1;
    padding: 3px;
    border: 0;
    background: none;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .plate {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    border: 1px solid var(--line);
    border-radius: 3px;
    background: radial-gradient(circle at 50% 45%, rgba(255, 220, 160, 0.06), transparent 70%), #0c0a08;
  }
  .cell.rare .plate {
    border-color: color-mix(in srgb, var(--gold) 45%, var(--line));
  }
  .cell:hover .plate {
    border-color: var(--gold);
  }
  /* The one shown: its own bright ring and a warmer plate, plainly apart from the rare ones' gold edges. */
  .cell.on .plate {
    border-color: var(--gold-hi);
    box-shadow:
      0 0 0 1px var(--gold-hi),
      0 0 8px rgba(252, 220, 150, 0.45);
    background: radial-gradient(circle at 50% 45%, rgba(255, 220, 160, 0.2), transparent 75%), #1a140c;
  }
  .cell:focus-visible {
    outline: 2px solid var(--gold-hi);
    outline-offset: -1px;
  }
  .cell img {
    width: 76%;
    height: 76%;
    object-fit: contain;
    pointer-events: none;
    -webkit-user-select: none;
    user-select: none;
  }
  /* Not found: its outline only, dark against the plate, as the Collection's silhouettes. */
  .cell:not(.got) img {
    filter: brightness(0) drop-shadow(0 0 1px rgba(216, 162, 106, 0.35));
    opacity: 0.55;
  }
  .cell.got img {
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.8));
  }

  /* The game's tooltip: the name in its currency colour (ItemDetails.svelte). */
  .tip {
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
  .tip p {
    margin: 0;
  }
  .name {
    font-size: 1.15rem;
    color: #aa9e82;
  }
  .name.rare {
    color: #e2c48c;
  }
  .name.unknown {
    color: var(--muted);
  }
  .mark {
    margin-top: 0.15rem;
    font-size: 0.78rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #c9a15e;
  }
  .when {
    margin-top: 0.5rem;
    font-family: var(--font-body);
    font-size: 0.92rem;
    font-style: italic;
    line-height: 1.35;
    color: var(--muted);
  }
</style>
