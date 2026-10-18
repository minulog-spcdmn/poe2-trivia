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

  let {
    frames,
    size,
    showing,
    zoomed,
    panning,
    board,
    onframe,
  }: {
    frames: { src: string; title: string; caption: string }[];
    /** A device's size, or null: as large as the room here, at 1:1. */
    size: Size | null;
    /** What the frames show, as one string: when it changes they're made afresh. */
    showing: string;
    zoomed: boolean;
    panning: boolean;
    board?: string;
    onframe: (m: FrameMessage) => void;
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
  let els = $state<HTMLIFrameElement[]>([]);
  $effect(() => {
    const heard = (e: MessageEvent) => {
      if (e.origin !== location.origin || !isFrameMessage(e.data)) return;
      const i = els.findIndex((f) => f?.contentWindow === e.source);
      if (i < 0) return;
      if (e.data.qa === 'ready') ready = new Set([...ready, i]);
      onframe(e.data);
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
          {#if board}
            <img class="board" src={board} alt="The design's board for this scene" style:width="{w * scale}px" />
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
  <p class="scale">{w} × {h}{#if scale < 1}<span class="num">{Math.round(scale * 100)}%</span>{/if}</p>
  {#if panning}
    <div class="pan" role="presentation" onpointerdown={pan}></div>
  {/if}
</div>
