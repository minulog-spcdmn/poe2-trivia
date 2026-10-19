<script lang="ts">
  // The Veil: the item's art under a 4 x 4 grid of patches. The art is loaded
  // and decoded first, then measured (how much of each patch it fills), and
  // only then does the item open (run.open): the zone's free patches lift
  // where there is art to see, and its clock starts. With a Flare in hand,
  // the covered patches can be tapped to lift them.
  import { onMount } from 'svelte';
  import { itemImage } from '../lib/ui-paths';
  import { GRID, PATCHES, type Run } from './rules';

  let { run }: { run: Run } = $props();
  const it = $derived(run.state.item!);
  const item = $derived(run.engine.byId.get(it.itemId)!);
  const url = $derived(itemImage(it.itemId));
  let shown = $state(false);

  /** How much of each patch the art fills (0 to 1, row by row), or null if it can't be read. */
  function coverage(img: HTMLImageElement): number[] | null {
    try {
      const N = 64;
      const per = N / GRID;
      const c = document.createElement('canvas');
      c.width = c.height = N;
      const g = c.getContext('2d', { willReadFrequently: true });
      if (!g) return null;
      g.drawImage(img, 0, 0, N, N);
      const d = g.getImageData(0, 0, N, N).data;
      const filled = Array<number>(PATCHES).fill(0);
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) if (d[(y * N + x) * 4 + 3] > 40) filled[Math.floor(y / per) * GRID + Math.floor(x / per)]++;
      return filled.map((f) => f / (per * per));
    } catch {
      return null;
    }
  }

  onMount(() => {
    let live = true;
    const img = new Image();
    img.src = url;
    // A picture that won't come within a few seconds: the item opens anyway, its free patches anywhere.
    const late = new Promise<'late'>((r) => setTimeout(() => r('late'), 6000));
    Promise.race([img.decode().then(() => coverage(img), () => null), late]).then((cov) => {
      if (!live) return;
      shown = true;
      run.open(cov === 'late' ? null : cov);
    });
    return () => {
      live = false;
    };
  });
</script>

<span class="art-slot">
  <span class="art-fit" style:--w={item.w} style:--h={item.h} style:--s={2.2}>
    <img src={url} alt="The item to name" class:shown decoding="async" draggable="false" />
    <span class="veil" class:armed={it.flare > 0} role="group" aria-label="The veil: {it.lifted.filter(Boolean).length} of {PATCHES} patches lifted">
      {#each it.lifted as up, i (i)}
        <button
          class="patch"
          class:up
          disabled={up || it.flare <= 0}
          aria-label="Patch {Math.floor(i / GRID) + 1}, {(i % GRID) + 1}{up ? ': lifted' : ''}"
          onclick={() => run.lift(i)}
        ></button>
      {/each}
    </span>
  </span>
</span>

<style>
  .art-slot {
    position: absolute;
    inset: 0;
  }
  img {
    opacity: 0;
    transition: opacity 0.4s;
    user-select: none;
  }
  img.shown {
    opacity: 1;
  }
  .veil {
    position: absolute;
    inset: 0;
    display: grid;
    grid-template: repeat(4, minmax(0, 1fr)) / repeat(4, minmax(0, 1fr));
  }
  /* A patch: a dark worked plate, a faint diamond engraved at its middle. */
  .patch {
    position: relative;
    padding: 0;
    border: 0;
    border-radius: 0;
    background:
      radial-gradient(circle at 50% 50%, rgba(201, 164, 92, 0.16) 0 1.5px, transparent 2.5px),
      linear-gradient(160deg, #1e1813, #0c0a08);
    box-shadow:
      0 0 0 0.5px #0c0a08,
      inset 0 0 0 1px rgba(125, 99, 51, 0.32);
    cursor: default;
    transition:
      opacity 0.45s,
      transform 0.45s var(--ease-out),
      box-shadow 0.3s;
  }
  .patch.up {
    opacity: 0;
    transform: scale(0.82);
    pointer-events: none;
  }
  /* A Flare in hand: every covered patch waits to be tapped. */
  .armed .patch:not(.up) {
    cursor: pointer;
    box-shadow:
      0 0 0 0.5px #0c0a08,
      inset 0 0 0 1px rgba(224, 138, 68, 0.6),
      inset 0 0 14px rgba(224, 138, 68, 0.18);
  }
  .armed .patch:not(.up):hover,
  .armed .patch:not(.up):focus-visible {
    outline: none;
    background:
      radial-gradient(circle at 50% 50%, rgba(255, 210, 150, 0.4) 0 2px, transparent 3px),
      linear-gradient(160deg, #2c2118, #120e0a);
    box-shadow:
      0 0 0 0.5px #0c0a08,
      inset 0 0 0 1px rgba(255, 190, 120, 0.9),
      inset 0 0 18px rgba(255, 170, 90, 0.3);
  }
</style>
