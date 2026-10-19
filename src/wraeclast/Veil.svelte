<script lang="ts">
  // The Veil: the item's art cut into small organic patches (the game's own
  // cut, lib/patches.ts, about tuning.seeds a side over the art), burned in as
  // the game burns its veiled art (lib/materialize.ts, lib/frontier.ts). The
  // art is decoded and cut first; the run is then told which patches touch
  // which (run.open), and burns in a cluster of them at a time (a Torch).
  // Each patch the run burns comes in here, a
  // few at a time; a right answer burns in the rest quickly (the finale).
  // It fills the square frame its parent gives it, the art fit inside and
  // centred, so every item looks the same from outside: until a patch burns
  // in nothing on it follows the art's shape. Nothing says how many patches
  // are left.
  import { onMount } from 'svelte';
  import { itemImage } from '../lib/ui-paths';
  import { labelPatches, litMask, patchShapes, spreadOrder, type PatchShape } from '../lib/patches';
  import { VeilCut } from '../lib/veilCut';
  import { materialize, FINALE_MS, type BurnParams } from '../lib/materialize';
  import { frontier } from '../lib/frontier';
  import type { ShownPatch } from '../lib/media.svelte';
  import { sfx } from '../lib/sound';
  import { gridAdjacency, itemOf, type Run } from './rules';

  let { run }: { run: Run } = $props();
  const it = $derived(run.state.item!);
  const item = $derived(itemOf(it.itemId));
  const W = $derived(item.w);
  const H = $derived(item.h);
  const named = $derived(run.state.phase === 'solved');

  /** How long a patch takes to burn in, ms. */
  const BURN = 1300;
  /** Between one patch of a burn-in and the next, ms. */
  const GAP = 160;

  let shapes = $state.raw<PatchShape[]>([]);
  let cut: VeilCut<HTMLCanvasElement> | null = null;
  let order: number[] = [];
  /** The patches on the page, in the order they came in. */
  let shown = $state<ShownPatch[]>([]);
  /** The art couldn't be cut (it didn't load): shown whole once named. */
  let plain = $state(false);
  let quick = $state(false);
  let timers: ReturnType<typeof setTimeout>[] = [];

  /** Which patches touch which, from their edges ((x, y, patch) triples). */
  const adjacencyOf = (list: PatchShape[]) =>
    list.map((p) => {
      const near = new Set<number>();
      for (let j = 2; j < p.edges.length; j += 3) near.add(p.edges[j]);
      return [...near];
    });

  const canvas = (w: number, h: number) => Object.assign(document.createElement('canvas'), { width: w, height: h });

  /** Cuts the decoded art: its visible pixels (at art size) cut into patches about `seeds` a side across the art itself. */
  function cutArt(img: HTMLImageElement) {
    const S = Math.max(1, Math.round(img.naturalWidth / W));
    const full = canvas(W * S, H * S);
    const fg = full.getContext('2d', { willReadFrequently: true })!;
    fg.imageSmoothingQuality = 'high';
    fg.drawImage(img, 0, 0, full.width, full.height);
    const small = canvas(W, H);
    const sg = small.getContext('2d', { willReadFrequently: true })!;
    sg.imageSmoothingQuality = 'high';
    sg.drawImage(full, 0, 0, W, H);
    const lit = litMask(sg.getImageData(0, 0, W, H).data, W, H);
    let on = 0;
    for (const v of lit) on += v;
    if (!on) return null;
    // labelPatches puts size² × the art's share of its box seeds on it: so many a side over the art itself.
    const size = run.state.tuning.seeds / Math.sqrt(on / (W * H));
    const seed = (run.state.seed ^ Math.imul(it.n + 1, 0x9e3779b1)) >>> 0;
    const list = patchShapes(labelPatches(W, H, size, seed, lit), W, H);
    if (!list.length) return null;
    cut = new VeilCut({ w: W, h: H, data: new ArrayBuffer(0), labels: new Uint16Array() }, canvas, { shapes: list, lit, pixels: fg.getImageData(0, 0, full.width, full.height) });
    order = spreadOrder(list, seed);
    return list;
  }

  /** How long an item waits for a picture that neither loads nor fails (a stalled request on a phone). */
  const PICTURE_WAIT = 8000;

  onMount(() => {
    let live = true;
    const img = new Image();
    img.src = itemImage(it.itemId);
    // The item waits for its picture (the clock starts at open()); a picture that fails to load, or stalls past PICTURE_WAIT, opens on a plain grid.
    let stalled: ReturnType<typeof setTimeout> | undefined;
    Promise.race([
      img.decode().then(() => 'ok' as const, () => 'failed' as const),
      new Promise<'failed'>((done) => (stalled = setTimeout(() => done('failed'), PICTURE_WAIT))),
    ]).then((got) => {
      clearTimeout(stalled);
      if (!live) return;
      let list: PatchShape[] | null = null;
      try {
        if (got === 'ok') list = cutArt(img);
      } catch {
        list = null;
      }
      if (list) {
        shapes = list;
        run.open(adjacencyOf(list));
      } else {
        plain = true;
        run.open(gridAdjacency(run.state.tuning.seeds));
      }
    });
    return () => {
      live = false;
      clearTimeout(stalled);
      for (const t of timers) clearTimeout(t);
    };
  });

  const patchOf = (i: number): ShownPatch => {
    const p = shapes[i];
    return { i, x: p.x, y: p.y, w: p.w, h: p.h, edges: p.edges, picture: () => cut!.picture(i) };
  };

  /** Patches the run has burned that are on their way in (queued, not on the page yet). */
  let queued = new Set<number>();
  // Each patch the run burns comes in, one after another.
  $effect(() => {
    const burned = it.burned;
    if (!shapes.length) return;
    let k = 0;
    for (const i of burned) {
      if (queued.has(i)) continue;
      queued.add(i);
      const at = k++ * (quick ? Math.min(30, 300 / shapes.length) : GAP);
      timers.push(setTimeout(() => (shown = [...shown, patchOf(i)]), at));
    }
  });
  // Named: the rest of the art comes in quickly, as the game's does.
  $effect(() => {
    if (!named || quick || !shapes.length) return;
    quick = true;
    const gap = Math.min(30, 300 / shapes.length);
    let k = 0;
    for (const i of order) {
      if (queued.has(i)) continue;
      queued.add(i);
      timers.push(setTimeout(() => (shown = [...shown, patchOf(i)]), k++ * gap));
    }
  });

  function appear(node: HTMLCanvasElement, params: BurnParams) {
    if (!params.quick) sfx('burn', { from: { from: node } });
    return materialize(node, params);
  }

  const burnedCount = $derived(it.burned.length);
  /** Whether the art is all in: the finale's done. */
  const whole = $derived(named && shapes.length > 0 && shown.length === shapes.length);
  let settled = $state(false);
  $effect(() => {
    if (!whole) return;
    const t = setTimeout(() => (settled = true), FINALE_MS + 80);
    return () => clearTimeout(t);
  });
</script>

<span class="art-slot">
  <span class="corner tl" aria-hidden="true"></span><span class="corner tr" aria-hidden="true"></span><span class="corner bl" aria-hidden="true"></span><span class="corner br" aria-hidden="true"></span>
  <span
    class="art-fit veil"
    style:--w={W}
    style:--h={H}
    style:--s={2.2}
    role="img"
    aria-label={named ? "The item's art" : burnedCount ? "The item's art, patches revealed" : "The item's art, hidden"}
  >
    {#if !plain && !shapes.length}
      <span class="loading">Loading the art</span>
    {:else if plain}
      {#if named}<img src={itemImage(it.itemId)} alt="" />{/if}
    {:else}
      {#each shown as p (p.i)}
        <canvas
          class="patch"
          aria-hidden="true"
          style:left="{(p.x / W) * 100}%"
          style:top="{(p.y / H) * 100}%"
          style:width="{(p.w / W) * 100}%"
          style:height="{(p.h / H) * 100}%"
          use:appear={{ picture: p.picture, w: p.w, h: p.h, edges: p.edges, before: shown.filter((o) => o.i !== p.i).map((o) => o.i), burn: BURN, quick }}
        ></canvas>
      {/each}
      {#if !settled}<canvas class="frontier" aria-hidden="true" use:frontier={{ w: W, h: H, burn: BURN, quick, patches: shown }}></canvas>{/if}
    {/if}
  </span>
</span>

<style>
  .loading {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    font-size: 0.85rem;
    color: var(--muted);
    animation: breathe 1.6s ease-in-out infinite alternate;
  }
  @keyframes breathe {
    from {
      opacity: 0.35;
    }
    to {
      opacity: 0.9;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .loading {
      animation: none;
    }
  }
  .art-slot {
    position: absolute;
    inset: 0;
  }
  .patch {
    position: absolute;
    display: block;
  }
  /* The fire along seams where the item is still missing a part, as light over the patches. */
  .frontier {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    mix-blend-mode: screen;
  }
  @supports (mix-blend-mode: plus-lighter) {
    .frontier {
      mix-blend-mode: plus-lighter;
    }
  }
  img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  /* The square frame, marked at its corners only (never the art's own box: its shape would tell the item's kind before a burn-in). */
  .corner {
    position: absolute;
    width: 12px;
    height: 12px;
    border: 0 solid rgba(201, 164, 92, 0.35);
    pointer-events: none;
  }
  .tl {
    top: 0;
    left: 0;
    border-width: 1px 0 0 1px;
  }
  .tr {
    top: 0;
    right: 0;
    border-width: 1px 1px 0 0;
  }
  .bl {
    bottom: 0;
    left: 0;
    border-width: 0 0 1px 1px;
  }
  .br {
    bottom: 0;
    right: 0;
    border-width: 0 1px 1px 0;
  }
</style>
