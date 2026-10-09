<script lang="ts">
  import { fade } from 'svelte/transition';
  import { ART_SCALE } from '../lib/ui-paths';

  // One item picture, centred in whatever space its parent gives it, with the
  // item's proportions and at most `scale` times its size in art pixels (the
  // file's own, over ART_SCALE: every item picture is upscaled). `unflip`
  // starts it mirrored (as it was shown during the question) and turns it round.
  let {
    src,
    alt = '',
    w = 0,
    h = 0,
    scale = 1.8,
    float = false,
    unflip = false,
  }: { src: string; alt?: string; w?: number; h?: number; scale?: number; float?: boolean; unflip?: boolean } = $props();

  let nw = $state(0);
  let nh = $state(0);
  // Prefer the real image size once it has loaded; the hint avoids a jump before that.
  const W = $derived(nw || w || 1);
  const H = $derived(nh || h || 1);
  const ready = $derived(!!(nw || w));
</script>

<span class="art-slot">
  <span class="art-fit" class:ready class:float style:--w={W} style:--h={H} style:--s={scale}>
    {#key src}
      <img
        {src}
        {alt}
        draggable="false"
        class:unflip
        in:fade={{ duration: 300 }}
        onload={(e) => {
          const img = e.currentTarget as HTMLImageElement;
          nw = img.naturalWidth / ART_SCALE;
          nh = img.naturalHeight / ART_SCALE;
        }}
      />
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
