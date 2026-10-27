/**
 * Svelte action for a range input: a finger anywhere on it takes the thumb
 * there and drags it, as a mouse on the track does. WebKit (every iPhone
 * browser) only moves a slider when the touch begins right on its thumb,
 * which a finger misses as often as not; a tap on the track does nothing.
 * The thumb's centre runs between `grip / 2` from either end (the thumb as
 * wide as the CSS draws it, Settings.svelte's --grip), so the value is read
 * between those. It sends the input's own events: input as it moves, change
 * as the finger lifts.
 */
export function fingerSlide(node: HTMLInputElement) {
  /** The drag under way: its finger, and the slider as it stood when it began. */
  let drag: { id: number; left: number; span: number; min: number; max: number; step: number; moved: boolean } | null = null;
  const finger = (e: TouchEvent) => (drag ? [...e.changedTouches].find((t) => t.identifier === drag!.id) : undefined);
  const at = (x: number) => {
    if (!drag) return;
    const { left, span, min, max, step } = drag;
    const f = Math.min(1, Math.max(0, (x - left) / span));
    // (Rounded off, as 3 * 0.05 isn't 0.15.)
    const v = Math.min(max, Math.max(min, +(min + Math.round((f * (max - min)) / step) * step).toFixed(6)));
    if (v === node.valueAsNumber) return;
    node.valueAsNumber = v;
    drag.moved = true;
    node.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const start = (e: TouchEvent) => {
    if (node.disabled || drag || e.touches.length > 1) return;
    // (The slider's own handling would fight this one from the thumb.)
    e.preventDefault();
    const t = e.changedTouches[0];
    const r = node.getBoundingClientRect();
    const grip = parseFloat(getComputedStyle(node).getPropertyValue('--grip')) || 0;
    drag = {
      id: t.identifier,
      left: r.left + grip / 2,
      span: Math.max(1, r.width - grip),
      min: Number(node.min || 0),
      max: Number(node.max || 100),
      step: Number(node.step || 1),
      moved: false,
    };
    at(t.clientX);
  };
  const move = (e: TouchEvent) => {
    const t = finger(e);
    if (!t || node.disabled) return;
    e.preventDefault();
    at(t.clientX);
  };
  const end = (e: TouchEvent) => {
    if (!finger(e)) return;
    if (drag?.moved) node.dispatchEvent(new Event('change', { bubbles: true }));
    drag = null;
  };
  node.addEventListener('touchstart', start, { passive: false });
  node.addEventListener('touchmove', move, { passive: false });
  node.addEventListener('touchend', end);
  node.addEventListener('touchcancel', end);
  return {
    destroy() {
      node.removeEventListener('touchstart', start);
      node.removeEventListener('touchmove', move);
      node.removeEventListener('touchend', end);
      node.removeEventListener('touchcancel', end);
    },
  };
}
