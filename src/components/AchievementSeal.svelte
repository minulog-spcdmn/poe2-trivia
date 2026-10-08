<script lang="ts" module>
  // An achievement's seal, engraved in the style of the rune circle
  // (docs/arcane-style.md): a worn double ring holding an alchemical sign,
  // struck in the metal of its tier (lib/achievements.ts METALS: lead,
  // copper, silver, gold). Lead, for the very easy ones, has the outer ring alone. Harder ones carry a glory
  // of fine rays round the sign, the hardest a third ring inside it.
  // Earned, the lines sit on a soft glow, and now and then light passes over
  // them in the metal's own way (lib/glint.ts; METALS says how): a slow
  // faint gleam on lead, a quick white flash on silver, a warm sweep on gold
  // that leaves a spark on its rim. Not yet, the seal is a dull
  // impression whose ring is cut as far as the progress has come, and a
  // secret one holds no sign.

  import {
    ARIES,
    CANCER,
    EYE,
    GEMINI,
    HEPTAGRAM,
    HEXAGRAM,
    HOUR,
    MARKS,
    OUROBOROS,
    PELICAN,
    PLANETS,
    PROJECTION,
    RETORT,
    RINGS,
    SCORPIO,
    STONE,
    SUBLIMATION,
    WAVES,
  } from '../lib/alchemy';
  import { at, line, ring, wear, type Pt } from '../lib/arcane';
  import { passingLight } from '../lib/glint';
  import { METALS, TIERS, type Sign, type Tier } from '../lib/achievements';

  const C: Pt = [0, 0];
  const OUTER = 21.6;
  const INNER = 19.9;
  const CORE = 11.4;

  /** Each sign's path and the scale that sets it about ±10 across (the planets' grid is ±4, the marks' ±2). */
  const SIGNS: Record<Sign, { d: string; k: number }> = {
    fire: { d: MARKS[0], k: 4.3 },
    earth: { d: MARKS[3], k: 4.3 },
    salt: { d: MARKS[4], k: 4.6 },
    antimony: { d: MARKS[6], k: 4.2 },
    cross: { d: MARKS[10], k: 4.6 },
    sulphur: { d: MARKS[5], k: 4.3 },
    sol: { d: PLANETS[0], k: 2.3 },
    luna: { d: PLANETS[1], k: 2.2 },
    mercury: { d: PLANETS[2], k: 2.05 },
    venus: { d: PLANETS[3], k: 2.05 },
    mars: { d: PLANETS[4], k: 2.15 },
    jupiter: { d: PLANETS[5], k: 2.15 },
    saturn: { d: PLANETS[6], k: 2.1 },
    hexagram: { d: HEXAGRAM, k: 2.1 },
    heptagram: { d: HEPTAGRAM, k: 2.1 },
    stone: { d: STONE, k: 2.1 },
    eye: { d: EYE, k: 2.1 },
    hourglass: { d: HOUR, k: 2.05 },
    sublimation: { d: SUBLIMATION, k: 2.1 },
    pelican: { d: PELICAN, k: 2.1 },
    waves: { d: WAVES, k: 2.1 },
    pisces: { d: PROJECTION, k: 2.1 },
    rings: { d: RINGS, k: 2.1 },
    ouroboros: { d: OUROBOROS, k: 2.1 },
    aries: { d: ARIES, k: 2.1 },
    gemini: { d: GEMINI, k: 2.1 },
    cancer: { d: CANCER, k: 2.1 },
    scorpio: { d: SCORPIO, k: 2.1 },
    retort: { d: RETORT, k: 2.1 },
  };

  /** A glory of `n` fine rays between the core and the inner ring, long and short in turn. */
  const glory = (n: number) =>
    Array.from({ length: n }, (_, k) => line(at(C, (k * 360) / n, CORE + 1.3), at(C, (k * 360) / n, k % 2 ? INNER - 3.4 : INNER - 1.5))).join('');

  // Every seal of a tier is cut the same: the wear comes from a fixed seed.
  const drawn = TIERS.map((tier) => ({
    outer: ring(C, OUTER, { wear: wear(97 + tier * 31) }),
    rays: tier < 2 ? '' : glory(tier === 2 ? 16 : 32),
  }));
  const OUTER_WHOLE = ring(C, OUTER);

  // One light per metal, so every seal of a metal catches the same light, each metal on its own beat.
  const LIGHTS = TIERS.map((tier) => passingLight(METALS[tier].light.every, METALS[tier].light.sweep, { travel: true }));
  /** Svelte actions: the light of `tier`'s metal passes over this slit, or kindles this spark. */
  const sheen = (slit: Element, tier: Tier) => LIGHTS[tier].glint(slit);
  const spark = (el: Element, tier: Tier) => LIGHTS[tier].spark(el);
  /** Where gold's spark kindles: on the outer ring, up and to the right, as a share of the seal. */
  const SPARK_AT = at(C, 45, OUTER).map((v) => `${50 + (v / 48) * 100}%`);
  const RAYS_WHOLE = ['', '', glory(16), glory(32)];
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
    tier: Tier;
    earned?: boolean;
    /** Not yet earned: how far along, 0 to 1 (its share of the ring cut bright). */
    progress?: number;
    /** Not yet earned and kept hidden: no sign. */
    secret?: boolean;
    size?: number;
  } = $props();

  const s = $derived(SIGNS[sign]);
  const lines = $derived(drawn[tier]);
  const shown = $derived(earned || !secret);
  const share = $derived(Math.max(0, Math.min(1, progress)));
</script>

{#snippet engraving(whole: boolean)}
  <path d={whole ? OUTER_WHOLE : lines.outer} class="main" />
  {#if tier > 0}<circle r={INNER} class="hair" />{/if}
  {#if tier > 1}<path d={whole ? RAYS_WHOLE[tier] : lines.rays} class="hair" />{/if}
  {#if tier > 2}<circle r={CORE} class="thin" />{/if}
  {#if shown}<path d={s.d} class="sign" transform="scale({s.k})" style:--k={s.k} />{/if}
{/snippet}

<span
  class="seal"
  class:earned
  style:--size="{size}px"
  style:--metal={METALS[tier].color}
  style:--sheen={METALS[tier].sheen?.color}
  style:--shine={METALS[tier].sheen?.opacity}
  style:--gleam={METALS[tier].light.gleam}
  style:--strength={METALS[tier].light.strength}
  style:--band="{METALS[tier].light.band}%"
  aria-hidden="true"
>
  {#if earned}
    <svg class="glow" viewBox="-24 -24 48 48">{@render engraving(true)}</svg>
  {/if}
  <svg viewBox="-24 -24 48 48">
    {@render engraving(false)}
    {#if !earned && share > 0}
      <circle r={OUTER} class="done" pathLength="100" stroke-dasharray="{share * 100} 100" transform="rotate(-90)" />
    {/if}
  </svg>
  {#if earned}
    {#key tier}
      <span class="slit" use:sheen={tier}><svg viewBox="-24 -24 48 48">{@render engraving(true)}</svg></span>
      {#if METALS[tier].light.spark}
        <svg class="spark" use:spark={tier} viewBox="-1 -1 2 2" style:left={SPARK_AT[0]} style:top={SPARK_AT[1]}>
          <path d="M0 -1L0.16 -0.16L1 0L0.16 0.16L0 1L-0.16 0.16L-1 0L-0.16 -0.16Z" />
        </svg>
      {/if}
    {/key}
  {/if}
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

  /*
   * The passing light: at rest the slit waits off to the left of the seal,
   * its copy of the lines shifted back over them (lib/glint.ts slides both).
   * The band is the metal's width either side of the slit's middle.
   */
  .slit {
    position: absolute;
    inset: 0;
    pointer-events: none;
    -webkit-mask-image: linear-gradient(90deg, transparent calc(50% - var(--band)), #000 50%, transparent calc(50% + var(--band)));
    mask-image: linear-gradient(90deg, transparent calc(50% - var(--band)), #000 50%, transparent calc(50% + var(--band)));
    transform: translateX(-100%) skewX(-20deg);
  }
  .slit svg {
    color: var(--gleam);
    opacity: var(--strength);
    filter: drop-shadow(0 0 1px var(--gleam));
    transform: skewX(20deg) translateX(100%);
  }
  /* Gold's spark: a small four-pointed star on the rim, unseen until the light kindles it. */
  .spark {
    position: absolute;
    width: 34%;
    height: 34%;
    inset: auto;
    overflow: visible;
    opacity: 0;
    transform: translate(-50%, -50%);
    pointer-events: none;
    fill: #fffaf0;
    stroke: none;
    filter: drop-shadow(0 0 2px rgba(255, 214, 140, 0.9));
  }
  @media (prefers-reduced-motion: reduce) {
    .slit,
    .spark {
      display: none;
    }
  }

  /* The glow: the same lines, wide and faint, under them. */
  .glow {
    color: var(--sheen, var(--metal));
    opacity: var(--shine, 0.22);
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
