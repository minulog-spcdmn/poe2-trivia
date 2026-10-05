// A chart's readout, by pointer or keyboard: the mark nearest the pointer is
// picked as a mouse moves over the chart, or as a finger presses and drags
// along it (the chart sets `touch-action: pan-y`, so scrolling still works),
// and the arrow keys step from mark to mark. The chart shows the picked mark's
// numbers in words beside it, so nothing hides in a tooltip.

/** Event handlers to spread on the chart. `xs`: each mark's place across it, 0 to 1. */
export function scrub(xs: () => number[], current: () => number, pick: (i: number) => void) {
  const nearest = (e: PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const f = (e.clientX - r.left) / Math.max(1, r.width);
    const at = xs();
    let best = 0;
    for (let i = 1; i < at.length; i++) if (Math.abs(at[i] - f) < Math.abs(at[best] - f)) best = i;
    return best;
  };
  return {
    onpointerdown: (e: PointerEvent) => {
      if (xs().length) pick(nearest(e));
    },
    onpointermove: (e: PointerEvent) => {
      if (xs().length && (e.pointerType === 'mouse' || e.buttons)) pick(nearest(e));
    },
    onkeydown: (e: KeyboardEvent) => {
      const n = xs().length;
      if (!n) return;
      const i = current();
      const to = { ArrowLeft: i - 1, ArrowDown: i - 1, ArrowRight: i + 1, ArrowUp: i + 1, Home: 0, End: n - 1 }[e.key];
      if (to === undefined) return;
      e.preventDefault();
      pick(Math.max(0, Math.min(n - 1, to)));
    },
  };
}
