import { engine } from './session.svelte';
import { itemImage } from './ui-paths';

const HUES = [32, 200, 350, 130, 270, 55, 175, 10, 300, 90, 225, 150];

export function playerColor(slot: number) {
  const h = HUES[slot % HUES.length];
  return `hsl(${h} 55% 55%)`;
}

export { itemImage };

export function itemName(id: string) {
  return engine.byId.get(id)?.name ?? '???';
}

// Art used (as a silhouette) on the category cards: an item from the group
// that best represents the category.
const ICON_GROUP: Record<string, string> = {
  'One-Handed Weapons': 'One-Handed Maces',
  'Two-Handed Weapons': 'Bows',
  'Off-Hands': 'Quivers',
  'Gloves & Boots': 'Boots',
  'Amulets & Belts': 'Amulets',
  'Flasks, Jewels & Relics': 'Flasks',
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

export function preload(src: string) {
  const img = new Image();
  img.src = src;
}
