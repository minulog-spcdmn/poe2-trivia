<script module lang="ts">
  // The map and Where next (past a Well, or opened from a vendor or a zone's
  // last reveal). The map is a plain dark plate: every step a row, its places
  // spread across it (as the owner placed them, drawn toward even slots so
  // four fit on a phone), the paths between them, each place's kind this run
  // and, on a corrupted zone, Blood toll and the boss rule that corruption
  // carries. The route taken is dimmed, where the player stands is ringed,
  // and the places one step ahead are lit and can be tapped. Under it on a
  // phone (beside it on a desktop), Where next: the same places as rows, the
  // main way to pick. A Well's line sits between them; as the corruption
  // moves on, the map shows it happen once, then settles.
  import { GRAPH } from './map';
  import type { Run } from './rules';

  /** The plate's sizes: a phone's, and a desktop's (860 px wide and up). */
  export const PHONE = { node: 24, nameTop: 14, labelMax: 92, rowMin: 84, rowMax: 96, padTop: 40, padBottom: 18, gutter: 22, edge: 4, namePx: 11.5, emPx: 10 };
  export const WIDE = { node: 28, nameTop: 16, labelMax: 130, rowMin: 53, rowMax: 80, padTop: 30, padBottom: 18, gutter: 28, edge: 8, namePx: 13, emPx: 11.5 };
  export type Sizes = typeof PHONE;
  /** How far each place is drawn toward where the owner placed it across, from its even slot in its row (0: the slot). */
  const BLEND = 0.35;

  export interface Layout {
    width: number;
    height: number;
    /** Each place's centre. */
    at: Record<string, { x: number; y: number }>;
    /** Each place's label width at most. */
    labelW: Record<string, number>;
    /** Each step's row. */
    rows: { step: number; y: number }[];
  }

  /** A guess at a label's height before it's measured: two lines of name, and its kind. */
  const guess = (z: Sizes) => 2 * z.namePx * 1.12 + z.emPx * 1.12 + 3;

  /**
   * Lays the plate out `width` px wide, in a frame `frameH` tall (0: not
   * known yet), each label `heights` tall where measured. Rows go down by
   * step, far enough apart that a row's labels clear the row below, and
   * spread to fill the frame where it's taller (up to rowMax). Across, a
   * row's places sit between their even slot and where the owner placed
   * them, at least a label apart, clear of the step numbers.
   */
  export function layout(width: number, frameH: number, z: Sizes, heights: Record<string, number>, under = 0): Layout {
    const nodes = GRAPH.nodes;
    const minX = Math.min(...nodes.map((n) => n.x));
    const maxX = Math.max(...nodes.map((n) => n.x));
    const norm = (x: number) => (x - minX) / Math.max(1e-6, maxX - minX);
    const L = z.gutter;
    const R = width - z.edge;
    const at: Layout['at'] = {};
    const labelW: Layout['labelW'] = {};

    for (const step of GRAPH.steps) {
      const row = [...GRAPH.atStep.get(step)!].sort((a, b) => a.x - b.x);
      const n = row.length;
      const g = Math.min(z.labelMax + 4, (R - L) / n);
      const p = row.map((m, i) => L + ((1 - BLEND) * ((i + 0.5) / n) + BLEND * norm(m.x)) * (R - L));
      for (let i = 0; i < n; i++) p[i] = Math.max(p[i], i ? p[i - 1] + g : L + g / 2);
      for (let i = n - 1; i >= 0; i--) p[i] = Math.min(p[i], i < n - 1 ? p[i + 1] - g : R - g / 2);
      row.forEach((m, i) => {
        at[m.id] = { x: p[i], y: 0 };
        labelW[m.id] = g - 4;
      });
    }

    const h = (id: string) => heights[id] ?? guess(z);
    const tallest = (step: number) => Math.max(...GRAPH.atStep.get(step)!.map((m) => h(m.id)));
    const steps = GRAPH.steps;
    const last = steps.at(-1)!;
    const fill = frameH > 0 && steps.length > 1 ? (frameH - under - z.padTop - z.padBottom - z.nameTop - tallest(last)) / (steps.length - 1) : 0;
    const base = Math.min(z.rowMax, Math.max(z.rowMin, fill));
    const rows: Layout['rows'] = [];
    let y = z.padTop;
    steps.forEach((step, k) => {
      if (k) y += Math.max(base, z.nameTop + tallest(steps[k - 1]) + 6 + z.node / 2);
      rows.push({ step, y });
      for (const m of GRAPH.atStep.get(step)!) at[m.id].y = y;
    });
    return { width, height: y + z.nameTop + tallest(last) + z.padBottom + under, at, labelW, rows };
  }

  /** The creep each run last showed (the step count the corruption last moved at), so it plays once. */
  const creepShown = new WeakMap<Run, number>();
  /** How long the creep plays before the beat goes on by itself. */
  const CREEP_MS = 3200;
</script>

<script lang="ts">
  import { fade } from 'svelte/transition';
  import { MediaQuery } from 'svelte/reactivity';
  import type { BossMod, Place } from './rules';
  import type { Front } from './map';
  import { BOSS_MOD_NAMES } from './rules';
  import Glyph from './Glyph.svelte';
  import { bloodLine, bossAdds, bossIfReached, bossLine, bossOnNode, bossRuleLines, placeDoes, placeKind, placeName, zoneLines } from './words';

  /** `onclose`: opened over a vendor or a reveal, it closes to go back there. */
  let { run, onclose }: { run: Run; onclose?: () => void } = $props();
  const s = $derived(run.state);
  const here = $derived(GRAPH.byId.get(s.at)!);
  const options = $derived(run.options());
  const offered = $derived(new Set(options));
  const route = $derived(new Set(s.log.route));
  /** The route's legs, as "from>to". */
  const legs = $derived(new Set(s.log.route.slice(1).map((id, k) => `${s.log.route[k]}>${id}`)));
  const live = $derived(s.fronts.filter((f) => f.alive));
  const frontAt = (id: string): Front | undefined => (run.corrupted(id) ? live.find((f) => f.at === id) : undefined);
  const creepIn = $derived(run.creepIn());
  const nextStep = $derived(options.length ? GRAPH.byId.get(options[0])!.step : here.step);
  const well = $derived(s.beat?.kind === 'well' && s.beat.node === s.at ? s.beat : null);
  const name = (id: string) => GRAPH.byId.get(id)!.name;

  const wideQ = new MediaQuery('(min-width: 860px)');
  const wide = $derived(wideQ.current);
  const Z = $derived(wide ? WIDE : PHONE);

  // ---- The corruption moving on: once per creep, then the map settles. ----
  const moves = $derived(s.moves.filter((m) => m.from !== m.to));
  const fromIds = $derived(new Set(moves.map((m) => m.from)));
  const toIds = $derived(new Set(moves.map((m) => m.to)));
  const movedSaid = $derived(moves.length ? `Corruption moved ${moves.map((m) => `from ${name(m.from)} to ${name(m.to)}`).join(', and ')}` : '');
  let creeping = $state(false);
  $effect(() => {
    if (!moves.length || creepShown.get(run) === s.crept) return;
    creepShown.set(run, s.crept);
    creeping = true;
  });
  $effect(() => {
    if (!creeping) return;
    const t = setTimeout(() => (creeping = false), CREEP_MS);
    return () => clearTimeout(t);
  });
  /** A node the corruption is leaving (as it plays): shown corrupted, fading. */
  const leaving = (id: string) => creeping && fromIds.has(id) && !toIds.has(id);
  /** A node the corruption is reaching (as it plays): shown plain, turning. */
  const arriving = (id: string) => creeping && toIds.has(id) && !fromIds.has(id);
  /** The rule on a node's label: its corruption's, or (as it plays) the one leaving it. */
  function ruleOn(id: string): BossMod | null {
    if (leaving(id)) {
      const m = moves.find((v) => v.from === id)!;
      return s.fronts.find((f) => f.id === m.front)?.rule ?? null;
    }
    return frontAt(id)?.rule ?? null;
  }

  // ---- Words ----
  const bossRules = $derived(live.map((f) => BOSS_MOD_NAMES[f.rule]));
  function nodeSaid(id: string, p: Place): string {
    const n = name(id);
    if (p.kind === 'boss') return `${n}: Boss, at the boss, only Torches work${bossRules.length ? `, ${bossRules.join(', ')}` : ''}`;
    const rule = ruleOn(id);
    const said = rule && p.kind === 'zone' ? `${n}: ${placeName(p)}, Blood toll (corruption), if it reaches the boss: ${BOSS_MOD_NAMES[rule]}` : `${n}: ${placeName(p)}`;
    return `${said}${id === s.at ? ', you are here' : ''}`;
  }
  /** A Where next row's lines, under its name and kind. */
  function rowLines(p: Place): string[] {
    if (p.kind !== 'zone') return [placeDoes(run, p)];
    const z = zoneLines(run, p.type);
    return z.rule ? [z.free, z.rule] : [z.free];
  }
  function rowSaid(id: string, p: Place): string {
    const lines = p.kind === 'boss' ? [placeDoes(run, p), bossAdds(run)] : rowLines(p);
    const f = frontAt(id);
    const toll = f ? `. Blood toll (corruption): ${bloodLine(run).replace(' • ', ', ')}. ${bossIfReached(f.rule)}` : '';
    return `Go to ${name(id)}: ${placeKind(p)}, ${lines.join(', ')}${toll}`;
  }
  const keyLine = $derived(`Blood toll (corruption): ${bloodLine(run).replace(' • ', ', ')}`);
  const footLine = $derived(
    `${creepIn === 0 ? 'It moves after this step.' : `It moves in ${creepIn === 1 ? '1 step' : `${creepIn} steps`}.`} Name every item in its zone to stop it.`,
  );

  // ---- The plate ----
  let width = $state(0);
  let frameH = $state(0);
  let keyH = $state(0);
  let frame: HTMLDivElement | undefined = $state();
  /** Each label's height, measured (only ever grows, so nothing jumps as the creep's lines fade). */
  let heights: Record<string, number> = $state({});
  const L = $derived(width > 0 ? layout(width, frameH, Z, heights, keyH) : null);
  const measured = $derived(Object.keys(heights).length >= GRAPH.nodes.length);

  function measure(node: HTMLElement, id: string) {
    const ro = new ResizeObserver(() => {
      const h = Math.ceil(node.offsetHeight);
      if (h > (heights[id] ?? 0)) heights[id] = h;
    });
    ro.observe(node);
    return { destroy: () => ro.disconnect() };
  }

  // On arriving, the frame scrolls to where the player stands and the places ahead (and the corruption's moves, where they fit).
  let shown = false;
  $effect(() => {
    if (!L || !frame || !measured || shown) return;
    shown = true;
    const view = frame.clientHeight - keyH;
    const span = (ids: string[]) => ids.map((id) => L.at[id].y);
    let ys = span([s.at, ...options]);
    const withMoves = [...ys, ...span(moves.flatMap((m) => [m.from, m.to]))];
    if (Math.max(...withMoves) - Math.min(...withMoves) < view - 2 * Z.padTop) ys = withMoves;
    frame.scrollTop = (Math.min(...ys) + Math.max(...ys) + Z.nameTop + 24) / 2 - view / 2;
  });

  // The screen fills the window under the run's bar (it scrolls on a short phone).
  let root: HTMLDivElement | undefined = $state();
  let top = $state(0);
  $effect(() => {
    if (!root) return;
    const el = root;
    const set = () => (top = Math.round(el.getBoundingClientRect().top + scrollY));
    set();
    const raf = requestAnimationFrame(set);
    addEventListener('resize', set);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('resize', set);
    };
  });

  const go = (id: string) => {
    if (!creeping) run.choose(id);
  };
  const icon = (p: Place) => (p.kind === 'zone' ? 'zone' : p.kind);
</script>

{#snippet mark(kind: string)}
  {#if kind === 'vaal'}
    <span class="ic"><Glyph of="corrupt" /></span>
  {:else if kind === 'flask'}
    <span class="ic"><Glyph of="flask" /></span>
  {:else}
    <svg class="ic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round" stroke-linecap="round">
      {#if kind === 'zone'}
        <path d="M12 3 20 12 12 21 4 12z" /><path d="M12 7.5 16.5 12 12 16.5 7.5 12z" stroke-width=".9" />
      {:else if kind === 'town'}
        <path d="M4.5 20.5v-9L12 5.5l7.5 6v9M9.6 20.5v-5.4h4.8v5.4M2.8 20.5h18.4" /><path d="M12 2.5v3" stroke-width=".9" />
      {:else if kind === 'well'}
        <path d="M5 12.5h14M6.4 12.5v7.6h11.2v-7.6M7.6 12.5V6.2M16.4 12.5V6.2M5.4 6.2 12 3.4l6.6 2.8z" />
        <path d="M12 6.2v2.4M10.6 8.6h2.8v2h-2.8z" stroke-width=".9" /><path d="M6.4 16.3h11.2" stroke-width=".8" />
      {:else if kind === 'boss'}
        <path d="M4 17.5 5.6 7.8l4 4.2L12 5l2.4 7 4-4.2L20 17.5z" /><path d="M4 20.5h16" /><circle cx="12" cy="14.6" r="1.1" stroke-width=".9" />
      {:else if kind === 'camp'}
        <path d="M3 20.2 12 5.2l9 15z" /><path d="M12 12.6l-3 7.6M12 12.6l3 7.6M12 5.2V2.8" stroke-width=".9" />
      {:else}
        <path d="M9.5 5.5 16 12l-6.5 6.5" stroke-width="1.5" />
      {/if}
    </svg>
  {/if}
{/snippet}

<div class="map-screen" class:wide bind:this={root} style:--top="{top}px">
  <h1 class="sr">{here.name}</h1>
  <p class="task">Pick where to go next. The lit places are one step ahead.</p>

  <div class="body">
    <section class="map" class:wide aria-label="The map">
      <div class="map-sc" bind:this={frame} bind:clientWidth={width} bind:clientHeight={frameH}>
        {#if L}
          <div class="map-in" style:height="{L.height}px">
            <svg class="links" width={L.width} height={L.height} aria-hidden="true">
              {#each GRAPH.nodes as a (a.id)}
                {#each GRAPH.next[a.id] as b (b)}
                  <line
                    class="lk"
                    class:past={legs.has(`${a.id}>${b}`)}
                    class:next={a.id === s.at && offered.has(b)}
                    x1={L.at[a.id].x}
                    y1={L.at[a.id].y}
                    x2={L.at[b].x}
                    y2={L.at[b].y}
                  />
                {/each}
              {/each}
              {#each moves as m (m.front)}
                <line class="lk trail" x1={L.at[m.from].x} y1={L.at[m.from].y} x2={L.at[m.to].x} y2={L.at[m.to].y} />
              {/each}
            </svg>
            {#each L.rows as r (r.step)}
              <span class="sn" class:now={r.step === nextStep && options.length > 0} style:top="{r.y}px" aria-hidden="true">{r.step || ''}</span>
            {/each}
            {#each GRAPH.nodes as n (n.id)}
              {@const p = s.places[n.id]}
              {@const at = L.at[n.id]}
              {@const lit = offered.has(n.id)}
              {@const rule = ruleOn(n.id)}
              <div
                class="node {icon(p)}"
                class:past={route.has(n.id) && n.id !== s.at}
                class:here={n.id === s.at}
                class:lit
                class:cor={!!rule && !leaving(n.id) && !arriving(n.id)}
                class:leaving={leaving(n.id)}
                class:arriving={arriving(n.id)}
                style:left="{at.x}px"
                style:top="{at.y}px"
              >
                {#if lit}
                  <button class="g" tabindex="-1" aria-label={nodeSaid(n.id, p)} disabled={creeping} onclick={() => go(n.id)}>{@render mark(icon(p))}</button>
                {:else}
                  <span class="g" role="img" aria-label={nodeSaid(n.id, p)}>{@render mark(icon(p))}</span>
                {/if}
                <span class="nl" style:max-width="{L.labelW[n.id]}px" aria-hidden="true" use:measure={n.id}
                  >{n.name}<em>{placeName(p)}</em>{#if rule && p.kind === 'zone'}<em class="r">Blood toll</em><em class="br">{bossOnNode(rule)}</em
                    >{/if}{#if p.kind === 'boss'}<em class="br">{bossLine(run)}</em>{/if}</span
                >
              </div>
            {/each}
            {#if creeping}
              {#each moves as m (m.front)}
                {@const a = L.at[m.from]}
                {@const b = L.at[m.to]}
                <span class="ember" style:left="{a.x}px" style:top="{a.y}px" style:--dx="{b.x - a.x}px" style:--dy="{b.y - a.y}px" aria-hidden="true"></span>
              {/each}
            {/if}
          </div>
        {/if}
      </div>
      {#if creeping}
        <div class="creep" role="status" out:fade={{ duration: 300 }}>
          <span class="sr">{movedSaid}</span>
          <span class="t" aria-hidden="true">{@render mark('vaal')}The corruption moves on</span>
          <button class="tap" onclick={() => (creeping = false)}>Tap to go on</button>
        </div>
      {/if}
      {#if live.length}
        <div class="map-key" bind:offsetHeight={keyH}>
          <span class="r">{@render mark('vaal')} {keyLine}</span>
          <span>{footLine}</span>
        </div>
      {/if}
    </section>

    <div class="side">
      {#if well}
        <p class="beat" role="status">
          {@render mark('flask')}<span><span class="pl">{here.name}</span> • your flask {well.refilled ? 'is full again' : 'was already full'}</span>
        </p>
      {/if}
      <section class="wn" class:resting={creeping} aria-labelledby="wn-h">
        <div class="wn-head">
          <h2 class="sub" id="wn-h">Where next</h2>
          {#if options.length}<span class="stp">Step {nextStep} of {GRAPH.boss.step}</span>{/if}
          <span class="grow"></span>
          {#if onclose}<button class="btn ghost small" onclick={onclose}>Back</button>{/if}
        </div>
        {#each options as id (id)}
          {@const p = s.places[id]}
          {@const f = frontAt(id)}
          <button class="place" class:cor={!!f} aria-label={rowSaid(id, p)} disabled={creeping} onclick={() => go(id)}>
            <span class="k">{@render mark(f ? 'vaal' : icon(p))}</span>
            <span class="tx">
              <span class="nm">{name(id)}<span class="kd">{placeKind(p)}</span></span>
              {#each rowLines(p) as line, k (k)}<span class="ln">{line}</span>{/each}
              {#if p.kind === 'boss'}
                {#each bossRuleLines(run) as line, k (k)}<span class="ln t">{line}</span>{:else}<span class="ln">{bossAdds(run)}</span>{/each}
              {/if}
              {#if f}
                <span class="ln t"><b>Blood toll</b> • {bloodLine(run)}</span>
                <span class="ln t">{bossIfReached(f.rule)}</span>
              {/if}
            </span>
            <span class="chev">{@render mark('chev')}</span>
          </button>
        {/each}
      </section>
    </div>
  </div>
</div>

<style>
  .map-screen {
    display: flex;
    flex-direction: column;
    gap: 8px;
    /* The window under the run's bar, less the page's foot padding. */
    min-height: max(30rem, calc(100svh - var(--top, 0px) - 12px));
  }
  .task {
    display: none;
  }
  .body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .side {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .wide .task {
    display: block;
    margin: 0;
    text-align: center;
    font-size: 1.19rem;
    color: #e6dccb;
    line-height: 1.2;
  }
  .wide .body {
    display: grid;
    grid-template-columns: minmax(0, 640px) minmax(0, 460px);
    justify-content: center;
    column-gap: 40px;
    padding-bottom: 12px;
  }
  .wide .side {
    justify-content: center;
    gap: 18px;
  }

  .ic {
    display: inline-block;
    flex: none;
    width: 1em;
    height: 1em;
  }

  /* ---- The plate ---- */
  .map {
    position: relative;
    flex: 1 1 0;
    min-height: 15rem;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: rgba(8, 6, 5, 0.9) var(--dither);
    image-rendering: pixelated;
    box-shadow:
      inset 0 0 0 3px #080605,
      inset 0 0 0 4px rgba(125, 99, 51, 0.28);
    overflow: hidden;
  }
  .map.wide {
    min-height: 26rem;
  }
  .map-sc {
    position: absolute;
    inset: 4px;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: none;
    image-rendering: auto;
  }
  .map-sc::-webkit-scrollbar {
    display: none;
  }
  .map-in {
    position: relative;
  }
  .links {
    position: absolute;
    left: 0;
    top: 0;
    pointer-events: none;
  }
  .lk {
    stroke: #3b3024;
    stroke-width: 1;
  }
  .lk.past {
    stroke: rgba(201, 164, 92, 0.6);
    stroke-width: 1.5;
  }
  .lk.next {
    stroke: var(--gold-hi);
    stroke-width: 1.5;
    stroke-dasharray: 3 3;
    opacity: 0.85;
  }
  .lk.trail {
    stroke: #e0553f;
    stroke-width: 1.5;
    stroke-dasharray: 2 3;
  }
  .sn {
    position: absolute;
    left: 6px;
    translate: 0 -50%;
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 9.5px;
    letter-spacing: 0.08em;
    color: #5d5242;
  }
  .wide .sn {
    left: 10px;
    font-size: 11px;
  }
  .sn.now {
    color: var(--gold);
  }

  .node {
    position: absolute;
    width: 0;
    height: 0;
  }
  .node .g {
    position: absolute;
    left: 0;
    top: 0;
    translate: -50% -50%;
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    padding: 0;
    color: #8a7a60;
    background: none;
    border: 0;
    font: inherit;
    cursor: default;
  }
  .wide .node .g {
    width: 28px;
    height: 28px;
  }
  .node .g::before {
    content: '';
    position: absolute;
    inset: 4px;
    rotate: 45deg;
    border: 1px solid currentColor;
    background: #0e0b08;
  }
  .node .g .ic {
    position: relative;
    font-size: 15px;
  }
  .node.zone .g .ic {
    font-size: 9px;
  }
  .node.camp .g::before,
  .node.town .g::before,
  .node.well .g::before,
  .node.boss .g::before {
    rotate: none;
    border-radius: 50%;
    inset: 1px;
  }
  .node.boss .g {
    width: 32px;
    height: 32px;
    color: #e8a08a;
  }
  .node.boss .g .ic {
    font-size: 19px;
  }
  .node .nl {
    position: absolute;
    left: 0;
    top: 14px;
    translate: -50% 0;
    width: max-content;
    padding: 1px 4px 2px;
    border-radius: 3px;
    background: rgba(8, 6, 5, 0.82);
    font-size: 11.5px;
    line-height: 1.12;
    text-align: center;
    text-wrap: balance;
    color: #8a7f6c;
    pointer-events: none;
  }
  .wide .node .nl {
    top: 16px;
    font-size: 13px;
  }
  .node .nl em {
    display: block;
    font-style: normal;
    font-size: 10px;
    color: #6b6150;
  }
  .wide .node .nl em {
    font-size: 11.5px;
  }
  .node .nl em.r {
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 8.5px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #ff8a72;
  }
  .wide .node .nl em.r {
    font-size: 9.5px;
  }
  .node .nl em.br {
    font-family: var(--font-body);
    font-style: italic;
    font-weight: 400;
    font-size: 10px;
    color: #d39a86;
  }
  .wide .node .nl em.br {
    font-size: 11px;
  }
  .node.past .g,
  .node.past .nl {
    opacity: 0.55;
  }
  .node.past .g {
    color: var(--gold-lo);
  }
  .node.past .nl em.br {
    color: #6b6150;
  }
  .node.here .g {
    color: #f1d99b;
  }
  .node.here .g::after {
    content: '';
    position: absolute;
    inset: -4px;
    border-radius: 50%;
    border: 1.5px solid #d9a066;
    box-shadow: 0 0 12px rgba(217, 160, 102, 0.5);
  }
  .node.here .nl {
    color: #e6dccb;
  }
  .node.lit .g {
    color: var(--gold-hi);
    cursor: pointer;
  }
  /* A tap target 44 px across. */
  .node.lit .g::after {
    content: '';
    position: absolute;
    inset: -10px;
    border-radius: 50%;
  }
  .node.lit .g::before {
    background: #2a1f12;
    box-shadow:
      0 0 0 3px rgba(241, 217, 155, 0.12),
      0 0 14px rgba(241, 190, 90, 0.45);
  }
  .node.lit .g:hover::before {
    box-shadow:
      0 0 0 3px rgba(241, 217, 155, 0.25),
      0 0 18px rgba(241, 190, 90, 0.6);
  }
  .node.lit .g:disabled {
    cursor: default;
  }
  .node.lit .nl {
    font-family: var(--font-display);
    font-weight: 700;
    color: #f6e7c6;
  }
  .node.lit .nl em:not(.r):not(.br) {
    font-family: var(--font-body);
    font-weight: 500;
    color: var(--gold);
  }
  .node.cor .g {
    color: #ff8a72;
  }
  .node.cor .g::before {
    background: #2a0d08;
    border-color: #e0553f;
    box-shadow: 0 0 12px rgba(224, 85, 63, 0.45);
  }
  .node.lit.cor .g::before {
    box-shadow:
      0 0 0 3px rgba(224, 85, 63, 0.18),
      0 0 16px rgba(224, 85, 63, 0.6);
  }

  /* ---- The corruption moving on, once ---- */
  .ember {
    position: absolute;
    z-index: 3;
    width: 0;
    height: 0;
    animation: ember 3s ease-in-out both;
  }
  .ember::before {
    content: '';
    position: absolute;
    left: -5px;
    top: -5px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: radial-gradient(circle, #ffe4cf 0 25%, #ff7a50 45%, rgba(224, 60, 30, 0) 72%);
    box-shadow: 0 0 10px rgba(255, 110, 60, 0.9);
  }
  @keyframes ember {
    0%,
    12% {
      translate: 0 0;
      opacity: 0;
    }
    18% {
      opacity: 1;
    }
    62% {
      translate: var(--dx) var(--dy);
      opacity: 1;
    }
    75%,
    100% {
      translate: var(--dx) var(--dy);
      opacity: 0;
    }
  }
  .node.leaving .g {
    animation: leave-ink 3s ease-in-out both;
  }
  .node.leaving .g::before {
    animation: leave 3s ease-in-out both;
  }
  .node.leaving .nl em.r,
  .node.leaving .nl em.br {
    animation: tagout 3s ease-in-out both;
  }
  .node.arriving .g {
    animation: arrive-ink 3s ease-in-out both;
  }
  .node.arriving .g::before {
    animation: arrive 3s ease-in-out both;
  }
  .node.arriving .nl em.r,
  .node.arriving .nl em.br {
    animation: tagin 3s ease-in-out both;
  }
  @keyframes leave {
    0%,
    15% {
      border-color: #e0553f;
      background: #2a0d08;
      box-shadow: 0 0 12px rgba(224, 85, 63, 0.45);
    }
    45%,
    100% {
      border-color: #8a7a60;
      background: #0e0b08;
      box-shadow: none;
    }
  }
  @keyframes leave-ink {
    0%,
    15% {
      color: #ff8a72;
    }
    45%,
    100% {
      color: #8a7a60;
    }
  }
  @keyframes arrive {
    0%,
    55% {
      border-color: #8a7a60;
      background: #0e0b08;
      box-shadow: none;
    }
    70%,
    100% {
      border-color: #e0553f;
      background: #2a0d08;
      box-shadow: 0 0 12px rgba(224, 85, 63, 0.45);
    }
  }
  @keyframes arrive-ink {
    0%,
    55% {
      color: #8a7a60;
    }
    70%,
    100% {
      color: #ff8a72;
    }
  }
  @keyframes tagout {
    0%,
    15% {
      opacity: 1;
    }
    40%,
    100% {
      opacity: 0;
    }
  }
  @keyframes tagin {
    0%,
    58% {
      opacity: 0;
    }
    75%,
    100% {
      opacity: 1;
    }
  }
  /* Held still: the corruption is shown where it went, the beat's line kept a moment. */
  @media (prefers-reduced-motion: reduce) {
    .ember {
      display: none;
    }
    .node.leaving .g,
    .node.leaving .g::before,
    .node.leaving .nl em,
    .node.arriving .g,
    .node.arriving .g::before,
    .node.arriving .nl em {
      animation: none;
    }
    .node.leaving .nl em.r,
    .node.leaving .nl em.br {
      opacity: 0;
    }
    .node.arriving .g {
      color: #ff8a72;
    }
    .node.arriving .g::before {
      background: #2a0d08;
      border-color: #e0553f;
    }
  }
  .creep {
    position: absolute;
    inset: 0 0 auto;
    z-index: 4;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 12px 10px 18px;
    text-align: center;
    background:
      linear-gradient(180deg, rgba(30, 8, 5, 0.97) 60%, rgba(30, 8, 5, 0)),
      var(--dither);
    image-rendering: pixelated;
  }
  .creep .t {
    display: flex;
    align-items: center;
    gap: 7px;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 17px;
    letter-spacing: 0.04em;
    color: #ffc4b2;
  }
  .creep .t .ic {
    font-size: 17px;
    color: #ff8a72;
  }
  .creep .tap {
    padding: 0;
    font: inherit;
    font-size: 12px;
    color: var(--muted);
    background: none;
    border: 0;
    cursor: pointer;
  }
  /* The whole line takes the tap. */
  .creep .tap::after {
    content: '';
    position: absolute;
    inset: 0;
  }

  .map-key {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 2;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
    padding: 8px 10px 7px;
    font-size: 12.5px;
    line-height: 1.2;
    text-align: center;
    color: var(--muted);
    background: rgba(8, 6, 5, 0.94) var(--dither);
    border-top: 1px solid rgba(125, 99, 51, 0.25);
  }
  .wide .map-key {
    font-size: 14px;
  }
  .map-key .r {
    color: #ff9c86;
  }
  .map-key .r .ic {
    font-size: 12px;
    vertical-align: -1px;
  }

  /* ---- A Well's line ---- */
  .beat {
    flex: none;
    margin: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 30px;
    font-size: 16px;
    text-align: center;
    color: #e6dccb;
  }
  .beat .ic {
    font-size: 18px;
    color: #a9cf8f;
  }
  .beat .pl {
    font-family: var(--font-display);
    font-weight: 700;
    color: #f6e7c6;
  }

  /* ---- Where next ---- */
  .wn {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
    transition:
      opacity 0.3s,
      filter 0.3s;
  }
  .wn.resting {
    opacity: 0.4;
    filter: saturate(0.6);
    pointer-events: none;
  }
  .wn-head {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 30px;
  }
  .wn-head .sub {
    margin: 0;
    font-family: var(--font-body);
    font-weight: 400;
    font-size: 17px;
    letter-spacing: 0;
    text-transform: none;
    line-height: 1.2;
    color: #e6dccb;
  }
  .wide .wn-head .sub {
    font-size: 19px;
  }
  .wn-head .stp {
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 11px;
    letter-spacing: 0.1em;
    color: var(--muted);
  }
  .wn-head .grow {
    flex: 1;
  }
  .place {
    position: relative;
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr) 16px;
    align-items: center;
    column-gap: 10px;
    min-height: 48px;
    padding: 4px 10px;
    font: inherit;
    text-align: left;
    color: inherit;
    background: linear-gradient(90deg, rgba(40, 31, 22, 0.95), rgba(20, 16, 12, 0.95));
    border: 1px solid var(--gold-lo);
    border-radius: 4px;
    box-shadow:
      inset 0 1px 0 rgba(255, 220, 150, 0.06),
      0 6px 14px rgba(0, 0, 0, 0.35);
    cursor: pointer;
  }
  .place:hover {
    border-color: var(--gold);
    box-shadow:
      inset 0 1px 0 rgba(255, 220, 150, 0.1),
      0 0 16px rgba(201, 164, 92, 0.25);
  }
  .place:focus-visible {
    outline: 2px solid var(--gold);
    outline-offset: 2px;
  }
  .place:disabled {
    cursor: default;
  }
  .wide .place {
    min-height: 64px;
    padding: 6px 10px;
    grid-template-columns: 36px minmax(0, 1fr) 18px;
  }
  .place > .k {
    justify-self: center;
    display: grid;
    font-size: 24px;
    color: var(--gold);
  }
  .wide .place > .k {
    font-size: 28px;
  }
  .place .tx {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .place .nm {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 15px;
    line-height: 1.15;
    color: #f6e7c6;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .wide .place .nm {
    font-size: 17px;
  }
  .place .nm .kd {
    margin-left: 6px;
    font-family: var(--font-body);
    font-weight: 500;
    font-size: 13.5px;
    color: var(--gold);
  }
  .place .ln {
    font-size: 13.5px;
    line-height: 1.2;
    color: var(--muted);
  }
  .wide .place .ln {
    font-size: 15px;
  }
  .place .ln b {
    font-weight: 500;
    color: #cfc4b2;
  }
  .place .ln.t {
    color: #d39a86;
  }
  .place > .chev {
    display: grid;
    font-size: 16px;
    color: var(--gold-lo);
  }
  .place.cor {
    border-color: #8e2a1e;
    background: linear-gradient(90deg, rgba(52, 20, 14, 0.95), rgba(22, 12, 9, 0.95));
  }
  .place.cor > .k {
    color: #ff8a72;
  }
  .place.cor .ln.t {
    color: #ff9c86;
  }
  .place.cor .ln.t b {
    color: #ffc4b2;
  }
</style>
