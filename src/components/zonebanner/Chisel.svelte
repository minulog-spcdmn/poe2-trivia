<script lang="ts">
  // Zone banner, "Chisel": the zone's name cut into the darkness on the
  // kicker's line, letter by letter, as if a mason struck it. Each letter
  // lands with a spark of the zone's colour, glows hot and cools into the
  // stone as a few grains of dust fall from it. Before the name, V-grooves
  // are scored in toward it from both sides and the zone's sigil is struck
  // as a mason's mark at each end. It leaves as it came: the letters
  // crumble away left to right in a last sifting of dust, the grooves fade.
  // Geometry: ./chiselArt.ts.
  import { onMount } from 'svelte';
  import { sigilOf } from '../../lib/zoneSigils';
  import { seeded } from '../../lib/arcane';
  import { chiselArt } from './chiselArt';
  import { watchHead, type Head } from './head';

  let {
    title,
    sigil,
    accent,
    leaving = false,
    still = false,
  }: { title: string; sigil: string; accent: string; leaving?: boolean; still?: boolean } = $props();

  let root: HTMLElement;
  let nameEl = $state<HTMLElement>();
  let head = $state<Head | null>(null);
  let nameW = $state(0);
  let nameH = $state(0);
  const sign = $derived(sigilOf(sigil));
  const chars = $derived([...title]);
  const letters = $derived(chars.filter((c) => c !== ' ').length);
  const art = $derived(head && nameW ? chiselArt(head, nameW, nameH, letters) : null);
  const f = (v: number) => v.toFixed(2);

  /** Each letter's place among the letters (spaces aren't struck). */
  const order = $derived.by(() => {
    let k = 0;
    return chars.map((c) => (c === ' ' ? -1 : k++));
  });
  /** A few grains of dust under each letter, from a fixed seed. */
  const dust = $derived(
    chars.map((_, i) => {
      const rnd = seeded(101 + i * 7);
      return Array.from({ length: 4 }, () => ({
        dx: (rnd() - 0.5) * 10,
        fy: 9 + rnd() * 10,
        dd: 0.03 + rnd() * 0.12,
        dt: 0.8 + rnd() * 0.6,
        s: 1.2 + rnd() * 1,
        x: (rnd() - 0.5) * 0.5,
      }));
    }),
  );

  onMount(() =>
    watchHead(
      root,
      (h) => {
        head = h;
        if (nameEl) [nameW, nameH] = [nameEl.offsetWidth, nameEl.offsetHeight];
      },
      [nameEl],
    ),
  );
</script>

{#snippet mark(c: [number, number], s: number, glow: boolean)}
  <g transform="translate({f(c[0])} {f(c[1])}) scale({f(s / 20)})">
    {#if sign.shade && !glow}<path d={sign.shade} class="s-shade" />{/if}
    <path d={sign.fine} class="s-fine" />
    <path d={sign.lines} />
  </g>
{/snippet}

<div class="zb chisel" class:leaving class:still bind:this={root} style:--accent={accent} aria-hidden="true">
  {#if art}
    <div class="pool" style:left="{art.pool.cx - art.pool.rx}px" style:top="{art.pool.cy - art.pool.ry}px" style:width="{2 * art.pool.rx}px" style:height="{2 * art.pool.ry}px"></div>
    <svg class="art glow">
      {#each art.glow as g, i (i)}<path d={g.d} class={g.kind} />{/each}
      {#each art.marks as mk, i (i)}<g class="mk" style:--d="{mk.delay}s">{@render mark(mk.c, mk.s, true)}</g>{/each}
    </svg>
    <svg class="art lines">
      {#each art.strokes as s, i (i)}
        <path d={s.d} class="draw {s.kind}" style:--d="{s.delay.toFixed(3)}s" style:--t="{s.t.toFixed(3)}s" pathLength="100" />
      {/each}
      {#each art.marks as mk, i (i)}<g class="mk sign" style:--d="{mk.delay}s">{@render mark(mk.c, mk.s, false)}</g>{/each}
    </svg>
    {#each art.marks as mk, i (i)}
      <i class="flash big" style:left="{mk.c[0]}px" style:top="{mk.c[1]}px" style:--d="{mk.delay}s"></i>
    {/each}
  {/if}
  <span class="name" class:set={!!art} bind:this={nameEl} style:left="{art ? art.name[0] : 0}px" style:top="{art ? art.name[1] : 0}px"
    >{#each chars as c, i (i)}{#if order[i] < 0}{' '}{:else}<span
          class="ch"
          style:--k={order[i]}
          style:--d="{art ? (art.start + order[i] * art.step).toFixed(3) : 0}s"
          >{c}<i class="flash"></i>{#each dust[i] as g, j (j)}<i
              class="dust"
              style:--dx="{g.dx.toFixed(1)}px"
              style:--fy="{g.fy.toFixed(1)}px"
              style:--dd="{g.dd.toFixed(3)}s"
              style:--dt="{g.dt.toFixed(2)}s"
              style:--s="{g.s.toFixed(2)}px"
              style:--x="{g.x.toFixed(2)}em"
            ></i>{/each}</span
        >{/if}{/each}</span
  >
</div>

<style>
  .zb {
    position: absolute;
    inset: 0;
    z-index: 2;
    pointer-events: none;
    --ink: color-mix(in srgb, var(--accent) 20%, #d3a35a);
    --ink-hi: color-mix(in srgb, var(--accent) 22%, #f0d9a4);
    --glow-c: color-mix(in srgb, var(--accent) 65%, #d9a45a);
    --hot: color-mix(in srgb, var(--accent) 45%, #fff4dc);
    --dust: color-mix(in srgb, var(--accent) 30%, #e6d6b4);
  }
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
    stroke-width: 0.6;
  }
  .hair {
    stroke-width: 0.45;
    stroke: var(--ink-hi);
  }
  .hatch {
    stroke-width: 0.4;
    stroke-linecap: round;
    opacity: 0.8;
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
    stroke-width: 0.34px;
  }

  .pool {
    position: absolute;
    border-radius: 50%;
    background: radial-gradient(closest-side, rgba(7, 5, 4, 0.82), rgba(7, 5, 4, 0.6) 55%, transparent);
    animation: fade-in 0.4s ease-out both;
  }

  /* The glow: the same lines, wide and faint, under them. */
  .glow {
    opacity: 0.25;
    animation:
      glow-in 1.2s 0.9s ease-out both,
      breathe 6s 2.1s ease-in-out infinite alternate;
  }
  .glow path {
    stroke: var(--glow-c);
    stroke-width: 2.2;
    vector-effect: non-scaling-stroke;
  }
  .glow .hair {
    stroke-width: 1.2;
  }

  .draw {
    stroke-dasharray: 100;
    animation: draw var(--t) var(--d) linear both;
  }
  .hatch.draw {
    animation-timing-function: ease-out;
  }
  /* The mason's marks are struck, as the letters are. */
  .mk {
    transform-box: fill-box;
    transform-origin: center;
    animation: strike-mark 0.6s var(--d) cubic-bezier(0.2, 0.9, 0.3, 1) both;
  }

  .name {
    position: absolute;
    translate: -50% -50%;
    visibility: hidden;
    white-space: pre;
    font-family: var(--font-display);
    font-weight: 900;
    font-size: clamp(1.05rem, 1.3vw + 0.55rem, 1.36rem);
    line-height: 1.15;
    letter-spacing: 0.05em;
    color: color-mix(in srgb, var(--accent) 16%, #ecd3a0);
    /* Cut into the plate: the cut's upper wall in shadow, its lower lip catching the light. */
    text-shadow:
      0 -1px 0 rgba(0, 0, 0, 0.9),
      0 1px 0 color-mix(in srgb, var(--accent) 25%, rgba(255, 232, 180, 0.32)),
      0 0 12px color-mix(in srgb, var(--accent) 38%, transparent);
  }
  .name.set {
    visibility: visible;
  }
  .ch {
    position: relative;
    display: inline-block;
  }
  .set .ch {
    animation: strike 0.95s var(--d) cubic-bezier(0.2, 0.9, 0.3, 1) both;
  }
  /* The spark where the chisel bites. */
  .flash {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 1.7em;
    height: 1.7em;
    margin: -0.85em 0 0 -0.85em;
    border-radius: 50%;
    background: radial-gradient(closest-side, color-mix(in srgb, var(--hot) 85%, transparent), color-mix(in srgb, var(--accent) 45%, transparent) 45%, transparent);
    mix-blend-mode: screen;
    opacity: 0;
    animation: flash 0.34s var(--d) ease-out both;
  }
  .flash.big {
    width: 34px;
    height: 34px;
    margin: -17px 0 0 -17px;
  }
  .dust {
    position: absolute;
    left: calc(50% + var(--x));
    top: 78%;
    width: var(--s);
    height: var(--s);
    border-radius: 50%;
    background: var(--dust);
    opacity: 0;
    animation: fall var(--dt) calc(var(--d) + var(--dd)) cubic-bezier(0.45, 0, 0.9, 0.55) both;
  }

  /* Leaving: the letters crumble away left to right, the dust sifting
     from them once more, and the cuts fade into the dark. */
  .leaving .ch {
    animation: crumble 0.55s calc(var(--k) * 0.022s) ease-in both;
  }
  .leaving .dust {
    animation: fall var(--dt) calc(var(--k) * 0.022s + var(--dd)) cubic-bezier(0.45, 0, 0.9, 0.55) both;
  }
  .leaving .flash {
    animation: none;
  }
  .leaving .art,
  .leaving .pool {
    animation: fade-out 0.8s 0.25s ease-in both;
  }

  @keyframes strike {
    0% {
      opacity: 0;
      transform: scale(1.45);
      color: var(--hot);
      text-shadow:
        0 0 6px var(--accent),
        0 0 14px var(--accent);
    }
    10% {
      opacity: 1;
      transform: scale(0.96);
    }
    18% {
      transform: scale(1);
    }
    35% {
      color: var(--hot);
    }
  }
  @keyframes strike-mark {
    0% {
      opacity: 0;
      transform: scale(1.5);
    }
    25% {
      opacity: 1;
      transform: scale(0.95);
    }
    45% {
      transform: scale(1);
    }
  }
  @keyframes flash {
    0% {
      opacity: 0;
      transform: scale(0.25);
    }
    12% {
      opacity: 0.95;
    }
    100% {
      opacity: 0;
      transform: scale(1.3);
    }
  }
  @keyframes fall {
    0% {
      opacity: 0;
      transform: translate(0, 0);
    }
    8% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      transform: translate(var(--dx), var(--fy));
    }
  }
  @keyframes crumble {
    to {
      opacity: 0;
      transform: translateY(0.12em);
      filter: blur(1.2px);
    }
  }
  @keyframes draw {
    from {
      stroke-dashoffset: 100;
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

  /* Still: nothing is drawn or struck; the whole fades in and out (ZoneBanner). */
  .still :global(*) {
    animation: none !important;
  }
  .still .dust,
  .still .flash {
    display: none;
  }
</style>
