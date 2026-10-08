<script lang="ts">
  import { onMount } from 'svelte';
  import { SOL_RAYS } from '../lib/alchemy';
  import { star8 } from '../lib/arcane';
  import { FINDS_FROM, FINDS_IN_ORDER, shownDepth, type FindKind } from '../lib/delve';
  import { descentPlate, f, KEY_R, ZONES, type Box, type CalloutShape, type Layout, type Target } from '../lib/descentPlate';
  import { FIND_TEXT } from '../lib/difficultyText';
  import ItemGlyph from './ItemGlyph.svelte';

  // The descent, engraved (lib/descentPlate draws it): Sol over the mouth of
  // a pit that narrows down through the ten zones, a terrace each, and past
  // them carries on forever, its walls breaking up and fading into the dark
  // round a last seal holding the ouroboros, which turns slowly. A zone you
  // have reached holds its sigil in a seal struck in its colour, and is
  // named in the margin; one you haven't is a dull, empty impression, and
  // those are bracketed together under the one word "uncharted", so nothing
  // is spoiled. In a lane left of the pit a gold star marks your deepest and
  // a red one your last run (`last`), each with its depth under it (the gold
  // one by the mouth before a first run; past 100 a star sits in the
  // ouroboros, its depth beside the seal); a small legend left of the
  // ouroboros says which is which. Each find you have met (`met`) is tied to
  // its heading by a fine gold line from the wall where it first turns up,
  // that depth written by it: to its heading in the finds list (`finds`)
  // when that stands beside the plate, or, when the list is stacked under it
  // (phones and tablets), to the find's callout, its item and name, which
  // the plate stands on its own right. One you haven't met is a dim callout
  // with no line.
  // In the arcane style (docs/arcane-style.md): fine exact lines that stop
  // short of every seal, sign and word, one-sided hatching, a little wear, a
  // soft glow under the lit lines. It draws itself in from the surface down
  // as one sweep of the pen, the seals stamped in as it passes them, the
  // lines run out, then the gold star comes down the lane from the mouth to
  // your deepest (its cutout, a mask over the plate, travels with it), the
  // red one appears and the depths with them. After that only the glows
  // breathe, the stars' glories and the ouroboros turn slowly and the gold
  // star twinkles, all on their own layers; still (reduced motion, or
  // data-still) the stars just appear in their places and nothing loops.
  // The plate fills its box: the whole column, its caption (`caption`) at
  // the top beside Sol. Stacked, the column takes the height the plate asks
  // for (`natural`).
  let {
    deepest = null,
    last = null,
    label = 'Your deepest',
    met = [],
    caption = null,
    finds = null,
    natural = $bindable(0),
    stacked = $bindable(true),
  }: {
    deepest?: number | null;
    last?: number | null;
    label?: string;
    met?: FindKind[];
    caption?: HTMLElement | null;
    finds?: HTMLElement | null;
    natural?: number;
    stacked?: boolean;
  } = $props();
  const uid = $props.id();
  /** The legend's words. */
  const KEY = { best: 'your best', last: 'last run' } as const;

  let fig: HTMLElement | undefined = $state();
  let w = $state(0);
  let h = $state(0);
  /** Where the caption and the finds' headings are, how the callouts are shaped, how wide the names are set (measured; see measure()). */
  let cap = $state<Box | null>(null);
  let beside = $state<Layout['beside']>(null);
  let shapes = $state<Layout['callouts']>(null);
  let nameW = $state<number[] | null>(null);
  let legendW = $state<{ best: number; last: number } | null>(null);

  /** The finds you have met, with the depth each first turns up at. */
  const metFinds = $derived(FINDS_IN_ORDER.filter((x) => met.includes(x.kind)).map((x) => ({ kind: x.kind, from: x.from })));
  const plate = $derived(w > 0 && h > 0 ? descentPlate(w, h, deepest, metFinds, { caption: cap, beside, callouts: shapes, nameW, legendW }, last) : null);
  $effect(() => {
    if (plate) natural = plate.natural;
  });
  $effect(() => {
    stacked = !beside;
  });
  /** Each find's item, as the game draws it. */
  const GLYPH = { azurite: 'ward', flare: 'flare', dynamite: 'dynamite' } as const;
  const FIND_NAME = { azurite: 'Azurite Veins', flare: 'Flare Caches', dynamite: 'Dynamite Caches' } as const;
  const best = $derived(deepest && deepest > 0 ? Math.floor(deepest) : null);
  const lastRun = $derived(last && last > 0 ? Math.floor(last) : null);
  const reached = $derived(ZONES.filter((z) => Math.max(best ?? 0, lastRun ?? 0) >= z.from).length);
  const sec = (s: number) => `${s.toFixed(3)}s`;
  /** The legend's small stars. */
  const keyStar = star8([0, 0], KEY_R).outline;

  /**
   * Where the caption and each find's item in the headings are, relative to
   * the plate. The headings are only targets when they stand beside it (to
   * its right); stacked under it, the plate stands its own callouts on its
   * right, and they are measured instead (their shapes: where they stand is
   * the plate's to say). The zones' names are measured as set.
   */
  function measure() {
    if (!fig) return;
    const r = fig.getBoundingClientRect();
    const rel = (b: { left: number; top: number; right: number; bottom: number }): Box =>
      [b.left - r.left, b.top - r.top, b.right - r.left, b.bottom - r.top].map((v) => Math.round(v * 4) / 4) as Box;
    let c: Box | null = null;
    if (caption) {
      // The caption's words, not its whole line.
      const range = document.createRange();
      range.selectNodeContents(caption);
      const b = range.getBoundingClientRect();
      if (b.width > 0) c = rel(b);
    }
    const ts: Target[] = [];
    for (const { kind } of FINDS_IN_ORDER) {
      const g = finds?.querySelector(`[data-find="${kind}"] .find-glyph svg`) ?? finds?.querySelector(`[data-find="${kind}"] .find-glyph`);
      if (!g) continue;
      const b = rel(g.getBoundingClientRect());
      ts.push({ kind, x: b[0], y: (b[1] + b[3]) / 2 });
    }
    const isBeside = !!finds && ts.length > 0 && ts.every((t) => t.x > r.width * 0.6);
    const nextBeside = isBeside ? { targets: ts, wall: rel(finds!.getBoundingClientRect())[0] } : null;
    let nextShapes: Partial<Record<FindKind, CalloutShape>> | null = null;
    if (!isBeside) {
      nextShapes = {};
      for (const { kind } of FINDS_IN_ORDER) {
        const el = fig.querySelector(`[data-callout="${kind}"]`);
        const g = el?.querySelector('.c-glyph svg');
        const n = el?.querySelector('.c-name');
        if (!el || !g || !n) continue;
        const b = el.getBoundingClientRect();
        const inner = (e: Element): Box => {
          const x = e.getBoundingClientRect();
          return [x.left - b.left, x.top - b.top, x.right - b.left, x.bottom - b.top].map((v) => Math.round(v * 4) / 4) as Box;
        };
        nextShapes[kind] = { x: rel(b)[0], w: b.width, h: b.height, icon: inner(g), name: inner(n) };
      }
    }
    // The names as the plate sets them: the display face's capitals at 11 px, spaced 0.06 em.
    let nw: number[] | null = null;
    let lw: { best: number; last: number } | null = null;
    const ctx = document.createElement('canvas').getContext('2d');
    if (ctx) {
      ctx.font = `11px ${getComputedStyle(fig).getPropertyValue('--font-display') || 'serif'}`;
      nw = ZONES.map((z) => Math.ceil(ctx.measureText(z.name.toUpperCase()).width + z.name.length * 0.66));
      ctx.font = `12px ${getComputedStyle(fig).getPropertyValue('--font-body') || 'serif'}`;
      lw = { best: Math.ceil(ctx.measureText(KEY.best).width), last: Math.ceil(ctx.measureText(KEY.last).width) };
    }
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    if (!same(c, cap)) cap = c;
    if (!same(nextBeside, beside)) beside = nextBeside;
    if (!same(nextShapes, shapes)) shapes = nextShapes;
    if (!same(nw, nameW)) nameW = nw;
    if (!same(lw, legendW)) legendW = lw;
  }

  let frame = 0;
  const soon = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(measure);
  };
  // The callouts come and go with the layout; measure them once they are there.
  $effect(() => {
    void beside;
    soon();
  });

  onMount(() => {
    const ro = new ResizeObserver(soon);
    for (const e of [fig, caption, finds, finds?.parentElement, fig?.parentElement]) if (e) ro.observe(e);
    finds?.querySelectorAll('dt').forEach((e) => ro.observe(e));
    addEventListener('resize', soon);
    document.fonts?.ready.then(soon);
    document.fonts?.addEventListener('loadingdone', soon);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      removeEventListener('resize', soon);
      document.fonts?.removeEventListener('loadingdone', soon);
    };
  });

  const words = (n: number) => ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][n] ?? String(n);
  const summary = $derived(
    [
      `The descent: ten zones of ten depths, then it goes on forever.`,
      // Not said elsewhere on the page (the lives are, in the mode's description above).
      `Finds turn up from depth ${shownDepth(FINDS_FROM)}. The deeper you go, the less time you get and the trickier the questions.`,
      reached === 0
        ? 'All ten zones are uncharted.'
        : reached === ZONES.length
          ? `Zones reached: all ten, ${ZONES.map((z) => z.name).join(', ')}.`
          : `Zones reached: ${ZONES.slice(0, reached)
              .map((z) => z.name)
              .join(', ')}. ${ZONES.length - reached === 1 ? 'The last one is' : `The other ${words(ZONES.length - reached)} are`} uncharted.`,
      best ? `${label}: depth ${shownDepth(best)}.` : '',
      lastRun ? `Your last run: depth ${shownDepth(lastRun)}.` : '',
      ...metFinds.map((x) => `${FIND_NAME[x.kind]} turn up from depth ${shownDepth(x.from)}.`),
    ]
      .filter(Boolean)
      .join(' '),
  );
</script>

<figure class="descent" role="img" aria-label={summary} bind:this={fig} bind:clientWidth={w} bind:clientHeight={h}>
  {#if plate}
    {@const p = plate}
    <!-- The stars' cutouts: the plate and its glow are masked round each star, the gold one's cutout travelling down with it. -->
    <svg class="defs" aria-hidden="true">
      <mask id="{uid}-cut" maskUnits="userSpaceOnUse" x="-200" y="-200" width={f(p.w + 400)} height={f(p.h + 400)}>
        <rect x="-200" y="-200" width={f(p.w + 400)} height={f(p.h + 400)} fill="#fff" />
        {#each [p.star, p.last] as s, i (i)}
          {#if s}
            <g transform="translate({f(s.c[0])} {f(s.c[1])})">
              <circle
                class="cutout"
                class:travel={s.travel > 0}
                class:into={!!s.mid}
                r={f(s.cut)}
                style:--fx="{f(s.from[0])}px"
                style:--fy="{f(s.from[1])}px"
                style:--mx="{f(s.mid?.[0] ?? 0)}px"
                style:--my="{f(s.mid?.[1] ?? 0)}px"
                style:--d={sec(s.delay)}
                style:--go={sec(s.delay + 0.25)}
                style:--t={sec(s.travel)}
              />
            </g>
          {/if}
        {/each}
      </mask>
    </svg>

    <!-- The glow: the lit lines again, whole, wide and soft, under the plate. It breathes. -->
    <svg class="glow" viewBox="0 0 {f(p.w)} {f(p.h)}" aria-hidden="true">
      <g mask="url(#{uid}-cut)">
        {#each p.parts as part, i (i)}
          {#each part.glow as g, j (j)}<path d={g.d} class="{g.kind} {part.tone}" style:--c={part.color} />{/each}
        {/each}
        {#each p.seals as s (s.k)}
          {#if s.known}<circle class="light" cx={s.c[0]} cy={s.c[1]} r={s.r} style:--c={s.color} />{/if}
        {/each}
        <circle class="light sun" cx={p.sol.c[0]} cy={p.sol.c[1]} r={p.sol.r} />
        {#if p.endless.lit}<circle class="light sun" cx={p.endless.c[0]} cy={p.endless.c[1]} r={p.endless.r} />{/if}
      </g>
    </svg>

    <svg class="plate" viewBox="0 0 {f(p.w)} {f(p.h)}" aria-hidden="true">
      <g mask="url(#{uid}-cut)">
        {#each p.shades as s, i (i)}
          <path class="shade draw {s.tone}" d={s.d} style:--c={s.color} style:--d={sec(s.delay)} style:--t={sec(s.t)} style:--o={s.o} pathLength="100" />
        {/each}
        {#each p.parts as part, i (i)}
          <g class={part.tone} style:--c={part.color}>
            {#each part.strokes as s, j (j)}
              <path d={s.d} class="draw {s.kind}" style:--d={sec(s.delay)} style:--t={sec(s.t)} style:opacity={s.o} pathLength="100" />
            {/each}
          </g>
        {/each}

        <!-- Sol over the mouth: a disc with a point at its heart and twelve rays, long and short in turn (lib/alchemy). -->
        <g class="stamp" style:--d="0.05s">
          <g class="sign sol" transform="translate({f(p.sol.c[0])} {f(p.sol.c[1])}) scale({f((p.sol.r - 1.3) / 11.4)})">
            <circle r="5" />
            <circle r="1.1" class="point" />
            <path d={SOL_RAYS} />
          </g>
        </g>

        <!-- The seals: a reached zone's sigil, struck in its colour; an empty hollow for one not reached. -->
        {#each p.seals as s (s.k)}
          <g class="stamp" style:--d={sec(s.delay)}>
            {#if s.sigil}
              <g class="sigil" style:--c={s.color} transform="translate({f(s.c[0])} {f(s.c[1])}) scale({f((s.r - 2.4) / 10)})">
                {#if s.sigil.shade}<path class="s-shade" d={s.sigil.shade} />{/if}
                <path class="s-fine" d={s.sigil.fine} />
                <path d={s.sigil.lines} />
              </g>
            {:else}
              <path class="hollow" d={s.hollow} />
            {/if}
          </g>
        {/each}
        <!-- The last seal, on the stretch that never ends: the ouroboros, an engraved serpent biting its tail, turning slowly. -->
        <g transform="translate({f(p.endless.c[0])} {f(p.endless.c[1])})">
          <g class="stamp" style:--d={sec(p.endless.delay)}>
            <g class="coil">
              <g class="serpent" class:lit={p.endless.lit}>
                <path class="sp-shade" d={p.endless.serpent.shade} />
                <path class="sp-belly" d={p.endless.serpent.belly} />
                <path class="sp-scales" d={p.endless.serpent.scales} />
                <path class="sp-body" d={p.endless.serpent.body} />
                <path class="sp-head" d={p.endless.serpent.head} />
                <path class="sp-detail" d={p.endless.serpent.details} />
                <circle class="sp-eye" cx={f(p.endless.serpent.eye.c[0])} cy={f(p.endless.serpent.eye.c[1])} r={f(p.endless.serpent.eye.r)} />
                <path class="sp-pupil" d={p.endless.serpent.pupil} />
              </g>
            </g>
          </g>
        </g>
        {#each p.names as n (n.text)}
          <text class="name" x={f(n.x)} y={f(n.y)} style:--c={n.color} style:--d={sec(n.delay)}>{n.text}</text>
        {/each}
        <!-- The zones not reached yet, bracketed under one word. -->
        {#if p.uncharted}
          <g class="uncharted" style:--d={sec(p.uncharted.delay)}>
            {#if p.uncharted.d}<path d={p.uncharted.d} />{/if}
            <text class="word" x={f(p.uncharted.x)} y={f(p.uncharted.y)}>uncharted</text>
          </g>
        {/if}
      </g>

      <!-- Which star is which, left of the ouroboros. -->
      <g class="legend" style:--d={sec(p.legend.delay)}>
        {#each p.legend.rows as r (r.kind)}
          <g class="key {r.kind}">
            <path class="key-star" d={keyStar} transform="translate({f(p.legend.x + KEY_R)} {f(r.y)})" />
            <text x={f(p.legend.x + 2 * KEY_R + 5)} y={f(r.y)}>{KEY[r.kind]}</text>
          </g>
        {/each}
      </g>

      <!-- The finds you have met: a station on the wall where each first turns up, and that depth by its line. -->
      {#each p.stations as s (s.kind)}
        <circle class="station" cx={f(s.c[0])} cy={f(s.c[1])} r="1.1" style:--d={sec(s.delay)} />
      {/each}
      {#each p.marks as m (m.kind)}
        <text class="mark" x={f(m.x)} y={f(m.y)} style:--c="var(--find-{m.kind})" style:--d={sec(m.delay)}>{m.text}</text>
      {/each}
    </svg>

    <!-- The stars, on a layer of their own: eight-pointed, hatched down one side of each point, in a glory of fine rays that slowly turns.
         The gold one (your deepest) comes down from the mouth; the red one (your last run) appears as it lands. -->
    <svg class="live" viewBox="0 0 {f(p.w)} {f(p.h)}" aria-hidden="true">
      {#each [p.last, p.star] as s, i (i)}
        {#if s}
          <g class={i ? 'gold-star' : 'red-star'} transform="translate({f(s.c[0])} {f(s.c[1])})">
            <g
              class="star"
              class:travel={s.travel > 0}
              class:into={!!s.mid}
              style:--fx="{f(s.from[0])}px"
              style:--fy="{f(s.from[1])}px"
              style:--mx="{f(s.mid?.[0] ?? 0)}px"
              style:--my="{f(s.mid?.[1] ?? 0)}px"
              style:--d={sec(s.delay)}
              style:--go={sec(s.delay + 0.25)}
              style:--t={sec(s.travel)}
            >
              <circle class="halo" r={f(s.gloryR - 1)} />
              <g class="turn">
                <path class="glory draw" d={s.glory} pathLength="100" style:--d={sec(s.delay + 0.1)} style:--t="0.4s" />
              </g>
              <g class="stamp">
                <path class="star-ground" d={s.outline} />
                <path class="star-hatch" d={s.hatch} />
                <path class="star-line" d={s.outline} />
                <path class="star-ridge" d={s.ridges} />
              </g>
              {#if i}
                <!-- A glint crossing the star now and then, turned between its points. -->
                <path
                  class="twinkle"
                  d="M0 {f(-s.r * 1.9)}L{f(s.r * 0.16)} 0L0 {f(s.r * 1.9)}L{f(-s.r * 0.16)} 0ZM{f(-s.r * 1.9)} 0L0 {f(s.r * 0.16)}L{f(s.r * 1.9)} 0L0 {f(-s.r * 0.16)}Z"
                  style:--d={sec(s.delay + s.travel + 1.6)}
                />
              {/if}
            </g>
          </g>
          {#if s.num}
            <text class="depth {i ? 'gold-num' : 'red-num'}" x={f(s.num.x)} y={f(s.num.y)} text-anchor={s.num.anchor} style:--d={sec(s.delay + 0.25 + s.travel)}>{s.num.text}</text>
          {/if}
        {/if}
      {/each}
    </svg>
  {/if}

  <!-- Stacked: each find's item and name on the plate's right, tied to the wall by its line once you have met it. -->
  {#if !beside}
    <div class="callouts">
      {#each FINDS_IN_ORDER as x (x.kind)}
        {@const c = plate?.callouts?.find((o) => o.kind === x.kind)}
        <div class="callout" class:met={met.includes(x.kind)} data-callout={x.kind} style:--c="var(--find-{x.kind})" style:margin-top="{f(c?.top ?? 0)}px" style:--d={sec(c?.delay ?? 1)}>
          <span class="c-glyph"><ItemGlyph kind={GLYPH[x.kind]} /></span>
          <span class="c-name">{FIND_TEXT[x.kind].name}</span>
        </div>
      {/each}
    </div>
  {/if}
</figure>

<style>
  /* The plate fills the box it is given (the whole column, outside the flow); its leaders run on past its right edge. */
  .descent {
    position: absolute;
    inset: 0;
    margin: 0;
    color: var(--gold);
    --dull: #6f6453;
    --find-dynamite: #eebf96;
    --find-flare: #f7a3b3;
    --find-azurite: #a9cdf5;
    /* The last run's star: old blood, as the game's life globes. */
    --red: #b4432f;
    --red-hi: #cf5e45;
    --red-num: #dc8a73;
    pointer-events: none;
  }
  svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  path,
  circle {
    fill: none;
    stroke: currentColor;
    stroke-linecap: butt;
    stroke-linejoin: miter;
    stroke-miterlimit: 12;
  }
  .gold {
    stroke: var(--gold);
  }
  .dull,
  .dull path {
    stroke: var(--dull);
  }
  .zone path,
  path.zone {
    stroke: color-mix(in srgb, var(--c) 55%, #d9a45a);
  }
  /* A find's line: gold as the plate, finer, without a glow. */
  .lead path {
    stroke: color-mix(in srgb, var(--gold) 88%, transparent);
  }
  .main {
    stroke-width: 0.8;
  }
  .thin {
    stroke-width: 0.55;
  }
  .hair {
    stroke-width: 0.42;
  }
  .lead .hair {
    stroke-width: 0.6;
  }
  /* The masks' own svg takes no room. */
  .defs {
    width: 0;
    height: 0;
  }

  /* The glow: the same lines, wide and faint, under them, breathing; a soft light in each reached seal and in Sol. */
  .glow {
    opacity: 0.28;
    filter: blur(0.5px);
    animation:
      glow-in 1.2s 0.9s ease-out both,
      breathe 6s 2.1s ease-in-out infinite alternate;
  }
  .glow path {
    stroke-width: 2.2;
  }
  .glow .thin,
  .glow .hair {
    stroke-width: 1.2;
  }
  .light {
    stroke: none;
    fill: color-mix(in srgb, var(--c, var(--gold)) 70%, transparent);
    filter: blur(2.5px);
    opacity: 0.55;
  }
  .light.sun {
    fill: var(--gold);
    opacity: 0.4;
  }

  /* Shading: in a reached zone's colour, dull below, gold on the ground; faded on the endless stretch. */
  .shade {
    stroke-width: 0.36;
    stroke-linecap: round;
    stroke: var(--dull);
    opacity: calc(0.75 * var(--o, 1));
  }
  .shade.zone {
    stroke: color-mix(in srgb, var(--c) 45%, #b08a4c);
    opacity: 0.85;
  }
  .shade.gold {
    stroke: var(--gold);
    opacity: calc(0.7 * var(--o, 1));
  }

  /* Signs, drawn at a scale, keep a fine line. */
  .sign,
  .sign *,
  .sigil path {
    stroke-width: 0.55px;
    vector-effect: non-scaling-stroke;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .sol * {
    stroke: var(--gold-hi);
  }
  .sol .point {
    fill: var(--gold-hi);
  }
  .sigil path {
    stroke: color-mix(in srgb, var(--c) 60%, #f0e0b8);
    stroke-width: 0.6px;
    animation: carve 0.5s calc(var(--d) + 0.3s) var(--ease-out) both;
  }
  .sigil .s-fine {
    stroke-width: 0.42px;
  }
  .sigil .s-shade {
    stroke: color-mix(in srgb, var(--c) 50%, #b08a4c);
    stroke-width: 0.32px;
  }
  .hollow {
    stroke: var(--dull);
    stroke-width: 0.32;
    stroke-linecap: round;
  }
  /* The ouroboros: a dull impression until you are past 100, then struck in pale gold. It turns slowly, head first, once in 75 s. */
  .serpent path,
  .serpent circle {
    stroke: color-mix(in srgb, var(--dull) 70%, #a89070);
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .serpent.lit path,
  .serpent.lit circle {
    stroke: var(--gold-hi);
  }
  .sp-body,
  .sp-head {
    stroke-width: 0.75;
  }
  .sp-detail {
    stroke-width: 0.4;
  }
  .sp-scales,
  .sp-belly {
    stroke-width: 0.3;
  }
  .sp-shade {
    stroke-width: 0.26;
    opacity: 0.85;
  }
  .serpent .sp-eye {
    stroke-width: 0.42;
  }
  .serpent .sp-pupil {
    stroke-width: 0.6;
  }
  .coil {
    animation: coil 75s linear infinite;
  }
  @keyframes coil {
    to {
      rotate: -360deg;
    }
  }

  text {
    dominant-baseline: central;
  }
  /* A reached zone's name, in the display face's spaced capitals, in a pale wash of its colour. */
  .name {
    font-family: var(--font-display);
    font-size: 11px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    text-anchor: end;
    fill: color-mix(in srgb, var(--c) 55%, #e3d3b4);
    animation: carve 0.5s var(--d) var(--ease-out) both;
  }

  /* "Uncharted": a quiet word in the margin; the bracket a hairline. */
  .uncharted {
    opacity: 0.85;
    animation: carve 0.6s var(--d) var(--ease-out) both;
  }
  .uncharted path {
    stroke: var(--muted);
    stroke-width: 0.4;
  }
  .word {
    font-style: italic;
    font-size: 12.5px;
    letter-spacing: 0.02em;
    text-anchor: middle;
    fill: var(--muted);
  }

  /* The legend: each star small, and what it marks in plain words. */
  .legend {
    animation: carve 0.6s var(--d) var(--ease-out) both;
  }
  .legend text {
    font-family: var(--font-body);
    font-size: 12px;
    fill: var(--muted);
  }
  .key-star {
    stroke-width: 0.6;
    stroke: var(--gold-hi);
  }
  .key.last .key-star {
    stroke: var(--red-hi);
  }

  /* A find's station: a small ring on the wall in its colour, where its line starts; the depth it first turns up at on the line. */
  .station {
    stroke: var(--gold);
    stroke-width: 0.6;
    animation: carve 0.4s var(--d) var(--ease-out) both;
  }
  .mark {
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 11px;
    text-anchor: middle;
    fill: color-mix(in srgb, var(--c) 85%, #fff);
    animation: carve 0.4s var(--d) var(--ease-out) both;
  }

  /* A star's depth, in Cinzel's figures; it appears as the gold star lands. */
  .depth {
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 13px;
    fill: var(--gold-hi);
    animation: carve 0.45s var(--d) var(--ease-out) both;
  }
  .depth.red-num {
    fill: var(--red-num);
  }

  /* The stars' layer is composited on its own, so what turns on it never repaints the plate under it. */
  .live {
    will-change: transform;
  }
  /* The gold star comes down the lane from the mouth once the plate has inked itself in, slowing as it lands (past 100 it turns
     into the ouroboros at the foot of the pit); its cutout comes with it. */
  .travel {
    animation: travel var(--t) var(--go) cubic-bezier(0.5, 0, 0.2, 1) both;
  }
  .travel.into {
    animation-name: travel-into;
    animation-timing-function: cubic-bezier(0.45, 0, 0.3, 1);
  }
  @keyframes travel {
    from {
      transform: translate(var(--fx), var(--fy));
    }
  }
  @keyframes travel-into {
    from {
      transform: translate(var(--fx), var(--fy));
    }
    72% {
      transform: translate(var(--mx), var(--my));
    }
  }
  .cutout {
    fill: #000;
    stroke: none;
    animation: carve 0.5s var(--d) var(--ease-out) both;
  }
  .cutout.travel {
    animation:
      carve 0.5s var(--d) var(--ease-out) both,
      travel var(--t) var(--go) cubic-bezier(0.5, 0, 0.2, 1) both;
  }
  .cutout.travel.into {
    animation:
      carve 0.5s var(--d) var(--ease-out) both,
      travel-into var(--t) var(--go) cubic-bezier(0.45, 0, 0.3, 1) both;
  }

  /* The star: the brightest thing on the plate, its halo breathing. */
  .halo {
    stroke: none;
    fill: var(--gold-hi);
    opacity: 0.2;
    filter: blur(3px);
    animation:
      carve 0.6s var(--d) var(--ease-out) both,
      breathe-halo 6s calc(var(--d) + 0.6s) ease-in-out infinite alternate;
  }
  .glory {
    stroke: var(--gold-hi);
    stroke-width: 0.42;
  }
  /* The glory turns about the star, once in two minutes. */
  .turn {
    animation: turn 120s calc(var(--d) + 0.6s) linear infinite;
  }
  @keyframes turn {
    to {
      rotate: 360deg;
    }
  }
  .twinkle {
    fill: #fff3d6;
    stroke: none;
    opacity: 0;
    transform-box: fill-box;
    transform-origin: center;
    animation: twinkle 5.5s var(--d) ease-in-out infinite;
  }
  @keyframes twinkle {
    0%,
    80%,
    100% {
      opacity: 0;
      transform: scale(0.3) rotate(45deg);
    }
    88% {
      opacity: 0.85;
      transform: scale(1) rotate(45deg);
    }
  }
  .star-ground {
    fill: var(--bg);
    stroke: none;
  }
  .star-line {
    stroke: var(--gold-hi);
    stroke-width: 0.6;
  }
  .star-ridge {
    stroke: var(--gold-hi);
    stroke-width: 0.4;
  }
  .star-hatch {
    stroke: var(--gold-hi);
    stroke-width: 0.3;
    stroke-linecap: round;
  }
  /* The last run's star: the same star in red, quieter (a dimmer halo and glory, no glint). */
  .red-star :is(.star-line, .star-ridge, .star-hatch) {
    stroke: var(--red-hi);
  }
  .red-star .glory {
    stroke: var(--red);
  }
  .red-star .halo {
    fill: var(--red);
  }

  /* Lines draw themselves (each piece in its turn: see lib/descentPlate's pen()); seals and the star are stamped in. */
  .draw {
    stroke-dasharray: 100;
    animation: draw var(--t, 1s) var(--d, 0s) linear both;
  }
  .shade.draw {
    animation-timing-function: ease-out;
  }
  .stamp {
    transform-box: fill-box;
    transform-origin: center;
    animation: stamp 0.5s var(--d) var(--ease-out) both;
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
  @keyframes glow-in {
    from {
      opacity: 0;
    }
    55% {
      opacity: 0.45;
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
  @keyframes breathe-halo {
    from {
      opacity: 0.22;
    }
    to {
      opacity: 0.08;
    }
  }
  /* Stacked: the finds' callouts on the plate's right, one over another, each its item over its name; dim until you meet it. */
  .callouts {
    position: absolute;
    top: 0;
    right: 0;
    display: grid;
    justify-items: start;
  }
  .callout {
    grid-area: 1 / 1;
    align-self: start;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    animation: carve 0.5s var(--d) var(--ease-out) both;
  }
  .c-glyph {
    --h: 22px;
    display: block;
  }
  .c-name {
    font-family: var(--font-display);
    font-size: 0.7rem;
    line-height: 1.2;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--c);
  }
  /* A name in two lines: a narrow column, so the pit and the lines have the width. */
  .c-name {
    width: min-content;
  }
  .callout:not(.met) {
    opacity: 0.5;
  }
  .callout:not(.met) .c-name {
    color: color-mix(in srgb, var(--c) 35%, var(--muted));
  }
  .callout:not(.met) .c-glyph {
    filter: saturate(0.3);
  }

  /* Still: nothing loops, and the star is simply where it stands. */
  :global(html[data-still]) .descent .travel {
    animation: none;
  }
  :global(html[data-still]) .descent .cutout {
    animation: none;
  }
  :global(html[data-still]) .descent .twinkle {
    animation: none;
    opacity: 0;
  }
  :global(html[data-still]) .descent :is(.turn, .halo, .glow, .coil) {
    animation: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .travel,
    .cutout {
      animation: none;
    }
    .coil {
      animation: none;
    }
    .twinkle {
      animation: none;
      opacity: 0;
    }
    .turn {
      animation: none;
    }
  }
</style>
