/**
 * The item art files are upscaled (scripts/upscale-art.py) to this many
 * pixels per art pixel, the original art's own (about 104 per inventory
 * cell). Sizes and positions are all in art pixels, so divide a file's own
 * size by this; only the bitmaps are finer.
 */
export const ART_SCALE = 2;

/** Read when asked, not on import, so tests can import ART_SCALE outside Vite. */
const items = () => `${import.meta.env.BASE_URL}items/`;

/** An item's picture, full size (ART_SCALE): for the question and the codex's item page. */
export function itemImage(id: string) {
  return `${items()}${id}.avif`;
}

/** The smaller copies' longest sides, px (THUMBS in scripts/upscale-art.py and scripts/fetch-data.mjs). */
export const ITEM_THUMBS = [256, 128] as const;

/** A smaller copy for a small spot: at most `size` px on its longest side (never larger than the full picture). */
export function itemThumb(id: string, size: (typeof ITEM_THUMBS)[number]) {
  return `${items()}${size}/${id}.avif`;
}

/**
 * For a spot up to about 128 CSS px across: the 128 px copy on a plain
 * screen, the 256 px one on a sharper one. The picture's own size is 128 CSS
 * px on its longest side on a plain screen, but less on a sharper one when
 * the full picture is under 256 px (a one-cell item's is 216, so 108 CSS px),
 * so give the <img> a box or a max size.
 */
export function itemSrcset(id: string) {
  return `${itemThumb(id, 128)} 1x, ${itemThumb(id, 256)} 2x`;
}
