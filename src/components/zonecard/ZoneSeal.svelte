<script lang="ts">
  // A zone title card's seal (ZoneCard.svelte): the zone's sigil
  // (lib/zoneSigils.ts) in a worn double ring, engraved as the rune circle is
  // (docs/arcane-style.md), drawing itself on the card's clock: the rings
  // sweep round from the top, then the sigil's lines draw, nearest the
  // centre first, one pen for all their pieces, then its fine lines, and its
  // hatching comes in last. A soft copy of the lines under them is its glow.
  // Held still, it is all there from the start.
  import { onMount } from 'svelte';
  import { ring, wear } from '../../lib/arcane';
  import { sigilStrokes } from '../../lib/zoneSigils';
  import { T, drawPlan } from '../../lib/zoneTitleTiming';
  import type { Ctx } from './family';

  let {
    sigil,
    play,
    still,
    seed,
    el = $bindable(),
  }: {
    /** The place whose sigil it bears (a stratum's name). */
    sigil: string;
    play: Ctx['play'];
    still: boolean;
    seed: number;
    el?: HTMLElement;
  } = $props();

  const s = $derived(sigilStrokes(sigil));
  const pieces = (d: string) => d.split(/(?=M)/).filter((p) => p.trim());
  const rings = $derived([pieces(ring([0, 0], 12.6, { wear: wear(seed) })), pieces(ring([0, 0], 11.4, { wear: wear(seed + 1) }))]);
  const whole = [ring([0, 0], 12.6), ring([0, 0], 11.4)];

  let lines: SVGSVGElement;
  let glow: SVGSVGElement;
  let k = $state(2);

  onMount(() => {
    k = Math.max(0.5, el!.clientWidth / 28);
    if (still) return;
    const draw = (sel: string, from: number, ms: number) => {
      const paths = [...lines.querySelectorAll<SVGPathElement>(sel)];
      const plan = drawPlan(
        paths.map((p) => p.getTotalLength()),
        from,
        ms,
      );
      paths.forEach((p, i) => play(p, [{ strokeDashoffset: 100 }, { strokeDashoffset: 0 }], { at: plan[i].delay, ms: plan[i].dur }));
    };
    draw('.ring0', T.SEAL, T.SEAL_MS);
    draw('.ring1', T.SEAL + 120, T.SEAL_MS);
    draw('.main', T.SIGIL, T.SIGIL_MS);
    draw('.fine', T.FINE, T.FINE_MS);
    for (const h of lines.querySelectorAll('.shade')) play(h, [{ opacity: 0 }, { opacity: 1 }], { at: T.HATCH, ms: T.HATCH_MS });
    // The glow swells as the name locks, then breathes.
    play(glow, [{ opacity: 0 }, { opacity: 0.22, offset: 0.4 }, { opacity: 0.6, offset: 0.62 }, { opacity: 0.3 }], {
      at: T.SEAL,
      ms: T.LOCK + 900 - T.SEAL,
    });
  });
</script>

{#snippet art(worn: boolean)}
  {#if worn}
    {#each rings as r, ri (ri)}
      {#each r as d, i (i)}<path {d} class="draw ring{ri} {ri ? 'thin' : 'main'}" pathLength="100" />{/each}
    {/each}
  {:else}
    <path d={whole[0]} class="main" /><path d={whole[1]} class="thin" />
  {/if}
  <g transform="scale(0.9)">
    {#if s.shade && worn}<path d={s.shade} class="shade" />{/if}
    {#each s.fine as d, i (i)}<path {d} class="draw fine" pathLength="100" />{/each}
    {#each s.lines as d, i (i)}<path {d} class="draw main" pathLength="100" />{/each}
  </g>
{/snippet}

<span class="seal" bind:this={el} style:--k={k} aria-hidden="true">
  <svg class="glow" viewBox="-14 -14 28 28" bind:this={glow}>{@render art(false)}</svg>
  <svg class="lines" viewBox="-14 -14 28 28" bind:this={lines}>{@render art(true)}</svg>
</span>

<style>
  .seal {
    position: relative;
    display: block;
    width: var(--seal, 64px);
    height: var(--seal, 64px);
  }
  svg {
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
    stroke-width: calc(0.8px / var(--k));
  }
  .thin {
    stroke-width: calc(0.55px / var(--k));
  }
  .fine {
    stroke-width: calc(0.42px / var(--k));
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  g .main {
    stroke: var(--ink-hi);
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .shade {
    stroke-width: calc(0.36px / var(--k));
    stroke-linecap: round;
    opacity: 0.8;
  }
  .draw {
    stroke-dasharray: 100;
  }
  .glow {
    opacity: 0.3;
  }
  .glow path {
    stroke: var(--glow-c);
    stroke-width: calc(2.2px / var(--k));
  }
  .glow .thin {
    stroke-width: calc(1.2px / var(--k));
  }
</style>
