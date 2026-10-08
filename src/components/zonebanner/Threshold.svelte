<script lang="ts">
  // Delve's zone banner, the threshold: a waystone gate rises over the depth
  // banner (Game.svelte's .head, which it fills), so the new depth stands in
  // its doorway. The columns are drawn up from their plinths beside the
  // heading, the lintel is lowered onto them over it, its lines running out
  // from the middle, and a light runs out along its face, lighting the zone's
  // name; last the keystone is set into the crown and its sigil is cut. The
  // zone's light shows faintly through the doorway. Told to leave, it goes as
  // you pass through it: the gate grows a touch and fades (EXIT). With
  // `still` (reduced motion, or the effects off) nothing is drawn or moves:
  // it fades in and out whole (STILL_FADE). Geometry: ./thresholdArt.ts.
  import { onMount } from 'svelte';
  import { sigilOf } from '../../lib/zoneSigils';
  import { STILL_FADE, thresholdArt, type Part } from './thresholdArt';
  import { watchHead, type Head } from './head';

  let {
    title,
    sigil,
    accent,
    leaving = false,
    still = false,
    delay = 0,
    onfx,
  }: {
    /** The zone's name, or "Deeper than ever". */
    title: string;
    /** The zone whose sigil the keystone bears (a stratum's name, lib/descent). */
    sigil: string;
    /** The zone's colour (lib/descent accentAt), which tints it all. */
    accent: string;
    leaving?: boolean;
    still?: boolean;
    /** Seconds before it starts building (while the stage it lies on fades in). */
    delay?: number;
    /** Called once the name is lit, with the lintel, which the light should come from. */
    onfx?: (el: HTMLElement) => void;
  } = $props();
  let fxEl = $state<HTMLElement>();

  let root: HTMLElement;
  let nameEl = $state<HTMLElement>();
  let head = $state<Head | null>(null);
  let nameW = $state(0);
  let em = $state(0);
  const sign = $derived(sigilOf(sigil));
  const art = $derived(head && nameW ? thresholdArt(head, nameW, em) : null);
  const uid = $props.id();
  const f = (v: number) => v.toFixed(2);

  onMount(() => {
    const off = watchHead(
      root,
      (h) => {
        head = h;
        if (nameEl) [nameW, em] = [nameEl.offsetWidth, parseFloat(getComputedStyle(nameEl).fontSize) || 18];
      },
      [nameEl],
    );
    // Faded by script when still: the reduced-motion stylesheet cuts CSS animations short.
    if (still) root.animate([{ opacity: 0 }, { opacity: 1 }], { duration: STILL_FADE * 1000, easing: 'ease-out' });
    const t = setTimeout(() => fxEl && onfx?.(fxEl), (delay + (still ? 0.3 : 0.95)) * 1000);
    return () => {
      off();
      clearTimeout(t);
    };
  });
  $effect(() => {
    if (still && leaving) root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: STILL_FADE * 1000, easing: 'ease-in', fill: 'forwards' });
  });
</script>

{#snippet lines(p: Part, glow: boolean)}
  {#if glow}
    {#each p.glow as g, i (i)}<path d={g.d} class={g.kind} />{/each}
  {:else}
    {#each p.strokes as s, i (i)}
      <path d={s.d} class="draw {s.kind}" style:--d="{s.delay.toFixed(3)}s" style:--t="{s.t.toFixed(3)}s" pathLength="100" />
    {/each}
  {/if}
{/snippet}

{#snippet gate(glow: boolean)}
  {#if art}
    <g class="pillars">{@render lines(art.pillars, glow)}</g>
    <g class="sill">{@render lines(art.sill, glow)}</g>
    <g class="lintel">{@render lines(art.lintel, glow)}</g>
    <g class="key">
      {@render lines(art.keystone, glow)}
      <g class="sign" transform="translate({f(art.sign.c[0])} {f(art.sign.c[1])}) scale({f(art.sign.s / 20)})">
        {#if sign.shade && !glow}<path d={sign.shade} class="s-shade" />{/if}
        <path d={sign.fine} class="s-fine" />
        <path d={sign.lines} />
      </g>
    </g>
  {/if}
{/snippet}

<div class="zb" class:leaving class:still bind:this={root} style:--accent={accent} style:--z="{delay}s" aria-hidden="true">
  {#if art}
    <div class="gate" style:transform-origin="{art.cx}px {art.yb}px">
      <div
        class="door"
        style:left="{art.door.x0}px"
        style:top="{art.door.y0}px"
        style:width="{art.door.x1 - art.door.x0}px"
        style:height="{art.door.y1 - art.door.y0}px"
      ></div>
      <svg class="art ground">
        <defs>
          <linearGradient id="{uid}-g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" class="g0" />
            <stop offset="0.5" class="g1" />
            <stop offset="1" class="g2" />
          </linearGradient>
        </defs>
        <path d={art.ground.pillars} fill="url(#{uid}-g)" class="pillar-ground" />
        <g class="lintel"><path d={art.ground.lintel} fill="url(#{uid}-g)" /></g>
        <g class="key"><path d={art.ground.key} fill="url(#{uid}-g)" /></g>
      </svg>
      <div
        class="light"
        bind:this={fxEl}
        style:left="{art.x0}px"
        style:top="{art.yt}px"
        style:width="{art.x1 - art.x0}px"
        style:height="{art.yb - art.yt}px"
      ></div>
      <svg class="art glow">{@render gate(true)}</svg>
      <svg class="art lines">{@render gate(false)}</svg>
    </div>
  {/if}
  <span class="name" class:set={!!art} bind:this={nameEl} style:left="{art ? art.name[0] : 0}px" style:top="{art ? art.name[1] : 0}px">{title}</span>
</div>

<style>
  .zb {
    position: absolute;
    inset: 0;
    z-index: 2;
    pointer-events: none;
    --ink: color-mix(in srgb, var(--accent) 20%, #d3a35a);
    --ink-hi: color-mix(in srgb, var(--accent) 24%, #f0d9a4);
    --glow-c: color-mix(in srgb, var(--accent) 65%, #d9a45a);
  }
  .gate,
  .art {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  path {
    fill: none;
    stroke: var(--ink);
    stroke-linecap: butt;
    stroke-linejoin: miter;
    stroke-miterlimit: 12;
  }
  .main {
    stroke-width: 0.8;
  }
  .thin {
    stroke-width: 0.55;
  }
  .hair {
    stroke-width: 0.42;
  }
  .hatch {
    stroke-width: 0.36;
    stroke-linecap: round;
    opacity: 0.75;
  }
  .sign path {
    stroke: var(--ink-hi);
    stroke-width: 0.6px;
    vector-effect: non-scaling-stroke;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .sign .s-fine {
    stroke-width: 0.42px;
  }
  .sign .s-shade {
    stroke: var(--ink);
    stroke-width: 0.32px;
  }

  /* The stone: dark, lit a little under its upper edge. */
  .ground {
    filter: drop-shadow(0 1.5px 3px rgba(0, 0, 0, 0.85));
  }
  .ground path {
    stroke: none;
  }
  .pillar-ground {
    animation: fade-in 0.35s calc(var(--z) + 0.05s) ease-out both;
  }
  .g0 {
    stop-color: color-mix(in srgb, var(--accent) 8%, #2a1f17);
  }
  .g1 {
    stop-color: #17100b;
  }
  .g2 {
    stop-color: #0c0807;
  }
  /* The zone's light through the doorway, rising from the sill. */
  .door {
    position: absolute;
    background: radial-gradient(ellipse 60% 120% at 50% 100%, color-mix(in srgb, var(--accent) 40%, transparent), transparent 70%);
    mix-blend-mode: screen;
    opacity: 0.4;
    animation: door 1.3s calc(var(--z) + 0.4s) ease-out both;
  }
  /* The light running out along the lintel's face from the middle. */
  .light {
    position: absolute;
    background: radial-gradient(ellipse 50% 90% at 50% 50%, color-mix(in srgb, var(--accent) 45%, transparent), transparent 75%);
    mix-blend-mode: screen;
    opacity: 0.35;
    animation: run-out 0.9s calc(var(--z) + 0.36s) cubic-bezier(0.3, 0.6, 0.3, 1) both;
  }

  .glow {
    opacity: 0.25;
    animation:
      glow-in 1.2s calc(var(--z) + 0.95s) ease-out both,
      breathe 6s calc(var(--z) + 2.15s) ease-in-out infinite alternate;
  }
  .glow path {
    stroke: var(--glow-c);
    stroke-width: 2.2;
    vector-effect: non-scaling-stroke;
  }
  .glow .hair,
  .glow .thin {
    stroke-width: 1.2;
  }

  .draw {
    stroke-dasharray: 100;
    animation: draw var(--t) calc(var(--z) + var(--d)) linear both;
  }
  .hatch.draw {
    animation-timing-function: ease-out;
  }
  /* The lintel is lowered onto the columns. */
  .lintel {
    animation: lower 0.5s calc(var(--z) + 0.18s) var(--ease-out) both;
  }
  /* The keystone is set into the crown, its lines drawn as it lands, its sign cut after. */
  .key {
    --kd: 0.72s;
    transform-box: fill-box;
    transform-origin: 50% 100%;
    animation: set-key 0.5s calc(var(--z) + var(--kd)) cubic-bezier(0.3, 1.3, 0.5, 1) both;
  }
  .key .draw {
    animation-delay: calc(var(--z) + var(--kd) + var(--d));
  }
  .key .sign {
    animation: fade-in 0.5s calc(var(--z) + var(--kd) + 0.3s) ease-out both;
  }

  .name {
    position: absolute;
    translate: -50% -50%;
    visibility: hidden;
    white-space: nowrap;
    font-family: var(--font-display);
    font-weight: 900;
    font-size: clamp(1rem, 1.2vw + 0.6rem, 1.32rem);
    line-height: 1;
    padding-top: 0.06em;
    letter-spacing: 0.05em;
    color: color-mix(in srgb, var(--accent) 18%, #f3dfac);
    text-shadow:
      0 1px 2px rgba(0, 0, 0, 0.95),
      0 0 10px color-mix(in srgb, var(--accent) 45%, transparent);
  }
  .name.set {
    visibility: visible;
    /* Lit from the middle outward, as the light runs along the lintel. */
    mask-image: radial-gradient(closest-side, #000 72%, transparent);
    mask-repeat: no-repeat;
    mask-position: center;
    mask-size: 0% 300%;
    animation: light-name 0.6s calc(var(--z) + 0.4s) cubic-bezier(0.4, 0, 0.3, 1) forwards;
  }

  /* Leaving: through the gate. It grows a touch and fades, the name first. */
  .leaving .gate {
    animation: through 1s ease-in both;
  }
  .leaving .name {
    animation: fade-out 0.55s ease-in both;
    mask-size: 220% 300%;
  }

  @keyframes draw {
    from {
      stroke-dashoffset: 100;
    }
  }
  @keyframes lower {
    from {
      opacity: 0;
      transform: translateY(-6px);
    }
    40% {
      opacity: 1;
    }
  }
  @keyframes set-key {
    from {
      opacity: 0;
      transform: translateY(-7px) scale(1.15);
    }
    35% {
      opacity: 1;
    }
  }
  @keyframes light-name {
    from {
      mask-size: 0% 300%;
    }
    to {
      mask-size: 220% 300%;
    }
  }
  @keyframes run-out {
    0% {
      opacity: 0;
      transform: scaleX(0.05);
    }
    35% {
      opacity: 1;
    }
    100% {
      opacity: 0.35;
      transform: scaleX(1);
    }
  }
  @keyframes door {
    from {
      opacity: 0;
    }
    60% {
      opacity: 0.65;
    }
    to {
      opacity: 0.4;
    }
  }
  @keyframes through {
    to {
      opacity: 0;
      transform: scale(1.05);
    }
  }
  @keyframes fade-in {
    from {
      opacity: 0;
    }
  }
  @keyframes fade-out {
    to {
      opacity: 0;
    }
  }
  @keyframes glow-in {
    from {
      opacity: 0;
    }
    55% {
      opacity: 0.45;
    }
    to {
      opacity: 0.3;
    }
  }
  @keyframes breathe {
    from {
      opacity: 0.3;
    }
    to {
      opacity: 0.12;
    }
  }

  .still :global(*) {
    animation: none !important;
  }
  .still .name.set {
    mask-image: none;
  }
</style>
