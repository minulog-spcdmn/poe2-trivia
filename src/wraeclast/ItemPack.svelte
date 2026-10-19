<script lang="ts">
  // The pack on an item, as the design's row: each supply held, with its
  // mark and short name, the count on a badge. On a phone the row shows marks
  // and counts only. A slot that would do nothing here is set back, dimmed
  // and struck. A tap uses one; a press held (a phone has no hover) shows
  // what it does, or why it does nothing here, above the row instead.
  // `tray`: the pack in the dock's tray (a short phone), four a row, taller,
  // with their names.
  import { SUPPLIES, SUPPLY_NAMES, type Run, type Supply } from './rules';
  import Glyph from './Glyph.svelte';
  import { SHORT, does, why } from './words';

  let { run, onuse, tray = false }: { run: Run; onuse?: (supply: Supply) => void; tray?: boolean } = $props();
  /** The supplies held. */
  const held = $derived(SUPPLIES.filter((sp) => run.state.pack[sp] > 0));

  /** How long a press is held before it shows the slot's line instead of using it. */
  const HOLD_MS = 450;
  /** The line a held slot shows ("Torch: Reveals ..."), and the slot it's for. */
  let said = $state<{ slot: Supply; text: string } | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  let at: { x: number; y: number } | null = null;
  /** A hold just showed a line: the click its release makes uses nothing. */
  let holding = false;

  const lineOf = (sp: Supply) => `${SUPPLY_NAMES[sp]}: ${why(run, sp) ?? does(run, sp)}`;

  function press(e: PointerEvent, sp: Supply) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    holding = false;
    at = { x: e.clientX, y: e.clientY };
    clearTimeout(timer);
    timer = setTimeout(() => {
      holding = true;
      clearTimeout(hideTimer);
      said = { slot: sp, text: lineOf(sp) };
    }, HOLD_MS);
  }
  function move(e: PointerEvent) {
    if (at && Math.hypot(e.clientX - at.x, e.clientY - at.y) > 10) release();
  }
  function release() {
    clearTimeout(timer);
    at = null;
    if (said) {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => (said = null), 1800);
    }
  }
  function use(sp: Supply) {
    if (holding) {
      holding = false;
      return;
    }
    if (why(run, sp)) return;
    said = null;
    if (run.use(sp)) onuse?.(sp);
  }
  $effect(() => () => {
    clearTimeout(timer);
    clearTimeout(hideTimer);
  });
</script>

{#if held.length}
  <div class="pack" class:tray role="group" aria-label="Your pack">
    {#each held as sp (sp)}
      {@const n = run.state.pack[sp]}
      {@const off = why(run, sp)}
      <button
        class="slot"
        class:off={!!off}
        aria-disabled={off ? 'true' : undefined}
        onclick={() => use(sp)}
        onpointerdown={(e) => press(e, sp)}
        onpointermove={move}
        onpointerup={release}
        onpointercancel={release}
        onpointerleave={release}
        oncontextmenu={(e) => e.preventDefault()}
        title={off ?? `${SUPPLY_NAMES[sp]}: ${does(run, sp)}`}
        aria-label="{SUPPLY_NAMES[sp]}: {n} in your pack. {off ?? does(run, sp)}"
      >
        <span class="n" aria-hidden="true">{n}</span>
        <span class="ic" aria-hidden="true"><Glyph of={sp} /></span>
        <span class="lbl" aria-hidden="true">{SHORT[sp]}</span>
      </button>
    {/each}
    {#if said}<p class="said" aria-hidden="true">{said.text}</p>{/if}
  </div>
{:else}
  <p class="empty-pack">Your pack is empty.</p>
{/if}

<style>
  .pack {
    position: relative;
    display: flex;
    gap: 4px;
    padding-top: 5px;
  }
  /* A held slot's line, over the row (the row doesn't move for it). */
  .said {
    position: absolute;
    left: 0;
    right: 0;
    bottom: calc(100% + 6px);
    z-index: 3;
    margin: 0;
    padding: 7px 10px;
    font-size: 14px;
    line-height: 1.25;
    text-align: center;
    color: #e6dccb;
    background: #14100c;
    border: 1px solid var(--gold-lo);
    border-radius: 4px;
    pointer-events: none;
  }
  .slot {
    position: relative;
    flex: 1 1 0;
    min-width: 0;
    max-width: 92px;
    height: 40px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    padding: 0;
    background: linear-gradient(90deg, rgba(40, 31, 22, 0.95), rgba(20, 16, 12, 0.95));
    border: 1px solid var(--line);
    border-radius: 4px;
    box-shadow: inset 0 1px 0 rgba(255, 220, 150, 0.05);
    color: var(--gold);
    cursor: pointer;
    -webkit-touch-callout: none;
    user-select: none;
  }
  .slot:hover:not(.off) {
    border-color: var(--gold-lo);
    color: var(--gold-hi);
  }
  .ic {
    width: 20px;
    height: 20px;
  }
  /* On a phone's row the marks and counts only; the names come back in the tray and on wide screens. */
  .lbl {
    display: none;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 12.5px;
    line-height: 1;
    color: #e9c8a2;
  }
  .n {
    position: absolute;
    top: -6px;
    right: -4px;
    display: grid;
    place-items: center;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    font-family: var(--font-cinzel);
    font-weight: 700;
    font-size: 10.5px;
    line-height: 1;
    color: var(--gold-hi);
    background: #0c0a08;
    border: 1px solid var(--gold-lo);
    border-radius: 8px;
  }
  /* Can't be used here: set back as a dimmed answer, struck through. */
  .slot.off {
    opacity: 0.35;
    filter: saturate(0.5);
    cursor: not-allowed;
  }
  .slot.off::after {
    content: '';
    position: absolute;
    left: 20%;
    right: 20%;
    top: 50%;
    height: 1px;
    rotate: -28deg;
    background: rgba(233, 200, 162, 0.6);
  }
  /* In the dock's tray: four a row, taller, named. */
  .pack.tray {
    flex-wrap: wrap;
    padding-top: 4px;
  }
  .tray .slot {
    flex: 0 0 calc((100% - 12px) / 4);
    max-width: none;
    height: 56px;
  }
  .tray .lbl {
    display: block;
    font-size: 11.5px;
  }
  @container item (min-width: 700px) {
    .pack {
      gap: 7px;
    }
    .slot {
      height: 52px;
    }
    .ic {
      width: 22px;
      height: 22px;
    }
    .lbl {
      display: block;
    }
  }
  .empty-pack {
    margin: 0;
    padding: 4px 0;
    text-align: center;
    font-style: italic;
    font-size: 14px;
    color: var(--muted);
  }
</style>
