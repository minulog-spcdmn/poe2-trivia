<script lang="ts">
  // The charge on the Sulphite card's face (the Sulphite rush):
  // the bolts engraved on it (lib/sulphite/plate) lit. The plate is still;
  // this is what moves.
  //
  // • Now and then one bolt crackles, faintly and briefly: the charge it
  //   holds.
  // • The pointer on the card: the bolt nearest it strikes, then holds lit,
  //   humming; the pointer moved on, the next one takes over.
  // • Dealt face up, the bolts strike round the ring from its foot up,
  //   both sides together; picked, all of them at once
  //   (lib/sulphite/moments).
  //
  // Each bolt is a layer of its own, sized to its bolt, and only its
  // opacity changes, so the compositor plays it without drawing the face
  // again (docs/category-cards.md, rules 7 to 9).
  import { onMount } from 'svelte';
  import { engrave } from '../lib/cardEngraving';
  import { SULPHITE_PLATE, boltsAt, type Bolt } from '../lib/sulphite/plate';
  import { motion } from '../lib/motion.svelte';
  import { SULPHITE, type Strike } from '../lib/sulphite/moments';
  import { fxActive } from '../lib/fx/core';
  import { flash, sparks } from '../lib/fx/effects';
  import type { Pt } from '../lib/arcane';

  let node: HTMLElement;
  let w = $state(0);
  let h = $state(0);
  const laid = $derived.by(() => {
    if (!w || !h) return null;
    // (Kept: the face's CardEngraving engraved it at this size already.)
    engrave('face', w, h, SULPHITE_PLATE);
    return boltsAt('face', w, h);
  });

  /** How far a bolt's light reaches past its line. */
  const PAD = 6;
  const linePath = (b: Bolt) => `M${b.pts.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join('L')}`;
  /** A bolt and its forks, as one layer: its box, and its lines in that box's frame. */
  const layers = $derived(
    (laid?.bolts ?? []).map((b) => {
      const all: Pt[] = [b, ...b.forks].flatMap((x) => x.pts);
      const xs = all.map((p) => p[0]);
      const ys = all.map((p) => p[1]);
      const [x0, y0] = [Math.floor(Math.min(...xs) - PAD), Math.floor(Math.min(...ys) - PAD)];
      const [x1, y1] = [Math.ceil(Math.max(...xs) + PAD), Math.ceil(Math.max(...ys) + PAD)];
      return { heading: b.heading, all, box: [x0, y0, x1 - x0, y1 - y0] as const, d: [b, ...b.forks].map(linePath).join('') };
    }),
  );

  let bolts: HTMLElement[] = $state([]);
  /** The bolt lit toward the pointer, or -1. */
  let lit = $state(-1);

  /** A strike: up at once, a flicker as lightning's strokes follow each other, then back to where it stood (lit or at rest: no last frame). */
  const STRIKE: Keyframe[] = [{ opacity: 0.1 }, { opacity: 1, offset: 0.08 }, { opacity: 0.25, offset: 0.22 }, { opacity: 1, offset: 0.34 }, { opacity: 0.6, offset: 0.6 }];
  /** One bolt struck, `at` ms from now. */
  function strikeOne(i: number, at = 0, life = 520) {
    const el = bolts[i];
    if (!el || motion.still) return;
    el.animate(STRIKE, { duration: life, delay: at, easing: 'linear' });
  }
  /** Where bolt `i` strikes (its tip) flashes and throws a few sparks, `at` ms from now, `k` as hard. */
  function hit(i: number, at = 0, k = 1) {
    const tip = laid?.bolts[i]?.pts.at(-1);
    if (!tip || !fxActive() || motion.still) return;
    const r = node.getBoundingClientRect();
    if (!r.width) return;
    const p = { x: r.left + (tip[0] / w) * r.width, y: r.top + (tip[1] / h) * r.height };
    const delay = (at + 25) / 1000;
    flash(p, { radius: 20 * k, color: SULPHITE.pale, life: 0.24, intensity: 0.75 * k, delay });
    sparks(p, { count: Math.round(5 * k), speed: [60, 240], life: [0.08, 0.26], colors: [SULPHITE.pale, SULPHITE.main], gravity: 80, stretch: 0.02, size: [0.6, 1.1], delay });
  }
  /** Dealt: the bolts strike round the ring from its foot up, both sides together. */
  function onDeal() {
    const up = (i: number) => 180 - Math.abs(((layers[i].heading + 540) % 360) - 180);
    layers
      .map((_, i) => i)
      .sort((a, b) => up(a) - up(b))
      .forEach((i, n) => {
        strikeOne(i, 90 + n * 55);
        hit(i, 90 + n * 55, 0.7);
      });
  }
  /** Picked: every bolt at once, twice. */
  function onPick() {
    layers.forEach((_, i) => {
      strikeOne(i, (i % 3) * 25, 600);
      strikeOne(i, 360 + (i % 2) * 40, 520);
      hit(i, (i % 3) * 25);
    });
  }

  onMount(() => {
    const face = node.parentElement;
    const card = node.closest<HTMLElement>('.card');
    const ro = new ResizeObserver(() => {
      w = node.clientWidth;
      h = node.clientHeight;
    });
    ro.observe(node);
    const told = (e: Event) => ((e as CustomEvent<Strike>).detail === 'pick' ? onPick() : onDeal());
    face?.addEventListener('sulphite', told);

    // The pointer: the bolt nearest it (by its nearest point, forks and all), within a reach of it, while it's over the card and the card can be picked.
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || !laid || card?.hasAttribute('disabled') || card?.classList.contains('down')) return;
      const r = node.getBoundingClientRect();
      if (!r.width) return;
      const [x, y] = [((e.clientX - r.left) / r.width) * w, ((e.clientY - r.top) / r.height) * h];
      let best = -1;
      let gap = 0.28 * Math.max(w, h);
      layers.forEach((l, i) => {
        const d = Math.min(...l.all.map(([px, py]) => Math.hypot(px - x, py - y)));
        if (d < gap) [best, gap] = [i, d];
      });
      if (best !== lit) {
        lit = best;
        if (best >= 0) {
          strikeOne(best, 0, 380);
          hit(best, 0, 0.8);
        }
      }
    };
    const out = () => (lit = -1);
    card?.addEventListener('pointermove', move);
    card?.addEventListener('pointerleave', out);

    // Now and then a bolt not lit crackles, faintly: never two at once, never in step.
    let idle: ReturnType<typeof setTimeout>;
    const crackle = () => {
      idle = setTimeout(
        () => {
          const free = layers.map((_, i) => i).filter((i) => i !== lit);
          const i = free[Math.floor(Math.random() * free.length)];
          const el = bolts[i];
          if (el && !motion.resting && !card?.classList.contains('down'))
            el.animate([{ opacity: 0.12 }, { opacity: 0.7, offset: 0.12 }, { opacity: 0.15, offset: 0.3 }, { opacity: 0.75, offset: 0.45 }, { opacity: 0.12 }], { duration: 320, easing: 'linear' });
          crackle();
        },
        1800 + Math.random() * 3400,
      );
    };
    crackle();
    return () => {
      ro.disconnect();
      face?.removeEventListener('sulphite', told);
      card?.removeEventListener('pointermove', move);
      card?.removeEventListener('pointerleave', out);
      clearTimeout(idle);
    };
  });
</script>

<span class="charge" bind:this={node} aria-hidden="true">
  {#each layers as l, i (i)}
    {@const [x, y, bw, bh] = l.box}
    <span class="bolt" class:lit={lit === i} bind:this={bolts[i]} style:left="{x}px" style:top="{y}px" style:width="{bw}px" style:height="{bh}px">
      <svg viewBox="{x} {y} {bw} {bh}">
        <path class="halo" d={l.d} />
        <path class="glow" d={l.d} />
        <path class="core" d={l.d} />
      </svg>
    </span>
  {/each}
</span>

<style>
  .charge {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .bolt {
    position: absolute;
  }
  /* At rest a bolt is all but only engraved: its light is for its strikes, its crackle and the pointer. */
  .bolt {
    opacity: 0.12;
  }
  .bolt svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  path {
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .halo {
    stroke: var(--f);
    stroke-width: 5;
    opacity: 0.25;
  }
  .glow {
    stroke: var(--f);
    stroke-width: 2;
    opacity: 0.8;
  }
  .core {
    stroke: #fffbe6;
    stroke-width: 0.9;
  }
  /* Lit toward the pointer: up at once (its strike plays over it), down slower; humming while it holds. */
  .bolt {
    transition: opacity 0.4s ease-out;
  }
  .bolt.lit {
    opacity: 0.85;
    transition-duration: 0.06s;
  }
  .bolt.lit svg {
    animation: hum 1.3s ease-in-out infinite;
  }
  @keyframes hum {
    0%,
    100% {
      opacity: 1;
    }
    40% {
      opacity: 0.72;
    }
    55% {
      opacity: 0.9;
    }
  }
  /* Each its own layer, always (docs/category-cards.md, rule 7). */
  :global(.sharp) .bolt {
    will-change: opacity;
  }
  :global(html[data-saver]) .bolt.lit svg {
    animation: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .bolt.lit svg {
      animation: none;
    }
  }
</style>
