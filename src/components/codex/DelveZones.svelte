<script lang="ts" module>
  // The zones reached, as a descent: from the Mines down to the deepest you
  // have been, alone or together, each zone in the seal its title card
  // struck as you first came into it (zonecard/ZoneSeal: its sigil in a worn
  // double ring, in its colour), its name, the depth it starts at and the
  // day you first got there, the two columns named over them. A thread runs
  // down from seal to seal, stopping short of each as an engraver's line
  // stops at a seal, passing from one zone's colour into the next's; under
  // the deepest it goes on, dotted, to an empty seal, the dull impression
  // the descent leaves for a zone not reached (lib/descentPlate), named only
  // "uncharted": the zones ahead are a surprise. Past five zones the middle
  // ones wait behind a button, the Mines kept at the top.
  //
  // Held to a height (beside the fossils, CodexDelve), the descent fills it:
  // the uncharted seal at its foot, the thread from the deepest zone running
  // down to it, so the way still to go is the card's empty part. All the
  // zones shown then scroll inside it; on a phone, where nothing stands
  // beside it, the card grows instead. Either way they open where the
  // button was: the rows under it go down to their places as the hidden
  // ones come in behind them.
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

  /**
   * The opening: the rows going down to their places, setting off slowly
   * enough to be seen going (with a hundred zones they go thousands of
   * pixels: started at full speed, they'd be gone in a frame) and coming to
   * rest softly where they're still in sight.
   */
  const MOVE = 450;
  const EASE = [0.5, 0, 0.3, 1] as const;
  const EASING = `cubic-bezier(${EASE.join(', ')})`;
  /** A row coming in fades in place, the next no sooner than this after the one above it. */
  const FADE = 220;
  const NEXT = 40;

  /** When, as a share of the move's time, the move has come `p` of its way (its easing turned round). */
  function timeAt(p: number): number {
    const [x1, y1, x2, y2] = EASE;
    const at = (s: number, a: number, b: number) => 3 * (1 - s) ** 2 * s * a + 3 * (1 - s) * s * s * b + s ** 3;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (at(mid, y1, y2) < p) lo = mid;
      else hi = mid;
    }
    return at((lo + hi) / 2, x1, x2);
  }
</script>

<script lang="ts">
  import { tick } from 'svelte';
  import { motion } from '../../lib/motion.svelte';
  import { backdropShadow } from '../../lib/backdropShadow';
  import { shownDepth } from '../../lib/delve';
  import type { ZoneProgress, ZoneReached } from '../../lib/codexStats';
  import ZoneSeal from '../zonecard/ZoneSeal.svelte';

  let { zones }: { zones: ZoneProgress } = $props();

  const date = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const word = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

  let all = $state(false);
  type Row = { z: ZoneReached } | { gap: number };
  const rows: Row[] = $derived.by(() => {
    const r = zones.reached;
    if (all || r.length <= SHOWN) return r.map((z) => ({ z }));
    return [{ z: r[0] }, { gap: r.length - 1 - DEEPEST }, ...r.slice(-DEEPEST).map((z) => ({ z }))];
  });
  /** Each zone's colour, and the next one's, which its thread passes into. */
  const inkOf = (z: ZoneReached) => accentAt(z.depth);
  const nextInk = (i: number) => {
    const next = rows[i + 1];
    return next && 'z' in next ? inkOf(next.z) : null;
  };

  let list = $state<HTMLOListElement>();
  /** The scrollbar's room (none where scrollbars float over the page), which the descent keeps out in the panel's padding so its columns end where the header does. */
  let gutter = $state(0);
  $effect(() => {
    if (list) gutter = list.offsetWidth - list.clientWidth;
  });

  /** All the zones shown, opening where the button was. */
  async function showAll() {
    const el = list;
    if (!el) return;
    const top = (li: Element) => (li.querySelector('.mark') ?? li).getBoundingClientRect().top;
    const was = new Map<Element, number>();
    for (const li of el.children) was.set(li, top(li));
    const height = el.offsetHeight;
    all = true;
    await tick();
    if (motion.still) return;
    // No scrollbar while it moves: one comes in after, where the list is held to the card.
    el.style.overflow = 'hidden';
    const moves: Animation[] = [];
    // Where nothing stands beside it, the list's box grows on down the page, the rows going down riding its foot.
    if (el.offsetHeight > height + 0.5) {
      const open = el.animate({ height: [`${height}px`, `${el.offsetHeight}px`] }, { duration: MOVE, easing: EASING });
      moves.push(open);
    }
    // The rows that stay go down from where they were to their places.
    let from = 0;
    let by = 0;
    let last = 0;
    for (const li of el.children) {
      const then = was.get(li);
      if (then === undefined) continue;
      const dy = then - top(li);
      if (Math.abs(dy) < 0.5) continue;
      moves.push(li.animate({ translate: [`0 ${dy}px`, '0 0'] }, { duration: MOVE, easing: EASING }));
      if (!li.classList.contains('ahead')) {
        if (!by) [from, by] = [then, -dy];
        last = dy;
        continue;
      }
      // The uncharted seal goes a shorter way than the zones over it (held to the card, its row was the rest of the card): its thread keeps hold of the deepest seal as they close up.
      const thread = li.querySelector<HTMLElement>('.thread');
      if (!thread || Math.abs(last - dy) < 0.5) continue;
      const end = parseFloat(getComputedStyle(thread).top);
      const close = thread.animate({ top: [`${end + last - dy}px`, `${end}px`] }, { duration: MOVE, easing: EASING });
      moves.push(close);
    }
    // The rows shown now each fade in as the rows going down clear their place, one after another.
    let n = 0;
    for (const li of el.children) {
      if (was.has(li)) continue;
      const clear = by > 0 ? (top(li) + li.getBoundingClientRect().height - from) / by : 0;
      const delay = Math.min(MOVE, Math.max(timeAt(Math.min(1, Math.max(0, clear))) * MOVE, n++ * NEXT));
      moves.push(li.animate({ opacity: [0, 1] }, { duration: FADE, delay, easing: 'ease-out', fill: 'backwards' }));
    }
    await Promise.all(moves.map((a) => a.finished.catch(() => {})));
    el.style.overflow = '';
  }
</script>

<section class="panel zones" class:open={all} use:backdropShadow={{ fill: 'linear' }} aria-labelledby="zone-h">
  <header><h2 id="zone-h">Zones reached</h2>{#if zones.biomes}<span class="col-label">{zones.biomes} {word(zones.biomes, 'biome')}</span>{/if}</header>
  {#if zones.reached.length}
    <div class="descent" style:--gutter="{gutter}px">
      <div class="cols" aria-hidden="true"><span class="from">From depth</span><span class="first">Reached</span></div>
      <ol bind:this={list} class:onward={!!zones.next} style:--rows={rows.length}>
        {#each rows as row, i ('z' in row ? row.z.k : 'gap')}
          {#if 'z' in row}
            {@const ink = inkOf(row.z)}
            <li
              class="zone"
              class:to-gap={'gap' in (rows[i + 1] ?? {})}
              class:last={i === rows.length - 1}
              style:--accent={ink}
              style:--accent-next={nextInk(i) ?? 'var(--dull)'}
            >
              <span class="mark">
                <ZoneSeal sigil={stratumName(row.z.k)} play={still} still seed={seedOf(stratumName(row.z.k))} />
              </span>
              <span class="name">{row.z.name}</span>
              <span class="depth n"><span class="sr-only">from depth</span> {shownDepth(row.z.depth)}</span>
              <span class="when n"><span class="when-word">reached</span> {date(row.z.at)}</span>
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
            <span class="thread" aria-hidden="true"></span>
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
    </div>
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
   * The descent: the column names, then a row a zone, each the same height,
   * the seals in a column down its left. One grid for the names and all the
   * rows (each a subgrid of it), so the depths and the days keep to their
   * columns however long a language writes a date. The title card's seal
   * takes its ink from --accent as the card mixes it (ZoneCard.svelte).
   */
  .descent {
    --seal: 2.4rem;
    /* Tall enough for a thread of 10 px or so between seals: a line, not a tick. */
    --row: 3.4rem;
    /* What a thread leaves clear above and below a seal. */
    --clear: 3px;
    --dull: #6f6453;
    /* What the list keeps clear at its ends, where it fades as it scrolls. */
    --fade: 0.5rem;
    flex: 1 1 auto;
    display: grid;
    /* (The day's column wide enough for any English date, and wider for all of them where a language writes one longer.) */
    grid-template-columns: var(--seal) minmax(0, 1fr) minmax(2.2rem, auto) minmax(6.2rem, auto);
    grid-template-rows: auto minmax(0, 1fr);
    column-gap: 0.8rem;
    /* The scrollbar's room out in the panel's padding. */
    margin-right: calc(-1 * var(--gutter));
  }
  .open .descent {
    min-height: 0;
  }
  .cols,
  .descent ol {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: subgrid;
    /* (Both keep the same room for a scrollbar, so their columns end together.) */
    scrollbar-gutter: stable;
    scrollbar-width: thin;
  }
  /* The columns' names, as the run log's table names its own, quieter: labels. */
  .cols {
    overflow: hidden;
    font-family: var(--font-display);
    font-size: 0.66rem;
    letter-spacing: 0.16em;
    line-height: 1.2;
    text-transform: uppercase;
    color: var(--muted);
    white-space: nowrap;
  }
  /* (Over the depths, reaching left over the names' column, so a name never makes the figures' column wider.) */
  .cols .from {
    grid-column: 2 / 4;
    justify-self: end;
  }
  .cols .first {
    grid-column: 4;
    justify-self: end;
  }
  /* As deep as the Delve goes, nothing uncharted under it: the rows share the card. */
  .descent ol {
    grid-template-rows: repeat(var(--rows), minmax(var(--row), 1fr));
    margin: 0;
    padding: var(--fade) 0;
    list-style: none;
    overflow-y: auto;
    scrollbar-color: var(--gold-lo) transparent;
  }
  /* The uncharted row: the rest of the card, its seal at the foot. */
  .descent ol.onward {
    grid-template-rows: repeat(var(--rows), var(--row)) minmax(var(--row), 1fr);
  }
  /* All of them shown, held to the card: they scroll, fading at its edges. */
  .open .descent ol {
    min-height: 0;
    mask-image: linear-gradient(transparent, #000 var(--fade), #000 calc(100% - var(--fade)), transparent);
  }
  .descent li {
    --ink: color-mix(in srgb, var(--accent) 55%, var(--gold));
    --ink-hi: color-mix(in srgb, var(--accent) 45%, var(--gold-hi));
    --glow-c: color-mix(in srgb, var(--accent) 65%, #d9a45a);
    position: relative;
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: subgrid;
    align-items: center;
  }
  .mark {
    grid-column: 1;
    display: grid;
    place-items: center;
    width: var(--seal);
    height: var(--seal);
  }
  /*
   * The thread to the next row's seal, from just under this one to just
   * over that one: the rows are all of a height, so it runs a row's height
   * less a seal and the clearance at each end. (Into the uncharted, the
   * uncharted row draws it, as tall as that row is.)
   */
  .descent li:not(.last, .ahead)::after,
  .ahead .thread {
    content: '';
    position: absolute;
    left: calc(var(--seal) / 2 - 0.5px);
    width: 1px;
    opacity: 0.85;
  }
  .descent li:not(.last, .ahead)::after {
    top: calc(50% + var(--seal) / 2 + var(--clear));
    height: calc(100% - var(--seal) - 2 * var(--clear));
    background: linear-gradient(color-mix(in srgb, var(--accent) 40%, var(--gold-lo)), color-mix(in srgb, var(--accent-next) 40%, var(--gold-lo)));
  }
  /* Dotted where it passes zones not shown, and on into the uncharted. */
  .descent li.to-gap::after,
  .descent li.gap::after,
  .ahead .thread {
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
    grid-column: 2;
    min-width: 0;
    overflow: hidden;
    font-size: 0.98rem;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* Cinzel's figures sit on the name's baseline (centred, their boxes leave them a little high). */
  .depth {
    grid-column: 3;
    translate: 0 0.07em;
    text-align: right;
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--gold-hi);
  }
  .when {
    grid-column: 4;
    translate: 0 0.08em;
    text-align: right;
    font-size: 0.75rem;
    color: var(--muted);
    white-space: nowrap;
  }
  /* Its column named over it, the word is for those who hear the row read. */
  .when-word {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /*
   * The zone ahead: an empty, dull impression at the row's foot, as far
   * under the deepest seal as the rest of the card leaves (a row's height
   * at the least, its seal then where any row's is), and only a word for it.
   */
  .descent li.ahead {
    align-items: end;
    padding-bottom: calc((var(--row) - var(--seal)) / 2);
  }
  .ahead .thread {
    top: calc(var(--seal) / 2 + var(--clear) - var(--row) / 2);
    bottom: calc((var(--row) + var(--seal)) / 2 + var(--clear));
    --accent: var(--dull);
  }
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
    display: flex;
    align-items: center;
    height: var(--seal);
    font-style: italic;
    color: var(--muted);
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

  /* Too narrow for a line a zone (a phone, a window just wide enough for the two panels): the day under the name, saying what it is. */
  @container zones (max-width: 22rem) {
    .descent {
      grid-template-columns: var(--seal) minmax(0, 1fr) minmax(2.2rem, auto);
    }
    .cols .first {
      display: none;
    }
    .zone {
      grid-template-rows: auto auto;
      row-gap: 0.1rem;
    }
    .zone .mark,
    .depth {
      grid-row: 1 / span 2;
    }
    .zone .name {
      grid-row: 1;
      align-self: end;
    }
    .when {
      grid-column: 2;
      grid-row: 2;
      align-self: start;
      min-width: 0;
      overflow: hidden;
      text-align: left;
      text-overflow: ellipsis;
    }
    .when-word {
      position: static;
      width: auto;
      height: auto;
      overflow: visible;
      clip-path: none;
      font-family: var(--font-body);
      font-style: italic;
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
