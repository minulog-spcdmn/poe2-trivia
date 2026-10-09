/**
 * The item art files are upscaled (scripts/upscale-art.py) to this many
 * pixels per art pixel, the original art's own (about 104 per inventory
 * cell). Sizes and positions are all in art pixels, so divide a file's own
 * size by this; only the bitmaps are finer.
 */
export const ART_SCALE = 2;

const ITEMS = `${import.meta.env.BASE_URL}items/`;

/** An item's picture, full size (ART_SCALE): for the question and the codex's item page. */
export function itemImage(id: string) {
  return `${ITEMS}${id}.avif`;
}

/** A smaller copy for a small spot: at most `size` px on its longest side (scripts/upscale-art.py THUMBS). */
export function itemThumb(id: string, size: 128 | 256) {
  return `${ITEMS}${size}/${id}.avif`;
}

/**
 * For a spot up to about 128 CSS px across: the 128 px copy on a plain
 * screen, the 256 px one on a sharper one. Either way the picture's own size
 * is 128 CSS px on its longest side, so give the <img> a box or a max size.
 */
export function itemSrcset(id: string) {
  return `${itemThumb(id, 128)} 1x, ${itemThumb(id, 256)} 2x`;
}
