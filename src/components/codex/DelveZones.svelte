<script lang="ts" module>
  // The zones reached, as a descent: from the Mines down to the deepest you
  // have been, alone or together, each zone in the seal its title card
  // struck as you first came into it (zonecard/ZoneSeal: its sigil in a worn
  // double ring, in its colour), its name, the depth it starts at and the
  // day you first got there, the two columns named over them. A thread runs
  // down from seal to seal, stopping short of each as an engraver's line
  // stops at a seal, passing from one zone's colour into the next's; under
  // the deepest it goes on, dotted, through empty seals, the dull impression
  // the descent leaves for a zone not reached (lib/descentPlate), each at the
  // depth its zone starts, fading into the dark as they go: the zones ahead
  // as the fossils' card shows the fossils not found, as shapes still to
  // fill. Only the next is named, "uncharted": the zones ahead are a
  // surprise. Past five zones the middle ones wait behind a button, the
  // Mines kept at the top; folded, the descent is always six rows, sharing
  // the card beside the fossils (CodexDelve holds it to their height).
  //
  // Shown all, the descent is its seals at a glance, with nothing to scroll:
  // every zone reached and the next, as big as the card lets them be (beside
  // the fossils, all of them in its height; on a phone, where the card grows
  // down the page, as wide as it lets them), in rows that wind back and
  // forth, the thread running on through them and dotted into the empty
  // seals that close the last row. The line under them reads out the seal
  // pointed at, tapped or come to by the arrow keys, the deepest till then.
  // The seals shown go to their places among the rest, which come in one
  // after another down the descent.
  import { hollow, ring, wear } from '../../lib/arcane';
  import { accentAt, stratumName } from '../../lib/descent';
  import { seedOf } from '../zonecard/family';

  /** The zones shown before the rest are asked for: all of them up to this many, else the Mines and the deepest three under a gap. */
  const SHOWN = 5;
  const DEEPEST = 3;

  /** Rows to a folded descent: the zones and the empty seals under them. */
  const ROWS = 6;
  /** Each empty seal a step further into the dark than the one before it. */
  const DIM = 0.7;

  /** An empty seal: the title card's two rings (zonecard/ZoneSeal), each worn its own way, round the hollow's shading. */
  const HOLLOW = hollow([0, 0], 10.7, 1.5);
  const INNER = ring([0, 0], 11.4);
  const empties = new Map<number, string>();
  // (The name's hash folded into the wear's generator's range, as ZoneSeal folds its own.)
  const emptyRing = (k: number) =>
    empties.get(k) ?? empties.set(k, ring([0, 0], 12.6, { wear: wear(((seedOf(`uncharted ${k}`) >>> 0) % 2147483646) + 1) })).get(k)!;

  /** A seal's play: nothing. Held still, the title card's seal shows whole from the start. */
  const still = () => new Animation();

  /** At a glance: the room between two seals, as a share of a seal; the seals no bigger than BIGGEST px, and where the card grows about ABOUT px. */
  const GAP = 0.45;
  const BIGGEST = 80;
  const ABOUT = 48;
  /** The line under them (rem): its height, its rule and room in, and the room over it. */
  const READ = 3.3;
  const OVER = 0.7;

  /**
   * How many seals to a row, and how big, for n of them in w by h. Held to a
   * height, as big as they go, then (of two near enough as big) the fewer
   * empty places in the last row, then the fewer rows; where the card grows
   * (h unbounded), about ABOUT big across the width.
   */
  function fit(n: number, w: number, h: number): { c: number; s: number } {
    if (!(h < Infinity)) {
      const c = Math.max(1, Math.min(n, Math.round((w + GAP * ABOUT) / (ABOUT * (1 + GAP)))));
      return { c, s: Math.min(BIGGEST, w / (c + (c - 1) * GAP)) };
    }
    let best = { c: 1, s: -1, spare: Infinity };
    for (let c = 1; c <= n; c++) {
      const rows = Math.ceil(n / c);
      const s = Math.min(BIGGEST, w / (c + (c - 1) * GAP), h / (rows + (rows - 1) * GAP));
      const spare = c * rows - n;
      if (s > best.s + 0.5 || (s > best.s - 0.5 && (spare < best.spare || (spare === best.spare && c > best.c)))) best = { c, s, spare };
    }
    return { c: best.c, s: Math.max(0, best.s) };
  }

  /**
   * The opening: the seals shown going to their places, setting off slowly
   * enough to be seen going and coming to rest softly; the rest each fading
   * in, the next no sooner than NEXT ms after (sooner with many, all of them
   * in by the time the seals have landed).
   */
  const MOVE = 450;
  const EASING = 'cubic-bezier(0.5, 0, 0.3, 1)';
  const FADE = 260;
  const NEXT = 40;
</script>

<script lang="ts">
  import { tick } from 'svelte';
  import { motion } from '../../lib/motion.svelte';
  import { backdropShadow } from '../../lib/backdropShadow';
  import { overPage } from '../../lib/fx/core';
  import { shownDepth } from '../../lib/delve';
  import { zone, type ZoneProgress, type ZoneReached } from '../../lib/codexStats';
  import ZoneSeal from '../zonecard/ZoneSeal.svelte';

  let { zones }: { zones: ZoneProgress } = $props();

  const date = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const word = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);
  /** Each zone's colour. */
  const inkOf = (z: ZoneReached) => accentAt(z.depth);

  // ---- folded: the descent as a list ----

  /** A zone reached, the button over the ones between, or an empty seal (the `i`th, from the next zone down). */
  type Row = { z: ZoneReached } | { gap: number } | { ahead: number; i: number };
  const rows: Row[] = $derived.by(() => {
    const r = zones.reached;
    const shown: Row[] = r.length <= SHOWN ? r.map((z) => ({ z })) : [{ z: r[0] }, { gap: r.length - 1 - DEEPEST }, ...r.slice(-DEEPEST).map((z) => ({ z }))];
    const next = zones.next;
    if (!next) return shown;
    const ahead = Math.max(1, ROWS - shown.length);
    for (let i = 0; i < ahead && zone(next.k + i).k === next.k + i; i++) shown.push({ ahead: next.k + i, i });
    return shown;
  });
  const keyOf = (row: Row) => ('z' in row ? row.z.k : 'gap' in row ? 'gap' : `a${row.ahead}`);
  /** The colour the next row's thread passes into. */
  const nextInk = (i: number) => {
    const next = rows[i + 1];
    return next && 'z' in next ? inkOf(next.z) : null;
  };
  /** What a row's thread passes into: a zone shown, or (dotted) zones not shown or not reached. */
  const into = (i: number) => {
    const next = rows[i + 1];
    return !next ? null : 'z' in next ? 'zone' : 'gap' in next ? 'gap' : 'ahead';
  };

  // ---- shown all: the seals at a glance ----

  let all = $state(false);
  /** A zone reached (`z`), the next (`z` null), or the `dim`th empty seal after it, closing the last row. */
  type Cell = { k: number; z: ZoneReached | null; dim: number };
  /** The seals to read: every zone reached, then the next if there's one. */
  const cells: Cell[] = $derived([...zones.reached.map((z) => ({ k: z.k, z, dim: 0 })), ...(zones.next ? [{ k: zones.next.k, z: null, dim: 0 }] : [])]);
  const depthOf = (c: Cell) => shownDepth(c.z ? c.z.depth : zone(c.k).depth);
  const label = (c: Cell) => (c.z ? `${c.z.name}, from depth ${depthOf(c)}, reached ${date(c.z.at)}` : `Uncharted, the next zone, from depth ${depthOf(c)}`);

  let panel = $state<HTMLElement>();
  let descent = $state<HTMLElement>();
  /** The room the descent has: its width, and its height where the card is held to one (beside the fossils, CodexDelve contains its size) rather than growing. */
  let room = $state({ w: 0, h: Infinity, rem: 16 });
  $effect(() => {
    const el = descent;
    const card = panel;
    if (!el || !card) return;
    // (Measured the frame after: the seals sized to it set the height of a card that grows, which the observer would otherwise be told of in the same frame and give up on.)
    let frame = 0;
    const measure = () => {
      const w = el.clientWidth;
      const h = getComputedStyle(card).contain.includes('size') ? el.clientHeight : Infinity;
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      if (w !== room.w || h !== room.h || rem !== room.rem) room = { w, h, rem };
    };
    const seen = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
    seen.observe(el);
    return () => {
      seen.disconnect();
      cancelAnimationFrame(frame);
    };
  });
  const held = $derived(room.h < Infinity);
  const layout = $derived(fit(cells.length, room.w, room.h - (READ + OVER) * room.rem));
  /** The seals, and as many empty ones after the next as close its row. */
  const items: Cell[] = $derived.by(() => {
    const next = zones.next;
    const out = [...cells];
    if (!next) return out;
    const spare = layout.c * Math.ceil(cells.length / layout.c) - cells.length;
    for (let i = 1; i <= spare && zone(next.k + i).k === next.k + i; i++) out.push({ k: next.k + i, z: null, dim: i });
    return out;
  });
  /** The `i`th seal's row and column, its rows winding back and forth, and which way its thread runs on: right, left, or down at a row's end. */
  const place = (i: number) => {
    const c = layout.c;
    const row = Math.floor(i / c);
    const at = i % c;
    const back = row % 2 === 1;
    return { row: row + 1, col: (back ? c - 1 - at : at) + 1, way: i === items.length - 1 ? '' : at === c - 1 ? 'down' : back ? 'left' : 'right' };
  };
  /** The seal at a row and column (from 1), if there's one to read there. */
  const cellAt = (row: number, col: number) => {
    const c = layout.c;
    if (row < 1 || col < 1 || col > c) return null;
    const i = (row - 1) * c + ((row - 1) % 2 ? c - col : col - 1);
    return i < cells.length ? i : null;
  };

  /** The seal read out under them: the one last pointed at, tapped or come to, else the deepest reached. */
  let pick = $state<number | null>(null);
  const picked = $derived(Math.min(pick ?? zones.reached.length - 1, cells.length - 1));

  /** The arrow keys go from seal to seal as they lie, Home and End to the descent's ends. */
  async function go(e: KeyboardEvent, i: number) {
    const { row, col } = place(i);
    const to = (
      {
        ArrowRight: () => cellAt(row, col + 1),
        ArrowLeft: () => cellAt(row, col - 1),
        ArrowDown: () => cellAt(row + 1, col),
        ArrowUp: () => cellAt(row - 1, col),
        Home: () => 0,
        End: () => cells.length - 1,
      } as Record<string, () => number | null>
    )[e.key];
    if (!to) return;
    e.preventDefault();
    const at = to();
    if (at === null) return;
    pick = at;
    await tick();
    descent?.querySelector<HTMLElement>(`.glance [data-k="${cells[at].k}"] button`)?.focus();
  }

  /** All the zones shown: the list opens into the seals at a glance. */
  async function showAll() {
    const el = descent;
    if (!el) return;
    const was = new Map<number, DOMRect>();
    for (const li of el.querySelectorAll<HTMLElement>('.list [data-k]')) was.set(Number(li.dataset.k), li.querySelector('.mark')!.getBoundingClientRect());
    const height = el.offsetHeight;
    const focused = el.contains(document.activeElement);
    all = true;
    await tick();
    // (Its button gone, the keys go on from the deepest.)
    if (focused) el.querySelector<HTMLElement>('.glance .pick button')?.focus({ preventScroll: true });
    if (motion.still) return;
    // Where the card grows (a phone's), it eases to the seals' height, showing them as it comes to them.
    const now = el.offsetHeight;
    if (Math.abs(now - height) > 0.5) {
      el.style.overflowY = 'clip';
      el.animate({ height: [`${height}px`, `${now}px`] }, { duration: MOVE, easing: EASING }).finished.then(
        () => el.style.removeProperty('overflow-y'),
        () => {},
      );
    }
    // The seals shown go to their places, their threads and ring drawn once they're there; the rest come in one after another down the descent.
    const seals = [...el.querySelectorAll<HTMLElement>('.glance > li')];
    const step = Math.min(NEXT, (MOVE * 0.8) / Math.max(1, seals.length - was.size));
    let n = 0;
    for (const li of seals) {
      const then = was.get(Number(li.dataset.k));
      if (!then) {
        li.animate({ opacity: [0, Number(li.style.opacity || 1)] }, { duration: FADE, delay: n++ * step, easing: 'ease-out', fill: 'backwards' });
        continue;
      }
      const at = li.getBoundingClientRect();
      li.animate({ transform: [`translate(${then.left - at.left}px, ${then.top - at.top}px) scale(${then.width / at.width})`, 'none'] }, { duration: MOVE, easing: EASING });
      for (const pseudoElement of ['::before', '::after']) {
        const to = Number(getComputedStyle(li, pseudoElement).opacity);
        li.animate({ opacity: [0, to] }, { pseudoElement, duration: FADE, delay: MOVE * 0.8, easing: 'ease-out', fill: 'backwards' });
      }
    }
    el.querySelector('.read')?.animate({ opacity: [0, 1] }, { duration: FADE, delay: MOVE / 2, easing: 'ease-out', fill: 'backwards' });
  }
</script>

{#snippet empty(k: number)}
  <svg viewBox="-14 -14 28 28">
    <path class="shade" d={HOLLOW} />
    <path d={emptyRing(k)} />
    <path class="thin" d={INNER} />
  </svg>
{/snippet}

<section class="panel zones" class:open={all} bind:this={panel} use:backdropShadow={{ fill: 'linear' }} aria-labelledby="zone-h">
  <header><h2 id="zone-h">Zones reached</h2>{#if zones.biomes}<span class="col-label">{zones.biomes} {word(zones.biomes, 'biome')}</span>{/if}</header>
  {#if zones.reached.length}
    <div class="descent" class:glancing={all} class:grows={!held} style:--read="{READ}rem" style:--over="{OVER}rem" bind:this={descent}>
      {#if !all}
        <div class="cols" aria-hidden="true"><span class="from">From depth</span><span class="first">Reached</span></div>
        <ol class="list" style:--rows={rows.length}>
          {#each rows as row, i (keyOf(row))}
            {#if 'z' in row}
              <li
                class="zone"
                class:to-gap={into(i) === 'gap'}
                class:to-ahead={into(i) === 'ahead'}
                class:last={!into(i)}
                data-k={row.z.k}
                style:--accent={inkOf(row.z)}
                style:--accent-next={nextInk(i) ?? 'var(--dull)'}
              >
                <span class="mark">
                  <ZoneSeal sigil={stratumName(row.z.k)} play={still} still seed={seedOf(stratumName(row.z.k))} />
                </span>
                <span class="name">{row.z.name}</span>
                <span class="depth n"><span class="sr-only">from depth</span> {shownDepth(row.z.depth)}</span>
                <span class="when n"><span class="when-word">reached</span> {date(row.z.at)}</span>
              </li>
            {:else if 'gap' in row}
              <li class="gap">
                <span class="mark" aria-hidden="true"></span>
                <button class="more" onclick={showAll}>Show all {zones.reached.length} zones</button>
              </li>
            {:else}
              <!-- The next zone named, the rest only shapes in the dark. -->
              <li
                class="ahead"
                class:last={!into(i)}
                data-k={row.ahead}
                aria-hidden={row.i ? 'true' : undefined}
                data-dim={row.i ? '' : undefined}
                style:opacity={row.i ? DIM ** row.i : undefined}
              >
                <span class="mark" aria-hidden="true">{@render empty(row.ahead)}</span>
                {#if !row.i}<span class="name">uncharted<span class="sr-only">: the next zone, not reached yet</span></span>{/if}
                <span class="depth n"><span class="sr-only">from depth</span> {shownDepth(zone(row.ahead).depth)}</span>
              </li>
            {/if}
          {/each}
        </ol>
      {:else}
        {@const read = cells[picked]}
        <ol class="glance" style:--c={layout.c} style:--s="{layout.s}px" style:--g="{layout.s * GAP}px">
          {#each items as cell, i (cell.k)}
            {@const at = place(i)}
            {@const next = items[i + 1]}
            <li
              class={at.way}
              class:pick={i === picked}
              class:ahead={!cell.z}
              class:to-ahead={!!next && !next.z}
              data-k={cell.k}
              aria-hidden={cell.dim ? 'true' : undefined}
              style:grid-row={at.row}
              style:grid-column={at.col}
              style:opacity={cell.dim ? DIM ** cell.dim : undefined}
              style:--accent={cell.z ? inkOf(cell.z) : 'var(--dull)'}
              style:--accent-next={next?.z ? inkOf(next.z) : 'var(--dull)'}
            >
              {#if cell.dim}
                <span class="seat">{@render empty(cell.k)}</span>
              {:else}
                <button
                  class="seat"
                  tabindex={i === picked ? 0 : -1}
                  aria-label={label(cell)}
                  onpointerenter={(e) => {
                    if (e.pointerType === 'mouse') pick = i;
                  }}
                  onfocus={() => (pick = i)}
                  onclick={() => (pick = i)}
                  onkeydown={(e) => go(e, i)}
                >
                  {#if cell.z}
                    <ZoneSeal sigil={stratumName(cell.k)} play={still} still seed={seedOf(stratumName(cell.k))} />
                  {:else}
                    {@render empty(cell.k)}
                  {/if}
                </button>
              {/if}
            </li>
          {/each}
        </ol>
        <!-- (Pinned over the seals where the card grows, it hides the game's light behind it.) -->
        <p class="read" aria-hidden="true" use:overPage={!held}>
          <span class="read-name" class:dull={!read.z}>{read.z ? read.z.name : 'uncharted'}</span>
          <span class="read-at"
            ><span class="word">from depth</span> <b class="n">{depthOf(read)}</b>{#if read.z}<span class="sep">•</span><span class="word">reached</span>
              <span class="n day">{date(read.z.at)}</span>{/if}</span
          >
        </p>
      {/if}
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
    --pad-x: 1.3rem;
    padding: 1.2rem var(--pad-x) 1.3rem;
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
    flex: 1 1 auto;
    display: grid;
    /* (The day's column wide enough for any English date, and wider for all of them where a language writes one longer.) */
    grid-template-columns: var(--seal) minmax(0, 1fr) minmax(2.2rem, auto) minmax(6.2rem, auto);
    grid-template-rows: auto minmax(0, 1fr);
    column-gap: 0.8rem;
  }
  .cols,
  .list {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: subgrid;
  }
  /* The columns' names, as the run log's table names its own, quieter: labels. */
  .cols {
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
  /* The rows share the card beside the fossils, each at least a row's height. */
  .list {
    grid-template-rows: repeat(var(--rows), minmax(var(--row), 1fr));
    margin: 0;
    padding: 0.5rem 0;
    list-style: none;
  }
  .list li,
  .glance li {
    --ink: color-mix(in srgb, var(--accent) 55%, var(--gold));
    --ink-hi: color-mix(in srgb, var(--accent) 45%, var(--gold-hi));
    --glow-c: color-mix(in srgb, var(--accent) 65%, #d9a45a);
    position: relative;
  }
  .list li {
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
   * less a seal and the clearance at each end.
   */
  .list li:not(.last)::after {
    content: '';
    position: absolute;
    left: calc(var(--seal) / 2 - 0.5px);
    top: calc(50% + var(--seal) / 2 + var(--clear));
    width: 1px;
    height: calc(100% - var(--seal) - 2 * var(--clear));
    background: linear-gradient(color-mix(in srgb, var(--accent) 40%, var(--gold-lo)), color-mix(in srgb, var(--accent-next) 40%, var(--gold-lo)));
    opacity: 0.85;
  }
  /* Dotted where it passes zones not shown, and on into the ones not reached. */
  .list li.to-gap::after,
  .list li.gap::after,
  .list li.to-ahead::after,
  .list li.ahead::after {
    background: repeating-linear-gradient(color-mix(in srgb, var(--accent, var(--dull)) 40%, var(--gold-lo)) 0 1.5px, transparent 1.5px 4.5px);
  }
  .list li.gap::after,
  .list li.ahead::after {
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
  /* (Clear of the depths, however long a language's date.) */
  .when,
  .cols .first {
    padding-left: 0.8rem;
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

  /* The zones ahead: empty, dull impressions, at the depths they start. */
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
    font-style: italic;
    color: var(--muted);
  }
  .ahead .depth {
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

  /*
   * At a glance: the seals in rows a seal and a gap apart, the line reading
   * one out under them. Beside the fossils they take what height the card
   * has, centred in it; where the card grows they set its height.
   */
  .descent.glancing {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .glance {
    --seal: var(--s);
    --clear: calc(var(--s) * 0.1);
    flex: 1 1 auto;
    min-height: 0;
    display: grid;
    grid-template-columns: repeat(var(--c), var(--s));
    grid-auto-rows: var(--s);
    gap: var(--g);
    place-content: center;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .grows .glance {
    flex: none;
    align-content: start;
    padding-top: 0.5rem;
  }
  .glance li {
    --from: color-mix(in srgb, var(--accent) 40%, var(--gold-lo));
    --to: color-mix(in srgb, var(--accent-next) 40%, var(--gold-lo));
    transform-origin: 0 0;
  }
  .seat {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: none;
  }
  button.seat {
    cursor: pointer;
  }
  /* (Focus shows as the ring round the seal read out, as it moves with the keys.) */
  button.seat:focus-visible {
    outline: none;
  }
  /* The empty seals' lines as fine as the title card's seals' at any size. */
  .glance .ahead path {
    vector-effect: non-scaling-stroke;
    stroke-width: 0.8px;
  }
  .glance .ahead path.thin {
    stroke-width: 0.55px;
  }
  .glance .ahead path.shade {
    stroke-width: 0.45px;
  }
  /* The thread on to the next seal, across the gap, stopping short at both ends. */
  .glance li.right::after,
  .glance li.left::after,
  .glance li.down::after {
    content: '';
    position: absolute;
    opacity: 0.85;
    pointer-events: none;
  }
  .glance li.right::after,
  .glance li.left::after {
    top: calc(50% - 0.5px);
    width: calc(var(--g) - 2 * var(--clear));
    height: 1px;
  }
  .glance li.right::after {
    left: calc(100% + var(--clear));
    background: linear-gradient(to right, var(--from), var(--to));
  }
  .glance li.left::after {
    right: calc(100% + var(--clear));
    background: linear-gradient(to left, var(--from), var(--to));
  }
  .glance li.down::after {
    top: calc(100% + var(--clear));
    left: calc(50% - 0.5px);
    width: 1px;
    height: calc(var(--g) - 2 * var(--clear));
    background: linear-gradient(var(--from), var(--to));
  }
  /* Dotted on into the zones not reached. */
  .glance li.to-ahead.right::after,
  .glance li.ahead.right::after {
    background: repeating-linear-gradient(to right, var(--from) 0 1.5px, transparent 1.5px 4.5px);
  }
  .glance li.to-ahead.left::after,
  .glance li.ahead.left::after {
    background: repeating-linear-gradient(to left, var(--from) 0 1.5px, transparent 1.5px 4.5px);
  }
  .glance li.to-ahead.down::after,
  .glance li.ahead.down::after {
    background: repeating-linear-gradient(var(--from) 0 1.5px, transparent 1.5px 4.5px);
  }
  /* The seal read out, ringed in its own colour; brighter where the keys brought it. */
  .glance li.pick::before {
    content: '';
    position: absolute;
    inset: calc(var(--s) * -0.06);
    border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--gold-hi));
    border-radius: 50%;
    opacity: 0.6;
    pointer-events: none;
  }
  .glance li.pick:has(:focus-visible)::before {
    opacity: 1;
  }

  .read {
    flex: none;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 0.15rem;
    box-sizing: border-box;
    height: var(--read);
    min-width: 0;
    margin: var(--over) 0 0;
    padding-top: 0.45rem;
    border-top: 1px solid var(--line);
  }
  /*
   * Where the card grows (a phone's) and runs on past the screen, the line
   * stays at the screen's foot while the seals go by under it, so a seal
   * tapped near the top is read out in sight: across the panel, in the
   * panel's own colour at its foot, its rule as wide as the header's.
   */
  .grows .read {
    position: sticky;
    bottom: 0;
    z-index: 1;
    height: auto;
    margin-inline: calc(-1 * var(--pad-x));
    padding: 0.55rem var(--pad-x) 0.6rem;
    border-top: 0;
    background:
      linear-gradient(var(--line), var(--line)) var(--pad-x) 0 / calc(100% - 2 * var(--pad-x)) 1px no-repeat,
      rgb(16, 13, 10);
  }
  .read-name,
  .read-at {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .read-name {
    font-size: 0.98rem;
    line-height: 1.2;
  }
  .read-name.dull {
    font-style: italic;
    color: var(--muted);
  }
  .read-at {
    font-size: 0.78rem;
    line-height: 1.3;
  }
  .read-at .word {
    font-style: italic;
    color: var(--muted);
  }
  .read-at b {
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--gold-hi);
  }
  .read-at .sep {
    margin: 0 0.5em;
    color: var(--muted);
  }
  .read-at .day {
    font-size: 0.75rem;
    color: var(--muted);
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
      padding-left: 0;
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
      --pad-x: 1rem;
      padding: 1rem var(--pad-x) 1.1rem;
    }
    .descent {
      --seal: 2.2rem;
      --row: 3.3rem;
    }
  }
</style>
