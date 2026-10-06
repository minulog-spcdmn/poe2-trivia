<script lang="ts">
  // Delve: a new zone's name (or the last one standing, or a new best),
  // engraved for a moment on the head of the stage: laid over the kicker's
  // line and the banner, so it covers nothing below them, and never takes a
  // tap. Its geometry is worked out in lib/zoneMark from where the kicker,
  // the heading and its rules lie; it goes inside the head (.head in
  // Game.svelte), which it measures, and fills its box. Drawn as the
  // alchemist's circle is (docs/arcane-style.md): the pen sweeps out from
  // the middle, the seals are stamped in, the name is written in, the glow
  // swells and breathes.
  import { onMount } from 'svelte';
  import { layout, sealArt, type Head, type Mark, type Variant } from '../lib/zoneMark';
  import { sigilOf } from '../lib/zoneSigils';
  import { ornamentOf } from '../lib/zoneOrnaments';

  let {
    variant = 'ribbon',
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

  const polygon = (pts: [number, number][], x: number, y: number) => `polygon(${pts.map(([px, py]) => `${f(px - x)}px ${f(py - y)}px`).join(', ')})`;
  const plateBox = $derived.by(() => {
    if (!m?.plate) return null;
    const xs = m.plate.map((p) => p[0]);
    const ys = m.plate.map((p) => p[1]);
    const [x, y] = [Math.min(...xs), Math.min(...ys)];
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y, clip: polygon(m.plate, x, y) };
  });
</script>

<!-- A seal, pressed in: a dark well, a double ring, fine rays round the sigil, the sigil. -->
{#snippet seal(c: [number, number], r: number, delay: number, glow: boolean)}
  {@const art = sealArt(r)}
  <g transform="translate({f(c[0])} {f(c[1])})"><g class="seal" style:--d="{delay}s">
    {#if !glow}<circle r={art.outer + 0.6} class="well" />{/if}
    <circle r={art.outer} class="main" />
    <circle r={art.inner} class="hair" />
    {#if !glow}
      {#if art.rays}<path d={art.rays} class="ray" />{/if}
      <g class="sign" transform="scale({f(art.sigilScale)})">
        <path d={sign.lines} />
        <path d={sign.fine} class="fine" />
      </g>
    {/if}
  </g></g>
{/snippet}

<!-- The zone's ornament off each point, the pen running outward once the outline has reached it. -->
{#snippet ornament(glow: boolean)}
  {#if orn && m}
    {#each m.ends as e, j (j)}
      <g transform="translate({f(e.at[0])} {f(e.at[1])}) scale({-e.dir} 1)">
        {#each orn.strokes as o, i (i)}
          {#if !glow}
            <path d={o.d} class="draw orn {o.kind}" style:--d="{(0.62 + o.at * 0.45).toFixed(3)}s" style:--t="0.35s" pathLength="100" />
          {:else if o.kind !== 'hatch'}
            <path d={o.d} class={o.kind} />
          {/if}
        {/each}
        {#each orn.lights as l, i (i)}
          <circle cx={f(l.c[0])} cy={f(l.c[1])} r={glow ? l.r * 3.2 : l.r} class="light" style:--d="{(0.8 + l.at * 0.45).toFixed(3)}s" />
        {/each}
      </g>
    {/each}
  {/if}
{/snippet}

<div class="zm v-{variant}" bind:this={root} style:--accent={accent} style:--z="{delay}s">
  {#if m}
    {#if plateBox}
      <div class="plate" style:left="{plateBox.x}px" style:top="{plateBox.y}px" style:width="{plateBox.w}px" style:height="{plateBox.h}px">
        <span style:clip-path={plateBox.clip}></span>
      </div>
    {/if}
    {#if m.shade}
      <div
        class="shade"
        style:left="{m.shade.cx - m.shade.rx}px"
        style:top="{m.shade.cy - m.shade.ry}px"
        style:width="{2 * m.shade.rx}px"
        style:height="{2 * m.shade.ry}px"
      ></div>
    {/if}
    <!-- The lines twice, as on the circle: a soft, wide copy for the glow, and the lines. -->
    <svg class="art glow" aria-hidden="true">
      {#each m.glow as g, i (i)}<path d={g.d} class={g.kind} />{/each}
      {#each m.seals as s, i (i)}{@render seal(s.c, s.r, s.delay, true)}{/each}
      {@render ornament(true)}
    </svg>
    <svg class="art" aria-hidden="true">
      {#each m.strokes as s, i (i)}
        <path d={s.d} class="draw {s.kind}" style:--d="{s.delay.toFixed(3)}s" style:--t="{s.t.toFixed(3)}s" pathLength="100" />
      {/each}
      {#each m.seals as s, i (i)}{@render seal(s.c, s.r, s.delay, false)}{/each}
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
    /* The lines: gold, tinted by the stratum, as the circle's states tint it. */
    --metal: color-mix(in srgb, var(--accent) 38%, #c9a45c);
    --pale: color-mix(in srgb, var(--accent) 40%, #fff4e0);
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
    stroke-linecap: butt;
    stroke-linejoin: miter;
    stroke-miterlimit: 12;
  }
  .main {
    stroke: var(--metal);
    stroke-width: 1;
  }
  .hair {
    stroke: color-mix(in srgb, var(--pale) 55%, transparent);
    stroke-width: 0.5;
  }
  .hatch {
    stroke: color-mix(in srgb, var(--metal) 80%, transparent);
    stroke-width: 0.45;
    stroke-linecap: round;
  }
  .ray {
    stroke: color-mix(in srgb, var(--metal) 75%, transparent);
    stroke-width: 0.4;
  }
  /* A crack's glow, a flame's ridge: the line at its hottest. */
  .ember {
    stroke: var(--pale);
    stroke-width: 0.7;
    stroke-linejoin: round;
  }
  .orn {
    stroke-linejoin: round;
  }
  .light {
    fill: var(--pale);
    stroke: none;
    animation: carve 0.5s calc(var(--z) + var(--d)) ease-out both;
  }
  .well {
    fill: color-mix(in srgb, var(--accent) 6%, #0b0807);
    stroke: none;
  }
  .sign path {
    stroke: var(--pale);
    stroke-width: 0.8px;
    vector-effect: non-scaling-stroke;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .sign .fine {
    stroke-width: 0.5px;
  }

  /* The ground the name is set on: dark metal, only just tinted, the
     stratum's light falling on its upper edge. Opaque, so nothing behind it
     shows through the name. */
  .plate {
    position: absolute;
    filter: drop-shadow(0 2px 5px rgba(0, 0, 0, 0.85));
    animation: ground 0.45s var(--z) ease-out both;
  }
  .plate span {
    position: absolute;
    inset: 0;
    background:
      radial-gradient(ellipse 55% 130% at 50% 0%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 70%),
      linear-gradient(180deg, color-mix(in srgb, var(--accent) 6%, #130e0a), #090706);
  }
  /* Without a plate (the seals), a soft pool of shadow under the name. */
  .shade {
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
    letter-spacing: 0.03em;
    color: var(--pale);
    text-shadow:
      0 0 10px color-mix(in srgb, var(--accent) 35%, transparent),
      0 1px 3px rgba(0, 0, 0, 0.95);
  }
  .name.set {
    visibility: visible;
    /* Written in from the left, the ink's edge soft. */
    mask-image: linear-gradient(90deg, #000 40%, transparent 60%);
    mask-size: 260% 100%;
    animation: write 0.75s calc(var(--z) + 0.25s) cubic-bezier(0.4, 0, 0.3, 1) both;
  }

  /* The glow: the same lines, wide and faint, swelling once they are drawn,
     then breathing (on its own layer, so nothing repaints). */
  .glow {
    opacity: 0.22;
    animation:
      glow-in 1.2s calc(var(--z) + 0.9s) ease-out both,
      breathe 6s calc(var(--z) + 2.1s) ease-in-out infinite alternate;
  }
  .glow .main,
  .glow circle {
    stroke: var(--accent);
    stroke-width: 3;
  }
  .glow .hair {
    stroke: var(--accent);
    stroke-width: 1.4;
  }
  .glow .ember {
    stroke: var(--accent);
    stroke-width: 3.6;
  }
  .glow .light {
    fill: var(--accent);
    stroke: none;
  }

  .draw {
    stroke-dasharray: 100;
    animation: draw var(--t, 0.6s) calc(var(--z) + var(--d, 0s)) linear both;
  }
  .hatch.draw {
    animation-timing-function: ease-out;
  }
  .seal {
    transform-box: fill-box;
    transform-origin: center;
    animation: stamp 0.5s calc(var(--z) + var(--d)) var(--ease-out) both;
  }
  .seal .sign,
  .seal .ray {
    animation: carve 0.5s calc(var(--z) + var(--d) + 0.25s) ease-out both;
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
      transform: scale(1.6);
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
      opacity: 0.42;
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
