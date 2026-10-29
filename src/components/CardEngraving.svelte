<script module lang="ts">
  // One observer for every engraving's size: its reports all read before any
  // engraving is drawn (what they set is drawn once they're all in). Watched
  // in device pixels where the browser can say them (not Safari), which a
  // printed plate's prints are pulled at (lib/platePrint): the box as it's
  // drawn, the screen's density and all.
  const reports = new Map<Element, (rect: DOMRectReadOnly, px?: [number, number]) => void>();
  let observer: ResizeObserver | undefined;
  const inPx = typeof ResizeObserverEntry !== 'undefined' && 'devicePixelContentBoxSize' in ResizeObserverEntry.prototype;
  /** Calls `report` with `node`'s content box as it's laid out and whenever that changes, and its size in device pixels if known; returns what stops it. */
  function sizes(node: Element, report: (rect: DOMRectReadOnly, px?: [number, number]) => void) {
    observer ??= new ResizeObserver((entries) => {
      for (const e of entries) {
        const d = e.devicePixelContentBoxSize?.[0];
        reports.get(e.target)?.(e.contentRect, d ? [d.inlineSize, d.blockSize] : undefined);
      }
    });
    reports.set(node, report);
    observer.observe(node, inPx ? { box: 'device-pixel-content-box' } : undefined);
    return () => {
      reports.delete(node);
      observer?.unobserve(node);
    };
  }
</script>

<script lang="ts">
  // One side of a category card, engraved (see lib/cardEngraving): drawn
  // for the card's size as it is laid out, the lines over a soft glow of
  // themselves, the glory's rays fading out from its centre. It stands still.
  //
  // Delve's finds (lib/findEngraving): `find` engraves a find's motif into
  // the plate, whose own lines stop short of it. A find's glow breathes,
  // quicker than the circle's, and now and then light runs over its motif
  // or flares up in it: transform and opacity only. A gilded motif (the way
  // out's lantern, Plate.gilt) is filled as an item's emblem is instead, and
  // its light breathes round it in place of the glint.
  //
  // Printed (`print`, lib/platePrint): its glow and its lines are shown as
  // images of themselves, pulled from their svgs once for each size, which
  // Chrome draws for a fraction of what their strokes cost it.
  import { engrave } from '../lib/cardEngraving';
  import { findVariant } from '../lib/findEngraving';
  import { leftKey, printing, pull, pulled, type At, type Layer } from '../lib/platePrint.svelte';
  import { layoutZoomOf } from '../lib/stage';
  import type { FindKind } from '../lib/delve';
  import type { Variant } from '../lib/cardEngraving';

  // `front`: only what stands in front of the emblem (Plate.front), solid, laid over the category's item.
  // `print`: its still layers shown as prints of themselves (lib/platePrint), where Chrome rasters it at its laid-out size.
  // `hold`: how long it lies unseen once it's mounted (ms; a dealt card fades in late): a printed layer's svg isn't drawn so long while its print is pulled.
  let { side, find = null, custom, front = false, print = false, hold = 0 }: { side: 'face' | 'back'; find?: FindKind | null; custom?: Variant; front?: boolean; print?: boolean; hold?: number } = $props();
  let w = $state(0);
  let h = $state(0);
  /** Its exact size: the glint's copy of the motif is drawn at it, as the lines stretch to it (w and h are whole pixels). */
  let box = $state<DOMRectReadOnly>();
  /** Its size in device pixels where the browser says it, the device pixels to its CSS px, and its ink: what a print is pulled at. */
  let px = $state<[number, number]>();
  let z = $state(1);
  let ink = $state('');
  /**
   * Svelte action: its size, as the browser reports it (sizes, below), not
   * read at once as it mounts (bind:clientWidth does): read then, a hand of
   * cards coming in had the page laid out again for each engraving, between
   * one's drawing and the next one's read. The first report comes in the
   * frame it is laid out in, before that is painted.
   */
  function sized(node: HTMLElement) {
    return {
      destroy: sizes(node, (rect, size) => {
        w = node.clientWidth;
        h = node.clientHeight;
        box = rect;
        px = size;
        // (Its style is up to date here, after layout: no cost to read.)
        if (!front) {
          z = layoutZoomOf(node) * devicePixelRatio;
          ink = getComputedStyle(node).color;
        }
      }),
    };
  }
  // (custom: a card of its own, the way out of a vein: lib/wayOut.)
  const variant = $derived(custom ?? (find ? findVariant(find) : undefined));
  const plate = $derived(w && h ? engrave(side, w, h, variant) : null);
  /** The shapes the plate's lines stop short of, one path each (overlapping shapes of one path would cancel out). */
  const knockout = $derived(plate?.knockout ? plate.knockout.split(/(?<=Z)(?=M)/) : []);
  /** The plate's strokes, or in front, those that stand in front of the emblem. */
  const strokes = $derived(plate?.strokes.filter((s) => !!s.front === front) ?? []);
  const motif = $derived(strokes.filter((s) => s.motif));
  /** Whether the glint's light travels across the card (the flare's and the dynamite's flare up in place). */
  const travels = $derived(find !== 'flare' && find !== 'dynamite');
  const uid = $props.id();

  const LAYERS: Layer[] = ['glow', 'lines'];
  /** The still layers' svgs, which their prints are pulled from. */
  const svgs: Partial<Record<Layer, SVGSVGElement>> = $state({});
  /** How it's drawn, if it's printed. */
  const at = $derived<At | null>(print && printing.on && !front && plate && box && px && ink ? { w, h, cw: box.width, ch: box.height, z, W: px[0], H: px[1] } : null);
  /** A print pulled since it last looked: look again. */
  let pulls = $state(0);
  /** Each still layer's print at this size, if it's been pulled: shown in place of its svg. */
  const prints = $derived.by(() => {
    void pulls;
    const p = plate;
    return at && p ? { glow: pulled(p, 'glow', at, ink), lines: pulled(p, 'lines', at, ink) } : null;
  });
  /** Whether its hold is over (or a print couldn't be pulled): its svgs are drawn from then on while their prints are pulled. */
  let waited = $state(false);
  $effect(() => {
    if (!hold) return;
    const over = setTimeout(() => (waited = true), hold);
    return () => clearTimeout(over);
  });
  /** Whether its printed layers' svgs wait unseen for their prints: not drawn, which a plate seen for the first time would cost as much as before it was printed. */
  const held = $derived(!!at && hold > 0 && !waited);
  /** Whether it has pulled a print yet: after that, a new size is printed once it holds still. */
  let pulledAny = false;
  $effect(() => {
    // A layer not printed at this size yet is pulled from its svg, as it's drawn.
    if (!at || !plate || !prints) return;
    const [p, now, inked] = [plate, at, ink];
    const due = LAYERS.flatMap((layer) => (!prints[layer] && svgs[layer] ? [[layer, svgs[layer]] as const] : []));
    if (!due.length) return;
    const go = () => {
      for (const [layer, svg] of due) void pull(p, layer, now, inked, svg).then((url) => (url === null ? (waited = true) : pulls++));
    };
    // (Not for every size a window passes through as it's resized.)
    if (!pulledAny) {
      pulledAny = true;
      go();
      return;
    }
    const later = setTimeout(go, 250);
    return () => clearTimeout(later);
  });
</script>

<!-- A glint: the motif again in pale light, seen through a band that runs
     across the card while the drawing inside it runs back, so the light
     moves and the lines stay put (the flare's and the dynamite's flare up
     in place instead). A travelling one is built anew when the card's width
     changes (a phone turned): Safari keeps a running animation's distances
     from when it started, and the band's and the drawing's fell out of
     step, the light's copy of the lines off the lines. -->
{#snippet glint()}
  {#key travels ? Math.round(box?.width ?? w) : 0}
    <span class="glint" class:flicker={find === 'flare'} class:flash={find === 'dynamite'}>
      <span class="through" style:--w="{box?.width ?? w}px">
        <span class="drawing" style:width="{box?.width ?? w}px" style:height="{box?.height ?? h}px">
          <svg viewBox="0 0 {w} {h}">
            {#each motif as { cls, d } (cls)}<path {d} class={cls} />{/each}
          </svg>
        </span>
      </span>
    </span>
  {/key}
{/snippet}

<span class="engraving" class:front data-find={find ?? undefined} use:sized aria-hidden="true">
  {#if plate && front}
    {#if plate.solid}
      <!-- Solid: whatever lies behind (the item, the plate) is hidden, the crystal's body faintly its colour. -->
      <svg class="solid" viewBox="0 0 {w} {h}">
        <path d={plate.solid} class="body" />
        <path d={plate.solid} class="tint" />
      </svg>
    {/if}
    {#each ['glow', 'lines'] as layer (layer)}
      <svg class={layer} viewBox="0 0 {w} {h}">
        {#each strokes as { cls, d } (cls)}<path {d} class={cls} />{/each}
      </svg>
    {/each}
    {#if motif.length}
      {@render glint()}
    {/if}
  {:else if plate}
    {#if plate.window && plate.fade}
      <!-- The card's warm glow, behind the emblem and only inside the window. -->
      <svg class="window" viewBox="0 0 {w} {h}">
        <defs>
          <radialGradient id="{uid}-warm" cx={plate.fade.c[0]} cy={plate.fade.c[1]} r="96" gradientUnits="userSpaceOnUse" gradientTransform="translate({plate.fade.c[0]} {plate.fade.c[1]}) scale(1 1.15) translate({-plate.fade.c[0]} {-plate.fade.c[1]})">
            <stop offset="0" class="warm" style="stop-opacity: 0.5" />
            <stop offset="0.55" class="warm" style="stop-opacity: 0.2" />
            <stop offset="1" class="warm" style="stop-opacity: 0" />
          </radialGradient>
        </defs>
        <path d={plate.window} style:fill="url(#{uid}-warm)" />
      </svg>
    {/if}
    {#each LAYERS as layer (layer)}
      {@const shown = prints?.[layer]}
      <!-- The layer, one element from the first: what moves on it (a find's breath, the way out's swell) and its
           opacity are the print's and the svg's together, never started again as the print comes in. -->
      <span class="layer {layer}">
        {#if shown?.url}
          <img src={shown.url} alt="" />
        {/if}
        <!-- (Printed, only the hairlines its print leaves to it.) -->
        {#if !shown || shown.left.size}
          <svg class:held={held && !shown} viewBox="0 0 {w} {h}" bind:this={svgs[layer]}>
            {#if plate.fade}
              <defs>
                <radialGradient id="{uid}-{layer}-g" cx={plate.fade.c[0]} cy={plate.fade.c[1]} r={plate.fade.r} gradientUnits="userSpaceOnUse">
                  {#if plate.fade.from}<stop offset={plate.fade.from / plate.fade.r} stop-color="#000" />{/if}
                  <stop offset={Math.max(0.35, (plate.fade.from + 22) / plate.fade.r)} stop-color="#fff" />
                  <stop offset="1" stop-color="#000" />
                </radialGradient>
                <mask id="{uid}-{layer}-fade" maskUnits="userSpaceOnUse" x="0" y="0" width={w} height={h}>
                  <rect width={w} height={h} fill="url(#{uid}-{layer}-g)" />
                </mask>
              </defs>
            {/if}
            {#if knockout.length}
              <defs>
                <mask id="{uid}-{layer}-ko" maskUnits="userSpaceOnUse" x={-50} y={-50} width={w + 100} height={h + 100}>
                  <rect x={-50} y={-50} width={w + 100} height={h + 100} fill="#fff" />
                  {#each knockout as d, i (i)}<path {d} class="ko" />{/each}
                </mask>
              </defs>
            {/if}
            <g mask={knockout.length ? `url(#${uid}-${layer}-ko)` : undefined}>
              {#each strokes.filter((s) => !s.motif && (!shown || shown.left.has(leftKey(s.cls, false)))) as { cls, d } (cls)}
                <path {d} class={cls} mask={cls === 'ray' && plate.fade ? `url(#${uid}-${layer}-fade)` : undefined} />
              {/each}
            </g>
            {#if !(plate.gilt && layer === 'lines')}
              {#each motif.filter((s) => !shown || shown.left.has(leftKey(s.cls, true))) as { cls, d } (cls)}
                <path {d} class={cls} />
              {/each}
            {/if}
          </svg>
        {/if}
      </span>
    {/each}
    {#if plate.gilt}
      {@const g = plate.gilt}
      <!-- The lamp's light, breathing round it, under the gilding. -->
      <svg class="lamp" viewBox="0 0 {w} {h}">
        <defs>
          <radialGradient id="{uid}-lamp" cx={g.light.c[0]} cy={g.light.c[1]} r={g.light.r} gradientUnits="userSpaceOnUse">
            <stop offset="0" class="lamp-stop" style="stop-opacity: 0.85" />
            <stop offset="0.4" class="lamp-stop" style="stop-opacity: 0.32" />
            <stop offset="1" class="lamp-stop" style="stop-opacity: 0" />
          </radialGradient>
        </defs>
        <circle cx={g.light.c[0]} cy={g.light.c[1]} r={g.light.r} fill="url(#{uid}-lamp)" />
      </svg>
      <!-- The motif gilded: filled as an item's emblem is, its lines cut in dark over the gold. -->
      <svg class="gilt" viewBox="0 0 {w} {h}">
        <defs>
          <linearGradient id="{uid}-gold" x1="0" y1={g.span[0]} x2="0" y2={g.span[1]} gradientUnits="userSpaceOnUse">
            <stop offset="0" class="gold-hi" />
            <stop offset="0.45" class="gold-mid" />
            <stop offset="1" class="gold-lo" />
          </linearGradient>
          <radialGradient id="{uid}-flame" cx="0.5" cy="0.74" r="0.66">
            <stop offset="0" stop-color="#fffdf4" />
            <stop offset="0.4" stop-color="#ffeaa6" />
            <stop offset="1" stop-color="#ff9c34" />
          </radialGradient>
          <clipPath id="{uid}-body">
            {#each g.parts.filter((x) => x.tone === 'body') as { d }, i (i)}<path {d} />{/each}
          </clipPath>
        </defs>
        {#each g.parts as { d, tone }, i (i)}
          <path {d} class="part {tone}" style:fill={tone === 'flame' ? `url(#${uid}-flame)` : `url(#${uid}-gold)`} />
        {/each}
        {#each motif as { cls, d } (cls)}<path {d} class={cls} />{/each}
        <g class="cut" clip-path="url(#{uid}-body)">
          {#each motif as { cls, d } (cls)}<path {d} class={cls} />{/each}
        </g>
      </svg>
    {:else if motif.length}
      {@render glint()}
    {/if}
  {/if}
</span>

<style>
  .engraving {
    position: absolute;
    inset: 0;
    pointer-events: none;
    color: var(--ink);
  }
  svg,
  img,
  .layer {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  svg {
    overflow: visible;
  }
  /* (Laid out and styled still, as its print is pulled from it; only not drawn.) */
  .held {
    visibility: hidden;
  }
  .warm {
    stop-color: var(--warm);
  }
  path {
    fill: none;
    stroke: currentColor;
    stroke-linecap: butt;
    stroke-linejoin: miter;
    stroke-miterlimit: 12;
  }
  /* Fine, sharp lines: cut, never painted. */
  .main {
    stroke-width: 0.8;
  }
  .thin {
    stroke-width: 0.6;
  }
  .hair {
    stroke-width: 0.4;
  }
  .hatch {
    stroke-width: 0.35;
    stroke-linecap: round;
  }
  /* The spandrels' shading and the glory sit back behind the drawing. */
  .shade {
    stroke-width: 0.3;
    opacity: 0.5;
  }
  .ray {
    stroke-width: 0.35;
    opacity: 0.55;
  }
  .lattice {
    stroke-width: 0.35;
    opacity: 0.55;
  }
  .sign {
    stroke-width: 0.6;
    stroke-linejoin: round;
  }
  .fill {
    fill: currentColor;
    stroke: none;
  }
  .window path {
    stroke: none;
  }
  path.ko {
    fill: #000;
    stroke: none;
  }
  /* The glow: the same strokes, wide and faint, under the lines. */
  .glow {
    opacity: 0.18;
  }
  .glow path {
    stroke-width: 2.4;
  }
  .glow .hair,
  .glow .hatch,
  .glow .shade,
  .glow .ray,
  .glow .lattice {
    stroke-width: 1.2;
  }

  /* What stands in front of the emblem: solid, the card's dark under it, faintly tinted its ink. */
  .solid path {
    stroke: none;
  }
  .solid .body {
    fill: #0f0c0a;
  }
  .solid .tint {
    fill: currentColor;
    opacity: 0.07;
  }

  /* A gilded motif: the item's gold (ChooseCategory's .glyph, or the card's
     --f-glyph colours), lifted off the card by its shadow and glowing warm
     as an emblem does (kindled as it is dealt: ChooseCategory's kindle-gilt). */
  .gilt {
    filter: drop-shadow(0 3px 4px rgba(0, 0, 0, 0.75)) drop-shadow(0 0 10px var(--f-pulse, rgba(224, 138, 68, 0.45)));
  }
  .gilt path.part {
    stroke: none;
  }
  .gilt path.glass {
    opacity: 0.3;
  }
  .gold-hi {
    stop-color: var(--gild-hi, #fbe6b0);
  }
  .gold-mid {
    stop-color: var(--gild-mid, #c9a45c);
  }
  .gold-lo {
    stop-color: var(--gild-lo, #6d4a1c);
  }
  /* Its lines over the gold cut in dark, as an item's details are, the shading lighter. */
  .gilt .cut path {
    stroke: var(--gild-cut, #3a2006);
    opacity: 0.8;
  }
  .gilt .cut .hatch {
    opacity: 0.4;
  }
  .gilt .cut .fill {
    fill: var(--gild-cut, #3a2006);
  }
  /* The lamp's light breathes slowly round it, as a flame's does in still air. */
  .lamp-stop {
    stop-color: var(--f, #ffd47e);
  }
  .lamp {
    animation: lamp 4.4s ease-in-out infinite;
  }
  @keyframes lamp {
    0%,
    100% {
      opacity: 0.6;
    }
    50% {
      opacity: 1;
    }
  }

  /* A find's glow breathes, the vein's slowly, the flare's flickering. */
  [data-find='azurite'] .glow {
    animation: breathe 4.2s ease-in-out infinite;
  }
  [data-find='flare'] .glow {
    animation: flicker 2.3s linear infinite;
  }
  [data-find='dynamite'] .glow {
    animation: smoulder 4.8s ease-out infinite;
  }
  @keyframes smoulder {
    0%,
    100% {
      opacity: 0.14;
    }
    6% {
      opacity: 0.3;
    }
    30% {
      opacity: 0.18;
    }
  }
  @keyframes breathe {
    0%,
    100% {
      opacity: 0.12;
    }
    50% {
      opacity: 0.28;
    }
  }
  @keyframes flicker {
    0%,
    100% {
      opacity: 0.16;
    }
    18% {
      opacity: 0.26;
    }
    30% {
      opacity: 0.2;
    }
    52% {
      opacity: 0.28;
    }
    70% {
      opacity: 0.18;
    }
    84% {
      opacity: 0.28;
    }
  }
  /* The glint: a band a third of the card wide, soft at its edges, crossing
     it every 6.5 s; the drawing inside moves back as far, so it stays put. */
  .glint {
    position: absolute;
    inset: 0;
    overflow: hidden;
    color: #f4f8ff;
  }
  .through {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: calc(var(--w) / 3);
    overflow: hidden;
    -webkit-mask-image: linear-gradient(100deg, transparent, #000 40%, #000 60%, transparent);
    mask-image: linear-gradient(100deg, transparent, #000 40%, #000 60%, transparent);
    animation: band 6.5s cubic-bezier(0.45, 0, 0.55, 1) infinite;
  }
  /* The drawing moves in a span, not as the svg itself: Chrome runs an svg's
     transform on the main thread while the band's runs on the compositor, so
     with the main thread busy (the effects, the backdrop) the two fell out of
     step and the light's copy of the lines slid off the lines. */
  .drawing {
    position: absolute;
    inset: 0 auto auto 0;
    animation: back 6.5s cubic-bezier(0.45, 0, 0.55, 1) infinite;
  }
  .glint path {
    opacity: 0.9;
  }
  /* The band from one band's width left of the card to past its right edge;
     the drawing the same distance back. */
  @keyframes band {
    0% {
      transform: translateX(-100%);
    }
    32%,
    100% {
      transform: translateX(400%);
    }
  }
  @keyframes back {
    0% {
      transform: translateX(calc(var(--w) / 3));
    }
    32%,
    100% {
      transform: translateX(calc(var(--w) / -0.75));
    }
  }
  /* The flare's light doesn't travel: its motif flares up now and then;
     the dynamite's flashes with each swell of its glow. */
  .glint.flicker,
  .glint.flash {
    color: #fff1e0;
    opacity: 0;
    animation: flare-up 3.6s ease-in-out infinite;
  }
  .glint.flash {
    animation: flash 4.8s ease-out infinite;
  }
  @keyframes flash {
    0%,
    100% {
      opacity: 0;
    }
    5% {
      opacity: 0.7;
    }
    22% {
      opacity: 0;
    }
  }
  .glint:is(.flicker, .flash) .through,
  .glint:is(.flicker, .flash) .drawing {
    width: auto;
    right: 0;
    -webkit-mask-image: none;
    mask-image: none;
    animation: none;
    transform: none;
  }
  @keyframes flare-up {
    0%,
    55%,
    100% {
      opacity: 0;
    }
    66% {
      opacity: 0.55;
    }
    72% {
      opacity: 0.3;
    }
    78% {
      opacity: 0.6;
    }
  }
  :global(html[data-still]) .engraving .glint {
    display: none;
  }
  :global(html[data-still]) .engraving :is(.glow, .lamp) {
    animation: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .glint {
      display: none;
    }
    .lamp {
      animation: none;
    }
  }
</style>
