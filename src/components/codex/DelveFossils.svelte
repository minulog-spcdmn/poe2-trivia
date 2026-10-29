<script lang="ts">
  // The Codex's Delve page: the set of 25 fossils (lib/fossils.ts), five by
  // five, the 17 common ones first and the 8 rare ones after. One found shows
  // its art; the rest stand as silhouettes. Choosing one (a click, a tap, a
  // key, or the pointer resting on it) shows it under the grid as the game's
  // own tooltip would: its name and its crafting effect in Fontin, and when
  // and how deep it was found. Its box is as tall as the tallest it can
  // show, so nothing below jumps. Kept in this browser (lib/fossilStore.ts), and on
  // the devices it syncs with.
  import { FOSSILS, FOSSIL_COUNT, FOSSIL_DEAL, fossilArt, type Fossil, type FossilId } from '../../lib/fossils';
  import { FOSSILS_KEY, loadFossils, type FossilStore } from '../../lib/fossilStore';
  import { onStoredElsewhere } from '../../lib/storage';
  import { shownDepth } from '../../lib/delve';
  import { backdropShadow } from '../../lib/backdropShadow';

  /** `store`: what to show instead of this browser's (the QA desk). */
  let { store = undefined }: { store?: FossilStore } = $props();

  let own = $state.raw(loadFossils());
  $effect(() => onStoredElsewhere({ [FOSSILS_KEY]: () => (own = loadFossils()) }));
  const found = $derived((store ?? own).found);
  const count = $derived(FOSSILS.filter((f) => found[f.id]).length);

  const date = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  /** The fossil chosen, or the one the pointer rests on; else the latest found. */
  let chosen = $state<FossilId | null>(null);
  let hovered = $state<FossilId | null>(null);
  const latest = $derived(FOSSILS.filter((f) => found[f.id]).sort((a, b) => found[b.id]!.at - found[a.id]!.at)[0] ?? null);
  const shown: Fossil | null = $derived(FOSSILS.find((f) => f.id === (hovered ?? chosen)) ?? latest);
  /** The depth players see where rare fossils start to turn up. */
  const rareFrom = shownDepth(FOSSIL_DEAL.rare.from);
  const commonFrom = shownDepth(FOSSIL_DEAL.common.from);
  const uid = $props.id();
</script>

<section class="panel fossils" use:backdropShadow={{ fill: 'linear' }} aria-labelledby="{uid}-h">
  <header><h2 id="{uid}-h">Fossils</h2><span class="col-label"><span class="n">{count}</span> of <span class="n">{FOSSIL_COUNT}</span></span></header>
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
            aria-pressed={chosen === f.id}
            aria-controls="{uid}-tip"
            onclick={() => (chosen = chosen === f.id ? null : f.id)}
            onpointerenter={(e) => {
              if (e.pointerType === 'mouse') hovered = f.id;
            }}
            onpointerleave={() => (hovered = null)}
          >
            <img src={fossilArt(f.id, 128)} alt="" loading="lazy" draggable="false" />
          </button>
        </li>
      {/each}
    </ul>
    <!-- Every tooltip the grid can show, stacked in one place with only the chosen one seen: the box is as tall as
         the tallest of them, no taller, so nothing below moves as the choice changes. -->
    <div class="tip" id="{uid}-tip" aria-live="polite">
      {#each FOSSILS as f (f.id)}
        {@const got = found[f.id]}
        <div class="face" class:shown={shown?.id === f.id} aria-hidden={shown?.id !== f.id}>
          {#if got}
            <p class="name">{f.name}</p>
            {#each f.effect as line, i (i)}<p class="effect">{line}</p>{/each}
            <p class="when">Found {date(got.at)} at depth <span class="n">{shownDepth(got.depth)}</span>{got.together ? ' in a run together' : ''}.{f.rare ? ' One of the eight rare ones.' : ''}</p>
          {:else}
            <p class="name unknown">Not found yet</p>
            <p class="when">{f.rare ? `A rare one: none above depth ${rareFrom}, and more often the deeper you go.` : `A common one: it can turn up from depth ${commonFrom}, and more often beside a find.`}</p>
          {/if}
        </div>
      {/each}
      {#if !count}
        <div class="face" class:shown={!shown} aria-hidden={!!shown}>
          <p class="name unknown">None found yet</p>
          <p class="when">Now and then a card on a Delve offer holds a fossil. Pick it and answer right, and it is yours.</p>
        </div>
      {/if}
    </div>
  </div>
</section>

<style>
  /* The panel as CodexDelve's (and the Collection's) are. */
  .panel {
    padding: 1.2rem 1.3rem 1.3rem;
    min-width: 0;
  }
  .panel header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.8rem;
    margin-bottom: 0.9rem;
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

  /* The grid beside its tooltip on wide screens, over it on narrow ones. */
  .body {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 1.2rem;
    align-items: start;
  }
  @media (max-width: 640px) {
    .body {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .grid {
    list-style: none;
    margin: 0 auto;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(5, 52px);
    gap: 6px;
  }
  .cell {
    position: relative;
    display: grid;
    place-items: center;
    width: 52px;
    height: 52px;
    padding: 0;
    border: 1px solid var(--line);
    border-radius: 3px;
    background: radial-gradient(circle at 50% 45%, rgba(255, 220, 160, 0.06), transparent 70%), #0c0a08;
    cursor: pointer;
  }
  .cell.rare {
    border-color: color-mix(in srgb, var(--gold) 45%, var(--line));
  }
  .cell:hover {
    border-color: var(--gold);
  }
  /* The one shown below: its own bright ring and a warmer plate, plainly apart from the rare ones' gold edges. */
  .cell.on {
    border-color: var(--gold-hi);
    box-shadow:
      0 0 0 1px var(--gold-hi),
      0 0 8px rgba(252, 220, 150, 0.45);
    background: radial-gradient(circle at 50% 45%, rgba(255, 220, 160, 0.2), transparent 75%), #1a140c;
  }
  .cell:focus-visible {
    outline: 2px solid var(--gold-hi);
    outline-offset: 2px;
  }
  .cell img {
    width: 40px;
    height: 40px;
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

  /* The game's tooltip: the name in its currency colour, the effect in its blue (ItemDetails.svelte). */
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
    margin-bottom: 0.3rem;
    font-size: 1.15rem;
    color: #aa9e82;
  }
  .name.unknown {
    color: var(--muted);
  }
  .effect {
    font-size: 1rem;
    line-height: 1.3;
    text-wrap: pretty;
    color: #8888ff;
  }
  .when {
    margin-top: 0.6rem;
    font-family: var(--font-body);
    font-size: 0.92rem;
    font-style: italic;
    line-height: 1.35;
    color: var(--muted);
  }
</style>
