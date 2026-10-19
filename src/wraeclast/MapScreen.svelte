<script module lang="ts">
  import type { Run } from './rules';

  /** The spread each run's map last showed, so the corruption spreading plays once. */
  const shown = new WeakMap<Run, number>();
  /** How long the spread plays before the map settles by itself. */
  const SPREAD_MS = 3200;
</script>

<script lang="ts">
  // The map: the region's 14 places where the owner placed them (map.ts),
  // the links between them, each place's mark (lit where it can be entered,
  // dimmed once cleared). The corruption: corrupted places carry red veins,
  // the places the next zone named will corrupt a red outline, and the
  // lair is a heart a size larger each ring; the plate reddens as it goes.
  // When the spread has moved since the map last showed it, it plays once
  // (the veins drawn out, the heart growing), then the map settles.
  // A tap on a place shows its one line and Enter under the plate.
  import { fade } from 'svelte/transition';
  import { untrack } from 'svelte';
  import { seededRandom } from '../lib/patches';
  import { LINKS, REGION, heartSize, layoutRegion, type PlaceKind } from './map';
  import { MAP_HINT, SPREAD_SAYS, placeLine, spreadSaid } from './words';

  let { run }: { run: Run } = $props();
  const s = $derived(run.state);

  // ---- The spread since the map last showed it: played once, then held still. ----
  const was = untrack(() => shown.get(run) ?? 0);
  const change = untrack(() => run.spreadSince(was));
  untrack(() => shown.set(run, run.state.spread));
  /** The places the spread reached since, as it plays. */
  const reached = new Set(change.places);
  let spreading = $state(change.rings > 0 && (change.places.length > 0 || was < REGION.maxRing));
  $effect(() => {
    if (!spreading) return;
    const t = setTimeout(() => (spreading = false), SPREAD_MS);
    return () => clearTimeout(t);
  });

  const heart = $derived(heartSize(s.spread));
  /** The heart's size before the spread, as a share of its size now (it grows from there as the spread plays). */
  const heartFrom = heartSize(was) / heartSize(untrack(() => run.state.spread));
  /** How red the plate is: the spread's share of the farthest ring. */
  const redOf = (spread: number) => Math.min(spread, REGION.maxRing) / REGION.maxRing;
  const red = $derived(redOf(s.spread));
  const redFrom = redOf(was);

  let width = $state(0);
  let height = $state(0);
  const L = $derived(width > 0 && height > 0 ? layoutRegion(width, height, heart) : null);

  /** The place tapped, its line shown under the plate. */
  let picked = $state<string | null>(null);
  const place = $derived(picked ? REGION.byId.get(picked)! : null);
  const open = $derived(picked ? run.canEnter(picked) : false);
  /** Why the place picked can't be entered. */
  const shut = $derived(!picked || open ? '' : s.places[picked].kind === 'zone' && s.places[picked].cleared ? 'Cleared' : 'Enter a place next to it first');

  const said = (id: string) => {
    const p = REGION.byId.get(id)!;
    return `${p.name}: ${placeLine(run, id)}${run.corrupted(id) ? ', corrupted' : run.corruptsNext(id) ? ', the next zone corrupts it' : ''}${run.canEnter(id) ? '' : ', not open'}`;
  };

  /** A place the corruption holds, the lair included: its veins drawn, its links red. */
  const tainted = (id: string) => id === REGION.lair.id || run.corrupted(id);

  /** A place's veins: a few red branches out from its mark, each place's own (seeded by its id), more and longer from the heart. */
  function veins(id: string, x: number, y: number, r: number): string[] {
    let h = 2166136261;
    for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    const rng = seededRandom(h);
    const lair = id === REGION.lair.id;
    const n = lair ? 8 : 5;
    const out: string[] = [];
    const pt = (px: number, py: number) => `${px.toFixed(1)} ${py.toFixed(1)}`;
    for (let i = 0; i < n; i++) {
      let a = ((i + rng() * 0.7) * 2 * Math.PI) / n;
      let px = x + Math.cos(a) * r * 0.8;
      let py = y + Math.sin(a) * r * 0.8;
      let d = `M${pt(px, py)}`;
      const segs = lair ? 4 : 3;
      for (let k = 0; k < segs; k++) {
        a += (rng() - 0.5) * 1.1;
        const step = 3.5 + rng() * 3;
        px += Math.cos(a) * step;
        py += Math.sin(a) * step;
        d += ` L${pt(px, py)}`;
        // A fork off the middle now and then.
        if (k === 1 && rng() < 0.6) {
          const b = a + (rng() < 0.5 ? -0.8 : 0.8);
          out.push(`M${pt(px, py)} L${pt(px + Math.cos(b) * 4.5, py + Math.sin(b) * 4.5)}`);
        }
      }
      out.push(d);
    }
    return out;
  }
  const sizeOf = (kind: PlaceKind) => (kind === 'zone' ? 24 : kind === 'lair' ? heart : 30);
</script>

{#snippet mark(kind: PlaceKind)}
  <svg class="ic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round" stroke-linecap="round">
    {#if kind === 'zone'}
      <path d="M12 3 20 12 12 21 4 12z" /><path d="M12 7.5 16.5 12 12 16.5 7.5 12z" stroke-width=".9" />
    {:else if kind === 'town'}
      <path d="M4.5 20.5v-9L12 5.5l7.5 6v9M9.6 20.5v-5.4h4.8v5.4M2.8 20.5h18.4" /><path d="M12 2.5v3" stroke-width=".9" />
    {:else if kind === 'lair'}
      <path d="M12 20.5c-4.5-3-8-6.2-8-10a4.2 4.2 0 0 1 8-1.8 4.2 4.2 0 0 1 8 1.8c0 3.8-3.5 7-8 10z" /><path d="M12 8.7v7" stroke-width=".9" />
    {:else}
      <path d="M3 20.2 12 5.2l9 15z" /><path d="M12 12.6l-3 7.6M12 12.6l3 7.6M12 5.2V2.8" stroke-width=".9" />
    {/if}
  </svg>
{/snippet}

<div class="map-screen">
  <h1 class="sr">The map</h1>
  <section class="plate" class:spreading aria-label="The map" style:--red={red} style:--red-from={redFrom} bind:clientWidth={width} bind:clientHeight={height}>
    {#if L}
      <svg class="links" width={width} height={height} aria-hidden="true">
        {#each LINKS as [a, b] (`${a}>${b}`)}
          <line
            class="lk"
            class:open={s.places[a].cleared || s.places[b].cleared}
            class:red={tainted(a) && tainted(b)}
            class:arriving={spreading && (reached.has(a) || reached.has(b))}
            x1={L.at[a].x}
            y1={L.at[a].y}
            x2={L.at[b].x}
            y2={L.at[b].y}
          />
        {/each}
        {#each REGION.places as p (p.id)}
          {#if tainted(p.id)}
            {@const at = L.at[p.id]}
            <g class="vein" class:arriving={spreading && reached.has(p.id)} style:--delay="{spreading && reached.has(p.id) ? 0.5 + 0.25 * (p.ring - was - 1) : 0}s">
              {#each veins(p.id, at.x, at.y, sizeOf(p.kind) / 2) as d, i (i)}
                <path class="under" {d} pathLength="1" />
                <path {d} pathLength="1" />
              {/each}
            </g>
          {/if}
        {/each}
      </svg>
      {#each REGION.places as p (p.id)}
        {@const at = L.at[p.id]}
        {@const lb = L.labels[p.id]}
        <button
          class="node {p.kind}"
          class:lit={run.canEnter(p.id)}
          class:cleared={s.places[p.id].cleared && p.kind === 'zone'}
          class:bad={run.corrupted(p.id)}
          class:next={run.corruptsNext(p.id)}
          class:arriving={spreading && reached.has(p.id)}
          class:fresh={spreading}
          class:growing={spreading && p.kind === 'lair' && heartFrom < 1}
          class:here={p.id === s.at}
          class:picked={p.id === picked}
          style:left="{at.x}px"
          style:top="{at.y}px"
          style:--size={p.kind === 'lair' ? `${heart}px` : null}
          style:--from={p.kind === 'lair' ? heartFrom : null}
          aria-label={said(p.id)}
          aria-pressed={p.id === picked}
          onclick={() => (picked = p.id)}>{@render mark(p.kind)}</button
        >
        <span class="nl" class:lit={run.canEnter(p.id)} style:left="{lb.x}px" style:top="{lb.y}px" style:width="{lb.w}px" aria-hidden="true">{p.name}</span>
      {/each}
    {/if}
    {#if spreading}
      <span class="sr" role="status">{spreadSaid(change.places.map((id) => REGION.byId.get(id)!.name))}</span>
      <button class="spread" onclick={() => (spreading = false)} out:fade={{ duration: 300 }}>
        <span class="band"><span class="t">{SPREAD_SAYS.title}</span><span class="tap">{SPREAD_SAYS.tap}</span></span>
      </button>
    {/if}
  </section>

  <section class="pick" aria-live="polite">
    {#if place && picked}
      <div class="say">
        <h2 class="nm">{place.name}</h2>
        <p class="ln">{placeLine(run, picked)}{#if run.corrupted(picked)}<span class="cor">{' '}• corrupted</span>{/if}</p>
        {#if shut}<p class="why">{shut}</p>{/if}
      </div>
      <button class="btn primary" disabled={!open} onclick={() => run.enter(picked!)}>Enter</button>
    {:else}
      <p class="hint">{MAP_HINT}</p>
    {/if}
  </section>
</div>

<style>
  .map-screen {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  /* The plate reddens with the spread: a flat wash (no gradient), over the dither. */
  .plate {
    position: relative;
    height: clamp(400px, calc(100svh - 330px), 640px);
    border: 1px solid var(--line);
    border-radius: 6px;
    background-color: color-mix(in srgb, rgba(34, 7, 5, 0.94) calc(var(--red) * 100%), rgba(8, 6, 5, 0.9));
    background-image: var(--dither);
    image-rendering: pixelated;
    box-shadow:
      inset 0 0 0 3px #080605,
      inset 0 0 0 4px rgba(125, 99, 51, 0.28);
    overflow: hidden;
  }
  .plate.spreading {
    animation: redden 3s ease-in-out both;
  }
  @keyframes redden {
    0%,
    30% {
      background-color: color-mix(in srgb, rgba(34, 7, 5, 0.94) calc(var(--red-from) * 100%), rgba(8, 6, 5, 0.9));
    }
    75%,
    100% {
      background-color: color-mix(in srgb, rgba(34, 7, 5, 0.94) calc(var(--red) * 100%), rgba(8, 6, 5, 0.9));
    }
  }
  .links {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .lk {
    stroke: #3b3024;
    stroke-width: 1;
  }
  .lk.open {
    stroke: rgba(201, 164, 92, 0.55);
    stroke-width: 1.3;
  }
  .lk.red {
    stroke: rgba(200, 52, 34, 0.75);
    stroke-width: 1.5;
  }
  .lk.red.arriving {
    animation: link-in 3s ease-in-out both;
  }
  @keyframes link-in {
    0%,
    30% {
      stroke: #3b3024;
    }
    60%,
    100% {
      stroke: rgba(200, 52, 34, 0.75);
    }
  }
  /* The veins: a dark red bed and a bright thread, drawn out as the spread reaches a place. */
  .vein path {
    fill: none;
    stroke: #d8432c;
    stroke-width: 1.1;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 1;
    stroke-dashoffset: 0;
  }
  .vein path.under {
    stroke: rgba(120, 18, 10, 0.75);
    stroke-width: 2.6;
  }
  .vein.arriving path {
    animation: vein-in 1.4s ease-out var(--delay) both;
  }
  @keyframes vein-in {
    from {
      stroke-dashoffset: 1;
    }
    to {
      stroke-dashoffset: 0;
    }
  }
  .ic {
    display: block;
    width: 1em;
    height: 1em;
  }
  .node {
    position: absolute;
    translate: -50% -50%;
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    padding: 0;
    font: inherit;
    font-size: 12px;
    color: #8a7a60;
    background: none;
    border: 0;
    cursor: pointer;
    image-rendering: auto;
  }
  /* A tap target 44 px across. */
  .node::after {
    content: '';
    position: absolute;
    inset: -10px;
    border-radius: 50%;
  }
  .node::before {
    content: '';
    position: absolute;
    inset: 3px;
    rotate: 45deg;
    border: 1px solid currentColor;
    background: #0e0b08;
  }
  .node .ic {
    position: relative;
  }
  .node.camp,
  .node.town {
    width: 30px;
    height: 30px;
    font-size: 17px;
  }
  .node.camp::before,
  .node.town::before,
  .node.lair::before {
    rotate: none;
    border-radius: 50%;
    inset: 1px;
  }
  /* The heart: a size larger each ring the spread has moved. */
  .node.lair {
    width: var(--size);
    height: var(--size);
    font-size: calc(var(--size) * 0.57);
    color: #e8735a;
  }
  .node.lair::before {
    background: #2a0d08;
    border-color: #c23a26;
  }
  .node.lair.growing {
    animation: heart-grow 3s ease-in-out both;
  }
  @keyframes heart-grow {
    0%,
    20% {
      scale: var(--from);
    }
    45% {
      scale: calc(var(--from) * 0.92);
    }
    70% {
      scale: 1.08;
    }
    85%,
    100% {
      scale: 1;
    }
  }
  .node.cleared {
    color: var(--gold-lo);
    opacity: 0.6;
  }
  .node.lit {
    color: var(--gold-hi);
  }
  .node.lit::before {
    background: #2a1f12;
    box-shadow:
      0 0 0 3px rgba(241, 217, 155, 0.12),
      0 0 12px rgba(241, 190, 90, 0.4);
  }
  .node.lair.lit {
    color: #ff9c86;
  }
  .node.lair.lit::before {
    background: #3a120b;
    box-shadow: 0 0 12px rgba(224, 85, 63, 0.45);
  }
  /* Corrupted: red through, its veins under it. */
  .node.bad {
    color: #ff8a72;
  }
  .node.bad::before {
    background: #2a0d08;
    border-color: #e0553f;
    box-shadow: 0 0 10px rgba(224, 85, 63, 0.45);
  }
  .node.lit.bad::before {
    box-shadow:
      0 0 0 3px rgba(224, 85, 63, 0.18),
      0 0 14px rgba(224, 85, 63, 0.6);
  }
  .node.bad.arriving {
    animation: arrive-ink 3s ease-in-out both;
  }
  .node.bad.arriving::before {
    animation: arrive 3s ease-in-out both;
  }
  @keyframes arrive {
    0%,
    35% {
      border-color: #8a7a60;
      background: #0e0b08;
      box-shadow: none;
    }
    60%,
    100% {
      border-color: #e0553f;
      background: #2a0d08;
      box-shadow: 0 0 10px rgba(224, 85, 63, 0.45);
    }
  }
  @keyframes arrive-ink {
    0%,
    35% {
      color: #8a7a60;
    }
    60%,
    100% {
      color: #ff8a72;
    }
  }
  /* Next: the next zone named corrupts it. A red outline, nothing more. */
  .node.next::before {
    border: 1.5px solid #e0553f;
  }
  .node.next.fresh::before {
    animation: outline-in 3s ease-in-out both;
  }
  @keyframes outline-in {
    0%,
    65% {
      border-color: transparent;
    }
    85%,
    100% {
      border-color: #e0553f;
    }
  }
  .node.here::after {
    inset: -5px;
    border: 1.5px solid #d9a066;
  }
  .node.picked::after {
    inset: -6px;
    border: 2px solid var(--gold-hi);
  }
  @media (prefers-reduced-motion: reduce) {
    .plate.spreading,
    .lk.red.arriving,
    .vein.arriving path,
    .node.lair.growing,
    .node.bad.arriving,
    .node.bad.arriving::before,
    .node.next.fresh::before {
      animation: none;
    }
  }
  .nl {
    position: absolute;
    padding: 1px 4px 2px;
    border-radius: 3px;
    background: rgba(8, 6, 5, 0.8);
    font-size: 11px;
    line-height: 12.5px;
    text-align: center;
    color: #8a7f6c;
    pointer-events: none;
    box-sizing: border-box;
    image-rendering: auto;
  }
  .nl.lit {
    color: #f6e7c6;
  }

  /* The spread playing: its line over the plate's top; a tap anywhere on the plate settles it. */
  .spread {
    position: absolute;
    inset: 0;
    z-index: 4;
    display: block;
    padding: 0;
    font: inherit;
    background: none;
    border: 0;
    cursor: pointer;
  }
  .spread .band {
    position: absolute;
    inset: 0 0 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 10px 10px 16px;
    text-align: center;
    background:
      linear-gradient(180deg, rgba(30, 8, 5, 0.97) 60%, rgba(30, 8, 5, 0)),
      var(--dither);
    image-rendering: pixelated;
  }
  .spread .t {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 17px;
    letter-spacing: 0.04em;
    color: #ffc4b2;
  }
  .spread .tap {
    font-size: 12px;
    color: var(--muted);
  }

  .pick {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 64px;
  }
  .say {
    flex: 1;
    min-width: 0;
  }
  .nm {
    margin: 0;
    font-family: var(--font-display);
    font-size: 16px;
    letter-spacing: 0;
    text-transform: none;
    color: #f6e7c6;
  }
  .ln,
  .why,
  .hint {
    margin: 2px 0 0;
    font-size: 14px;
    line-height: 1.25;
    color: #d8ccb6;
  }
  .why,
  .hint {
    color: var(--muted);
  }
  .cor {
    color: #e8735a;
  }
  .pick .btn {
    flex: none;
    min-width: 104px;
  }
</style>
