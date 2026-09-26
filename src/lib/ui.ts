import { engine } from './session.svelte';

const HUES = [32, 200, 350, 130, 270, 55, 175, 10, 300, 90, 225, 150];

export function playerColor(slot: number) {
  const h = HUES[slot % HUES.length];
  return `hsl(${h} 55% 55%)`;
}

export function itemImage(id: string) {
  return `${import.meta.env.BASE_URL}items/${id}.webp`;
}

export function itemName(id: string) {
  return engine.byId.get(id)?.name ?? '???';
}

// Art used (as a silhouette) on the category cards.
const ICON_OVERRIDES: Record<string, string> = {};
const icons = new Map<string, string>();
for (const cat of engine.categories) {
  const list = engine.byCategory.get(cat)!;
  const pick = list.find((it) => it.name === ICON_OVERRIDES[cat]) ?? list[Math.floor(list.length / 2)];
  icons.set(cat, pick.id);
}

/** Absolute URL, safe to use inside CSS custom properties. */
export function categoryIcon(category: string) {
  return new URL(itemImage(icons.get(category)!), document.baseURI).href;
}

export function categorySize(category: string) {
  return engine.byCategory.get(category)?.length ?? 0;
}

export function preload(src: string) {
  const img = new Image();
  img.src = src;
}
