<script module lang="ts">
  /** Made once: toLocaleDateString makes a formatter of its own each time, some ms as an item opens. */
  let dateFormat: Intl.DateTimeFormat | undefined;
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { engine } from '../lib/session.svelte';
  import { livesCost, type Codex, type Tally } from '../lib/codex';
  import { accuracy } from '../lib/codexStats';
  import { shownDepth } from '../lib/delve';
  import { itemImage, itemThumb } from '../lib/ui';
  import { dialogBackdrop } from '../lib/behindDialog';
  import { dialogIn, dialogOut } from '../lib/dialogIn';
  import { artRevealed } from '../lib/fx/moments';
  import { allArt, type DrawnItem, type Item } from '../lib/game';
  import NamePlate, { SOCKET_X } from './NamePlate.svelte';
  import ArtImage from './ArtImage.svelte';
  import { circleOf } from './circles';
  import ItemDetails from './ItemDetails.svelte';
  import { readStored, writeStored } from '../lib/storage';
  import { motion } from '../lib/motion.svelte';

  /** The circle behind it (lib/circlePlaces.ts). */
  const ItemCircle = circleOf('item');

  // One item of the codex, as a tooltip like the one the game reveals it in.
  let { item, codex, onclose, onopen }: { item: Item; codex: Codex; onclose: () => void; onopen: (item: Item) => void } = $props();

  const entry = $derived(codex.items[item.id]);

  /** Every way the item is drawn (Grand Spectrum's three jewels), and the one shown: its own, until another is picked. */
  const arts = $derived(allArt(item));
  let picked = $state({ id: '', i: 0 });
  const drawn = $derived(arts[picked.id === item.id ? picked.i : 0] ?? arts[0]);
  /** A variant's name in its picker: its base where they differ, else its place among them. */
  const basesDiffer = $derived(new Set(arts.map((x) => x.base)).size === arts.length);
  const artName = (a: DrawnItem, i: number) => (basesDiffer ? a.base : `${i + 1} of ${arts.length}`);
  const byCount = (pairs: [string, number][]) =>
    pairs
      .flatMap(([id, n]) => {
        const it = engine.byId.get(id);
        return it ? [{ item: it, n }] : [];
      })
      .sort((a, b) => b.n - a.n || a.item.name.localeCompare(b.item.name));
  /** The names its art was taken for. */
  const tookItFor = $derived(byCount(Object.entries(entry?.mixed ?? {})));
  /** The items whose art was taken for its name. */
  const tookForIt = $derived(
    byCount(Object.entries(codex.items).flatMap(([id, e]) => (e.mixed[item.id] ? [[id, e.mixed[item.id]] as [string, number]] : []))),
  );

  /** Which face shows: the item's tooltip or your record of it, as you last left it. */
  type View = 'item' | 'record';
  const VIEW_KEY = 'codexItemView';
  let view = $state<View>(readStored(VIEW_KEY) === 'record' ? 'record' : 'item');
  function show(v: View) {
    view = v;
    writeStored(VIEW_KEY, v);
  }
  /**
   * Each face's height: the card grows or shrinks to the one shown. It's
   * placed as if the taller showed, the room the shorter leaves kept empty
   * under it, so only its foot moves and the tabs stay under the pointer.
   */
  let itemH = $state(0);
  let recordH = $state(0);
  const faceH = $derived(view === 'item' ? itemH : recordH);
  const spare = $derived(Math.max(itemH, recordH) - faceH);
  /** Sized at once as it opens; only what changes after that eases. */
  let eased = $state(false);
  $effect(() => {
    if (!faceH || eased) return;
    const raf = requestAnimationFrame(() => (eased = true));
    return () => cancelAnimationFrame(raf);
  });

  const date = (t: number) => (dateFormat ??= new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })).format(t);
  const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);
  const score = (t: Tally) => `${t.ok} of ${t.n} (${Math.round((accuracy(t) ?? 0) * 100)}%)`;

  let box = $state<HTMLElement>();
  let art = $state<HTMLElement>();
  onMount(() => {
    const before = document.activeElement as HTMLElement | null;
    box?.focus();
    return () => before?.focus?.();
  });
  // Each item that opens comes in with the flare the game reveals art with.
  $effect(() => {
    void item.id;
    const el = art;
    if (!el) return;
    const t = setTimeout(() => artRevealed(el), 200);
    return () => clearTimeout(t);
  });

  /** Escape closes; Tab keeps cycling through the dialog's own buttons. */
  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onclose();
      return;
    }
    if (e.key !== 'Tab' || !box) return;
    const items = [...box.querySelectorAll<HTMLElement>('button:not(:disabled)')];
    const first = items[0];
    const last = items.at(-1)!;
    const at = document.activeElement;
    if (e.shiftKey && (at === first || at === box)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && at === last) {
      e.preventDefault();
      first.focus();
    }
  }
</script>

{#snippet related(title: string, list: { item: Item; n: number }[])}
  {#if list.length}
    <div class="sep" aria-hidden="true"></div>
    <p class="label">{title}</p>
    <ul class="related">
      {#each list as r (r.item.id)}
        <li>
          <button class="pick" onclick={() => onopen(r.item)} disabled={!codex.items[r.item.id]} title={codex.items[r.item.id] ? `Open ${r.item.name}` : undefined}>
            <img src={itemThumb(r.item.id, 128)} alt="" loading="lazy" />
            <span>{r.item.name}</span>
            <b>{r.n}×</b>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
{/snippet}

<div class="backdrop" use:dialogBackdrop transition:fade={{ duration: 150 }} onclick={onclose} role="presentation">
  <div class="place" class:eased={eased && !motion.still} style:padding-bottom="{spare}px">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="tooltip"
      bind:this={box}
      in:dialogIn
      out:dialogOut
      onclick={(e) => e.stopPropagation()}
      {onkeydown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="codex-item-name"
      tabindex="-1"
    >
      <div class="head">
        <NamePlate end="empty" />
        {#key item.id}
          <div class="head-text" in:fade={{ duration: 250 }}>
            <span class="iname" id="codex-item-name">{item.name}</span>
            <span class="ibase">{drawn.base}</span>
          </div>
        {/key}
        <button class="close" style:--socket="{SOCKET_X}px" onclick={onclose} aria-label="Close" title="Close">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      </div>

      <div class="art" class:several={arts.length > 1} bind:this={art}>
        <ItemCircle />
        <div class="frame">
          {#key drawn.art}
            <ArtImage src={itemImage(drawn.art)} alt={item.name} w={drawn.w} h={drawn.h} float />
          {/key}
        </div>
        {#if arts.length > 1}
          <!-- Drawn more than one way: each of its art, to look at in turn. -->
          <div class="variants" role="group" aria-label="Its art">
            {#each arts as a, i (a.art)}
              <button class:on={a === drawn} aria-pressed={a === drawn} aria-label={artName(a, i)} title={artName(a, i)} onclick={() => (picked = { id: item.id, i })}>
                <img src={itemThumb(a.art, 128)} alt="" loading="lazy" />
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Two faces: the item as the game's tooltip shows it, and what you've done with it. -->
      <div class="seg" role="tablist" aria-label="Show">
        <button role="tab" id="codex-item-tab-item" aria-selected={view === 'item'} aria-controls="codex-item-face-item" class:on={view === 'item'} onclick={() => show('item')}>The item</button>
        <button role="tab" id="codex-item-tab-record" aria-selected={view === 'record'} aria-controls="codex-item-face-record" class:on={view === 'record'} onclick={() => show('record')}>Your record</button>
      </div>

      <!-- Both faces in one place, the card as tall as the one shown: switching grows or shrinks it. -->
      <div class="faces" style:height={faceH ? `${faceH}px` : undefined}>
        <div class="body face" class:on={view === 'item'} id="codex-item-face-item" role="tabpanel" aria-labelledby="codex-item-tab-item" inert={view !== 'item'} bind:offsetHeight={itemH}>
          {#key drawn.art}
            <ItemDetails item={drawn} />
          {/key}
        </div>
        <div class="body face" class:on={view === 'record'} id="codex-item-face-record" role="tabpanel" aria-labelledby="codex-item-tab-record" inert={view !== 'record'} bind:offsetHeight={recordH}>
          {@render record()}
        </div>
      </div>
    </div>
  </div>
</div>

{#snippet record()}
  {#if entry}
    <ul class="lines">
      <li>Seen <b>{times(entry.seen)}</b></li>
      <li>
        {#if entry.first === entry.last}Seen on <b>{date(entry.first)}</b>{:else}First seen <b>{date(entry.first)}</b>, last <b>{date(entry.last)}</b>{/if}
      </li>
      <li>Named from its art: {#if entry.name.n}<b>{score(entry.name)}</b>{:else}<i>never asked</i>{/if}</li>
      <li>Found from its name: {#if entry.art.n}<b>{score(entry.art)}</b>{:else}<i>never asked</i>{/if}</li>
      {#if entry.delve}
        {@const d = entry.delve}
        {@const lives = livesCost(d)}
        <li>
          In Delve: <b>{d.n}</b> answered, <b>{d.ok}</b> right{#if d.deepest}, as deep as depth <b>{shownDepth(d.deepest)}</b>{/if}
        </li>
        {#if d.n > d.ok}
          <li>
            {#if lives}Cost you a life <b>{times(lives)}</b>{#if d.lostAt}, deepest at depth <b>{shownDepth(d.lostAt)}</b>{/if}{:else}Never cost you a life{/if}{#if d.warded}; it broke <b>{d.warded === 1 ? 'an Azurite Ward' : `${d.warded} Azurite Wards`}</b>{/if}
          </li>
        {/if}
        {#if d.finds || d.blasted}
          <li>
            {#if d.finds}Asked from a find <b>{times(d.finds)}</b>{/if}{#if d.blasted}{d.finds ? '; dynamite' : 'Dynamite'} went off on it <b>{times(d.blasted)}</b>{/if}
          </li>
        {/if}
      {/if}
    </ul>
  {/if}
  {@render related('You took it for', tookItFor)}
  {@render related('You took these for it', tookForIt)}
{/snippet}

<style>
  /* The page behind scrolls the dialog on a short screen, so it never shows a scrollbar of its own. */
  .backdrop {
    position: fixed;
    inset: 0;
    /* Below the effects layer, like the leave dialog (App.svelte). */
    z-index: 94;
    display: grid;
    padding: 1rem;
    overflow-y: auto;
    scrollbar-width: none;
  }
  .backdrop::-webkit-scrollbar {
    display: none;
  }

  /* Where the card sits: centred as if its taller face showed (the spare room under it, empty, a click there closes it). */
  .place {
    margin: auto;
    width: min(440px, 100%);
  }
  /* PoE-style item tooltip, as in the game (QuestionView). */
  .tooltip {
    display: flex;
    flex-direction: column;
    border: 1px solid #5a3a1c;
    /*
     * Painted here, not by the backdrop: a dialog floats over the page, which
     * would show through. A faint grain (as on the page's backdrop) dithers the
     * art stage's glows, which would band this close to black.
     */
    background:
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.025'/%3E%3C/svg%3E"),
      #030201;
    /* A hard black edge, and no soft glow or shadow around it: over the
       dimmed page, where the backdrop can't draw for a dialog, CSS would band. */
    box-shadow: 0 0 0 1px #000;
    outline: none;
  }
  .head {
    position: relative;
    display: grid;
    min-height: 64px;
    place-items: center;
    /* Clear of the braces at the plate's ends. */
    padding: 0.5rem 3.6rem;
  }
  .head-text {
    position: relative;
    grid-area: 1 / 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    line-height: 1.15;
  }
  .iname {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 1.25rem;
    color: var(--unique-hi);
    text-shadow: 0 0 12px rgba(224, 138, 68, 0.4);
  }
  .ibase {
    font-family: var(--font-display);
    font-size: 0.88rem;
    color: #d8a26a;
    opacity: 0.85;
  }
  /* Centred in the empty end of the name plate. */
  .close {
    position: absolute;
    top: 50%;
    right: var(--socket);
    translate: 50% -50%;
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    padding: 0;
    background: none;
    border: 0;
    border-radius: 50%;
    cursor: pointer;
    color: var(--unique-hi);
    transition: color 0.2s;
  }
  .close:hover {
    color: var(--gold-hi);
  }
  .close svg {
    width: 10px;
    height: 10px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.6;
    stroke-linecap: round;
  }

  .art {
    position: relative;
    height: 240px;
    display: grid;
    place-items: center;
    container-type: size;
    /*
     * Only light on the tooltip's own colour, no darker base of its own: each
     * glow dies out before the bottom edge, so the stage runs on into the text
     * below without a seam.
     */
    background:
      radial-gradient(ellipse 55% 50% at 50% 50%, rgba(175, 96, 37, 0.14), transparent),
      radial-gradient(ellipse 80% 60% at 50% 0%, rgba(90, 110, 160, 0.1), transparent);
    box-shadow: inset 0 1px 0 rgba(201, 164, 92, 0.12);
    overflow: hidden;
  }
  .frame {
    position: absolute;
    inset: 0;
    margin: auto;
    width: 80%;
    height: 84%;
    display: grid;
    place-items: center;
  }
  /* An item drawn more than one way: its art in small, along the stage's foot, the picture above them. */
  .several .frame {
    bottom: 2.6rem;
    height: 76%;
  }
  .variants {
    position: absolute;
    bottom: 0.35rem;
    left: 0;
    right: 0;
    display: flex;
    justify-content: center;
    gap: 0.4rem;
  }
  .variants > button {
    width: 34px;
    height: 34px;
    padding: 3px;
    display: grid;
    place-items: center;
    background: rgba(12, 9, 7, 0.55);
    border: 1px solid rgba(175, 96, 37, 0.35);
    border-radius: 3px;
    cursor: pointer;
    opacity: 0.6;
    transition:
      opacity 0.2s,
      border-color 0.2s,
      box-shadow 0.2s;
  }
  .variants > button:hover {
    opacity: 0.9;
  }
  .variants > button.on {
    opacity: 1;
    border-color: var(--gold-hi);
    box-shadow: 0 0 8px rgba(224, 168, 92, 0.45);
  }
  .variants img {
    max-width: 100%;
    max-height: 100%;
  }
  .frame > :global(.art-slot) {
    position: absolute;
    inset: 0;
  }

  /* The faces over each other, the box as tall as the one shown; it grows or shrinks to the other as they cross-fade. */
  .faces {
    position: relative;
    overflow: hidden;
  }
  .face {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    visibility: hidden;
    opacity: 0;
    transition:
      opacity 0.2s,
      visibility 0s 0.2s;
  }
  .face.on {
    visibility: visible;
    opacity: 1;
    transition: opacity 0.2s;
  }
  .eased,
  .eased .faces {
    transition: 0.3s var(--ease-out, ease-out);
    transition-property: padding-bottom, height;
  }
  /*
   * The switch between the item and your record of it: two engraved labels
   * (as the card's own headings, "You took it for") standing on a rule like
   * the tooltip's, the one shown lit, and the rule lit under it.
   */
  .seg {
    position: relative;
    display: flex;
    justify-content: center;
    gap: 2.2rem;
    width: 84%;
    margin: 0.5rem auto 0;
  }
  .seg::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(175, 96, 37, 0.55) 22%, rgba(175, 96, 37, 0.55) 78%, transparent);
  }
  .seg > button {
    position: relative;
    padding: 0.55rem 0.15rem 0.5rem;
    font-family: var(--font-display);
    font-size: 0.72rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #8a7560;
    background: none;
    border: 0;
    cursor: pointer;
    transition:
      color 0.25s,
      text-shadow 0.25s;
  }
  .seg > button::after {
    content: '';
    position: absolute;
    z-index: 1;
    left: -0.4rem;
    right: -0.4rem;
    bottom: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--gold-hi), transparent);
    box-shadow: 0 0 8px rgba(224, 168, 92, 0.6);
    opacity: 0;
    scale: 0.4 1;
    transition:
      opacity 0.25s,
      scale 0.3s var(--ease-out, ease-out);
  }
  .seg > button:hover,
  .seg > button:focus-visible {
    color: #d8a26a;
  }
  .seg > button:focus-visible {
    outline: none;
  }
  .seg > button.on {
    color: #f1d9a8;
    text-shadow: 0 0 10px rgba(255, 210, 140, 0.35);
  }
  .seg > button.on::after,
  .seg > button:focus-visible::after {
    opacity: 1;
    scale: 1 1;
  }
  .body {
    padding: 0.9rem 1.2rem 1.1rem;
    text-align: center;
  }
  /* The tooltip's separator: a hairline with a gem in the middle. */
  .sep {
    position: relative;
    height: 1px;
    margin: 0.8rem auto;
    width: 80%;
    background: linear-gradient(90deg, transparent, #6b4520 25%, #6b4520 75%, transparent);
  }
  .sep::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    width: 5px;
    height: 5px;
    translate: -50% -50%;
    rotate: 45deg;
    background: var(--unique);
    box-shadow: 0 0 6px rgba(224, 138, 68, 0.6);
  }
  /* Tooltip lines: cool against the warm name, like the game's extra lines. */
  .lines {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    color: #8f9aa6;
    font-size: 1rem;
    line-height: 1.3;
  }
  .lines b {
    font-weight: 500;
    color: #a9c3dc;
  }
  .lines i {
    color: #6d7782;
  }
  .label {
    margin: 0 0 0.45rem;
    font-family: var(--font-display);
    font-size: 0.72rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #d8a26a;
  }
  .related {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.4rem;
  }
  .pick {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.2rem 0.65rem 0.2rem 0.25rem;
    border: 1px solid rgba(107, 69, 32, 0.6);
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.4);
    color: var(--text);
    font-size: 0.95rem;
    cursor: pointer;
    transition:
      border-color 0.2s,
      color 0.2s,
      box-shadow 0.25s;
  }
  .pick:hover:not(:disabled) {
    border-color: var(--gold-lo);
    color: var(--gold-hi);
    box-shadow: 0 0 12px rgba(201, 164, 92, 0.25);
  }
  .pick:disabled {
    cursor: default;
  }
  .pick img {
    width: 26px;
    height: 26px;
    object-fit: contain;
  }
  .pick b {
    font-family: var(--font-cinzel);
    font-size: 0.8rem;
    color: var(--gold);
  }

  @media (max-width: 480px) {
    .art {
      height: 200px;
    }
    .body {
      padding: 0.8rem 0.9rem 1rem;
    }
  }
</style>
