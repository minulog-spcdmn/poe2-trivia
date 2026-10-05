import { engine } from './session.svelte';
import { itemImage } from './ui-paths';
import { PALETTE } from './palette';

export function playerColor(slot: number) {
  return PALETTE[slot % PALETTE.length];
}

export { itemImage };

// Art used (as a silhouette) on the category cards: for each category the
// item whose silhouette reads clearest at a glance (picked from contact
// sheets of every item's silhouette), by name so a data refresh that
// reorders the items keeps it.
const ICON_ITEM: Record<string, string> = {
  'One-Handed Weapons': "Brynhand's Mark",
  'Two-Handed Weapons': "Lioneye's Glare",
  'Off-Hands': "Calgyra's Arc",
  'Body Armours': 'Tabula Rasa',
  Helmets: 'Horns of Bynden',
  'Gloves & Boots': "Leopold's Applause",
  Rings: 'Evergrasping Ring',
  'Amulets & Belts': 'Rondel of Fragility',
  'Flasks, Charms, Jewels, Relics & Tablets': "Lavianga's Spirits",
};
// Should one of those leave the data, an item from the group that best
// represents the category.
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
  const named = list.find((it) => it.name === ICON_ITEM[cat]);
  const preferred = list.filter((it) => it.group === ICON_GROUP[cat]);
  const pool = preferred.length ? preferred : list;
  icons.set(cat, new URL(itemImage((named ?? pool[Math.floor(pool.length / 2)]).id), document.baseURI).href);
}

/** Absolute URL, safe to use inside CSS custom properties. */
export function categoryIcon(category: string) {
  return icons.get(category)!;
}

/** Every category's icon (to measure them all ahead of the deal). */
export function categoryIcons() {
  return [...icons.values()];
}
