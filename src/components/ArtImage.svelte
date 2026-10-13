<script lang="ts">
  import { untrack } from 'svelte';
  import { fade } from 'svelte/transition';

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
  // the box (app.css).
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

  /**
   * What is on screen. A picture is loaded and decoded first and only then
   * put on the page: a large one decoded as the frame is drawn held that
   * frame up for a tenth of a second or more (a new question's art). A new
   * one (the original art at the reveal) waits the same way while the one
   * before stays, then fades in over it, so the art never blinks out while
   * the new file comes (a guest has never fetched it: its name would give
   * the answer away).
   */
  let shown = $state<{ src: string; w: number; h: number; unflip: boolean } | null>(null);
  $effect(() => {
    const next = { src, w, h, unflip };
    const cur = untrack(() => shown);
    if (next.src === cur?.src) {
      if (next.w !== cur.w || next.h !== cur.h || next.unflip !== cur.unflip) shown = next;
      return;
    }
    let live = true;
    const img = new Image();
    img.src = next.src;
    // (Decoded, it is ready: its load event may already have gone by as it goes on the page.)
    const go = () => {
      if (!live) return;
      shown = next;
      loaded = true;
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
</script>

<span class="art-slot">
  <span class="art-fit" class:ready={loaded} class:float class:round style:--w={box.w} style:--h={box.h} style:--s={scale}>
    {#if shown}
      {#key shown.src}
        <img
          src={shown.src}
          {alt}
          decoding="async"
          class:unflip={shown.unflip}
          in:fade={{ duration: 300 }}
          out:fade={{ duration: 300 }}
        />
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
  .art-fit img {
    filter: drop-shadow(0 12px 25px rgba(0, 0, 0, 0.8));
  }
  /* The picture going out stays where it was while the new one fades in over it. */
  .art-fit img:not(:only-child) {
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
