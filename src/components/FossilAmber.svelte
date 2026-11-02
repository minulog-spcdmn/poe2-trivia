<script lang="ts">
  // A fossil's amber on one side of its card (ChooseCategory): the slab held
  // to the lamp, painted by lib/amber.ts for the side's size and density
  // (lib/amberImage.ts, in a worker), its layers laid over each other here.
  // The lamp's light lies under the amber's body, which is multiplied over
  // it, so wherever the light moves the amber colours it, flows and specks
  // and all; the lamp's heart, too bright for the amber to hold, screened
  // over it, moving with it; the bubbles' bright rims, and a rare's sun
  // spangles, each catching the light in its own turn.
  //
  // The light drifts slowly, as a lamp carried behind it would; as the card
  // tilts it swings the other way across the slab, as a lamp deeper than a
  // pane does when the pane turns (ChooseCategory's tiltTo sets the lamp's
  // translate, eased as the tilt is). It kindles as the face turns up in
  // the deal (ChooseCategory's .dealt, at its --face): the light catching
  // behind the dark resin, its heart flaring a moment after and settling.
  // Transform and opacity only, each on a layer of its own. The back (seen
  // only as it's dealt) is one still image.
  //
  // Under the plate's engraving (CardEngraving, the lines cut in the amber).
  import { amberImage } from '../lib/amberImage';
  import { spanglesOf, type AmberJob, type AmberLayer } from '../lib/amber';
  import { fossilSlab } from '../lib/findEngraving';
  import { zoomOf } from '../lib/stage';
  import type { FossilTier } from '../lib/fossils';

  let { side, tier, seed = 1 }: { side: 'face' | 'back'; tier: FossilTier; seed?: number } = $props();

  /** How far in from the side's edge the amber lies: inside the face's dark rim and its ring (box-shadow, 4 and 5px). */
  const INSET = 5;
  let w = $state(0);
  let h = $state(0);
  /** Device px to a layout px, as the side is drawn on screen (not its sharp zoom, which its scale takes back). */
  let s = $state(0);

  function sized(node: HTMLElement) {
    const look = () => {
      const [cw, ch] = [node.clientWidth, node.clientHeight];
      const k = Math.round(zoomOf(node) * devicePixelRatio * 100) / 100;
      if (cw !== w || ch !== h || k !== s) [w, h, s] = [cw, ch, k];
    };
    const ro = new ResizeObserver(look);
    ro.observe(node);
    look();
    return { destroy: () => ro.disconnect() };
  }

  const slab = $derived(w && h ? fossilSlab(side, w, h, tier, seed) : null);
  /** How far past the slab the light reaches, for its drift and swing: a sixth of the side's width. */
  const reach = $derived(Math.round(w * 0.17));
  const inner = $derived([w - 2 * INSET, h - 2 * INSET]);
  /** Each layer's image: what it covers (in the slab's layout px) at what density. */
  const jobs = $derived.by((): Partial<Record<AmberLayer, AmberJob>> => {
    if (!slab || !s) return {};
    const at = (layer: AmberLayer, ox: number, oy: number, cw: number, ch: number, k: number): AmberJob => ({ layer, slab, W: Math.max(1, Math.round(cw * k)), H: Math.max(1, Math.round(ch * k)), s: k, ox, oy });
    const [iw, ih] = inner;
    if (side === 'back') return { flat: at('flat', INSET, INSET, iw, ih, s) };
    // (The light and its heart are soft: at half the density, eased up.)
    const half = Math.max(0.5, s / 2);
    return {
      light: at('light', INSET - reach, INSET - reach, iw + 2 * reach, ih + 2 * reach, half),
      body: at('body', INSET, INSET, iw, ih, s),
      bloom: at('bloom', INSET - reach, INSET - reach, iw + 2 * reach, ih + 2 * reach, half),
      sheen: at('sheen', INSET, INSET, iw, ih, s),
    };
  });
  /** A rare's spangles, each its own small image, placed where it lies. */
  const spangles = $derived(slab && side === 'face' && tier === 'rare' && s ? spanglesOf(slab).map((sp, i) => ({ ...sp, i, box: Math.ceil(sp.r * 2.4) })) : []);

  let urls = $state<Partial<Record<AmberLayer, string>>>({});
  let sparks = $state<string[]>([]);
  $effect(() => {
    const now = jobs;
    let gone = false;
    // The back first: it shows first, as the hand is dealt.
    for (const layer of ['flat', 'body', 'light', 'bloom', 'sheen'] as const) {
      const job = now[layer];
      if (job) void amberImage(job).then((url) => !gone && url && (urls = { ...urls, [layer]: url }));
    }
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
  /** Where a soft layer lies over the slab's inner box, turning and growing about the lamp. */
  const wide = $derived(`left: ${-reach}px; top: ${-reach}px; width: ${inner[0] + 2 * reach}px; height: ${inner[1] + 2 * reach}px` + (slab ? `; transform-origin: ${slab.lamp[0] - INSET + reach}px ${slab.lamp[1] - INSET + reach}px` : ''));
</script>

<span class="amber" class:back={side === 'back'} class:rare={tier === 'rare'} use:sized aria-hidden="true">
  <span class="slab" style:inset="{INSET}px">
    {#if side === 'back'}
      {#if urls.flat}<span class="layer flat"><img src={urls.flat} alt="" /></span>{/if}
    {:else}
      <span class="layer light lamp" style={wide}>{#if urls.light}<img src={urls.light} alt="" />{/if}</span>
      {#if urls.body}<span class="layer body"><img src={urls.body} alt="" /></span>{/if}
      <span class="layer bloom lamp" style={wide}>{#if urls.bloom}<img src={urls.bloom} alt="" />{/if}</span>
      {#if urls.sheen}<span class="layer sheen"><img src={urls.sheen} alt="" /></span>{/if}
      {#each spangles as sp (sp.i)}
        {#if sparks[sp.i]}
          <span
            class="layer spangle"
            style:left="{sp.x - INSET - sp.box / 2}px"
            style:top="{sp.y - INSET - sp.box / 2}px"
            style:width="{sp.box}px"
            style:height="{sp.box}px"
            style:--t="{(sp.i * 2.3) % 7.1}s"><img src={sparks[sp.i]} alt="" /></span
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
  .layer img {
    display: block;
    width: 100%;
    height: 100%;
    animation: shown 0.35s ease-out;
  }
  @keyframes shown {
    from {
      opacity: 0;
    }
  }
  /* The amber takes from the light what it doesn't let through. */
  .body {
    mix-blend-mode: multiply;
  }
  .bloom,
  .sheen,
  .spangle {
    mix-blend-mode: screen;
  }
  /* The lamp drifts behind it, slowly, never quite the same way round. Its
     swing with the tilt is set a frame at a time while the card tilts
     (.tilting); once the pointer's gone, it eases back. (A layer of its own
     from the start, as the kindle and the swing need: a sharp face round it
     is never drawn again for them; docs/category-cards.md.) */
  .lamp {
    transition:
      translate 0.5s var(--ease-out),
      scale 0.5s var(--ease-out),
      opacity 0.35s;
    animation: drift 23s ease-in-out infinite alternate;
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
    animation:
      drift 23s ease-in-out infinite alternate,
      catch-light 1.6s ease-out var(--face, 0ms) backwards;
  }
  :global(.dealt) .bloom {
    animation:
      drift 23s ease-in-out infinite alternate,
      flare 1.6s ease-out var(--face, 0ms) backwards;
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
  @keyframes drift {
    0% {
      transform: translate(-2.2%, 1.2%);
    }
    35% {
      transform: translate(1.6%, -1.8%);
    }
    65% {
      transform: translate(2.4%, 1%);
    }
    100% {
      transform: translate(-1%, 2%);
    }
  }
  /* A rare's spangles: each catches the light in its turn, then lets it go. */
  .spangle {
    opacity: 0.25;
    animation: catch 7.1s ease-in-out var(--t) infinite;
    will-change: opacity;
  }
  @keyframes catch {
    0%,
    100% {
      opacity: 0.25;
    }
    8% {
      opacity: 1;
    }
    20% {
      opacity: 0.3;
    }
  }
  :global(html[data-still]) .amber :is(.lamp, .spangle) {
    animation: none;
  }
</style>
