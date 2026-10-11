<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { fade, fly, slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { type Item } from '../lib/game';
  import { itemImage } from '../lib/ui';
  import { portal } from '../lib/portal';
  import { calm, motion } from '../lib/motion.svelte';
  import { phone } from '../lib/layout';
  import { closeItemWindow, readPlace, writePlace, type WindowPlace } from '../lib/itemWindow.svelte';
  import { hideLightIn } from '../lib/fx/core';
  import { zoomOf } from '../lib/stage';
  import NamePlate, { SOCKET_X } from './NamePlate.svelte';
  import ArtImage from './ArtImage.svelte';
  import ItemDetails, { loadStats } from './ItemDetails.svelte';

  // An item opened from an answered question (lib/itemWindow.svelte.ts): its
  // tooltip, as the game shows it, in a window that floats over the game.
  // It slides in from the side of the screen it was left on (the middle of
  // the left, the first time) with only its name plate, then unrolls, so
  // the player sees it folds. Dragged by the plate, it stays where it's left
  // (next time too), and the game goes on under it. The chevron in the
  // plate's left socket (or a click on the plate) folds it down to the plate
  // alone; another item opened unfolds it.
  let { item }: { item: Item } = $props();

  /** Kept this far from the screen's edges (px). */
  const EDGE = 8;
  let place = $state<WindowPlace>(readPlace() ?? { x: 0, y: 0.5 });
  // All in the window's own px: it's at the page's scale (lib/stage.ts), as dialogs are.
  let zoom = $state(1);
  let screenW = $state(innerWidth);
  let screenH = $state(innerHeight);
  const vw = $derived(screenW / zoom);
  const vh = $derived(screenH / zoom);
  /** A phone's bar pinned to the bottom (Next, lib/layout.ts dock): the window keeps above it. */
  let dockPx = $state(0);
  const dock = $derived(phone.current ? dockPx / zoom : 0);
  const maxH = $derived(Math.max(120, Math.min(600, vh * 0.8, vh - dock - 2 * EDGE)));
  let w = $state(0);
  let h = $state(0);
  /** Where the top is held while the window folds or unfolds: the plate stays put and the rest rolls up under it, or down. */
  let pinTop = $state<number | null>(null);
  // Its place as shares of the room left round it, so it keeps to the same side as the screen changes size.
  const roomX = $derived(Math.max(vw - w - 2 * EDGE, 0));
  const roomY = $derived(Math.max(vh - dock - h - 2 * EDGE, 0));
  const left = $derived(EDGE + place.x * roomX);
  const top = $derived(pinTop !== null ? Math.max(EDGE, Math.min(pinTop, EDGE + roomY)) : EDGE + place.y * roomY);
  /** A place on the screen (own px) as a share of the room there is for it. */
  const share = (at: number, room: number) => (room > 0 ? Math.min(Math.max((at - EDGE) / room, 0), 1) : 0);

  // It comes in with its plate alone, and unrolls once it's there (at once, with motion reduced),
  // about its place: the first time, the middle of the screen's left edge.
  let folded = $state(!motion.still);
  void loadStats();
  /** It came in from the left (or, left on the right half of the screen, from the right). */
  const fromLeft = untrack(() => place.x) <= 0.5;

  let box = $state<HTMLElement>();
  const measure = () => {
    screenW = innerWidth;
    screenH = innerHeight;
    if (box) zoom = zoomOf(box) || 1;
  };
  const readDock = () => (dockPx = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dock')) || 0);
  onMount(() => {
    measure();
    readDock();
    const ro = new ResizeObserver(() => {
      if (!box) return;
      w = box.offsetWidth;
      h = box.offsetHeight;
    });
    ro.observe(box!);
    // The pinned bar comes and goes with each reveal: lib/layout.ts sets its height on <html>.
    const mo = new MutationObserver(readDock);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    // Opaque, so the effects' light from the page behind it doesn't shine through.
    const light = hideLightIn(() => box?.getBoundingClientRect() ?? null);
    return () => {
      ro.disconnect();
      mo.disconnect();
      light.stop();
    };
  });

  /** Folds or unfolds it, the plate held where it is until the roll is done. */
  function setFolded(to: boolean) {
    if (to === folded) return;
    pinTop = top;
    folded = to;
  }
  /**
   * The roll is done: where the plate stopped becomes the window's place,
   * once its new height is known (a frame on: the rolled-up body leaves the
   * page only after this).
   */
  function rolled() {
    if (pinTop === null) return;
    requestAnimationFrame(() => {
      if (pinTop === null || !box) return;
      h = box.offsetHeight;
      const at = top;
      place = { x: place.x, y: share(at, roomY) };
      pinTop = null;
      writePlace(place);
    });
  }

  // Another item opened unfolds it.
  let shown = untrack(() => item.id);
  $effect.pre(() => {
    if (item.id === shown) return;
    shown = item.id;
    setFolded(false);
  });

  /** A press that moves less than this (px) is a click, which folds the window, not a drag. */
  const CLICK_PX = 5;
  /** The drag under way: where the pointer took hold, from the window's corner, and whether it has moved yet. */
  let held: { id: number; dx: number; dy: number; x: number; y: number; moved: boolean } | null = null;
  function down(e: PointerEvent) {
    if (e.button !== 0 || (e.target as Element).closest('button')) return;
    e.preventDefault();
    held = { id: e.pointerId, dx: e.clientX / zoom - left, dy: e.clientY / zoom - top, x: e.clientX, y: e.clientY, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent) {
    if (held?.id !== e.pointerId) return;
    if (!held.moved && Math.hypot(e.clientX - held.x, e.clientY - held.y) < CLICK_PX) return;
    held.moved = true;
    pinTop = null;
    place = { x: share(e.clientX / zoom - held.dx, roomX), y: share(e.clientY / zoom - held.dy, roomY) };
  }
  function up(e: PointerEvent) {
    if (held?.id !== e.pointerId) return;
    const moved = held.moved;
    held = null;
    if (moved) writePlace(place);
    else if (e.type === 'pointerup') setFolded(!folded);
  }

  /** In from the side of the screen, and out the same way. */
  const sideways = () => {
    // (Coming in, it hasn't been measured yet: as wide as it's drawn.)
    const width = w || box?.offsetWidth || 380;
    return calm({ x: fromLeft ? -(left + width + 40) : vw - left + 40, opacity: 0.4, duration: 420, easing: cubicOut });
  };
</script>

<svelte:window onresize={measure} />

<div
  class="window"
  class:folded
  data-item-window
  bind:this={box}
  use:portal
  style:left="{left}px"
  style:top="{top}px"
  style:--max-h="{maxH}px"
  in:fly={sideways()}
  out:fly={sideways()}
  onintroend={() => (folded = false)}
  onkeydown={(e) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    closeItemWindow();
  }}
  role="dialog"
  aria-labelledby="item-window-name"
  tabindex="-1"
>
  <div class="head" onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up} role="presentation" title="Drag to move">
    <NamePlate start="empty" end="empty" />
    {#key item.id}
      <div class="head-text" in:fade={{ duration: 200 }}>
        <span class="iname" id="item-window-name">{item.name}</span>
        <span class="ibase">{item.base}</span>
      </div>
    {/key}
    <button
      class="socket fold"
      style:--socket="{SOCKET_X}px"
      onclick={() => setFolded(!folded)}
      aria-expanded={!folded}
      aria-controls="item-window-body"
      aria-label={folded ? 'Unfold' : 'Fold'}
      title={folded ? 'Unfold' : 'Fold'}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9.5l6 6 6-6" /></svg>
    </button>
    <button class="socket close" style:--socket="{SOCKET_X}px" onclick={closeItemWindow} aria-label="Close" title="Close">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
    </button>
  </div>

  {#if !folded}
    <div class="scroll" id="item-window-body" transition:slide={calm({ duration: 380, easing: cubicOut })} onintroend={rolled} onoutroend={rolled}>
      <div class="art">
        <div class="frame">
          {#key item.id}
            <ArtImage src={itemImage(item.id)} alt={item.name} w={item.w} h={item.h} />
          {/key}
        </div>
      </div>
      <div class="body">
        {#key item.id}
          <ItemDetails {item} />
        {/key}
      </div>
    </div>
  {/if}
</div>

<style>
  /* The item's tooltip, as the game draws it under a name plate: not a dialog that holds the page, a window over it. */
  .window {
    position: fixed;
    /* Under the toasts and dialogs (90, 94), over the game. */
    z-index: 89;
    width: min(380px, calc(100vw / var(--stage-zoom, 1) - 16px));
    max-height: var(--max-h, 600px);
    zoom: var(--stage-zoom, 1);
    display: flex;
    flex-direction: column;
    border: 1px solid #5a3a1c;
    /*
     * Painted here, as dialogs are: it floats over the page. A faint grain (as
     * on the page's backdrop) dithers the art's glows, which would band this
     * close to black.
     */
    background:
      url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.025'/%3E%3C/svg%3E"),
      #030201;
    box-shadow:
      0 0 0 1px #000,
      0 0 40px rgba(175, 96, 37, 0.12),
      0 14px 44px rgba(0, 0, 0, 0.8);
    outline: none;
  }
  .head {
    position: relative;
    flex: none;
    display: grid;
    min-height: 58px;
    place-items: center;
    /* Clear of the sockets at the plate's ends. */
    padding: 0.45rem 3.3rem;
    cursor: grab;
    touch-action: none;
    user-select: none;
  }
  .head:active {
    cursor: grabbing;
  }
  .head-text {
    position: relative;
    grid-area: 1 / 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    line-height: 1.15;
  }
  .iname {
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 1.12rem;
    color: var(--unique-hi);
    text-shadow: 0 0 12px rgba(224, 138, 68, 0.4);
  }
  .ibase {
    font-family: var(--font-display);
    font-size: 0.84rem;
    color: #d8a26a;
    opacity: 0.85;
  }
  /* The buttons in the plate's empty sockets: fold on the left, close on the right. */
  .socket {
    position: absolute;
    top: 50%;
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    padding: 0;
    background: none;
    border: 0;
    border-radius: 50%;
    cursor: pointer;
    color: var(--unique-hi);
    transition: color 0.2s;
  }
  .socket:hover,
  .socket:focus-visible {
    color: var(--gold-hi);
  }
  .socket:focus-visible {
    outline: 1px solid var(--gold-lo);
  }
  .socket svg {
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .close {
    right: var(--socket);
    translate: 50% -50%;
  }
  .close svg {
    width: 10px;
    height: 10px;
    stroke-width: 2.6;
  }
  /* Open, the chevron points up (fold it away); folded, down (unroll it), turning as it rolls. */
  .fold {
    left: var(--socket);
    translate: -50% -50%;
  }
  .fold svg {
    width: 14px;
    height: 14px;
    stroke-width: 2.4;
    rotate: 180deg;
    transition: rotate 0.38s var(--ease-out, ease-out);
  }
  .folded .fold svg {
    rotate: 0deg;
  }
  /* A long tooltip scrolls under its name plate. */
  .scroll {
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: #5a3a1c transparent;
  }
  .art {
    position: relative;
    height: 150px;
    container-type: size;
    background:
      radial-gradient(ellipse 55% 50% at 50% 50%, rgba(175, 96, 37, 0.14), transparent),
      radial-gradient(ellipse 80% 60% at 50% 0%, rgba(90, 110, 160, 0.1), transparent);
    box-shadow: inset 0 1px 0 rgba(201, 164, 92, 0.12);
    overflow: hidden;
  }
  .frame {
    position: absolute;
    inset: 0;
    margin: auto;
    width: 80%;
    height: 84%;
    display: grid;
    place-items: center;
  }
  .frame > :global(.art-slot) {
    position: absolute;
    inset: 0;
  }
  .body {
    padding: 0.4rem 1.1rem 1.1rem;
  }

  /* A phone has little room: the art smaller (still big enough to know the item by), the tooltip closer in. */
  @media (max-width: 640px) {
    .art {
      height: 96px;
    }
    .body {
      padding: 0.3rem 0.8rem 0.9rem;
    }
  }
</style>
