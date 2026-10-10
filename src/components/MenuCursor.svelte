<script lang="ts">
  // The start menu's cursor: an ember beside the entry at `at` (in slots,
  // --slot apart), lit while `lit`. It moves on a spring, drawn every frame
  // the screen shows (a fast screen gets every one of its frames), so it eases
  // out of one entry and into the next and, sent elsewhere mid-way, turns
  // without a jolt. Let go, it cools as an ember does: its glow goes first,
  // then it darkens to a deep red and is gone. Lit again after that, it comes
  // back at its entry rather than travelling over. A pointer that can hover
  // shows it; touch never does (Home hides it on phones too).
  import { onDestroy, untrack } from 'svelte';
  import { springAtRest, stepSpring, type Spring } from '../lib/spring';
  import { CURSOR_SPRING } from '../lib/startMenu';

  let { at, lit }: { at: number; lit: boolean } = $props();

  /** How long it takes to cool, ms (the transitions below, with their delay): until then it travels on rather than coming back at its entry. */
  const COOL_MS = 1400;

  let cursor: HTMLElement;
  const s: Spring = { x: 0, v: 0 };
  let target = 0;
  let frame = 0;
  let last = 0;
  let cold = true;
  let cooling: ReturnType<typeof setTimeout> | undefined;

  const slotPx = () => parseFloat(getComputedStyle(cursor).getPropertyValue('--slot')) || 0;
  /** At rest it is placed by --slot, so a window that changes the slot's size moves it too. */
  function rest(n: number) {
    cancelAnimationFrame(frame);
    frame = 0;
    s.v = 0;
    s.x = target = n * slotPx();
    cursor.style.translate = `0 calc(${n} * var(--slot))`;
  }
  function tick(now: number) {
    stepSpring(s, target, (now - last) / 1000, CURSOR_SPRING);
    last = now;
    if (springAtRest(s, target)) return rest(untrack(() => at));
    cursor.style.translate = `0 ${s.x}px`;
    frame = requestAnimationFrame(tick);
  }
  function travel(n: number) {
    target = n * slotPx();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return rest(n);
    if (!frame) {
      last = performance.now();
      frame = requestAnimationFrame(tick);
    }
  }

  $effect(() => {
    const n = at;
    const on = lit;
    untrack(() => {
      if (on) {
        clearTimeout(cooling);
        if (cold) rest(n);
        else travel(n);
        cold = false;
      } else {
        if (!frame) rest(n);
        clearTimeout(cooling);
        cooling = setTimeout(() => (cold = true), COOL_MS);
      }
    });
  });
  onDestroy(() => {
    cancelAnimationFrame(frame);
    clearTimeout(cooling);
  });
</script>

<span class="cursor" class:lit bind:this={cursor} aria-hidden="true"></span>

<style>
  /* Beside the first entry (Home's menu places it), moved by translate. */
  .cursor {
    position: absolute;
    z-index: 2;
    left: -26px;
    top: 14px;
    width: 9px;
    height: 9px;
    rotate: 45deg;
    pointer-events: none;
    will-change: translate;
    /* Cold: dark, unlit, gone. Cooling, the glow goes first, the colour after, and then the ember. */
    background: #4a1a0c;
    box-shadow:
      0 0 8px rgba(224, 138, 68, 0),
      0 0 18px rgba(224, 138, 68, 0);
    opacity: 0;
    transition:
      box-shadow 0.6s ease-out,
      background-color 1s ease-in 0.1s,
      opacity 0.9s ease-in 0.5s;
  }
  @media (hover: hover) {
    .lit {
      background: #e08a44;
      box-shadow:
        0 0 8px rgba(224, 138, 68, 0.9),
        0 0 18px rgba(224, 138, 68, 0.45);
      opacity: 1;
      transition:
        box-shadow 0.2s ease-out,
        background-color 0.15s ease-out,
        opacity 0.15s ease-out;
    }
  }
</style>
