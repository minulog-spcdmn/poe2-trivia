<script lang="ts">
  // A room code's letters, each in its own box, as the lobby shows them (and
  // the invite screen, the room it leads to). Copied as every code a player
  // passes on is (lib/copyPress.svelte.ts: a click, a drag across it or a
  // tap, a long press too where the phone allows it), with a small note by
  // the pointer; the letters light up while selected or just copied, in
  // place of the browser's highlight, and go back to rest after. `hidden`
  // shows dots (for streaming; a copy still gives the code), `sparks` makes
  // each letter spark as it lands, `delay` holds back their drop (ms).
  import { glyphLanded } from '../lib/fx/moments';
  import { backdropShadow } from '../lib/backdropShadow';
  import { CopyPress } from '../lib/copyPress.svelte';
  import CopyNote from './CopyNote.svelte';
  import { untrack } from 'svelte';
  import { motion } from '../lib/motion.svelte';

  let { code, hidden = false, sparks = false, delay = 0 }: { code: string; hidden?: boolean; sparks?: boolean; delay?: number } = $props();

  let glyphs = $state<HTMLElement>();
  let selected = $state(false);
  const selectionHere = () => {
    const sel = getSelection();
    return !!glyphs && !!sel && !sel.isCollapsed && sel.containsNode(glyphs, true);
  };
  function selectionChanged() {
    selected = selectionHere();
  }

  const press = new CopyPress(() => code, 'Room code copied');

  /** Hiding or showing, each letter turns into its dot (or back) over EACH ms, the next STEP ms after the one before. */
  const EACH = 220;
  const STEP = 45;
  const span = $derived(STEP * (code.length - 1) + EACH);
  /**
   * How far the turning has gone (ms along it, 0 shown, span hidden), as one wave over the six: each letter's own part of it
   * is worked out in CSS (--wave). A click mid-way turns the wave round where it is, at the same pace, so the letters
   * already turning turn back first and none waits on a delay.
   */
  const wave0 = untrack(() => (hidden ? STEP * (code.length - 1) + EACH : 0));
  let wave = wave0;
  let frame = 0;
  $effect(() => {
    const to = hidden ? span : 0;
    const el = glyphs;
    if (!el) return;
    cancelAnimationFrame(frame);
    if (motion.still || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      wave = to;
      el.style.setProperty('--wave', String(wave));
      return;
    }
    let then = performance.now();
    const step = (now: number) => {
      wave += Math.sign(to - wave) * Math.min(Math.abs(to - wave), Math.max(0, now - then));
      then = now;
      el.style.setProperty('--wave', String(wave));
      if (wave !== to) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  });

  /** Svelte action: sparks as a letter lands (its drop is staggered by index). */
  function landing(node: HTMLElement, i: number) {
    if (!sparks) return;
    const t = setTimeout(() => glyphLanded(node), delay + 330 + i * 80);
    return { destroy: () => clearTimeout(t) };
  }
</script>

<svelte:document onselectionchange={selectionChanged} />

<span class="glyphs" class:hidden class:selected={selected || press.lit} style:--wave={wave0} style:--each={EACH} style:--step={STEP} data-copy bind:this={glyphs} {@attach press.attach}>
  {#each code.split('') as ch, i (i)}
    <!-- The letter in gold; its gleam's copy of it is drawn from data-ch (a pseudo-element), so a copy gives each letter once. -->
    <span class="glyph" use:landing={i} use:backdropShadow={{ fill: 'linear' }} style:animation-delay="{delay + i * 80}ms" style:--i={i}
      ><span class="ch letter">{ch}</span><span class="ch dot" aria-hidden="true"></span><span class="gleam" aria-hidden="true" data-ch={hidden ? '•' : ch}></span></span
    >
  {/each}
</span>
<CopyNote {press} />

<style>
  /* The boxes share the width they are given, so the letters are sized from
     it (six boxes, five gaps), never wider than a box: an M or a W must not
     be clipped. */
  .glyphs {
    display: flex;
    gap: 0.5rem;
    width: 100%;
    container-type: inline-size;
  }
  /* Selected, the letters light up in place of the browser's highlight. */
  .glyphs ::selection,
  .glyphs::selection {
    background: transparent;
    color: inherit;
  }
  .glyph {
    flex: 1;
    min-width: 0;
    height: clamp(58px, 14vw, 72px);
    display: grid;
    place-items: center;
    position: relative;
    overflow: hidden;
    font-family: var(--font-cinzel);
    font-weight: 900;
    font-size: min(2.6rem, (100cqi - 5 * 0.5rem) / 6 * 0.74);
    color: var(--gold-hi);
    /* Drawn by the WebGL backdrop when it can (see lib/backdropShadow.ts): so
       dark a gradient bands in CSS. --bs1 is the glow while selected, --bs2
       the drop shadow. */
    --bs-fill-a: #221a11;
    --bs-fill-b: #0d0a07;
    background: var(--bs-fill-paint, linear-gradient(var(--bs-fill-a), var(--bs-fill-b)));
    border: 1px solid var(--gold-lo);
    border-radius: 4px;
    --bs1-color: transparent;
    --bs1: 0px 16px;
    --bs2: 6px 18px;
    --bs2-color: rgba(0, 0, 0, 0.6);
    box-shadow:
      inset 0 0 var(--glyph-glow-in, 18px rgba(201, 164, 92, 0.12)),
      var(--bs-soft-paint, 0 var(--bs1, 0 0) var(--bs1-color, transparent), 0 var(--bs2, 0 0) var(--bs2-color, transparent));
    transition:
      border-color 0.15s,
      --bs-fill-a 0.15s,
      --bs-fill-b 0.15s,
      --bs1-color 0.15s;
    animation: drop 0.6s var(--ease-back) both;
    /* (Its width, which its gleam's band is measured in: see .gleam.) */
    container-type: inline-size;
  }
  .selected .glyph {
    border-color: var(--gold);
    --bs-fill-a: #3a2a15;
    --bs-fill-b: #17100a;
    --glyph-glow-in: 22px rgba(241, 217, 155, 0.22);
    --bs1-color: rgba(201, 164, 92, 0.35);
  }
  /* The letter in the title's gold (GameTitle), painted once. A text-shadow
     would be drawn over gold clipped to the letter, so the glow is a filter. */
  .ch {
    filter: drop-shadow(0 0 8px rgba(241, 217, 155, 0.35));
    transition: filter 0.15s;
    background-image: linear-gradient(180deg, #fff1c9 22%, #e2bd76 55%, #a07a35 88%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  /* Every few seconds a band of light passes along the code, as over the
     title: on the letters' shapes only, one box after another as one
     sweep. The band is a mask three boxes wide (.gleam) moved across the
     box by its transform, over a copy of the letter (its ::after) moved
     back by just as much, so the letter holds still as the band passes:
     each a layer of its own, and nothing is painted again for it. (The band
     was the copy's background, moved by its position: Chrome painted the
     copy again on every frame of every sweep, all six at the screen's
     rate.) In the box's own width (cqw), both, so the two moves cancel to
     the last bit and the copy never strays from the letter under it. */
  .gleam {
    position: absolute;
    top: 0;
    left: 0;
    width: 300cqw;
    height: 100%;
    pointer-events: none;
    -webkit-mask-image: linear-gradient(100deg, transparent 40%, #000 50%, transparent 60%);
    mask-image: linear-gradient(100deg, transparent 40%, #000 50%, transparent 60%);
    transform: translateX(-300cqw);
    will-change: transform;
    animation: sheen 7s cubic-bezier(0.45, 0, 0.55, 1) infinite;
    animation-delay: calc(1.6s + var(--i, 0) * 0.11s);
  }
  .gleam::after {
    content: attr(data-ch);
    position: absolute;
    top: 0;
    left: 0;
    width: 100cqw;
    height: 100%;
    display: grid;
    place-items: center;
    color: rgba(255, 251, 236, 0.95);
    text-shadow: none;
    transform: translateX(300cqw);
    will-change: transform;
    animation: sheen-back 7s cubic-bezier(0.45, 0, 0.55, 1) infinite;
    animation-delay: calc(1.6s + var(--i, 0) * 0.11s);
  }
  @keyframes sheen {
    0% {
      transform: translateX(-300cqw);
    }
    10%,
    100% {
      transform: translateX(100cqw);
    }
  }
  @keyframes sheen-back {
    0% {
      transform: translateX(300cqw);
    }
    10%,
    100% {
      transform: translateX(-100cqw);
    }
  }
  /* The box's top edge catches the light as the band crosses it. */
  .glyph::before {
    content: '';
    position: absolute;
    top: 0;
    left: 12%;
    right: 12%;
    height: 1px;
    pointer-events: none;
    background: linear-gradient(90deg, transparent, rgba(255, 236, 190, 0.85), transparent);
    opacity: 0;
    animation: edge 7s ease-in-out infinite;
    animation-delay: calc(1.6s + var(--i, 0) * 0.11s);
  }
  @keyframes edge {
    4% {
      opacity: 1;
    }
    0%,
    9%,
    100% {
      opacity: 0;
    }
  }
  .selected .ch {
    filter: drop-shadow(0 0 9px rgba(255, 230, 170, 0.6));
    background-image: linear-gradient(180deg, #fffaf0 22%, #f4d79a 60%, #c99c4f 92%);
  }
  /* Each box holds its letter and its dot in one place: hidden, each letter in turn shrinks away as its dot swells in where it
     stood, and back in the same order shown, as far along as the wave is (--wave, ms: each letter's part of it, --h, from 0
     shown to 1 hidden). (The letter stays to be copied; the dot, drawn by CSS, never is.) */
  .glyph {
    --h: clamp(0, (var(--wave, 0) - var(--i) * var(--step)) / var(--each), 1);
  }
  .ch.letter,
  .ch.dot {
    grid-area: 1 / 1;
  }
  .ch.letter {
    opacity: calc(1 - var(--h));
    scale: calc(1 - 0.4 * var(--h));
  }
  .ch.dot {
    background-image: none;
    color: var(--gold-lo);
    opacity: var(--h);
    scale: calc(0.4 + 0.6 * var(--h));
  }
  .ch.dot::before {
    content: '•';
  }
  @media (prefers-reduced-motion: reduce) {
    .gleam,
    .glyph::before {
      animation: none;
      display: none;
    }
  }
  @keyframes drop {
    from {
      opacity: 0;
      transform: translateY(-18px) rotateX(70deg);
    }
  }
  @media (max-width: 520px) {
    .glyphs {
      gap: 0.35rem;
    }
    .glyph {
      height: 54px;
    }
  }
</style>
