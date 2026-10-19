<script lang="ts">
  // The answer line and the tiles, as the v4 design draws them. The line is
  // fused: the tiles of a word stand in one plaque with faint seams, and a
  // word break (the break key at the line's end) is a notch of its own, tapped
  // to remove it. Tap a placed tile to take it back (a first tile placed for
  // you stays); Clear empties the line. Once shown, the word lengths sit on a
  // tab above the line, a dot per tile, grouped by word, lit as the line fills.
  // Under the line, after a miss, each tile on it keeps its own mark (gold,
  // silver, struck) until the next change starts a fresh line, and the key to
  // the marks shows on a run's first items with marks. Under that, the tiles,
  // each distinct tile once (a tile can be placed again), each keeping its
  // best mark; one not in the name is struck where it lies. No counts.
  import { GAP, lengthsOf, markOf, type ItemLog, type LineMark, type Run } from './rules';
  import Glyph from './Glyph.svelte';
  import { MARK_KEY, MARK_KEY_ITEMS, MARK_SAYS, lengthsSaid } from './words';

  let { run }: { run: Run } = $props();
  const s = $derived(run.state);
  const it = $derived(s.item!);
  const open = $derived(it.openedAt !== null && s.phase === 'item');
  const named = $derived(s.phase === 'solved');
  const marks = $derived(it.lineMarks);
  const has = $derived(it.build.length > 0);

  type Seg = { tile: string; i: number; mark: LineMark | null; locked: boolean };
  /** The line as the player sees it: words (runs of tiles) and the breaks between them, each break by its place on the line. */
  const parts = $derived.by(() => {
    const out: ({ gap: false; segs: Seg[] } | { gap: true; i: number })[] = [];
    it.build.forEach((tile, i) => {
      if (tile === GAP) {
        out.push({ gap: true, i });
        return;
      }
      const last = out.at(-1);
      const seg = { tile, i, mark: marks?.[i] ?? null, locked: i < it.locked };
      if (last && !last.gap) last.segs.push(seg);
      else out.push({ gap: false, segs: [seg] });
    });
    return out;
  });
  const lengths = $derived(lengthsOf(it));
  /**
   * The word lengths' dots, lit as the line fills: in order while the line
   * has no breaks, else word by word (the line's 2nd word lights the name's 2nd).
   */
  const dots = $derived.by(() => {
    const runs = parts.flatMap((p) => (p.gap ? [] : [p.segs.length]));
    const broken = parts.some((p) => p.gap);
    let k = 0;
    const placed = runs.reduce((a, b) => a + b, 0);
    return lengths.map((n, j) => Array.from({ length: n }, (_, d) => (broken ? (runs[j] ?? 0) > d : k++ < placed)));
  });
  /** A break goes after a tile, never two together, never on a marked line. */
  const canBreak = $derived(open && !marks && has && it.build.at(-1) !== GAP);
  /** The marks' key: while this item shows marks, on the run's first few items that had them. */
  const marked = (l: ItemLog) => l.misses > 0 || l.supplies.some((u) => u.type === 'decoy' || u.type === 'first');
  const legend = $derived(!named && Object.keys(it.marks).length > 0 && s.log.items.filter((l) => l !== it.log && marked(l)).length < MARK_KEY_ITEMS);
  const dense = $derived(it.tiles.length > 26);

  function segLabel(g: Seg) {
    if (g.locked) return `${g.tile}, placed for you`;
    if (g.mark && g.mark !== 'none') return `${g.tile}: ${MARK_SAYS[g.mark]}. Tap to take it back`;
    return `Take back ${g.tile}`;
  }
</script>

{#snippet notch()}
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 10v5.2h15V10" /></svg>
{/snippet}

<div class="ins">
  <div class="line" class:has class:marked={!!marks} class:good={named} role="group" aria-label="The answer line">
    {#if it.shown.lengths}
      <span class="lengths" role="img" aria-label={lengthsSaid(lengths)}>
        <span class="cap2">Tiles per word</span>
        {#each dots as w, j (j)}<span class="w">{#each w as on, d (d)}<i class:on></i>{/each}</span>{/each}
      </span>
    {/if}
    <div class="placed">
      {#if has}
        {#each parts as p, k (k)}
          {#if p.gap}
            <button class="gap" disabled={!open} onclick={() => run.unplace(p.i)} aria-label="Remove this break">{@render notch()}</button>
          {:else}
            <span class="fw">
              {#each p.segs as g (g.i)}
                <button class="seg {g.mark ?? ''}" class:locked={g.locked} disabled={g.locked || !open} onclick={() => run.unplace(g.i)} aria-label={segLabel(g)}><span>{g.tile}</span></button>
              {/each}
            </span>
          {/if}
        {/each}
        {#if open && !marks}<span class="caret" aria-hidden="true"></span>{/if}
      {:else}
        <span class="ph">{open ? "Tap tiles to spell the item's name" : 'Opening the item'}</span>
      {/if}
    </div>
    <button class="key brk" disabled={!canBreak} onclick={() => run.gap()} aria-label="Add a word break (optional)" title="Add a word break (optional)">{@render notch()}</button>
    {#if has && !named}
      <button class="key clear" aria-label="Clear the line" title="Clear" disabled={!open || it.build.length <= it.locked} onclick={() => run.clear()}><Glyph of="clear" /></button>
    {/if}
  </div>

  {#if legend}
    <div class="mkey" role="note" aria-label="What the marks mean">
      {#each MARK_KEY as m (m.mark)}<span class={m.mark}><i aria-hidden="true"></i><b>{m.name}:</b> {m.says}</span>{/each}
    </div>
  {/if}

  <div class="board" class:dense role="group" aria-label="The tiles">
    {#each it.tiles as tile (tile)}
      {@const m = markOf(it, tile)}
      <button class="tile {m ?? ''}" disabled={!open || m === 'struck'} onclick={() => run.place(tile)} aria-label={m ? `${tile}: ${MARK_SAYS[m]}` : tile}>{tile}</button>
    {/each}
  </div>
</div>

<style>
  .ins {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  /* The answer line: the answers' own dark row, a fine line. Room above it for the word lengths' tab, kept whether it shows or not. */
  .line {
    position: relative;
    display: flex;
    align-items: center;
    min-height: 50px;
    margin-top: 14px;
    padding: 6px 5px 6px 6px;
    background: linear-gradient(90deg, rgba(20, 16, 12, 0.95), rgba(12, 10, 8, 0.95));
    border: 1px solid var(--line);
    border-radius: 4px;
    box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.6);
  }
  .line.has {
    border-color: var(--gold-lo);
  }
  .line.marked {
    border-color: #6b3a2c;
  }
  .line.good {
    border-color: #5d8a50;
    box-shadow:
      inset 0 2px 6px rgba(0, 0, 0, 0.6),
      0 0 16px rgba(150, 190, 110, 0.14);
  }
  .placed {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    row-gap: 4px;
  }
  .ph {
    font-style: italic;
    font-size: 15px;
    color: #7a6e5c;
    padding-left: 4px;
  }
  .caret {
    width: 1px;
    height: 22px;
    margin-left: 3px;
    background: var(--gold-hi);
    box-shadow: 0 0 6px var(--gold-hi);
  }

  /* A word: one plaque, the tiles in it set apart by faint seams. */
  .fw {
    flex: none;
    display: inline-flex;
    height: 36px;
    border: 1px solid var(--gold);
    border-radius: 4px;
    background: linear-gradient(90deg, rgba(70, 52, 30, 0.95), rgba(36, 27, 17, 0.95));
    box-shadow: inset 0 0 0 1px rgba(241, 217, 155, 0.12);
    overflow: hidden;
  }
  .seg {
    position: relative;
    height: 100%;
    padding: 0 4px;
    display: inline-flex;
    align-items: center;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 16px;
    line-height: 1;
    white-space: nowrap;
    color: #fff1cf;
    background: none;
    border: 0;
    border-radius: 0;
    cursor: pointer;
  }
  .seg:first-child {
    padding-left: 8px;
  }
  .seg:last-child {
    padding-right: 8px;
  }
  .seg:hover:not(:disabled) {
    background: rgba(241, 217, 155, 0.1);
  }
  .seg:disabled {
    cursor: default;
  }
  /* The seam: a hairline set into the plaque, so the word still reads as one. */
  .seg + .seg::before {
    content: '';
    position: absolute;
    left: 0;
    top: 9px;
    bottom: 9px;
    width: 1px;
    background: rgba(241, 217, 155, 0.22);
  }
  /* After a miss each tile keeps its own mark, in the board's colours and shapes. */
  .seg.gold {
    color: #fff4d6;
    background: linear-gradient(180deg, rgba(110, 80, 34, 0.96), rgba(56, 40, 17, 0.96));
  }
  .seg.silver {
    color: #f4f8fc;
    background: linear-gradient(180deg, rgba(70, 76, 84, 0.96), rgba(34, 37, 42, 0.96));
  }
  .seg.struck {
    color: #c9b9a2;
    background: linear-gradient(180deg, rgba(48, 22, 16, 0.92), rgba(24, 12, 9, 0.92));
    text-decoration: line-through;
    text-decoration-color: rgba(224, 85, 63, 0.9);
    text-decoration-thickness: 1.5px;
  }
  .seg.struck > span {
    opacity: 0.6;
  }
  .seg.gold::after,
  .seg.silver::after {
    content: '';
    position: absolute;
    top: 4px;
    right: 3px;
    width: 4px;
    height: 4px;
  }
  .seg.gold::after {
    background: #f1d99b;
    rotate: 45deg;
    box-shadow: 0 0 4px rgba(241, 217, 155, 0.8);
  }
  .seg.silver::after {
    width: 3.5px;
    height: 3.5px;
    border: 1.1px solid #dfe6ee;
    border-radius: 50%;
  }
  .fw:has(.seg.gold),
  .fw:has(.seg.silver),
  .fw:has(.seg.struck) {
    border-color: #8a7348;
  }
  /* The first tile, placed for you (the First tile supply): a lock, not taken back. */
  .seg.locked {
    padding-left: 20px;
    color: #f1d99b;
  }
  .seg.locked:first-child::before {
    content: '';
    position: absolute;
    left: 6px;
    top: 50%;
    translate: 0 -50%;
    width: 10px;
    height: 10px;
    background: var(--gold);
    mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.2' stroke-linejoin='round'%3E%3Crect x='5' y='10.5' width='14' height='10' rx='1.5' fill='black'/%3E%3Cpath d='M8 10.5V7.5a4 4 0 0 1 8 0v3'/%3E%3C/svg%3E") center / contain no-repeat;
  }
  .line.good .fw {
    border-color: #5d8a50;
    background: linear-gradient(90deg, rgba(44, 64, 36, 0.9), rgba(22, 28, 17, 0.92));
  }
  .line.good .seg {
    color: #d6e8c0;
  }
  .line.good .seg.locked::before {
    background: #a9cf8f;
  }

  /* A word break: its own tap target, a cut notch between two plaques. */
  .gap {
    flex: none;
    width: 16px;
    height: 36px;
    display: grid;
    place-items: center;
    padding: 0;
    background: none;
    border: 0;
    color: var(--gold-lo);
    cursor: pointer;
  }
  .gap :global(svg) {
    width: 13px;
    height: 13px;
    translate: 0 6px;
  }
  .gap:hover:not(:disabled) {
    color: var(--gold-hi);
  }
  .gap:disabled {
    cursor: default;
  }

  /* The break key and Clear: the header's round buttons. */
  .key {
    flex: none;
    align-self: center;
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    padding: 8px;
    border-radius: 50%;
    border: 1px solid var(--line);
    background: rgba(0, 0, 0, 0.35);
    color: var(--muted);
    box-shadow: inset 0 1px 0 rgba(255, 220, 150, 0.06);
    cursor: pointer;
  }
  .key + .key {
    margin-left: 4px;
  }
  .key :global(svg) {
    width: 18px;
    height: 18px;
  }
  .key.brk {
    color: var(--gold);
  }
  .key:hover:not(:disabled) {
    color: var(--gold-hi);
    border-color: var(--gold-lo);
  }
  .key:disabled {
    opacity: 0.35;
    cursor: default;
  }

  /* Word lengths: a tab above the line, between two hairlines, a ring per tile, grouped by word, filled as the line fills. */
  .lengths {
    position: absolute;
    left: 50%;
    bottom: calc(100% + 4px);
    translate: -50% 0;
    display: flex;
    align-items: center;
    gap: 7px;
    height: 12px;
    white-space: nowrap;
  }
  .lengths::before,
  .lengths::after {
    content: '';
    flex: none;
    width: 22px;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--gold-lo));
  }
  .lengths::after {
    background: linear-gradient(270deg, transparent, var(--gold-lo));
  }
  .cap2 {
    margin-right: 1px;
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--gold) 70%, var(--muted));
  }
  .w {
    display: flex;
    gap: 2px;
    padding: 0 1px;
  }
  .w i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    border: 1.2px solid var(--gold-lo);
  }
  .w i.on {
    background: var(--gold-hi);
    border-color: var(--gold-hi);
    box-shadow: 0 0 4px rgba(241, 217, 155, 0.6);
  }

  /* The marks' key: a small swatch of each mark and what it means. No control. */
  .mkey {
    margin-top: -2px;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    column-gap: 12px;
    row-gap: 3px;
    font-size: 13px;
    line-height: 1.2;
    color: var(--muted);
  }
  .mkey span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    white-space: nowrap;
  }
  .mkey b {
    font-weight: 500;
    color: #e6dccb;
  }
  .mkey i {
    position: relative;
    flex: none;
    width: 14px;
    height: 14px;
    border: 1px solid;
    border-radius: 3px;
  }
  .mkey .gold i {
    border-color: #c9a45c;
    background: rgba(96, 70, 30, 0.96);
  }
  .mkey .gold i::after {
    content: '';
    position: absolute;
    inset: 4px;
    background: #f1d99b;
    rotate: 45deg;
  }
  .mkey .silver i {
    border-color: #9aa6b2;
    background: rgba(64, 70, 78, 0.96);
  }
  .mkey .silver i::after {
    content: '';
    position: absolute;
    inset: 3.5px;
    border: 1.1px solid #dfe6ee;
    border-radius: 50%;
  }
  .mkey .struck i {
    border-color: #6b3a2c;
    background: rgba(48, 22, 16, 0.92);
  }
  .mkey .struck i::after {
    content: '';
    position: absolute;
    left: 2px;
    right: 2px;
    top: 50%;
    height: 1.5px;
    background: rgba(224, 85, 63, 0.9);
  }

  /* A tile: the answers' material (QuestionView .option), the text in Maragsa. */
  .tile {
    position: relative;
    height: 40px;
    min-width: 34px;
    padding: 0 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 16px;
    line-height: 1;
    white-space: nowrap;
    color: #e9c8a2;
    background: linear-gradient(90deg, rgba(40, 31, 22, 0.95), rgba(20, 16, 12, 0.95));
    border: 1px solid var(--line);
    border-radius: 4px;
    box-shadow: inset 0 1px 0 rgba(255, 220, 150, 0.05);
    cursor: pointer;
  }
  .tile:hover:not(:disabled) {
    border-color: var(--gold);
    color: #fff1cf;
  }
  .tile:disabled {
    cursor: default;
  }
  /* The marks, Wordle's: gold the right tile in the right place (a diamond), silver one the name holds elsewhere (a ring), struck one it doesn't hold. */
  .tile.gold {
    color: #ffe9b0;
    border-color: #c9a45c;
    background: linear-gradient(180deg, rgba(96, 70, 30, 0.96), rgba(46, 33, 15, 0.96));
    box-shadow:
      inset 0 0 0 1px rgba(241, 217, 155, 0.22),
      0 0 10px rgba(241, 190, 90, 0.22);
  }
  .tile.silver {
    color: #eef3f8;
    border-color: #9aa6b2;
    background: linear-gradient(180deg, rgba(64, 70, 78, 0.96), rgba(30, 33, 38, 0.96));
    box-shadow: inset 0 0 0 1px rgba(220, 230, 240, 0.12);
  }
  .tile.gold::before,
  .tile.silver::before {
    content: '';
    position: absolute;
    top: 4px;
    right: 4px;
    width: 5px;
    height: 5px;
  }
  .tile.gold::before {
    background: #f1d99b;
    rotate: 45deg;
    box-shadow: 0 0 4px rgba(241, 217, 155, 0.8);
  }
  .tile.silver::before {
    width: 4px;
    height: 4px;
    border: 1.2px solid #dfe6ee;
    border-radius: 50%;
  }
  .tile.struck {
    opacity: 0.36;
    filter: saturate(0.4);
    text-decoration: line-through;
    text-decoration-color: rgba(224, 85, 63, 0.85);
    text-decoration-thickness: 1.5px;
  }

  .board {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    align-content: flex-start;
  }
  .board .tile {
    flex-grow: 1;
  }
  .board::after {
    content: '';
    flex-grow: 1000;
  }
  /* A crowded board (the boss): shorter tiles, still a fair thumb. */
  .board.dense {
    gap: 4px;
  }
  .board.dense .tile {
    height: 36px;
    padding: 0 7px;
  }
  @container item (min-width: 700px) {
    .board {
      gap: 7px;
    }
    .board .tile {
      height: 44px;
      font-size: 17.5px;
      padding: 0 12px;
    }
    .board.dense .tile {
      height: 40px;
      font-size: 16.5px;
      padding: 0 11px;
    }
    .line {
      min-height: 56px;
    }
    .fw {
      height: 42px;
    }
    .seg {
      font-size: 17.5px;
      padding: 0 5px;
    }
    .seg:first-child {
      padding-left: 11px;
    }
    .seg:last-child {
      padding-right: 11px;
    }
    .seg.locked {
      padding-left: 22px;
    }
    .gap {
      width: 20px;
      height: 42px;
    }
    .cap2 {
      font-size: 11px;
    }
  }
</style>
