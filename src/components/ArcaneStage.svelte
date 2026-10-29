<script module lang="ts">
  import { flushSync, untrack, type Snippet } from 'svelte';
  import { drawIn, type Pen } from '../lib/drawIn';
  import { HOLLOW_CLEAR, type Plate, type StageLayer } from '../lib/engraver';
  import { WHOLE, insideOut, placed, type Box } from '../lib/plateBox';
  import { switchedOff } from '../lib/switchedOff';
  import { holdSettled } from '../lib/settled';

  export type { StageLayer };


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
  // winner on the victory screen. A hollow plate's `cut` layers stop short
  // of its hollow frame (lib/engraver's `staged`).
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
  // not all on the frame that shows the question, and the pen (lib/drawIn)
  // draws them in as if they had been there all along. Once drawn, a layer
  // takes its still copy. All of it is timed on the summoning's own clock
  // (its settle animation's), not from when this ran: a slow first frame
  // starts the CSS animations late, and the lines drawn on the page's clock
  // would run ahead of the circle settling in.
  /** The outermost layers in order, those side by side under the same mask together. */
  const groups = untrack(() => layers)
    .filter((l) => !l.within)
    .reduce((out: StageLayer[][], l) => {
      const last = out.at(-1)?.[0];
      const same = !!l.mask && !!last?.mask && last.mask.d === l.mask.d && last.mask.grow === l.mask.grow && last.mask.with === l.mask.with;
      if (same) out.at(-1)!.push(l);
      else out.push([l]);
      return out;
    }, []);

  /** How the layer named turns (none: it doesn't, or there's no such layer). */
  const spinOf = (name: string | undefined) => (name ? layers.find((p) => p.name === name)?.spin : undefined);

  const due = (l: StageLayer) => {
    if (!l.lines || !l.glow) throw new Error(`ArcaneStage: layer "${l.name}" has no plate (is it named as its plate is?)`);
    return Math.max(0, Math.min(l.lines.start, l.glow.start) - AHEAD);
  };
  // (A circle's layers are fixed: it is drawn once, as it mounts.)
  let shown = $state<Record<string, true>>(Object.fromEntries(untrack(() => layers).filter((l) => !due(l)).map((l) => [l.name, true])));
  let drawn = $state<Record<string, true>>({});
  let summon = $state<HTMLDivElement>();
  /** Every circle left out (?off=circles, the beta and the dev server only: lib/switchedOff.ts). */
  const off = switchedOff('circles');
  $effect(() => {
    if (off) return;
    let timers: ReturnType<typeof setTimeout>[] = [];
    let stopped = false;
    let pen: Pen | undefined;
    // Work run ahead of need waits until the circle has drawn itself in
    // (lib/settled.ts): its layers going on the page and the pen are
    // enough for a phone's frames.
    const release = holdSettled();
    /** Hands a layer's SVGs, on the page, to the pen. */
    const draw = (name: string) => summon?.querySelectorAll<SVGSVGElement>(`svg[data-layer="${name}"]`).forEach((svg) => pen?.add(svg));
    /** Times each layer from `start` (performance.now()'s clock), when the summoning began. */
    const time = (start: number) => {
      if (stopped) return;
      pen = drawIn(start);
      const at = (s: number, fn: () => void) => timers.push(setTimeout(fn, Math.max(0, s * 1000 - (performance.now() - start))));
      for (const l of layers) {
        if (!due(l)) draw(l.name);
        else
          at(due(l), () => {
            flushSync(() => (shown[l.name] = true));
            draw(l.name);
          });
        at(Math.max(l.lines.end, l.glow.end) + 0.15, () => (drawn[l.name] = true));
      }
      at(Math.max(...layers.map((l) => Math.max(l.lines.end, l.glow.end))) + 0.15, release);
    };
    // (Its only animation: the circle's settling in.) Moved on the page
    // before it starts, as a dialog's backdrop is to the end of <body>
    // (lib/behindDialog), the circle starts over as new animations and the
    // old one's `ready` rejects: then it's timed from the new one.
    const follow = () => {
      if (stopped) return;
      const settle = summon?.getAnimations()[0];
      if (settle) settle.ready.then(() => time(performance.now() - Number(settle.currentTime ?? 0)), follow);
      else time(performance.now());
    };
    // Asked for once the frame that shows the circle has worked out its
    // styles, not as it mounts: there getAnimations would have to work them
    // out on the spot (13 to 19 ms as an item opens), and again in the frame.
    const frame = requestAnimationFrame(() => timers.push(setTimeout(follow)));
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      pen?.stop();
      timers.forEach(clearTimeout);
      timers = [];
      release();
    };
  });
  const plate = (p: Plate, name: string) => (drawn[name] ? p.still : shown[name] ? p.drawing : '');

  // Answered, the circle takes its new colour (its mood's, below) a ring at
  // a time, from the centre out, one more each frame after the answer's own,
  // so the whole circle has it a few frames on, under the flare and the wave
  // running out over it. Each ring takes it at once there (see .arcane). A
  // ring (one of `groups`) is a few compositing layers, its strokes in
  // currentColor, and each layer takes a new colour by being drawn again:
  // the whole circle in one frame was some forty layers on an iPhone, 15 to
  // 20 ms of the answer's next frame. Back at rest nothing covers the
  // change, and a ring taking it at once showed as a jump: there it eases
  // over in a few steps, the rings one after another over the time the
  // circle's light takes to settle, so a frame draws a few rings again at
  // most. The heart goes with the innermost ring. Until its turn a ring
  // keeps the colour before (`was`). A colour given (`color`) is the
  // circle's whatever its mood: nothing to hold.
  /** The rings in the order they take it: the centre's first. */
  const outward = insideOut(groups.map((g) => g[0].box ?? WHOLE));
  /** Each ring's place in that order. */
  const turnOf = new Map(outward.map((at, n) => [groups[at][0].name, n]));
  /** Back at rest: how long the whole circle takes to come over (.arcane's opacity eases as long), each ring's share, and the steps it takes. */
  const EASE_MS = 800;
  const RING_MS = 360;
  const STEPS = 6;
  /** The mood the rings not yet turned still show the colour of (null: none held). */
  let was = $state<'idle' | 'good' | 'bad' | null>(null);
  /** How far each ring (by its place in `outward`) has come over to the mood's own colour, 0 to 1 (always set whole). */
  let over = $state.raw<number[]>([]);
  let moodSeen = untrack(() => mood);
  $effect.pre(() => {
    const now = mood;
    // (Back where it was before this ran, as a change and its undoing in one
    // tick leave it: the way over cut off, nothing left held.)
    if (now === moodSeen) return untrack(() => void (was = null));
    const before = moodSeen;
    moodSeen = now;
    // (Nothing held under a colour given, not even what a change cut off left.)
    if (untrack(() => color)) return untrack(() => void (was = null));
    const rings = groups.length;
    untrack(() => {
      was = before;
      over = Array(rings).fill(0);
    });
    const lag = (EASE_MS - RING_MS) / Math.max(1, rings - 1);
    /** Each ring's way over, `frame` frames or `ms` since the change. */
    const at = (frame: number, ms: number) =>
      Array.from({ length: rings }, (_, n) => {
        // (Answered: the answer's own frame first, every ring in the colour before, then one more a frame.)
        if (now !== 'idle') return frame > n ? 1 : 0;
        const t = Math.min(1, Math.max(0, (ms - n * lag) / RING_MS));
        return Math.floor(t * t * (3 - 2 * t) * STEPS) / STEPS;
      });
    const start = performance.now();
    let frame = 0;
    const step = () => {
      const next = at(frame++, performance.now() - start);
      if (next.every((p) => p === 1)) {
        was = null;
        return;
      }
      if (next.some((p, n) => p !== over[n])) over = next;
      raf = requestAnimationFrame(step);
    };
    let raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  });
  /** The colour the ring at `n` (its place in `outward`) holds to on its way over (CSS, through the moods' own; none once it is over). */
  const inkAt = (n: number) => {
    const p = was ? (over[n] ?? 0) : 1;
    if (p >= 1) return undefined;
    return p ? `color-mix(in srgb, var(--ink-${mood}) ${Math.round(p * 100)}%, var(--ink-${was}))` : `var(--ink-${was})`;
  };
  const heldInk = (ring: StageLayer[]) => inkAt(turnOf.get(ring[0].name)!);
  /** The rings a wrong answer jars, by their first layer's name (those that turn, or carry a mask that does). */
  const jarring = new Set(untrack(() => groups.filter((ring) => ring.some((l) => !!l.spin) || !!spinOf(ring[0].mask?.with)).map((ring) => ring[0].name)));
</script>

{#if !off}
<div class="arcane {mood}" aria-hidden="true" style:--clear="{HOLLOW_CLEAR}%" style:--rest="{EASE_MS}ms" style:--size={size} style:color={color} style:opacity={strength}>
  <div class="summon" bind:this={summon}>
    <div class="bloom"></div>
    {#snippet plain(l: StageLayer, inside: Box)}
      {@const parent = l.upright ? spinOf(l.within) : undefined}
      <!-- (A layer cut round the hollow keeps the whole plate: its mask is drawn to it.) -->
      {@const box = (!l.cut && l.box) || WHOLE}
      {@const at = placed(box, inside, l.pivot)}
      {@const spin = parent ? { turn: parent.turn, from: -parent.from, reverse: !parent.reverse } : l.spin}
      <div
        class="layer"
        class:spin={!!l.spin && !l.within}
        class:turning={!!l.spin && !!l.within}
        class:upright={!!parent}
        class:riding={!!parent}
        class:swaying={!!l.sway}
        class:breathing={!!l.breathe}
        class:fluttering={!!l.flutter}
        class:cut={!!l.cut}
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
        style:left={at.left}
        style:top={at.top}
        style:width={at.width}
        style:height={at.height}
        style:transform-origin={at.origin}
        style:color={l.tint && `color-mix(in srgb, ${l.tint} 70%, currentColor)`}
      >
        <svg class="glow" viewBox={at.viewBox} data-layer={l.name}>{@html plate(l.glow, l.name)}</svg>
        <svg viewBox={at.viewBox} data-layer={l.name}>{@html plate(l.lines, l.name)}</svg>
        {#each layers.filter((c) => c.within === l.name) as child (child.name)}
          {@render layer(child, box)}
        {/each}
      </div>
    {/snippet}
    <!-- A masked layer sits in a box that turns with the layer it follows and carries the mask, inside one that turns back the
         same, so the layer keeps its own way and only the mask moves; all on the compositor. Layers side by side with the same
         mask (a glory in sectors) share the one box, so the mask is drawn once. -->
    {#snippet masked(group: StageLayer[], inside: Box)}
      {@const m = group[0].mask}
      {@const by = spinOf(m?.with)}
      {#if m && by}
        <!-- (The whole plate, which its mask is drawn to, wherever it sits.) -->
        {@const at = placed(WHOLE, inside)}
        <div
          class="layer spin"
          style:left={at.left}
          style:top={at.top}
          style:width={at.width}
          style:height={at.height}
          style:transform-origin={at.origin}
          style:--turn="{by.turn}s"
          style:--from="{by.from}deg"
          style:--dir={by.reverse ? 'reverse' : 'normal'}
          style:mask-image={maskOf(m)}
          style:-webkit-mask-image={maskOf(m)}
        >
          <div class="layer upright" style:--turn="{by.turn}s" style:--from="{-by.from}deg" style:--dir={by.reverse ? 'normal' : 'reverse'}>
            {#each group as l (l.name)}
              {@render plain(l, WHOLE)}
            {/each}
          </div>
        </div>
      {:else}
        {#each group as l (l.name)}
          {@render plain(l, inside)}
        {/each}
      {/if}
    {/snippet}
    {#snippet layer(l: StageLayer, inside: Box)}
      {@render masked([l], inside)}
    {/snippet}
    <!-- Each ring in a box of its own (the circle's size), which holds it to the colour before on its way over, and jars it at a
         wrong answer, so the ring's own turning and winding go on untouched. -->
    {#each groups as group (group[0].name)}
      <div class="hold" class:jars={jarring.has(group[0].name)} style:color={heldInk(group)}>
        {@render masked(group, WHOLE)}
      </div>
    {/each}
    <!-- The heart and the point, with the innermost ring. -->
    {#if heart || point}
      <div class="hold" style:color={inkAt(0)}>
        {@render heart?.()}
        {#if point}
          <!-- (Its layer only as large as it swells as it's set.) -->
          {@const reach = point.r * 2.4 + 1.5}
          {@const at = placed([-reach, -reach, reach, reach], WHOLE)}
          <div class="layer point" style:left={at.left} style:top={at.top} style:width={at.width} style:height={at.height} style:--set="{point.delay}s">
            <svg class="glow" viewBox={at.viewBox}><circle r={point.r} class="dot" /></svg>
            <svg viewBox={at.viewBox}><circle r={point.r} class="dot" /></svg>
          </div>
        {/if}
      </div>
    {/if}
    <div class="wave"></div>
  </div>
</div>
{/if}

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
    /* Each mood's colour, named so a ring can hold to the one before for a
       moment (heldInk). */
    --ink-idle: #d9a45a;
    --ink-good: #d8dfa0;
    --ink-bad: #d98a6e;
    color: var(--ink-idle);
    /* Only the opacity eases (on the compositor), as long as the rings take
       to come back over at rest (EASE_MS). The colour changes at once here:
       every stroke of the circle takes it (currentColor), and easing it
       restyled and repainted each of those hundreds of strokes every frame
       for most of a second, right as a reveal's effects began, which made
       them stutter. Answered, the flare covers the change and the rings
       take it one a frame; back at rest, each eases over in a few steps,
       one after another (heldInk). */
    transition: opacity var(--rest);
  }
  .arcane.good {
    opacity: 0.3;
    color: var(--ink-good);
  }
  .arcane.bad {
    opacity: 0.16;
    color: var(--ink-bad);
  }
  /* A circle's heart (its own markup) is laid out as a layer too. */
  .summon,
  .hold,
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

  /* Hollow, a layer that crosses the heart stops short of the hollow frame (a
     disc, so it needs no turning with the layer). */
  .summon :global(.layer.cut) {
    mask-image: radial-gradient(circle closest-side, transparent var(--clear), #000 var(--clear));
    -webkit-mask-image: radial-gradient(circle closest-side, transparent var(--clear), #000 var(--clear));
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
  .breathing {
    animation: swell var(--breath) var(--breath-delay) ease-in-out infinite alternate;
  }
  .fluttering {
    animation: flutter var(--flutter) var(--flutter-delay) ease-in-out infinite;
  }
  /* A wrong answer jars the circle: each turning ring, in its box (.hold),
     about the circle's centre. Not on the ring itself, whose animations a
     mood never changes: one taken out (its winding in, by the jar) starts
     over when it's back, and a ring cut off as it winds in jumps. */
  .bad .jars {
    animation: falter 0.7s var(--ease-out);
  }
  /* A layer riding the ring that keeps its way up keeps it through the jar,
     turned back about its own pivot. Its turn and winding stay in the list
     (by name), so they go on untouched. */
  .bad .jars .riding {
    animation:
      turn var(--turn) linear infinite var(--dir, normal),
      wind 2.6s var(--ease-out) both,
      unfalter 0.7s var(--ease-out);
    /* (Added to the winding's transform, not in place of it: a jar while it
       still winds in would otherwise drop its turning back for 0.7 s.) */
    animation-composition: replace, replace, add;
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
  /* A seal's sign drawn 1.1 times its size (the eye's planets), and its
     line with it, as the drawing's scale(1.1) draws it. */
  .arcane :global(.big) {
    stroke-width: 0.462;
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
    stroke-width: 2.2;
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

  /* The pen (lib/drawIn) draws it all in: each line hidden till it reaches
     it, its dash run out, then solid; the script written mark by mark, a
     seal's signs set down once its rings are drawn and shapes cut solid,
     each fading in; seals pressed in like a stamp, from larger. */
  .arcane :global(.draw:not(.ink)) {
    stroke-dasharray: 100;
    stroke-dashoffset: 100;
    visibility: hidden;
  }
  .arcane :global(.mark),
  .arcane :global(.carve),
  .arcane :global(.draw.ink) {
    opacity: 0;
  }
  .arcane :global(.seal) {
    transform-box: fill-box;
    transform-origin: center;
    opacity: 0;
    transform: scale(1.6);
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
  /* (The summoning's bloom kept in the list: taken out, it would bloom
     again as the circle comes back to rest.) */
  .good .bloom {
    animation:
      bloom 1.5s ease-out both,
      flare 1.6s ease-out both;
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
