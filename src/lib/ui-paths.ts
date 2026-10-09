/**
 * The item art files are upscaled (scripts/upscale-art.py) to this many
 * pixels per art pixel, the original art's own (about 104 per inventory
 * cell). Sizes and positions are all in art pixels, so divide a file's own
 * size by this; only the bitmaps are finer.
 */
export const ART_SCALE = 2;

export function itemImage(id: string) {
  return `${import.meta.env.BASE_URL}items/${id}.webp`;
}
