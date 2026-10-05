<script lang="ts">
  import { onMount } from 'svelte';
  import { onPressure, pressing, pressureLevel } from '../lib/darkness';

  // Delve: the dark of a question's clock running down (lib/darkness.ts), at
  // the edges of the screen over the UI (the backdrop draws it beneath). It
  // is drawn at a seventh of the resolution and scaled up, which is what
  // softens it: drifting noise reaching in unevenly from the edges, never
  // over the middle. Holding still (effects off, reduced motion) it stops
  // drifting but still shows how far the clock has run.
  let { active }: { active: boolean } = $props();

  /** CSS px per texel. */
  const CELL = 7;
  /** A tileable noise texture (TILE x TILE), made once. */
  const TILE = 64;
  let tile: Float32Array | null = null;

  function makeTile() {
    const t = new Float32Array(TILE * TILE);
    for (const [period, weight] of [
      [4, 0.5],
      [8, 0.3],
      [16, 0.2],
    ]) {
      const lattice = Float32Array.from({ length: period * period }, Math.random);
      const at = (x: number, y: number) => lattice[(y % period) * period + (x % period)];
      const step = TILE / period;
      for (let y = 0; y < TILE; y++)
        for (let x = 0; x < TILE; x++) {
          const fx = x / step;
          const fy = y / step;
          const ix = Math.floor(fx);
          const iy = Math.floor(fy);
          let u = fx - ix;
          let v = fy - iy;
          u = u * u * (3 - 2 * u);
          v = v * v * (3 - 2 * v);
          const a = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * u;
          const b = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * u;
          t[y * TILE + x] += weight * (a + (b - a) * v);
        }
    }
    return t;
  }

  /** The noise at (x, y) in tile texels, wrapping, smoothly between texels. */
  function noise(t: Float32Array, x: number, y: number) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const u = x - ix;
    const v = y - iy;
    const x0 = ((ix % TILE) + TILE) % TILE;
    const y0 = ((iy % TILE) + TILE) % TILE;
    const x1 = (x0 + 1) % TILE;
    const y1 = (y0 + 1) % TILE;
    const a = t[y0 * TILE + x0] + (t[y0 * TILE + x1] - t[y0 * TILE + x0]) * u;
    const b = t[y1 * TILE + x0] + (t[y1 * TILE + x1] - t[y1 * TILE + x0]) * u;
    return a + (b - a) * v;
  }

  let canvas: HTMLCanvasElement;
  let shown = $state(false);
  let wake = () => {};

  onMount(() => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const still = () => reduceMotion.matches || document.documentElement.hasAttribute('data-still');
    let image: ImageData | null = null;
    let raf = 0;
    let last = -Infinity;
    let drawn = -1;
    let clock = 0;
    let lastNow = performance.now();

    function draw(level: number, t: number) {
      const W = innerWidth;
      const H = innerHeight;
      const cw = Math.ceil(W / CELL) + 1;
      const ch = Math.ceil(H / CELL) + 1;
      if (canvas.width !== cw || canvas.height !== ch || !image) {
        canvas.width = cw;
        canvas.height = ch;
        image = ctx!.createImageData(cw, ch);
        // The dark's colour, a warm near-black; only its alpha changes.
        for (let k = 0; k < image.data.length; k += 4) {
          image.data[k] = 5;
          image.data[k + 1] = 4;
          image.data[k + 2] = 3;
        }
      }
      tile ??= makeTile();
      const data = image.data;
      // How far in it reaches (CSS px): a band at the edges, with fingers
      // of it reaching further, never as far as the text in the middle (on
      // a phone the UI runs nearly to the sides, so it stays narrower there).
      const R = level * Math.min(W, H) * 0.15;
      const amp = 0.8 * R + 8;
      const soft = 0.4 * R + 8;
      const k = 34;
      const strength = 0.55 + 0.35 * level;
      const sx = W / (cw - 1);
      const sy = H / (ch - 1);
      // The clock itself keeps a little light about it, so its last
      // seconds can always be read.
      const ring = document.querySelector('[role=timer]')?.getBoundingClientRect();
      const rx = ring ? ring.x + ring.width / 2 : -1e4;
      const ry = ring ? ring.y + ring.height / 2 : -1e4;
      const rr = ring ? Math.max(ring.width, ring.height) / 2 + 10 : 0;
      for (let j = 0; j < ch; j++) {
        const y = j * sy;
        // Less from the bottom, where the answers are.
        const ey = Math.max(0, Math.min(1.1 * y, 1.7 * (H - y)));
        const fy = Math.exp(-ey / k);
        for (let i = 0; i < cw; i++) {
          const x = i * sx;
          const ex = Math.max(0, Math.min(x, W - x));
          const o = (j * cw + i) * 4 + 3;
          // Most of the screen is beyond its reach: skip the noise there.
          if (Math.min(ex, ey) > R + amp + soft) {
            data[o] = 0;
            continue;
          }
          const e = -k * Math.log(Math.exp(-ex / k) + fy);
          const n = 0.65 * noise(tile, x / 70 + t * 0.35, y / 70 - t * 0.25) + 0.35 * noise(tile, x / 30 - t * 0.6, y / 30 + t * 0.45);
          const v = Math.min(1, Math.max(0, ((R - e + amp * (n - 0.5)) / soft + 1) / 2));
          const dr = Math.hypot(x - rx, y - ry) + 24 * (n - 0.5);
          const clear = dr > 2 * rr ? 1 : Math.min(1, Math.max(0, (dr - rr) / rr));
          data[o] = 255 * strength * v * v * (3 - 2 * v) * clear;
        }
      }
      ctx!.putImageData(image, 0, 0);
    }

    function frame(now: number) {
      raf = 0;
      const level = active ? pressureLevel(now) : 0;
      const holding = still();
      if (!holding) clock += Math.max(0, Math.min(0.1, (now - lastNow) / 1000));
      lastNow = now;
      // At about 30fps while it drifts; holding still, in steps of a
      // fiftieth as the clock runs; once more when it has gone.
      const changed = holding ? Math.abs(level - drawn) > 0.02 || (level === 0 && drawn !== 0) : level !== drawn || level > 0;
      if (changed && (now - last >= 33 || level === 0)) {
        last = now;
        drawn = level;
        shown = level > 0.001;
        if (shown) draw(level, clock);
      }
      if ((active && pressing()) || drawn > 0) raf = requestAnimationFrame(frame);
    }
    wake = () => {
      if (raf) return;
      lastNow = performance.now();
      raf = requestAnimationFrame(frame);
    };
    const off = onPressure(wake);
    wake();
    return () => {
      off();
      cancelAnimationFrame(raf);
      wake = () => {};
    };
  });
  // Leaving a question's screen clears it at once; coming back picks it up.
  $effect(() => {
    void active;
    wake();
  });
</script>

<canvas bind:this={canvas} class:shown aria-hidden="true"></canvas>

<style>
  /* Over the UI, under the toasts, dialogs and effects; it never takes a click. */
  canvas {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: 10;
    pointer-events: none;
    display: none;
  }
  canvas.shown {
    display: block;
  }
</style>
