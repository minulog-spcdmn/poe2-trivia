import { engine } from './session.svelte';
import { itemImage } from './ui-paths';

// Jewel tones picked in OKLCH so every seat is about as bright as the others
// and no two look alike. Seats fill in order: seat 1 is the site's own amber,
// so a single player doesn't look out of place. The last seat (ruby) is
// reserved for zoe_arcana (see RESERVED_HUES in game.ts).
const PALETTE = ['#cb904d', '#5faeff', '#3cb982', '#b37ad8', '#44bbcf', '#d2699d', '#e3b661', '#a9b741', '#7b8ed3', '#7cd1ae', '#e691a9', '#ea6a64'];

export function playerColor(slot: number) {
  return PALETTE[slot % PALETTE.length];
}

export { itemImage };

// Art used (as a silhouette) on the category cards: an item from the group
// that best represents the category.
const ICON_GROUP: Record<string, string> = {
  'One-Handed Weapons': 'One-Handed Maces',
  'Two-Handed Weapons': 'Bows',
  'Off-Hands': 'Quivers',
  'Gloves & Boots': 'Boots',
  'Amulets & Belts': 'Amulets',
  'Flasks, Charms, Jewels, Relics & Tablets': 'Flasks',
};
// Gem art comes as square tiles on cloth, so lineage gems use a cut-out of
// Oisín's Oath (public/icons/, background removed with rembg, given the same
// soft drop shadow as the poe2db item art, and padded so it sits a little
// smaller).
const GEM_ICON = new URL(`${import.meta.env.BASE_URL}icons/lineage-gems.webp`, document.baseURI).href;
const icons = new Map<string, string>();
for (const cat of engine.categories) {
  const list = engine.byCategory.get(cat)!;
  if (list[0].kind === 'gem') {
    icons.set(cat, GEM_ICON);
    continue;
  }
  const preferred = list.filter((it) => it.group === ICON_GROUP[cat]);
  const pool = preferred.length ? preferred : list;
  icons.set(cat, new URL(itemImage(pool[Math.floor(pool.length / 2)].id), document.baseURI).href);
}

/** Absolute URL, safe to use inside CSS custom properties. */
export function categoryIcon(category: string) {
  return icons.get(category)!;
}
