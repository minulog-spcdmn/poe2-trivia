<script lang="ts">
  // One of Delve's finds as a small engraving (lib/inventoryArt.ts): a gold
  // rim round faces tinted by what it is (azurite blue, a flare's ember, the
  // red of dynamite), edges and one-sided hatching cut into them, and a soft
  // glow of its colour under the lines. Sized by `--h` (its height), or,
  // inside another SVG, placed by `place` (its top left and height there).
  import { GLYPHS, WARD_CRACK, type GlyphKind } from '../lib/inventoryArt';

  /** `piece`: only one side of a ward's crack (a shattering ward's pieces), its broken edge cut bright. */
  let { kind, piece, place }: { kind: GlyphKind; piece?: 'left' | 'right'; place?: { x: number; y: number; h: number } } = $props();
  const g = $derived(GLYPHS[kind]);
  const uid = $props.id();
</script>

<svg
  class="glyph {kind}"
  class:placed={!!place}
  viewBox={g.box}
  x={place?.x}
  y={place?.y}
  width={place ? place.h * g.aspect : undefined}
  height={place?.h}
  style:--aspect={g.aspect}
  aria-hidden="true"
>
  {#if piece}
    <clipPath id="{uid}-piece"><path d={WARD_CRACK[piece]} /></clipPath>
  {/if}
  <g clip-path={piece ? `url(#${uid}-piece)` : undefined}>
    {#each g.faces as face, i (i)}
      <path class="face {face.tone}" d={face.d} />
    {/each}
    <path class="hatch" d={g.hatch} />
    <path class="edges" d={g.edges} />
    <path class="catch" d={g.catch} />
    <path class="rim" d={g.rim} />
    {#if piece}<path class="crack" d={WARD_CRACK.line} />{/if}
  </g>
</svg>

<style>
  .glyph:not(.placed) {
    display: block;
    height: var(--h, 12px);
    width: calc(var(--h, 12px) * var(--aspect));
  }
  .glyph {
    overflow: visible;
    /* Azurite: deep in shadow, bright where it faces you. */
    --dark: #0f2f70;
    --mid: #2a63c4;
    --lit: #6fb4ff;
    --edge: rgba(214, 236, 255, 0.55);
    --shade: rgba(4, 12, 34, 0.9);
    --catch: #eef8ff;
    --glow: rgba(70, 140, 255, 0.55);
    filter: drop-shadow(0 0 1.5px var(--glow)) drop-shadow(0 0 0.5px rgba(0, 0, 0, 0.9));
  }
  /* A shard is a broken piece: paler, as light leaks through the break. */
  .shard {
    --dark: #173a78;
    --mid: #3270c8;
    --lit: #86c2ff;
  }
  .flare {
    --dark: #6e2406;
    --mid: #a4501a;
    --lit: #ffe2b0;
    --edge: rgba(255, 200, 120, 0.85);
    --shade: rgba(36, 10, 2, 0.9);
    --catch: #ffecc8;
    --glow: rgba(255, 140, 50, 0.55);
  }
  .dynamite {
    --dark: #4a0f08;
    --mid: #8e2414;
    --lit: #c8402a;
    --edge: rgba(241, 217, 155, 0.75);
    --shade: rgba(30, 4, 2, 0.9);
    --catch: #ffd2b8;
    --glow: rgba(255, 90, 50, 0.45);
  }
  path {
    vector-effect: non-scaling-stroke;
  }
  .face {
    stroke: none;
  }
  .face.dark {
    fill: var(--dark);
  }
  .face.mid {
    fill: var(--mid);
  }
  .face.lit {
    fill: var(--lit);
  }
  .hatch {
    fill: none;
    stroke: var(--shade);
    stroke-width: 0.4px;
    stroke-linecap: round;
  }
  .edges {
    fill: none;
    stroke: var(--edge);
    stroke-width: 0.45px;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .catch {
    fill: none;
    stroke: var(--catch);
    stroke-width: 0.55px;
    stroke-linecap: round;
    opacity: 0.85;
  }
  .crack {
    fill: none;
    stroke: var(--catch);
    stroke-width: 0.7px;
    stroke-linejoin: miter;
  }
  .rim {
    fill: none;
    stroke: #c9a45c;
    stroke-width: 0.8px;
    stroke-linejoin: miter;
    stroke-miterlimit: 12;
  }
</style>
