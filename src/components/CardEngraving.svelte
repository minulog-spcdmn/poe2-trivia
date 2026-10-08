<script lang="ts">
  // One side of a category card, engraved (see lib/cardEngraving): drawn
  // for the card's size as it is laid out, the lines over a soft glow of
  // themselves, the glory's rays fading out from its centre. It stands still.
  //
  // Delve's finds (lib/findEngraving): `find` engraves a find's motif into
  // the plate, whose own lines stop short of it. A find's glow breathes,
  // quicker than the circle's, and now and then light runs over its motif
  // or flares up in it: transform and opacity only.
  import { engrave } from '../lib/cardEngraving';
  import { findVariant } from '../lib/findEngraving';
  import type { FindKind } from '../lib/delve';

  let { side, find = null }: { side: 'face' | 'back'; find?: FindKind | null } = $props();
  let w = $state(0);
  let h = $state(0);
  const variant = $derived(find ? findVariant(find) : undefined);
  const plate = $derived(w && h ? engrave(side, w, h, variant) : null);
  /** The shapes the plate's lines stop short of, one path each (overlapping shapes of one path would cancel out). */
  const knockout = $derived(plate?.knockout ? plate.knockout.split(/(?<=Z)(?=M)/) : []);
  const motif = $derived(plate?.strokes.filter((s) => s.motif) ?? []);
  const uid = $props.id();
</script>

<span class="engraving" data-find={find ?? undefined} bind:clientWidth={w} bind:clientHeight={h} aria-hidden="true">
  {#if plate}
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
    {#each ['glow', 'lines'] as layer (layer)}
      <svg class={layer} viewBox="0 0 {w} {h}">
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
          {#each plate.strokes.filter((s) => !s.motif) as { cls, d } (cls)}
            <path {d} class={cls} mask={cls === 'ray' && plate.fade ? `url(#${uid}-${layer}-fade)` : undefined} />
          {/each}
        </g>
        {#each motif as { cls, d } (cls)}
          <path {d} class={cls} />
        {/each}
      </svg>
    {/each}
    {#if motif.length}
      <!-- A glint: the motif again in pale light, seen through a band that
           runs across the card while the drawing inside it runs back, so the
           light moves and the lines stay put. -->
      <span class="glint" class:flicker={find === 'flare'} class:flash={find === 'dynamite'}>
        <span class="through" style:--w="{w}px">
          <svg viewBox="0 0 {w} {h}" style:width="{w}px" style:height="{h}px">
            {#each motif as { cls, d } (cls)}<path {d} class={cls} />{/each}
          </svg>
        </span>
      </span>
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
  svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
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
  .through svg {
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
  .glint:is(.flicker, .flash) .through svg {
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
  :global(html[data-still]) .engraving .glow {
    animation: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .glint {
      display: none;
    }
  }
</style>
