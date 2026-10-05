<script lang="ts">
  // Delve: a player's lives as an engraved phial of three chambers of living
  // ember. Lit chambers hold a flowing, flickering fire with motes rising in
  // it; spent ones are dark glass. They go dark from the end (the top, when
  // the phial stands upright on a phone). The chamber of a life just lost
  // flares and empties; Scoreboard.svelte bursts its fire out into the effects
  // layer from the chamber (data-k) as it does.
  import { DELVE_LIVES } from '../lib/delve';

  let {
    lives,
    draining = -1,
    vertical = false,
  }: {
    lives: number;
    /** The chamber (0 to 2) of the life just lost, while it empties; -1 otherwise. */
    draining?: number;
    vertical?: boolean;
  } = $props();

  const CHAMBERS = Array.from({ length: DELVE_LIVES }, (_, k) => k);
</script>

<!-- The phial is drawn lying down (64 × 12); upright it is turned a quarter. -->
<span class="phial" class:vertical role="img" aria-label="{lives} {lives === 1 ? 'life' : 'lives'} left">
  <span class="body">
    {#each CHAMBERS as k (k)}
      <span
        class="chamber c{k}"
        data-k={k}
        class:lit={k < lives}
        class:last={k === 0 && lives === 1}
        class:draining={k === draining}
      ><span class="core"></span></span>
    {/each}
    <svg viewBox="0 0 64 12" aria-hidden="true">
      <!-- The gold frame with pointed ends, an engraved hairline inside it, and the walls between chambers. -->
      <path class="frame" d="M0.6 6 6.2 0.6H57.8L63.4 6 57.8 11.4H6.2Z" />
      <path class="inner" d="M2.3 6 6.9 1.6H57.1L61.7 6 57.1 10.4H6.9Z" />
      <path class="wall" d="M22.5 0.6V11.4M41.5 0.6V11.4" />
    </svg>
  </span>
</span>

<style>
  .phial {
    --w: 54px;
    position: relative;
    display: inline-block;
    width: var(--w);
    height: calc(var(--w) * 12 / 64);
    flex: none;
  }
  /* Upright: the same phial turned a quarter, so it fills from the bottom. */
  .phial.vertical {
    --w: 30px;
    width: calc(var(--w) * 12 / 64);
    height: var(--w);
  }
  .body {
    position: absolute;
    left: 50%;
    top: 50%;
    width: var(--w);
    height: calc(var(--w) * 12 / 64);
    translate: -50% -50%;
  }
  .vertical .body {
    rotate: -90deg;
  }
  svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  .frame {
    fill: none;
    stroke: #c9a45c;
    stroke-width: 1.1;
    stroke-linejoin: miter;
    filter: drop-shadow(0 0 1.5px rgba(0, 0, 0, 0.9));
  }
  .inner {
    fill: none;
    stroke: rgba(241, 217, 155, 0.35);
    stroke-width: 0.45;
  }
  .wall {
    stroke: #c9a45c;
    stroke-width: 1;
  }

  /* The chambers sit in the frame's hollow (in units of the 64 × 12 drawing). */
  .chamber {
    position: absolute;
    top: calc(100% * 1.6 / 12);
    height: calc(100% * 8.8 / 12);
    overflow: hidden;
    /* Dark glass, hatched along the bottom, as an engraver would shade it. */
    background:
      repeating-linear-gradient(135deg, rgba(201, 164, 92, 0.22) 0 0.5px, transparent 0.5px 2.2px) 0 100% / 100% 45% no-repeat,
      linear-gradient(180deg, #0b0806, #150d08);
  }
  .c0 {
    left: calc(100% * 2.3 / 64);
    width: calc(100% * 20.2 / 64);
    clip-path: polygon(0 50%, 23% 0, 100% 0, 100% 100%, 23% 100%);
  }
  .c1 {
    left: calc(100% * 22.5 / 64);
    width: calc(100% * 19 / 64);
  }
  .c2 {
    left: calc(100% * 41.5 / 64);
    width: calc(100% * 20.2 / 64);
    clip-path: polygon(0 0, 77% 0, 100% 50%, 77% 100%, 0 100%);
  }

  /* Living ember: two bands of fire flowing across each other at different
     speeds over a molten bed, a bright meniscus on top, motes rising through it. */
  .chamber.lit {
    background:
      linear-gradient(180deg, rgba(255, 236, 180, 0.85) 0, rgba(255, 200, 120, 0) 22%),
      repeating-linear-gradient(105deg, rgba(255, 196, 96, 0) 0 5px, rgba(255, 190, 90, 0.55) 8px, rgba(255, 196, 96, 0) 12px) 0 0 / 25px 100%,
      repeating-linear-gradient(72deg, rgba(255, 96, 30, 0) 0 4px, rgba(255, 128, 44, 0.5) 7px, rgba(255, 96, 30, 0) 11px) 0 0 / 19px 100%,
      radial-gradient(ellipse 120% 140% at 50% 110%, #ff8a32 0%, #c22a10 52%, #4d0705 100%);
    animation:
      flow 2.8s linear infinite,
      flicker 1.9s ease-in-out infinite alternate;
  }
  /* The heart of the fire: a hot glow wandering through the chamber. */
  .core {
    position: absolute;
    inset: -20% -30%;
    display: none;
    background: radial-gradient(closest-side, rgba(255, 232, 160, 0.8), rgba(255, 170, 70, 0.25) 55%, rgba(255, 140, 50, 0) 100%) 0 50% / 55% 100% no-repeat;
    mix-blend-mode: screen;
    animation: wander 3.7s ease-in-out infinite alternate;
  }
  .lit .core {
    display: block;
  }
  /* Motes: sparks of the life force drifting up through it, on three
     spacings that never line up, so they don't read as a grid. */
  .chamber.lit::after {
    content: '';
    position: absolute;
    inset: -60% 0 0;
    background:
      radial-gradient(circle, rgba(255, 246, 210, 0.95) 0 0.5px, transparent 1px) 1px 0 / 11px 9px,
      radial-gradient(circle, rgba(255, 214, 150, 0.8) 0 0.4px, transparent 0.9px) 6px 4px / 17px 13px,
      radial-gradient(circle, rgba(255, 190, 120, 0.7) 0 0.35px, transparent 0.8px) 3px 7px / 7px 19px;
    mix-blend-mode: screen;
    opacity: 0.75;
    animation: motes 2.9s linear infinite;
  }
  /* Each chamber at its own point of the same motions, so they don't move as one. */
  .c1,
  .c1::after,
  .c1 .core {
    animation-delay: -1.1s;
  }
  .c2,
  .c2::after,
  .c2 .core {
    animation-delay: -2.3s;
  }
  /* The last life: redder, hotter flicker, its surface trembling. */
  .chamber.lit.last {
    background:
      linear-gradient(180deg, rgba(255, 210, 170, 0.8) 0, rgba(255, 160, 110, 0) 24%),
      repeating-linear-gradient(105deg, rgba(255, 140, 80, 0) 0 5px, rgba(255, 140, 80, 0.55) 8px, rgba(255, 140, 80, 0) 12px) 0 0 / 25px 100%,
      repeating-linear-gradient(72deg, rgba(255, 60, 30, 0) 0 4px, rgba(255, 80, 40, 0.5) 7px, rgba(255, 60, 30, 0) 11px) 0 0 / 19px 100%,
      radial-gradient(ellipse 120% 140% at 50% 110%, #ff5a2a 0%, #a8140c 52%, #3d0405 100%);
    animation:
      flow 1.9s linear infinite,
      flicker 0.7s ease-in-out infinite alternate,
      tremble 0.45s ease-in-out infinite alternate;
  }
  @keyframes flow {
    to {
      background-position:
        0 0,
        25px 0,
        -19px 0,
        0 0;
    }
  }
  @keyframes flicker {
    from {
      filter: brightness(0.9) saturate(1.05);
    }
    to {
      filter: brightness(1.2) saturate(1.1);
    }
  }
  @keyframes tremble {
    to {
      translate: 0 0.4px;
    }
  }
  @keyframes motes {
    to {
      transform: translateY(38%);
      background-position:
        3px -18px,
        4px -22px,
        5px -12px;
    }
  }
  @keyframes wander {
    to {
      background-position: 100% 40%;
    }
  }
  /* A life just lost: the chamber flares white-hot and its fire drains out. */
  .chamber.draining::before {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse 120% 140% at 50% 110%, #ffd27a, #ff6a24 55%, #8a1408);
    animation: release 0.9s ease-in forwards;
  }
  @keyframes release {
    0% {
      filter: brightness(2.4);
      clip-path: inset(0 0 0 0);
    }
    25% {
      filter: brightness(1.6);
    }
    100% {
      filter: brightness(1);
      clip-path: inset(100% 0 0 0);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .chamber.lit,
    .chamber.lit::after,
    .core,
    .chamber.draining::before {
      animation: none;
    }
    .chamber.draining::before {
      display: none;
    }
  }
  /* Effects off (the low-power mode): the fire glows but holds still. */
  :global(html[data-still]) .chamber.lit,
  :global(html[data-still]) .chamber.lit::after,
  :global(html[data-still]) .core {
    animation-play-state: paused;
  }
</style>
