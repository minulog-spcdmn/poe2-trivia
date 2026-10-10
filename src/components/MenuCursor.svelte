<script lang="ts">
  // The start menu's cursor: an ember beside the entry at `at` (in slots,
  // --slot apart), lit while `lit`. It glides from entry to entry with a
  // streak of light behind it, as a spark would; lit, it catches; let go, it
  // pinches out hot and lets a spark or two drift up. Coming back after it
  // went out, it catches where it is wanted instead of sliding over. A pointer
  // that can hover shows it; touch never does (Home hides it on phones too).
  import { untrack } from 'svelte';
  import { C, embers } from '../lib/fx/effects';

  let { at, lit }: { at: number; lit: boolean } = $props();

  /** The glide between entries (and its streak), ms. */
  const GLIDE_MS = 260;
  const GLIDE_EASE = 'cubic-bezier(0.33, 1, 0.68, 1)';
  /** How long it waits, unlit, before going out (a mouse crossing between entries never lets go). */
  const LET_GO_MS = 250;
  /** Going out (the .out animation below), ms. */
  const OUT_MS = 650;

  let phase = $state<'off' | 'on' | 'out'>('off');
  let cursor: HTMLElement;
  let gem: HTMLElement;
  let streak: HTMLElement;
  let shownAt = untrack(() => at);
  let letGo: ReturnType<typeof setTimeout> | undefined;
  let gone: ReturnType<typeof setTimeout> | undefined;

  const canHover = () => matchMedia('(hover: hover)').matches;
  const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const place = (n: number) => (cursor.style.translate = `0 calc(${n} * var(--slot))`);
  const yOf = (el: HTMLElement) => parseFloat(getComputedStyle(el).translate.split(' ')[1] ?? '0') || 0;

  /** From where it is now (mid-glide too) to entry `n`, the streak drawn out behind it. */
  function glide(n: number) {
    const from = yOf(cursor);
    for (const a of cursor.getAnimations()) a.cancel();
    place(n);
    const to = yOf(cursor);
    const d = to - from;
    if (!d || still()) return;
    cursor.animate([{ translate: `0 ${from}px` }, { translate: `0 ${to}px` }], { duration: GLIDE_MS, easing: GLIDE_EASE });
    // The streak lies from where it set off to the ember, its head on the ember all the way, then fades.
    for (const a of streak.getAnimations()) a.cancel();
    streak.style.translate = `0 ${Math.min(from, to)}px`;
    streak.style.height = `${Math.abs(d)}px`;
    streak.style.transformOrigin = d > 0 ? 'top' : 'bottom';
    streak.style.setProperty('--toward', d > 0 ? '0deg' : '180deg');
    streak.animate([{ scale: '1 0' }, { scale: '1 1' }], { duration: GLIDE_MS, easing: GLIDE_EASE });
    streak.animate([{ opacity: 0.85 }, { opacity: 0.85, offset: 0.35 }, { opacity: 0 }], { duration: GLIDE_MS * 1.8, easing: 'ease-out' });
  }

  /** Let go: it pinches out, and a spark or two rises off it as it goes. */
  function goOut() {
    phase = 'out';
    if (canHover()) setTimeout(() => embers(gem, { count: 2, area: 'centre', colors: [C.ember, C.gold], size: [0.8, 1.5], rise: [25, 55], scatter: 12, gravity: 0, life: [0.5, 0.9] }), OUT_MS * 0.55);
    gone = setTimeout(() => (phase = 'off'), OUT_MS);
  }

  $effect(() => {
    const n = at;
    const on = lit;
    untrack(() => {
      if (on) {
        clearTimeout(letGo);
        clearTimeout(gone);
        if (phase === 'on' && n !== shownAt) glide(n);
        else if (phase !== 'on') {
          // Out or going out: it catches again at its entry.
          for (const a of cursor.getAnimations()) a.cancel();
          place(n);
          phase = 'on';
        }
      } else if (phase === 'on') {
        clearTimeout(letGo);
        letGo = setTimeout(goOut, LET_GO_MS);
      } else place(n);
      shownAt = n;
    });
  });
  $effect(() => () => {
    clearTimeout(letGo);
    clearTimeout(gone);
  });
</script>

<span class="streak" bind:this={streak} aria-hidden="true"></span>
<span class="cursor {phase}" bind:this={cursor} aria-hidden="true"><span class="gem" bind:this={gem}></span></span>

<style>
  /* Both sit at the first entry's ember (Home's menu places it), moved by translate. */
  .cursor,
  .streak {
    position: absolute;
    z-index: 2;
    left: -26px;
    top: 14px;
    pointer-events: none;
  }
  .cursor {
    width: 9px;
    height: 9px;
    will-change: translate;
  }
  .gem {
    position: absolute;
    inset: 0;
    rotate: 45deg;
    background: #e08a44;
    box-shadow:
      0 0 8px rgba(224, 138, 68, 0.9),
      0 0 18px rgba(224, 138, 68, 0.45);
    opacity: 0;
    will-change: scale, opacity;
  }
  /* A thread of light from where it set off to the ember, brightest at the ember. */
  .streak {
    left: -22.5px;
    top: 18.5px;
    width: 2px;
    height: 0;
    border-radius: 1px;
    background: linear-gradient(var(--toward, 180deg), rgba(255, 196, 120, 0.9), rgba(224, 138, 68, 0.35) 45%, transparent);
    box-shadow: 0 0 6px rgba(224, 138, 68, 0.5);
    opacity: 0;
    will-change: scale, opacity;
  }
  @media (hover: hover) {
    .on .gem {
      opacity: 1;
      animation: catch 0.38s cubic-bezier(0.2, 0.9, 0.3, 1.2) backwards;
    }
    .out .gem {
      animation: pinch 0.65s cubic-bezier(0.5, 0, 0.75, 0) forwards;
    }
  }
  /* It catches: from a hot point, flaring past its size, to its steady glow. */
  @keyframes catch {
    from {
      opacity: 0;
      scale: 0.2;
      background: #fff0d0;
    }
    45% {
      opacity: 1;
    }
  }
  /* It goes out as an ember does: a last flare, then pinched down to a hot point, and gone. */
  @keyframes pinch {
    0% {
      opacity: 1;
      scale: 1;
    }
    18% {
      opacity: 1;
      scale: 1.18;
      background: #f4a862;
    }
    85% {
      opacity: 0.9;
      background: #fff0d0;
    }
    100% {
      opacity: 0;
      scale: 0;
      background: #fff0d0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .gem {
      animation: none !important;
    }
  }
</style>
