import { engine } from './session.svelte';
import { itemImage } from './ui-paths';
import { PALETTE } from './palette';

export function playerColor(slot: number) {
  return PALETTE[slot % PALETTE.length];
}

export { itemImage };

// Art used (as a silhouette) on the category cards: for each category an
// item picked from all of them shown on the card, by name so a data refresh
// that reorders the items keeps it.
const ICON_ITEM: Record<string, string> = {
  'One-Handed Weapons': "Adonia's Ego",
  'Two-Handed Weapons': "Death's Harp",
  'Off-Hands': "Cadiro's Gambit",
  'Body Armours': "Cospri's Will",
  Helmets: 'Horns of Bynden',
  'Gloves & Boots': 'Decree of Flight',
  Rings: "Ming's Heart",
  'Amulets & Belts': 'Astramentis',
  'Flasks, Charms, Jewels, Relics & Tablets': "Uhtred's Chalice",
};
// Each chosen item's size against the common one (lib/iconFit), and how far
// to move it up (pixels at a tall card's size), set by eye: an item drawn
// larger grows up toward the arch, standing where it stood.
const ICON_FIT: Record<string, { k?: number; up?: number }> = {
  "Adonia's Ego": { k: 1.2 },
  "Death's Harp": { k: 1.28 },
  "Cadiro's Gambit": { k: 1.08 },
  "Cospri's Will": { k: 1.08 },
  "Ming's Heart": { k: 0.88, up: 10 },
  "Uhtred's Chalice": { k: 0.94 },
};
const tweaks = new Map<string, { k: number; up: number }>();
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
  if (named) tweaks.set(cat, { k: ICON_FIT[named.name]?.k ?? 1, up: ICON_FIT[named.name]?.up ?? 0 });
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

/** How much larger (or smaller) than the common size to draw a category's icon, and how far to move it up. */
export function categoryIconTweak(category: string) {
  return tweaks.get(category) ?? { k: 1, up: 0 };
}
