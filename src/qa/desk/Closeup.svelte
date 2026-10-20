<script lang="ts">
  // How an area differs, close up: before, now, and the two in turn in one
  // place (a flick between them shows what moved, grew or changed colour),
  // enlarged as far as the room allows, pixel for pixel. Esc closes it.
  import type { Area } from './diff.ts';

  let {
    before,
    now,
    area,
    n,
    of,
    onpick,
    onclose,
  }: {
    before: ImageBitmap;
    now: ImageBitmap;
    area: Area;
    /** Which area it is (from 0), and how many there are. */
    n: number;
    of: number;
    onpick: (i: number) => void;
    onclose: () => void;
  } = $props();

  /** Room round the area, so what's beside it shows too (px of the shot). */
  const PAD = 12;
  /** The largest each picture may be (CSS px), and how far up it's enlarged at most. */
  const MAX_W = 340;
  const MAX_H = 240;
  const MAX_ZOOM = 6;

  const crop = $derived.by(() => {
    const x = Math.max(0, area.x - PAD);
    const y = Math.max(0, area.y - PAD);
    return { x, y, w: Math.min(now.width, area.x + area.w + PAD) - x, h: Math.min(now.height, area.y + area.h + PAD) - y };
  });
  const zoom = $derived(Math.max(0.25, Math.min(MAX_ZOOM, MAX_W / crop.w, MAX_H / crop.h)));

  /** Svelte action: draws `of` (before or now) cropped and enlarged into a canvas. */
  function draw(canvas: HTMLCanvasElement, which: () => ImageBitmap) {
    const paint = () => {
      canvas.width = Math.round(crop.w * zoom);
      canvas.height = Math.round(crop.h * zoom);
      const g = canvas.getContext('2d')!;
      g.imageSmoothingEnabled = zoom < 1;
      g.drawImage(which(), crop.x, crop.y, crop.w, crop.h, 0, 0, canvas.width, canvas.height);
    };
    $effect(paint);
  }

  /** The flick: before and now in turn. */
  let showingBefore = $state(true);
  $effect(() => {
    const t = setInterval(() => (showingBefore = !showingBefore), 650);
    return () => clearInterval(t);
  });
</script>

<section class="closeup" aria-label="How area {n + 1} differs">
  <header>
    <p class="about">
      <span class="what">Area {n + 1} of {of}</span><span class="sep">•</span><span class="num">{area.w} × {area.h}</span> at
      <span class="num">{area.x}, {area.y}</span><span class="sep">•</span><span class="num">{area.px}</span> px differ
    </p>
    {#if of > 1}
      <button onclick={() => onpick((n + of - 1) % of)} aria-label="The area before">‹</button>
      <button onclick={() => onpick((n + 1) % of)} aria-label="The next area">›</button>
    {/if}
    <button onclick={onclose}>Close <kbd>Esc</kbd></button>
  </header>
  <div class="pictures">
    <figure>
      <canvas use:draw={() => before}></canvas>
      <figcaption>Before</figcaption>
    </figure>
    <figure>
      <canvas use:draw={() => now}></canvas>
      <figcaption>Now</figcaption>
    </figure>
    <figure>
      <canvas use:draw={() => (showingBefore ? before : now)}></canvas>
      <figcaption>In turn: <span class:on={showingBefore}>before</span> • <span class:on={!showingBefore}>now</span></figcaption>
    </figure>
  </div>
</section>
