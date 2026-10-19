<script lang="ts">
  // The Veil: the item's art under a 4 x 4 grid of patches. The art is loaded
  // and decoded first, then measured (how much of each patch it fills), and
  // only then does the item open (run.open): the zone's free patches lift
  // where there is art to see, and its clock starts. With a Flare in hand,
  // the covered patches can be tapped to lift them. A small or narrow item's
  // box is kept big enough to tap (its art letterboxed in it), and measured
  // as drawn there; a patch over the letterbox alone covers nothing, so the
  // run is told (run.setBare): it's drawn empty and can't be tapped.
  import { onMount, untrack } from 'svelte';
  import { itemImage } from '../lib/ui-paths';
  import { GRID, PATCHES, type Run } from './rules';

  let { run }: { run: Run } = $props();
  const it = $derived(run.state.item!);
  const item = $derived(run.engine.byId.get(it.itemId)!);
  const url = $derived(itemImage(it.itemId));
  let shown = $state(false);
  let fit = $state<HTMLElement>();
  let boxW = $state(0);
  let boxH = $state(0);

  /** The patches (row by row) all but wholly outside the art's own box, in a box widened or heightened to be tapped. */
  const outside = $derived.by(() => {
    if (!boxW || !boxH) return Array<boolean>(PATCHES).fill(false);
    const k = Math.min(boxW / item.w, boxH / item.h);
    // How much of row or column i's span (0 to 1) lies over the art, which fills `a` of the box's span, centred.
    const over = (i: number, a: number) => Math.max(0, Math.min((i + 1) / GRID, (1 + a) / 2) - Math.max(i / GRID, (1 - a) / 2)) * GRID;
    return Array.from({ length: PATCHES }, (_, p) => over(p % GRID, (item.w * k) / boxW) < 0.15 || over(Math.floor(p / GRID), (item.h * k) / boxH) < 0.15);
  });
  // The run counts only the patches there's something under (as the box is laid out now).
  $effect(() => {
    const bare = outside;
    untrack(() => run.setBare(bare));
  });

  /** How much of each patch the art fills (0 to 1, row by row), as it's drawn in its box, or null if it can't be read. */
  function coverage(img: HTMLImageElement): number[] | null {
    try {
      const N = 64;
      const per = N / GRID;
      const c = document.createElement('canvas');
      c.width = c.height = N;
      const g = c.getContext('2d', { willReadFrequently: true });
      const box = fit?.getBoundingClientRect();
      if (!g || !box?.width || !box.height || !img.naturalWidth || !img.naturalHeight) return null;
      // The art as object-fit: contain draws it: as big as fits, centred.
      const k = Math.min(box.width / img.naturalWidth, box.height / img.naturalHeight);
      const w = (N * img.naturalWidth * k) / box.width;
      const h = (N * img.naturalHeight * k) / box.height;
      g.drawImage(img, (N - w) / 2, (N - h) / 2, w, h);
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
  <span class="art-fit" bind:this={fit} bind:clientWidth={boxW} bind:clientHeight={boxH} style:--w={item.w} style:--h={item.h} style:--s={2.2}>
    <img src={url} alt="The item to name" class:shown decoding="async" draggable="false" />
    <span class="veil" class:armed={it.flare > 0} role="group" aria-label="The veil: {it.lifted.filter(Boolean).length} of {PATCHES} patches lifted">
      {#each it.lifted as up, i (i)}
        <button
          class="patch"
          class:up
          class:bare={it.bare[i]}
          disabled={up || it.bare[i] || it.flare <= 0}
          aria-label="Patch {Math.floor(i / GRID) + 1}, {(i % GRID) + 1}{up ? ': lifted' : it.bare[i] ? ': nothing under it' : ''}"
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
  /* Big enough to tap a patch, whatever the item's size or shape. */
  .art-fit {
    min-width: min(100cqw, 7rem);
    min-height: min(100cqh, 7rem);
  }
  img {
    object-fit: contain;
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
  /* Over the letterbox alone: an empty slot. */
  .patch.bare {
    background: none;
    box-shadow: inset 0 0 0 1px rgba(125, 99, 51, 0.14);
  }
  .patch.up {
    opacity: 0;
    transform: scale(0.82);
    pointer-events: none;
  }
  /* A Flare in hand: every covered patch waits to be tapped. */
  .armed .patch:not(.up, .bare) {
    cursor: pointer;
    box-shadow:
      0 0 0 0.5px #0c0a08,
      inset 0 0 0 1px rgba(224, 138, 68, 0.6),
      inset 0 0 14px rgba(224, 138, 68, 0.18);
  }
  .armed .patch:not(.up, .bare):hover,
  .armed .patch:not(.up, .bare):focus-visible {
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
