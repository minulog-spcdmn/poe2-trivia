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
// Gem icons are square tiles, so lineage gems get a drawn crystal cluster
// instead: half-transparent facets for shading and roughened edges so it
// matches the painted item silhouettes.
const GEM_ICON =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 120">' +
      '<filter id="r"><feTurbulence type="fractalNoise" baseFrequency=".08" numOctaves="2" seed="7"/>' +
      '<feDisplacementMap in="SourceGraphic" scale="3"/></filter><g filter="url(#r)">' +
      '<path d="M41 104 38 38 53 3 52 108z" opacity=".55"/><path d="M53 3 68 33 63 102 52 108z"/>' +
      '<path d="M33 109 11 55 12 22 24 58z" opacity=".55"/><path d="M12 22 30 50 38 101 33 109 24 58z"/>' +
      '<path d="M66 104 72 55 91 30 80 65z" opacity=".55"/><path d="M91 30 93 66 74 110 66 104 80 65z"/>' +
      '<path d="M26 114 6 94 9 79 20 95z" opacity=".55"/><path d="M9 79 22 90 32 110 26 114 20 95z"/>' +
      '<path d="M78 112 88 90 97 88 88 106z" opacity=".75"/><path d="M36 116 40 108 52 112 64 106 72 112 68 117z"/>' +
      '</g></svg>',
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
