import { engine } from './session.svelte';
import { itemImage, itemSrcset, itemThumb } from './ui-paths';
import { PALETTE } from './palette';

export function playerColor(slot: number) {
  return PALETTE[slot % PALETTE.length];
}

export { itemImage, itemSrcset, itemThumb };

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
// to move it up and left (pixels at a tall card's size), set by eye: an
// item drawn larger grows up toward the arch, standing where it stood.
type Tweak = { k: number; up: number; left: number };
const ICON_FIT: Record<string, Partial<Tweak>> = {
  "Adonia's Ego": { k: 1.2 },
  // Its tip on the card's middle (it stands 58% of the way across).
  "Death's Harp": { k: 1.22, left: 4 },
  'Horns of Bynden': { up: 8 },
  "Oisín's Oath": { k: 0.94 },
  "Cadiro's Gambit": { k: 1.08 },
  "Cospri's Will": { k: 1.08 },
  "Ming's Heart": { k: 0.88, up: 10 },
  "Uhtred's Chalice": { k: 0.94 },
};
const tweaks = new Map<string, Tweak>();
const tweak = (name: string): Tweak => ({ k: 1, up: 0, left: 0, ...ICON_FIT[name] });
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
// A category that names several kinds of item ("Gloves & Boots") shows one
// of each: its emblem (ICON_ITEM) in front, and an item of each other kind
// named behind it, so the card says at a glance what it holds. Each is
// picked for an outline that says its kind even when small and partly
// hidden (ChooseCategory places each kind by eye for its item). By name as
// above, else the group's middle item.
const COMPANIONS: Record<string, [group: string, name: string][]> = {
  'Gloves & Boots': [['Gloves', "Leopold's Applause"]],
  'Amulets & Belts': [['Belts', 'Ingenuity']],
  'Flasks, Charms, Jewels, Relics & Tablets': [
    ['Charms', "Arakaali's Gift"],
    ['Jewels', 'Prism of Belief'],
    ['Relics', 'The Desperate Alliance'],
    ['Tablets', 'Freedom of Faith'],
  ],
};
// Gem art comes as square tiles on cloth, so lineage gems use a cut-out of
// Oisín's Oath (public/icons/, background removed with rembg, given the same
// soft drop shadow as the poe2db item art, and padded so it sits a little
// smaller).
const GEM_ICON = new URL(`${import.meta.env.BASE_URL}icons/lineage-gems.webp`, document.baseURI).href;
const icons = new Map<string, string>();
/** The same, as 128 px copies (itemThumb), for small glyphs. */
const glyphs = new Map<string, string>();
/** The other kinds' icons for a category that names several (see COMPANIONS). */
const companions = new Map<string, Companion[]>();
for (const cat of engine.categories) {
  const list = engine.byCategory.get(cat)!;
  if (list[0].kind === 'gem') {
    icons.set(cat, GEM_ICON);
    glyphs.set(cat, GEM_ICON);
    tweaks.set(cat, tweak("Oisín's Oath"));
    continue;
  }
  const named = list.find((it) => it.name === ICON_ITEM[cat]);
  if (named) tweaks.set(cat, tweak(named.name));
  const preferred = list.filter((it) => it.group === ICON_GROUP[cat]);
  const pool = preferred.length ? preferred : list;
  const id = (named ?? pool[Math.floor(pool.length / 2)]).id;
  icons.set(cat, new URL(itemImage(id), document.baseURI).href);
  glyphs.set(cat, new URL(itemThumb(id, 128), document.baseURI).href);
  const others = (COMPANIONS[cat] ?? []).flatMap(([group, name]) => {
    const pool = list.filter((it) => it.group === group);
    const it = pool.find((it) => it.name === name) ?? pool[Math.floor(pool.length / 2)];
    return it ? [{ kind: group, url: new URL(itemImage(it.id), document.baseURI).href }] : [];
  });
  if (others.length) companions.set(cat, others);
}

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

/** Every category's icon, and their companions' (to measure them all ahead of the deal). */
export function categoryIcons() {
  return [...icons.values(), ...[...companions.values()].flat().map((c) => c.url)];
}

/** How much larger (or smaller) than the common size to draw a category's icon, and how far to move it up and left. */
export function categoryIconTweak(category: string): Tweak {
  return tweaks.get(category) ?? { k: 1, up: 0, left: 0 };
}
