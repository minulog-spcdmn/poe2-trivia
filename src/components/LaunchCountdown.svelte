<script lang="ts" module>
  import { ARCH, BOX, CLOSE, GLADIATOR_LINES, GLASS, PLINTH, SAND_AT, SEALS, SHADOW_LINES, SHADOW_RELIEF, WAIST, type Box, type Line } from '../lib/hourglass';

  const viewBox = (b: Box) => `${b.x} ${b.y} ${b.w} ${b.h}`;
  /** The waist's height in the box shown (a CSS percentage), where the grains start to fall. */
  const waistAt = (b: Box) => `${(((WAIST - b.y) / b.h) * 100).toFixed(3)}%`;
  /** How long after it mounts the pen starts: with the start page's fade (Home.svelte). */
  const DELAY = 0.45;
</script>

<script lang="ts">
  // Path of Exile 2's 1.0 (lib/launch.ts), drawn: an engraved hourglass on a
  // plinth between the Gladiator and the Shadow (lib/hourglass.ts), its sand
  // the time from GGG's announcement to the launch, and under it in words how
  // long is left. The last grains fall to the last second, and over the last
  // day the Shadow comes out of the hourglass's shadow, into the light at the
  // launch, when the sand has run.
  // At the top of the start page between its columns, and in the header beside
  // its buttons wherever the window has room for it (Home.svelte, App.svelte);
  // in the header (`quiet`) the hourglass alone, as high as the buttons, its
  // words beside it.
  // Drawn in as the rune circles are, by their pen (lib/drawIn): the plinth,
  // the hourglass from its foot up, the two classes, then the shading, the
  // arch, Sol and Luna stamped in, the script written and the sand poured;
  // its glow swells and then breathes, as theirs does (docs/arcane-style.md,
  // "Motion"), and a grain falls now and then, but neither with the battery
  // saver on.
  // A click opens GGG's announcement; its note, on hover or focus, says when,
  // as exactly as GGG has said.
  // The time is the site's to the second (lib/clock's `exact`: the server's,
  // so a device whose clock is out, if only by seconds, still counts right),
  // looked at again just past each change, and
  // at once when the tab is looked at again or the device is back online.
  import { onMount, untrack } from 'svelte';
  import { clock, WITHIN_A_SECOND_MS } from '../lib/clock';
  import { drawIn, type Pen } from '../lib/drawIn';
  import { sand } from '../lib/hourglass';
  import { countdown, dawn, figure, launchWhen, LAUNCH_AT, LAUNCH_DAY, LAUNCH_SOURCE, progress, untilChange } from '../lib/launch';
  import { motion } from '../lib/motion.svelte';

  let {
    quiet = false,
    at: launchAt = LAUNCH_AT,
    time = () => clock.exact(),
  }: {
    /** In the header: the hourglass alone, smaller, its words beside it. */
    quiet?: boolean;
    /** The QA desk's bench only (src/qa/benches/launch.ts): another launch, and a clock set where it wants. */
    at?: number | null;
    time?: () => number;
  } = $props();
  const uid = $props.id();

  let now = $state(untrack(() => time()));
  const shown = $derived(countdown(now, launchAt));
  const fig = $derived(shown && figure(shown));
  /**
   * In the header, its words held to their widest while the figure counts in the same unit (a 0, Cinzel's widest
   * digit, in each place it can have, and the plural), so the drawing beside them never shifts as it ticks down:
   * Cinzel has no even digits to ask for.
   */
  const widest = $derived(
    shown && fig && fig.n !== null && { n: '0'.repeat(shown.kind === 'left' ? 3 : String(fig.n).length), until: fig.until.replace(/s? until$/, 's until') },
  );
  /** On the day itself, its hour not named, a pinch is still to fall; from the launch, none. */
  const grains = $derived(sand(shown?.kind === 'out' ? 0 : shown?.kind === 'today' ? 0.004 : 1 - progress(now, launchAt)));
  const light = $derived(shown ? dawn(shown) : 0);
  const stream = $derived(grains.stream ? `M0 ${grains.stream.from}V${grains.stream.to}` : '');
  const box = $derived(quiet ? CLOSE : BOX);
  /** The drawing's height, in px. */
  const height = $derived(quiet ? 38 : 125);
  /** The stream's fall, in px. */
  const fall = $derived(grains.stream ? (grains.stream.to - grains.stream.from) * (height / box.h) : 0);
  /** Its words as they show, then the game's whole name. */
  const label = $derived(fig && `${fig.n === null ? `PoE2 1.0 ${fig.until}` : `${fig.n} ${fig.until} PoE2 1.0`} (Path of Exile 2)`);
  const note = $derived(
    shown?.kind === 'out'
      ? `Path of Exile 2 left Early Access on ${launchWhen(LAUNCH_DAY, launchAt)}.`
      : `Path of Exile 2 leaves Early Access on ${launchWhen(LAUNCH_DAY, launchAt)}.${launchAt === null ? ' Grinding Gear Games haven’t named the hour yet.' : ''}`,
  );

  // The pen, timed from the mount: an SVG put on the page later (the bench's
  // header view) is drawn as far in as it is, which is to say at once. In the
  // header, set down whole: it comes with the header at every game, which is
  // no place for a show.
  const start = untrack(() => quiet) ? -Infinity : performance.now() + 1000 * DELAY;
  let pen: Pen | undefined;
  const drawn = (svg: SVGSVGElement) => void (pen ??= drawIn(start)).add(svg);

  onMount(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    // (An ask of the clock's still out when it goes would set the timer again after it's cleared.)
    let gone = false;
    const tick = () => {
      if (gone) return;
      now = time();
      clearTimeout(t);
      // (At least each minute: a timer stands still while the device sleeps, and a page woken in sight isn't told.)
      t = setTimeout(refresh, Math.min(untilChange(now, launchAt), 60_000));
    };
    const refresh = () => {
      tick();
      void clock.refresh(WITHIN_A_SECOND_MS)?.then(tick);
    };
    refresh();
    const seen = () => document.visibilityState === 'visible' && refresh();
    const online = () => void clock.sync().then(tick);
    document.addEventListener('visibilitychange', seen);
    addEventListener('online', online);
    return () => {
      gone = true;
      clearTimeout(t);
      document.removeEventListener('visibilitychange', seen);
      removeEventListener('online', online);
      pen?.stop();
    };
  });
</script>

<!-- Lines as the pen draws them: a dash run out, or (ink) set down whole. -->
{#snippet lines(list: Line[])}
  {#each list as l, k (k)}
    {#if l.ink}
      <path d={l.d} class="draw ink {l.w}" style:--d="{l.at}s" />
    {:else}
      <path d={l.d} class="draw {l.w}" style:--d="{l.at}s" style:--t="{l.t}s" pathLength="100" />
    {/if}
  {/each}
{/snippet}

<!-- The engraving, the same in its glow and its lines. The sand's paths stay on the page, empty or not, for the pen. -->
{#snippet engraving()}
  {#if !quiet}{@render lines(PLINTH)}{/if}
  {@render lines(GLASS)}
  <path d={grains.fill} class="draw ink sand" style:--d="{SAND_AT}s" />
  <path d={grains.thin} class="draw ink thin" style:--d="{SAND_AT}s" />
  <path d={grains.hatch} class="draw ink hatch" style:--d="{SAND_AT}s" />
  <path d={stream} class="draw ink stream" style:--d="{SAND_AT + 0.25}s" />
  {#if !quiet}
    {@render lines(GLADIATOR_LINES)}
    <g class="shadow" style:opacity={0.5 + 0.5 * light}>{@render lines(SHADOW_LINES)}</g>
    <g class="relief" style:opacity={light}>{@render lines(SHADOW_RELIEF)}</g>
    {@render lines(ARCH.rules)}
    {#each ARCH.marks as m, k (k)}<path d={m.d} transform={m.transform} class="mark sign" style:--d="{m.at}s" />{/each}
    {#each SEALS as s, k (k)}
      <g class="seal" style:--d="{s.at}s">
        {#each s.lines as l, j (j)}<path d={l.d} class={l.w} />{/each}
      </g>
    {/each}
  {/if}
{/snippet}

{#if shown && fig}
  <a class="launch" class:quiet href={LAUNCH_SOURCE} target="_blank" rel="noopener noreferrer" aria-label={label} aria-describedby="{uid}-note">
    {#key quiet}
      <span class="art" style:height="{height}px" style:aspect-ratio="{box.w} / {box.h}" aria-hidden="true">
        <svg class="glow" viewBox={viewBox(box)} use:drawn>{@render engraving()}</svg>
        <svg class="lines" viewBox={viewBox(box)} use:drawn>{@render engraving()}</svg>
        {#if grains.stream && !quiet && !motion.resting}
          <span class="grain" style:top={waistAt(box)} style:--fall="{fall}px"></span>
        {/if}
      </span>
    {/key}
    <span class="words">
      {#if fig.n !== null}
        <span class="count"><b class="n">{fig.n}</b> <span class="until">{fig.until}</span></span>
        <span class="name">PoE2 1.0</span>
        {#if quiet && widest}
          <span class="count widest" aria-hidden="true"><b class="n">{widest.n}</b> <span class="until">{widest.until}</span></span>
        {/if}
      {:else}
        <span class="name">PoE2 1.0</span>
        <span class="until">{fig.until}</span>
      {/if}
    </span>
    <span class="note" id="{uid}-note" role="tooltip">{note}</span>
  </a>
{/if}

<style>
  .launch {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.15rem;
    white-space: nowrap;
    text-decoration: none;
    color: inherit;
  }
  .launch.quiet {
    flex-direction: row;
    gap: 0.6rem;
  }

  /* The engraving: gold lines over a soft glow of the same. */
  .art {
    position: relative;
    display: block;
    color: #d9a45a;
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
  svg path {
    vector-effect: non-scaling-stroke;
  }
  .lines {
    opacity: 0.62;
  }
  .main {
    stroke-width: 0.85px;
  }
  .thin {
    stroke-width: 0.65px;
  }
  .hair {
    stroke-width: 0.45px;
  }
  .hatch {
    stroke-width: 0.4px;
    stroke-linecap: round;
  }
  .sign {
    stroke-width: 0.6px;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  /* The sand laid in solid under its hatching, so how much is left reads at a glance; the stream a line of it. */
  .sand {
    fill: currentColor;
    fill-opacity: 0.4;
    stroke: none;
  }
  .stream {
    stroke-width: 1px;
  }

  /* The glow: the same strokes, wide and faint. It swells up as the lines are
     drawn, then breathes as the circles' does (ArcaneStage's arcane-glow-in
     and arcane-breathe, here as well, since this may be on the page before
     any circle), on its own layer, so it never paints again; with the
     battery saver, and in the header, where a game is played, it swells and
     rests. */
  .glow {
    opacity: 0.22;
    animation:
      glow-in 1.4s 1.2s ease-out both,
      breathe 6s 2.6s ease-in-out infinite alternate;
  }
  :global(html[data-saver]) .glow,
  .quiet .glow {
    animation: glow-in 1.4s 1.2s ease-out both;
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
  .glow path {
    stroke-width: 2px;
  }
  .glow :is(.hair, .hatch, .stream) {
    stroke-width: 1px;
  }
  .glow .sand {
    display: none;
  }

  /* The Shadow in the hourglass's shadow, only his outline, dim, till the last day; then by the hour out into the
     light, his relief cut (its opacity set from launch.ts's dawn). */
  .shadow,
  .relief {
    transition: opacity 1.2s;
  }

  /* The pen (lib/drawIn) draws it in: each line hidden till it reaches it, its
     dash run out, then solid; the shading, the signs and the sand set down,
     fading in; Sol and Luna pressed in like a stamp, from larger. */
  .draw:not(.ink) {
    stroke-dasharray: 100;
    stroke-dashoffset: 100;
    visibility: hidden;
  }
  .draw.ink {
    opacity: 0;
  }
  .mark {
    stroke-opacity: 0;
  }
  g.seal {
    opacity: 0;
    transform: scale(1.6);
    transform-box: fill-box;
    transform-origin: center;
  }

  /* A grain now and then, falling through the waist down the stream: a short stroke of the lines' gold, on a layer
     of its own, moved and faded, never painted again; none in the header, where a game is played. */
  .grain {
    position: absolute;
    left: 50%;
    width: 1px;
    height: 2.5px;
    margin-left: -0.5px;
    background: currentColor;
    opacity: 0;
    animation: fall 1.8s 2s infinite;
  }
  @keyframes fall {
    0% {
      opacity: 0;
      transform: none;
      animation-timing-function: cubic-bezier(0.5, 0, 1, 1);
    }
    6% {
      opacity: 0.7;
    }
    36% {
      opacity: 0.5;
      transform: translateY(var(--fall));
    }
    40%,
    100% {
      opacity: 0;
      transform: translateY(var(--fall));
    }
  }

  /* How long, in words: the figures in Cinzel and gold, what they count in the italic, the name in Cinzel;
     in the header, on two lines as high as the drawing. */
  .words {
    display: flex;
    align-items: baseline;
    gap: 0.35em;
    line-height: 1.2;
  }
  .quiet .words {
    flex-direction: column;
    align-items: flex-start;
    gap: 0;
    line-height: 1.1;
  }
  /* (Its width alone: no height, nothing seen.) */
  .widest {
    height: 0;
    overflow: hidden;
    visibility: hidden;
  }
  .n {
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 1.05rem;
    color: var(--gold);
  }
  .until {
    font-family: var(--font-body);
    font-style: italic;
    font-size: 0.95rem;
    color: var(--note);
  }
  .name {
    font-family: var(--font-cinzel);
    font-size: 0.86rem;
    letter-spacing: 0.12em;
    color: var(--text-lo);
    transition: color 0.2s;
  }
  .launch:hover .name,
  .launch:focus-visible .name {
    color: var(--gold-hi);
  }

  /* Its note under it, as the footer's tip is over its pill (SiteFooter.svelte): in the middle, or in the
     header its right edge on the piece's. */
  .note {
    position: absolute;
    z-index: 2;
    left: 50%;
    top: calc(100% + 10px);
    width: 270px;
    margin-left: -135px;
    translate: 0 -4px;
    padding: 0.55rem 0.8rem;
    font-family: var(--font-body);
    font-size: 15px;
    font-style: italic;
    white-space: normal;
    line-height: 1.35;
    color: var(--text);
    background: rgba(12, 10, 8, 0.96);
    border: 1px solid var(--gold-lo);
    border-radius: 4px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition:
      opacity 0.2s,
      translate 0.2s var(--ease-out),
      visibility 0s 0.2s;
  }
  .quiet .note {
    left: auto;
    right: 0;
    margin-left: 0;
  }
  .launch:hover .note,
  .launch:focus-visible .note {
    opacity: 1;
    visibility: visible;
    translate: 0 0;
    transition:
      opacity 0.2s,
      translate 0.2s var(--ease-out);
  }
</style>
