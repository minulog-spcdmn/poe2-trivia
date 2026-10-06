<script lang="ts">
  // Delve: a player's lives as an engraved phial of three chambers of life
  // essence. A lit chamber holds a soft living light that beats like a heart
  // (all three in one rhythm), each with a motion of its own: a tide swaying
  // to and fro, a swirl of two wisps, two glows kindling in turn. Spent
  // ones are dark glass. They go dark from the end (the top, when the phial
  // stands upright on a phone). The light of a life just lost flares and
  // pours out of the end of its chamber; Scoreboard.svelte jets it out of the
  // phial into the effects layer (lifeLost in lib/fx/moments.ts) as it does.
  // Azurite Wards, which break before a life does, encase the chambers in
  // crystal from the base, one each (CASINGS in lib/inventoryArt.ts), and a
  // shard toward the next ward is half a casing. At rest the crystal is cold
  // and alive in its own way, not the life's: its glaze breathes slowly, and
  // now and then light runs along its lit band and twinkles at its end, each
  // casing on a rhythm of its own. A ward forming crystallises onto its
  // chamber; one breaking in place of a life shatters where it is, in a
  // burst of blue (wardShattered in lib/fx/moments.ts throws the sparks all
  // round it), the outermost first. The flares and dynamite a player carries
  // stand counted beside the phial lying down (Inventory.svelte); upright, the
  // scoreboard shows them by the avatar.
  import { DELVE_LIVES, type Inventory as Carried } from '../lib/delve';
  import { CASINGS, vesselLabel, type Casing, type InventoryMoment } from '../lib/inventoryArt';
  import Inventory from './Inventory.svelte';

  let {
    lives,
    draining = -1,
    surge = 0,
    vertical = false,
    inv = null,
    moment = null,
    expect = null,
  }: {
    lives: number;
    /** The chamber (0 to 2) of the life just lost, while it pours out; -1 otherwise. */
    draining?: number;
    /** Changes each time a wave of light should run through the lit chambers (a question survived). */
    surge?: number;
    vertical?: boolean;
    /** What the player carries (its wards and shards on the chambers; lying, its flares and dynamite beside it). */
    inv?: Carried | null;
    /** What just happened to it, to play on it. */
    moment?: InventoryMoment | null;
    /** A flare or dynamite on its way to it (Inventory.svelte keeps its place). */
    expect?: 'flare' | 'dynamite' | null;
  } = $props();

  const CHAMBERS = Array.from({ length: DELVE_LIVES }, (_, k) => k);
  const uid = $props.id();

  type Cased = { k: number; kind: 'whole' | 'shard' | 'ghost'; fresh: boolean };
  /** The casings on the chambers: whole wards from the base, a shard after them, and wards just broken bursting off. */
  const casings = $derived.by((): Cased[] => {
    const wards = inv?.wards ?? 0;
    const m = moment?.kind;
    const out: Cased[] = [];
    for (let k = 0; k < Math.min(wards, CASINGS.length); k++) out.push({ k, kind: 'whole', fresh: (m === 'ward' || m === 'forge') && k === wards - 1 });
    if (inv?.shards && wards < CASINGS.length) out.push({ k: wards, kind: 'shard', fresh: m === 'shard' });
    if (m === 'shatter') for (let k = wards; k < Math.min(wards + (moment?.n ?? 1), CASINGS.length); k++) out.push({ k, kind: 'ghost', fresh: true });
    return out;
  });
</script>

<!-- One casing drawn in the phial's units, its glaze and front edges clipped to the chamber's hollow. -->
{#snippet art(c: Casing, id: string, idle = false)}
  <defs>
    <linearGradient id="{id}-g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#8cc4ff" stop-opacity="0.6" />
      <stop offset="0.32" stop-color="#8cc4ff" stop-opacity="0.1" />
      <stop offset="0.68" stop-color="#3f7fe0" stop-opacity="0.1" />
      <stop offset="1" stop-color="#3f7fe0" stop-opacity="0.6" />
    </linearGradient>
    <clipPath id="{id}-h"><path d={c.hollow} /></clipPath>
    {#if c.clip}<clipPath id="{id}-c"><path d={c.clip} /></clipPath>{/if}
  </defs>
  <g clip-path={c.clip ? `url(#${id}-c)` : undefined}>
    <g clip-path="url(#{id}-h)">
      <path class="glaze" d={c.hollow} fill="url(#{id}-g)" />
      <path class="front" d={c.front} />
    </g>
    {#each c.faces as face, i (i)}
      <path class="face {face.tone}" d={face.d} />
    {/each}
    <path class="hatch" d={c.hatch} />
    <path class="edges" d={c.edges} />
    <path class="catch" d={c.catch} />
    {#if idle}
      <!-- At rest: light runs along the crystal's lit band and twinkles where it ends. -->
      <path class="glint" pathLength="100" d={c.catch} />
      <path class="twinkle" d="M{c.twinkle[0] - 1.5} {c.twinkle[1]}h3M{c.twinkle[0]} {c.twinkle[1] - 1.5}v3" />
    {/if}
    <path class="rim" d={c.rim} />
  </g>
  {#if c.crack}<path class="crack" d={c.crack} />{/if}
{/snippet}

<!-- The phial is drawn lying down (64 × 12); upright it is turned a quarter. -->
<span class="vessel" class:vertical role="img" aria-label={vesselLabel(lives, inv)}>
  <span class="phial" class:vertical class:low={lives === 1}>
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
      {#each casings as c (`${c.kind}${c.k}${c.kind === 'ghost' ? moment?.key : ''}`)}
        {@const set = CASINGS[c.k]}
        <span
          class="casing {c.kind}"
          class:fresh={c.fresh}
          class:forged={c.fresh && moment?.kind === 'forge'}
          data-k={c.k}
          style:--from={set.whole.from}
          style:--to={set.whole.to}
          style:--k={c.k}
        >
          {#if c.kind === 'ghost'}
            {#each set.pieces as piece, i (i)}
              <svg class="piece p{i}" viewBox="0 0 64 12" aria-hidden="true">{@render art(piece, `${uid}-x${c.k}${i}`)}</svg>
            {/each}
            <span class="burst"></span>
          {:else}
            {#key c.fresh ? moment?.key : 0}
              <svg class="grow" viewBox="0 0 64 12" aria-hidden="true">{@render art(c.kind === 'whole' ? set.whole : set.shard, `${uid}-${c.kind}${c.k}`, true)}</svg>
              {#if c.fresh}<span class="flash"></span>{/if}
            {/key}
          {/if}
        </span>
      {/each}
    </span>
  </span>
  {#if inv && !vertical}<Inventory {inv} {moment} {expect} />{/if}
</span>

<style>
  .vessel {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    position: relative;
  }
  .vessel.vertical {
    display: block;
  }
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

  /* The third: a kindling. Two soft glows swell and fade in turn, each
     drifting a little toward the tip as it brightens, like breath on embers. */
  .c2 .wisp {
    inset: 0;
  }
  .c2 .wisp::before,
  .c2 .wisp::after {
    content: '';
    position: absolute;
    inset: -30% -10%;
    opacity: 0;
    animation: kindle 3.8s ease-in-out infinite;
  }
  .c2 .wisp::before {
    background: radial-gradient(ellipse 30% 44% at 34% 42%, rgba(255, 240, 220, 0.85), rgba(255, 180, 140, 0.35) 55%, rgba(255, 180, 140, 0) 100%);
  }
  .c2 .wisp::after {
    background: radial-gradient(ellipse 26% 40% at 58% 64%, rgba(255, 200, 160, 0.7), rgba(255, 150, 110, 0.3) 55%, rgba(255, 150, 110, 0) 100%);
    animation-delay: -1.9s;
  }
  @keyframes kindle {
    0%,
    100% {
      opacity: 0;
      transform: translateX(-6%) scale(0.8);
    }
    50% {
      opacity: 1;
      transform: translateX(4%) scale(1.06);
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


  /* An Azurite Ward: a casing of crystal round a chamber (CASINGS in
     lib/inventoryArt.ts). Its box spans the chamber (--from to --to, in the
     phial's units), so the effects layer aims at the chamber; its drawing is
     the whole phial's, shifted back to line up. Azurite as the finds are
     coloured (ItemGlyph.svelte): deep in shadow, bright where it faces you. */
  .casing {
    --span: calc(var(--to) - var(--from));
    position: absolute;
    top: 0;
    height: 100%;
    left: calc(100% * var(--from) / 64);
    width: calc(100% * var(--span) / 64);
    pointer-events: none;
    --dark: #0f2f70;
    --mid: #2a63c4;
    --lit: #6fb4ff;
    --edge: rgba(214, 236, 255, 0.55);
    --shade: rgba(4, 12, 34, 0.9);
    --catch: #eef8ff;
  }
  .casing svg {
    position: absolute;
    top: 0;
    height: 100%;
    left: calc(-100% * var(--from) / var(--span));
    width: calc(100% * 64 / var(--span));
    overflow: visible;
    filter: drop-shadow(0 0 calc(var(--u) * 0.7) rgba(70, 140, 255, 0.6));
  }
  .face {
    stroke: none;
  }
  .face.dark {
    fill: var(--dark);
  }
  .face.mid {
    fill: var(--mid);
  }
  .face.lit {
    fill: var(--lit);
  }
  .front {
    fill: none;
    stroke: rgba(200, 228, 255, 0.5);
    stroke-width: 0.3;
  }
  .casing .hatch {
    fill: none;
    stroke: var(--shade);
    stroke-width: 0.3;
    stroke-linecap: round;
  }
  .casing .edges {
    fill: none;
    stroke: var(--edge);
    stroke-width: 0.32;
    stroke-linecap: round;
  }
  .catch {
    fill: none;
    stroke: var(--catch);
    stroke-width: 0.4;
    stroke-linecap: round;
    opacity: 0.8;
  }
  .rim {
    fill: none;
    stroke: #c9a45c;
    stroke-width: 0.5;
    stroke-linejoin: miter;
    stroke-miterlimit: 12;
  }
  .crack {
    fill: none;
    stroke: var(--catch);
    stroke-width: 0.45;
    stroke-linejoin: miter;
  }

  /* A ward forming crystallises onto its chamber: the casing closes in round
     it from wide and short, growing from the base end, and a cold light
     flashes in it as it settles (with a glint from the effects layer). A
     shard grows the same, as far as it reaches. */
  .fresh .grow {
    /* The chamber's base end, in the drawing's box (the whole phial's). */
    transform-origin: calc(100% * var(--from) / 64) 50%;
    animation: encase 0.75s cubic-bezier(0.2, 0.9, 0.3, 1.2) both;
  }
  .forged .grow {
    animation-duration: 1s;
  }
  @keyframes encase {
    from {
      opacity: 0;
      transform: scale(0.2, 2.2);
    }
    45% {
      opacity: 1;
    }
  }
  .flash {
    position: absolute;
    inset: -70% -10%;
    background: radial-gradient(closest-side, rgba(225, 240, 255, 0.95), rgba(110, 175, 255, 0.45) 50%, rgba(110, 175, 255, 0) 100%);
    animation: flash 0.9s ease-out 0.2s both;
  }
  .forged .flash {
    inset: -120% -25%;
    animation-duration: 1.2s;
  }
  @keyframes flash {
    from {
      opacity: 0;
      transform: scale(0.4);
    }
    25% {
      opacity: 1;
    }
    to {
      opacity: 0;
      transform: scale(1.15);
    }
  }

  /* At rest: the crystal's own cold life (in step with nothing in the
     chambers). Its glaze breathes slowly; a glint of light runs along its lit
     band, base to tip, and twinkles where the band ends; then it rests.
     Each casing keeps its own time (--k), so the light wanders from one to
     another rather than beating together. Opacity, dash offset and transform
     only. */
  .grow .glaze {
    animation: cold calc(4.2s + var(--k) * 0.9s) ease-in-out calc(var(--k) * -1.7s) infinite alternate;
  }
  @keyframes cold {
    from {
      opacity: 0.65;
    }
    to {
      opacity: 1;
    }
  }
  .glint {
    fill: none;
    stroke: #f4fbff;
    stroke-width: 0.55;
    stroke-linecap: round;
    stroke-dasharray: 16 300;
    stroke-dashoffset: 16;
    filter: drop-shadow(0 0 0.6px rgba(160, 210, 255, 0.9));
    animation: glint calc(5.2s + var(--k) * 1.3s) cubic-bezier(0.45, 0, 0.6, 1) calc(1.1s + var(--k) * 1.9s) infinite;
  }
  @keyframes glint {
    0% {
      stroke-dashoffset: 16;
    }
    16%,
    100% {
      stroke-dashoffset: -100;
    }
  }
  .twinkle {
    fill: none;
    stroke: #f4fbff;
    stroke-width: 0.35;
    stroke-linecap: round;
    transform-box: fill-box;
    transform-origin: center;
    opacity: 0;
    animation: twinkle calc(5.2s + var(--k) * 1.3s) ease-out calc(1.1s + var(--k) * 1.9s) infinite;
  }
  @keyframes twinkle {
    0%,
    13% {
      opacity: 0;
      transform: scale(0.2) rotate(0deg);
    }
    17% {
      opacity: 1;
      transform: scale(1) rotate(25deg);
    }
    26%,
    100% {
      opacity: 0;
      transform: scale(0.3) rotate(45deg);
    }
  }

  /* A ward breaking in place of a life shatters where it is: the crystal
     flares white-blue, swells a little and bursts into light round its
     chamber (the effects layer throws blue sparks all round it). Nothing
     flies off: the halves part only as far as the swell takes them. The
     light inside is untouched. */
  .piece {
    transform-origin: calc(100% * (var(--from) + var(--to)) / 128) 50%;
    animation: shatter 0.5s cubic-bezier(0.2, 0.7, 0.4, 1) both;
  }
  @keyframes shatter {
    0% {
      opacity: 1;
      transform: none;
      filter: brightness(1);
    }
    22% {
      opacity: 1;
      transform: scale(1.05, 1.12);
      filter: brightness(2.4);
    }
    to {
      opacity: 0;
      transform: scale(1.18, 1.5);
      filter: brightness(1.6);
    }
  }
  .burst {
    position: absolute;
    inset: -110% -22%;
    pointer-events: none;
    background: radial-gradient(closest-side, rgba(235, 246, 255, 0.95), rgba(110, 175, 255, 0.55) 45%, rgba(110, 175, 255, 0) 100%);
    animation: burst 0.55s ease-out both;
  }
  @keyframes burst {
    from {
      opacity: 0;
      transform: scale(0.5);
    }
    20% {
      opacity: 1;
    }
    to {
      opacity: 0;
      transform: scale(1.25);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .grow,
    .flash,
    .piece,
    .burst {
      animation: none;
    }
    .flash,
    .ghost {
      display: none;
    }
    .wisp,
    .wisp::before,
    .c0 .wisp,
    .c1 .wisp::before,
    .c2 .wisp::before,
    .c2 .wisp::after,
    .beat,
    .surge,
    .grow .glaze,
    .glint,
    .twinkle {
      animation: none;
    }
    .surge,
    .drain {
      display: none;
    }
    /* The kindle's glows rest at 0 between breaths; hold them softly lit. */
    .c2 .wisp::before,
    .c2 .wisp::after {
      opacity: 0.6;
      transform: none;
    }
  }
  /* Effects off (the low-power mode): the light glows but holds still. */
  :global(html[data-still]) .wisp,
  :global(html[data-still]) .wisp::before,
  :global(html[data-still]) .c0 .wisp,
  :global(html[data-still]) .c1 .wisp::before,
  :global(html[data-still]) .beat,
  :global(html[data-still]) .grow .glaze {
    animation-play-state: paused;
  }
  :global(html[data-still]) .c2 .wisp::before,
  :global(html[data-still]) .c2 .wisp::after {
    animation: none;
    opacity: 0.6;
    transform: none;
  }
  :global(html[data-still]) .glint,
  :global(html[data-still]) .twinkle {
    display: none;
  }
  :global(html[data-still]) .flash {
    display: none;
  }
</style>
