<script lang="ts">
  // The note by the pointer that a code a player copies shows (the room
  // code, the sync code: lib/copyPress.svelte.ts), saying it was copied, or
  // how to copy it. Never in the pointer's way: below and right of a mouse,
  // following it; above a finger, out from under the hand; and on the screen
  // (lib/pointerNote.ts). Where it was made is kept from the code's corner,
  // so as the page or a dialog scrolls it goes along with the code, and a
  // finger that scrolls never takes it with it.
  import { fade } from 'svelte/transition';
  import { ownRect, zoomOf } from '../lib/stage';
  import { noteSpot } from '../lib/pointerNote';
  import type { CopyPress } from '../lib/copyPress.svelte';

  let { press }: { press: CopyPress } = $props();

  let noteEl = $state<HTMLElement>();
  /** Where the note is (its own px, under the stage's zoom). */
  let spot = $state({ x: 0, y: 0 });
  /** Where on the code the note was made (screen px from its top left), and the note's size (its own px). */
  let from = { x: 0, y: 0 };
  let size = { w: 0, h: 0 };

  function place() {
    const note = press.note;
    if (!note || !noteEl || !press.el) return;
    const r = press.el.getBoundingClientRect();
    // In the note's own px: the page (and the note with it) may be zoomed (lib/stage.ts), the window isn't.
    const z = zoomOf(noteEl);
    spot = noteSpot({ x: (r.left + from.x) / z, y: (r.top + from.y) / z }, size, { w: innerWidth / z, h: innerHeight / z }, note.touch);
  }
  // Each note as it shows (still before the frame is painted): measured once, not on every move after, and placed.
  $effect(() => {
    const note = press.note;
    if (!note || !noteEl || !press.el) return;
    const r = press.el.getBoundingClientRect();
    from = { x: note.at.clientX - r.left, y: note.at.clientY - r.top };
    const own = ownRect(noteEl);
    size = { w: own.width, h: own.height };
    place();
  });
  // Any scroll, the page's or a dialog's (they don't bubble, so caught on the way down).
  $effect(() => {
    if (!press.note) return;
    addEventListener('scroll', place, { capture: true, passive: true });
    return () => removeEventListener('scroll', place, { capture: true });
  });
  /** A mouse's note follows it. */
  function moved(e: PointerEvent) {
    if (e.pointerType !== 'mouse' || press.note?.touch !== false || !press.el) return;
    const r = press.el.getBoundingClientRect();
    from = { x: e.clientX - r.left, y: e.clientY - r.top };
    place();
  }
</script>

<svelte:window onpointermove={moved} onresize={place} />

{#if press.note}
  <span class="note" role="status" bind:this={noteEl} style:left="{spot.x}px" style:top="{spot.y}px" in:fade={{ duration: 120 }} out:fade={{ duration: 250 }}>{press.note.text}</span>
{/if}

<style>
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
</style>
