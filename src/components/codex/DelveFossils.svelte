<script lang="ts" module>
  // The set of 25 fossils Delve turns up (lib/fossils.ts), as PoE's Delve
  // stash tab lays them out: a fixed square slot for each, a well pressed
  // into the panel. The 17 common ones lie as tightly as 17 squares are
  // known to go into a square: John Bidwell's packing
  // (lib/squarePacking.ts), seven of them askew. The 8 rare ones stand
  // together beside it in two columns of four (under it in two rows where
  // the width is too narrow), a little larger. Each kind under the fossil
  // card's own seal. One not kept yet is an empty well holding only its
  // shape, as the Collection shows an item not seen yet, and nothing to
  // choose; one kept lies in it in its own colours on its glow, a rare
  // one's rim in the rare fossil card's red. Now and then a band of lamplight
  // passes over the kept ones, a rare one's more often.
  import { pointedRay } from '../../lib/arcane';
  import { notched, Plate } from '../../lib/cardEngraving';
  import { ammoniteSeal } from '../../lib/findEngraving';
  import { passingLight } from '../../lib/glint';
  import { PACKED, PACKED_SIDE } from '../../lib/squarePacking';

  /**
   * The fossil card's seals, small, beside each kind's name: a common's
   * ammonite in its double ring; a rare's, as large, in a sun of eight
   * pointed rays, long and short in turn, each hatched down one side.
   */
  function seal(rare: boolean) {
    const p = new Plate();
    const r0 = 10;
    ammoniteSeal(p, [0, 0], r0);
    for (let k = 0; rare && k < 8; k++) {
      const ray = pointedRay([0, 0], k * 45, r0 + 0.9, k % 2 ? 13.2 : 15, (Math.asin(1.5 / (r0 + 0.9)) * 180) / Math.PI, 0.6);
      p.add(ray.lines, 'hair');
      p.add(ray.hatch, 'hatch');
    }
    return p.out;
  }
  const SEALS = { common: seal(false), rare: seal(true) };

  /** Which side of its slot the tooltip lies on. */
  type Side = 'left' | 'right' | 'above' | 'below';
  /** The tooltip plate's point: half its base, and how far it stands out (px). */
  const BEAK = 7;
  /**
   * The edge of the tooltip's plate, `w` by `h`, cut as the fossil card's
   * name plate is, its corners notched `n` about them; on the side toward
   * its slot a point, `p` along that side.
   */
  function plateEdge(w: number, h: number, n: number, side: Side, p: number) {
    const [x0, y0, x1, y1, b] = [0.5, 0.5, w - 0.5, h - 0.5, BEAK];
    const corner = (x: number, y: number) => `A${n} ${n} 0 0 0 ${x} ${y}`;
    return (
      `M${x0 + n} ${y0}` +
      (side === 'below' ? `L${p - b} ${y0}L${p} ${y0 - b}L${p + b} ${y0}` : '') +
      `L${x1 - n} ${y0}${corner(x1, y0 + n)}` +
      (side === 'left' ? `L${x1} ${p - b}L${x1 + b} ${p}L${x1} ${p + b}` : '') +
      `L${x1} ${y1 - n}${corner(x1 - n, y1)}` +
      (side === 'above' ? `L${p + b} ${y1}L${p} ${y1 + b}L${p - b} ${y1}` : '') +
      `L${x0 + n} ${y1}${corner(x0, y1 - n)}` +
      (side === 'right' ? `L${x0} ${p + b}L${x0 - b} ${p}L${x0} ${p - b}` : '') +
      `L${x0} ${y0 + n}${corner(x0 + n, y0)}Z`
    );
  }

  /** The lamplight passing over the kept ones (lib/glint.ts), all of a kind on the same beat: every `every` ms, `sweep` to cross. */
  const LAMP = passingLight(12000, 1500, { travel: true });
  const LAMP_RARE = passingLight(7000, 1400, { travel: true });
  const sweep = (slit: Element, rare: boolean) => (rare ? LAMP_RARE : LAMP).glintAt(slit, slit.closest('.slot') ?? slit);

  /** Where each common one lies in the packing, as CSS places it: its left and top, and its turn. */
  const PLACES = PACKED.map((p) => ({
    left: `${((p.x - 0.5) / PACKED_SIDE) * 100}%`,
    top: `${((p.y - 0.5) / PACKED_SIDE) * 100}%`,
    turn: `${p.turn}deg`,
  }));

  /** The tooltip's gap from the fossil it names, and from the edge of what it may lie over (px); how long it waits for the pointer to come back to the set. */
  const TIP_GAP = 12;
  const TIP_EDGE = 8;
  const TIP_LINGER_MS = 140;
</script>

<script lang="ts">
  // A kept fossil's tooltip shows beside it, as the game's stash shows an
  // item's, on a plate cut as the fossil card's name plate is: its name,
  // whether it is rare, and when and how deep it was kept. A mouse brings it
  // up by resting on a slot, and it stays until the mouse rests on another
  // or leaves the set (so crossing the gaps between slots never drops it); a
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
  import { fossilGlow } from '../../lib/amberImage';
  import { motion } from '../../lib/motion.svelte';

  /** Svelte action: a kept fossil's light (lib/fossilGlow.ts, made in a worker: lib/amberImage.ts) into its image once made. */
  function glowOf(node: HTMLImageElement, f: Fossil) {
    let live = true;
    void fossilGlow(f.id, f.rare).then((url) => {
      if (live && url) node.src = url;
    });
    return { destroy: () => (live = false) };
  }

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
  /** Where the tooltip lies (in the set's px), which side of its slot, and where along that edge its point is. */
  let at = $state({ x: 0, y: 0 });
  let side = $state<Side>('right');
  let point = $state(0);
  /** Its size (px), for its plate. */
  let size = $state({ w: 0, h: 0 });
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));
  /**
   * Beside the slot, on the side away from the set's middle where there's
   * room, so it covers as few of the others as it can, else on the other
   * side, its top level with the slot's and its point on the slot's middle;
   * always inside the set's own panel (or dialog), never over the next one;
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
    const x0 = (c.left - w.left) / z;
    const x1 = (c.right - w.left) / z;
    const y0 = (c.top - w.top) / z;
    const y1 = (c.bottom - w.top) / z;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const minX = (b.left - w.left) / z + TIP_EDGE;
    const maxX = (b.right - w.left) / z - TIP_EDGE;
    const minY = Math.max((b.top - w.top) / z + TIP_EDGE, 0);
    const maxY = (b.bottom - w.top) / z - TIP_EDGE;
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    if (tw !== size.w || th !== size.h) size = { w: tw, h: th };
    const right = x1 + TIP_GAP + tw <= maxX ? x1 + TIP_GAP : null;
    const left = x0 - TIP_GAP - tw >= minX ? x0 - TIP_GAP - tw : null;
    const x = cx < wrap.offsetWidth / 2 ? (left ?? right) : (right ?? left);
    if (x !== null) {
      const y = clamp(y0, minY, maxY - th);
      at = { x, y };
      side = x === right ? 'right' : 'left';
      point = clamp(cy - y, 14 + BEAK, th - 14 - BEAK);
      return;
    }
    const xs = clamp(cx - tw / 2, minX, maxX - tw);
    const above = y0 - TIP_GAP - th >= minY ? y0 - TIP_GAP - th : null;
    const below = y1 + TIP_GAP + th <= maxY ? y1 + TIP_GAP : null;
    const y = (cy < wrap.offsetHeight / 2 ? (below ?? above) : (above ?? below)) ?? y1 + TIP_GAP;
    at = { x: xs, y };
    side = y === above ? 'above' : 'below';
    point = clamp(cx - xs, 14 + BEAK, tw - 14 - BEAK);
  }
  $effect(() => {
    void found;
    if (open && chosen) place();
  });
  // While it shows: kept beside its slot as the set's width changes, and put away by a press anywhere off the set, or Escape.
  // Escape is heard before anything else on the page (on the window, in capture) and taken (default prevented), so it
  // puts away only the tooltip: the dialog round the set (FossilsDialog, lib/dialogBackdrop.ts) leaves a key already
  // had, and a second Escape closes it.
  $effect(() => {
    if (!open || !root) return;
    const sized = new ResizeObserver(() => place());
    sized.observe(root);
    const off = (e: PointerEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest('.cell') || !root!.contains(e.target)) open = false;
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing) return;
      e.preventDefault();
      open = false;
    };
    document.addEventListener('pointerdown', off, true);
    addEventListener('keydown', key, true);
    return () => {
      sized.disconnect();
      document.removeEventListener('pointerdown', off, true);
      removeEventListener('keydown', key, true);
    };
  });
  $effect(() => () => clearTimeout(linger));
</script>

{#snippet slot(f: Fossil)}
  {@const got = found[f.id]}
  <span class="slot" class:got={!!got} class:rare={f.rare}>
    {#if got}
      <!-- The light it gives off, cast by its own shape on the well's floor (lib/fossilGlow.ts). -->
      <span class="light"><img class="halo" alt="" draggable="false" use:glowOf={f} /></span>
    {/if}
    <img src={fossilArt(f.id, 128)} alt="" loading="lazy" draggable="false" />
    {#if got && !motion.resting}
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
    <span class="cell" role="img" aria-label={f.rare ? 'A rare fossil, not found yet' : 'A fossil, not found yet'}>{@render slot(f)}</span>
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
    {#if complete}All {FOSSIL_COUNT} fossils found. There are no more to find.{:else}Delve cards sometimes hold a fossil. Answer that card right to add it here.{/if}
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
          <h3 class="head {g.key}" id="{uid}-{g.key}">
            <svg class="seal {g.key}" viewBox={g.key === 'rare' ? '-15.5 -15.5 31 31' : '-12 -12 24 24'} aria-hidden="true">{#each SEALS[g.key] as s, i (i)}<path class={s.cls} d={s.d} />{/each}</svg>
            <span>{g.name}</span><span class="tally" title="{n} of {g.fossils.length} found">{n}/{g.fossils.length}</span></h3>
          <ul class="grid {g.key}" aria-labelledby="{uid}-{g.key}">
            {#each g.fossils as f, i (f.id)}
              {#if g.key === 'common'}
                {@const p = PLACES[i]}
                <li style:left={p.left} style:top={p.top} style:rotate={p.turn}>{@render cell(f)}</li>
              {:else}
                <li>{@render cell(f)}</li>
              {/if}
            {/each}
          </ul>
        </div>
      {/each}
    </div>
    <!-- The game's tooltip (ItemDetails.svelte's lines), over the page, beside the slot it names. -->
    <div
      class="tip"
      class:open
      class:rare={!!chosen?.rare}
      id="{uid}-tip"
      role="tooltip"
      bind:this={tip}
      style:left="{at.x}px"
      style:top="{at.y}px"
    >
      {#if size.w}
        {@const edge = plateEdge(size.w, size.h, 6, side, point)}
        <!-- Its plate, cut as the fossil card's name plate is: a rule and a hairline inside it, their corners notched, its point at the slot. -->
        <svg class="tframe" viewBox="0 0 {size.w} {size.h}" aria-hidden="true">
          <path class="ground" d={edge} />
          <path class="rule" d={edge} />
          <path d={notched(0.5, 0.5, size.w - 0.5, size.h - 0.5, 9, 3)} />
        </svg>
      {/if}
      {#if chosen && found[chosen.id]}
        {@const got = found[chosen.id]!}
        <div class="thead">
          <p class="tname">{chosen.name}</p>
          {#if chosen.rare}<p class="mark">Rare</p>{/if}
        </div>
        <div class="tbody">
          <p class="line">Found: <span class="white">{date(got.at)}</span></p>
          <p class="line">Depth: <span class="white">{shownDepth(got.depth)}</span></p>
          {#if got.together}<p class="line">In a run together</p>{/if}
        </div>
      {/if}
    </div>
  </div>
{/snippet}

{#if embedded}
  <div class="fossils embedded" role="group" aria-label="Fossils, {count} of {FOSSIL_COUNT} found" bind:this={root}>{@render set()}</div>
{:else}
  <section class="panel fossils" use:backdropShadow={{ fill: 'linear' }} aria-labelledby="{uid}-h" bind:this={root}>
    <header>
      <h2 id="{uid}-h">Fossils</h2>
      <span class="col-label" title="{count} of {FOSSIL_COUNT} found">{count}/{FOSSIL_COUNT}</span>
    </header>
    {@render set()}
  </section>
{/if}

<style>
  .fossils {
    /* (The amber is app.css's --fossil-*, the card's.) */
    container: fossils / inline-size;
    position: relative;
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
    color: var(--note);
    text-wrap: pretty;
  }

  /*
   * The layout, by the width alone, from the packing's side (--P) and its
   * unit square (--c, a common one's cell). Narrow: the packing as wide as
   * there is room (at most 360px), the rare ones under it in two rows of
   * four as wide as it. From 480px, beside it in two columns of four as
   * tall as it. A rare one's cell (--r) a little larger than a common one's,
   * with gutters (--g) as close as the packing's.
   */
  .wrap {
    --P: min(100cqi, 360px);
    --c: calc(var(--P) / 4.67553);
    --g: calc(var(--P) * 0.02);
    --r: calc((var(--P) - 3 * var(--g)) / 4);
    --G: 2.4rem;
    position: relative;
  }
  .sets {
    display: flex;
    flex-direction: column;
    gap: 1.9rem;
  }
  .group.common {
    width: var(--P);
  }
  .grid.rare {
    display: grid;
    grid-template-columns: repeat(4, var(--r));
    grid-auto-rows: var(--r);
    gap: var(--g);
  }
  @container fossils (min-width: 480px) {
    .wrap {
      /* The rare ones' two columns and their gutter: 0.49 of the packing. */
      --P: min(330px, (100cqi - var(--G)) / 1.49);
    }
    .sets {
      flex-direction: row;
      gap: var(--G);
    }
    .grid.rare {
      grid-template-columns: repeat(2, var(--r));
    }
  }
  /* Alone in a wide panel (a tablet, a phone on its side): the words and the set in the middle of it, not huddled at its left. */
  @container fossils (min-width: 640px) {
    .about {
      text-align: center;
    }
    .sets {
      justify-content: center;
    }
    .head {
      justify-content: center;
    }
  }
  .head {
    display: flex;
    align-items: center;
    gap: 0.7em;
    margin: 0 0 0.6rem;
    font-family: var(--font-display);
    font-size: 0.68rem;
    font-weight: 400;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #d8a26a;
  }
  .seal {
    flex: none;
    width: 1.6rem;
    height: 1.6rem;
    margin-right: -0.15em;
    overflow: visible;
    /* Its middle on the capitals' middle, not the line's (which sits lower). */
    translate: 0 -0.09rem;
  }
  /* The rare one's rays stand outside its circle, as wide as the common one's. */
  .seal.rare {
    width: calc(1.6rem * 31 / 24);
    height: calc(1.6rem * 31 / 24);
    margin: -0.25rem -0.15em -0.25rem -0.25rem;
  }
  /* A rare one's name in the rare fossil card's ink. */
  .head.rare {
    color: color-mix(in srgb, var(--fossil-rare-ink) 78%, #d8a26a);
  }
  .seal path {
    fill: none;
    stroke: currentColor;
    stroke-width: 0.6;
  }
  .seal .hair {
    stroke-width: 0.42;
  }
  .seal .hatch {
    stroke-width: 0.34;
  }
  .seal .fill {
    fill: currentColor;
    stroke: none;
  }
  /* As the codex's tabs count (Codex.svelte, .tab-note). */
  .tally {
    font-family: var(--font-cinzel);
    font-size: 0.78rem;
    letter-spacing: 0;
    color: var(--gold-lo);
  }
  /* The packing: a square PACKED_SIDE of its slots' cells across, each cell laid where the packing puts it, turned as it is. */
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
    width: var(--c);
    height: var(--c);
  }
  .grid.rare li {
    display: grid;
  }

  /* The spacing is inside each cell (a share of its own width), so a pointer crossing the set is on one wherever they touch. */
  .cell {
    display: block;
    width: 100%;
    height: 100%;
    padding: 3%;
    border: 0;
    background: none;
    -webkit-tap-highlight-color: transparent;
  }
  .cell.got {
    cursor: pointer;
  }
  .cell:focus-visible {
    outline: 1px solid var(--gold-hi);
    outline-offset: 1px;
  }

  /*
   * The slot: a square well pressed into the panel, its corners barely
   * eased, its floor darker than the panel, shadowed under its rim and its
   * lower lip catching the light; empty, a place a fossil goes into, its
   * shape in the floor as the Collection shows an item not seen yet. Kept,
   * the fossil lies in it in its own colours on its glow; a rare one's
   * rim in the rare fossil card's red, its glow a little stronger.
   */
  .slot {
    /* Crisp lines only (a soft shadow this dark bands): shadow under the rim, a lip catching the light. */
    --well: inset 0 1px 0 rgba(0, 0, 0, 0.75), inset 0 0 0 1px rgba(0, 0, 0, 0.45), inset 0 2px 0 rgba(0, 0, 0, 0.28), 0 1px 0 rgba(255, 222, 176, 0.07);
    --rim: transparent;
    position: relative;
    display: block;
    width: 100%;
    height: 100%;
    border-radius: 3px;
    background: rgba(0, 0, 0, 0.32);
    box-shadow:
      var(--well),
      inset 0 0 0 1px var(--rim);
    transition: box-shadow 0.2s;
  }
  /*
   * A kept one's light, under it: what it casts on its well's floor
   * (lib/fossilGlow.ts: wide and low, warm by the stone and cooling to
   * ember, dithered), kept inside the well, its walls catching a little.
   * The fossil itself is left as its art is.
   */
  .slot.got {
    isolation: isolate;
  }
  .light {
    position: absolute;
    inset: 0;
    z-index: -1;
    overflow: hidden;
    border-radius: inherit;
    pointer-events: none;
  }
  /* The art's box (12% in, 76% across) with the glow's room (GLOW_PAD of GLOW_ART) round it. */
  .slot img.halo {
    left: calc(12% - 76% * 64 / 128);
    top: calc(12% - 76% * 64 / 128);
    width: calc(76% * 256 / 128);
    height: calc(76% * 256 / 128);
  }
  .slot img.halo:not([src]) {
    visibility: hidden;
  }
  /* The well's walls catching its light, faintly. */
  .slot.got {
    --rim: rgba(236, 142, 44, 0.12);
  }
  /* A rare one: its rim in the rare card's edge red, its glow a little stronger. */
  .slot.rare {
    --rim: rgba(200, 48, 12, 0.16);
  }
  .slot.rare.got {
    --rim: color-mix(in srgb, var(--fossil-rare-edge) 42%, transparent);
  }
  .slot img {
    position: absolute;
    left: 12%;
    top: 12%;
    width: 76%;
    height: 76%;
    object-fit: contain;
    pointer-events: none;
    -webkit-user-select: none;
    user-select: none;
  }
  .slot > img {
    filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.7));
  }
  .slot:not(.got) > img {
    filter: brightness(0);
    opacity: 0.55;
  }
  .still .slot {
    transition: none;
  }
  /* The one whose tooltip shows: its rim lit, nothing moving. */
  .cell.on .slot {
    --rim: var(--gold-lo);
    box-shadow:
      var(--well),
      inset 0 0 0 1px var(--rim),
      0 0 0 1px rgba(201, 164, 92, 0.22);
  }
  .cell.on .slot.rare {
    --rim: var(--fossil-rare-ink);
    box-shadow:
      var(--well),
      inset 0 0 0 1px var(--rim),
      0 0 0 1px color-mix(in srgb, var(--fossil-rare-ink) 28%, transparent);
  }

  /*
   * The lamplight (lib/glint.ts): a slanted slit masked to a narrow band,
   * holding a brighter copy of the fossil, the band sliding across it. Kept
   * to the slot.
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
    --tt-ground: #0a0806;
    --tt-frame: rgba(217, 164, 90, 0.75);
    position: absolute;
    z-index: 3;
    width: 15rem;
    text-align: center;
    font-family: var(--font-tooltip);
    font-variant-numeric: lining-nums;
    /* Its shadow follows its notched plate; small, as a box-shadow can't be dithered. */
    filter: drop-shadow(0 3px 7px rgba(0, 0, 0, 0.65));
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
  .tframe {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  .tframe path {
    fill: none;
    stroke: var(--tt-frame);
    stroke-width: 0.6px;
    vector-effect: non-scaling-stroke;
  }
  .tframe .rule {
    stroke-width: 1px;
  }
  .tframe .ground {
    fill: var(--tt-ground);
    stroke: none;
  }
  .tip p {
    margin: 0;
  }
  /* The name, and under it a hairline across, short of the frame. */
  .thead,
  .tbody {
    position: relative;
  }
  .thead {
    padding: 0.85rem 1rem 0.55rem;
  }
  .thead::after {
    content: '';
    position: absolute;
    left: 1.4rem;
    right: 1.4rem;
    bottom: 0;
    height: 1px;
    background: var(--tt-frame);
    opacity: 0.55;
  }
  .tbody {
    padding: 0.55rem 1rem 0.85rem;
  }
  .tname {
    font-size: 1.2rem;
    line-height: 1.2;
    color: #e2c48c;
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
