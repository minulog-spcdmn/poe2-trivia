<script lang="ts">
  // A piece of amber held up to the light (lib/amberStone), as a
  // fossil's card holds it (CardEngraving, lib/fossilEngraving), and as the
  // reveal, the codex and the end screen may: its geometry in the px of the
  // box it lies in (`w` x `h`), drawn in parts so what it holds can lie
  // between them.
  //
  // • `body`: the amber, painted (lib/fossilAmber, made in a worker by
  //   lib/amberTexture), and over it the lamp behind it: a soft light that
  //   drifts slowly, as if the lamp were carried, and one the card's tilt
  //   moves (ChooseCategory's `tilt`, by the transform of `.follow`), each a
  //   picture with its opacity dithered (lib/amberTexture's lampTexture;
  //   CLAUDE.md, "No banding"). On a tall face, its light thrown
  //   onto the pedestal under it (`caustic`). Until the paint comes, a
  //   gradient of its colours.
  // • `surface`: what lies on the stone over what it holds: the side away
  //   from the light shaded in lines that follow its round, the polish's
  //   gloss along the side turned to it and a sharp catch of it on the
  //   shoulder, each flake's lit edge, bubbles; a rare's sun spangles
  //   catching the light in turn; and now and then a band of light across
  //   it, as the stone turns, the flakes' edges flashing as it passes.
  // • `whole`: both, and between them `inclusion` drawn dark in the resin
  //   (the back's ammonite); held still, as the back is seen only as it's
  //   dealt.
  //
  // Moves by transform and opacity only, each on its own layer; nothing
  // inside the paint or the svgs animates.
  import { amberTexture, lampTexture } from '../lib/amberTexture';
  import { polyPath, surfaceOf, type Stone } from '../lib/amberStone';
  import type { AmberTier } from '../lib/fossilAmber';
  import type { Stroke } from '../lib/cardEngraving';
  import type { Pt } from '../lib/arcane';

  let {
    stone,
    tier,
    w,
    h,
    z = 2,
    part,
  }: {
    stone: Stone & { caustic?: { c: Pt; rx: number; ry: number }; inclusion?: Stroke[] };
    tier: AmberTier;
    w: number;
    h: number;
    /** The screen's pixels to a px of the box, as it's finally seen: how fine the paint is made (1 to 3). */
    z?: number;
    part: 'body' | 'surface' | 'whole';
  } = $props();

  const body = $derived(part !== 'surface');
  const surface = $derived(part !== 'body');
  const still = $derived(part === 'whole');
  const outline = $derived(polyPath(stone.outline));
  /** The stone's box, a px clear. */
  const box = $derived.by(() => {
    const xs = stone.outline.map((p) => p[0]);
    const ys = stone.outline.map((p) => p[1]);
    const [x0, y0] = [Math.floor(Math.min(...xs)) - 1, Math.floor(Math.min(...ys)) - 1];
    return { x0, y0, x1: Math.ceil(Math.max(...xs)) + 1, y1: Math.ceil(Math.max(...ys)) + 1 };
  });
  /** The paint's fineness, in quarter steps so near sizes share one. */
  const s = $derived(Math.min(3, Math.max(1, Math.round(z * 4) / 4)));
  let url = $state<string | null>(null);
  let lampUrl = $state<string | null>(null);
  $effect(() => {
    if (body) void lampTexture().then((u) => (lampUrl = u));
  });
  let shown = $state(false);
  $effect(() => {
    if (!body) return;
    const job = {
      w: Math.ceil((box.x1 - box.x0) * s),
      h: Math.ceil((box.y1 - box.y0) * s),
      s,
      ox: box.x0,
      oy: box.y0,
      tier,
      outline: stone.outline,
      flakes: stone.flakes,
      folds: stone.folds,
      c: stone.c,
      rx: stone.rx,
      ry: stone.ry,
      lamp: stone.lamp,
      seed: 7,
    };
    let live = true;
    void amberTexture(job).then((u) => {
      if (live) url = u;
    });
    return () => {
      live = false;
    };
  });
  const R = $derived(Math.max(stone.rx, stone.ry));
  const top = $derived(surface ? surfaceOf(stone) : null);
</script>

<span class="amber" class:rare={tier === 'rare'} class:still aria-hidden="true">
  {#if body}
    {#if stone.caustic}
      {@const k = stone.caustic}
      <!-- The light the stone gathers, thrown on the pedestal under it. -->
      <span class="caustic" style:left="{k.c[0] - k.rx}px" style:top="{k.c[1] - k.ry * 2.2}px" style:width="{k.rx * 2}px" style:height="{k.ry * 4.4}px"></span>
    {/if}
    <span class="stone" style:clip-path="path('{outline}')">
      <span class="ground" style:--cx="{stone.lamp[0]}px" style:--cy="{stone.lamp[1]}px" style:--r="{R}px"></span>
      {#if url}
        <img class="paint" class:shown src={url} alt="" style:left="{box.x0}px" style:top="{box.y0}px" style:width="{box.x1 - box.x0}px" style:height="{box.y1 - box.y0}px" onload={() => (shown = true)} />
      {/if}
      {#if lampUrl}
        <img class="lamp drift" src={lampUrl} alt="" style:left="{stone.lamp[0] - R * 0.62}px" style:top="{stone.lamp[1] - R * 0.62}px" style:width="{R * 1.24}px" />
        {#if !still}
          <img class="lamp follow" src={lampUrl} alt="" style:left="{stone.c[0] - R * 0.5}px" style:top="{stone.c[1] - R * 0.5}px" style:width="{R}px" />
        {/if}
      {/if}
    </span>
  {/if}
  {#if stone.inclusion && part === 'whole'}
    <!-- What the resin holds, dark in it, a little lost in its depth. -->
    <svg class="inclusion" viewBox="0 0 {w} {h}" style:clip-path="path('{outline}')">
      {#each stone.inclusion as { d, cls }, i (i)}<path {d} class={cls} />{/each}
    </svg>
  {/if}
  {#if top}
    <svg class="surface" viewBox="0 0 {w} {h}">
      <path d={top.shade} class="shade" />
      <path d={top.gloss} class="gloss" />
      <path d={top.edges} class="edge" />
      <path d={top.catchLight} class="catch-light" />
      {#each top.bubbles as { c, r }, i (i)}
        <circle cx={c[0]} cy={c[1]} r={r} class="bubble" />
        <circle cx={c[0] - r * 0.38} cy={c[1] - r * 0.38} r={Math.max(0.35, r * 0.22)} class="catch" />
      {/each}
    </svg>
    {#if tier === 'rare'}
      {#each top.spangles as { c, len, turn, t }, i (i)}
        <span class="spangle" style:left="{c[0] - len * 0.6}px" style:top="{c[1] - 1.6}px" style:width="{len * 1.2}px" style:--t="{t}s" style:--turn="{turn}deg"></span>
      {/each}
    {/if}
    {#if !still}
      <!-- Now and then a band of light across the stone, as it turns in the lamp's light: its outline,
           its gloss and its flakes' edges again in pale light, seen through a band that runs across
           while the drawing inside it runs back, so the light moves and the lines stay put. -->
      <span class="glint" style:clip-path="path('{outline}')">
        <span class="through" style:left="{box.x0}px" style:top="{box.y0}px" style:height="{box.y1 - box.y0}px" style:--bw="{(box.x1 - box.x0) * 0.42}px" style:--span="{box.x1 - box.x0}px">
          <span class="drawing" style:left="{-box.x0}px" style:top="{-box.y0}px" style:width="{w}px" style:height="{h}px">
            <svg viewBox="0 0 {w} {h}">
              <path d={top.edges} />
              <path d={top.catchLight} />
              <path d={outline} />
              <path d={top.gloss} class="fill" />
            </svg>
          </span>
        </span>
      </span>
    {/if}
  {/if}
</span>

<style>
  .amber {
    position: absolute;
    inset: 0;
    pointer-events: none;
    /* Its palette: the light through it, its resin's dark, its polish. */
    --a-core: var(--fossil-core);
    --a-mid: var(--fossil-mid);
    --a-edge: var(--fossil-edge);
    --a-resin: var(--fossil-resin);
    --a-polish: #fff4d6;
  }
  .amber.rare {
    --a-core: var(--fossil-rare-core);
    --a-mid: var(--fossil-rare-mid);
    --a-edge: var(--fossil-rare-edge);
    --a-resin: var(--fossil-rare-resin);
  }
  .stone,
  svg,
  .glint {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  svg {
    overflow: visible;
  }
  .ground,
  .paint,
  .lamp,
  .caustic,
  .spangle,
  .through,
  .drawing {
    position: absolute;
  }
  /* Until the paint comes: its colours, the lamp's light through the middle, the cognac at its rim. */
  .ground {
    inset: 0;
    background: radial-gradient(circle calc(var(--r) * 1.15) at var(--cx) var(--cy), var(--a-core), var(--a-mid) 40%, var(--a-edge) 72%, var(--a-resin));
  }
  .paint {
    opacity: 0;
    transition: opacity 0.3s;
  }
  .paint.shown {
    opacity: 1;
  }
  /* The lamp behind: a soft light seen through the amber, drifting slowly
     about as if it were carried; it never lies even. */
  .lamp {
    aspect-ratio: 1;
    opacity: 0.4;
    will-change: transform;
  }
  .drift {
    animation: carried 19s ease-in-out infinite alternate;
  }
  @keyframes carried {
    0% {
      transform: translate(-14%, 9%) scale(1);
      opacity: 0.3;
    }
    35% {
      transform: translate(12%, -15%) scale(1.08);
      opacity: 0.42;
    }
    65% {
      transform: translate(20%, 8%) scale(0.94);
      opacity: 0.35;
    }
    100% {
      transform: translate(-6%, 18%) scale(1.04);
      opacity: 0.4;
    }
  }
  /* Moved by the card's tilt (ChooseCategory), easing back when let go. */
  .follow {
    opacity: 0.24;
    transition: transform 0.9s var(--ease-out, ease-out);
  }
  /* Its light on the pedestal: a warm pool, soft at its edge. */
  .caustic {
    border-radius: 50%;
    background: radial-gradient(closest-side, color-mix(in srgb, var(--a-core) 70%, transparent), color-mix(in srgb, var(--a-mid) 30%, transparent) 55%, transparent);
    opacity: 0.55;
  }
  .inclusion {
    color: var(--a-resin);
    opacity: 0.78;
  }
  .inclusion path {
    fill: none;
    stroke: currentColor;
    stroke-width: 0.6;
  }
  .inclusion :is(.hair, .hatch) {
    stroke-width: 0.42;
  }
  .surface path,
  .surface circle {
    fill: none;
  }
  /* The shading on the side away from the light, in the resin's dark. */
  .shade {
    stroke: var(--a-resin);
    stroke-width: 0.42;
    stroke-linecap: round;
    opacity: 0.6;
  }
  .gloss {
    fill: var(--a-polish) !important;
    opacity: 0.22;
  }
  .edge {
    stroke: var(--a-polish);
    stroke-width: 0.3;
    stroke-linecap: round;
    opacity: 0.32;
  }
  .catch-light {
    stroke: var(--a-polish);
    stroke-width: 1.1;
    stroke-linecap: round;
    opacity: 0.7;
  }
  .bubble {
    stroke: var(--a-polish);
    stroke-width: 0.35;
    opacity: 0.5;
  }
  .catch {
    fill: var(--a-polish) !important;
    opacity: 0.8;
  }
  /* A rare's spangles: a flake's lit edge flashing as it catches the
     light, each in its turn, a sliver of pale gold along it. */
  .spangle {
    height: 3.2px;
    rotate: var(--turn);
    border-radius: 50%;
    background: radial-gradient(closest-side, #fffbe8, rgba(255, 232, 160, 0.55) 45%, transparent);
    opacity: 0;
    animation: catch 7.2s ease-out var(--t) infinite;
    will-change: opacity, transform;
  }
  @keyframes catch {
    0%,
    26%,
    100% {
      opacity: 0;
      transform: scaleX(0.4);
    }
    8% {
      opacity: 1;
      transform: scaleX(1);
    }
  }
  /* The band of light: a part of the stone's width, soft at its edges,
     across it once every 8 s; the drawing inside moves back as far. */
  .glint {
    overflow: hidden;
  }
  .through {
    width: var(--bw);
    overflow: hidden;
    -webkit-mask-image: linear-gradient(100deg, transparent, #000 42%, #000 58%, transparent);
    mask-image: linear-gradient(100deg, transparent, #000 42%, #000 58%, transparent);
    animation: band 8s cubic-bezier(0.45, 0, 0.55, 1) 2.2s infinite backwards;
  }
  .drawing {
    animation: back 8s cubic-bezier(0.45, 0, 0.55, 1) 2.2s infinite backwards;
  }
  .drawing path {
    fill: none;
    stroke: #fffbea;
    stroke-width: 0.7;
    opacity: 0.85;
  }
  .drawing .fill {
    fill: #fffbea;
  }
  @keyframes band {
    0% {
      transform: translateX(calc(var(--bw) * -1));
    }
    26%,
    100% {
      transform: translateX(var(--span));
    }
  }
  @keyframes back {
    0% {
      transform: translateX(var(--bw));
    }
    26%,
    100% {
      transform: translateX(calc(var(--span) * -1));
    }
  }
  /* Held still: the spangles lie lit, half as bright as at their flash. */
  .still :is(.drift, .spangle) {
    animation: none;
  }
  .still .spangle,
  :global(html[data-still]) .amber .spangle {
    opacity: 0.5;
    transform: none;
  }
  :global(html[data-still]) .amber :is(.drift, .spangle, .through, .drawing) {
    animation: none;
  }
  :global(html[data-still]) .amber .glint {
    display: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .glint {
      display: none;
    }
    .drift,
    .spangle {
      animation: none;
    }
    .spangle {
      opacity: 0.5;
    }
  }
</style>
