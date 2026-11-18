<script lang="ts">
  // A fossil's amber on one side of its card (ChooseCategory): the slab held
  // to the lamp, painted by lib/amber.ts for the side's size and density
  // (lib/amberImage.ts, in workers), laid over the lamp here. The lamp's
  // light lies under the amber, which is multiplied over it, so wherever the
  // light moves the amber colours it, flows and all; the lamp's
  // heart, too bright for the amber to hold, is screened over it, moving
  // with it (both CSS gradients, lib/amber's lampLight); a rare's sun
  // spangles each catch the light in their turn.
  //
  // Still while it lies there: as the card tilts the light swings the other
  // way across the slab, as a lamp deeper than a pane does when the pane
  // turns (ChooseCategory's tiltTo sets the lamp's translate, eased as the
  // tilt is), and held nearer as it's hovered. It kindles as the face turns
  // up in the deal (ChooseCategory's .dealt, at its --face): the light
  // catching behind the dark resin, its heart flaring a moment after and
  // settling, a light passing up behind it, the spangles catching it in
  // turn. Nothing moves on a card left alone, so the compositor has nothing
  // to blend again. Transform and opacity only, each on a layer of its own.
  // The back (seen only as it's dealt) is one still image, unlit: no lamp
  // behind it until the face turns up.
  //
  // Under the plate's engraving (CardEngraving, the lines cut in the amber).
  import { amberImage } from '../lib/amberImage';
  import { lampLight, spanglesOf, type AmberJob } from '../lib/amber';
  import { fossilSlab } from '../lib/findEngraving';
  import { layoutZoomOf, zoomOf } from '../lib/stage';
  import type { FossilTier } from '../lib/fossils';

  let { side, tier, seed = 1 }: { side: 'face' | 'back'; tier: FossilTier; seed?: number } = $props();

  /** How far in from the side's edge the amber lies: inside the face's dark rim and its ring (box-shadow, 4 and 5px). */
  const INSET = 5;
  /** Over this many device px, the amber is painted in two strips, one in each worker, the lower overlapping the upper by a px. */
  const STRIPS = 160_000;
  let w = $state(0);
  let h = $state(0);
  /**
   * Device px to a layout px, as the side is drawn: a sharp face's zoom too
   * (lib/stage's layoutZoomOf), so its image lies pixel for pixel in the
   * twice-size drawing and its dither comes through its filter (eased up to
   * it, the grain is smoothed away and the light bands). At most 4, a sharp
   * face's on a dpr 2 screen.
   */
  let s = $state(0);
  /** How much harder the grain is stirred: 5 on a sharp face, whose filter leaves about a third of it (at 3 the dark edges still banded), else 1 (lib/amber's AmberJob). */
  let grain = $state(1);

  function sized(node: HTMLElement) {
    const look = () => {
      const [cw, ch] = [node.clientWidth, node.clientHeight];
      const z = layoutZoomOf(node);
      const k = Math.min(4, Math.round(z * devicePixelRatio * 100) / 100);
      const g = z / zoomOf(node) > 1.5 ? 5 : 1;
      if (cw !== w || ch !== h || k !== s || g !== grain) [w, h, s, grain] = [cw, ch, k, g];
    };
    const ro = new ResizeObserver(look);
    ro.observe(node);
    look();
    return { destroy: () => ro.disconnect() };
  }

  const slab = $derived(w && h ? fossilSlab(side, w, h, tier, seed) : null);
  /** How far past the slab the light reaches, for its swing: a sixth of the side's width. */
  const reach = $derived(Math.round(w * 0.17));
  const inner = $derived([w - 2 * INSET, h - 2 * INSET]);
  /** The amber's image (or its two strips): what each covers, in the slab's layout px, at the density it's shown at. */
  const parts = $derived.by((): { job: AmberJob; top: number; height: number }[] => {
    if (!slab || !s) return [];
    const [iw, ih] = inner;
    const layer = side === 'back' ? 'flat' : 'body';
    const W = Math.max(1, Math.round(iw * s));
    const H = Math.max(1, Math.round(ih * s));
    if (W * H <= STRIPS) return [{ job: { layer, slab, W, H, s, ox: INSET, oy: INSET, grain }, top: 0, height: ih }];
    const H1 = Math.ceil(H / 2);
    return [
      { job: { layer, slab, W, H: H1, s, ox: INSET, oy: INSET, grain }, top: 0, height: H1 / s },
      { job: { layer, slab, W, H: H - H1 + 1, s, ox: INSET, oy: INSET + (H1 - 1) / s, grain }, top: (H1 - 1) / s, height: (H - H1 + 1) / s },
    ];
  });
  /** A rare's spangles, each its own small image, placed where it lies. */
  const spangles = $derived(slab && side === 'face' && tier === 'rare' && s ? spanglesOf(slab).map((sp, i) => ({ ...sp, i, box: Math.ceil(sp.r * 2.4) })) : []);

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
      void Promise.all(list.map((sp) => amberImage({ layer: 'spangle', slab: sl, W: Math.round(sp.box * k), H: Math.round(sp.box * k), s: k, ox: sp.i, oy: 0, grain }))).then((all) => {
        if (!gone) sparks = all.map((u) => u ?? '');
      });
    return () => (gone = true);
  });
  /** The amber is in: its strips all painted. The lamp lights only then (its light alone, unmultiplied, would be grey). */
  const ready = $derived(urls.length > 0 && urls.length === parts.length && urls.every(Boolean));
  /** Where the lamp's layers lie over the slab's inner box, turning and growing about the lamp, and what they show. */
  const wide = $derived(`left: ${-reach}px; top: ${-reach}px; width: ${inner[0] + 2 * reach}px; height: ${inner[1] + 2 * reach}px` + (slab ? `; transform-origin: ${slab.lamp[0] - INSET + reach}px ${slab.lamp[1] - INSET + reach}px` : ''));
  const lamp = $derived(slab ? lampLight(slab, INSET - reach, INSET - reach) : null);
</script>

<span class="amber" class:back={side === 'back'} class:rare={tier === 'rare'} use:sized aria-hidden="true">
  <span class="slab" style:inset="{INSET}px">
    {#if ready}
      {#if side === 'face' && lamp}
        <span class="layer light lamp" style={wide}><span class="fill" style:background={lamp.light}></span></span>
      {/if}
      <span class="layer body" class:flat={side === 'back'}>
        {#each parts as part, i (i)}<img src={urls[i]} alt="" style:top="{part.top}px" style:height="{part.height}px" />{/each}
      </span>
      {#if side === 'face' && lamp}
        <!-- A light held behind it where the pointer is (ChooseCategory's tilt moves it), while the card's hovered. -->
        <span class="layer hand"><span class="spot"></span></span>
        <span class="layer bloom lamp" style={wide}><span class="fill" style:background={lamp.bloom}></span></span>
      {/if}
      {#each spangles as sp (sp.i)}
        {#if sparks[sp.i]}
          <span
            class="layer spangle"
            style:left="{sp.x - INSET - sp.box / 2}px"
            style:top="{sp.y - INSET - sp.box / 2}px"
            style:width="{sp.box}px"
            style:height="{sp.box}px"
            style:--t="{(sp.i * 0.23) % 0.9}s"><img src={sparks[sp.i]} alt="" /></span
          >
        {/if}
      {/each}
    {/if}
  </span>
</span>

<style>
  /* Under all else on the side but its own ground (as the grain, z-index -1): under a row's name, which is laid out in its flow. */
  .amber {
    position: absolute;
    inset: 0;
    z-index: -1;
    pointer-events: none;
  }
  /* The slab: the resin's own dark until its light is painted, its layers blended among themselves only. */
  .slab {
    position: absolute;
    overflow: clip;
    border-radius: 3px;
    isolation: isolate;
    background: #1a0703;
  }
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
  /* (All in at once, as the amber's painted.) */
  .body,
  .fill {
    animation: shown 0.35s ease-out;
  }
  @keyframes shown {
    from {
      opacity: 0;
    }
  }
  /* The amber takes from the light what it doesn't let through (the back's is all of it, unlit). */
  .body:not(.flat) {
    mix-blend-mode: multiply;
  }
  .bloom,
  .spangle {
    mix-blend-mode: screen;
  }
  /* A light held behind the slab where the pointer is, while the card's
     hovered: the amber shines through there, in its own colours, as it does
     where more light comes through it from behind (each colour it lets
     through scaled up, the red first filling to the full and going gold);
     what's caught in it stays dark against it and the lines cut on it stay
     unlit, as both lie over it. Not a glare on the face, which is white
     wherever it falls. Dodged over the amber: a grey's v scales what's
     under it by 1 / (1 - v), and its black leaves it as it is. Its own
     layer, moved by its transform only (ChooseCategory's handAt). */
  .hand {
    overflow: clip;
    opacity: 0;
    transition: opacity 0.35s;
    mix-blend-mode: color-dodge;
  }
  .spot {
    position: absolute;
    top: 0;
    left: 0;
    width: 120%;
    aspect-ratio: 1;
    background: radial-gradient(
      circle closest-side,
      rgb(128 121 106) 0%,
      rgb(122 115 100) 8%,
      rgb(106 99 85) 18%,
      rgb(84 78 66) 30%,
      rgb(60 55 46) 44%,
      rgb(37 34 28) 58%,
      rgb(18 16 13) 74%,
      rgb(6 5 4) 88%,
      rgb(0 0 0) 100%
    );
    /* (At rest, behind the emblem.) */
    transform: translate(-8.3%, -6%);
    will-change: transform;
  }
  :global(.card.mine:not(.down):hover) .hand {
    opacity: 1;
  }
  /* As the face turns up, the same light passes once up behind the slab,
     from below its foot to over the arch, while the lamp catches: the
     amber brightening in its own colours as it goes, the emblem dark
     against it. A find's light runs across in front of its face
     (ChooseCategory's .sheen); a fossil's passes behind. */
  :global(.dealt) .hand {
    animation: pass-by 1.3s linear calc(var(--face, 0ms) + 80ms) backwards;
  }
  :global(.dealt) .spot {
    animation: pass-up 1.3s cubic-bezier(0.45, 0, 0.4, 1) calc(var(--face, 0ms) + 80ms) backwards;
  }
  @keyframes pass-by {
    from,
    to {
      opacity: 0;
    }
    22%,
    70% {
      opacity: 1;
    }
  }
  /* (Its middle from under the slab's foot to over its top; at rest it's behind the emblem.) */
  @keyframes pass-up {
    from {
      translate: 0 95%;
    }
    to {
      translate: 0 -68%;
    }
  }
  /* The lamp: its swing with the tilt is set a frame at a time while the
     card tilts (.tilting); once the pointer's gone, it eases back. (A layer
     of its own from the start, as the kindle and the swing need: a sharp
     face round it is never drawn again for them; docs/category-cards.md.) */
  .lamp {
    transition:
      translate 0.5s var(--ease-out),
      scale 0.5s var(--ease-out),
      opacity 0.35s;
    will-change: transform, opacity;
  }
  :global(.tilting) .lamp {
    transition:
      scale 0.5s var(--ease-out),
      opacity 0.35s;
  }
  .bloom {
    opacity: 0.85;
  }
  :global(.dealt) .light {
    animation: catch-light 1.6s ease-out var(--face, 0ms) backwards;
  }
  :global(.dealt) .bloom {
    animation: flare 1.6s ease-out var(--face, 0ms) backwards;
  }
  @keyframes catch-light {
    from {
      opacity: 0;
    }
    30% {
      opacity: 0.72;
    }
    42% {
      opacity: 0.6;
    }
  }
  @keyframes flare {
    from,
    30% {
      opacity: 0;
    }
    58% {
      opacity: 1;
    }
  }
  /* A rare's spangles: gold discs in the amber, catching the light in turn
     as it kindles, and again, one after another, while the card's held to
     the lamp (hovered); still otherwise. */
  .spangle {
    opacity: 0.55;
    will-change: opacity;
  }
  :global(.dealt) .spangle {
    animation: catch 1.4s ease-in-out calc(var(--face, 0ms) + 0.5s + var(--t)) backwards;
  }
  :global(.card.mine:hover) .spangle {
    animation: catch 1.4s ease-in-out var(--t) infinite;
  }
  @keyframes catch {
    0%,
    100% {
      opacity: 0.55;
    }
    30% {
      opacity: 1;
    }
  }
  /* The battery saver lets the deal's kindle play, and holds the spangles' catching while it's hovered. */
  :global(html[data-saver]) :global(.card.mine:hover) .spangle {
    animation: none;
  }
</style>
