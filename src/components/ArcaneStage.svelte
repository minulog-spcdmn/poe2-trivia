<script module lang="ts">
  import { untrack, type Snippet } from 'svelte';
  import type { Plate } from '../lib/engraver';

  /**
   * One layer of a rune circle: its lines drawn twice, worn (`lines`) and
   * whole for the glow under them (`glow`), and, if it turns, how: once
   * round in `turn` seconds, the other way if `reverse`, after winding in
   * from `from` degrees. `tint`: a colour its lines lean toward (mixed with
   * the circle's own, so they still warm and cool with it), as the Delve
   * circle's azurite is blue.
   *
   * A layer can ride `within` another (named), turning or swaying about its
   * own `pivot` (a point in the plate, -100 to 100) as its parent carries it
   * round: a seal turning in its ring, a bud swaying on its stem. `sway`:
   * back and forth `swing` degrees either side, once in `period` seconds.
   * `upright`: it turns back against its parent as fast as the parent turns,
   * so it travels round with it but keeps facing the same way (a sun or a
   * moon, which have a right way up). `breathe`: it swells and shrinks about
   * its pivot (the centre, unless given) between full size and `low`, once
   * each way in `period` seconds, so rays seem to lengthen and shorten.
   * `flutter`: once every `period` seconds it narrows toward its pivot to
   * `fold` of its width and back, twice in quick succession, as a resting
   * moth stirs its wings. `mask`: its lines stop short of the shape `d`
   * (grown by `grow`) as that turns with the layer named `with`, so a ray
   * gives way to a head only while the head passes over it. Each is still a
   * box of its own, moved on the compositor.
   */
  export type StageLayer = {
    name: string;
    lines: Plate;
    glow: Plate;
    spin?: { turn: number; from: number; reverse?: boolean };
    tint?: string;
    within?: string;
    pivot?: [number, number];
    sway?: { swing: number; period: number; delay?: number };
    upright?: boolean;
    breathe?: { low: number; period: number; delay?: number };
    flutter?: { fold: number; period: number; delay?: number };
    mask?: { d: string; grow: number; with: string };
  };

  /** How long before its first line draws a layer's lines go on the page (s). */
  const AHEAD = 0.2;
</script>

<script lang="ts">
  // The stage the rune circles are set on (ArcaneCircle, MonadCircle; see
  // docs/arcane-style.md): their layers, each turned as a whole so the
  // browser can spin it on the compositor without repainting, with the glow
  // a soft, wide copy of the strokes underneath rather than a filter (which
  // would repaint); the light that blooms as a circle is summoned and flares
  // at a right answer; the jar of a wrong one. `heart` is what stays still at
  // the centre, drawn by the circle itself; `point`, a solid point at the
  // very centre, set at `delay` (s), that swells at a right answer, shrinks
  // at a wrong one and beats now and then. `size`, `color` and `strength`
  // (opacity) override the stage defaults for other places, like behind the
  // winner on the victory screen.
  let {
    layers,
    heart,
    point,
    state: mood = 'idle',
    size,
    color,
    strength,
  }: { layers: StageLayer[]; heart?: Snippet; point?: { r: number; delay: number }; state?: 'idle' | 'good' | 'bad'; size?: string; color?: string; strength?: number } = $props();

  /**
   * A layer's mask, as a CSS image: the whole plate, less the shape grown
   * (see StageLayer).
   */
  const maskOf = ({ d, grow }: NonNullable<StageLayer['mask']>) =>
    `url("data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-100 -100 200 200"><mask id="m"><rect x="-100" y="-100" width="200" height="200" fill="#fff"/>` +
        `<path d="${d}" fill="#000" stroke="#000" stroke-width="${2 * grow}" stroke-linejoin="round"/></mask>` +
        `<rect x="-100" y="-100" width="200" height="200" fill="#fff" mask="url(#m)"/></svg>`,
    )}")`;

  // Each layer's lines go on the page a moment before they start to draw,
  // not all on the frame that shows the question; `late` says how long after
  // the circle they came, which their delays leave out, so the summoning
  // plays as if they had been there all along. Once drawn, a layer takes its
  // still copy. Both are timed on the summoning's own clock (its settle
  // animation's), not from when this ran: a slow first frame starts the CSS
  // animations late, and a layer swapped on the page's clock would jump to
  // drawn before its lines had finished.
  const due = (l: StageLayer) => Math.max(0, Math.min(l.lines.start, l.glow.start) - AHEAD);
  // (A circle's layers are fixed: it is drawn once, as it mounts.)
  let late = $state<Record<string, number>>(Object.fromEntries(untrack(() => layers).filter((l) => !due(l)).map((l) => [l.name, 0])));
  let drawn = $state<Record<string, true>>({});
  let summon: HTMLDivElement;
  $effect(() => {
    let timers: ReturnType<typeof setTimeout>[] = [];
    let stopped = false;
    /** Times each layer from `start` (performance.now()'s clock), when the summoning began. */
    const time = (start: number) => {
      if (stopped) return;
      const at = (s: number, fn: () => void) => timers.push(setTimeout(fn, Math.max(0, s * 1000 - (performance.now() - start))));
      for (const l of layers) {
        if (due(l)) at(due(l), () => (late[l.name] = (performance.now() - start) / 1000));
        at(Math.max(l.lines.end, l.glow.end) + 0.15, () => (drawn[l.name] = true));
      }
    };
    // (Its only animation: the circle's settling in.) Moved on the page
    // before it starts, as a dialog's backdrop is to the end of <body>
    // (lib/behindDialog), the circle starts over as new animations and the
    // old one's `ready` rejects: then it's timed from the new one.
    const follow = () => {
      if (stopped) return;
      const settle = summon.getAnimations()[0];
      if (settle) settle.ready.then(() => time(performance.now() - Number(settle.currentTime ?? 0)), follow);
      else time(performance.now());
    };
    follow();
    return () => {
      stopped = true;
      timers.forEach(clearTimeout);
      timers = [];
    };
  });
  const plate = (p: Plate, name: string) => (drawn[name] ? p.still : late[name] === undefined ? '' : p.drawing);
  const lateOf = (name: string) => `${(late[name] ?? 0).toFixed(3)}s`;
</script>

<div class="arcane {mood}" aria-hidden="true" style:--size={size} style:color={color} style:opacity={strength}>
  <div class="summon" bind:this={summon}>
    <div class="bloom"></div>
    {#snippet plain(l: StageLayer)}
      {@const parent = l.upright ? layers.find((p) => p.name === l.within)?.spin : undefined}
      {@const spin = parent ? { turn: parent.turn, from: -parent.from, reverse: !parent.reverse } : l.spin}
      <div
        class="layer"
        class:spin={!!l.spin && !l.within}
        class:turning={!!l.spin && !!l.within}
        class:upright={!!parent}
        class:swaying={!!l.sway}
        class:breathing={!!l.breathe}
        class:fluttering={!!l.flutter}
        style:--turn={spin && `${spin.turn}s`}
        style:--from={spin && `${spin.from}deg`}
        style:--dir={spin && (spin.reverse ? 'reverse' : 'normal')}
        style:--low={l.breathe?.low}
        style:--breath={l.breathe && `${l.breathe.period}s`}
        style:--breath-delay={l.breathe && `${l.breathe.delay ?? 0}s`}
        style:--swing={l.sway && `${l.sway.swing}deg`}
        style:--period={l.sway && `${l.sway.period}s`}
        style:--sway-delay={l.sway && `${l.sway.delay ?? 0}s`}
        style:--fold={l.flutter?.fold}
        style:--flutter={l.flutter && `${l.flutter.period}s`}
        style:--flutter-delay={l.flutter && `${l.flutter.delay ?? 0}s`}
        style:transform-origin={l.pivot && `${(l.pivot[0] + 100) / 2}% ${(l.pivot[1] + 100) / 2}%`}
        style:color={l.tint && `color-mix(in srgb, ${l.tint} 70%, currentColor)`}
      >
        <svg class="glow" viewBox="-100 -100 200 200" style:--late={lateOf(l.name)}>{@html plate(l.glow, l.name)}</svg>
        <svg viewBox="-100 -100 200 200" style:--late={lateOf(l.name)}>{@html plate(l.lines, l.name)}</svg>
        {#each layers.filter((c) => c.within === l.name) as child (child.name)}
          {@render layer(child)}
        {/each}
      </div>
    {/snippet}
    <!-- A masked layer sits in a box that turns with the layer it follows and carries the mask, inside one that turns back the
         same, so the layer keeps its own way and only the mask moves; all on the compositor. -->
    {#snippet layer(l: StageLayer)}
      {@const by = l.mask && layers.find((p) => p.name === l.mask?.with)?.spin}
      {#if l.mask && by}
        <div
          class="layer spin"
          style:--turn="{by.turn}s"
          style:--from="{by.from}deg"
          style:--dir={by.reverse ? 'reverse' : 'normal'}
          style:mask-image={maskOf(l.mask)}
          style:-webkit-mask-image={maskOf(l.mask)}
        >
          <div class="layer upright" style:--turn="{by.turn}s" style:--from="{-by.from}deg" style:--dir={by.reverse ? 'normal' : 'reverse'}>
            {@render plain(l)}
          </div>
        </div>
      {:else}
        {@render plain(l)}
      {/if}
    {/snippet}
    {#each layers.filter((l) => !l.within) as l (l.name)}
      {@render layer(l)}
    {/each}
    {@render heart?.()}
    {#if point}
      <div class="layer point" style:--set="{point.delay}s">
        <svg class="glow" viewBox="-100 -100 200 200"><circle r={point.r} class="dot" /></svg>
        <svg viewBox="-100 -100 200 200"><circle r={point.r} class="dot" /></svg>
      </div>
    {/if}
    <div class="wave"></div>
  </div>
</div>

<style>
  .arcane {
    position: absolute;
    inset: 0;
    margin: auto;
    /* The stage is a size container (see QuestionView). */
    width: var(--size, min(92cqw, 92cqh, 420px));
    height: var(--size, min(92cqw, 92cqh, 420px));
    pointer-events: none;
    opacity: 0.22;
    color: #d9a45a;
    /* Only the opacity eases (on the compositor). The colour changes at
       once: every stroke of the circle takes it (currentColor), and easing
       it restyled and repainted each of those hundreds of strokes every
       frame for most of a second, right as a reveal's effects began, which
       made them stutter. The reveal's flare covers the change. */
    transition: opacity 0.8s;
    --draw-ease: cubic-bezier(0.55, 0, 0.25, 1);
  }
  .arcane.good {
    opacity: 0.3;
    color: #d8dfa0;
  }
  .arcane.bad {
    opacity: 0.16;
    color: #d98a6e;
  }
  /* A circle's heart (its own markup) is laid out as a layer too. */
  .summon,
  .summon :global(.layer),
  .summon :global(svg),
  .bloom,
  .wave {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  /* The whole circle settles in from a touch larger as it is drawn. */
  .summon {
    animation: settle 2.4s var(--ease-out) both;
  }
  .summon :global(.layer) {
    will-change: transform;
    mask-size: 100% 100%;
    mask-repeat: no-repeat;
    -webkit-mask-size: 100% 100%;
    -webkit-mask-repeat: no-repeat;
  }

  /* Each ring turns its own way and speed, and first winds into place. */
  .spin {
    animation:
      turn var(--turn) linear infinite var(--dir, normal),
      wind 2.6s var(--ease-out) both;
  }
  /* A layer riding another turns about its own pivot, or sways on it. */
  .turning {
    animation: turn var(--turn) linear infinite var(--dir, normal);
  }
  .swaying {
    animation: sway var(--period) var(--sway-delay) ease-in-out infinite alternate;
  }
  /* Turned back against its parent, wind and all, so it keeps its way up. */
  .upright {
    animation:
      turn var(--turn) linear infinite var(--dir, normal),
      wind 2.6s var(--ease-out) both;
  }
  .bad .upright {
    animation:
      turn var(--turn) linear infinite var(--dir, normal),
      unfalter 0.7s var(--ease-out) both;
  }
  .breathing {
    animation: swell var(--breath) var(--breath-delay) ease-in-out infinite alternate;
  }
  .fluttering {
    animation: flutter var(--flutter) var(--flutter-delay) ease-in-out infinite;
  }
  /* A wrong answer jars the circle. */
  .bad .spin {
    animation:
      turn var(--turn) linear infinite var(--dir, normal),
      falter 0.7s var(--ease-out) both;
  }

  /* The lines are put on the page as markup (see lib/engraver), so their
     rules reach them as global ones within the circle. */
  .arcane :global(path),
  .arcane :global(circle) {
    fill: none;
    stroke: currentColor;
    stroke-width: 0.5;
    stroke-linecap: butt;
    stroke-linejoin: miter;
    stroke-miterlimit: 12;
  }
  /* A circle has no ends, but its dash for the drawing does. */
  .arcane :global(circle) {
    stroke-linecap: round;
  }
  .arcane :global(.thin) {
    stroke-width: 0.35;
  }
  .arcane :global(.hair) {
    stroke-width: 0.22;
  }
  .arcane :global(.sign) {
    stroke-width: 0.42;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  /* A seal's sign drawn 1.05 times its size, and its line with it. */
  .arcane :global(.big) {
    stroke-width: 0.441;
  }
  .arcane :global(.hatch) {
    stroke-width: 0.2;
    stroke-linecap: round;
  }
  /* The monad's ouroboros, at the descent woodcut's own weights (its 5.8
     and 3.8 px lines, lib/ouroborosArt, drawn at 0.131 of its size), and
     its heads' ink: shapes cut solid, set down once the lines round them are
     drawn. */
  .arcane :global(.ouro) {
    stroke-width: 0.76;
    stroke-linejoin: round;
  }
  .arcane :global(.ouro-divider) {
    stroke-width: 0.5;
    stroke-linejoin: round;
  }
  .arcane :global(.ink) {
    fill: currentColor;
    fill-rule: evenodd;
    stroke: none;
  }
  .arcane :global(.draw.ink) {
    animation: carve 0.6s calc(var(--d, 0s) - var(--late, 0s)) var(--ease-out) both;
  }

  /* The glow: the same strokes, wide and faint, on their own layer so it
     can breathe without repainting. It swells up as the circle is drawn. */
  .arcane :global(.glow) {
    opacity: 0.22;
    animation:
      arcane-glow-in 1.4s 0.8s ease-out both,
      arcane-breathe 6s 2.2s ease-in-out infinite alternate;
  }
  .arcane .summon :global(.glow *) {
    stroke-width: 2;
  }
  .arcane .summon :global(.glow .big) {
    stroke-width: 2.1;
  }
  .arcane .summon :global(.glow .hair),
  .arcane .summon :global(.glow .hatch) {
    stroke-width: 1;
  }
  /* Shapes cut solid glow round their edges as lines do. */
  .arcane .summon :global(.glow .ink) {
    stroke: currentColor;
    stroke-width: 1.4;
  }

  .arcane :global(.draw) {
    stroke-dasharray: 100;
    animation: draw var(--t, 1s) calc(var(--d, 0s) - var(--late, 0s)) var(--draw-ease) both;
  }
  /* A piece of a longer stroke keeps the pen's pace (see stroke()). */
  .arcane :global(.piece) {
    animation-timing-function: linear;
  }
  /* Signs are set down once their lines are drawn. */
  .arcane :global(.carve) {
    animation: carve 0.6s calc(var(--d, 0s) + 0.3s - var(--late, 0s)) var(--ease-out) both;
  }
  /* The script is written mark by mark. */
  .arcane :global(.mark) {
    animation: carve 0.35s calc(var(--d) - var(--late, 0s)) var(--ease-out) both;
  }
  /* Seals are pressed in like a stamp. */
  .arcane :global(.seal) {
    transform-box: fill-box;
    transform-origin: center;
    animation: stamp 0.55s calc(var(--d) - var(--late, 0s)) var(--ease-out) both;
  }

  /* The point at the centre: set last, it beats now and then, swells at a
     right answer and shrinks at a wrong one. */
  .arcane .dot {
    fill: currentColor;
    stroke: none;
    transform-box: fill-box;
    transform-origin: center;
    transition: transform 0.9s var(--ease-out);
  }
  .good .dot {
    transform: scale(1.6);
  }
  .bad .dot {
    transform: scale(0.6);
  }
  .point {
    animation: set 0.6s var(--set) cubic-bezier(0.3, 1.6, 0.5, 1) both;
  }
  .point svg {
    animation: beat 9s 5s infinite;
  }
  .arcane .point .glow {
    animation:
      arcane-glow-in 1.4s 0.8s ease-out both,
      arcane-breathe 6s 2.2s ease-in-out infinite alternate,
      beat 9s 5s infinite;
  }

  /* A light at the centre: it blooms as the circle is summoned and flares
     at a right answer, with a ring of light running out over the circle. */
  .bloom {
    background: radial-gradient(closest-side, color-mix(in srgb, currentColor 55%, transparent), transparent);
    opacity: 0;
    animation: bloom 1.5s ease-out both;
  }
  .good .bloom {
    animation: flare 1.6s ease-out both;
  }
  .wave {
    border: 1.5px solid currentColor;
    border-radius: 50%;
    box-shadow:
      0 0 18px currentColor,
      inset 0 0 18px currentColor;
    opacity: 0;
  }
  .good .wave {
    animation: wave 1.3s var(--ease-out) both;
  }

  @keyframes draw {
    from {
      stroke-dashoffset: 100;
    }
  }
  @keyframes carve {
    from {
      opacity: 0;
    }
  }
  @keyframes stamp {
    from {
      opacity: 0;
      transform: scale(1.6);
    }
  }
  @keyframes settle {
    from {
      transform: scale(1.06);
    }
  }
  @keyframes wind {
    from {
      transform: rotate(var(--from));
    }
  }
  @keyframes falter {
    20% {
      transform: rotate(-2.5deg);
    }
    45% {
      transform: rotate(1.6deg);
    }
    70% {
      transform: rotate(-0.6deg);
    }
  }
  @keyframes unfalter {
    20% {
      transform: rotate(2.5deg);
    }
    45% {
      transform: rotate(-1.6deg);
    }
    70% {
      transform: rotate(0.6deg);
    }
  }
  @keyframes swell {
    from {
      scale: 1;
    }
    to {
      scale: var(--low);
    }
  }
  /* Still most of the time, then two quick stirs. */
  @keyframes flutter {
    0%,
    88%,
    100% {
      scale: 1 1;
    }
    91% {
      scale: var(--fold) 1;
    }
    94% {
      scale: 1 1;
    }
    96.5% {
      scale: calc((1 + var(--fold)) / 2) 1;
    }
    99% {
      scale: 1 1;
    }
  }
  @keyframes sway {
    from {
      rotate: calc(-1 * var(--swing));
    }
    to {
      rotate: var(--swing);
    }
  }
  @keyframes turn {
    to {
      rotate: 360deg;
    }
  }
  @keyframes -global-arcane-glow-in {
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
  @keyframes -global-arcane-breathe {
    from {
      opacity: 0.28;
    }
    to {
      opacity: 0.1;
    }
  }
  @keyframes set {
    from {
      opacity: 0;
      scale: 2.4;
    }
    40% {
      opacity: 1;
    }
  }
  @keyframes beat {
    0%,
    93% {
      scale: 1;
    }
    95% {
      scale: 1.5;
    }
    98% {
      scale: 1;
    }
  }
  @keyframes bloom {
    from {
      opacity: 0;
      transform: scale(0.15);
    }
    25% {
      opacity: 0.9;
    }
    to {
      opacity: 0;
      transform: scale(0.9);
    }
  }
  @keyframes flare {
    from {
      opacity: 0;
      transform: scale(0.3);
    }
    20% {
      opacity: 1;
    }
    to {
      opacity: 0;
      transform: scale(1.1);
    }
  }
  @keyframes wave {
    from {
      opacity: 1;
      transform: scale(0.2);
    }
    to {
      opacity: 0;
      transform: scale(1.15);
    }
  }
</style>
