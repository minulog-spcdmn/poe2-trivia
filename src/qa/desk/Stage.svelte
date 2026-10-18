<script lang="ts">
  // One stop: a frame of the real game for each of its seats, side by side,
  // laid out at the stop's size and shrunk to fit the window (or at 1:1,
  // zoomed, to scroll about in; held Alt drags it). A frame is made afresh
  // for each stop, a moment after the walk stops on it, so flipping through
  // never builds the game's shaders for stops already left behind; the
  // frames of the last stop go first, letting go of their WebGL as they go.
  import { isFrameMessage } from '../messages.ts';
  import { sizeOf } from '../sizes.ts';
  import type { Stop } from './walk.ts';

  let { stop, seats, zoomed, reloads, panning, board }: { stop: Stop; seats: string[]; zoomed: boolean; reloads: number; panning: boolean; board?: string } = $props();

  const GAP = 24;
  const PAD = 16;
  const CAPTION = 30;
  /** How long the walk rests on a stop before its frames are made (ms). */
  const SETTLE_MS = 150;

  let cw = $state(0);
  let ch = $state(0);
  let el = $state<HTMLDivElement>();

  const size = $derived(sizeOf(stop.size));
  const n = $derived(stop.seats.length);
  const scale = $derived(zoomed ? 1 : Math.max(0.05, Math.min(1, (cw - 2 * PAD - (n - 1) * GAP) / (n * size.w), (ch - 2 * PAD - CAPTION) / size.h)));

  /** The stop whose frames are up (null between stops). */
  let shown = $state<{ stop: Stop; take: number } | null>(null);
  let ready = $state<Set<string>>(new Set());
  $effect(() => {
    const next = stop;
    const take = reloads;
    shown = null;
    ready = new Set();
    const t = setTimeout(() => (shown = { stop: next, take }), SETTLE_MS);
    return () => clearTimeout(t);
  });
  $effect(() => {
    const heard = (e: MessageEvent) => {
      if (e.origin === location.origin && isFrameMessage(e.data) && e.data.qa === 'ready') ready = new Set([...ready, e.data.slot]);
    };
    addEventListener('message', heard);
    return () => removeEventListener('message', heard);
  });

  const src = (s: Stop, i: number) => {
    const p = new URLSearchParams({ frame: `s${i}`, s: s.scene.key, seat: String(s.seats[i]), size: s.size });
    return `${location.pathname}?${p}`;
  };

  /** Held Alt: dragging moves the zoomed stop about. */
  function pan(e: PointerEvent) {
    if (!el) return;
    const box = el;
    const x0 = e.clientX + box.scrollLeft;
    const y0 = e.clientY + box.scrollTop;
    const move = (m: PointerEvent) => box.scrollTo(x0 - m.clientX, y0 - m.clientY);
    const done = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', done);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', done);
  }
</script>

<div class="stage" class:zoomed bind:clientWidth={cw} bind:clientHeight={ch} bind:this={el}>
  <div class="row" style:gap="{GAP}px">
    {#each stop.seats as _, i (i)}
      <figure class="seat">
        <div class="screen" style:width="{size.w * scale}px" style:height="{size.h * scale}px">
          {#if shown}
            {#key shown}
              <iframe
                title={seats[i] ?? 'The game'}
                src={src(shown.stop, i)}
                style:width="{size.w}px"
                style:height="{size.h}px"
                style:transform="scale({scale})"
                class:away={!!board}
              ></iframe>
            {/key}
          {/if}
          {#if board}
            <img class="board" src={board} alt="The design's board for this scene" style:width="{size.w * scale}px" />
          {:else if !ready.has(`s${i}`)}
            <p class="loading">Loading…</p>
          {/if}
        </div>
        <figcaption>{seats[i] ?? ''}{#if scale < 1}<span class="num zoom">{Math.round(scale * 100)}%</span>{/if}</figcaption>
      </figure>
    {/each}
  </div>
  {#if panning}
    <div class="pan" role="presentation" onpointerdown={pan}></div>
  {/if}
</div>
