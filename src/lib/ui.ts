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
// Gem icons are square tiles, so lineage gems get a drawn gem instead.
const GEM_ICON =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
      '<path d="M30 12h16l-8 24H10zM49 13h2l9 23H40zM54 12h16l20 24H62zM10 40h28l10 46zM41 40h18l-9 44zM62 40h28L52 86z"/></svg>',
  );
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
