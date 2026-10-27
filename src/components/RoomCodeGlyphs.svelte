<script lang="ts">
  // A room code's letters, each in its own box, as the lobby shows them (and
  // the invite screen, the room it leads to). A click, a drag across it, a
  // tap or a long press copies the whole code, and a small note by the
  // pointer (above a finger) says so; the letters light up while selected or
  // just copied, in place of the browser's highlight, and go back to rest
  // after. A finger or a pen selects nothing and brings up no menu: the code
  // is copied for them. A copy by hand gives just the letters too, and the
  // selection can't be dragged off as a picture. `hidden` shows dots
  // (for streaming; a copy still gives the code), `sparks` makes each letter
  // spark as it lands, `delay` holds back their drop (ms).
  import { flushSync, onDestroy } from 'svelte';
  import { fade } from 'svelte/transition';
  import { glyphLanded } from '../lib/fx/moments';
  import { ownRect, zoomOf } from '../lib/stage';
  import { noteSpot } from '../lib/pointerNote';
  import { backdropShadow } from '../lib/backdropShadow';

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
  let noteEl = $state<HTMLElement>();
  /**
   * The note's size (its own px), measured as it shows, and whether a finger
   * or a pen made it: it is kept on the screen by its size, and over a tap
   * goes above it, out from under the hand (lib/pointerNote.ts).
   */
  let noteSize = { w: 0, h: 0 };
  let noteByTouch = false;
  /** Lit as just copied, for LIT_MS: on a phone the tap's selection doesn't last (Chrome on Android collapses it at once), so it can't be what lights the code. */
  let lit = $state(false);
  let litTimer: ReturnType<typeof setTimeout> | undefined;
  let noteTimer: ReturnType<typeof setTimeout> | undefined;
  /** Where on the screen a copy was made: a mouse's or a finger's. */
  type At = { clientX: number; clientY: number };
  const place = (e: At) => {
    if (!note) return;
    // In the note's own px: the page (and the note with it) may be zoomed (lib/stage.ts), the window isn't.
    const z = zoomOf(glyphs ?? document.body);
    note = { ...note, ...noteSpot({ x: e.clientX / z, y: e.clientY / z }, noteSize, { w: innerWidth / z, h: innerHeight / z }, noteByTouch) };
  };
  function show(e: At, text: string) {
    note = { x: 0, y: 0, text };
    noteByTouch = touched;
    // Drawn at once, still before the frame is painted, to be measured; once, not on every move after.
    flushSync();
    const r = noteEl && ownRect(noteEl);
    noteSize = { w: r?.width ?? 0, h: r?.height ?? 0 };
    place(e);
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => (note = null), NOTE_MS);
  }

  /**
   * A press on the code. A mouse copies once it lets go (wherever the
   * pointer is by then), so a drag that starts on the code and ends off it
   * counts: its selection is there by then. A finger or a pen copies on the
   * tap's click instead, which still has the tap's user activation for the
   * clipboard: Android Chrome runs a stylus through the same gestures as a
   * finger, and only selects the code after their pointerup, and a long
   * press there often ends in a pointercancel, with no pointerup at all
   * (that one is copied from its contextmenu, below). A long press copies
   * too: on Android its contextmenu, its menu kept shut; on iOS as the
   * finger lets go, which iOS counts as a tap for the clipboard (it sends
   * no click after one). Either way once a press, and nothing is selected.
   */
  let touched = false;
  /** Where and when a finger or a pen came down on the code (a long press is one held still), and whether that press has copied it yet. */
  let down = { at: 0, x: 0, y: 0, copied: false };
  /** How long a press is held to be a long press (ms), and how far it may move (px). */
  const LONG_MS = 400;
  const STILL_PX = 10;
  function press(e: PointerEvent) {
    if (e.button !== 0) return;
    touched = e.pointerType !== 'mouse';
    if (!touched) addEventListener('pointerup', release, { once: true });
    else down = { at: e.timeStamp, x: e.clientX, y: e.clientY, copied: false };
  }
  function release(e: PointerEvent) {
    // A click selects the whole code (user-select: all), a drag some or all of it: the code is what is wanted either way.
    if (selectionHere()) void copy(e);
  }
  /** A finger's or a pen's copy, once a press however many of its events come. */
  function copyOnce(at: At) {
    if (down.copied) return;
    down.copied = true;
    void copy(at);
  }
  function tapped(e: MouseEvent) {
    if (touched) copyOnce(e);
  }
  function held(e: TouchEvent) {
    const t = e.changedTouches[0];
    if (touched && t && e.timeStamp - down.at >= LONG_MS && Math.hypot(t.clientX - down.x, t.clientY - down.y) <= STILL_PX) copyOnce(t);
  }
  function menu(e: MouseEvent) {
    if (!touched) return;
    e.preventDefault();
    copyOnce(e);
  }
  async function copy(e: At) {
    let copied = false;
    try {
      await navigator.clipboard.writeText(code);
      copied = true;
    } catch {
      // Older browsers and some app views: copied the old way, the code put
      // in the copy itself (nothing need be selected, and a finger selects
      // nothing).
      const put = (c: ClipboardEvent) => {
        c.clipboardData?.setData('text/plain', code);
        c.preventDefault();
      };
      document.addEventListener('copy', put);
      copied = document.execCommand?.('copy') ?? false;
      document.removeEventListener('copy', put);
    }
    // Copying by hand: a key on a keyboard (a finger has no other way, and a long press is the same copy).
    show(e, copied ? 'Room code copied' : touched ? 'Couldn’t copy it here' : 'Press Ctrl+C to copy it');
    if (!copied) return;
    lit = true;
    clearTimeout(litTimer);
    // Lit a moment as copied, then back to rest: the selection goes, and the glow with it.
    litTimer = setTimeout(() => {
      lit = false;
      if (selectionHere()) getSelection()?.removeAllRanges();
    }, LIT_MS);
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
    // Only a selection of the code (all of it or some, whichever way it is
    // anchored round it): one taking in anything else copies as it is.
    const text = getSelection()?.toString().replace(/\s/g, '') ?? '';
    const shown = hidden ? '•'.repeat(code.length) : code;
    if (!text || !shown.includes(text) || !e.clipboardData) return;
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

<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events (the pointer handlers copy what a press selected, a tap the code; the dragstart only stops a drag of the selection; by keyboard the code is copied as any text is) -->
<span class="glyphs" class:hidden class:selected={selected || lit} data-copy bind:this={glyphs} oncopy={copyCode} ondragstart={(e) => e.preventDefault()} onselectstart={(e) => touched && e.preventDefault()} onpointerdown={press} onclick={tapped} ontouchend={held} oncontextmenu={menu}>
  {#each code.split('') as ch, i (i)}
    <!-- The letter in gold; its gleam is drawn from data-ch (a pseudo-element), so a copy gives each letter once. -->
    <span class="glyph" use:landing={i} use:backdropShadow={{ fill: 'linear' }} style:animation-delay="{delay + i * 80}ms" style:--i={i} data-ch={hidden ? '•' : ch}><span class="ch">{hidden ? '•' : ch}</span></span>
  {/each}
</span>
{#if note}
  <!-- By the pointer, as long as it shows. -->
  <span class="note" role="status" bind:this={noteEl} style:left="{note.x}px" style:top="{note.y}px" in:fade={{ duration: 120 }} out:fade={{ duration: 250 }}>{note.text}</span>
{/if}

<style>
  /* The boxes share the width they are given, so the letters are sized from
     it (six boxes, five gaps), never wider than a box: an M or a W must not
     be clipped. One click, tap or long press selects the whole code. */
  .glyphs {
    display: flex;
    gap: 0.5rem;
    width: 100%;
    container-type: inline-size;
    -webkit-user-select: all;
    user-select: all;
    -webkit-touch-callout: default;
  }
  /* A finger or a pen selects nothing: a tap or a long press copies the code
     itself. (A phone's, here; a touch screen with a mouse too stops the
     finger's selection as it starts, onselectstart.) */
  @media (hover: none) {
    .glyphs {
      -webkit-user-select: none;
      user-select: none;
    }
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
    /* Drawn by the WebGL backdrop when it can (see lib/backdropShadow.ts): so
       dark a gradient bands in CSS. --bs1 is the glow while selected, --bs2
       the drop shadow. */
    --bs-fill-a: #221a11;
    --bs-fill-b: #0d0a07;
    background: var(--bs-fill-paint, linear-gradient(var(--bs-fill-a), var(--bs-fill-b)));
    border: 1px solid var(--gold-lo);
    border-radius: 4px;
    --bs1-color: transparent;
    --bs1: 0px 16px;
    --bs2: 6px 18px;
    --bs2-color: rgba(0, 0, 0, 0.6);
    box-shadow:
      inset 0 0 var(--glyph-glow-in, 18px rgba(201, 164, 92, 0.12)),
      var(--bs-soft-paint, 0 var(--bs1, 0 0) var(--bs1-color, transparent), 0 var(--bs2, 0 0) var(--bs2-color, transparent));
    transition:
      border-color 0.15s,
      --bs-fill-a 0.15s,
      --bs-fill-b 0.15s,
      --bs1-color 0.15s;
    animation: drop 0.6s var(--ease-back) both;
  }
  .selected .glyph {
    border-color: var(--gold);
    --bs-fill-a: #3a2a15;
    --bs-fill-b: #17100a;
    --glyph-glow-in: 22px rgba(241, 217, 155, 0.22);
    --bs1-color: rgba(201, 164, 92, 0.35);
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
  /* The note by the pointer, never in its way: below and right of a mouse,
     above a tap, and on the screen (placed by lib/pointerNote.ts). */
  .note {
    position: fixed;
    z-index: 96;
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
