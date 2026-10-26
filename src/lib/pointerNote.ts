// Where a small note by the pointer goes (the one saying the room code was
// copied, RoomCodeGlyphs.svelte), kept on the screen. By a mouse, below and
// right of the pointer, out of its way, or mirrored where that would run off
// an edge. By a finger (or a pen), above the tap and centred on it, where
// the hand doesn't cover it, or below it with no room above. No imports, so
// the tests can use it.

/** From the point (px): a mouse's note this far right and down of it, a finger's this far above it. */
export const NOTE_BY_MOUSE = { x: 14, y: 16 };
export const NOTE_ABOVE_TOUCH = 28;
/** And this far in from the screen's edges, wherever the point is (px). */
export const NOTE_EDGE = 8;

const within = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));

/**
 * The note's top left, for a point, a note of a size and a screen of a size,
 * all in the same px (the note's own, under the stage's zoom): `touch` for a
 * finger's or a pen's point, else a mouse's.
 */
export function noteSpot(at: { x: number; y: number }, note: { w: number; h: number }, screen: { w: number; h: number }, touch: boolean): { x: number; y: number } {
  const right = screen.w - note.w - NOTE_EDGE;
  const bottom = screen.h - note.h - NOTE_EDGE;
  if (touch) {
    const above = at.y - NOTE_ABOVE_TOUCH - note.h;
    return { x: within(at.x - note.w / 2, NOTE_EDGE, right), y: within(above >= NOTE_EDGE ? above : at.y + NOTE_ABOVE_TOUCH, NOTE_EDGE, bottom) };
  }
  const x = at.x + NOTE_BY_MOUSE.x;
  const y = at.y + NOTE_BY_MOUSE.y;
  return {
    x: within(x <= right ? x : at.x - NOTE_BY_MOUSE.x - note.w, NOTE_EDGE, right),
    y: within(y <= bottom ? y : at.y - NOTE_BY_MOUSE.y - note.h, NOTE_EDGE, bottom),
  };
}
