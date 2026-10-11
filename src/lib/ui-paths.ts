/**
 * How many pixels the upscaled picture of an item (scripts/upscale-art.py)
 * has per pixel of its art (poe2db's, about 104 per inventory cell; Item.w,
 * Item.h): 4 for items up to 2 x 2 cells, which are drawn the most enlarged,
 * 2 for larger ones (keep in step with SCALE there). Sizes and positions are
 * all in art pixels; only the bitmaps are finer.
 */
export function artScale(w: number, h: number) {
  const cells = (px: number) => Math.max(1, Math.round(px / 104));
  return cells(w) <= 2 && cells(h) <= 2 ? 4 : 2;
}

/** Read when asked, not on import, so tests can import this module outside Vite. */
const items = () => `${import.meta.env.BASE_URL}items/`;

/** An item's picture, full size (artScale): for the question and the codex's item page. */
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
 * screen, the 256 px one on a sharper one. Either way the picture's own size
 * is 128 CSS px on its longest side (every full picture is at least 256 px),
 * so give the <img> a box or a max size.
 */
export function itemSrcset(id: string) {
  return `${itemThumb(id, 128)} 1x, ${itemThumb(id, 256)} 2x`;
}
