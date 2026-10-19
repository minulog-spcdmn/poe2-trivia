<script module lang="ts">
  // The map (phase 'map'): every node as the owner placed it, the paths
  // between them, each node's kind this run (its zone type, or Camp, Town,
  // Well, Boss) and whether it's corrupted (the hidden modifier shows only on
  // arriving), the fronts' heads, the route taken and where the player
  // stands. The nodes the player can go to stand out and can be tapped; under
  // the map the same choices are cards, the main way to pick on a phone. A
  // plain dark panel for now (no map art yet), scrolling down inside its
  // frame, never sideways.
  //
  // The layout, for a given width: every node where the owner placed it,
  // mapped to the nodes' bounding box (not to 0..1) and stretched down more
  // than across, then spread where it crowds, and its name placed where it
  // covers no other.
  import { GRAPH } from './map';

  /** Half a node's tap target (44 px across). */
  export const R = 22;
  /** The drawn dot's radius. */
  export const DOT = 8;
  const PAD_X = 30;
  const PAD_TOP = 26;
  const PAD_BOTTOM = 14;
  /** Down is stretched this much more than across. */
  const STRETCH = 1.5;
  /** How far each x is drawn toward its rank across (0 keeps it as placed). */
  const SPREAD = 0.5;
  export const NAME_PX = 12.5;
  export const NAME_LH = 14;
  export const KIND_PX = 8.5;
  export const KIND_LH = 11;
  const LABEL_MAX = 100;
  const GAP = 3;

  export interface Box {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  }
  export interface Label extends Box {
    lines: string[];
    /** No spot was free: the least crowded one. */
    fallback?: boolean;
  }
  export interface Layout {
    width: number;
    height: number;
    at: Record<string, { x: number; y: number }>;
    label: Record<string, Label>;
  }

  /** A guess at a line's width: EB Garamond's (or Cinzel's capitals') letters, by how wide each kind runs. */
  function textWidth(s: string, px: number, caps = false): number {
    let em = 0;
    for (const c of s) {
      if (caps) em += c === ' ' ? 0.3 : /[MW]/i.test(c) ? 0.95 : /[IJ]/i.test(c) ? 0.42 : 0.74;
      else em += /[ .,'’]/.test(c) ? 0.26 : /[ijlrtf]/.test(c) ? 0.3 : /[mwMW]/.test(c) ? 0.8 : /[A-Z]/.test(c) ? 0.66 : 0.48;
    }
    return em * px + (caps ? s.length * 0.14 * px : 0);
  }

  /** A name in at most two lines of LABEL_MAX, broken at spaces. */
  function wrap(name: string): string[] {
    const words = name.split(' ');
    const lines: string[] = [];
    for (const w of words) {
      const last = lines.at(-1);
      if (last !== undefined && (lines.length === 2 || textWidth(`${last} ${w}`, NAME_PX) <= LABEL_MAX)) lines[lines.length - 1] = `${last} ${w}`;
      else lines.push(w);
    }
    return lines;
  }

  const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

  /**
   * Lays the map out `width` px wide, each node's kind (`kinds`, a word) on
   * the second line of its label.
   *
   * Down the map, nodes go in order of their y. Each keeps its x; its y is
   * where the stretch puts it, moved down as far as it takes to clear the
   * nodes above (a tap target apart, and below the name of one it sits
   * under), and everything after it moves down as much: so the map keeps its
   * shape and only gains room where it crowds.
   *
   * Names go under their node where they fit; else slid sideways, a line
   * lower, above the node or beside it. Where none of those is free, the
   * lower of the two that clash moves down a little (with all below it) and
   * the names are placed again.
   */
  export function layout(width: number, kinds: Record<string, string> = {}): Layout {
    const nodes = GRAPH.nodes;
    const minX = Math.min(...nodes.map((n) => n.x));
    const maxX = Math.max(...nodes.map((n) => n.x));
    const minY = Math.min(...nodes.map((n) => n.y));
    const sx = (width - 2 * PAD_X) / Math.max(1e-6, maxX - minX);
    const sy = sx * STRETCH;
    // Across, the few nodes out at the sides would leave the rest bunched in
    // the middle: each x is drawn partway to its rank among the xs, which
    // keeps left left of right but spreads the bunch.
    const xs = [...new Set(nodes.map((n) => n.x))].sort((a, b) => a - b);
    const across = (x: number) => {
      const rank = xs.length > 1 ? xs.indexOf(x) / (xs.length - 1) : 0.5;
      return PAD_X + ((1 - SPREAD) * (x - minX) / Math.max(1e-6, maxX - minX) + SPREAD * rank) * (width - 2 * PAD_X);
    };

    const size: Record<string, { w: number; h: number; lines: string[] }> = {};
    for (const n of nodes) {
      const lines = wrap(n.name);
      const kind = kinds[n.id] ?? '';
      const w = Math.max(...lines.map((l) => textWidth(l, NAME_PX)), kind ? textWidth(kind.toUpperCase(), KIND_PX, true) : 0) + 4;
      size[n.id] = { w, h: lines.length * NAME_LH + (kind ? KIND_LH : 0), lines };
    }

    const order = [...nodes].sort((a, b) => a.y - b.y || a.step - b.step);
    const rank = new Map(order.map((n, k) => [n.id, k]));
    // Room let in above a node (and so everything below it) where its name, or one it covered, found no free spot.
    const room: Record<string, number> = {};
    let at: Layout['at'] = {};
    let label: Layout['label'] = {};
    for (let pass = 0; pass < 8; pass++) {
      at = {};
      const placed: { id: string; x: number; y: number }[] = [];
      let carry = 0;
      for (const n of order) {
        const x = across(n.x);
        const lin = PAD_TOP + (n.y - minY) * sy;
        let y = lin + carry + (room[n.id] ?? 0);
        for (const p of placed) {
          const dx = Math.abs(x - p.x);
          if (dx < 2 * R) y = Math.max(y, p.y + Math.sqrt(4 * R * R - dx * dx));
          if (dx < size[p.id].w / 2 + DOT) y = Math.max(y, p.y + DOT + GAP + size[p.id].h + GAP + DOT);
        }
        carry = y - lin;
        at[n.id] = { x, y };
        placed.push({ id: n.id, x, y });
      }

      const dots = order.map((n) => ({ id: n.id, box: { x0: at[n.id].x - DOT - 2, y0: at[n.id].y - DOT - 2, x1: at[n.id].x + DOT + 2, y1: at[n.id].y + DOT + 2 } }));
      label = {};
      const taken: { id: string; box: Box }[] = [];
      const clashes: [string, string][] = [];
      for (const { id, x, y } of placed) {
        const { w, h, lines } = size[id];
        const box = (cx: number, top: number): Box => {
          const x0 = Math.min(width - 2 - w, Math.max(2, cx - w / 2));
          return { x0, y0: top, x1: x0 + w, y1: top + h };
        };
        const below = y + DOT + GAP;
        const tries: Box[] = [
          box(x, below),
          box(x - w / 3, below),
          box(x + w / 3, below),
          box(x, below + NAME_LH * 0.6),
          box(x, below + NAME_LH * 1.2),
          box(x, y - DOT - GAP - h),
          box(x + DOT + GAP + w / 2, y - h / 2),
          box(x - DOT - GAP - w / 2, y - h / 2),
        ];
        const others = [...taken, ...dots.filter((d) => d.id !== id)];
        const cost = (b: Box) => others.reduce((t, o) => t + overlap(b, o.box), 0);
        let best = tries[0];
        let bestCost = Infinity;
        for (const b of tries) {
          const c = cost(b);
          if (c < bestCost) [best, bestCost] = [b, c];
          if (c === 0) break;
        }
        label[id] = { ...best, lines, fallback: bestCost > 0 };
        for (const o of others) if (overlap(best, o.box) > 0) clashes.push([id, o.id]);
        taken.push({ id, box: best });
      }
      if (!clashes.length) break;
      // The later of each clashing pair moves down, with all after it.
      for (const [a, b] of clashes) {
        const later = rank.get(a)! > rank.get(b)! ? a : b;
        room[later] = (room[later] ?? 0) + NAME_LH / 2;
      }
    }

    const bottom = Math.max(...Object.values(at).map((p) => p.y + R), ...Object.values(label).map((l) => l.y1));
    return { width, height: bottom + PAD_BOTTOM, at, label };
  }
</script>

<script lang="ts">
  import { backdropShadow } from '../lib/backdropShadow';
  import type { Run } from './rules';
  import { placeDoes, placeName, plural, zoneLines } from './words';

  let { run }: { run: Run } = $props();
  const s = $derived(run.state);
  const here = $derived(GRAPH.byId.get(s.at)!);
  const options = $derived(run.options());
  const offered = $derived(new Set(options));
  const kinds = $derived(Object.fromEntries(GRAPH.nodes.map((n) => [n.id, placeName(s.places[n.id])])));
  const route = $derived(new Set(s.log.route));
  /** The route's legs, as "from>to". */
  const legs = $derived(new Set(s.log.route.slice(1).map((id, k) => `${s.log.route[k]}>${id}`)));
  const heads = $derived(new Set(s.fronts.filter((f) => f.alive).map((f) => f.at)));
  const live = $derived(s.fronts.filter((f) => f.alive).length);
  const multiplier = $derived(s.tuning.corruption.multiplier);
  const corrupted = (id: string) => !!s.corrupt[id] && !s.corrupt[id].cleansed;
  const cleansed = (id: string) => !!s.corrupt[id]?.cleansed;
  /** Out of reach for good: on a step the player has passed (or beside them), and not on their route. */
  const gone = (id: string) => GRAPH.byId.get(id)!.step <= here.step && !route.has(id);

  let width = $state(0);
  let frame: HTMLDivElement | undefined = $state();
  const L = $derived(width > 0 ? layout(width, kinds) : null);

  // On arriving, the frame scrolls to where the player stands and the nodes ahead.
  let shown = false;
  $effect(() => {
    if (!L || !frame || shown) return;
    shown = true;
    const ys = [s.at, ...options].map((id) => L.at[id].y);
    frame.scrollTop = (Math.min(...ys) + Math.max(...ys)) / 2 - frame.clientHeight / 2;
  });

  const go = (id: string) => run.choose(id);
</script>

<div class="map-screen">
  <header class="screen-title">
    <p class="kicker">{here.step === 0 ? 'The camp' : 'Step '}{#if here.step}<span class="n">{here.step}</span> of <span class="n">{GRAPH.boss.step - 1}</span>{/if}</p>
    <h1>{here.name}</h1>
    <p class="sub">Pick the road ahead.</p>
  </header>

  <div class="body">
    <section class="panel mapbox" aria-label="The map" use:backdropShadow={{ fill: 'linear' }}>
      <div class="frame" bind:this={frame} bind:clientWidth={width}>
        {#if L}
          <div class="canvas" style:height="{L.height}px">
            <svg width={L.width} height={L.height} viewBox="0 0 {L.width} {L.height}" aria-hidden="true">
              {#each GRAPH.nodes as a (a.id)}
                {#each GRAPH.next[a.id] as b (b)}
                  {@const leg = legs.has(`${a.id}>${b}`)}
                  <line
                    class="path"
                    class:taken={leg}
                    class:open={a.id === s.at && offered.has(b)}
                    class:gone={!leg && (gone(a.id) || gone(b))}
                    x1={L.at[a.id].x}
                    y1={L.at[a.id].y}
                    x2={L.at[b].x}
                    y2={L.at[b].y}
                  />
                {/each}
              {/each}
              {#each GRAPH.nodes as n (n.id)}
                {@const p = L.at[n.id]}
                {@const k = s.places[n.id].kind}
                <g
                  class="node {k}"
                  class:visited={route.has(n.id)}
                  class:gone={gone(n.id)}
                  class:corrupt={corrupted(n.id)}
                  class:cleansed={cleansed(n.id)}
                  transform="translate({p.x} {p.y})"
                >
                  {#if heads.has(n.id)}<circle class="front" r="13" />{/if}
                  {#if offered.has(n.id)}<circle class="ring" r="12" />{/if}
                  {#if k === 'town' || k === 'camp'}
                    <rect class="dot" x="-6" y="-6" width="12" height="12" rx="1.5" />
                  {:else if k === 'boss'}
                    <circle class="dot" r="8" /><circle class="inner" r="4" />
                  {:else if k === 'well'}
                    <circle class="dot" r="6" /><circle class="pip" r="2" />
                  {:else}
                    <circle class="dot" r="6" />
                  {/if}
                  {#if n.id === s.at}<path class="you" d="M0 -7 7 0 0 7 -7 0Z" />{/if}
                </g>
              {/each}
              {#each GRAPH.nodes as n (n.id)}
                {@const l = L.label[n.id]}
                {@const cx = (l.x0 + l.x1) / 2}
                <text class="tag" class:lit={offered.has(n.id) || n.id === s.at} class:gone={gone(n.id)} x={cx}>
                  {#each l.lines as line, k (k)}<tspan class="tag-name" x={cx} y={l.y0 + (k + 1) * NAME_LH - 3}>{line}</tspan>{/each}<tspan
                    class="tag-kind {s.places[n.id].kind}"
                    class:corrupt={corrupted(n.id)}
                    class:cleansed={cleansed(n.id)}
                    x={cx}
                    y={l.y0 + l.lines.length * NAME_LH + KIND_LH - 2}>{kinds[n.id]}</tspan
                  >
                </text>
              {/each}
            </svg>
            <!-- Tap targets for the nodes ahead. Screen readers (and tests) get the cards under the map instead. -->
            {#each options as id (id)}
              <button class="hit" style:left="{L.at[id].x - R}px" style:top="{L.at[id].y - R}px" tabindex="-1" aria-hidden="true" onclick={() => go(id)}
              ></button>
            {/each}
          </div>
        {/if}
      </div>
      <ul class="key" aria-hidden="true">
        <li><svg viewBox="-8 -8 16 16"><path class="you" d="M0 -6 6 0 0 6 -6 0Z" /></svg>You</li>
        <li><svg viewBox="-8 -8 16 16"><circle class="key-corrupt" r="5" /></svg>Corrupted</li>
        <li><svg viewBox="-14 -14 28 28"><circle class="front" r="11" /><circle class="key-corrupt" r="5" /></svg>A front</li>
        <li><svg viewBox="-8 -8 16 16"><circle class="key-cleansed" r="5" /></svg>Cleansed</li>
      </ul>
    </section>

    <section class="ahead" aria-labelledby="ahead-h">
      <h2 id="ahead-h">Where next</h2>
      <ul class="choices">
        {#each options as id (id)}
          {@const n = GRAPH.byId.get(id)!}
          {@const p = s.places[id]}
          {@const bad = corrupted(id)}
          <li>
            <button class="choice" class:corrupt={bad} onclick={() => go(id)}>
              <span class="head">
                <span class="name">{n.name}</span>
                <span class="kind">{p.kind === 'zone' ? `${placeName(p)} zone` : placeName(p)}{#if bad}<span class="bad">{' • Corrupted'}</span>{/if}</span>
              </span>
              {#if p.kind === 'zone'}
                {@const z = zoneLines(run, p.type)}
                <span class="row"><span class="k">Free clue</span><span>{z.free}</span></span>
                <span class="row"><span class="k">Rule</span><span>{z.rule}</span></span>
                {#if bad}
                  <span class="note">A hidden modifier waits here; {multiplier === 2 ? 'twice' : `${multiplier} times`} the loot.</span>
                {/if}
              {:else}
                <span class="does">{placeDoes(run, p)}</span>
                {#if p.kind === 'boss'}
                  <span class="note">
                    {live ? `Each front still alive adds a modifier: ${plural(live, 'front')} now.` : 'No front is alive: no modifiers.'}
                  </span>
                {/if}
              {/if}
            </button>
          </li>
        {/each}
      </ul>
    </section>
  </div>
</div>

<style>
  .map-screen {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .body {
    display: grid;
    gap: 1rem;
  }
  @media (min-width: 860px) {
    .body {
      grid-template-columns: minmax(0, 32rem) minmax(0, 1fr);
      align-items: start;
    }
  }

  /* ---- The map ---- */
  :global(.wr) .mapbox {
    padding: 0;
  }
  .frame {
    /* Phones: room under it for the choices. Scrolls down inside, never across. */
    max-height: clamp(18rem, 56svh, 40rem);
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
    scrollbar-width: thin;
    scrollbar-color: var(--gold-lo) transparent;
    border-bottom: 1px solid var(--line);
    border-radius: var(--radius) var(--radius) 0 0;
  }
  @media (min-width: 860px) {
    .frame {
      max-height: max(22rem, calc(100svh - 16rem));
    }
  }
  .canvas {
    position: relative;
  }
  .canvas > svg {
    display: block;
  }
  .path {
    stroke: rgba(125, 99, 51, 0.6);
    stroke-width: 1.2;
  }
  .path.gone {
    stroke: rgba(125, 99, 51, 0.22);
  }
  .path.taken {
    stroke: var(--gold);
    stroke-width: 2.2;
  }
  .path.open {
    stroke: var(--gold-hi);
    stroke-width: 1.6;
    stroke-dasharray: 4 3;
  }
  .node .dot {
    fill: #241b13;
    stroke: var(--gold-lo);
    stroke-width: 1.4;
  }
  .node.town .dot,
  .node.camp .dot {
    stroke: var(--gold);
  }
  .node.boss .dot,
  .node .inner {
    stroke: #c8604a;
  }
  .node .inner {
    fill: none;
    stroke-width: 1;
  }
  .node .pip {
    fill: #9cc4c8;
  }
  .node.visited .dot {
    fill: var(--gold);
    stroke: var(--gold-hi);
  }
  .node.gone {
    opacity: 0.4;
  }
  .node.corrupt .dot,
  .key-corrupt {
    fill: #a3221b;
    stroke: #ff8a70;
    stroke-width: 1.2;
  }
  /* A small glow, so a corrupted node reads at a glance. */
  .node.corrupt .dot {
    filter: drop-shadow(0 0 3px rgba(226, 52, 43, 0.9));
  }
  .node.cleansed .dot,
  .key-cleansed {
    fill: #2c2a22;
    stroke: var(--verdict-good-icon);
    stroke-width: 1.4;
    stroke-dasharray: 2.5 1.5;
  }
  .front {
    fill: none;
    stroke: #e2342b;
    stroke-width: 1.3;
    stroke-dasharray: 3 2.5;
  }
  .ring {
    fill: none;
    stroke: var(--gold-hi);
    stroke-width: 1.5;
  }
  .you {
    fill: var(--gold-hi);
    stroke: #3a2a12;
    stroke-width: 1;
    filter: drop-shadow(0 0 3px rgba(241, 217, 155, 0.7));
  }
  .tag {
    font-family: var(--font-body);
    text-anchor: middle;
    paint-order: stroke;
    stroke: #0e0b08;
    stroke-width: 3px;
    stroke-linejoin: round;
  }
  .tag-name {
    font-size: 12.5px;
    fill: #cbbfa9;
  }
  .tag.lit .tag-name {
    fill: var(--gold-hi);
  }
  .tag.gone {
    opacity: 0.45;
  }
  .tag-kind {
    font-family: var(--font-cinzel);
    font-size: 8.5px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    fill: var(--muted);
  }
  .tag-kind.town,
  .tag-kind.camp {
    fill: var(--gold);
  }
  .tag-kind.boss {
    fill: #ff9c86;
  }
  .tag-kind.corrupt {
    fill: #f2846e;
  }
  .tag-kind.cleansed {
    fill: var(--verdict-good-icon);
  }
  .hit {
    position: absolute;
    width: 44px;
    height: 44px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: none;
    cursor: pointer;
  }
  .hit:hover {
    background: rgba(241, 217, 155, 0.12);
    box-shadow: 0 0 0 1px rgba(241, 217, 155, 0.45);
  }
  .key {
    margin: 0;
    padding: 0.5rem 0.9rem 0.6rem;
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.3rem 1rem;
    font-size: 0.85rem;
    color: var(--muted);
  }
  .key li {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }
  .key svg {
    width: 14px;
    height: 14px;
    overflow: visible;
  }

  /* ---- Where next ---- */
  .ahead {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .ahead h2 {
    margin: 0;
    text-align: center;
  }
  .choices {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .choice {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    width: 100%;
    min-height: 44px;
    padding: 0.75rem 1rem 0.8rem;
    font: inherit;
    text-align: left;
    color: var(--text);
    border: 1px solid var(--gold-lo);
    border-radius: var(--radius);
    background: linear-gradient(170deg, #211912, #0d0a07 80%);
    box-shadow:
      inset 0 0 0 3px rgba(0, 0, 0, 0.45),
      inset 0 0 0 4px rgba(125, 99, 51, 0.3);
    cursor: pointer;
    transition:
      border-color 0.2s,
      transform 0.2s var(--ease-out);
  }
  .choice:hover {
    border-color: var(--gold);
    transform: translateY(-1px);
  }
  .choice:focus-visible {
    outline: 2px solid var(--gold);
    outline-offset: 2px;
  }
  .choice.corrupt {
    border-color: #7a2a1e;
  }
  .choice.corrupt:hover {
    border-color: #c8604a;
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.1rem 0.8rem;
  }
  .head .name {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 1.05rem;
    letter-spacing: 0.03em;
    color: var(--gold-hi);
  }
  .head .kind {
    font-family: var(--font-cinzel);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .bad {
    color: #f2846e;
  }
  .row {
    display: grid;
    grid-template-columns: 5.5rem minmax(0, 1fr);
    gap: 0.6rem;
    align-items: baseline;
    color: #e9c8a2;
    line-height: 1.3;
  }
  .row .k {
    font-family: var(--font-display);
    font-size: 0.68rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .does {
    color: #e9c8a2;
    line-height: 1.3;
  }
  .note {
    font-style: italic;
    color: var(--muted);
    line-height: 1.3;
  }
  .choice.corrupt .note {
    color: #f2a08e;
  }
</style>
