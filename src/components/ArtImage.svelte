<script lang="ts">
  import { untrack } from 'svelte';
  import { fade } from 'svelte/transition';
  import { castFor, type Cast } from '../lib/artShadow';
  import { fitOf, SHADOW } from '../lib/castShadow';

  // One item picture, centred in whatever space its parent gives it, with the
  // item's proportions and at most `scale` times its size in art pixels: `w`
  // and `h` (Item.w, Item.h, or what the host sent with a picture). The file
  // itself is finer (artScale in lib/ui-paths.ts), by a factor that differs
  // between items, so its own size says nothing about how big to draw it.
  // It fades in once its first file has loaded, so a large one never draws in
  // bit by bit; a picture swapped in later (the original art at the reveal)
  // fades in over it once it has loaded (each decoded before it shows). `unflip` starts it mirrored (as it
  // was shown during the question) and turns it round. `round` lets it reach past the space into a
  // circle around its centre (as big across as --round times the space's
  // width), so a wide item can be as big as the circle allows, not only as
  // the box (app.css). Its drop shadow is a bitmap of its own under it, made
  // for its size before it shows (lib/artShadow.ts), never a filter.
  let {
    src,
    alt = '',
    w,
    h,
    scale = 1.8,
    float = false,
    unflip = false,
    round = false,
  }: { src: string; alt?: string; w: number; h: number; scale?: number; float?: boolean; unflip?: boolean; round?: boolean } = $props();

  let loaded = $state(false);

  /** How long a picture waits for its shadow (ms): one later than that (the page busy, say) shows with CSS's until it comes. */
  const CAST_WAIT = 300;

  /**
   * What is on screen. A picture is loaded and decoded first and only then
   * put on the page: a large one decoded as the frame is drawn held that
   * frame up for a tenth of a second or more (a new question's art). A new
   * one (the original art at the reveal) waits the same way while the one
   * before stays, then fades in over it, so the art never blinks out while
   * the new file comes (a guest has never fetched it: its name would give
   * the answer away). Its shadow is made meanwhile (`cast`; none: CSS draws
   * it).
   */
  let shown = $state.raw<{ src: string; w: number; h: number; unflip: boolean; img: HTMLImageElement; cast: Cast | null } | null>(null);
  $effect(() => {
    const next = { src, w, h, unflip };
    const cur = untrack(() => shown);
    if (next.src === cur?.src) {
      if (next.w !== cur.w || next.h !== cur.h || next.unflip !== cur.unflip) {
        shown = { ...cur, ...next };
        untrack(recast);
      }
      return;
    }
    let live = true;
    const img = new Image();
    img.src = next.src;
    // (Decoded, it is ready: its load event may already have gone by as it goes on the page.)
    const go = async () => {
      if (!live) return;
      const cast = castOf(img, next.w, next.h);
      const ready = await Promise.race([cast, new Promise<undefined>((done) => setTimeout(done, CAST_WAIT))]);
      if (!live) return;
      shown = { ...next, img, cast: ready ?? null };
      loaded = true;
      if (ready === undefined) {
        const late = await cast;
        if (late && shown?.img === img) shown = { ...shown, cast: late };
      }
    };
    // One that won't decode (a fetch that failed, a picture let go of as the
    // question changed) never goes up: the one before stays. Only where the
    // browser loaded it but turned decode() down anyway does it go up.
    img.decode().then(go, () => {
      if (img.complete && img.naturalWidth) go();
    });
    return () => {
      live = false;
    };
  });
  /** The box's size: the picture's, or the one on its way's. */
  const box = $derived(shown ?? { w, h });

  /** The slot's size (CSS px) and, for a round fit, its --round: what the picture's box is fitted to. */
  type Room = { w: number; h: number; round: number };
  let room: Room | null = null;
  let roomed = () => {};
  const measured = new Promise<void>((done) => (roomed = done));
  /** Svelte action on the slot: keeps `room`, and has the shadow made again for a picture drawn at another size. */
  function measure(node: HTMLElement) {
    const seen = new ResizeObserver(([e]) => {
      const { width, height } = e!.contentRect;
      // (Laid out just now, its styles are there to read.)
      const r = round ? parseFloat(getComputedStyle(node).getPropertyValue('--round')) || 1 : 1;
      const first = !room;
      room = { w: width, h: height, round: r };
      if (first) roomed();
      else recast();
    });
    seen.observe(node);
    return { destroy: () => seen.disconnect() };
  }
  /** The box a picture `w` x `h` (art px) is drawn in here, CSS px, as app.css fits .art-fit. */
  const fitted = (r: Room, w: number, h: number) => fitOf(r.w, r.h, w, h, scale, round ? r.round : undefined);

  /** The shadow of `img`, w x h art px, for the box it will have here (once the slot is laid out). */
  async function castOf(img: HTMLImageElement, w: number, h: number) {
    await measured;
    const fit = fitted(room!, w, h);
    return castFor(img, fit.w, fit.h);
  }

  let recasts = 0;
  /** The shown picture's shadow made again, if it's drawn at another size now (a resize, a turned phone). */
  function recast() {
    const cur = shown;
    if (!cur || !room) return;
    const fit = fitted(room, cur.w, cur.h);
    if (cur.cast && Math.abs(cur.cast.w - fit.w) < 0.5 && Math.abs(cur.cast.h - fit.h) < 0.5) return;
    const run = ++recasts;
    castFor(cur.img, fit.w, fit.h).then((cast) => {
      if (cast && run === recasts && shown?.img === cur.img) shown = { ...shown, cast };
    });
  }

  /** Svelte action: puts the shadow's bitmap on its canvas (laid round the picture by its style). */
  function lay(canvas: HTMLCanvasElement, cast: Cast) {
    const put = (c: Cast) => {
      [canvas.width, canvas.height] = [c.cw, c.ch];
      const shows = canvas.getContext('bitmaprenderer');
      if (shows) shows.transferFromImageBitmap(c.bitmap);
      else {
        canvas.getContext('2d')?.drawImage(c.bitmap, 0, 0);
        c.bitmap.close();
      }
    };
    put(cast);
    return {
      update(next: Cast) {
        if (next !== cast) put((cast = next));
      },
    };
  }
</script>

<span class="art-slot" use:measure>
  <span class="art-fit" class:ready={loaded} class:float class:round style:--w={box.w} style:--h={box.h} style:--s={scale}>
    {#if shown}
      {#key shown.src}
        <!-- The fade and the turn move the box round the picture and its
             shadow, which go together, as a filter's would (see .shot). -->
        <span class="shot" class:unflip={shown.unflip} in:fade={{ duration: 300 }} out:fade={{ duration: 300 }}>
          {#if shown.cast}
            {@const c = shown.cast}
            <!-- The picture `pad` in from its corner, the shadow SHADOW.dy lower; it stretches with the box till it's made for a new size. -->
            <canvas
              class="cast"
              aria-hidden="true"
              use:lay={c}
              style:left="{-c.pad}px"
              style:top="{SHADOW.dy - c.pad}px"
              style:width="calc(100% + {c.cw - c.w}px)"
              style:height="calc(100% + {c.ch - c.h}px)"
            ></canvas>
          {/if}
          <img src={shown.src} {alt} decoding="async" class:filtered={!shown.cast} />
        </span>
      {/key}
    {/if}
  </span>
</span>

<style>
  .art-fit {
    opacity: 0;
    transition: opacity 0.3s;
  }
  .art-fit.ready {
    opacity: 1;
  }
  /* The picture and its shadow in a box of their own, which fades and
     turns: they fade and turn together, as a picture with a drop-shadow()
     does (a fade or a turn applies to an element's filtered drawing), and
     the box is the picture's size. The shadow is a canvas under the
     picture, its blur worked out once (lib/artShadow.ts), not a filter on
     it: a filter is drawn again whenever what holds it is painted or
     composited, and a find-the-art reveal, which swaps all six pictures at
     once (twelve fades), ran at about 12 fps for close to a second on an
     iPhone with it. (The first picture comes in by .art-fit's fade, above,
     never by this one: a local intro doesn't play as its {#key} first
     runs.) */
  .shot,
  .shot > img {
    position: relative;
    display: block;
    width: 100%;
    height: 100%;
  }
  .cast {
    position: absolute;
    display: block;
    pointer-events: none;
  }
  /* (One whose shadow couldn't be made, or isn't yet: CSS draws it, as SHADOW in lib/castShadow.ts says.) */
  .shot > img.filtered {
    filter: drop-shadow(0 12px 25px rgba(0, 0, 0, 0.8));
  }
  /* The picture going out stays where it was while the new one fades in over it. */
  .shot:not(:only-child) {
    position: absolute;
    inset: 0;
  }
  .unflip {
    animation: unflip 0.45s var(--ease-out) 0.25s backwards;
  }
  @keyframes unflip {
    from {
      transform: scaleX(-1);
    }
  }
  .float {
    animation: float 5s ease-in-out 1s infinite;
  }
  @keyframes float {
    50% {
      translate: 0 -6px;
    }
  }
</style>
