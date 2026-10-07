<script lang="ts">
  // Plate A of the descent: Delve as a mine surveyor's section (lib/descentPlateA.ts
  // lays it out and draws its lines). The headframe at the surface, a level
  // for each zone off the shaft, the endless deep running on out of the plate,
  // the cage on its rope at the player's deepest, and the finds as seams down
  // the side, keyed to the caption by their icons. Engraved as
  // docs/arcane-style.md asks: fine gold lines, hatching for the rock, a soft
  // glow under the lines; it inks itself in once, then only the cage moves.
  import ItemGlyph from '../ItemGlyph.svelte';
  import { shownDepth } from '../../lib/delve';
  import {
    CAPTION,
    ENDLESS_FROM,
    FIND_GLYPH,
    LEVELS,
    SEAMS,
    bandTop,
    cage,
    depthY,
    driftOf,
    driftPath,
    endlessFor,
    seamMarks,
    frame,
    frontierY,
    inEndlessRow,
    groundLine,
    headframe,
    layoutFor,
    levelOf,
    levelsFor,
    rockHatch,
    shaftLines,
    strataLines,
  } from '../../lib/descentPlateA';
  import { sigilOf } from '../../lib/zoneSigils';

  let { deepest = null }: { deepest?: number | null } = $props();

  const uid = $props.id();
  let width = $state(0);
  const L = $derived(width > 0 ? layoutFor(width) : null);
  /** The deepest depth as players see it, or null before any run. */
  const shown = $derived(deepest === null || !Number.isFinite(deepest) || deepest < 1 ? null : shownDepth(Math.floor(deepest)));
  const levels = $derived(levelsFor(shown));
  const endless = $derived(endlessFor(shown));
  const at = $derived(levelOf(shown));
  /** The drawing in words. */
  const summary = $derived.by(() => {
    const plan = `A section of the mine: a level every ten depths, ${LEVELS} of them, then on without end.`;
    if (shown === null) return `${plan} No descent yet.`;
    const where = at !== null && at < LEVELS ? levels[at].name : endless.name;
    return `${plan} Your deepest depth: ${shown}, in ${where}.`;
  });
  /** The first level not reached yet, which says so. */
  const firstUnknown = $derived(levels.find((l) => !l.reached)?.k ?? null);

  const art = $derived.by(() => {
    if (!L) return null;
    return {
      head: headframe(L),
      ground: groundLine(L),
      shaft: shaftLines(L),
      strata: strataLines(L),
      hatch: rockHatch(L, 4.5),
      dark: rockHatch(L, 4.5, true),
      frame: frame(L),
      cage: cage(L),
    };
  });
  /** Each level's drift (and the endless deep's, last): timbered once driven. */
  const rows = $derived.by(() => {
    if (!L) return [];
    return [...levels, endless].map((l, i) => ({ ...l, i, d: driftOf(L, i), path: driftPath(L, i, l.reached) }));
  });

  // The cage comes down to its depth once the plate has inked itself in; from then on it follows the deepest quickly.
  let settled = $state(false);
  let lowered = $state(false);
  const cageY = $derived(L ? depthY(L, shown) : 0);
  /** Past the levels, the deepest stratum's name rides beside the cage once it hangs below the endless deep's first row. */
  const riding = $derived(!!L && endless.reached && shown !== null && !inEndlessRow(L, shown));
  const frontier = $derived(L ? (lowered ? frontierY(L, shown) : L.ground) : 0);
  /** The rope is clipped to run from the wheel down; the cage hangs on it. */
  const ropeTop = $derived(L ? L.wheel.c[1] : 0);

  $effect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      [lowered, settled] = [true, true];
      return;
    }
    const t1 = setTimeout(() => (lowered = true), 650);
    const t2 = setTimeout(() => (settled = true), 2300);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  });
  const hangY = $derived(L ? (lowered ? cageY : depthY(L, null)) : 0);

  /**
   * Keeps a name within `room` px: one too long for it (a long name deep in
   * the endless deep, on a narrow plate) is drawn a little tighter.
   */
  function fit(room: number, text: string | null) {
    return (el: SVGTextElement) => {
      void text;
      const measure = () => {
        el.removeAttribute('textLength');
        if (el.getComputedTextLength() > room) {
          el.setAttribute('textLength', String(room));
          el.setAttribute('lengthAdjust', 'spacingAndGlyphs');
        }
      };
      measure();
      // Again once the display font is in, if it wasn't yet.
      document.fonts?.ready.then(measure);
    };
  }

  /** Text width, roughly, to keep the hatching clear of a label (Cinzel digits, or a name in capitals, at 10 px). */
  const digitsW = (s: string) => s.length * 6.4 + 4;
  const nameW = (s: string) => s.length * 6.2 + 4;
</script>

<div class="plate-a" class:wide={L?.wide} class:settled bind:clientWidth={width} style:--dw="{L?.dw ?? 0}px">
  {#if L && art}
    <div class="section" role="img" aria-label={summary} style:width="{L.dw}px" style:height="{L.dh}px">
      <svg class="lines" width={L.dw} height={L.dh} viewBox="0 0 {L.dw} {L.dh}" aria-hidden="true">
        <defs>
          <!-- The rock's hatching stops short of the shaft, the driven levels and the writing. -->
          <mask id="{uid}-rock" maskUnits="userSpaceOnUse" x="0" y="0" width={L.dw} height={L.dh}>
            <rect x="0" y="0" width={L.dw} height={L.dh} fill="#fff" />
            <rect x={L.shaft[0] - 1} y={L.ground} width={L.shaft[1] - L.shaft[0] + 2} height={L.dh} fill="#000" />
            {#each rows as r (r.i)}
              {#if r.reached && !(r.i === LEVELS && riding)}
                <rect x={L.shaft[1]} y={r.d.roof - 1} width={r.d.x0 - L.shaft[1]} height={r.d.floor - r.d.roof + 2} fill="#000" />
                <rect x={r.d.x0 - 1} y={r.d.top - 1} width={L.cw + 2} height={r.d.floor - r.d.top + 2} fill="#000" />
                <rect x={L.nameX - 2} y={r.d.base - 9} width={Math.min(nameW(r.name ?? ''), r.d.x0 - 4 - L.nameX)} height="11" fill="#000" />
              {:else if r.i === firstUnknown || r.i === LEVELS}
                <rect x={L.nameX - 2} y={r.d.base - 10} width={r.i === LEVELS ? 104 : 62} height="13" fill="#000" />
                {#if r.reached}
                  <rect x={L.shaft[1]} y={r.d.roof - 1} width={r.d.x0 - L.shaft[1]} height={r.d.floor - r.d.roof + 2} fill="#000" />
                  <rect x={r.d.x0 - 1} y={r.d.top - 1} width={L.cw + 2} height={r.d.floor - r.d.top + 2} fill="#000" />
                {/if}
              {/if}
              <rect x={L.numX - digitsW(String(r.from)) + 2} y={r.d.base - 9} width={digitsW(String(r.from))} height="11" fill="#000" />
            {/each}
            <rect x={L.shaft[1]} y={L.deep + L.band} width={L.faceMax - L.shaft[1] + 2} height={L.dh} fill="#000" />
            {#each SEAMS as seam, i (seam.kind)}
              <rect x={L.lanes[i] - 4.5} y={depthY(L, seam.from) - 8} width="9" height={L.dh} fill="#000" />
            {/each}
          </mask>
          <clipPath id="{uid}-dark"><rect class="dark-clip" x="0" y="0" width={L.dw} height={L.dh} style:transform="translateY({frontier}px)" /></clipPath>
          {#each rows as r (r.i)}
            {#if r.reached}
              <radialGradient id="{uid}-glow-{r.i}" style:color={r.color}>
                <stop offset="0" stop-color="currentColor" stop-opacity="0.32" />
                <stop offset="1" stop-color="currentColor" stop-opacity="0" />
              </radialGradient>
            {/if}
          {/each}
          <radialGradient id="{uid}-lamp">
            <stop offset="0" stop-color="#f1d99b" stop-opacity="0.3" />
            <stop offset="1" stop-color="#f1d99b" stop-opacity="0" />
          </radialGradient>
        </defs>

        <!-- The rock, hatched. -->
        <path class="hatch fade" style:--d="0.5s" d={art.hatch} mask="url(#{uid}-rock)" />
        <!-- Below what the player has reached, the rock is crossed: dark, not known yet. -->
        <g clip-path="url(#{uid}-dark)"><path class="hatch cross fade" style:--d="0.6s" d={art.dark} mask="url(#{uid}-rock)" /></g>
        <!-- A glow in each reached chamber, of its zone's colour. -->
        {#each rows as r (r.i)}
          {#if r.reached}
            <ellipse class="glow" cx={(r.d.x0 + r.d.face) / 2} cy={(r.d.top + r.d.floor) / 2} rx="26" ry="15" fill="url(#{uid}-glow-{r.i})" />
          {/if}
        {/each}
        <g class="ink">
          <path class="main draw" style:--d="0s" pathLength="1" d={art.frame} />
          <path class="main draw" style:--d="0.1s" pathLength="1" d={art.ground.line} />
          <path class="fine fade" style:--d="0.4s" d={art.ground.turf} />

          <!-- The headframe and its winding house. -->
          <path class="main draw" style:--d="0.25s" pathLength="1" d={art.head.timber} />
          <path class="main draw" style:--d="0.45s" pathLength="1" d={art.head.wheel} />
          <path class="thin draw" style:--d="0.7s" pathLength="1" d={art.head.rope} />
          <path class="main draw" style:--d="0.4s" pathLength="1" d={art.head.house} />
          <path class="thin draw" style:--d="0.6s" pathLength="1" d={art.head.drum} />

          <!-- The shaft and its timber sets. -->
          <path class="main draw slow" style:--d="0.3s" pathLength="1" d={art.shaft.walls} />
          <path class="fine fade" style:--d="0.6s" d={art.shaft.sets} />

          <!-- The levels: driven and timbered once reached, a surveyor's dashed line through the rock until then. -->
          {#each rows as r (r.i)}
            <g class="level" class:reached={r.reached} style:--zone={r.color ?? 'transparent'} style:--d="{0.45 + r.i * 0.06}s">
              {#if r.reached}
                <path class="tint" d="M{L.shaft[1]} {r.d.roof}L{r.d.x0} {r.d.roof}L{r.d.x0} {r.d.top}L{r.d.face} {r.d.top}L{r.d.face} {r.d.floor}L{L.shaft[1]} {r.d.floor}Z" />
                <path class="sets" d={r.path.sets} />
              {/if}
              <path class="drift" d={r.path.outline} />
            </g>
          {/each}

          <!-- Below the last level the strata run on, closer and closer, out of the plate. -->
          {#each art.strata as s, i (s.y)}
            <path class="stratum fade" style:--d="{1.1 + i * 0.05}s" style:--o={Math.max(0.2, 0.8 - i * 0.1)} d={s.d} />
          {/each}

          <!-- The finds' seams: from the depth each first turns up, on down; broken past the levels, where they grow scarcer. -->
          {#each SEAMS as seam, i (seam.kind)}
            {@const x = L.lanes[i]}
            {@const y0 = depthY(L, seam.from)}
            {@const marks = Array.from({ length: LEVELS }, (_, k) => bandTop(L, k) + L.band / 2).filter((y) => y > y0 + 11)}
            {@const deepMarks = [L.deep + (L.dh - L.deep) * 0.35, L.deep + (L.dh - L.deep) * 0.75]}
            <g class="seam {seam.kind}">
              <path class="vein draw" style:--d="{1.0 + i * 0.12}s" pathLength="1" d="M{x} {y0 + 7}L{x} {L.deep}" />
              <path class="vein scarce fade" style:--d="{1.5 + i * 0.12}s" d="M{x} {L.deep}L{x} {L.dh - 1}" />
              <path class="crystal fade" style:--d="{1.2 + i * 0.12}s" d={seamMarks(x, marks)} />
              <path class="crystal hollow fade" style:--d="{1.6 + i * 0.12}s" d={seamMarks(x, deepMarks)} />
            </g>
          {/each}
        </g>

        <!-- Writing: each level's depth, and its name once reached. -->
        <g class="writing">
          {#each rows as r (r.i)}
            <g class="fade" style:--d="{0.7 + r.i * 0.05}s">
              <text class="num" class:here={at === r.i} x={L.numX} y={r.d.base} text-anchor="end">{r.from}</text>
              {#if r.reached && r.name && !(r.i === LEVELS && riding)}
                {@const sig = sigilOf(r.name)}
                <g class="sigil" style:color={r.color} transform="translate({(r.d.x0 + r.d.face) / 2} {(r.d.top + r.d.floor) / 2}) scale(0.6)">
                  <path class="s-main" d={sig.lines} />
                  <path class="s-fine" d={sig.fine} />
                  {#if sig.shade}<path class="s-shade" d={sig.shade} />{/if}
                </g>
                <text class="name" class:here={at === r.i} x={L.nameX} y={r.d.base} style:--zone={r.color} {@attach fit(r.d.x0 - 6 - L.nameX, r.name)}>{r.name}</text>
              {:else if r.i === LEVELS}
                <text class="unknown" x={L.nameX} y={r.d.base + 0.5}>and on, without end</text>
              {:else if r.i === firstUnknown}
                <text class="unknown" x={L.nameX} y={r.d.base + 0.5}>unexplored</text>
              {/if}
            </g>
          {/each}
          <!-- In the sky: what the cage means. -->
          <text class="note fade" style:--d="1.2s" x={art.head.houseRight + 9} y={L.ground - 22}>
            {#if shown === null}The cage waits at the top{:else}The cage hangs at{/if}
          </text>
          <text class="note fade" style:--d="1.3s" x={art.head.houseRight + 9} y={L.ground - 8}>
            {#if shown === null}for your first descent.{:else}your deepest depth.{/if}
          </text>
        </g>

      </svg>

      <!--
        What moves sits in layers of its own over the plate, moved by a transform the browser composites
        without repainting the engraving: the stratum's name beside the cage deep in the endless deep, and the
        cage on its rope (its layer starts at the wheel, so the rope runs up to it and no further).
      -->
      {#if riding && endless.name}
        {@const sig = sigilOf(endless.name)}
        <div class="mover rider" style:transform="translateY({hangY}px)">
          <svg width={L.dw} height="16" viewBox="0 -8 {L.dw} 16" aria-hidden="true">
            <rect class="rider-bg" x={L.shaft[1] + 2} y="-7" width={L.faceMax - L.shaft[1] - 2} height="14" />
            <g class="sigil" style:color={endless.color} transform="translate({L.nameX + 5} 0) scale(0.55)">
              <path class="s-main" d={sig.lines} />
              <path class="s-fine" d={sig.fine} />
              {#if sig.shade}<path class="s-shade" d={sig.shade} />{/if}
            </g>
            <text class="name here" x={L.nameX + 14} y="3.5" style:--zone={endless.color} {@attach fit(L.faceMax - L.nameX - 18, endless.name)}>{endless.name}</text>
          </svg>
        </div>
      {/if}
      <div class="cage-shaft" style:top="{ropeTop}px" style:height="{L.dh - ropeTop}px">
        <div class="mover cage" class:settled class:lowered style:transform="translateY({hangY - ropeTop}px)">
          <svg width={L.dw} height="60" viewBox="0 -30 {L.dw} 60" aria-hidden="true">
            <g transform="translate({L.sc} 0)">
              {#if shown !== null}<circle class="lamp" r="22" fill="url(#{uid}-lamp)" />{/if}
              <path class="cage-box" d={art.cage.box} />
              <path class="cage-deck" d={art.cage.deck} />
              <path class="cage-bale" d={art.cage.bale} />
              {#if shown !== null}
                <text class="cage-num" x="0" y="3.5" text-anchor="middle">{shown}</text>
              {/if}
            </g>
          </svg>
          <!-- The rope above the cage, up to the wheel. -->
          <span class="rope-up" style:left="{L.sc - 0.35}px" style:bottom="{-art.cage.ropeFrom}px"></span>
        </div>
      </div>

      <!-- The finds' icons at the head of their seams. -->
      {#each SEAMS as seam, i (seam.kind)}
        <span class="seam-head fade {seam.kind}" style:--d="{0.95 + i * 0.12}s" style:left="{L.lanes[i]}px" style:top="{depthY(L, seam.from)}px">
          <ItemGlyph kind={FIND_GLYPH[seam.kind]} />
        </span>
      {/each}
    </div>

    <!-- The caption: each find keyed by its icon. -->
    <div class="caption fade" style:--d="1.1s">
      <p class="lead">{CAPTION.lead}</p>
      {#each SEAMS as seam (seam.kind)}
        {@const c = CAPTION.finds[seam.kind]}
        <p class="find {seam.kind}">
          <span class="key"><ItemGlyph kind={FIND_GLYPH[seam.kind]} /></span><span class="find-name">{c.name}</span>
          <span class="from">from <span class="digits">{seam.from}</span></span>
          {c.text}
        </p>
      {/each}
      <p class="after">{CAPTION.after}</p>
    </div>
  {/if}
</div>

<style>
  .plate-a {
    --ink: #d9a45a;
    --azurite: #a9cdf5;
    --flare: #f7a3b3;
    --dynamite: #eebf96;
    min-height: 1px;
    color: var(--ink);
  }
  .plate-a.wide {
    display: grid;
    grid-template-columns: var(--dw) minmax(0, 1fr);
    gap: 0 12px;
    align-items: start;
  }
  .section {
    position: relative;
  }
  svg {
    display: block;
    overflow: visible;
  }
  .ink {
    filter: drop-shadow(0 0 1.2px rgba(217, 164, 90, 0.45));
  }
  path {
    fill: none;
    stroke: currentColor;
    stroke-linecap: butt;
    stroke-linejoin: miter;
    stroke-miterlimit: 12;
  }
  .main {
    stroke-width: 0.9px;
  }
  .thin {
    stroke-width: 0.6px;
  }
  .fine {
    stroke-width: 0.5px;
    opacity: 0.75;
  }
  .hatch {
    stroke-width: 0.5px;
    opacity: 0.3;
  }
  .drift {
    stroke-width: 0.6px;
    stroke-dasharray: 2.5 2;
    opacity: 0.6;
  }
  .sets {
    stroke-width: 0.5px;
    opacity: 0.6;
  }
  .level.reached .drift {
    stroke-width: 0.9px;
    stroke-dasharray: none;
    opacity: 1;
  }
  .tint {
    fill: var(--zone);
    stroke: none;
    opacity: 0.1;
  }
  .stratum {
    stroke-width: 0.5px;
    stroke-dasharray: 2.5 2;
    opacity: var(--o);
  }
  .vein {
    stroke-width: 0.6px;
    opacity: 0.8;
  }
  .vein.scarce {
    stroke-dasharray: 1.5 2.5;
  }
  .crystal {
    fill: currentColor;
    stroke: none;
  }
  .crystal.hollow {
    fill: var(--bg, #0a0908);
    stroke: currentColor;
    stroke-width: 0.6px;
  }
  .seam.azurite {
    color: var(--azurite);
  }
  .seam.flare {
    color: var(--flare);
  }
  .seam.dynamite {
    color: var(--dynamite);
  }

  /* Writing. */
  text {
    stroke: none;
  }
  .num,
  .cage-num {
    font-family: var(--font-cinzel);
    font-size: 10px;
    fill: var(--ink);
  }
  .num {
    opacity: 0.8;
  }
  .num.here {
    fill: var(--gold-hi);
    opacity: 1;
  }
  .name {
    fill: color-mix(in srgb, var(--zone) 40%, var(--gold-hi));
    font-family: var(--font-display);
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .name.here {
    fill: color-mix(in srgb, var(--zone) 75%, #fff);
  }
  .unknown,
  .note {
    font-family: var(--font-body);
    font-style: italic;
    font-size: 12px;
    fill: var(--muted);
  }
  .sigil path {
    vector-effect: non-scaling-stroke;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .s-main {
    stroke-width: 0.8px;
  }
  .s-fine {
    stroke-width: 0.55px;
  }
  .s-shade {
    stroke-width: 0.4px;
    opacity: 0.7;
  }

  .hatch.cross {
    opacity: 0.24;
  }
  .mover {
    position: absolute;
    left: 0;
    top: 0;
    will-change: transform;
    transition: transform 0.2s ease-out;
  }
  .mover > svg {
    position: absolute;
    left: 0;
  }
  .rider > svg {
    top: -8px;
  }
  .cage > svg {
    top: -30px;
  }
  .cage-shaft {
    position: absolute;
    left: 0;
    width: 100%;
    overflow: hidden;
    pointer-events: none;
  }
  .rope-up {
    position: absolute;
    width: 0.7px;
    height: 2000px;
    background: var(--ink);
  }
  .rider-bg {
    fill: var(--bg, #0a0908);
    opacity: 0.9;
  }
  .dark-clip {
    transition: transform 0.2s ease-out;
  }
  .glow {
    animation: appear 0.8s 0.6s both;
  }

  /* The cage. */
  .cage.lowered:not(.settled) {
    transition: transform 1.4s cubic-bezier(0.45, 0, 0.25, 1);
  }
  .cage-box {
    fill: var(--bg, #0a0908);
    stroke-width: 0.9px;
  }
  .cage-deck {
    stroke-width: 0.6px;
  }
  .cage-bale {
    stroke-width: 0.6px;
  }
  .cage-num {
    fill: var(--gold-hi);
  }

  .seam-head {
    position: absolute;
    --h: 12px;
    transform: translate(-50%, -50%);
    display: block;
  }

  /* The caption. */
  .caption {
    font-size: 12px;
    line-height: 1.3;
    color: var(--muted);
    font-style: italic;
  }
  .plate-a:not(.wide) .caption {
    margin-top: 10px;
  }
  .caption p {
    margin: 0 0 5px;
  }
  .caption p:last-child {
    margin-bottom: 0;
  }
  .find .key {
    --h: 11px;
    display: inline-block;
    vertical-align: -1px;
    margin-right: 4px;
  }
  .find-name {
    font-family: var(--font-display);
    font-style: normal;
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--find);
  }
  .from {
    font-style: italic;
    color: var(--find);
    opacity: 0.8;
    margin-right: 2px;
  }
  .digits {
    font-family: var(--font-cinzel);
    font-style: normal;
    font-size: 10px;
  }
  .find.azurite {
    --find: var(--azurite);
  }
  .find.flare {
    --find: var(--flare);
  }
  .find.dynamite {
    --find: var(--dynamite);
  }

  /* The entrance: lines ink themselves in, the writing follows. */
  .draw {
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    animation: ink 0.7s var(--d, 0s) cubic-bezier(0.3, 0.6, 0.4, 1) forwards;
  }
  .draw.slow {
    animation-duration: 1.2s;
  }
  .level .drift {
    animation: appear 0.5s var(--d, 0s) both;
  }
  .level .tint,
  .level .sets {
    animation: appear 0.6s var(--d, 0s) both;
  }
  .cage {
    animation: appear 0.4s 0.35s both;
  }
  .fade {
    animation: appear 0.6s var(--d, 0s) both;
  }
  @keyframes ink {
    to {
      stroke-dashoffset: 0;
    }
  }
  @keyframes appear {
    from {
      opacity: 0;
    }
  }
  /* Once inked in, a level reached on a walk down lights at once. */
  .settled .level .tint,
  .settled .level .sets,
  .settled .level .drift,
  .settled .glow {
    animation-delay: 0s;
    animation-duration: 0.3s;
  }
  @media (prefers-reduced-motion: reduce) {
    .draw,
    .fade,
    .level .drift,
    .level .tint,
    .level .sets,
    .cage,
    .glow {
      animation: none;
      stroke-dashoffset: 0;
    }
    .cage,
    .cage.lowered:not(.settled) {
      transition: none;
    }
  }
</style>
