<script lang="ts" module>
  // The zones reached, as a descent: from the Mines down to the deepest you
  // have been, alone or together, each zone in the seal its title card
  // struck as you first came into it (zonecard/ZoneSeal: its sigil in a worn
  // double ring, in its colour), its name, the depth it opens at and the day
  // you first got there. A thread runs down from seal to seal, stopping
  // short of each as an engraver's line stops at a seal, passing from one
  // zone's colour into the next's; under the deepest it goes on, dotted, to
  // an empty seal, the dull impression the descent leaves for a zone not
  // reached (lib/descentPlate), named only "uncharted": the zones ahead are
  // a surprise. Past five zones the middle ones wait behind a button, the
  // Mines kept at the top, so the descent keeps beside the fossils (six rows
  // either way). Under it all, how your deepest grew.
  import { hollow, ring, wear } from '../../lib/arcane';
  import { accentAt, stratumName } from '../../lib/descent';
  import { seedOf } from '../zonecard/family';

  /** The zones shown before the rest are asked for: all of them up to this many, else the Mines and the deepest three under a gap. */
  const SHOWN = 5;
  const DEEPEST = 3;

  /** The empty seal: the title card's two rings (zonecard/ZoneSeal), worn, round the hollow's shading. */
  const EMPTY = {
    // (The name's hash folded into the wear's generator's range, as ZoneSeal folds its own.)
    rings: [ring([0, 0], 12.6, { wear: wear(((seedOf('uncharted') >>> 0) % 2147483646) + 1) }), ring([0, 0], 11.4)],
    hollow: hollow([0, 0], 10.7, 1.5),
  };

  /** A seal's play: nothing. Held still, the title card's seal shows whole from the start. */
  const still = () => new Animation();
</script>

<script lang="ts">
  import { fade } from 'svelte/transition';
  import { tick } from 'svelte';
  import { calm, motion } from '../../lib/motion.svelte';
  import { backdropShadow } from '../../lib/backdropShadow';
  import { shownDepth } from '../../lib/delve';
  import type { ZoneProgress, ZoneReached } from '../../lib/codexStats';
  import ZoneSeal from '../zonecard/ZoneSeal.svelte';

  let { zones, steps }: { zones: ZoneProgress; steps: (number | null)[] } = $props();

  const date = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const word = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

  let all = $state(false);
  type Row = { z: ZoneReached } | { gap: number };
  const rows: Row[] = $derived.by(() => {
    const r = zones.reached;
    if (all || r.length <= SHOWN) return r.map((z) => ({ z }));
    return [{ z: r[0] }, { gap: r.length - 1 - DEEPEST }, ...r.slice(-DEEPEST).map((z) => ({ z }))];
  });
  /** Each zone's colour, and the next one's, which its thread passes into (the next zone's, an unreached one's the dull ink's). */
  const inkOf = (z: ZoneReached) => accentAt(z.depth);
  const nextInk = (i: number) => {
    const next = rows[i + 1];
    return next && 'z' in next ? inkOf(next.z) : null;
  };

  let list = $state<HTMLElement>();
  /** All the zones shown: the list opens to its full height as the new rows fade in (as the run log's). */
  async function showAll() {
    const el = list;
    const from = el?.offsetHeight ?? 0;
    all = true;
    await tick();
    if (!el || motion.still) return;
    const to = el.offsetHeight;
    el.style.overflow = 'clip';
    const open = el.animate({ height: [`${from}px`, `${to}px`] }, { duration: 350, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    await open.finished.catch(() => {});
    el.style.overflow = '';
  }
</script>

<section class="panel zones" use:backdropShadow={{ fill: 'linear' }} aria-labelledby="zone-h">
  <header><h2 id="zone-h">Zones reached</h2>{#if zones.biomes}<span class="col-label">{zones.biomes} {word(zones.biomes, 'biome')}</span>{/if}</header>
  {#if zones.reached.length}
    <ol class="descent" bind:this={list}>
      {#each rows as row, i ('z' in row ? row.z.k : 'gap')}
        {#if 'z' in row}
          {@const ink = inkOf(row.z)}
          <li
            class="zone"
            class:to-gap={'gap' in (rows[i + 1] ?? {})}
            class:to-ahead={i === rows.length - 1 && !!zones.next}
            style:--accent={ink}
            style:--accent-next={nextInk(i) ?? 'var(--dull)'}
            in:fade={calm({ duration: all ? 200 : 0 })}
          >
            <span class="mark">
              <ZoneSeal sigil={stratumName(row.z.k)} play={still} still seed={seedOf(stratumName(row.z.k))} />
            </span>
            <span class="name">{row.z.name}</span>
            <span class="depth n" title="Depth {shownDepth(row.z.depth)} opens it">{shownDepth(row.z.depth)}</span>
            <span class="when n">{date(row.z.at)}</span>
          </li>
        {:else}
          <li class="gap">
            <span class="mark" aria-hidden="true"></span>
            <button class="more" onclick={showAll}>Show all {zones.reached.length} zones</button>
          </li>
        {/if}
      {/each}
      {#if zones.next}
        <li class="ahead">
          <span class="mark" aria-hidden="true">
            <svg viewBox="-14 -14 28 28">
              <path class="shade" d={EMPTY.hollow} />
              <path d={EMPTY.rings[0]} />
              <path class="thin" d={EMPTY.rings[1]} />
            </svg>
          </span>
          <span class="name">uncharted<span class="sr-only">: the next zone, not reached yet</span></span>
        </li>
      {/if}
    </ol>
    {#if steps.length > 1}
      <p class="climb">
        <span class="climb-label">Deepest over time</span>
        <span class="climb-steps"
          >{#each steps as s, i (i)}{#if i}<span class="arrow" aria-hidden="true"> → </span><span class="sr-only">, then </span>{/if}{#if s === null}<span class="gap-mark">…</span
            >{:else}<span class="n">{shownDepth(s)}</span>{/if}{/each}</span
        >
      </p>
    {/if}
  {:else}
    <p class="hint">The zones you reach, and when you first got there, show up here.</p>
  {/if}
</section>

<style>
  /* The panel as CodexDelve's (and the Collection's) are. */
  .panel {
    container: zones / inline-size;
    display: flex;
    flex-direction: column;
    min-width: 0;
    padding: 1.2rem 1.3rem 1.3rem;
  }
  .panel header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.8rem;
    margin-bottom: 0.6rem;
    padding-bottom: 0.6rem;
    border-bottom: 1px solid var(--line);
  }
  .panel h2 {
    font-size: 0.95rem;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: var(--gold-hi);
  }
  .col-label {
    font-family: var(--font-display);
    font-size: 0.72rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #d8a26a;
    white-space: nowrap;
  }
  .n {
    font-family: var(--font-cinzel);
    font-style: normal;
    font-variant-numeric: lining-nums;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }
  .hint {
    margin: 0;
    font-size: 1rem;
    font-style: italic;
    color: var(--note);
  }

  /*
   * The descent: a row a zone, each the same height, growing to fill the
   * panel beside the fossils (to a point), the seals in a column down its
   * left. The title card's seal takes its ink from --accent as the card
   * mixes it (ZoneCard.svelte).
   */
  .descent {
    --seal: 2.4rem;
    /* Tall enough for a thread of 10 px or so between seals at the least: a line, not a tick. */
    --row: 3.4rem;
    /* What a thread leaves clear above and below a seal. */
    --clear: 3px;
    --dull: #6f6453;
    flex: 1 0 auto;
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .descent li {
    --ink: color-mix(in srgb, var(--accent) 55%, var(--gold));
    --ink-hi: color-mix(in srgb, var(--accent) 45%, var(--gold-hi));
    --glow-c: color-mix(in srgb, var(--accent) 65%, #d9a45a);
    position: relative;
    display: grid;
    grid-template-columns: var(--seal) minmax(0, 1fr) 2.2rem 6.2rem;
    grid-template-areas: 'mark name depth when';
    align-items: center;
    column-gap: 0.8rem;
    flex: 1 1 var(--row);
    min-height: var(--row);
    max-height: 4.2rem;
  }
  .mark {
    grid-area: mark;
    display: grid;
    place-items: center;
    width: var(--seal);
    height: var(--seal);
  }
  /*
   * The thread to the next row's seal, from just under this one to just
   * over that one: every row is as tall as the rest, so it runs a row's
   * height less a seal and the clearance at each end.
   */
  .descent li:not(:last-child)::after {
    content: '';
    position: absolute;
    left: calc(var(--seal) / 2 - 0.5px);
    top: calc(50% + var(--seal) / 2 + var(--clear));
    width: 1px;
    height: calc(100% - var(--seal) - 2 * var(--clear));
    background: linear-gradient(color-mix(in srgb, var(--accent) 40%, var(--gold-lo)), color-mix(in srgb, var(--accent-next) 40%, var(--gold-lo)));
    opacity: 0.85;
  }
  /* Dotted where it passes zones not shown, and on into the uncharted. */
  .descent li.to-gap::after,
  .descent li.gap::after,
  .descent li.to-ahead::after {
    background: repeating-linear-gradient(color-mix(in srgb, var(--accent, var(--dull)) 40%, var(--gold-lo)) 0 1.5px, transparent 1.5px 4.5px);
  }
  .descent li.gap::after {
    --accent: var(--dull);
  }
  /* Through the gap's own place, where a seal would be, from the thread above to the one below. */
  .gap .mark {
    height: calc(var(--seal) + 2 * var(--clear));
    background: repeating-linear-gradient(color-mix(in srgb, var(--dull) 40%, var(--gold-lo)) 0 1.5px, transparent 1.5px 4.5px) center / 1px 100% no-repeat;
  }
  .gap .more {
    grid-column: 2 / -1;
    justify-self: start;
    margin: 0;
  }

  .name {
    grid-area: name;
    min-width: 0;
    overflow: hidden;
    font-size: 0.98rem;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* Cinzel's figures sit on the name's baseline (centred, their boxes leave them a little high). */
  .depth {
    grid-area: depth;
    translate: 0 0.07em;
    text-align: right;
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--gold-hi);
  }
  .when {
    grid-area: when;
    translate: 0 0.08em;
    text-align: right;
    font-size: 0.75rem;
    color: var(--muted);
    white-space: nowrap;
  }

  /* The zone ahead: an empty, dull impression, and only a word for it. */
  .ahead svg {
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  .ahead path {
    fill: none;
    stroke: var(--dull);
    stroke-width: 0.6;
    stroke-linecap: butt;
  }
  .ahead path.thin {
    stroke-width: 0.4;
  }
  .ahead path.shade {
    stroke-width: 0.32;
    stroke-linecap: round;
    opacity: 0.5;
  }
  .ahead .name {
    grid-column: 2 / -1;
    font-style: italic;
    color: var(--muted);
  }

  /* How the deepest grew, at the foot. */
  .climb {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.2rem 0.8rem;
    margin: 0.9rem 0 0;
    padding-top: 0.7rem;
    border-top: 1px solid rgba(59, 48, 36, 0.45);
  }
  .climb-label {
    font-family: var(--font-display);
    font-size: 0.72rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #d8a26a;
  }
  /* Under the descent, quieter than the zones it sums up. */
  .climb-steps {
    font-size: 0.95rem;
    color: var(--gold);
  }
  .climb-steps .n {
    font-weight: 700;
  }
  .arrow,
  .gap-mark {
    color: var(--gold-lo);
  }

  .more {
    display: block;
    min-height: 44px;
    padding: 0;
    border: 0;
    background: none;
    font-family: var(--font-display);
    font-size: 0.78rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--gold);
    text-decoration: underline 1px rgba(201, 164, 92, 0.4);
    text-underline-offset: 0.35em;
    cursor: pointer;
    transition: color 0.2s;
  }
  .more:hover {
    color: var(--gold-hi);
    text-decoration-color: var(--gold-hi);
  }

  /* Too narrow for a line a zone (a phone, a window just wide enough for the two panels): the day under the name. */
  @container zones (max-width: 22rem) {
    .descent li {
      grid-template-columns: var(--seal) minmax(0, 1fr) 2.2rem;
      grid-template-areas:
        'mark name depth'
        'mark when depth';
      row-gap: 0.1rem;
    }
    .zone .name {
      align-self: end;
    }
    .when {
      align-self: start;
      text-align: left;
    }
    .ahead .name,
    .gap .more {
      grid-row: 1 / -1;
      align-self: center;
    }
  }
  @media (max-width: 560px) {
    .panel {
      padding: 1rem 1rem 1.1rem;
    }
    .descent {
      --seal: 2.2rem;
      --row: 3.3rem;
    }
  }
</style>
