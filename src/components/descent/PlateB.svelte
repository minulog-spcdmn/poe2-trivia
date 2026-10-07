<script lang="ts">
  // Plate B of the descent: the world cut open under the sun, drawn as an
  // alchemist's plate (lib/descentPlateB lays it out). Ten strata bow down
  // toward a centre far below, one for each zone, and under the tenth the
  // deep runs on toward it, without end. Down the axis from the sun goes the
  // player's deepest: a star on the face they have dug to. Above the face
  // the strata are open, each washed in its colour, with its sigil and name;
  // below it is solid rock, its ledges shaded, each zone only a number. The
  // finds sit in the rows where each first turns up, keyed by their icons
  // to the notes beside the drawing (under it on a narrow card). Engraved
  // after docs/arcane-style.md: fine gold lines with a little wear, one-sided
  // hatching, a soft glow under the lines. It inks itself in once, surface
  // first; after that only the face and its star move, eased.
  import { onDestroy, untrack } from 'svelte';
  import ItemGlyph from '../ItemGlyph.svelte';
  import { DELVE_MIN_TIMER, shownDepth } from '../../lib/delve';
  import { sigilOf } from '../../lib/zoneSigils';
  import {
    CARRY,
    DEEP_LABEL,
    FINDS_BY_DEPTH,
    FINDS_FADE,
    FIND_KEY,
    PER_ZONE,
    SHORTEST_FROM,
    ZONES,
    ZONE_INFO,
    alongAt,
    bandPath,
    belowPath,
    clockAt,
    deepName,
    faceDepth,
    pointAlong,
    pointAt,
    rockHatch,
    section,
    star,
    sun,
    unitsOf,
    wallToWall,
    wornArc,
    zonesReached,
  } from '../../lib/descentPlateB';

  let { deepest = null }: { deepest?: number | null } = $props();
  const uid = $props.id();

  const GLYPH = { azurite: 'ward', flare: 'flare', dynamite: 'dynamite' } as const;
  const FIND_COLOR = { azurite: '#a9cdf5', flare: '#f7a3b3', dynamite: '#eebf96' } as const;
  const f = (v: number) => v.toFixed(2);
  const sec = (s: number) => `${s.toFixed(3)}s`;

  let width = $state(0);
  /** Side by side (the key beside the drawing) on a wide card. */
  const wide = $derived(width >= 400);
  const KEY_W = 196;
  const GAP = 14;
  const sw = $derived(wide ? width - KEY_W - GAP : width);
  /** The drawing's height: as tall as the card allows beside the key, or above it. */
  const sh = $derived(wide ? 300 : width >= 320 ? 258 : 248);
  const s = $derived(sw > 0 ? section(sw, sh) : null);

  // ---- the deepest -----------------------------------------------------------

  const reached = $derived(zonesReached(deepest));
  const shown = $derived(deepest !== null && deepest >= 1 ? shownDepth(Math.floor(deepest)) : null);
  const nameDeep = $derived(deepName(deepest));
  /** The zone (or, at ZONES, the deep) the face is in; -1 before any run. */
  const here = $derived(deepest !== null && deepest >= 1 ? Math.min(ZONES, Math.floor((Math.floor(deepest) - 1) / PER_ZONE)) : -1);

  /** The face, in px under the surface's crown, eased toward the deepest's as it changes. */
  let down = $state<number | null>(null);
  let raf = 0;
  $effect(() => {
    if (!s) return;
    const to = faceDepth(s, deepest);
    const from = untrack(() => down);
    cancelAnimationFrame(raf);
    if (from === null || Math.abs(to - from) < 1e-3) {
      down = to;
      return;
    }
    const t0 = performance.now();
    // A step glides; a long way takes a little longer, never long.
    const ms = Math.min(700, 150 + Math.abs(to - from) * 4);
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / ms);
      down = from + (to - from) * (1 - (1 - t) ** 3);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  });
  /** The face in units (ten to a zone). */
  const u = $derived(s && down !== null ? down / s.unit : -1);
  /** Set once it has inked itself in: what turns up later comes at once. */
  let settled = $state(false);
  const settle = setTimeout(() => (settled = true), 2400);
  onDestroy(() => {
    cancelAnimationFrame(raf);
    clearTimeout(settle);
  });

  // ---- the drawing ------------------------------------------------------------

  /** How far left of the axis the finds sit, in turn (clear of the depths and seals). */
  const FIND_X = [56, 70];

  const art = $derived.by(() => {
    if (!s) return null;
    const sol = sun([s.cx, s.top - 18], 4.6);
    const crust = wallToWall(s, -1.3).d;
    const lines = Array.from({ length: ZONES + 1 }, (_, k) => wornArc(s, k * PER_ZONE, 7 + k * 31));
    const bands = ZONE_INFO.map((_, k) => {
      const mid = k * PER_ZONE + PER_ZONE / 2;
      return { k, path: wallToWall(s, mid).d };
    });
    const wash = ZONE_INFO.map((_, k) => bandPath(s, k * PER_ZONE, (k + 1) * PER_ZONE));
    // The finds in the rows where each first turns up, left of the depths and seals.
    const finds = FINDS_BY_DEPTH.map((x, i) => {
      const gx = ax - FIND_X[i % FIND_X.length];
      return { ...x, x: gx, y: pointAt(s, unitsOf(x.from + 1), gx)[1] };
    });
    const wallTop = pointAt(s, 0, s.x0)[1];
    const deepTop = pointAt(s, ZONES * PER_ZONE, s.cx)[1];
    // The deep's inscription follows the curve of the tenth zone's floor.
    const deepPath = wallToWall(s, ZONES * PER_ZONE + DEEP_LABEL / s.unit);
    const glow = Array.from({ length: ZONES + 1 }, (_, k) => wallToWall(s, k * PER_ZONE).d).join('');
    return { sol, crust, lines, glow, bands, wash, finds, hatch: rockHatch(s), wallTop, deepTop, deepPath };
  });

  /** Widths of the inscriptions' words, measured once the fonts are in (to centre each with its sigil). */
  let measure = $state<((t: string, font: 'name' | 'num') => number) | null>(null);
  $effect(() => {
    let live = true;
    const ctx = document.createElement('canvas').getContext('2d');
    const make = () => {
      if (!ctx || !live) return;
      const css = getComputedStyle(document.documentElement);
      const fonts = { name: `10.5px ${css.getPropertyValue('--font-display')}`, num: `10.5px ${css.getPropertyValue('--font-cinzel')}` };
      const spacing = { name: 0.12, num: 0.04 };
      measure = (t, font) => {
        ctx.font = fonts[font];
        return ctx.measureText(font === 'name' ? t.toUpperCase() : t).width + t.length * 10.5 * spacing[font];
      };
    };
    make();
    document.fonts?.ready.then(make);
    return () => (live = false);
  });
  const width$ = (t: string, font: 'name' | 'num') => (measure ? measure(t, font) : t.length * (font === 'name' ? 8.2 : 7.4));

  /** A sigil's seal's radius. */
  const SEAL = 7.2;
  /** Gaps between a zone's depth, its seal and its name. */
  const SPACE = 5;
  /** Half the gap down the axis that the star travels in. */
  const AXIS = 9;
  /**
   * The axis: under the sun, unless the longest name would then run into
   * the right wall (on a narrow drawing), when it moves left just enough.
   */
  const ax = $derived.by(() => {
    if (!s) return 0;
    const longest = Math.max(...ZONE_INFO.map((z) => width$(z.name, 'name')));
    return s.cx - Math.max(0, AXIS + longest + 6 - (s.x1 - s.cx));
  });
  /**
   * Zone `k`'s inscription along the middle of its band, either side of the
   * axis the star goes down: its first depth left of it (and once reached
   * its seal before that), its name right of it.
   */
  function inscribe(k: number, named: boolean) {
    if (!s) return null;
    const mid = k * PER_ZONE + PER_ZONE / 2;
    const z = ZONE_INFO[k];
    const num = width$(String(z.from), 'num');
    const [left, right] = [alongAt(s, mid, ax - AXIS), alongAt(s, mid, ax + AXIS)];
    return { left, right, seal: named ? pointAlong(s, mid, left - num - SPACE - SEAL) : null };
  }

  const face = $derived(s ? wallToWall(s, Math.max(0, u)) : null);
  const below = $derived(s ? belowPath(s, Math.max(-1.2, u)) : '');
  /** What the drawing shows, in words. */
  const summary = $derived(
    `The descent: ${ZONES} zones of ${PER_ZONE} depths each, then on without end. ` +
      (shown === null ? 'No run yet.' : `Your deepest: ${shown}, in ${here < ZONES ? ZONE_INFO[here].name : nameDeep}.`),
  );
  /** The star on the face, down the axis; in the legend's place before a run. */
  const mark = $derived.by(() => {
    if (!s) return null;
    if (u < 0) return { x: s.x0 + 6, y: 11, r: 4.6 };
    return { x: ax, y: pointAt(s, u, ax)[1], r: 5.4 };
  });
</script>

<div class="plate" class:wide class:settled bind:clientWidth={width} style:--sw="{sw}px">
  {#if s && art}
    <div class="section" style:width="{sw}px" style:height="{sh}px">
      <svg viewBox="0 0 {sw} {sh}" width={sw} height={sh} role="img" aria-label={summary}>
        <defs>
          <clipPath id="pb-rock-{uid}"><path d={below} /></clipPath>
          <clipPath id="pb-walls-{uid}"><rect x={s.x0} y="0" width={s.x1 - s.x0} height={sh} /></clipPath>
          <linearGradient id="pb-fade-{uid}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#fff" />
            <stop offset={f(art.deepTop / sh)} stop-color="#fff" />
            <stop offset="1" stop-color="#fff" stop-opacity="0.3" />
          </linearGradient>
          <mask id="pb-deep-{uid}" maskUnits="userSpaceOnUse" x="0" y="0" width={sw} height={sh}>
            <rect x="0" y="0" width={sw} height={sh} fill="url(#pb-fade-{uid})" />
          </mask>
        </defs>

        <!-- The zones reached, washed in their colours. -->
        <g class="washes">
          {#each art.wash as d, k (k)}
            {#if k < reached}
              <path {d} class="wash" class:here={k === here} style:--c={ZONE_INFO[k].color} style:--d={sec(0.5 + k * 0.05)} />
            {/if}
          {/each}
        </g>

        <!-- The rock not dug yet: each ledge shaded under its floor, and the deep running on. -->
        <g clip-path="url(#pb-walls-{uid})">
          <g clip-path="url(#pb-rock-{uid})" mask="url(#pb-deep-{uid})" class="rock">
            <path class="ledge" d={art.hatch.ledges} />
            <path class="deep-hatch" d={art.hatch.deep} />
          </g>
        </g>

        <!-- The sun over the surface. -->
        <g class="sun">
          <circle cx={s.cx} cy={s.top - 18} r={art.sol.r} class="glowline" />
          <circle cx={s.cx} cy={s.top - 18} r={art.sol.r} class="ln" />
          <circle cx={s.cx} cy={s.top - 18} r={art.sol.ring} class="ln thin" />
          <circle cx={s.cx} cy={s.top - 18} r="1.1" class="dot" />
          <path d={art.sol.rays} class="ray" />
          <path d={art.sol.glory} class="glory" />
        </g>

        <!-- The walls, and the strata between them, on a soft glow. -->
        <g mask="url(#pb-deep-{uid})">
          <path class="glow" d={art.glow} />
          <path class="crust" d={art.crust} pathLength="100" />
          <path class="wall" d="M{f(s.x0)} {f(art.wallTop)}V{sh}" pathLength="100" />
          <path class="wall" d="M{f(s.x1)} {f(art.wallTop)}V{sh}" pathLength="100" />
          {#each art.lines as pieces, k (k)}
            {#each pieces as p, i (i)}
              <path d={p.d} class="stratum" class:surface={k === 0} style:--d={sec(0.15 + k * 0.08 + p.t0 * 0.5)} style:--t={sec((p.t1 - p.t0) * 0.5)} pathLength="100" />
            {/each}
          {/each}
        </g>

        <!-- The star's legend, and the clock. -->
        <g class="legend">
          {#if shown !== null}
            <path d={star([s.x0 + 6, 11], 4.6)} class="legend-star" />
          {/if}
          <text x={s.x0 + 14} y="15" class="note">{#if shown === null}no run yet{:else}your deepest <tspan class="best">{shown}</tspan>{/if}</text>
          <text x={sw - 1} y="15" text-anchor="end" class="note">clock <tspan class="n">{clockAt(0)}</tspan>s, down to <tspan class="n">{DELVE_MIN_TIMER}</tspan>s</text>
        </g>

        <!-- The face dug to (the words below cut it, as an engraver stops short of them). -->
        {#if face && u >= 0}
          <g clip-path="url(#pb-walls-{uid})" class="face-line">
            <path d={face.d} class="face-glow" />
            <path d={face.d} class="face" />
          </g>
        {/if}

        <!-- Each zone's first depth, and once reached its sigil and name. -->
        {#each art.bands as band (band.k)}
          {@const k = band.k}
          {@const z = ZONE_INFO[k]}
          {@const l = inscribe(k, k < reached)}
          {#if l}
            <path id="{uid}-n{k}" d={band.path} fill="none" stroke="none" />
            <text class="inscription" class:on={k < reached} style:--d={sec(0.75 + k * 0.07)} dy="3.6">
              <textPath href="#{uid}-n{k}" startOffset={f(l.left)} text-anchor="end" class="num">{z.from}</textPath>
            </text>
            {#if k < reached}
              <text class="inscription on" style:--c={z.color} style:--d={sec(0.95 + k * 0.08)} dy="3.6">
                <textPath href="#{uid}-n{k}" startOffset={f(l.right)} class="name">{z.name}</textPath>
              </text>
            {/if}
            {#if k < reached && l.seal}
              {@const sig = sigilOf(z.name)}
              <g transform="translate({f(l.seal.p[0])} {f(l.seal.p[1])}) rotate({f(l.seal.deg)})" style:--c={z.color}>
                <g class="seal" style:--d={sec(0.9 + k * 0.08)}>
                  <circle r={SEAL} class="seal-bg" />
                  <circle r={SEAL} class="seal-ring" />
                  <g transform="scale({f((SEAL - 1.3) / 10)})">
                    {#if sig.shade}<path d={sig.shade} class="sig-shade" />{/if}
                    <path d={sig.fine} class="sig-fine" />
                    <path d={sig.lines} class="sig-line" />
                  </g>
                </g>
              </g>
            {/if}
          {/if}
        {/each}

        <!-- The endless deep: unnamed until reached. -->
        <path id="{uid}-deep" d={art.deepPath.d} fill="none" stroke="none" />
        <text class="deep-note" class:named={!!nameDeep}><textPath href="#{uid}-deep" startOffset={f(art.deepPath.length / 2)} text-anchor="middle">{nameDeep ?? 'and on, without end'}</textPath></text>

        <!-- The star on the face. -->
        {#if mark}
          <g class="mark" transform="translate({f(mark.x)} {f(mark.y)})">
            <circle r={mark.r + 0.2} class="mark-bg" />
            <path d={star([0, 0], mark.r)} class="mark-star" />
          </g>
        {/if}
      </svg>
      {#each art.finds as x, i (x.kind)}
        <span class="find-mark" style:left="{x.x}px" style:top="{x.y}px" style:--d={sec(1.2 + i * 0.12)}><ItemGlyph kind={GLYPH[x.kind]} /></span>
      {/each}
    </div>
  {/if}

  <div class="key">
    <p class="lead" style:--d={sec(0.4)}><span class="cap">Finds</span> <i>A card may hold one: a harder question, for an item to carry (<span class="num">{CARRY}</span> of each at most). Flares and dynamite don't work on it; from <span class="num">{FINDS_FADE}</span>, finds grow rarer.</i></p>
    {#each FINDS_BY_DEPTH as x, i (x.kind)}
      {@const k = FIND_KEY[x.kind]}
      <p class="find" style:--find={FIND_COLOR[x.kind]} style:--d={sec(0.55 + i * 0.15)}>
        <span class="glyph"><ItemGlyph kind={GLYPH[x.kind]} /></span><span class="cap">{k.name}</span>
        <span class="from"><i>from</i> {x.from}</span>
        <i>{k.gives}</i> <i class="risk">{k.risk}</i>
      </p>
    {/each}
  </div>
</div>

<style>
  .plate {
    --ink: #c9a45c;
    --ink-hi: #f1d99b;
    --ink-lo: #7d6333;
    --halo: #17130e;
    display: grid;
    gap: 10px;
  }
  .plate.wide {
    grid-template-columns: var(--sw) minmax(0, 1fr);
    gap: 14px;
    align-items: start;
  }
  .section {
    position: relative;
  }
  svg {
    display: block;
    overflow: visible;
  }
  text {
    font-family: var(--font-cinzel);
  }

  .wash {
    fill: var(--c);
    opacity: 0.1;
    transition: opacity 0.4s;
    animation: fade 0.6s ease-out var(--d, 0.5s) both;
  }
  .rock {
    animation: fade 0.8s ease-out 0.6s both;
  }
  .wash.here {
    opacity: 0.17;
  }
  .rock path {
    fill: none;
    stroke: var(--ink-lo);
    stroke-width: 0.5px;
  }
  .deep-hatch {
    opacity: 0.85;
  }

  .glow {
    fill: none;
    stroke: var(--ink);
    stroke-width: 2px;
    opacity: 0.13;
    animation: fade 1s ease-out 0.6s both;
  }
  .stratum {
    fill: none;
    stroke: var(--ink);
    stroke-width: 0.7px;
    stroke-dasharray: 100;
    animation: draw var(--t) linear var(--d) both;
  }
  .stratum.surface {
    stroke: var(--ink-hi);
    stroke-width: 0.9px;
  }
  .wall {
    fill: none;
    stroke: var(--ink);
    stroke-width: 0.7px;
    stroke-dasharray: 100;
    animation: draw 1.1s ease-in-out 0.2s both;
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: scale(0.4) rotate(-40deg);
    }
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  @keyframes stamp {
    from {
      opacity: 0;
      transform: scale(1.7);
    }
  }
  @keyframes draw {
    from {
      stroke-dashoffset: 100;
    }
    to {
      stroke-dashoffset: 0;
    }
  }

  .sun .ln,
  .sun .ray {
    fill: none;
    stroke: var(--ink-hi);
    stroke-width: 0.8px;
  }
  .sun .ln.thin {
    stroke-width: 0.5px;
  }
  .sun .glory {
    fill: none;
    stroke: var(--ink);
    stroke-width: 0.4px;
  }
  .sun {
    transform-box: fill-box;
    transform-origin: center;
    animation: rise 0.9s cubic-bezier(0.2, 0.8, 0.3, 1) 0s both;
  }
  .crust {
    fill: none;
    stroke: var(--ink);
    stroke-width: 0.45px;
    stroke-dasharray: 100;
    animation: draw 0.7s ease-out 0.1s both;
  }
  .sun .glowline {
    fill: rgba(241, 217, 155, 0.15);
    stroke: none;
  }
  .sun .dot {
    fill: var(--ink-hi);
  }

  .inscription {
    font-size: 10.5px;
    fill: var(--muted);
    stroke: var(--halo);
    stroke-width: 3px;
    stroke-linejoin: round;
    paint-order: stroke;
    animation: fade 0.5s ease-out var(--d) both;
  }
  .inscription .num {
    font-family: var(--font-cinzel);
    letter-spacing: 0.04em;
  }
  .inscription.on .num {
    fill: var(--ink-hi);
  }
  .inscription .name {
    font-family: var(--font-display);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    fill: color-mix(in srgb, var(--c), #fff 25%);
  }
  .legend .n {
    font-family: var(--font-cinzel);
    font-style: normal;
    font-size: 10.5px;
  }
  .legend .best {
    font-family: var(--font-cinzel);
    font-style: normal;
    font-weight: 700;
    font-size: 11px;
    fill: var(--ink-hi);
  }
  .legend .note {
    font-family: var(--font-body);
    font-style: italic;
    font-size: 12px;
    fill: var(--muted);
  }
  .legend text,
  .legend-star {
    animation: fade 0.6s ease-out var(--d, 1.5s) both;
  }
  .legend-star {
    fill: none;
    stroke: var(--ink-hi);
    stroke-width: 0.7px;
  }
  .seal {
    transform-box: fill-box;
    transform-origin: center;
    animation: stamp 0.35s cubic-bezier(0.3, 1.4, 0.5, 1) var(--d) both;
  }
  .seal-bg {
    fill: var(--halo);
  }
  .seal-ring {
    fill: none;
    stroke: var(--c);
    stroke-width: 0.7px;
  }
  .sig-line,
  .sig-fine,
  .sig-shade {
    fill: none;
    stroke: color-mix(in srgb, var(--c), #fff 30%);
    vector-effect: non-scaling-stroke;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .sig-line {
    stroke-width: 0.75px;
  }
  .sig-fine {
    stroke-width: 0.5px;
  }
  .sig-shade {
    stroke-width: 0.35px;
    opacity: 0.8;
  }

  .deep-note.named {
    font-family: var(--font-display);
    font-style: normal;
    font-size: 10.5px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    fill: var(--ink-hi);
  }
  .deep-note {
    font-family: var(--font-body);
    font-style: italic;
    font-size: 12px;
    fill: var(--muted);
    stroke: var(--halo);
    stroke-width: 3px;
    paint-order: stroke;
  }

  .find-mark {
    position: absolute;
    --h: 12px;
    transform: translate(-50%, -50%);
    animation: fade 0.5s ease-out var(--d) both;
  }

  .face-glow {
    fill: none;
    stroke: rgba(241, 217, 155, 0.35);
    stroke-width: 3px;
    filter: blur(1.5px);
  }
  .face {
    fill: none;
    stroke: var(--ink-hi);
    stroke-width: 1px;
  }
  .face-line {
    animation: fade 0.6s ease-out var(--d, 1.4s) both;
  }
  .mark {
    animation: fade 0.4s ease-out 1.55s both;
  }
  .mark-star {
    transform-box: fill-box;
    transform-origin: center;
    animation: stamp 0.5s cubic-bezier(0.3, 1.4, 0.5, 1) 1.55s both;
  }
  .mark-bg {
    fill: var(--halo);
  }
  .mark-star {
    fill: var(--ink-hi);
    stroke: none;
    filter: drop-shadow(0 0 2px rgba(241, 217, 155, 0.8));
  }

  .key {
    display: grid;
    gap: 5px;
    align-content: start;
    font-size: 12.5px;
    line-height: 1.2;
    color: var(--muted);
  }
  .key p {
    margin: 0;
    animation: fade 0.6s ease-out var(--d) both;
  }
  /* Once it has inked itself in, whatever comes later (a zone reached) comes at once. */
  .settled * {
    --d: 0s !important;
  }
  .deep-note {
    animation: fade 0.6s ease-out 1.3s both;
  }
  @media (prefers-reduced-motion: reduce) {
    .plate * {
      animation: none !important;
    }
  }
  .cap {
    font-family: var(--font-display);
    font-size: 10.5px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ink-hi);
    margin-right: 0.3em;
  }
  .find .cap {
    color: var(--find);
  }
  .glyph {
    --h: 12px;
    display: inline-block;
    vertical-align: -1px;
    margin-right: 0.35em;
  }
  .from,
  .num {
    font-family: var(--font-cinzel);
    font-style: normal;
    font-size: 10.5px;
  }
  .from {
    color: var(--find);
    margin-right: 0.2em;
  }
  .from i {
    font-family: var(--font-body);
    font-size: 12.5px;
  }
  .risk {
    color: color-mix(in srgb, var(--find) 50%, var(--muted));
  }
</style>
