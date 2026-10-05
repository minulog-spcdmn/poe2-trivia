<script lang="ts">
  import { fade } from 'svelte/transition';

  // One item picture, centred in whatever space its parent gives it, with the
  // item's proportions and at most `scale` times its own pixel size. `unflip`
  // starts it mirrored (as it was shown during the question) and turns it round.
  // `flood`: Delve's dynamite laid it bare, so it comes in from the heart of the
  // blast, its colour flooding out white-hot and settling.
  let {
    src,
    alt = '',
    w = 0,
    h = 0,
    scale = 1.8,
    float = false,
    unflip = false,
    flood = false,
  }: { src: string; alt?: string; w?: number; h?: number; scale?: number; float?: boolean; unflip?: boolean; flood?: boolean } = $props();

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
        class:flood
        in:fade={{ duration: flood ? 0 : 300 }}
        onload={(e) => {
          const img = e.currentTarget as HTMLImageElement;
          nw = img.naturalWidth;
          nh = img.naturalHeight;
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
  .flood {
    animation: flood 0.8s cubic-bezier(0.2, 0.7, 0.3, 1) both;
  }
  @keyframes flood {
    from {
      clip-path: circle(0% at 50% 50%);
      filter: saturate(0) brightness(2.6) drop-shadow(0 12px 25px rgba(0, 0, 0, 0.8));
    }
    40% {
      filter: saturate(1.5) brightness(1.5) drop-shadow(0 12px 25px rgba(0, 0, 0, 0.8));
    }
    to {
      clip-path: circle(75% at 50% 50%);
      filter: saturate(1) brightness(1) drop-shadow(0 12px 25px rgba(0, 0, 0, 0.8));
    }
  }
  /* Effects off: the plain art simply fades in. */
  :global(html[data-still]) .flood {
    animation: flood-still 0.3s ease-out both;
  }
  @keyframes flood-still {
    from {
      opacity: 0;
    }
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
