<script lang="ts">
  // Delve: a new zone's name (or the last one standing, or a new best),
  // engraved for a moment on the head of the stage: laid over the kicker's
  // line and the banner, so it covers nothing below them, and never takes a
  // tap. Its geometry is worked out in lib/zoneMark from where the kicker,
  // the heading and its rules lie; it goes inside the head (.head in
  // Game.svelte), which it measures, and fills its box. Engraved as the
  // category cards are (docs/arcane-style.md): gold lines of their weights
  // over a soft glow of themselves, only tinted by the zone, on a ground
  // shaded as if sunk into the plate. It enters as the alchemist's circle
  // does: the ground settles, the outline sweeps out from the middle, the
  // seals are stamped in as their rings sweep round, the name is written
  // in, the sigils are carved, the ornaments run out from the ends and
  // their points of light are set, then the glow swells and breathes.
  import { onMount } from 'svelte';
  import { layout, sealArt, type Head, type Mark, type Variant } from '../lib/zoneMark';
  import { sigilOf } from '../lib/zoneSigils';
  import { ornamentOf } from '../lib/zoneOrnaments';

  let {
    variant = 'nameplate',
    title,
    sigil,
    accent,
    delay = 0,
    onfx,
  }: {
    variant?: Variant;
    /** What it says: the zone's name, or "Last one standing", or "Deeper than ever". */
    title: string;
    /** The zone whose sigil the seals hold and whose ornament runs off its points (a stratum's name, lib/descent). */
    sigil: string;
    /** The stratum's colour (lib/descent accentAt), which tints it all. */
    accent: string;
    /** Seconds before it starts drawing (while the stage it lies on fades in). */
    delay?: number;
    /** Called once it has unfolded, with the element its light should come from. */
    onfx?: (el: HTMLElement) => void;
  } = $props();

  let root: HTMLElement;
  let nameEl: HTMLElement;
  let fxEl = $state<HTMLElement>();
  let m = $state<Mark | null>(null);
  const uid = $props.id();
  const sign = $derived(sigilOf(sigil));
  const orn = $derived(m?.L ? ornamentOf(sigil, m.L, m.s) : null);

  const f = (v: number) => v.toFixed(2);

  /** Where the head's parts lie, relative to it. */
  function measure(): Head | null {
    const head = root.closest('.head');
    const h2 = head?.querySelector('.banner h2');
    if (!head || !h2) return null;
    const box = head.getBoundingClientRect();
    const kicker = head.querySelector('.kicker');
    const rules = head.querySelectorAll('.banner .rule');
    const hb = h2.getBoundingClientRect();
    const size = parseFloat(getComputedStyle(h2).fontSize) || 24;
    // The kicker's first line (it may wrap in a group run).
    const kb = kicker?.getBoundingClientRect();
    const line = kicker ? parseFloat(getComputedStyle(kicker).lineHeight) || 17 : 17;
    const ky = kb ? kb.top - box.top + Math.min(kb.height, line) / 2 : hb.top - box.top - 8;
    // The heading's text is centred in its box; its capitals start about a sixth of the size below the em box.
    const capTop = hb.top - box.top + (hb.height - size) / 2 + size * 0.16;
    const by = hb.top - box.top + hb.height / 2;
    const l = rules[0]?.getBoundingClientRect();
    const r = rules[1]?.getBoundingClientRect();
    const textW = Math.min(hb.width, h2.scrollWidth);
    const cx = hb.left - box.left + hb.width / 2;
    return {
      w: box.width,
      h: box.height,
      ky,
      capTop,
      by,
      hx0: cx - textW / 2,
      hx1: cx + textW / 2,
      rl0: l ? l.left - box.left : 0,
      rr1: r ? r.right - box.left : box.width,
      nameW: nameEl.offsetWidth,
      nameH: nameEl.offsetHeight,
    };
  }

  onMount(() => {
    const update = () => {
      const head = measure();
      if (head) m = layout(variant, head);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(root.closest('.head') ?? root);
    ro.observe(nameEl);
    const t = setTimeout(() => fxEl && onfx?.(fxEl), 500 + delay * 1000);
    return () => {
      ro.disconnect();
      clearTimeout(t);
    };
  });

</script>

<!-- A seal, pressed in: a dark well, a ring and a hair inside it, the band
     between them shaded on its far side; a fine one also rings the sigil in
     a glory of rays. The glow copy has only its rings. -->
{#snippet seal(c: [number, number], r: number, delay: number, fine: boolean, glow: boolean)}
  {@const art = sealArt(r, fine)}
  <g transform="translate({f(c[0])} {f(c[1])})"><g class="seal" style:--d="{delay}s">
    {#if !glow}<circle r={art.outer + 0.5} class="well" />{/if}
    <circle r={art.outer} class="main" class:draw={!glow} pathLength="100" style:--t="0.5s" />
    <circle r={art.inner} class="hair" class:draw={!glow} pathLength="100" style:--t="0.5s" />
    {#if art.core}<circle r={art.core} class="thin" class:draw={!glow} pathLength="100" style:--t="0.45s" />{/if}
    {#if !glow}
      <path d={art.shadow} class="hatch dim carve" />
      {#if art.rays}<path d={art.rays} class="ray carve" />{/if}
      <g class="sign carve" transform="scale({f(art.sigilScale)})">
        {#if sign.shade}<path d={sign.shade} class="s-shade" />{/if}
        <path d={sign.fine} class="s-fine" />
        <path d={sign.lines} />
      </g>
    {/if}
  </g></g>
{/snippet}

<!-- The zone's ornament off each end, the pen running outward once the outline has reached it. -->
{#snippet ornament(glow: boolean)}
  {#if orn && m}
    {#each m.ends as e, j (j)}
      <g transform="translate({f(e.at[0])} {f(e.at[1])}) scale({-e.dir} 1)">
        {#each orn.strokes as o, i (i)}
          {#if !glow}
            <path d={o.d} class="draw orn {o.kind}" style:--d="{(0.66 + o.at * 0.5).toFixed(3)}s" style:--t="0.34s" pathLength="100" />
          {:else if o.kind !== 'hatch'}
            <path d={o.d} class="orn {o.kind}" />
          {/if}
        {/each}
        {#each orn.lights as l, i (i)}
          <circle cx={f(l.c[0])} cy={f(l.c[1])} r={glow ? l.r * 3 : l.r} class="light" style:--d="{(0.9 + l.at * 0.5).toFixed(3)}s" />
        {/each}
      </g>
    {/each}
  {/if}
{/snippet}

<div class="zm v-{variant}" bind:this={root} style:--accent={accent} style:--z="{delay}s">
  {#if m}
    {#if m.ground}
      <!-- The ground: dark metal sunk into the plate, lit under its upper edge and falling to black. -->
      <svg class="art ground" aria-hidden="true">
        <defs>
          <linearGradient id="{uid}-g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" class="g0" />
            <stop offset="0.42" class="g1" />
            <stop offset="1" class="g2" />
          </linearGradient>
        </defs>
        <path d={m.ground} fill="url(#{uid}-g)" />
      </svg>
    {/if}
    {#if m.shade}
      <div
        class="pool"
        style:left="{m.shade.cx - m.shade.rx}px"
        style:top="{m.shade.cy - m.shade.ry}px"
        style:width="{2 * m.shade.rx}px"
        style:height="{2 * m.shade.ry}px"
      ></div>
    {/if}
    <!-- The lines twice, as on the circle: a soft, wide copy for the glow, and the lines. -->
    <svg class="art glow" aria-hidden="true">
      {#each m.glow as g, i (i)}<path d={g.d} class={g.kind} />{/each}
      {#each m.seals as s, i (i)}{@render seal(s.c, s.r, s.delay, !!s.fine, true)}{/each}
      {@render ornament(true)}
    </svg>
    <svg class="art lines" aria-hidden="true">
      {#each m.strokes as s, i (i)}
        <path d={s.d} class="draw {s.kind}" style:--d="{s.delay.toFixed(3)}s" style:--t="{s.t.toFixed(3)}s" pathLength="100" />
      {/each}
      {#each m.seals as s, i (i)}{@render seal(s.c, s.r, s.delay, !!s.fine, false)}{/each}
      {@render ornament(false)}
    </svg>
    <div class="fx" bind:this={fxEl} style:left="{m.box.x}px" style:top="{m.box.y}px" style:width="{m.box.w}px" style:height="{m.box.h}px"></div>
  {/if}
  <span class="name" class:set={!!m} bind:this={nameEl} style:left="{m ? m.name[0] : 0}px" style:top="{m ? m.name[1] : 0}px">{title}</span>
</div>

<style>
  .zm {
    position: absolute;
    inset: 0;
    z-index: 2;
    pointer-events: none;
    /* Gold engraving, only tinted by the zone (as the circle's states tint
       it); the zone's colour shows most in the glow and the points of light. */
    --ink: color-mix(in srgb, var(--accent) 22%, #d6a65c);
    --ink-hi: color-mix(in srgb, var(--accent) 26%, #f3dfae);
    --glow-c: color-mix(in srgb, var(--accent) 60%, #d9a45a);
  }
  .art {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  path,
  circle {
    fill: none;
    stroke: var(--ink);
    stroke-linecap: butt;
    stroke-linejoin: miter;
    stroke-miterlimit: 12;
  }
  /* Fine, sharp lines: cut, never painted (the cards' weights). */
  .main {
    stroke-width: 0.75;
  }
  .thin {
    stroke-width: 0.55;
  }
  .hair {
    stroke-width: 0.4;
  }
  .hatch {
    stroke-width: 0.32;
    stroke-linecap: round;
  }
  .dim {
    opacity: 0.6;
  }
  /* The shadow under the panel's lip sits back. */
  .shade {
    stroke-width: 0.32;
    opacity: 0.55;
  }
  .ray {
    stroke-width: 0.3;
    opacity: 0.6;
  }
  /* On a plain screen the glory's rays would blur into a haze: fainter there. */
  @media (max-resolution: 1.5dppx) {
    .ray {
      opacity: 0.35;
    }
  }
  .orn {
    stroke-linejoin: round;
  }
  /* The ornaments stand on the backdrop, not on the plate: a touch heavier, so they hold. */
  .orn.main {
    stroke-width: 0.7;
  }
  .orn.hair {
    stroke-width: 0.48;
  }
  .orn.hatch {
    stroke-width: 0.36;
  }
  /* A crack's glow, a flame's ridge: the line at its hottest. */
  .ember {
    stroke: var(--ink-hi);
    stroke-width: 0.5;
    stroke-linejoin: round;
  }
  .light {
    fill: var(--ink-hi);
    stroke: none;
    animation: carve 0.5s calc(var(--z) + var(--d)) ease-out both;
  }
  .well {
    fill: color-mix(in srgb, var(--accent) 5%, #0d0907);
    stroke: none;
  }
  .sign path {
    stroke: var(--ink-hi);
    stroke-width: 0.55px;
    vector-effect: non-scaling-stroke;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .sign .s-fine {
    stroke-width: 0.38px;
  }
  .sign .s-shade {
    stroke: var(--ink);
    stroke-width: 0.3px;
  }

  .ground {
    filter: drop-shadow(0 1.5px 3px rgba(0, 0, 0, 0.85));
    animation: ground 0.45s var(--z) ease-out both;
  }
  .g0 {
    stop-color: color-mix(in srgb, var(--accent) 7%, #2a1f17);
  }
  .g1 {
    stop-color: #18110c;
  }
  .g2 {
    stop-color: #0b0807;
  }
  /* Without a plate (the seals), a soft pool of shadow under the name. */
  .pool {
    position: absolute;
    border-radius: 50%;
    background: radial-gradient(closest-side, rgba(8, 6, 5, 0.9), rgba(8, 6, 5, 0.75) 55%, transparent);
    animation: ground 0.45s var(--z) ease-out both;
  }
  .fx {
    position: absolute;
  }

  .name {
    position: absolute;
    translate: -50% -50%;
    visibility: hidden;
    white-space: nowrap;
    font-family: var(--font-display);
    font-weight: 900;
    font-size: clamp(1rem, 1.6vw + 0.5rem, 1.22rem);
    line-height: 1.15;
    letter-spacing: 0.04em;
    color: color-mix(in srgb, var(--accent) 18%, #f1dca6);
    text-shadow:
      0 1px 2px rgba(0, 0, 0, 0.95),
      0 0 9px color-mix(in srgb, var(--accent) 22%, transparent);
  }
  .name.set {
    visibility: visible;
    /* Written in from the left, the ink's edge soft. */
    mask-image: linear-gradient(90deg, #000 40%, transparent 60%);
    mask-size: 260% 100%;
    animation: write 0.75s calc(var(--z) + 0.4s) cubic-bezier(0.4, 0, 0.3, 1) both;
  }

  /* The glow: the same lines, wide and faint, swelling once they are drawn,
     then breathing (on its own layer, so nothing repaints). */
  .glow {
    opacity: 0.22;
    animation:
      glow-in 1.2s calc(var(--z) + 1.25s) ease-out both,
      breathe 6s calc(var(--z) + 2.45s) ease-in-out infinite alternate;
  }
  .glow path,
  .glow circle {
    stroke: var(--glow-c);
    stroke-width: 2;
  }
  .glow .hair,
  .glow .thin {
    stroke-width: 1.1;
  }
  .glow .ember {
    stroke-width: 2.6;
  }
  .glow .light {
    fill: var(--glow-c);
    stroke: none;
  }

  .draw {
    stroke-dasharray: 100;
    animation: draw var(--t, 0.6s) calc(var(--z) + var(--d, 0s)) linear both;
  }
  .hatch.draw,
  .shade.draw {
    animation-timing-function: ease-out;
  }
  /* Rings sweep round as the seal is pressed in. */
  .seal .draw {
    animation-timing-function: cubic-bezier(0.55, 0, 0.25, 1);
  }
  /* A circle's drawing dash has ends though the circle has none: round
     caps close the seam where it starts and stops. */
  .seal circle {
    stroke-linecap: round;
  }
  .seal {
    transform-box: fill-box;
    transform-origin: center;
    animation: stamp 0.5s calc(var(--z) + var(--d)) var(--ease-out) both;
  }
  .seal .carve {
    animation: carve 0.5s calc(var(--z) + var(--d) + 0.3s) ease-out both;
  }

  @keyframes draw {
    from {
      stroke-dashoffset: 100;
    }
  }
  @keyframes ground {
    from {
      opacity: 0;
    }
  }
  @keyframes write {
    from {
      mask-position: 100% 0;
    }
    to {
      mask-position: 0 0;
    }
  }
  @keyframes stamp {
    from {
      opacity: 0;
      transform: scale(1.5);
    }
  }
  @keyframes carve {
    from {
      opacity: 0;
    }
  }
  @keyframes glow-in {
    from {
      opacity: 0;
    }
    55% {
      opacity: 0.4;
    }
    to {
      opacity: 0.28;
    }
  }
  @keyframes breathe {
    from {
      opacity: 0.28;
    }
    to {
      opacity: 0.1;
    }
  }

  /* Effects off: no drawing, no breathing; it simply fades in and out (Game.svelte). */
  :global(html[data-still]) .zm * {
    animation: none !important;
  }
  :global(html[data-still]) .name.set {
    mask-image: none;
  }
</style>
