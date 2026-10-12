<script lang="ts">
  import { untrack } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { type DrawnItem } from '../lib/game';
  import { portal } from '../lib/portal';
  import { calm, motion } from '../lib/motion.svelte';
  import { phone } from '../lib/layout';
  import { closeItemWindow, readPlace, writePlace, type WindowPlace } from '../lib/itemWindow.svelte';
  import { hideLightIn } from '../lib/fx/core';
  import { zoomOf } from '../lib/stage';
  import NamePlate, { SOCKET_X } from './NamePlate.svelte';
  import ItemDetails, { loadStats, statsLoaded } from './ItemDetails.svelte';

  // An item opened from an answered question (lib/itemWindow.svelte.ts): its
  // tooltip, as the game shows it, in a window that floats over the game.
  // It slides in from the side of the screen it was left on (the middle of
  // the left, the first time) with only its name plate, then unrolls, so
  // the player sees it folds. Dragged by the plate, it stays where it's left
  // (next time too), and the game goes on under it. The chevron in the
  // plate's left socket (or a click on the plate) folds it up to the plate
  // alone; another item opened unfolds it.
  //
  // It's placed by its height open, folded or not, so the plate never moves
  // as it rolls: only the tooltip's height changes under it (a CSS
  // transition, on the compositor's clock, nothing measured meanwhile), and
  // there's always room below the plate to unroll into.
  let { item }: { item: DrawnItem } = $props();

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
  let w = $state(380);
  let plateH = $state(58);
  /** The tooltip's own height, whole. */
  let bodyH = $state(0);
  /** How tall the tooltip shows unrolled: whole, up to the screen (less the pinned bar); only past that does it scroll. */
  const rollH = $derived(Math.min(bodyH, Math.max(0, vh - dock - 2 * EDGE - plateH)));
  const openH = $derived(plateH + rollH);
  // Its place as shares of the room left round it, so it keeps to the same side as the screen changes size.
  const roomX = $derived(Math.max(vw - w - 2 * EDGE, 0));
  const roomY = $derived(Math.max(vh - dock - openH - 2 * EDGE, 0));
  const left = $derived(EDGE + place.x * roomX);
  const top = $derived(EDGE + place.y * roomY);
  /** A place on the screen (own px) as a share of the room there is for it. */
  const share = (at: number, room: number) => (room > 0 ? Math.min(Math.max((at - EDGE) / room, 0), 1) : 0);

  // It comes in once the tooltips are here (the first time, a moment after the click), so it's
  // placed by the whole tooltip's height from the start and never shifts on the way in; with its
  // plate alone, unrolling once it's there (open at once, with motion reduced).
  let ready = $state(statsLoaded());
  if (!statsLoaded()) loadStats().then(() => (ready = true), () => (ready = true));
  let folded = $state(!motion.still);

  let box = $state<HTMLElement>();
  let head = $state<HTMLElement>();
  let body = $state<HTMLElement>();
  const measure = () => {
    screenW = innerWidth;
    screenH = innerHeight;
    if (box) {
      zoom = zoomOf(box) || 1;
      w = box.offsetWidth;
    }
  };
  const readDock = () => (dockPx = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dock')) || 0);
  $effect(() => {
    if (!box) return;
    measure();
    readDock();
    const ro = new ResizeObserver(() => {
      if (box) w = box.offsetWidth;
      if (head) plateH = head.offsetHeight;
      if (body) bodyH = body.offsetHeight;
    });
    // (Not the window itself: its height follows these, and watching it too would loop.)
    for (const el of [head, body]) if (el) ro.observe(el);
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

  // Another item (or another picture of it) opened unfolds it.
  let shown = untrack(() => item.art);
  $effect.pre(() => {
    if (item.art === shown) return;
    shown = item.art;
    folded = false;
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
    place = { x: share(e.clientX / zoom - held.dx, roomX), y: share(e.clientY / zoom - held.dy, roomY) };
  }
  function up(e: PointerEvent) {
    if (held?.id !== e.pointerId) return;
    const moved = held.moved;
    held = null;
    if (moved) writePlace(place);
    else if (e.type === 'pointerup') folded = !folded;
  }

  /**
   * In from the side of the screen it's on, and out to the side it's on as
   * it goes (asked as each starts: dragged across meanwhile, it leaves by
   * the nearer edge).
   */
  const sideways = () => {
    const toLeft = left + w / 2 <= vw / 2;
    return calm({ x: toLeft ? -(left + w + 40) : vw - left + 40, opacity: 0.4, duration: 420, easing: cubicOut });
  };
</script>

<svelte:window onresize={measure} />

<!-- (Its transitions global: it sits in this block of its own, and comes and goes with the game's.) -->
{#if ready}
  <div
    class="window"
    class:folded
    class:still={motion.still}
    data-item-window
    bind:this={box}
    use:portal
    style:left="{left}px"
    style:top="{top}px"
    in:fly|global={sideways()}
    out:fly|global={sideways()}
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
    <div class="head" bind:this={head} onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up} role="presentation" title="Drag to move">
      <NamePlate start="empty" end="empty" />
      {#key item.art}
        <div class="head-text" in:fade={{ duration: 200 }}>
          <span class="iname" id="item-window-name">{item.name}</span>
          <span class="ibase">{item.base}</span>
        </div>
      {/key}
      <button
        class="socket fold"
        style:--socket="{SOCKET_X}px"
        onclick={() => (folded = !folded)}
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

    <!-- The roll: its height runs between nothing and the tooltip's; what's in it keeps its own, so it's uncovered, not squeezed. -->
    <div class="roll" id="item-window-body" style:height="{folded ? 0 : rollH}px" inert={folded}>
      <div class="scroll" style:height="{rollH}px">
        <div class="body" bind:this={body}>
          {#key item.art}
            <ItemDetails {item} />
          {/key}
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  /* The item's tooltip, as the game draws it under a name plate: not a dialog that holds the page, a window over it. */
  .window {
    position: fixed;
    /* Under the toasts and dialogs (90, 94), over the game. */
    z-index: 89;
    width: min(380px, calc(100vw / var(--stage-zoom, 1) - 16px));
    zoom: var(--stage-zoom, 1);
    display: flex;
    flex-direction: column;
    border: 1px solid #5a3a1c;
    /* Painted here, as dialogs are: it floats over the page. A faint grain, as on the page's backdrop. */
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
  /*
   * The tooltip, whole: the window is as tall as it is. Only where the
   * screen is shorter than that (a long gem's on a phone) does it scroll,
   * with no bar of its own, as dialogs on a short screen do.
   */
  /* The roll unrolls (and rolls up) at the chevron's pace; held still, it just opens. */
  .roll {
    flex: none;
    overflow: hidden;
    transition: height 0.38s cubic-bezier(0.215, 0.61, 0.355, 1);
  }
  .still .roll {
    transition: none;
  }
  .scroll {
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: none;
  }
  .scroll::-webkit-scrollbar {
    display: none;
  }
  .body {
    padding: 0.85rem 1.1rem 1.1rem;
  }

  @media (max-width: 640px) {
    .body {
      padding: 0.7rem 0.8rem 0.9rem;
    }
  }
</style>
