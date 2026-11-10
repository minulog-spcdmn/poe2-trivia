<script lang="ts" module>
  // A tooltip in a player's pill: a find's rule under its count
  // (Inventory.svelte), a delver's right answers under their token
  // (Avatar.svelte's `tip`, from Scoreboard.svelte). In the browser's top
  // layer (a popover), over everything, the effects layer's light included:
  // under what it is about, its arrow on it, kept on the screen; only for a
  // mouse. It fades out, and stays while the pointer is on the thing or on
  // the tooltip itself (the short wait before it goes lets the pointer cross
  // the gap). Where popovers aren't supported it shows in place on hover (CSS).
  import { ownRect, zoomOf } from '../lib/stage';

  /** The tooltip open now, on any player's pill: closes it at once (one shows at a time). */
  let closeOpenTip: (() => void) | null = null;
  const TIP_GAP = 9;
  const TIP_EDGE = 8;
  const TIP_LINGER_MS = 140;
  const TIP_FADE_MS = 160;

  /**
   * Svelte action, on what the tooltip is about: its HoverTip is a child of
   * it, there from the first or only later (looked for as the pointer comes:
   * a count that starts at none has nothing to tell yet).
   */
  export function tipOnHover(host: HTMLElement) {
    let tip: HTMLElement | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const open = () => !!tip?.isConnected && tip.matches(':popover-open');
    const place = (tip: HTMLElement) => {
      // In the tip's own px: the page (and the tip with it) may be zoomed (lib/stage.ts), the window isn't.
      const z = zoomOf(host);
      const r = ownRect(host);
      const mid = r.left + r.width / 2;
      const w = tip.offsetWidth;
      const left = Math.max(TIP_EDGE, Math.min(mid - w / 2, innerWidth / z - w - TIP_EDGE));
      tip.style.left = `${left}px`;
      tip.style.top = `${r.bottom + TIP_GAP}px`;
      tip.style.setProperty('--arrow-x', `${mid - left}px`);
    };
    /** Gone at once, no fade: another tooltip takes its place. */
    const close = () => {
      clearTimeout(timer);
      tip?.classList.remove('on');
      if (open()) tip!.hidePopover();
      if (closeOpenTip === close) closeOpenTip = null;
    };
    const show = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      clearTimeout(timer);
      const found = host.querySelector<HTMLElement>(':scope > .tip');
      if (found !== tip) {
        close();
        tip = found;
      }
      if (!tip || typeof tip.showPopover !== 'function') return;
      const mine = tip;
      // Moving from one thing to the next swaps the tooltip outright, so the
      // old one never fades out under the new one; only the first fades in.
      const swap = closeOpenTip !== null && closeOpenTip !== close;
      if (swap) closeOpenTip!();
      closeOpenTip = close;
      if (!open()) {
        mine.showPopover();
        place(mine);
        if (swap) {
          mine.classList.add('instant', 'on');
          requestAnimationFrame(() => mine.classList.remove('instant'));
        } else {
          // A frame shown at 0 first, so the fade has somewhere to start from.
          requestAnimationFrame(() => requestAnimationFrame(() => mine.classList.add('on')));
        }
      } else mine.classList.add('on');
    };
    const hide = () => {
      clearTimeout(timer);
      // (Its tooltip went from under it meanwhile, or it had none: nothing to fade.)
      if (!open()) return close();
      timer = setTimeout(() => {
        tip?.classList.remove('on');
        timer = setTimeout(close, TIP_FADE_MS);
      }, TIP_LINGER_MS);
    };
    // The tooltip is its child in the DOM (if not on the screen), so
    // entering it enters the thing again and keeps it up.
    host.addEventListener('pointerenter', show);
    host.addEventListener('pointerleave', hide);
    return {
      destroy() {
        host.removeEventListener('pointerenter', show);
        host.removeEventListener('pointerleave', hide);
        close();
      },
    };
  }
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';

  /**
   * `tone`: its edge's colour and its name's (a find's own, a player's).
   * `through`: the pointer passes through it (it only tells: nothing in it to
   * read at length, and it never holds a click from what it lies over).
   */
  let { tone, through = false, children }: { tone: string; through?: boolean; children: Snippet } = $props();
</script>

<span class="tip" class:through popover="manual" style:--tip={tone}>{@render children()}</span>

<style>
  /* What it is about, under it on hover (a pointer's; hidden from screen
     readers with the counts it sits in, whose players read the rules in the lobby). */
  .tip {
    position: absolute;
    z-index: 5;
    top: calc(100% + 9px);
    left: 50%;
    /* (Through var(), as the build keeps it beside a transform: tests/minifiedTransforms.) */
    --tip-shift: -50% 0;
    translate: var(--tip-shift);
    width: max-content;
    max-width: 16rem;
    padding: 0.45em 0.7em 0.5em;
    font-family: var(--font-body);
    font-size: 1rem;
    font-style: normal;
    font-weight: 400;
    line-height: 1.3;
    text-align: left;
    white-space: normal;
    color: var(--text);
    background: #100c09;
    border: 1px solid color-mix(in srgb, var(--tip) 55%, transparent);
    border-radius: 4px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
    opacity: 0;
    transform: translateY(-3px);
    transition:
      opacity 0.15s,
      transform 0.15s var(--ease-out);
    pointer-events: none;
  }
  /* Its name first, in its colour, as the finds are named on the rules page. */
  .tip :global(strong) {
    display: block;
    margin-bottom: 0.2em;
    font-family: var(--font-display);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--tip);
  }
  /* A number among its words. */
  .tip :global(b) {
    font-family: var(--font-cinzel);
    font-weight: 700;
    color: var(--gold-hi);
  }
  /* In the top layer: fixed under the thing (tipOnHover sets left, top and
     the arrow's place), faded out before it closes. */
  .tip:popover-open {
    position: fixed;
    inset: auto;
    margin: 0;
    overflow: visible;
    --tip-shift: none;
    opacity: 0;
    transform: translateY(-4px);
    transition:
      opacity 0.16s ease,
      transform 0.16s var(--ease-out);
    pointer-events: auto;
  }
  .tip.through:popover-open {
    pointer-events: none;
  }
  .tip:popover-open:global(.instant) {
    transition: none;
  }
  .tip:popover-open:global(.on) {
    opacity: 1;
    transform: none;
  }
  /* There at once while the pointer is on what it is about (after the rules above: it outweighs the open one's start). */
  :global(:hover) > .tip.tip {
    opacity: 1;
    transform: none;
  }
  /* Its arrow, pointing up at the thing. */
  .tip::before {
    content: '';
    position: absolute;
    top: -6px;
    left: var(--arrow-x, 50%);
    width: 10px;
    height: 10px;
    background: #100c09;
    border-left: 1px solid color-mix(in srgb, var(--tip) 55%, transparent);
    border-top: 1px solid color-mix(in srgb, var(--tip) 55%, transparent);
    transform: translateX(-50%) rotate(45deg);
  }
</style>
