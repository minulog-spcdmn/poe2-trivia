<script lang="ts">
  // A fossil's question (Delve): the item's stage, or a picture's, set in the
  // amber of the card it was picked from, its lamp turned low (lib/stageAmber.ts).
  // Built as the card's amber is (FossilAmber.svelte): the slab painted for
  // its box's size and density (lib/amberImage.ts, in workers) multiplied
  // over the lamp's light, the lamp's heart screened over it, a rare's sun
  // spangles; then the shade that turns the lamp low, or out (`lamp`: a wrong
  // answer's fades in over 0.9 s). Under the circle and the item, which stay
  // as they are. Nothing moves while the question is up, so nothing is drawn
  // again. A right answer's moment (lib/fossilFlight.ts) takes a copy of the
  // one marked `moment` and lights it; `ghost` is one only for that (over the
  // pictures, each of which has its own), never shown here.
  import { amberImage } from '../lib/amberImage';
  import { lampLight, spanglesOf, type AmberJob } from '../lib/amber';
  import { stageShade, stageSlab, type StageLamp } from '../lib/stageAmber';
  import { layoutZoomOf } from '../lib/stage';
  import type { FossilTier } from '../lib/fossils';

  let {
    tier,
    seed,
    lamp = 'low',
    circle = true,
    moment = false,
    ghost = false,
  }: { tier: FossilTier; seed: number; lamp?: StageLamp; circle?: boolean; moment?: boolean; ghost?: boolean } = $props();

  /** Over this many device px, the amber is painted in two strips, one in each worker (as the card's). */
  const STRIPS = 160_000;
  /**
   * How much harder than a card's its dither is stirred (lib/amber's AmberJob
   * `grain`): the shade multiplied over it turns its dark ends down to a third
   * of the card's, and the dither with them, so a card's would no longer reach
   * a level there and the resin would band (CLAUDE.md, "No banding").
   */
  const GRAIN = 2.5;
  let w = $state(0);
  let h = $state(0);
  /** Device px to a layout px, as the stage is drawn (its zoom and the screen's), at most 4. */
  let s = $state(0);

  function sized(node: HTMLElement) {
    const look = () => {
      const [cw, ch] = [node.clientWidth, node.clientHeight];
      const k = Math.min(4, Math.round(layoutZoomOf(node) * devicePixelRatio * 100) / 100);
      if (cw !== w || ch !== h || k !== s) [w, h, s] = [cw, ch, k];
    };
    const ro = new ResizeObserver(look);
    ro.observe(node);
    look();
    return { destroy: () => ro.disconnect() };
  }

  const slab = $derived(w && h ? stageSlab(w, h, tier, seed, circle) : null);
  /** How far past the slab the lamp's layers reach (they grow as the moment lights it). */
  const reach = $derived(Math.round(Math.max(w, h) * 0.2));
  const parts = $derived.by((): { job: AmberJob; top: number; height: number }[] => {
    if (!slab || !s) return [];
    const W = Math.max(1, Math.round(w * s));
    const H = Math.max(1, Math.round(h * s));
    if (W * H <= STRIPS) return [{ job: { layer: 'body', slab, W, H, s, ox: 0, oy: 0, grain: GRAIN }, top: 0, height: h }];
    const H1 = Math.ceil(H / 2);
    return [
      { job: { layer: 'body', slab, W, H: H1, s, ox: 0, oy: 0, grain: GRAIN }, top: 0, height: H1 / s },
      { job: { layer: 'body', slab, W, H: H - H1 + 1, s, ox: 0, oy: (H1 - 1) / s, grain: GRAIN }, top: (H1 - 1) / s, height: (H - H1 + 1) / s },
    ];
  });
  const spangles = $derived(slab && tier === 'rare' && s ? spanglesOf(slab).map((sp, i) => ({ ...sp, i, box: Math.ceil(sp.r * 2.4) })) : []);

  let urls = $state<(string | null)[]>([]);
  let sparks = $state<string[]>([]);
  $effect(() => {
    const now = parts;
    let gone = false;
    void Promise.all(now.map((p) => amberImage(p.job))).then((all) => {
      if (!gone) urls = all;
    });
    return () => (gone = true);
  });
  $effect(() => {
    const list = spangles;
    const sl = slab;
    const k = s;
    let gone = false;
    if (sl)
      void Promise.all(list.map((sp) => amberImage({ layer: 'spangle', slab: sl, W: Math.round(sp.box * k), H: Math.round(sp.box * k), s: k, ox: sp.i, oy: 0 }))).then((all) => {
        if (!gone) sparks = all.map((u) => u ?? '');
      });
    return () => (gone = true);
  });
  const ready = $derived(urls.length > 0 && urls.length === parts.length && urls.every(Boolean));
  const wide = $derived(`left: ${-reach}px; top: ${-reach}px; width: ${w + 2 * reach}px; height: ${h + 2 * reach}px` + (slab ? `; transform-origin: ${slab.lamp[0] + reach}px ${slab.lamp[1] + reach}px` : ''));
  const light = $derived(slab ? lampLight(slab, -reach, -reach) : null);
</script>

<span class="stage-amber" class:moment class:ghost class:rare={tier === 'rare'} class:out={lamp === 'out'} use:sized aria-hidden="true">
  <span class="slab">
    {#if ready && light && slab}
      <span class="lit">
      <span class="layer light lamp" style={wide}><span class="fill" style:background={light.light}></span></span>
      <span class="layer body">
        {#each parts as part, i (i)}<img src={urls[i]} alt="" style:top="{part.top}px" style:height="{part.height}px" />{/each}
      </span>
      <span class="layer bloom lamp" style={wide}><span class="fill" style:background={light.bloom}></span></span>
      {#each spangles as sp (sp.i)}
        {#if sparks[sp.i]}
          <span class="layer spangle" style:left="{sp.x - sp.box / 2}px" style:top="{sp.y - sp.box / 2}px" style:width="{sp.box}px" style:height="{sp.box}px" style:--t="{(sp.i * 0.11) % 0.5}s"
            ><img src={sparks[sp.i]} alt="" /></span
          >
        {/if}
      {/each}
      <span class="layer shade low" style:--shade={stageShade(slab, 'low', tier === 'rare')}></span>
      <span class="layer shade out" style:--shade={stageShade(slab, 'out', tier === 'rare')}></span>
      </span>
    {/if}
  </span>
</span>

<style>
  /* The stage's ground: over its own (and the backdrop's fill), under the circle and the item. */
  .stage-amber {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  /* A picture's: under its picture, its number and its caption (the tile isolates its own). */
  :global(.tile) > .stage-amber {
    z-index: -1;
  }
  .ghost {
    visibility: hidden;
  }
  .ghost .lit {
    display: none;
  }
  /* The resin's own dark until its light is painted; its layers blended among themselves only. */
  .slab {
    position: absolute;
    inset: 0;
    overflow: clip;
    isolation: isolate;
    background: #1a0703;
  }
  .lit,
  .layer {
    position: absolute;
    inset: 0;
  }
  .body img {
    position: absolute;
    left: 0;
    display: block;
    width: 100%;
  }
  .fill {
    position: absolute;
    inset: 0;
  }
  .spangle img {
    display: block;
    width: 100%;
    height: 100%;
  }
  /* (All in at once, as it's painted: the lamp catching behind it. A copy the moment lights comes in as it says.) */
  .lit {
    animation: shown 0.6s ease-out;
  }
  :global(.fr-slab) .lit {
    animation: none;
  }
  @keyframes shown {
    from {
      opacity: 0;
    }
  }
  .body {
    mix-blend-mode: multiply;
  }
  .bloom,
  .spangle {
    mix-blend-mode: screen;
  }
  .bloom {
    opacity: 0.85;
  }
  .spangle {
    opacity: 0.55;
  }
  /* The lamp turned low: what still comes through, multiplied over it, the dither over that (app.css, --dither). */
  .shade {
    background: var(--dither), var(--shade);
    image-rendering: pixelated;
    mix-blend-mode: multiply;
  }
  /* Gone out, the fossil lost: fading in in its place. */
  .shade.out {
    opacity: 0;
    transition: opacity 0.9s ease-in;
  }
  .out .shade.out {
    opacity: 1;
  }
</style>
