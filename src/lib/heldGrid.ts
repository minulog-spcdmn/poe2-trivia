// The height a codex grid will take, worked out before it is laid out
// (Codex.svelte holds its sections' grids out of layout until their turn).
// A tile is as tall as its fixed parts (picture, status, padding) and its
// name's lines, one or two (clamped); a row is as tall as its tallest tile.

/** What a grid's height is worked out from, measured on a grid laid out. */
export type GridMeasure = { cols: number; gap: number; base: number; line: number };

/**
 * Whether a name can wrap: after a space or a hyphen. Item names hold no
 * other place a line can break (tests/heldGrid.test.ts keeps them so).
 */
export const canWrap = (text: string) => /[\s-]./.test(text.trim());

/** A grid's height (px), its tiles' names' line counts in order. */
export function gridHeight(lines: readonly number[], m: GridMeasure): number {
  let h = 0;
  for (let r = 0; r < lines.length; r += m.cols) {
    let most = 1;
    for (let k = r; k < Math.min(r + m.cols, lines.length); k++) most = Math.max(most, lines[k]);
    h += m.base + most * m.line + (r ? m.gap : 0);
  }
  return h;
}
