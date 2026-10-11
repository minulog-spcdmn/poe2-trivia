<script lang="ts">
  import { fade } from 'svelte/transition';

  // One item picture, centred in whatever space its parent gives it, with the
  // item's proportions and at most `scale` times its size in art pixels: `w`
  // and `h` (Item.w, Item.h, or what the host sent with a picture). The file
  // itself is finer (artScale in lib/ui-paths.ts), by a factor that differs
  // between items, so its own size says nothing about how big to draw it.
  // It fades in once its first file has loaded, so a large one never draws in
  // bit by bit; a picture swapped in later (the original art at the reveal)
  // fades in over it. `unflip` starts it mirrored (as it was shown during the
  // question) and turns it round. `round` lets it reach past the space into a
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
</script>

<span class="art-slot">
  <span class="art-fit" class:ready={loaded} class:float class:round style:--w={w} style:--h={h} style:--s={scale}>
    {#key src}
      <img {src} {alt} draggable="false" class:unflip in:fade={{ duration: 300 }} onload={() => (loaded = true)} />
    {/key}
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
