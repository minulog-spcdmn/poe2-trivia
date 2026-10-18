// A chart's height fitted to the screen, where a view is meant to be one
// screen (a big monitor, or one on its side): whatever runs past the
// screen's foot the chart gives up, down to `least`; room left at the foot
// it takes, up to `most` (by default it only gives up). Whatever changes the
// page's height (a read, the chart drawn, a list opened) fits it again; a
// resize starts again from `base`. Call it while a component sets up.
import { untrack } from 'svelte';

export function fitChart(o: { on: () => boolean; base: () => number; least?: number; most?: () => number }) {
  let fitted = $state<number | null>(null);
  const height = $derived(fitted ?? o.base());
  function fit() {
    if (!untrack(o.on)) return void (fitted = null);
    const main = document.querySelector('main');
    if (!main) return;
    // The page's content ends with main (its own padding at the foot included), whatever the page's least height.
    const over = Math.round(main.getBoundingClientRect().bottom + scrollY - innerHeight);
    const now = untrack(() => height);
    const least = o.least ?? 140;
    const most = Math.max(now, untrack(() => o.most?.() ?? now));
    if (over > 2 && now > least) fitted = Math.max(least, now - over);
    else if (over < -8 && now < most) fitted = Math.min(most, now - over);
  }
  $effect(() => {
    const seen = new ResizeObserver(() => requestAnimationFrame(fit));
    seen.observe(document.body);
    const resized = () => (fitted = null);
    addEventListener('resize', resized);
    return () => {
      seen.disconnect();
      removeEventListener('resize', resized);
    };
  });
  return {
    get height() {
      return height;
    },
  };
}
