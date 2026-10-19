<script lang="ts">
  // The Inscription: the answer line (tap a placed syllable to take it back;
  // a locked one stays), spaced by itself where a syllable starts a word in
  // any name on the board, with the word lengths beside it once shown; the
  // board's syllables (every name's, shuffled; tap one to place it, as often
  // as the name needs); what the last wrong submit cost (or why the build
  // can't be sent); and the names struck so far. Clear and Submit are the
  // item screen's (its dock).
  import { backdropShadow } from '../lib/backdropShadow';
  import { buildText, greyed, lengthsOf, remaining, startsWord, type Run } from './rules';

  let { run }: { run: Run } = $props();
  const s = $derived(run.state);
  const it = $derived(s.item!);
  const open = $derived(it.openedAt !== null && s.phase === 'item');
  const named = $derived(s.phase === 'solved');
  const spacing = $derived(s.tuning.spacing);
  const left = $derived(remaining(it).length);
  const struck = $derived(it.names.filter((nm) => it.struck.includes(nm.id)));
  const last = $derived(it.log.submits.at(-1));
  const missed = $derived(!!last && !last.right);
  /** Why the build can't be sent, unless it's the miss just shown. */
  const blocked = $derived.by(() => {
    const why = run.blocked();
    return why && !(missed && buildText(it, spacing) === last!.text) ? why : null;
  });
  /** Whether a word starts at placed syllable i: a gap goes before it. */
  const gapAt = (i: number) => spacing && i > 0 && startsWord(it, it.build[i]) && !it.build[i - 1].endsWith('-');
</script>

<section class="panel inscription" aria-labelledby="ins-h" use:backdropShadow={{ fill: 'linear' }}>
  <div class="top">
    <h2 id="ins-h">Inscription</h2>
    <span class="meta"><span class="n">{left}</span> {left === 1 ? 'name' : 'names'} on the board</span>
  </div>

  <div class="row">
    <div class="line" class:empty={!it.build.length} class:good={named} role="group" aria-label="Your answer">
      {#if it.build.length}
        {#each it.build as syl, i (i)}
          {@const lock = i < it.locked}
          <button class="placed" class:gap={gapAt(i)} class:lock disabled={lock || !open} onclick={() => run.unplace(i)} aria-label={lock ? `${syl}, locked` : `Take back ${syl}`}>{syl}</button>
        {/each}
      {:else}
        <span class="hint">{open ? 'Tap syllables to build the name' : 'The item is opening'}</span>
      {/if}
    </div>
    {#if it.shown.lengths}
      <span class="lengths" title="The name's words, and the syllables in each">
        <span class="sr">The name has {lengthsOf(it).length} {lengthsOf(it).length === 1 ? 'word' : 'words'}, of {lengthsOf(it).join(', ')} syllables.</span>
        <span aria-hidden="true">{#each lengthsOf(it) as n, k (k)}{#if k}<span class="dot"> · </span>{/if}<span class="n">{n}</span>{/each}</span>
      </span>
    {/if}
  </div>

  <div class="tiles" role="group" aria-label="The board's syllables">
    {#each it.tiles as tile (tile)}
      {@const grey = greyed(it, tile)}
      <button class="tile" class:grey disabled={!open || grey} onclick={() => run.place(tile)}>{tile}</button>
    {/each}
  </div>

  <!-- Under the tiles, so a line coming or going never moves them under a finger. -->
  <p class="status" role="status">
    {#if blocked === 'struck'}
      That name is struck off the board.
    {:else if blocked === 'tried'}
      “{buildText(it, spacing)}” was sent already.
    {:else if missed && !named}
      “{last!.text}” is not it: <span class="n">−{last!.lost}</span> life, and one card fewer.{#if it.misses > 1}
        <span class="n">{it.misses}</span> misses on this item.{/if}
    {/if}
  </p>

  {#if struck.length}
    <p class="struck"><span class="label">Struck</span> {#each struck as nm, i (nm.id)}{#if i}<span class="sep"> • </span>{/if}<s>{nm.name}</s>{/each}</p>
  {/if}
</section>

<style>
  .inscription {
    container: board / inline-size;
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }
  .top {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.2rem 1rem;
  }
  .meta {
    font-size: 0.92rem;
    color: var(--muted);
  }
  /* The answer line: an engraved slot the placed syllables sit in. */
  .line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 2px;
    min-height: 3rem;
    padding: 0.45rem 0.55rem;
    border: 1px solid rgba(125, 99, 51, 0.55);
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.45);
    box-shadow: inset 0 1px 6px rgba(0, 0, 0, 0.6);
  }
  .line.empty {
    justify-content: center;
  }
  .line.good {
    border-color: rgba(120, 180, 90, 0.7);
    box-shadow:
      inset 0 1px 6px rgba(0, 0, 0, 0.6),
      0 0 14px rgba(150, 190, 110, 0.2);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .row > .line {
    flex: 1;
    min-width: 0;
  }
  /* The word lengths, beside the line: "2 · 1 · 1 · 2". */
  .lengths {
    flex: none;
    padding: 0.3rem 0.55rem;
    border: 1px solid rgba(125, 99, 51, 0.45);
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.35);
    white-space: nowrap;
  }
  .dot {
    color: var(--muted);
  }
  /* A locked syllable (First syllable): set in, not taken back. */
  .placed.lock {
    color: #ffe0a8;
    cursor: default;
    text-decoration: underline;
    text-decoration-color: rgba(201, 164, 92, 0.6);
    text-underline-offset: 0.2em;
  }
  .placed:disabled {
    cursor: default;
  }
  .hint {
    font-style: italic;
    color: #6f665c;
  }
  .placed {
    min-width: 24px;
    padding: 0.18rem 0.3rem;
    border: 1px solid transparent;
    border-radius: 3px;
    background: none;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 1.15rem;
    line-height: 1.2;
    color: var(--unique-hi);
    cursor: pointer;
  }
  .placed.gap {
    margin-left: 0.55em;
  }
  .placed:hover:not(:disabled),
  .placed:focus-visible:not(:disabled) {
    outline: none;
    border-color: rgba(200, 90, 60, 0.6);
    color: #ffb79f;
    text-decoration: line-through;
    text-decoration-thickness: 1px;
  }
  .status {
    margin: -0.2rem 0 0;
    font-size: 0.95rem;
    color: #e79a86;
  }
  /* Empty, it takes no room but stays in the page, so a screen reader hears what comes into it. */
  .status:empty {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
  .status .n {
    color: #ff9c86;
  }
  /* The board: every name's syllables as tiles. */
  .tiles {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .tile {
    min-height: 2.4rem;
    padding: 0.3rem 0.65rem;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: linear-gradient(180deg, rgba(40, 31, 22, 0.95), rgba(20, 16, 12, 0.95));
    box-shadow: inset 0 1px 0 rgba(255, 220, 150, 0.06);
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 1rem;
    line-height: 1.1;
    color: #e9c8a2;
    cursor: pointer;
    transition:
      border-color 0.2s,
      color 0.2s,
      opacity 0.3s,
      transform 0.15s var(--ease-out);
  }
  .tile:hover:not(:disabled) {
    border-color: var(--gold);
    color: #fff1cf;
  }
  .tile:active:not(:disabled) {
    transform: translateY(1px);
  }
  .tile:disabled {
    cursor: default;
  }
  .tile.grey {
    opacity: 0.32;
    color: var(--muted);
    border-style: dashed;
  }
  .struck {
    margin: 0;
    font-size: 0.95rem;
    color: var(--muted);
  }
  .struck s {
    color: #b9776a;
    text-decoration-color: rgba(200, 90, 60, 0.8);
  }
  .label {
    margin-right: 0.35rem;
    font-family: var(--font-display);
    font-size: 0.68rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--muted);
  }
  /* A placed syllable is a finger's width on a touch screen; the empty line
     is as tall as one with a syllable on it, so the tiles under it never move. */
  @media (pointer: coarse) {
    .placed {
      min-height: 2.4rem;
    }
    .line {
      min-height: calc(2.4rem + 0.9rem + 2px);
    }
  }
  @container board (max-width: 420px) {
    .tiles {
      gap: 5px;
    }
    .tile {
      padding: 0.3rem 0.55rem;
      font-size: 0.95rem;
    }
  }
</style>
