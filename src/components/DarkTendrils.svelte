<script lang="ts">
  import { onMount } from 'svelte';
  import { motion } from '../lib/motion.svelte';
  import { CLOCK_PEAK, OVERSHOOT, onPressure, pressing, pressureLevel } from '../lib/darkness';
  import { whenIdle } from '../lib/fx/gl';

  // Delve, on the CSS backdrop (Background.svelte, without WebGL): the dark
  // of a question's clock running down (lib/darkness.ts), as the WebGL
  // backdrop draws it (tendrils() in lib/backdrop.ts). It is smoke rather
  // than black: arms of blue-black smoke curl in from every side, each
  // hooking round at its tip with a faint blue light caught on its rim,
  // longer as the clock runs out, over billows of indigo and violet along
  // the edges, a shade of deep indigo at the very edges and a dimming of the
  // whole scene. Each arm is one soft drawing (tentacle below, made once),
  // half of them turned the other way, and they sway slowly, as the billows
  // drift, each on its own cycle (still with reduced motion or the effects
  // off). As a question ends the dark settles as it went (resolveDark): a
  // miss reaches the arms right across the scene and dims it deep, and a
  // right answer's light, past the dark it drove off, warms the scene a
  // touch for a moment. Only opacity, a custom property and transforms
  // change, so nothing is laid out again; holding still it follows the
  // clock in steps of a twentieth.

  type Side = 'top' | 'right' | 'bottom' | 'left';
  /**
   * How far the arms reach (--reach) for the dark `p` (pressureLevel): to
   * about 1 as the clock runs out (CLOCK_PEAK), and on to about 1.8 as a
   * miss swallows the scene (SWALLOW), so the surge has room to show.
   */
  const reachOf = (p: number) =>
    p <= 1 ? 0.85 * p : p <= CLOCK_PEAK ? 0.85 + 0.45 * (p - 1) : 0.85 + 0.45 * (CLOCK_PEAK - 1) + 1.3 * (p - CLOCK_PEAK);

  /** Along its side (%), how far it can reach (half screens, at the dark's fullest), which way it curls, its sway (s, and how far into it). */
  const ARMS: { side: Side; at: number; reach: number; flip: boolean; dur: number; delay: number }[] = [
    { side: 'top', at: 14, reach: 0.62, flip: false, dur: 9.5, delay: -2 },
    { side: 'top', at: 47, reach: 0.38, flip: true, dur: 12, delay: -7 },
    { side: 'top', at: 78, reach: 0.72, flip: true, dur: 10.5, delay: -4 },
    { side: 'right', at: 22, reach: 0.5, flip: false, dur: 11, delay: -1 },
    { side: 'right', at: 66, reach: 0.78, flip: true, dur: 8.5, delay: -5 },
    { side: 'bottom', at: 24, reach: 0.7, flip: false, dur: 12.5, delay: -3 },
    { side: 'bottom', at: 58, reach: 0.42, flip: true, dur: 9, delay: -8 },
    { side: 'bottom', at: 88, reach: 0.56, flip: false, dur: 11.5, delay: -6 },
    { side: 'left', at: 36, reach: 0.74, flip: true, dur: 10, delay: -9 },
    { side: 'left', at: 80, reach: 0.46, flip: false, dur: 13, delay: -2.5 },
  ];
  const TURN: Record<Side, number> = { top: 0, right: 90, bottom: 180, left: -90 };
  /** An arm's place and length (its box twice as long as it is wide, as the drawing): its root on the edge, pointing in. */
  function place(f: (typeof ARMS)[number]) {
    const across = f.side === 'top' || f.side === 'bottom';
    // Its curl ends well short of the box's end.
    const len = 2 * (0.05 + f.reach) * 50;
    const unit = across ? 'vh' : 'vw';
    const left = f.side === 'left' ? '0%' : f.side === 'right' ? '100%' : `${f.at}%`;
    const top = f.side === 'top' ? '0%' : f.side === 'bottom' ? '100%' : `${f.at}%`;
    return { left, top, len: `${len.toFixed(1)}${unit}`, width: `${(len / 2).toFixed(1)}${unit}`, turn: `${TURN[f.side]}deg` };
  }

  /**
   * Billows of the dark's smoke along the edges (centre, % of the screen;
   * size, vmin; colour; drift, s): deep indigo, violet and a colder blue,
   * half off the screen, so they roll in from beyond it.
   */
  const BILLOWS: { x: number; y: number; size: number; rgb: string; dur: number; delay: number }[] = [
    { x: -4, y: 18, size: 78, rgb: '30, 26, 96', dur: 19, delay: -3 },
    { x: 104, y: 36, size: 70, rgb: '52, 26, 98', dur: 23, delay: -11 },
    { x: 30, y: 104, size: 84, rgb: '28, 44, 128', dur: 21, delay: -6 },
    { x: 78, y: -4, size: 72, rgb: '44, 24, 92', dur: 17, delay: -9 },
    { x: -2, y: 86, size: 66, rgb: '46, 26, 100', dur: 25, delay: -14 },
    { x: 102, y: 94, size: 74, rgb: '30, 30, 104', dur: 20, delay: -2 },
  ];

  /**
   * The spine of an arm of smoke in a `w` by `h` drawing, its root at the
   * top middle: it heads down, leaning a little one way, and curls the other
   * way ever tighter into a hook at its tip; and how thick it is along it.
   */
  function spine(w: number, h: number): { x: number; y: number; r: number }[] {
    const out: { x: number; y: number; r: number }[] = [];
    const n = 200;
    const ds = (1.35 * h) / n;
    let x = w / 2;
    let y = 0;
    let heading = Math.PI / 2 - 0.45;
    for (let i = 0; i <= n; i++) {
      const s = i / n;
      out.push({ x, y, r: w * (0.17 * (1 - s) ** 0.9 + 0.018) });
      heading += ((0.3 + 24 * s ** 3) / h) * ds;
      x += Math.cos(heading) * ds;
      y += Math.sin(heading) * ds;
    }
    return out;
  }

  /**
   * Draws an arm of the dark once, soft (a blurred shadow: the shape itself
   * is drawn off the canvas): a haze of violet blue about it, a faint blue
   * rim on the side the light catches, and its blue-black body. A URL of it,
   * or null where it can't be drawn (the arms are then plain soft shades).
   */
  async function tentacle(): Promise<string | null> {
    const w = 256;
    const h = 512;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    if (!g) return null;
    const pts = spine(w, h);
    const soft = (color: string, blur: number, grow: number, dx: number, dy: number) => {
      g.save();
      g.shadowColor = color;
      g.shadowBlur = blur;
      g.shadowOffsetX = 2 * w;
      g.fillStyle = '#000';
      g.beginPath();
      for (const p of pts) {
        const r = p.r * grow;
        g.moveTo(p.x - 2 * w + dx + r, p.y + dy);
        g.arc(p.x - 2 * w + dx, p.y + dy, r, 0, 2 * Math.PI);
      }
      g.fill();
      g.restore();
    };
    soft('rgba(44, 34, 120, 0.4)', 36, 1.6, 0, 0);
    soft('rgba(96, 132, 240, 0.55)', 8, 1.08, 5, -4);
    soft('rgba(5, 4, 18, 0.94)', 14, 1, 0, 0);
    const blob = await new Promise<Blob | null>((done) => c.toBlob(done));
    return blob ? URL.createObjectURL(blob) : null;
  }

  let el: HTMLDivElement;
  let dim: HTMLDivElement;
  let lift: HTMLDivElement;

  onMount(() => {
    const still = () => motion.still;
    let raf = 0;
    let shown = -1;

    function frame(now: number) {
      raf = 0;
      const p = pressureLevel(now);
      if (Math.abs(p - shown) > (still() ? 0.05 : 0.004) || (p === 0 && shown !== 0)) {
        shown = p;
        const on = p > 0.001;
        el.style.visibility = on ? 'visible' : 'hidden';
        // Faint while the clock has long to run (as the WebGL backdrop's).
        el.style.opacity = on ? Math.min(1, 3 * p).toFixed(3) : '0';
        // (Reaching further over the clock's last seconds, but leaving room
        // for a miss, which swallows the scene, to surge much further.)
        el.style.setProperty('--reach', on ? reachOf(p).toFixed(3) : '0');
        dim.style.opacity = on ? (0.3 * p).toFixed(3) : '0';
        lift.style.opacity = p < -0.001 ? Math.min(1, -p / OVERSHOOT).toFixed(3) : '0';
        if (on) draw();
      }
      if (pressing() || shown > 0) raf = requestAnimationFrame(frame);
    }
    const wake = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    // The arms' drawing, made once (nothing shows it before the clock runs):
    // in an idle moment, or as the dark first comes in if that's sooner, not
    // as the backdrop mounts.
    let url: string | null = null;
    let gone = false;
    let drawn = false;
    const stopIdle = whenIdle(draw, 2000);
    function draw() {
      if (drawn) return;
      drawn = true;
      stopIdle();
      tentacle()
        .then((u) => {
          if (gone) {
            if (u) URL.revokeObjectURL(u);
            return;
          }
          url = u;
          if (u) el.style.setProperty('--tentacle', `url("${u}")`);
        })
        .catch(() => {});
    }
    const off = onPressure(wake);
    wake();
    return () => {
      gone = true;
      stopIdle();
      off();
      cancelAnimationFrame(raf);
      if (url) URL.revokeObjectURL(url);
    };
  });
</script>

<div class="dimmed" bind:this={dim} aria-hidden="true"></div>
<div class="lift" bind:this={lift} aria-hidden="true"></div>
<div class="tendrils" bind:this={el} aria-hidden="true">
  <div class="rim"></div>
  {#each BILLOWS as b, i (i)}
    <span
      class="billow"
      style:left="{b.x}%"
      style:top="{b.y}%"
      style:width="{b.size}vmin"
      style:height="{b.size}vmin"
      style:--smoke={b.rgb}
      style:animation-duration="{b.dur}s"
      style:animation-delay="{b.delay}s"
    ></span>
  {/each}
  {#each ARMS as f, i (i)}
    {@const at = place(f)}
    <span
      class="arm"
      style:left={at.left}
      style:top={at.top}
      style:width={at.width}
      style:height={at.len}
      style:rotate={at.turn}
      style:--flip={f.flip ? -1 : 1}
      style:animation-duration="{f.dur}s"
      style:animation-delay="{f.delay}s"
    ></span>
  {/each}
</div>

<style>
  .tendrils,
  .dimmed,
  .lift {
    position: absolute;
    inset: 0;
    pointer-events: none;
    opacity: 0;
  }
  .tendrils {
    --reach: 0;
    visibility: hidden;
    overflow: hidden;
  }
  /* Toward a deep blue-black rather than black. */
  .dimmed {
    background: #04030c;
  }
  /* A right answer's light, past the dark it drove off: the scene a touch
     warmer and brighter for a moment, most at its middle. */
  .lift {
    background: radial-gradient(120% 100% at 50% 45%, rgba(255, 214, 160, 0.07), rgba(255, 200, 140, 0.03) 60%, transparent);
  }
  /* The shade along the edges every arm grows out of, deep indigo, eased
     like a Gaussian so it shows no line. */
  .rim {
    position: absolute;
    inset: 0;
    --edge: rgba(5, 4, 18, 0.6), rgba(5, 4, 18, 0.44) 4%, rgba(6, 5, 22, 0.22) 9%, rgba(6, 5, 22, 0.07) 15%, transparent 21%;
    background:
      linear-gradient(to right, var(--edge)),
      linear-gradient(to left, var(--edge)),
      linear-gradient(to bottom, var(--edge)),
      linear-gradient(to top, var(--edge));
  }
  /* A billow of the dark's smoke, rolling in from the edge it sits on: more
     of it, and nearer, as the dark comes in. */
  .billow {
    position: absolute;
    translate: -50% -50%;
    scale: calc(0.6 + 0.4 * var(--reach));
    border-radius: 50%;
    background: radial-gradient(closest-side, rgba(var(--smoke), 0.38), rgba(var(--smoke), 0.24) 40%, rgba(var(--smoke), 0.08) 72%, transparent);
    will-change: transform, scale;
    animation: billow ease-in-out infinite alternate;
  }
  @keyframes billow {
    0% {
      transform: translate(-4%, 3%) scale(0.94);
    }
    100% {
      transform: translate(5%, -4%) scale(1.08);
    }
  }
  /* An arm: its root on the edge (the top of its box, turned to point in),
     as long as the dark has come in, and turned over (--flip) to curl the
     other way. Its drawing is the tentacle above; without one, a soft
     shade, the stops following exp(-5.6 t²). */
  .arm {
    --flip: 1;
    position: absolute;
    translate: -50% 0;
    transform-origin: 50% 0;
    scale: calc(var(--flip) * (0.35 + 0.65 * var(--reach))) calc(0.08 + 0.92 * var(--reach));
    background: var(
        --tentacle,
        radial-gradient(
          26% 100% at 50% 0%,
          rgba(5, 4, 18, 0.85),
          rgba(5, 4, 18, 0.75) 15%,
          rgba(6, 5, 22, 0.51) 30%,
          rgba(6, 5, 22, 0.27) 45%,
          rgba(6, 5, 22, 0.11) 60%,
          rgba(6, 5, 22, 0.03) 75%,
          transparent
        )
      )
      center / 100% 100% no-repeat;
    will-change: transform, scale;
    animation: writhe ease-in-out infinite alternate;
  }
  @keyframes writhe {
    0% {
      transform: rotate(-7deg) skewX(5deg) scaleX(1.1);
    }
    50% {
      transform: rotate(2deg) skewX(-2deg) scaleX(0.9);
    }
    100% {
      transform: rotate(8deg) skewX(-6deg) scaleX(1.05);
    }
  }
  :global(html[data-still]) :is(.arm, .billow) {
    animation: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .arm,
    .billow {
      animation: none;
    }
  }
</style>
