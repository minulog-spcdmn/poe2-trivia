<script lang="ts">
  // A room code's letters, each in its own box, as the lobby shows them (and
  // the invite screen, the room it leads to). A click, a drag across it or a
  // long press selects the whole code and copies it, and a small note by the
  // pointer says so; the letters light up while selected, in place of the
  // browser's highlight, and go back to rest once it is copied. A copy by
  // hand gives just the letters too, and the selection can't be dragged off
  // as a picture. `hidden` shows dots (for streaming; a copy still gives the
  // code), `sparks` makes each letter spark as it lands, `delay` holds back
  // their drop (ms).
  import { onDestroy } from 'svelte';
  import { fade } from 'svelte/transition';
  import { glyphLanded } from '../lib/fx/moments';
  import { zoomOf } from '../lib/stage';

  let { code, hidden = false, sparks = false, delay = 0 }: { code: string; hidden?: boolean; sparks?: boolean; delay?: number } = $props();

  let glyphs = $state<HTMLElement>();
  let selected = $state(false);
  const selectionHere = () => {
    const sel = getSelection();
    return !!glyphs && !!sel && !sel.isCollapsed && sel.containsNode(glyphs, true);
  };
  function selectionChanged() {
    selected = selectionHere();
  }

  /** How long the copied code stays lit and selected, and the note by the pointer shows (ms). */
  const LIT_MS = 700;
  const NOTE_MS = 1300;
  /** The note by the pointer: where (in this page's own px, under the stage's zoom), and what it says. */
  let note = $state<{ x: number; y: number; text: string } | null>(null);
  let litTimer: ReturnType<typeof setTimeout> | undefined;
  let noteTimer: ReturnType<typeof setTimeout> | undefined;
  const place = (e: PointerEvent) => {
    if (!note) return;
    const z = zoomOf(glyphs ?? document.body);
    note = { ...note, x: e.clientX / z, y: e.clientY / z };
  };
  function show(e: PointerEvent, text: string) {
    note = { x: 0, y: 0, text };
    place(e);
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => (note = null), NOTE_MS);
  }

  /** A press on the code: once it lets go (wherever the pointer is by then), what it selected is copied. */
  function press(e: PointerEvent) {
    if (e.button !== 0) return;
    addEventListener('pointerup', release, { once: true });
  }
  async function release(e: PointerEvent) {
    // A click selects the whole code (user-select: all), a drag some or all of it: the code is what is wanted either way.
    if (!selectionHere()) return;
    let copied = false;
    try {
      await navigator.clipboard.writeText(code);
      copied = true;
    } catch {
      // Older browsers and some app views: the selection, copied the old way (copyCode below cleans it).
      copied = document.execCommand?.('copy') ?? false;
    }
    show(e, copied ? 'Room code copied' : 'Press Ctrl+C to copy it');
    if (!copied) return;
    clearTimeout(litTimer);
    // Lit a moment as copied, then back to rest: the selection goes, and the glow with it.
    litTimer = setTimeout(() => selectionHere() && getSelection()?.removeAllRanges(), LIT_MS);
  }
  onDestroy(() => {
    removeEventListener('pointerup', release);
    clearTimeout(litTimer);
    clearTimeout(noteTimer);
  });

  /**
   * Each letter is its own box, so a plain copy puts line breaks (pasted as
   * spaces) between them, and hidden (streaming) they are only dots: copy
   * the code itself instead, whatever of it is selected.
   */
  function copyCode(e: ClipboardEvent) {
    // Only a selection within the code: one reaching past it copies as it is.
    const sel = getSelection();
    if (!sel?.toString() || !sel.rangeCount || !e.clipboardData || !glyphs) return;
    const range = sel.getRangeAt(0);
    if (!glyphs.contains(range.startContainer) || !glyphs.contains(range.endContainer)) return;
    e.clipboardData.setData('text/plain', code);
    e.preventDefault();
  }

  /** Svelte action: sparks as a letter lands (its drop is staggered by index). */
  function landing(node: HTMLElement, i: number) {
    if (!sparks) return;
    const t = setTimeout(() => glyphLanded(node), delay + 330 + i * 80);
    return { destroy: () => clearTimeout(t) };
  }
</script>

<svelte:document onselectionchange={selectionChanged} />
<svelte:window onpointermove={place} />

<!-- svelte-ignore a11y_no_static_element_interactions (the pointer handlers copy what a press selected; the dragstart only stops a drag of the selection) -->
<span class="glyphs" class:hidden class:selected bind:this={glyphs} oncopy={copyCode} ondragstart={(e) => e.preventDefault()} onpointerdown={press}>
  {#each code.split('') as ch, i (i)}
    <!-- The letter in gold; its gleam is drawn from data-ch (a pseudo-element), so a copy gives each letter once. -->
    <span class="glyph" use:landing={i} style:animation-delay="{delay + i * 80}ms" style:--i={i} data-ch={hidden ? '•' : ch}><span class="ch">{hidden ? '•' : ch}</span></span>
  {/each}
</span>
{#if note}
  <!-- By the pointer, as long as it shows. -->
  <span class="note" role="status" style:left="{note.x}px" style:top="{note.y}px" in:fade={{ duration: 120 }} out:fade={{ duration: 250 }}>{note.text}</span>
{/if}

<style>
  /* The boxes share the width they are given, so the letters are sized from
     it (six boxes, five gaps), never wider than a box: an M or a W must not
     be clipped. One click or long press selects the whole code. */
  .glyphs {
    display: flex;
    gap: 0.5rem;
    width: 100%;
    container-type: inline-size;
    -webkit-user-select: all;
    user-select: all;
  }
  /* Selected, the letters light up in place of the browser's highlight. */
  .glyphs ::selection,
  .glyphs::selection {
    background: transparent;
    color: inherit;
  }
  .glyph {
    flex: 1;
    min-width: 0;
    height: clamp(58px, 14vw, 72px);
    display: grid;
    place-items: center;
    position: relative;
    overflow: hidden;
    font-family: var(--font-cinzel);
    font-weight: 900;
    font-size: min(2.6rem, (100cqi - 5 * 0.5rem) / 6 * 0.74);
    color: var(--gold-hi);
    background: linear-gradient(180deg, #221a11, #0d0a07);
    border: 1px solid var(--gold-lo);
    border-radius: 4px;
    box-shadow:
      inset 0 0 18px rgba(201, 164, 92, 0.12),
      0 6px 18px rgba(0, 0, 0, 0.6);
    transition:
      border-color 0.15s,
      background 0.15s,
      box-shadow 0.15s;
    animation: drop 0.6s var(--ease-back) both;
  }
  .selected .glyph {
    border-color: var(--gold);
    background: linear-gradient(180deg, #3a2a15, #17100a);
    box-shadow:
      inset 0 0 22px rgba(241, 217, 155, 0.22),
      0 0 16px rgba(201, 164, 92, 0.35),
      0 6px 18px rgba(0, 0, 0, 0.6);
  }
  /* The letter in the title's gold (GameTitle), painted once. A text-shadow
     would be drawn over gold clipped to the letter, so the glow is a filter. */
  .ch {
    filter: drop-shadow(0 0 8px rgba(241, 217, 155, 0.35));
    transition: filter 0.15s;
    background-image: linear-gradient(180deg, #fff1c9 22%, #e2bd76 55%, #a07a35 88%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  /* Every few seconds a band of light passes along the code, as over the
     title: on the letters' shapes only (a copy of each, drawn by the band),
     one box after another as one sweep; its own layer, so the gold and the
     box are never painted again for it. */
  .glyph::after {
    content: attr(data-ch);
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    pointer-events: none;
    will-change: transform;
    background-image: linear-gradient(100deg, transparent 40%, rgba(255, 251, 236, 0.95) 50%, transparent 60%);
    background-repeat: no-repeat;
    background-size: 300% 100%;
    background-position: 150% 0;
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    text-shadow: none;
    animation: sheen 7s cubic-bezier(0.45, 0, 0.55, 1) infinite;
    animation-delay: calc(1.6s + var(--i, 0) * 0.11s);
  }
  @keyframes sheen {
    0% {
      background-position: 150% 0;
    }
    10%,
    100% {
      background-position: -50% 0;
    }
  }
  /* The box's top edge catches the light as the band crosses it. */
  .glyph::before {
    content: '';
    position: absolute;
    top: 0;
    left: 12%;
    right: 12%;
    height: 1px;
    pointer-events: none;
    background: linear-gradient(90deg, transparent, rgba(255, 236, 190, 0.85), transparent);
    opacity: 0;
    animation: edge 7s ease-in-out infinite;
    animation-delay: calc(1.6s + var(--i, 0) * 0.11s);
  }
  @keyframes edge {
    4% {
      opacity: 1;
    }
    0%,
    9%,
    100% {
      opacity: 0;
    }
  }
  .hidden .ch {
    background-image: none;
    color: var(--gold-lo);
  }
  .selected .ch {
    filter: drop-shadow(0 0 9px rgba(255, 230, 170, 0.6));
    background-image: linear-gradient(180deg, #fffaf0 22%, #f4d79a 60%, #c99c4f 92%);
  }
  @media (prefers-reduced-motion: reduce) {
    .glyph::after,
    .glyph::before {
      animation: none;
      display: none;
    }
  }
  @keyframes drop {
    from {
      opacity: 0;
      transform: translateY(-18px) rotateX(70deg);
    }
  }
  /* The note by the pointer: just below and right of it, never in its way. */
  .note {
    position: fixed;
    z-index: 96;
    translate: 14px 16px;
    padding: 0.3rem 0.65rem;
    pointer-events: none;
    white-space: nowrap;
    font-family: var(--font-display);
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #fff1cf;
    background: rgba(12, 10, 8, 0.94);
    border: 1px solid var(--gold-lo);
    border-radius: 3px;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.55);
  }
  @media (max-width: 520px) {
    .glyphs {
      gap: 0.35rem;
    }
    .glyph {
      height: 54px;
    }
  }
</style>
