<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { singular, type Item } from '../lib/game';
  import { itemImage } from '../lib/ui';
  import { portal } from '../lib/portal';
  import { calm } from '../lib/motion.svelte';
  import { closeItemWindow, readPlace, writePlace, type WindowPlace } from '../lib/itemWindow.svelte';
  import { hideLightIn } from '../lib/fx/core';
  import { zoomOf } from '../lib/stage';
  import NamePlate, { SOCKET_X } from './NamePlate.svelte';
  import ArtImage from './ArtImage.svelte';
  import ItemDetails from './ItemDetails.svelte';

  // An item opened from an answered question (lib/itemWindow.svelte.ts): its
  // tooltip, as the codex shows it, in a window that floats over the game.
  // Dragged by its name plate, it stays where it's left (next time too),
  // and the game goes on under it. A click on the plate folds it down to the
  // plate alone (on a phone it covers much of the game), and another item
  // opened unfolds it.
  let { item }: { item: Item } = $props();

  const kind = $derived(singular(item.kind === 'gem' ? item.category : item.group));

  /** Kept this far from the screen's edges (px). */
  const EDGE = 8;
  let place = $state<WindowPlace>(readPlace() ?? { x: 1, y: 1 });
  // All in the window's own px: it's at the page's scale (lib/stage.ts), as dialogs are.
  let zoom = $state(1);
  let screenW = $state(innerWidth);
  let screenH = $state(innerHeight);
  const vw = $derived(screenW / zoom);
  const vh = $derived(screenH / zoom);
  let w = $state(0);
  let h = $state(0);
  // Its place as shares of the room left round it, so it keeps to the same side as the screen changes size.
  const left = $derived(EDGE + place.x * Math.max(vw - w - 2 * EDGE, 0));
  const top = $derived(EDGE + place.y * Math.max(vh - h - 2 * EDGE, 0));

  let folded = $state(false);
  /** Where the window's top was as it was folded or unfolded, kept there as its height changes. */
  let keepTop: number | null = null;
  /** A place on the screen (own px) as a share of the room there is for it. */
  const share = (at: number, room: number) => (room > 0 ? Math.min(Math.max((at - EDGE) / room, 0), 1) : 0);

  let box = $state<HTMLElement>();
  const measure = () => {
    screenW = innerWidth;
    screenH = innerHeight;
    if (box) zoom = zoomOf(box) || 1;
  };
  onMount(() => {
    measure();
    const ro = new ResizeObserver(() => {
      if (!box) return;
      w = box.offsetWidth;
      h = box.offsetHeight;
      // Folded or unfolded, the plate stays where it was, under the pointer.
      if (keepTop === null) return;
      place = { x: place.x, y: share(keepTop, vh - h - 2 * EDGE) };
      keepTop = null;
      writePlace(place);
    });
    ro.observe(box!);
    // Opaque, so the effects' light from the page behind it doesn't shine through.
    const light = hideLightIn(() => box?.getBoundingClientRect() ?? null);
    return () => {
      ro.disconnect();
      light.stop();
    };
  });

  // Another item opened unfolds it.
  $effect.pre(() => {
    void item.id;
    if (untrack(() => folded)) keepTop = untrack(() => top);
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
    place = { x: share(e.clientX / zoom - held.dx, vw - w - 2 * EDGE), y: share(e.clientY / zoom - held.dy, vh - h - 2 * EDGE) };
  }
  function up(e: PointerEvent) {
    if (held?.id !== e.pointerId) return;
    const moved = held.moved;
    held = null;
    if (moved) writePlace(place);
    else if (e.type === 'pointerup') {
      keepTop = top;
      folded = !folded;
    }
  }
</script>

<svelte:window onresize={measure} />

<div
  class="window"
  data-item-window
  bind:this={box}
  use:portal
  style:left="{left}px"
  style:top="{top}px"
  transition:fly={calm({ y: 16, duration: 220 })}
  onkeydown={(e) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    closeItemWindow();
  }}
  role="dialog"
  aria-labelledby="item-window-name"
  tabindex="-1"
>
  <div class="head" onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up} role="presentation" title={folded ? 'Drag to move; click to unfold' : 'Drag to move; click to fold'}>
    <NamePlate end="empty" />
    {#key item.id}
      <div class="head-text" in:fade={{ duration: 200 }}>
        <span class="iname" id="item-window-name">{item.name}</span>
        <span class="ibase">{item.base}</span>
      </div>
    {/key}
    <button class="close" style:--socket="{SOCKET_X}px" onclick={closeItemWindow} aria-label="Close" title="Close">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
    </button>
  </div>

  <div class="scroll" hidden={folded}>
    <div class="art">
      <div class="frame">
        {#key item.id}
          <ArtImage src={itemImage(item.id)} alt={item.name} w={item.w} h={item.h} />
        {/key}
      </div>
    </div>
    <div class="body">
      <p class="kind">{kind}</p>
      <div class="sep" aria-hidden="true"></div>
      {#key item.id}
        <ItemDetails {item} />
      {/key}
    </div>
  </div>
</div>

<style>
  /* The codex's item tooltip (CodexItem), smaller, and not a dialog that holds the page: a window over it. */
  .window {
    position: fixed;
    /* Under the toasts and dialogs (90, 94), over the game. */
    z-index: 89;
    width: min(340px, calc(100vw / var(--stage-zoom, 1) - 16px));
    max-height: min(560px, calc(70dvh / var(--stage-zoom, 1)));
    zoom: var(--stage-zoom, 1);
    display: flex;
    flex-direction: column;
    border: 1px solid #5a3a1c;
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
    /* Clear of the braces at the plate's ends. */
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
    font-size: 1.1rem;
    color: var(--unique-hi);
    text-shadow: 0 0 12px rgba(224, 138, 68, 0.4);
  }
  .ibase {
    font-family: var(--font-display);
    font-size: 0.82rem;
    color: #d8a26a;
    opacity: 0.85;
  }
  /* Centred in the empty end of the name plate. */
  .close {
    position: absolute;
    top: 50%;
    right: var(--socket);
    translate: 50% -50%;
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
  .close:hover {
    color: var(--gold-hi);
  }
  .close svg {
    width: 10px;
    height: 10px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.6;
    stroke-linecap: round;
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
    height: 140px;
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
    padding: 0.7rem 1rem 1rem;
    text-align: center;
  }
  .kind {
    margin: 0;
    font-family: var(--font-display);
    font-size: 0.8rem;
    letter-spacing: 0.08em;
    color: var(--muted);
  }
  .sep {
    position: relative;
    height: 1px;
    margin: 0.7rem auto;
    width: 80%;
    background: linear-gradient(90deg, transparent, #6b4520 25%, #6b4520 75%, transparent);
  }
  .sep::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    width: 5px;
    height: 5px;
    translate: -50% -50%;
    rotate: 45deg;
    background: var(--unique);
    box-shadow: 0 0 6px rgba(224, 138, 68, 0.6);
  }

  @media (max-width: 480px) {
    .art {
      height: 110px;
    }
  }
</style>
