<script lang="ts">
  // Every state of a screen side by side (A): a frame of each, at the size
  // picked, shrunk to a column's width, under the states' headings. A frame
  // is only up while it's on screen (or near), and draws without the WebGL
  // backdrop, so a screen of sixty states stays light; a click on one shows
  // it alone, in full.
  import { untrack } from 'svelte';
  import { isFrameMessage, type FrameMessage } from '../messages.ts';
  import { sizeOf, type SizeKey } from '../sizes.ts';
  import { asQuery, type SceneBench, type SceneState } from '../bench.ts';

  let {
    bench,
    size,
    seat,
    outlines,
    current,
    onframe,
    onpick,
  }: {
    bench: SceneBench;
    size: SizeKey;
    seat: number;
    outlines: boolean;
    /** The state on show alone before (its index), if one. */
    current: number;
    onframe: (m: FrameMessage) => void;
    onpick: (i: number) => void;
  } = $props();

  /** How wide a column is at least (CSS px on the desk). */
  const MIN_COL = 380;
  const GAP = 16;

  let cw = $state(0);
  const sz = $derived(sizeOf(size));
  const cols = $derived(Math.max(1, Math.floor((cw - 32 + GAP) / (MIN_COL + GAP))));
  const colW = $derived((cw - 32 - (cols - 1) * GAP) / cols);
  const scale = $derived(Math.min(1, colW / sz.w));
  /** The states by heading, each with its index. */
  const headed = $derived.by(() => {
    const out: { group: string; items: { s: SceneState; i: number }[] }[] = [];
    bench.states.forEach((s, i) => {
      const last = out[out.length - 1];
      if (last && last.group === s.group) last.items.push({ s, i });
      else out.push({ group: s.group, items: [{ s, i }] });
    });
    return out;
  });

  let near = $state<Set<number>>(new Set());
  /** Svelte action: marks a cell near the screen, or not. */
  function watch(node: HTMLElement, i: number) {
    const io = new IntersectionObserver(
      ([e]) => {
        const next = new Set(near);
        if (e.isIntersecting) next.add(i);
        else next.delete(i);
        near = next;
      },
      // (The grid is what scrolls, so the margin is round it: a frame starts a little before it scrolls in.)
      { root: node.closest('.grid'), rootMargin: '300px 0px' },
    );
    io.observe(node);
    return { destroy: () => io.disconnect() };
  }
  const src = (s: SceneState, i: number) => {
    // (The seat as picked, where the scene has one by that number: the frame takes the last its room has as built when it has fewer.)
    const p = new URLSearchParams({ frame: `g${i}`, s: s.scene.key, seat: String(Math.min(seat, s.scene.seats.length - 1)), size, off: 'webgl' });
    // (As a frame is made: O later reaches those up by a message, not by making them again.)
    if (!untrack(() => outlines)) p.set('o', '0');
    for (const [k, v] of asQuery(s.values)) p.set(`k.${k}`, v);
    return `${location.pathname}?${p}`;
  };

  let els = $state<HTMLIFrameElement[]>([]);
  $effect(() => {
    const heard = (e: MessageEvent) => {
      if (e.origin !== location.origin || !isFrameMessage(e.data) || !els.some((f) => f?.contentWindow === e.source)) return;
      // Only their keys: what each finds wrong is for when it's shown alone.
      if (e.data.qa === 'key') onframe(e.data);
    };
    addEventListener('message', heard);
    return () => removeEventListener('message', heard);
  });
</script>

<div class="grid" bind:clientWidth={cw} style:--cols={cols} style:--gap="{GAP}px">
  {#each headed as h, g (g)}
    <h3 class="heading">{h.group}</h3>
    {#each h.items as { s, i } (i)}
      <figure class="cell" class:now={i === current} use:watch={i}>
        <div class="screen" style:width="{sz.w * scale}px" style:height="{sz.h * scale}px">
          {#if near.has(i) && cw > 0}
            <iframe bind:this={els[i]} title={s.label} src={src(s, i)} style:width="{sz.w}px" style:height="{sz.h}px" style:transform="scale({scale})" tabindex="-1"></iframe>
          {/if}
          <button class="pick" onclick={() => onpick(i)} aria-label="Show {s.label} alone"></button>
        </div>
        <figcaption><span class="num">{i + 1}</span>{s.label}</figcaption>
      </figure>
    {/each}
  {/each}
</div>
