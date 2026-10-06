<script lang="ts" module>
  // An achievement's seal, engraved in the style of the rune circle
  // (docs/arcane-style.md): a worn double ring holding an alchemical sign,
  // struck in the metal of its tier (copper, silver, gold). Harder ones carry
  // a glory of fine rays round the sign, the hardest a third ring inside it.
  // Earned, the lines sit on a soft glow; not yet, the seal is a dull
  // impression whose ring is cut as far as the progress has come, and a
  // secret one holds no sign.

  import { MARKS, PLANETS } from '../lib/alchemy';
  import { at, line, ring, wear, type Pt } from '../lib/arcane';
  import type { Sign } from '../lib/achievements';

  const C: Pt = [0, 0];
  const OUTER = 21.6;
  const INNER = 19.9;
  const CORE = 11.4;

  /** Each sign's path and the scale that sets it about ±10 across. */
  const SIGNS: Record<Sign, { d: string; k: number }> = {
    sol: { d: PLANETS[0], k: 2.3 },
    luna: { d: PLANETS[1], k: 2.2 },
    mercury: { d: PLANETS[2], k: 2.05 },
    venus: { d: PLANETS[3], k: 2.1 },
    mars: { d: PLANETS[4], k: 2.15 },
    jupiter: { d: PLANETS[5], k: 2.15 },
    saturn: { d: PLANETS[6], k: 2.1 },
    fire: { d: MARKS[0], k: 4.3 },
    water: { d: MARKS[1], k: 4.3 },
    air: { d: MARKS[2], k: 4.3 },
    earth: { d: MARKS[3], k: 4.3 },
    salt: { d: MARKS[4], k: 4.6 },
    sulphur: { d: MARKS[5], k: 4.2 },
    antimony: { d: MARKS[6], k: 4.2 },
    arsenic: { d: MARKS[7], k: 4.4 },
    cross: { d: MARKS[10], k: 4.6 },
  };

  /** The metals: copper, silver, gold. */
  export const METALS = { 1: '#cf9366', 2: '#cdd2d6', 3: '#e6bb62' } as const;

  /** A glory of `n` fine rays between the core and the inner ring, long and short in turn. */
  const glory = (n: number) =>
    Array.from({ length: n }, (_, k) => line(at(C, (k * 360) / n, CORE + 1.3), at(C, (k * 360) / n, k % 2 ? INNER - 3.4 : INNER - 1.5))).join('');

  // Every seal of a tier is cut the same: the wear comes from a fixed seed.
  const drawn = ([1, 2, 3] as const).map((tier) => ({
    outer: ring(C, OUTER, { wear: wear(97 + tier * 31) }),
    rays: tier === 1 ? '' : glory(tier === 2 ? 16 : 32),
  }));
  const OUTER_WHOLE = ring(C, OUTER);
  const RAYS_WHOLE = ['', glory(16), glory(32)];
</script>

<script lang="ts">
  let {
    sign,
    tier,
    earned = false,
    progress = 0,
    secret = false,
    size = 56,
  }: {
    sign: Sign;
    tier: 1 | 2 | 3;
    earned?: boolean;
    /** Not yet earned: how far along, 0 to 1 (its share of the ring cut bright). */
    progress?: number;
    /** Not yet earned and kept hidden: no sign. */
    secret?: boolean;
    size?: number;
  } = $props();

  const s = $derived(SIGNS[sign]);
  const lines = $derived(drawn[tier - 1]);
  const shown = $derived(earned || !secret);
  const share = $derived(Math.max(0, Math.min(1, progress)));
</script>

{#snippet engraving(whole: boolean)}
  <path d={whole ? OUTER_WHOLE : lines.outer} class="main" />
  <circle r={INNER} class="hair" />
  {#if tier > 1}<path d={whole ? RAYS_WHOLE[tier - 1] : lines.rays} class="hair" />{/if}
  {#if tier > 2}<circle r={CORE} class="thin" />{/if}
  {#if shown}<path d={s.d} class="sign" transform="scale({s.k})" style:--k={s.k} />{/if}
{/snippet}

<span class="seal" class:earned style:--size="{size}px" style:--metal={METALS[tier]} aria-hidden="true">
  {#if earned}
    <svg class="glow" viewBox="-24 -24 48 48">{@render engraving(true)}</svg>
  {/if}
  <svg viewBox="-24 -24 48 48">
    {@render engraving(false)}
    {#if !earned && share > 0}
      <circle r={OUTER} class="done" pathLength="100" stroke-dasharray="{share * 100} 100" transform="rotate(-90)" />
    {/if}
  </svg>
</span>

<style>
  .seal {
    position: relative;
    display: inline-block;
    flex: none;
    width: var(--size);
    height: var(--size);
    border-radius: 50%;
    color: #7d6f5c;
    /* A dark medallion the lines are cut into. */
    background: radial-gradient(circle, rgba(0, 0, 0, 0.55) 0 62%, rgba(0, 0, 0, 0.25) 74%, transparent 76%);
  }
  .seal.earned {
    color: var(--metal);
    background: radial-gradient(
      circle,
      color-mix(in srgb, var(--metal) 16%, rgba(0, 0, 0, 0.6)) 0 40%,
      rgba(0, 0, 0, 0.55) 62%,
      rgba(0, 0, 0, 0.25) 74%,
      transparent 76%
    );
  }
  svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
    fill: none;
    stroke: currentColor;
    stroke-linecap: butt;
    stroke-linejoin: miter;
    stroke-miterlimit: 12;
  }
  .main {
    stroke-width: 0.85;
  }
  .thin {
    stroke-width: 0.55;
  }
  .hair {
    stroke-width: 0.4;
  }
  circle {
    stroke-linecap: round;
  }
  /* A sign drawn at k times its size keeps the same line. */
  .sign {
    stroke-width: calc(0.95px / var(--k, 1));
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  /* Not yet earned: a dull impression, its ring cut bright as far as it has come. */
  .seal:not(.earned) svg {
    opacity: 0.75;
  }
  .done {
    stroke: #b08a4c;
    stroke-width: 1.1;
    stroke-linecap: butt;
  }

  /* The glow: the same lines, wide and faint, under them. */
  .glow {
    opacity: 0.22;
    filter: blur(0.6px);
  }
  .glow * {
    stroke-width: 2.2;
  }
  .glow .hair {
    stroke-width: 1.2;
  }
  .glow .sign {
    stroke-width: calc(2.2px / var(--k, 1));
  }
</style>
