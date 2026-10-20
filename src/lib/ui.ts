import { engine } from './session.svelte';
import { absoluteUrl as abs, itemImage, itemSrcset, itemThumb } from './ui-paths';
import { cardPictures, categoryArt, type Tweak } from './categoryArt';
import { PALETTE } from './palette';

export function playerColor(slot: number) {
  return PALETTE[slot % PALETTE.length];
}

export { itemImage, itemSrcset, itemThumb };

// Which art each category card shows (lib/categoryArt), as URLs.
const ART = categoryArt(engine.byCategory);
const icons = new Map([...ART].map(([cat, a]) => [cat, abs(a.icon)]));
const glyphs = new Map([...ART].map(([cat, a]) => [cat, abs(a.glyph)]));
const companions = new Map([...ART].flatMap(([cat, a]) => (a.companions.length ? [[cat, a.companions.map((c) => ({ kind: c.kind, url: abs(c.icon) }))]] : [])));

/** Absolute URL, safe to use inside CSS custom properties. */
export function categoryIcon(category: string) {
  return icons.get(category)!;
}

/** A category's icon for a small glyph (the codex's, up to about 40 px): its 128 px copy. Absolute, as categoryIcon. */
export function categoryGlyph(category: string) {
  return glyphs.get(category)!;
}

/** An item of another kind a category names, shown behind its icon: the kind (its group) and the item's icon, absolute as categoryIcon. */
export type Companion = { kind: string; url: string };

/** The items a category shows behind its own icon, one for each other kind of item it names (none for most). */
export function categoryCompanions(category: string): readonly Companion[] {
  return companions.get(category) ?? [];
}

/** Every category's icon and the items behind it, each once (to ready them all ahead of the deal). */
export function categoryIcons() {
  return cardPictures(ART.values()).map(abs);
}

/** How much larger (or smaller) than the common size to draw a category's icon, and how far to move it up and left. */
export function categoryIconTweak(category: string): Tweak {
  return ART.get(category)?.tweak ?? { k: 1, up: 0, left: 0 };
}
