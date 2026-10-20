<script lang="ts">
  // What the desk shows: a frame for a piece, or one for each seat of a
  // scene side by side, laid out at the size picked and shrunk to fit (or at
  // 1:1, zoomed, to scroll about in; held Alt drags it). The frames are made
  // afresh when what they show changes (`showing`), a moment after it
  // settles, so going through states quickly never builds the game for
  // those already left behind.
  import { untrack } from 'svelte';
  import { isFrameMessage, type FrameMessage } from '../messages.ts';
  import type { Size } from '../sizes.ts';
  import type { Shown } from './compare.ts';

  let {
    frames,
    size,
    showing,
    zoomed,
    panning,
    board,
    origins = [],
    picked = -1,
    onframe,
    onbox,
    onmark,
  }: {
    frames: Shown[];
    /** A device's size, or null: as large as the room here, at 1:1. */
    size: Size | null;
    /** What the frames show, as one string: when it changes they're made afresh. */
    showing: string;
    zoomed: boolean;
    panning: boolean;
    board?: string;
    /** Origins besides the desk's own a frame may be on (the code before this change's). */
    origins?: string[];
    /** The mark picked, if one. */
    picked?: number;
    onframe: (m: FrameMessage, i: number) => void;
    /** Each frame's size (CSS px), as laid out. */
    onbox?: (w: number, h: number) => void;
    onmark?: (i: number) => void;
  } = $props();

  const GAP = 24;
  const PAD = 16;
  const CAPTION = 30;
  /** How long a view rests before its frames are made (ms). */
  const SETTLE_MS = 150;

  let cw = $state(0);
  let ch = $state(0);
  let el = $state<HTMLDivElement>();

  const n = $derived(frames.length);
  const captioned = $derived(frames.some((f) => f.caption));
  /** Each frame's size: the device's, or a share of the room here. */
  const w = $derived(size?.w ?? Math.max(200, Math.floor((cw - 2 * PAD - (n - 1) * GAP) / n)));
  const h = $derived(size?.h ?? Math.max(200, ch - 2 * PAD - (captioned ? CAPTION : 0)));
  const scale = $derived(zoomed || !size ? 1 : Math.max(0.05, Math.min(1, (cw - 2 * PAD - (n - 1) * GAP) / (n * w), (ch - 2 * PAD - (captioned ? CAPTION : 0)) / h)));

  /** The frames up (null between views): their addresses as they were when made. */
  let shown = $state<{ srcs: string[] } | null>(null);
  let ready = $state<Set<number>>(new Set());
  $effect(() => {
    void showing;
    const srcs = untrack(() => frames.map((f) => f.src));
    shown = null;
    ready = new Set();
    const t = setTimeout(() => (shown = { srcs }), SETTLE_MS);
    return () => clearTimeout(t);
  });
  $effect(() => onbox?.(w, h));
  let els = $state<HTMLIFrameElement[]>([]);
  $effect(() => {
    const heard = (e: MessageEvent) => {
      if ((e.origin !== location.origin && !origins.includes(e.origin)) || !isFrameMessage(e.data)) return;
      const i = els.findIndex((f) => f?.contentWindow === e.source);
      if (i < 0) return;
      // (One that couldn't start says why itself.)
      if (e.data.qa === 'ready' || e.data.qa === 'failed') ready = new Set([...ready, i]);
      onframe(e.data, i);
    };
    addEventListener('message', heard);
    return () => removeEventListener('message', heard);
  });

  /** Held Alt: dragging moves the zoomed view about. */
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

<!-- The size in the corner and the drag (held Alt) stay put while the frames scroll under them. -->
<div class="stage-box">
  <div class="stage" class:zoomed bind:clientWidth={cw} bind:clientHeight={ch} bind:this={el}>
    <div class="row" style:gap="{GAP}px">
      {#each frames as f, i (i)}
        <figure class="seat">
          <div class="screen" style:width="{w * scale}px" style:height="{h * scale}px">
            {#if shown?.srcs[i] && cw > 0}
              {#key shown}
                <iframe bind:this={els[i]} title={f.title} src={shown.srcs[i]} style:width="{w}px" style:height="{h}px" style:transform="scale({scale})" class:away={!!board}></iframe>
              {/key}
            {/if}
            {#if f.layer && !board}
              <img class="layer" src={f.layer} alt="" style:width="{w * scale}px" style:height="{h * scale}px" />
            {/if}
            {#if !board}
              {#each f.marks ?? [] as m, j (j)}
                <button
                  class="mark"
                  class:picked={j === picked}
                  style:left="{m.x * scale}px"
                  style:top="{m.y * scale}px"
                  style:width="{m.w * scale}px"
                  style:height="{m.h * scale}px"
                  onclick={() => onmark?.(j)}
                  aria-label="How area {j + 1} differs"><span class="num">{j + 1}</span></button
                >
              {/each}
            {/if}
            {#if board}
              <img class="board" src={board} alt="The design's board for this scene" style:width="{w * scale}px" />
            {:else if !shown?.srcs[i] && f.note}
              <p class="loading">{f.note}</p>
            {:else if !ready.has(i)}
              <p class="loading">Loading…</p>
            {/if}
          </div>
          {#if captioned}
            <figcaption>{f.caption}</figcaption>
          {/if}
        </figure>
      {/each}
    </div>
  </div>
  <p class="scale">{w} × {h}{#if scale < 1}<span class="num">{Math.round(scale * 100)}%</span>{/if}</p>
  {#if panning}
    <div class="pan" role="presentation" onpointerdown={pan}></div>
  {/if}
</div>
