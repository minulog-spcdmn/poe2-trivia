<script lang="ts">
  // One side of a category card, engraved (see lib/cardEngraving): drawn
  // for the card's size as it is laid out, the lines over a soft glow of
  // themselves, the glory's rays fading out from its centre. It stands still.
  import { engrave } from '../lib/cardEngraving';

  let { side }: { side: 'face' | 'back' } = $props();
  let w = $state(0);
  let h = $state(0);
  const plate = $derived(w && h ? engrave(side, w, h) : null);
  const uid = $props.id();
</script>

<span class="engraving" bind:clientWidth={w} bind:clientHeight={h} aria-hidden="true">
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
        {#each plate.strokes as { cls, d } (cls)}
          <path {d} class={cls} mask={cls === 'ray' && plate.fade ? `url(#${uid}-${layer}-fade)` : undefined} />
        {/each}
      </svg>
    {/each}
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
    opacity: 0.75;
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
</style>
