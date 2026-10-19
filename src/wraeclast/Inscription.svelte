<script lang="ts">
  // The Inscription, as the design draws it: the answer line (tap a placed
  // tile to take it back; a locked first tile stays), Clear at its end, and
  // the word lengths on a tab along its top once shown, a dot per tile, lit as
  // the line fills; under it the board, every tile of the pool once, each
  // keeping its best mark from wrong submits: gold (right place), silver (in
  // the name elsewhere), struck (not in it, greyed where it lies). A wrong
  // line stays marked until the next change starts a fresh one. No counts.
  import { lengthsOf, markOf, type Run } from './rules';
  import Glyph from './Glyph.svelte';

  let { run }: { run: Run } = $props();
  const s = $derived(run.state);
  const it = $derived(s.item!);
  const open = $derived(it.openedAt !== null && s.phase === 'item');
  const named = $derived(s.phase === 'solved');
  const marks = $derived(it.lineMarks);
  /** The name's words as dots, each dot lit once a tile stands in its place. */
  const words = $derived.by(() => {
    let k = 0;
    return lengthsOf(it).map((n) => Array.from({ length: n }, () => k++));
  });
  const dense = $derived(it.tiles.length > 26);
</script>

<div class="ins">
  <div class="line" class:has={it.build.length > 0} class:bad={!!marks} class:good={named} role="group" aria-label="Your inscription">
    {#if it.shown.lengths}
      <span class="lengths" role="img" aria-label="Tiles per word: {lengthsOf(it).join(' · ')}">
        <span class="cap2">Tiles per word</span>
        {#each words as w, j (j)}<span class="w">{#each w as k (k)}<i class:on={k < it.build.length}></i>{/each}</span>{/each}
      </span>
    {/if}
    <div class="placed">
      {#if it.build.length}
        {#each it.build as tile, i (i)}
          {@const lock = i < it.locked}
          {@const m = marks?.[i]}
          <button
            class="tile {m ?? ''}"
            class:locked={lock}
            disabled={lock || !open}
            onclick={() => run.unplace(i)}
            aria-label={lock ? `${tile}, locked` : m && m !== 'none' ? `${tile}, ${m}: take it back` : `Take back ${tile}`}>{tile}</button
          >
        {/each}
        {#if open && !marks}<span class="caret" aria-hidden="true"></span>{/if}
      {:else}
        <span class="ph">{open ? 'Tap the tiles in order' : 'The item is opening'}</span>
      {/if}
    </div>
    {#if !named}
      <button class="clear" aria-label="Clear the line" title="Clear" disabled={!open || it.build.length <= it.locked} onclick={() => run.clear()}><Glyph of="clear" /></button>
    {/if}
  </div>

  <div class="board" class:dense role="group" aria-label="The tiles">
    {#each it.tiles as tile (tile)}
      {@const m = markOf(it, tile)}
      <button class="tile {m ?? ''}" disabled={!open || m === 'struck'} onclick={() => run.place(tile)} aria-label={m ? `${tile}, ${m}` : tile}>{tile}</button>
    {/each}
  </div>
</div>

<style>
  .ins {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  /* The answer line: the answers' own dark row, a fine line. */
  .line {
    position: relative;
    display: flex;
    align-items: center;
    gap: 4px;
    min-height: 50px;
    padding: 6px 6px 6px 7px;
    background: linear-gradient(90deg, rgba(20, 16, 12, 0.95), rgba(12, 10, 8, 0.95));
    border: 1px solid var(--line);
    border-radius: 4px;
    box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.6);
  }
  .line.has {
    border-color: var(--gold-lo);
  }
  .line.bad {
    border-color: #8e4434;
    box-shadow:
      inset 0 2px 6px rgba(0, 0, 0, 0.6),
      0 0 14px rgba(200, 90, 60, 0.12);
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
    gap: 3px;
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
    margin-left: 2px;
    background: var(--gold-hi);
    box-shadow: 0 0 6px var(--gold-hi);
  }
  /* Clear: the header's round button. */
  .clear {
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
  .clear:hover:not(:disabled) {
    color: var(--gold-hi);
    border-color: var(--gold-lo);
  }
  .clear:disabled {
    opacity: 0.35;
    cursor: default;
  }

  /* Word lengths: a tab on the line's top edge, a dot per tile, grouped by word. */
  .lengths {
    position: absolute;
    right: 50px;
    top: -9px;
    display: flex;
    align-items: center;
    gap: 5px;
    height: 17px;
    padding: 0 8px;
    border: 1px solid var(--gold-lo);
    border-radius: 999px;
    background: #0c0a08;
  }
  .cap2 {
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 8.5px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
    margin-right: 2px;
    white-space: nowrap;
  }
  .w {
    display: flex;
    gap: 2px;
    padding: 2px 3px;
    border-radius: 3px;
    background: rgba(241, 217, 155, 0.08);
  }
  .w i {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--gold-hi);
    box-shadow: 0 0 4px rgba(241, 217, 155, 0.6);
  }
  .w i.on {
    background: #a9cf8f;
    box-shadow: 0 0 4px rgba(150, 190, 110, 0.7);
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
  /* On the line: lit as a chosen answer, the hot line along its top. */
  .placed .tile {
    height: 36px;
    color: #fff1cf;
    background: linear-gradient(90deg, rgba(70, 52, 30, 0.95), rgba(36, 27, 17, 0.95));
    border-color: var(--gold);
    box-shadow: inset 0 0 0 1px rgba(241, 217, 155, 0.12);
  }
  .placed .tile::after {
    content: '';
    position: absolute;
    top: -1px;
    left: 12%;
    right: 12%;
    height: 1px;
    background: linear-gradient(90deg, transparent, #fff1cf, transparent);
  }
  .line.good .tile {
    color: #d6e8c0;
    border-color: #5d8a50;
    background: linear-gradient(90deg, rgba(44, 64, 36, 0.9), rgba(22, 28, 17, 0.92));
  }
  .line.bad .tile::after,
  .line.good .tile::after {
    display: none;
  }
  /* A locked first tile (the First syllable supply): set in, not taken back. */
  .placed .tile.locked {
    padding-left: 20px;
    border-color: var(--gold-lo);
    color: var(--gold-hi);
  }
  .placed .tile.locked::before {
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
  .placed .tile.locked::after {
    display: none;
  }

  /* The marks, Wordle's: gold the right tile in the right place, silver one
     the name holds elsewhere, struck one it doesn't hold. */
  .tile.gold {
    color: #fff1cf;
    border-color: #e2b94f;
    background: linear-gradient(180deg, rgba(120, 88, 28, 0.95), rgba(58, 40, 12, 0.95));
    box-shadow:
      inset 0 0 0 1px rgba(255, 230, 160, 0.3),
      0 0 10px rgba(226, 185, 79, 0.35);
  }
  .tile.silver {
    color: #eef2f6;
    border-color: #a9b6c4;
    background: linear-gradient(180deg, rgba(78, 86, 96, 0.95), rgba(34, 38, 44, 0.95));
    box-shadow:
      inset 0 0 0 1px rgba(220, 230, 240, 0.18),
      0 0 8px rgba(169, 182, 196, 0.25);
  }
  .tile.struck {
    opacity: 0.35;
    filter: saturate(0.5);
    text-decoration: line-through;
    text-decoration-thickness: 1px;
  }
  .placed .tile.struck {
    opacity: 0.6;
    color: #eab3a3;
    border-color: #8e4434;
    background: linear-gradient(90deg, rgba(78, 32, 22, 0.9), rgba(34, 15, 11, 0.92));
  }
  .placed .tile.none {
    color: #eab3a3;
    border-color: #8e4434;
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
    .placed .tile {
      height: 42px;
      padding: 0 11px;
      font-size: 17.5px;
    }
  }
</style>
