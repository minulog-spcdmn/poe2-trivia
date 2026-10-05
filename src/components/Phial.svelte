<script lang="ts">
  // Delve: a player's lives as an engraved phial of three chambers of life
  // essence. A lit chamber holds a soft living light that beats like a heart
  // (all three in one rhythm), each with a motion of its own: a tide swaying
  // to and fro, a swirl of two wisps, motes streaming toward the tip. Spent
  // ones are dark glass. They go dark from the end (the top, when the phial
  // stands upright on a phone). The light of a life just lost flares and
  // pours out of the end of its chamber; Scoreboard.svelte jets it out of the
  // phial into the effects layer (lifeLost in lib/fx/moments.ts) as it does.
  import { DELVE_LIVES } from '../lib/delve';

  let {
    lives,
    draining = -1,
    surge = 0,
    vertical = false,
  }: {
    lives: number;
    /** The chamber (0 to 2) of the life just lost, while it pours out; -1 otherwise. */
    draining?: number;
    /** Changes each time a wave of light should run through the lit chambers (a question survived). */
    surge?: number;
    vertical?: boolean;
  } = $props();

  const CHAMBERS = Array.from({ length: DELVE_LIVES }, (_, k) => k);
</script>

<!-- The phial is drawn lying down (64 × 12); upright it is turned a quarter. -->
<span class="phial" class:vertical class:low={lives === 1} role="img" aria-label="{lives} {lives === 1 ? 'life' : 'lives'} left">
  <span class="body">
    {#each CHAMBERS as k (k)}
      <span class="chamber c{k}" data-k={k} class:lit={k < lives} class:draining={k === draining && k >= lives}>
        {#if k < lives}
          <span class="wisp"></span>
          <span class="beat"></span>
          {#if surge}
            {#key surge}<span class="surge" style:animation-delay="{0.08 + k * 0.11}s"></span>{/key}
          {/if}
        {:else if k === draining}
          <span class="drain"></span>
        {/if}
      </span>
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
    /* One unit of the 64 × 12 drawing. */
    --u: calc(var(--w) / 64);
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

  /* Life essence: a soft light, palest at its heart and deepening to rose at
     the glass, with a pale sheen where the glass curves over it. Each chamber
     holds its heart in its own place. Nothing here is animated but the
     layers inside (by transform and opacity only). */
  .chamber.lit,
  .drain {
    --at: 50% 58%;
    background:
      linear-gradient(180deg, rgba(255, 226, 214, 0.45) 0, rgba(255, 226, 214, 0) 24%),
      radial-gradient(ellipse 80% 120% at var(--at), #ffe4cf 0%, #ff8a68 20%, #ec3a48 46%, #9c0f2c 74%, #3c0410 100%);
  }
  .c0.lit {
    --at: 58% 62%;
  }
  .c2.lit {
    --at: 40% 52%;
  }
  /* The last life: its light sinks to a deeper red. */
  .low .chamber.lit {
    background:
      linear-gradient(180deg, rgba(255, 200, 190, 0.35) 0, rgba(255, 200, 190, 0) 24%),
      radial-gradient(ellipse 80% 120% at var(--at), #ffb49c 0%, #f25a52 20%, #c81e38 46%, #6e0820 74%, #2a030c 100%);
  }

  .wisp,
  .beat,
  .surge,
  .drain {
    position: absolute;
    pointer-events: none;
  }

  /* The heartbeat: the heart of the light swells twice (lub, dub) and rests.
     The same rhythm in every chamber, as there is one life in them. */
  .beat {
    inset: -25% -15%;
    background: radial-gradient(closest-side, rgba(255, 240, 222, 0.8), rgba(255, 150, 110, 0.35) 45%, rgba(255, 90, 80, 0) 100%);
    opacity: 0.3;
    animation: beat 1.3s ease-out infinite;
  }
  .low .beat {
    /* Weaker and quicker: a heart racing on the last life. */
    background: radial-gradient(closest-side, rgba(255, 210, 190, 0.6), rgba(255, 110, 90, 0.3) 45%, rgba(255, 80, 70, 0) 100%);
    animation-duration: 0.82s;
  }
  @keyframes beat {
    0% {
      opacity: 0.3;
      transform: scale(0.86);
    }
    11% {
      opacity: 1;
      transform: scale(1.08);
    }
    24% {
      opacity: 0.5;
      transform: scale(0.94);
    }
    35% {
      opacity: 0.85;
      transform: scale(1.03);
    }
    62%,
    100% {
      opacity: 0.3;
      transform: scale(0.86);
    }
  }

  /* The first chamber: a tide. Two pale veils sway to and fro across it, out of step. */
  .c0 .wisp {
    top: 0;
    bottom: 0;
    left: -70%;
    width: 240%;
    background:
      radial-gradient(ellipse 13% 42% at 32% 36%, rgba(255, 236, 206, 0.75), rgba(255, 236, 206, 0) 100%),
      radial-gradient(ellipse 17% 38% at 58% 74%, rgba(255, 170, 120, 0.55), rgba(255, 170, 120, 0) 100%),
      radial-gradient(ellipse 10% 30% at 76% 30%, rgba(255, 226, 190, 0.5), rgba(255, 226, 190, 0) 100%);
    animation: tide 3.4s ease-in-out infinite alternate;
  }
  @keyframes tide {
    from {
      transform: translateX(-16%);
    }
    to {
      transform: translateX(12%);
    }
  }

  /* The second: a swirl. Two wisps circle each other, on an orbit squashed
     flat to the chamber (the wrapper is squashed, its child turns). */
  .c1 .wisp {
    left: 50%;
    top: 50%;
    width: 130%;
    aspect-ratio: 1;
    translate: -50% -50%;
    transform: scaleY(0.42);
  }
  .c1 .wisp::before {
    content: '';
    position: absolute;
    inset: 0;
    background:
      radial-gradient(circle at 26% 50%, rgba(255, 244, 222, 0.9) 0, rgba(255, 190, 150, 0.45) 8%, rgba(255, 190, 150, 0) 17%),
      radial-gradient(circle at 76% 50%, rgba(255, 170, 120, 0.7) 0, rgba(255, 170, 120, 0) 13%);
    animation: swirl 4.6s linear infinite;
  }
  @keyframes swirl {
    to {
      rotate: 360deg;
    }
  }

  /* The third: motes streaming toward the tip, on two spacings that never
     line up. The field slides exactly one shared period, so it loops unseen. */
  .c2 .wisp {
    top: 0;
    bottom: 0;
    left: calc(var(--u) * -18);
    right: 0;
    background:
      radial-gradient(circle, rgba(255, 246, 226, 0.95) 0 calc(var(--u) * 0.42), transparent calc(var(--u) * 0.9)) 0 calc(var(--u) * 1.3) / calc(var(--u) * 6) calc(var(--u) * 5.3),
      radial-gradient(circle, rgba(255, 190, 150, 0.85) 0 calc(var(--u) * 0.36), transparent calc(var(--u) * 0.85)) calc(var(--u) * 2.4) calc(var(--u) * 4.4) / calc(var(--u) * 9) calc(var(--u) * 7.6),
      radial-gradient(circle, rgba(255, 228, 196, 0.8) 0 calc(var(--u) * 0.3), transparent calc(var(--u) * 0.8)) calc(var(--u) * 11) calc(var(--u) * 2.6) / calc(var(--u) * 18) calc(var(--u) * 6.1);
    animation: stream 1.9s linear infinite;
  }
  @keyframes stream {
    to {
      transform: translateX(calc(var(--u) * 18));
    }
  }

  /* A question survived: a wave of light runs through the lit chambers toward the end. */
  .surge {
    top: 0;
    bottom: 0;
    left: -100%;
    width: 100%;
    background: linear-gradient(90deg, rgba(255, 250, 240, 0), rgba(255, 250, 240, 0.9) 55%, rgba(255, 250, 240, 0));
    animation: surge 0.7s ease-in-out both;
  }
  @keyframes surge {
    from {
      transform: translateX(0);
    }
    to {
      transform: translateX(200%);
    }
  }

  /* A life just lost: its light flares and pours out of the end of the
     chamber (toward the tip, the way the phial jets it out), its tail thinning. */
  .drain {
    top: 0;
    bottom: 0;
    left: -45%;
    width: 145%;
    -webkit-mask-image: linear-gradient(90deg, transparent, #000 31%);
    mask-image: linear-gradient(90deg, transparent, #000 31%);
    animation: pour 1s cubic-bezier(0.4, 0, 0.75, 0.7) both;
  }
  .drain::after {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse 70% 90% at 60% 55%, #fff4e0, rgba(255, 214, 170, 0.6) 70%, rgba(255, 190, 150, 0.3));
    animation: flare 0.55s ease-out both;
  }
  @keyframes pour {
    0%,
    8% {
      transform: translateX(0);
    }
    100% {
      transform: translateX(100%);
    }
  }
  @keyframes flare {
    0% {
      opacity: 0;
    }
    18% {
      opacity: 0.75;
    }
    100% {
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .wisp,
    .wisp::before,
    .beat,
    .surge {
      animation: none;
    }
    .surge,
    .drain {
      display: none;
    }
  }
  /* Effects off (the low-power mode): the light glows but holds still. */
  :global(html[data-still]) .wisp,
  :global(html[data-still]) .wisp::before,
  :global(html[data-still]) .beat {
    animation-play-state: paused;
  }
</style>
