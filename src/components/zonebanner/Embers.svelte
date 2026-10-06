<script lang="ts">
  // Zone banner, "Embers": the zone's name written in light by its embers.
  // A spark runs out both ways from the middle of the kicker's line, leaving
  // a fine engraved rule; embers lift off it (and drift up from below) in
  // lazy curves and gather, from the middle outward, into the letters of the
  // name, whose light settles into the text as they arrive. It leaves by
  // breaking apart: left to right the letters come loose into embers that
  // rise, sway and go out, and the rule fades.
  //
  // The embers are drawn on a canvas, only while they move; at rest it is
  // plain text. For stepping the motion frame by frame (screenshots),
  // `window.__zbAt` set to a number of seconds holds the canvas at that time
  // of the phase it is in (entering, or leaving), as paused CSS animations are.
  import { onMount } from 'svelte';
  import { seeded } from '../../lib/arcane';
  import { watchHead, type Head } from './head';
  import { pen, type Pt, type Stroke } from './pen';

  let {
    title,
    sigil: _sigil,
    accent,
    leaving = false,
    still = false,
  }: { title: string; sigil: string; accent: string; leaving?: boolean; still?: boolean } = $props();

  let root: HTMLElement;
  let nameEl = $state<HTMLElement>();
  let canvas = $state<HTMLCanvasElement>();
  let head = $state<Head | null>(null);
  let nameW = $state(0);
  let nameH = $state(0);
  let em = $state(0);
  const chars = $derived([...title]);
  /** Room above the head for embers rising out of it, and below for those coming up. */
  const UP = 30;
  const DOWN = 8;

  const art = $derived.by(() => {
    if (!head || !nameW) return null;
    const cx = head.w / 2;
    // The rule under the name stays clear of the heading's capitals.
    const cy = Math.min(head.ky + (head.narrow ? 1 : 2), head.capTop - (head.narrow ? 4 : 6) - em * 0.62);
    const ry = cy + em * 0.62;
    const reach = Math.min(head.w / 2 - 6, nameW / 2 + (head.narrow ? 18 : 34));
    const strokes: Stroke[] = [];
    for (const s of [-1, 1]) {
      const end = cx + s * reach;
      strokes.push(...pen([[cx + s * 3.2, ry], [end, ry]], 'thin', 0.02, 0.42));
      // A lozenge at each end, and one at the middle.
      const lz = (c: Pt, a: number, b: number): Pt[] => [
        [c[0] - a, c[1]],
        [c[0], c[1] - b],
        [c[0] + a, c[1]],
        [c[0], c[1] + b],
        [c[0] - a, c[1]],
      ];
      strokes.push(...pen(lz([end + s * 3.6, ry], 2.6, 1.5), 'hair', 0.38, 0.18, { ease: false }));
    }
    const mid: Pt[] = [
      [cx - 3.2, ry],
      [cx, ry - 1.9],
      [cx + 3.2, ry],
      [cx, ry + 1.9],
      [cx - 3.2, ry],
    ];
    strokes.push(...pen(mid, 'hair', 0, 0.16, { ease: false }));
    return { cx, cy, ry, reach, strokes };
  });

  onMount(() =>
    watchHead(
      root,
      (h) => {
        head = h;
        if (nameEl) [nameW, nameH, em] = [nameEl.offsetWidth, nameEl.offsetHeight, parseFloat(getComputedStyle(nameEl).fontSize) || 18];
      },
      [nameEl],
    ),
  );

  // ---- the embers ---------------------------------------------------------

  type Target = { x: number; y: number };
  /** Points inside the letters as set, in the canvas's px, from the DOM's own glyph positions. */
  function targets(): Target[] {
    if (!nameEl || !art || !head) return [];
    const style = getComputedStyle(nameEl);
    const font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const box = nameEl.getBoundingClientRect();
    const scale = 2;
    const off = document.createElement('canvas');
    off.width = Math.ceil(box.width * scale) + 4;
    off.height = Math.ceil(box.height * scale) + 4;
    const g = off.getContext('2d', { willReadFrequently: true })!;
    g.scale(scale, scale);
    g.font = font;
    g.fillStyle = '#fff';
    g.textBaseline = 'alphabetic';
    const m = g.measureText(title);
    const lh = box.height;
    const base = (lh - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent;
    for (const span of nameEl.querySelectorAll<HTMLElement>('.ch')) {
      const r = span.getBoundingClientRect();
      g.fillText(span.textContent ?? '', r.left - box.left, base);
    }
    const data = g.getImageData(0, 0, off.width, off.height).data;
    const pts: Target[] = [];
    let covered = 0;
    for (let i = 3; i < data.length; i += 4 * 3) if (data[i] > 110) covered++;
    // About 600 embers, however long the name.
    const step = Math.max(2, Math.round(Math.sqrt((covered * 3) / 600)));
    const [ox, oy] = [box.left - root.getBoundingClientRect().left, box.top - root.getBoundingClientRect().top + UP];
    for (let y = 0; y < off.height; y += step)
      for (let x = (y / step) % 2 ? step / 2 : 0; x < off.width; x += step)
        if (data[(Math.floor(y) * off.width + Math.floor(x)) * 4 + 3] > 110) pts.push({ x: ox + x / scale, y: oy + y / scale });
    return pts;
  }

  type Ember = { tx: number; ty: number; sx: number; sy: number; kx: number; ky: number; t0: number; T: number; r: number };

  /** A soft ember of light in `color` (any CSS colour), white-hot at its heart. */
  function sprite(color: string) {
    const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
    probe.fillStyle = color;
    probe.fillRect(0, 0, 1, 1);
    const [r, g0, b] = probe.getImageData(0, 0, 1, 1).data;
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255, 244, 222, 0.95)');
    grad.addColorStop(0.16, `rgba(${r}, ${g0}, ${b}, 0.9)`);
    grad.addColorStop(0.4, `rgba(${r}, ${g0}, ${b}, 0.22)`);
    grad.addColorStop(1, `rgba(${r}, ${g0}, ${b}, 0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 32);
    return c;
  }

  /** The embers' colour as the page resolves it. */
  function emberColor() {
    const probe = document.createElement('i');
    probe.style.color = 'var(--ember)';
    root.append(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c || 'rgb(240, 172, 96)';
  }

  const atHeld = () => (window as unknown as { __zbAt?: number }).__zbAt;

  /** Runs the canvas through one phase: `draw(t)` until it says it is done. */
  function animate(draw: (t: number) => boolean) {
    const start = performance.now();
    let id = 0;
    const frame = () => {
      const held = atHeld();
      const t = typeof held === 'number' ? held : (performance.now() - start) / 1000;
      if (draw(t) && typeof held !== 'number') return;
      id = requestAnimationFrame(frame);
    };
    id = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(id);
  }

  function setup() {
    if (!canvas || !head) return null;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const [cw, ch] = [head.w, head.h + UP + DOWN];
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    const g = canvas.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { g, cw, ch, spr: sprite(emberColor()) };
  }

  // Both phases run to their end (or until it is removed), whatever is measured again meanwhile.
  const stops: (() => void)[] = [];
  onMount(() => () => stops.forEach((s) => s()));

  // The gathering: once the name is set and measured (and its font loaded).
  let started = false;
  $effect(() => {
    if (!art || still || started || !canvas) return;
    started = true;
    document.fonts.ready.then(() => {
      const c = setup();
      if (!c || !art) return;
      const pts = targets();
      const rnd = seeded(7);
      const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;
      const ry = art.ry + UP;
      const half = Math.max(1, nameW / 2);
      const embers: Ember[] = pts.map((p) => {
        const fromLine = rnd() < 0.62;
        const sx = fromLine ? p.x + gauss() * 34 : p.x + gauss() * 90;
        const sy = fromLine ? ry + (rnd() - 0.5) * 2 : c.ch - rnd() * 4;
        // The spark reaches |sx - cx| along the rule as it runs out (eased as the pen is).
        const u = Math.min(1, Math.abs(sx - art.cx) / art.reach);
        const reached = 0.02 + (1 - Math.sqrt(1 - u)) * 0.42;
        const order = Math.abs(p.x - art.cx) / half;
        const t0 = Math.max(fromLine ? reached : 0.05, 0.08 + order * 0.32) + rnd() * 0.12;
        const side = rnd() < 0.5 ? -1 : 1;
        return {
          tx: p.x,
          ty: p.y,
          sx,
          sy,
          kx: (sx + p.x) / 2 + side * (12 + rnd() * 26),
          ky: Math.min(sy, p.y) - 4 - rnd() * 16,
          t0,
          T: 0.42 + rnd() * 0.3,
          r: 0.75 + rnd() * 0.55,
        };
      });
      const ease = (u: number) => 1 - Math.pow(1 - u, 3);
      stops.push(animate((t) => {
        const g = c.g;
        g.globalCompositeOperation = 'destination-out';
        g.fillStyle = 'rgba(0,0,0,0.42)';
        g.fillRect(0, 0, c.cw, c.ch);
        if (typeof atHeld() === 'number') g.clearRect(0, 0, c.cw, c.ch);
        g.globalCompositeOperation = 'lighter';
        let alive = false;
        for (const e of embers) {
          const u = (t - e.t0) / e.T;
          if (u < 0) {
            alive = true;
            continue;
          }
          // Arrived: its light passes into the letter's.
          const fade = u <= 1 ? 1 : 1 - (t - e.t0 - e.T) / 0.3;
          if (fade <= 0) continue;
          alive = true;
          const v = ease(Math.min(1, u));
          const [x, y] = [
            (1 - v) * (1 - v) * e.sx + 2 * (1 - v) * v * e.kx + v * v * e.tx,
            (1 - v) * (1 - v) * e.sy + 2 * (1 - v) * v * e.ky + v * v * e.ty,
          ];
          // Dimmer as it nears its place, so the letter kindles rather than flares.
          g.globalAlpha = Math.min(1, u * 6) * fade * (u < 1 ? 0.75 - 0.35 * v : 0.35);
          const s = e.r * (u < 1 ? 3.4 : 2.6);
          g.drawImage(c.spr, x - s, y - s, 2 * s, 2 * s);
        }
        g.globalAlpha = 1;
        if (!alive) g.clearRect(0, 0, c.cw, c.ch);
        return !alive;
      }));
    });
  });

  // The breaking apart, left to right.
  let left = false;
  $effect(() => {
    if (!leaving || still || left || !canvas || !art) return;
    left = true;
    const c = setup();
    if (!c) return;
    const pts = targets();
    const rnd = seeded(13);
    const x0 = art.cx - nameW / 2;
    const embers = pts
      .filter(() => rnd() < 0.85)
      .map((p) => ({
        x: p.x,
        y: p.y,
        t0: ((p.x - x0) / Math.max(1, nameW)) * 0.5 + rnd() * 0.08,
        life: 0.6 + rnd() * 0.55,
        vx: (rnd() - 0.5) * 16,
        vy: -(12 + rnd() * 26),
        r: 0.7 + rnd() * 0.5,
        sway: 3 + rnd() * 5,
        ph: rnd() * 6.28,
      }));
    stops.forEach((s) => s());
    stops.push(animate((t) => {
      const g = c.g;
      g.clearRect(0, 0, c.cw, c.ch);
      g.globalCompositeOperation = 'lighter';
      let alive = false;
      for (const e of embers) {
        const a = t - e.t0;
        if (a < 0) {
          alive = true;
          continue;
        }
        const u = a / e.life;
        if (u >= 1) continue;
        alive = true;
        // Lifted on the heat: faster as it rises, swaying, going out.
        const x = e.x + e.vx * a + Math.sin(e.ph + a * 7) * e.sway * u;
        const y = e.y + e.vy * a - 30 * a * a;
        g.globalAlpha = (u < 0.1 ? 0.6 + u * 4 : 1) * (1 - u) * 0.8;
        const s = e.r * 3.6 * (1 - u * 0.5);
        g.drawImage(c.spr, x - s, y - s, 2 * s, 2 * s);
      }
      g.globalAlpha = 1;
      return !alive;
    }));
  });
</script>

<div class="zb embers" class:leaving class:still bind:this={root} style:--accent={accent} aria-hidden="true">
  {#if art}
    <div class="pool" style:left="{art.cx - art.reach - 14}px" style:top="{art.cy - nameH}px" style:width="{2 * art.reach + 28}px" style:height="{2 * nameH}px"></div>
    <svg class="art glow">
      {#each art.strokes as s, i (i)}<path d={s.d} class={s.kind} />{/each}
    </svg>
    <svg class="art lines">
      {#each art.strokes as s, i (i)}
        <path d={s.d} class="draw {s.kind}" style:--d="{s.delay.toFixed(3)}s" style:--t="{s.t.toFixed(3)}s" pathLength="100" />
      {/each}
    </svg>
    <!-- The spark running out each way along the rule. -->
    {#each [-1, 1] as s (s)}
      <i class="spark" style:left="{art.cx}px" style:top="{art.ry}px" style:--to="{s * art.reach}px"></i>
    {/each}
  {/if}
  <canvas bind:this={canvas} style:top="-{UP}px" style:height="calc(100% + {UP + DOWN}px)"></canvas>
  <span class="name" class:set={!!art} bind:this={nameEl} style:left="{art ? art.cx : 0}px" style:top="{art ? art.cy : 0}px"
    >{#each chars as c, i (i)}<span class="ch">{c}</span>{/each}</span
  >
</div>

<style>
  .zb {
    position: absolute;
    inset: 0;
    z-index: 2;
    pointer-events: none;
    --ink: color-mix(in srgb, var(--accent) 30%, #d3a35a);
    --ember: color-mix(in srgb, var(--accent) 75%, #ffb060);
    --glow-c: color-mix(in srgb, var(--accent) 70%, #d9a45a);
  }
  canvas {
    position: absolute;
    left: 0;
    width: 100%;
  }
  .art {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  path {
    fill: none;
    stroke: var(--ink);
    stroke-linecap: butt;
    stroke-linejoin: miter;
  }
  .thin {
    stroke-width: 0.6;
  }
  .hair {
    stroke-width: 0.45;
  }
  .glow {
    opacity: 0.3;
    animation: glow-in 1s 0.5s ease-out both;
  }
  .glow path {
    stroke: var(--glow-c);
    stroke-width: 2.2;
  }
  .draw {
    stroke-dasharray: 100;
    animation: draw var(--t) var(--d) linear both;
  }
  .pool {
    position: absolute;
    border-radius: 50%;
    background: radial-gradient(closest-side, rgba(7, 5, 4, 0.75), rgba(7, 5, 4, 0.5) 55%, transparent);
    animation: fade-in 0.5s ease-out both;
  }
  .spark {
    position: absolute;
    width: 9px;
    height: 9px;
    margin: -4.5px 0 0 -4.5px;
    border-radius: 50%;
    background: radial-gradient(closest-side, #fff8e6, var(--ember) 40%, transparent);
    opacity: 0;
    animation: spark 0.46s 0.02s cubic-bezier(0.25, 0.6, 0.45, 1) both;
  }

  .name {
    position: absolute;
    translate: -50% -50%;
    visibility: hidden;
    white-space: pre;
    font-family: var(--font-display);
    font-weight: 900;
    font-size: clamp(1.05rem, 1.3vw + 0.55rem, 1.36rem);
    line-height: 1.15;
    letter-spacing: 0.05em;
    color: color-mix(in srgb, var(--accent) 28%, #fbe9c4);
    text-shadow:
      0 0 7px color-mix(in srgb, var(--accent) 70%, transparent),
      0 0 18px color-mix(in srgb, var(--accent) 40%, transparent),
      0 1px 2px rgba(0, 0, 0, 0.9);
  }
  /* Its light comes up as the embers settle into it. */
  .name.set {
    visibility: visible;
    animation: kindle 0.55s 0.62s ease-out both;
  }
  /* Leaving: the letters come loose left to right as the embers lift off. */
  .leaving .name {
    mask-image: linear-gradient(90deg, transparent 40%, #000 60%);
    mask-size: 260% 100%;
    animation: loosen 0.62s ease-in both;
  }
  .leaving .art,
  .leaving .pool {
    animation: fade-out 0.7s 0.35s ease-in both;
  }

  @keyframes kindle {
    from {
      opacity: 0;
      filter: blur(2px);
    }
  }
  @keyframes loosen {
    from {
      mask-position: 100% 0;
    }
    to {
      mask-position: 0 0;
    }
  }
  @keyframes spark {
    0% {
      opacity: 0;
      transform: translateX(0);
    }
    15% {
      opacity: 1;
    }
    80% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      transform: translateX(var(--to));
    }
  }
  @keyframes draw {
    from {
      stroke-dashoffset: 100;
    }
  }
  @keyframes fade-in {
    from {
      opacity: 0;
    }
  }
  @keyframes fade-out {
    to {
      opacity: 0;
    }
  }
  @keyframes glow-in {
    from {
      opacity: 0;
    }
  }

  .still :global(*) {
    animation: none !important;
  }
  .still .spark,
  .still canvas {
    display: none;
  }
  .still.leaving .name {
    mask-image: none;
  }
</style>
