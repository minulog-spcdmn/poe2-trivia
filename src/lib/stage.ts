// The start page and the invite screen are laid out in one stage, at most
// 1440 px wide. On very large windows (wider than 2560) the whole stage is
// scaled up with CSS zoom, so a 4K screen at 100% doesn't show it small in
// an empty field. At 2560 and below nothing is scaled: the browser's own
// zoom keeps working as usual where nearly everyone is.

/** How much the stage is scaled for a window `w` x `h` (CSS px): 1 to 2. */
export function stageZoom(w: number, h: number): number {
  return Math.min(2, Math.max(1, Math.min(w / 2560, h / 1100)));
}

/**
 * Svelte action: keeps `--stage-zoom` on the stage up to date with the
 * window (its CSS sets `zoom` from it, and sizes itself to the window by it).
 */
export function stage(node: HTMLElement) {
  const set = () => node.style.setProperty('--stage-zoom', String(stageZoom(innerWidth, innerHeight)));
  set();
  addEventListener('resize', set);
  return { destroy: () => removeEventListener('resize', set) };
}
