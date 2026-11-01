<script lang="ts" module>
  // The set of 25 fossils Delve turns up (lib/fossils.ts), as sockets in the
  // achievement seals' language (AchievementSeal.svelte, docs/arcane-style.md):
  // each a worn double ring, a rare one's with a glory of 16 fine rays between
  // its rings, as the harder seals have. Not yet found, a socket is a dull
  // impression with the nodule faint inside (the stone a fossil waits in, as
  // the Delve card shows it); found, the fossil's art sits in the ring on its
  // glow, and a rare one's rings are gold and catch the gold seals' light.
  import { at, line, ring, wear, type Pt } from '../../lib/arcane';
  import { passingLight } from '../../lib/glint';
  import { METALS } from '../../lib/metals';

  const C: Pt = [0, 0];
  const OUTER = 22.6;
  const INNER = 18.2;
  /** The outer ring, worn the same in every socket (a fixed seed), and whole for its glow. */
  const OUTER_WORN = ring(C, OUTER, { wear: wear(173) });
  const OUTER_WHOLE = ring(C, OUTER);

  /**
   * The nodule, small: an exact ellipse lying tilted, two growth rings
   * inside it grown about a nucleus off to its lower left, as a concretion's
   * are, and the side away from the light (the right, where the rings lie
   * widest apart) hatched between the outer two. At this size the card's
   * seam across it, and its strata, read as an eye or a sign, so the socket
   * leaves them out.
   */
  const RX = 8.4;
  const RY = 7;
  const TILT = -28;
  const NUCLEUS: Pt = [-3, 2];
  const p2 = (x: number, y: number) => `${x.toFixed(2)} ${y.toFixed(2)}`;
  /** A point of the ellipse scaled by `k` about the nucleus's share `1 - k`, at angle `t` (radians, clockwise from the right). */
  const onShell = (k: number, t: number): Pt => [NUCLEUS[0] * (1 - k) + RX * k * Math.cos(t), NUCLEUS[1] * (1 - k) + RY * k * Math.sin(t)];
  const shell = (k: number) => {
    const [cx, cy] = [NUCLEUS[0] * (1 - k), NUCLEUS[1] * (1 - k)];
    const [rx, ry] = [RX * k, RY * k];
    return `M${p2(cx - rx, cy)}A${rx} ${ry} 0 1 0 ${p2(cx + rx, cy)}A${rx} ${ry} 0 1 0 ${p2(cx - rx, cy)}Z`;
  };
  const NODULE = shell(1);
  const GROWTH = shell(0.62) + shell(0.3);
  /** Strokes across the band between the outer two, from above right round to below right. */
  const HATCH = Array.from({ length: 9 }, (_, i) => {
    const t = ((-62 + i * 15) * Math.PI) / 180;
    const [a, b] = [onShell(0.7, t), onShell(0.93, t)];
    return `M${p2(...a)}L${p2(...b)}`;
  }).join('');
  /** A rare one's glory: 16 fine rays inside the inner ring, long and short in turn, as a silver seal's. */
  const GLORY = Array.from({ length: 16 }, (_, k) => line(at(C, k * 22.5, 12.4), at(C, k * 22.5, k % 2 ? INNER - 3 : INNER - 1.3))).join('');

  // Gold's light, as the gold seals catch it: every found rare one sweeps together, on the page's beat.
  const GOLD = METALS[3];
  const LIGHT = passingLight(GOLD.light.every, GOLD.light.sweep, { travel: true });
  /** A rare socket's metal, its glow and its light, as a gold seal's. */
  const GOLD_STYLE = `--gold: ${GOLD.color}; --gold-sheen: ${GOLD.sheen?.color}; --gold-shine: ${GOLD.sheen?.opacity}; --gleam: ${GOLD.light.gleam}; --band: ${GOLD.light.band}%`;
  const sheen = (slit: Element) => LIGHT.glintAt(slit, slit.closest('.socket') ?? slit);
  const spark = (el: Element) => LIGHT.sparkAt(el, el.closest('.socket') ?? el);
  /** Where the spark kindles: on the outer ring, up and to the right, as a share of the socket. */
  const SPARK_AT = at(C, 45, OUTER).map((v) => `${50 + (v / 48) * 100}%`);
</script>

<script lang="ts">
  // Choosing one shows it in the detail box (beside the set on a wide
  // screen, under it on a narrow one) as the game's tooltip would: its name
  // in the currency colour, whether it is rare, and when and how deep it was
  // unearthed. A mouse chooses by resting on a socket, and the choice stays
  // until it enters another (the cells touch, their spacing inside them, so
  // moving across the set never drops it); a touch chooses only by a tap, so
  // a finger scrolling over the set chooses nothing. The box is as tall as
  // the tallest it can show, every face laid in the same place with only the
  // chosen one seen, so nothing moves as the choice changes.
  //
  // The rows are cut so none is left with a straggler: nine to a row where
  // nine fit (the 17 common ones nine and eight, the 8 rare ones a row of
  // their own), six on a phone (six, six and five; the rare ones four and
  // four). Every size is fixed by the width alone, so the Codex's scroll
  // stays exact.
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
  /** The fossil chosen (the last a mouse rested on, or tapped); else the latest found. */
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

{#snippet rings(f: Fossil, whole: boolean)}
  <path d={whole ? OUTER_WHOLE : OUTER_WORN} class="main" />
  <circle r={INNER} class="hair" />
  {#if f.rare}<path d={GLORY} class="hair" />{/if}
{/snippet}

{#snippet socket(f: Fossil)}
  {@const got = found[f.id]}
  <span class="socket" class:got={!!got} class:rare={f.rare} style={f.rare ? GOLD_STYLE : undefined}>
    {#if got}
      <svg class="glow" viewBox="-24 -24 48 48" aria-hidden="true">{@render rings(f, true)}</svg>
    {/if}
    <svg viewBox="-24 -24 48 48" aria-hidden="true">
      {@render rings(f, false)}
      {#if !got}
        <g class="nodule" transform="rotate({TILT})">
          <path d={NODULE} class="thin" />
          <path d={GROWTH + HATCH} class="hair" />
        </g>
      {/if}
    </svg>
    {#if got}
      <img src={fossilArt(f.id, 128)} alt="" loading="lazy" draggable="false" />
      {#if f.rare && !motion.still}
        <span class="light"><span class="slit" use:sheen><svg viewBox="-24 -24 48 48">{@render rings(f, true)}</svg></span></span>
        <svg class="spark" use:spark viewBox="-1 -1 2 2" style:left={SPARK_AT[0]} style:top={SPARK_AT[1]}>
          <path d="M0 -1L0.16 -0.16L1 0L0.16 0.16L0 1L-0.16 0.16L-1 0L-0.16 -0.16Z" />
        </svg>
      {/if}
    {/if}
  </span>
{/snippet}

{#snippet set()}
  <p class="about">
    {#if complete}Every fossil unearthed.{:else}Found now and then on a Delve card; answer right to unearth one. They don’t change a run.{/if}
  </p>
  <div class="body">
    <div class="sets">
      {#each GROUPS as g (g.key)}
        {@const n = g.fossils.filter((f) => found[f.id]).length}
        <div class="group {g.key}">
          <h3 class="head" id="{uid}-{g.key}"><span>{g.name}</span><span class="tally"><span class="n">{n}</span> of <span class="n">{g.fossils.length}</span></span></h3>
          <ul class="grid" aria-labelledby="{uid}-{g.key}">
            {#each g.fossils as f (f.id)}
              {@const got = found[f.id]}
              <li>
                <button
                  class="cell"
                  class:got={!!got}
                  class:rare={f.rare}
                  class:on={shown?.id === f.id}
                  aria-label={got ? f.name : f.rare ? 'A rare fossil, still in the stone' : 'A fossil still in the stone'}
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
                  {@render socket(f)}
                </button>
              </li>
            {/each}
          </ul>
        </div>
      {/each}
    </div>
    <!-- Every face the box can show, stacked in one place with only the chosen one seen: the box is as tall as
         the tallest of them, no taller, so nothing moves as the choice changes. -->
    <div class="tip" id="{uid}-tip" aria-live="polite">
      {#each FOSSILS as f (f.id)}
        {@const got = found[f.id]}
        <div class="face" class:shown={shown?.id === f.id} aria-hidden={shown?.id !== f.id}>
          {#if got}
            <p class="name">{f.name}</p>
            {#if f.rare}<p class="mark">Rare</p>{/if}
            <p class="when">Unearthed {date(got.at)} at depth <span class="n">{shownDepth(got.depth)}</span>{got.together ? ', in a run together' : ''}.</p>
          {:else}
            <p class="name unknown">Still in the stone</p>
            {#if f.rare}<p class="mark">Rare</p>{/if}
            <p class="when">
              {#if f.rare}From depth <span class="n">{rareFrom}</span>, and more often the deeper you go.{:else}From depth <span class="n">{commonFrom}</span>, and most often beside a find.{/if}
            </p>
          {/if}
        </div>
      {/each}
      {#if !count}
        <div class="face" class:shown={!shown} aria-hidden={!!shown}>
          <p class="name unknown">None unearthed yet</p>
          <p class="when">The first can turn up from depth <span class="n">{commonFrom}</span>.</p>
        </div>
      {/if}
    </div>
  </div>
{/snippet}

{#if embedded}
  <div class="fossils embedded" role="group" aria-label="Fossils, {count} of {FOSSIL_COUNT} unearthed">{@render set()}</div>
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
    /* A rare one's gold: the gold seals' metal, a shade warmer to read as type on the dark. */
    --rare-gold: #d9b26a;
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
   * The layout, by the width alone. Narrow: six to a row (the rare ones four),
   * the detail box under the set. From 480px, nine to a row. From 700px, the
   * detail box beside the set, which takes what the box leaves it, up to a
   * 66px cell (a 60px socket).
   */
  .body {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 1rem;
    align-items: start;
  }
  .sets {
    --cols: 6;
    --cell: min(66px, 100cqi / 6);
    justify-self: center;
    display: grid;
    gap: 0.8rem;
    width: fit-content;
  }
  .rare {
    --cols: 4;
  }
  @container fossils (min-width: 480px) {
    .sets,
    .rare {
      --cols: 9;
      --cell: min(66px, 100cqi / 9);
    }
  }
  @container fossils (min-width: 700px) {
    .body {
      grid-template-columns: auto minmax(14rem, 1fr);
      gap: 1.75rem;
      align-items: center;
    }
    .sets,
    .rare {
      --cell: min(66px, (100cqi - 15.75rem) / 9);
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
    color: var(--rare-gold);
  }
  .tally {
    letter-spacing: 0.08em;
    color: var(--muted);
  }
  .tally .n {
    font-size: 1em;
    color: #c9bea8;
  }
  .grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(var(--cols), var(--cell));
  }

  /* The cells touch: the spacing is inside each, so a pointer crossing the set is always on one. */
  .cell {
    display: block;
    width: var(--cell);
    height: var(--cell);
    padding: calc(var(--cell) * 0.045);
    border: 0;
    background: none;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .cell:focus-visible {
    outline: 2px solid var(--gold-hi);
    outline-offset: -2px;
    border-radius: 50%;
  }

  /* The socket: lines cut into a dark medallion, as a seal's. */
  .socket {
    --ink: #7d6f5c;
    position: relative;
    display: block;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    color: var(--ink);
    background: radial-gradient(circle, rgba(0, 0, 0, 0.55) 0 62%, rgba(0, 0, 0, 0.25) 74%, transparent 76%);
  }
  .socket.got {
    --ink: #aa9e82;
    background: radial-gradient(
      circle,
      rgba(255, 186, 96, 0.2) 0 30%,
      rgba(0, 0, 0, 0.55) 62%,
      rgba(0, 0, 0, 0.25) 74%,
      transparent 76%
    );
  }
  .socket.got.rare {
    --ink: var(--gold);
  }
  .socket.got.rare .glow {
    color: var(--gold-sheen);
    opacity: var(--gold-shine);
  }
  /* The one shown: its lines bright as bone, and a pale light round it. */
  .cell.on .socket {
    --ink: #e6dcc6;
    box-shadow:
      0 0 0 1px rgba(246, 240, 226, 0.55),
      0 0 10px rgba(246, 240, 226, 0.22);
  }
  .cell.on .socket:not(.got) {
    background: radial-gradient(circle, rgba(230, 220, 198, 0.08) 0 40%, rgba(0, 0, 0, 0.55) 62%, rgba(0, 0, 0, 0.25) 74%, transparent 76%);
  }
  .cell.on.got .socket.rare {
    --ink: #fff0c8;
  }
  svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
    fill: none;
    stroke: currentColor;
    stroke-linecap: butt;
    stroke-linejoin: miter;
    stroke-miterlimit: 12;
  }
  .main {
    stroke-width: 0.85;
  }
  .thin {
    stroke-width: 0.55;
  }
  .hair {
    stroke-width: 0.4;
  }
  circle {
    stroke-linecap: round;
  }
  /* Not yet found: a dull impression, the nodule faint inside it. */
  .socket:not(.got) svg {
    opacity: 0.7;
  }
  .nodule {
    color: #b9b09c;
    opacity: 0.55;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .cell.on .nodule {
    color: #e6dcc6;
    opacity: 0.8;
  }
  .socket img {
    position: absolute;
    left: 20%;
    top: 20%;
    width: 60%;
    height: 60%;
    object-fit: contain;
    pointer-events: none;
    -webkit-user-select: none;
    user-select: none;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.8));
  }

  /* The glow: the same lines, wide and faint, under them (AchievementSeal's). */
  .glow {
    overflow: hidden;
    opacity: 0.22;
    filter: blur(0.6px);
  }
  .glow * {
    stroke-width: 2.2;
  }
  .glow .hair {
    stroke-width: 1.2;
  }

  /* Gold's passing light and its spark, as on a gold seal (AchievementSeal.svelte, lib/glint.ts). */
  .light {
    position: absolute;
    inset: 0;
    overflow: hidden;
    border-radius: 50%;
    pointer-events: none;
  }
  .slit {
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
  .slit svg {
    color: var(--gleam);
    filter: drop-shadow(0 0 1px var(--gleam));
    transform: skewX(20deg);
  }
  .spark {
    position: absolute;
    width: 34%;
    height: 34%;
    inset: auto;
    overflow: visible;
    opacity: 0;
    transform: translate(-50%, -50%);
    pointer-events: none;
    fill: #fffaf0;
    stroke: none;
    filter: drop-shadow(0 0 2px rgba(255, 214, 140, 0.9));
  }

  /* The game's tooltip: the name in the currency colour (ItemDetails.svelte), Fontin SmallCaps. */
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
    color: var(--rare-gold);
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
