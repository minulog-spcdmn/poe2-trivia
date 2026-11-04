<script lang="ts" module>
  // The set of 25 fossils Delve turns up (lib/fossils.ts), as PoE's Delve
  // stash tab lays them out: a fixed slot for each, a square recess cut into
  // the panel. The 17 common ones lie as tightly as 17 squares are known to
  // go into a square: John Bidwell's packing (lib/squarePacking.ts), seven
  // of them askew. The 8 rare ones stand together beside it in two columns
  // of four (under it in two rows where the width is too narrow), each
  // rimmed in red-gold. One kept sits in its slot in its own colours, a
  // little lamplight behind it; one not kept yet is only its shape, dark in
  // its recess, as the Collection shows an item not seen yet, and nothing to
  // choose. Now and then a band of lamplight passes over the kept ones, a
  // rare one's more often.
  import { passingLight } from '../../lib/glint';
  import { PACKED, PACKED_SIDE } from '../../lib/squarePacking';

  /** The lamplight passing over the kept ones (lib/glint.ts), all of a kind on the same beat: every `every` ms, `sweep` to cross. */
  const LAMP = passingLight(12000, 1500, { travel: true });
  const LAMP_RARE = passingLight(7000, 1400, { travel: true });
  const sweep = (slit: Element, rare: boolean) => (rare ? LAMP_RARE : LAMP).glintAt(slit, slit.closest('.slot') ?? slit);

  /**
   * Where each common one lies in the packing, as CSS places it: its left
   * and top, and its turn; and which way is down inside it (`sx`, `sy`), so
   * an askew slot's recess is shadowed from above as an upright one's is,
   * not turned with it.
   */
  const PLACES = PACKED.map((p) => {
    const t = (p.turn * Math.PI) / 180;
    return {
      left: `${((p.x - 0.5) / PACKED_SIDE) * 100}%`,
      top: `${((p.y - 0.5) / PACKED_SIDE) * 100}%`,
      turn: `${p.turn}deg`,
      sx: Math.sin(t).toFixed(4),
      sy: Math.cos(t).toFixed(4),
    };
  });

  /** The tooltip's gap from the fossil it names, and from the edge of what it may lie over (px); how long it waits for the pointer to come back to the set. */
  const TIP_GAP = 12;
  const TIP_EDGE = 8;
  const TIP_LINGER_MS = 140;
</script>

<script lang="ts">
  // A kept fossil's tooltip shows beside it, pointing at it, as the game's
  // stash shows an item's: its name in the currency colour, whether it is
  // rare, and when and how deep it was kept. A mouse brings it up by
  // resting on a slot, and it stays until the mouse rests on another or
  // leaves the set (so crossing the gaps between slots never drops it); a
  // touch brings it up by a tap and puts it away by another (on it, or
  // anywhere off the set), so a finger scrolling over the set brings up
  // nothing; a keyboard by moving onto a slot. It lies over the page, never
  // in its flow, so nothing moves.
  //
  // Every size is fixed by the width alone (the packing's side, and all else
  // from it), so the Codex's scroll stays exact.
  //
  // `embedded`: in a dialog of its own (the end screen's), with no panel or
  // heading of the codex's; the dialog names it. Read-only either way.
  import { FOSSILS, FOSSIL_COUNT, fossilArt, type Fossil, type FossilId } from '../../lib/fossils';
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
  const uid = $props.id();

  /** The fossil whose tooltip shows (or last showed: it keeps its words as it fades). */
  let chosen = $state<Fossil | null>(null);
  let open = $state(false);
  let linger: ReturnType<typeof setTimeout> | undefined;
  const show = (f: Fossil) => {
    clearTimeout(linger);
    chosen = f;
    open = true;
  };
  const toggle = (f: Fossil) => (open && chosen?.id === f.id ? (open = false) : show(f));

  /** Where a press began, and by what: a click that ends far from it was a drag or a scroll, and chooses nothing. */
  let pressed: { x: number; y: number } | null = null;
  let pointer = 'mouse';
  const TAP = 10;
  const tapped = (e: MouseEvent) => !pressed || Math.hypot(e.clientX - pressed.x, e.clientY - pressed.y) <= TAP;

  // ---- the tooltip's place ------------------------------------------------------

  let root = $state<HTMLElement>();
  let wrap = $state<HTMLElement>();
  let tip = $state<HTMLElement>();
  const cells = new Map<FossilId, HTMLElement>();
  function cellOf(node: HTMLElement, id: FossilId) {
    cells.set(id, node);
    return { destroy: () => cells.delete(id) };
  }
  /** Where the tooltip lies (in the set's px), which side of its slot, and where along its edge its point is. */
  let at = $state({ x: 0, y: 0 });
  let side = $state<'left' | 'right' | 'above' | 'below'>('right');
  let point = $state(0);
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));
  /**
   * Beside the slot, on the side away from the set's middle where there's
   * room (in the codex, over the panel beside the set's too; in a dialog,
   * inside the set), so it covers as few of the others as it can, else on
   * the other side, its point on the slot's middle, just under its name;
   * where neither side has room (a phone), under or above the slot, toward
   * the set's middle, so it stays over the set and never over the words
   * above it.
   */
  function place() {
    const cell = chosen && cells.get(chosen.id);
    if (!cell || !wrap || !tip || !root) return;
    const w = wrap.getBoundingClientRect();
    // (In the set's own px: a zoomed page scales what the window measures.)
    const z = w.width / wrap.offsetWidth || 1;
    const c = cell.getBoundingClientRect();
    const b = root.getBoundingClientRect();
    const across = (embedded ? root : (root.parentElement ?? root)).getBoundingClientRect();
    const x0 = (c.left - w.left) / z;
    const x1 = (c.right - w.left) / z;
    const y0 = (c.top - w.top) / z;
    const y1 = (c.bottom - w.top) / z;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const minX = (across.left - w.left) / z + TIP_EDGE;
    const maxX = (across.right - w.left) / z - TIP_EDGE;
    const minY = Math.max((b.top - w.top) / z + TIP_EDGE, 0);
    const maxY = (b.bottom - w.top) / z - TIP_EDGE;
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    const head = tip.querySelector<HTMLElement>('.thead')?.offsetHeight ?? 0;
    const right = x1 + TIP_GAP + tw <= maxX ? x1 + TIP_GAP : null;
    const left = x0 - TIP_GAP - tw >= minX ? x0 - TIP_GAP - tw : null;
    const x = cx < wrap.offsetWidth / 2 ? (left ?? right) : (right ?? left);
    if (x !== null) {
      const y = clamp(cy - head - 16, minY, maxY - th);
      at = { x, y };
      side = x === right ? 'right' : 'left';
      point = clamp(cy - y, head + 10, th - 12);
      return;
    }
    const xs = clamp(cx - tw / 2, Math.max(minX, TIP_EDGE - (w.left - b.left) / z), maxX - tw);
    const above = y0 - TIP_GAP - th >= minY ? y0 - TIP_GAP - th : null;
    const below = y1 + TIP_GAP + th <= maxY ? y1 + TIP_GAP : null;
    const y = (cy < wrap.offsetHeight / 2 ? (below ?? above) : (above ?? below)) ?? y1 + TIP_GAP;
    at = { x: xs, y };
    side = y === above ? 'above' : 'below';
    point = clamp(cx - xs, 14, tw - 14);
  }
  $effect(() => {
    void found;
    if (open && chosen) place();
  });
  // While it shows: kept beside its slot as the set's width changes, and put away by a press anywhere off the set, or Escape.
  $effect(() => {
    if (!open || !root) return;
    const sized = new ResizeObserver(() => place());
    sized.observe(root);
    const off = (e: PointerEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest('.cell') || !root!.contains(e.target)) open = false;
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') open = false;
    };
    document.addEventListener('pointerdown', off, true);
    document.addEventListener('keydown', key);
    return () => {
      sized.disconnect();
      document.removeEventListener('pointerdown', off, true);
      document.removeEventListener('keydown', key);
    };
  });
  $effect(() => () => clearTimeout(linger));
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
  {#if found[f.id]}
    {@render keptCell(f)}
  {:else}
    <!-- Not kept yet: only its shape, as the Collection shows an item not seen yet; nothing to choose. -->
    <span class="cell" role="img" aria-label={f.rare ? 'A rare fossil not kept yet' : 'A fossil not kept yet'}>{@render slot(f)}</span>
  {/if}
{/snippet}

{#snippet keptCell(f: Fossil)}
  {@const on = open && chosen?.id === f.id}
  <button
    class="cell got"
    class:rare={f.rare}
    class:on
    aria-label={f.name}
    aria-describedby={on ? `${uid}-tip` : undefined}
    use:cellOf={f.id}
    onpointerdown={(e) => {
      pressed = { x: e.clientX, y: e.clientY };
      pointer = e.pointerType;
    }}
    onclick={(e) => {
      // A keyboard's click (and the QA desk's) has no press, and counts; a mouse's tooltip is up already.
      if (e.detail === 0) toggle(f);
      else if (pointer !== 'mouse' && tapped(e)) toggle(f);
      pressed = null;
    }}
    onpointerenter={(e) => {
      if (e.pointerType === 'mouse') show(f);
    }}
    onfocus={(e) => {
      if (e.currentTarget.matches(':focus-visible')) show(f);
    }}
  >
    {@render slot(f)}
  </button>
{/snippet}

{#snippet set()}
  <p class="about">
    {#if complete}Every fossil kept.{:else}Now and then a Delve card holds a fossil: answer it right to keep one for your codex. Your run is unchanged.{/if}
  </p>
  <div class="wrap" class:still={motion.still} bind:this={wrap}>
    <div
      class="sets"
      role="presentation"
      onpointerenter={() => clearTimeout(linger)}
      onpointerleave={(e) => {
        if (e.pointerType === 'mouse') linger = setTimeout(() => (open = false), TIP_LINGER_MS);
      }}
      onfocusout={(e) => {
        if (!(e.relatedTarget instanceof Node) || !e.currentTarget.contains(e.relatedTarget)) open = false;
      }}
    >
      {#each GROUPS as g (g.key)}
        {@const n = g.fossils.filter((f) => found[f.id]).length}
        <div class="group {g.key}">
          <h3 class="head" id="{uid}-{g.key}"><span>{g.name}</span><span class="tally"><span class="n">{n}</span> of <span class="n">{g.fossils.length}</span></span></h3>
          <ul class="grid {g.key}" aria-labelledby="{uid}-{g.key}">
            {#each g.fossils as f, i (f.id)}
              {#if g.key === 'common'}
                {@const p = PLACES[i]}
                <li style:left={p.left} style:top={p.top} style:rotate={p.turn} style:--turn={p.turn} style:--sx={p.sx} style:--sy={p.sy}>{@render cell(f)}</li>
              {:else}
                <li>{@render cell(f)}</li>
              {/if}
            {/each}
          </ul>
        </div>
      {/each}
    </div>
    <!-- The game's tooltip (ItemDetails.svelte's lines), over the page, pointing at the slot it names. -->
    <div
      class="tip"
      class:open
      class:rare={!!chosen?.rare}
      data-side={side}
      id="{uid}-tip"
      role="tooltip"
      bind:this={tip}
      style:left="{at.x}px"
      style:top="{at.y}px"
      style:--point="{point}px"
    >
      {#if chosen && found[chosen.id]}
        {@const got = found[chosen.id]!}
        <div class="thead">
          <p class="tname">{chosen.name}</p>
          {#if chosen.rare}<p class="mark">Rare</p>{/if}
        </div>
        <div class="tbody">
          <p class="line">Kept: <span class="white">{date(got.at)}</span></p>
          <p class="line">Depth: <span class="white">{shownDepth(got.depth)}</span></p>
          {#if got.together}<p class="line">In a run together</p>{/if}
        </div>
      {/if}
    </div>
  </div>
{/snippet}

{#if embedded}
  <div class="fossils embedded" role="group" aria-label="Fossils, {count} of {FOSSIL_COUNT} kept" bind:this={root}>{@render set()}</div>
{:else}
  <section class="panel fossils" use:backdropShadow={{ fill: 'linear' }} aria-labelledby="{uid}-h" bind:this={root}>
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
    position: relative;
    z-index: 0;
    min-width: 0;
    transition: z-index 0s 0.12s;
  }
  /* Over the panels beside and below it while a tooltip shows (and as it fades), so the tooltip lies over them too. */
  .fossils:has(.tip.open) {
    z-index: 1;
    transition-delay: 0s;
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
   * the packing as wide as there is room (at most 360px), the rare ones
   * under it in two rows of four, as wide as it. From 480px, the rare ones
   * beside it in two columns of four, as tall as it.
   */
  .wrap {
    --P: min(100cqi, 360px);
    --G: 1.25rem;
    position: relative;
    display: flex;
    justify-content: center;
  }
  .sets {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }
  .group {
    width: var(--P);
  }
  .grid.rare {
    grid-template-columns: repeat(4, 1fr);
    grid-auto-rows: calc(var(--P) / 4);
  }
  @container fossils (min-width: 480px) {
    .wrap {
      --P: min(330px, (100cqi - var(--G)) / 1.5);
    }
    .sets {
      flex-direction: row;
      gap: var(--G);
    }
    .group.rare {
      width: calc(var(--P) / 2);
    }
    .grid.rare {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin: 0 0 0.45rem;
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
   * laid where the packing puts it, turned as it is. A rare one's cell is a
   * quarter of the packing across, its slot a little larger than a common
   * one's.
   */
  .grid {
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
    width: calc(var(--P) / 4.67553);
    height: calc(var(--P) / 4.67553);
  }
  .grid.rare {
    display: grid;
  }
  .grid.rare li {
    display: grid;
  }

  /* The spacing is inside each cell (a share of its own width), so a pointer crossing the set is on one wherever they touch. */
  .cell {
    display: block;
    width: 100%;
    height: 100%;
    padding: 4.5%;
    border: 0;
    background: none;
    -webkit-tap-highlight-color: transparent;
  }
  .cell.got {
    cursor: pointer;
  }
  .cell:focus-visible {
    outline: 2px solid var(--fossil-core);
    outline-offset: -2px;
  }

  /*
   * The slot: a square recess cut into the panel, as the game's stash cells
   * are, its floor dark, a hard shadow under its upper lip and a thin line
   * of light along its lower one; shadowed from above on the screen however
   * it is turned (--sx, --sy: which way is down inside it).
   */
  .slot {
    --rim: rgba(255, 214, 160, 0.07);
    position: relative;
    display: block;
    width: 100%;
    height: 100%;
    border-radius: 2px;
    background: #130f0b;
    box-shadow:
      inset calc(var(--sx, 0) * 2px) calc(var(--sy, 1) * 2px) 3px rgba(0, 0, 0, 0.85),
      inset 0 0 0 1px var(--rim),
      calc(var(--sx, 0) * 1px) calc(var(--sy, 1) * 1px) 0 rgba(255, 225, 180, 0.06);
  }
  /* A rare one's recess rimmed in red-gold. */
  .slot.rare {
    --rim: color-mix(in srgb, var(--fossil-rare-edge) 32%, transparent);
  }
  .slot img {
    position: absolute;
    left: 14%;
    top: 14%;
    width: 72%;
    height: 72%;
    object-fit: contain;
    pointer-events: none;
    -webkit-user-select: none;
    user-select: none;
    transition:
      scale 0.16s var(--ease-out),
      filter 0.16s var(--ease-out),
      opacity 0.16s;
  }
  .still .slot img {
    transition: none;
  }
  /* Not kept yet: only its shape, dark in the recess, as the Collection shows an item not seen yet. */
  .slot:not(.got) > img {
    filter: brightness(0);
    opacity: 0.7;
  }
  /* Kept: in its own colours, the lamp's light faint behind it. */
  .slot.got {
    background: radial-gradient(circle, rgba(236, 106, 16, 0.16), rgba(236, 106, 16, 0.05) 45%, transparent 66%), #130f0b;
  }
  .slot.got > img {
    filter: drop-shadow(0 1px 1.5px rgba(0, 0, 0, 0.9));
  }
  .slot.got.rare {
    --rim: color-mix(in srgb, var(--fossil-rare-edge) 70%, transparent);
    background: radial-gradient(circle, rgba(200, 48, 12, 0.2), rgba(200, 48, 12, 0.06) 45%, transparent 66%), #130f0b;
  }
  /* The one whose tooltip shows: its rim lit, the fossil a little brighter and nearer. */
  .cell.on .slot {
    --rim: rgba(241, 217, 155, 0.6);
  }
  .cell.on .slot.got > img {
    scale: 1.05;
    filter: drop-shadow(0 1px 1.5px rgba(0, 0, 0, 0.9)) brightness(1.12);
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
    filter: brightness(1.6) saturate(1.1);
  }
  .rare .slit img {
    filter: brightness(1.75) saturate(1.2) hue-rotate(-8deg);
  }
  .cell.on .slit img {
    scale: 1.05;
  }

  /*
   * The tooltip: the game's, as ItemDetails.svelte sets an item's (centred,
   * Fontin's small capitals, grey labels and white values), its name in the
   * currency colour on a header band, as the game shows a fossil's; framed
   * in a double line, its point on the slot it names. Opaque, so nothing
   * under it shows through. It fades in where it first shows, and moves
   * from slot to slot outright.
   */
  .tip {
    --tt-grey: #8c8c8c;
    --tt-white: #f2efe8;
    --tt-currency: #aa9e82;
    --tt-ground: #090705;
    --tt-frame: color-mix(in srgb, var(--tt-currency) 50%, var(--tt-ground));
    --tt-band: color-mix(in srgb, var(--tt-frame) 26%, var(--tt-ground));
    position: absolute;
    z-index: 3;
    width: 15rem;
    text-align: center;
    font-family: var(--font-tooltip);
    font-variant-numeric: lining-nums;
    background: var(--tt-ground);
    border: 1px solid var(--tt-frame);
    box-shadow:
      inset 0 0 0 2px var(--tt-ground),
      inset 0 0 0 3px color-mix(in srgb, var(--tt-frame) 40%, var(--tt-ground)),
      0 3px 10px rgba(0, 0, 0, 0.6);
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition:
      opacity 0.12s,
      visibility 0s 0.12s;
  }
  .tip.open {
    opacity: 1;
    visibility: visible;
    transition: opacity 0.12s;
  }
  /* Its point: a corner of a turned square, the frame's line along its two outer sides. */
  .tip::before {
    content: '';
    position: absolute;
    width: 11px;
    height: 11px;
    background: var(--tt-ground);
    border: 0 solid var(--tt-frame);
    rotate: 45deg;
  }
  .tip[data-side='right']::before {
    left: -6.5px;
    top: calc(var(--point) - 5.5px);
    border-left-width: 1px;
    border-bottom-width: 1px;
  }
  .tip[data-side='left']::before {
    right: -6.5px;
    top: calc(var(--point) - 5.5px);
    border-top-width: 1px;
    border-right-width: 1px;
  }
  .tip[data-side='above']::before {
    bottom: -6.5px;
    left: calc(var(--point) - 5.5px);
    border-right-width: 1px;
    border-bottom-width: 1px;
  }
  .tip[data-side='below']::before {
    top: -6.5px;
    left: calc(var(--point) - 5.5px);
    border-left-width: 1px;
    border-top-width: 1px;
    background: var(--tt-band);
  }
  .tip p {
    margin: 0;
  }
  /* The header band: the frame's colour faint behind the name, closed by the frame's line. */
  .thead {
    margin: 3px 3px 0;
    padding: 0.45rem 0.8rem 0.4rem;
    background: var(--tt-band);
    border-bottom: 1px solid var(--tt-frame);
  }
  .tbody {
    padding: 0.55rem 0.9rem 0.75rem;
  }
  .tname {
    font-size: 1.2rem;
    line-height: 1.2;
    color: var(--tt-currency);
  }
  .mark {
    font-size: 0.95rem;
    color: var(--fossil-rare-ink);
  }
  .line {
    font-size: 1rem;
    line-height: 1.3;
    text-wrap: pretty;
    color: var(--tt-grey);
  }
  .white {
    color: var(--tt-white);
  }
</style>
