// Which art each category card shows: its emblem, the items of the other
// kinds it names behind it (ChooseCategory), its small glyph (the codex's)
// and how its emblem sits. Paths are from the site's base; lib/ui makes them
// URLs. Kept free of the page (no document, no Vite) so tests can check
// every picture chosen here is baked (scripts/bake-icons.mjs, lib/iconFit).

import type { Item } from './game.ts';
import { itemFile } from './ui-paths.ts';

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
  'Amulets & Belts': 'Mageblood',
  'Flasks, Charms, Jewels, Relics & Tablets': "Uhtred's Chalice",
};

// Each chosen item's size against the common one (lib/iconFit), and how far
// to move it up and left (pixels at a tall card's size), set by eye: an
// item drawn larger grows up toward the arch, standing where it stood.
export type Tweak = { k: number; up: number; left: number };
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
const tweak = (name: string): Tweak => ({ k: 1, up: 0, left: 0, ...ICON_FIT[name] });
// Should one of those leave the data, an item from the group that best
// represents the category.
const ICON_GROUP: Record<string, string> = {
  'One-Handed Weapons': 'One-Handed Maces',
  'Two-Handed Weapons': 'Bows',
  'Off-Hands': 'Quivers',
  'Gloves & Boots': 'Boots',
  'Amulets & Belts': 'Belts',
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
  'Amulets & Belts': [['Amulets', 'Astramentis']],
  'Flasks, Charms, Jewels, Relics & Tablets': [
    ['Charms', "Valako's Roar"],
    ['Jewels', 'Grand Spectrum'],
    ['Relics', 'The Desperate Alliance'],
    ['Tablets', 'Freedom of Faith'],
  ],
};
// Gem art comes as square tiles on cloth, so lineage gems use a cut-out of
// Oisín's Oath (public/icons/, background removed with rembg, given the same
// soft drop shadow as the poe2db item art, and padded so it sits a little
// smaller).
const GEM_ICON = 'icons/lineage-gems.webp';

/** An item of another kind a category names, shown behind its icon: the kind (its group) and the item's picture. */
export type CompanionArt = { kind: string; icon: string };

/** A category's art: its icon (full size), its glyph (the 128 px copy), its companions, all paths from the site's base; and its icon's tweak. */
export interface CategoryArt {
  icon: string;
  glyph: string;
  companions: CompanionArt[];
  tweak: Tweak;
}

/** Every category's art, from its items (Engine.byCategory). */
export function categoryArt(byCategory: ReadonlyMap<string, readonly Item[]>): Map<string, CategoryArt> {
  const out = new Map<string, CategoryArt>();
  for (const [cat, list] of byCategory) {
    if (list[0].kind === 'gem') {
      out.set(cat, { icon: GEM_ICON, glyph: GEM_ICON, companions: [], tweak: tweak("Oisín's Oath") });
      continue;
    }
    const named = list.find((it) => it.name === ICON_ITEM[cat]);
    const preferred = list.filter((it) => it.group === ICON_GROUP[cat]);
    const pool = preferred.length ? preferred : list;
    const id = (named ?? pool[Math.floor(pool.length / 2)]).id;
    const companions = (COMPANIONS[cat] ?? []).flatMap(([group, name]) => {
      const pool = list.filter((it) => it.group === group);
      const it = pool.find((it) => it.name === name) ?? pool[Math.floor(pool.length / 2)];
      return it ? [{ kind: group, icon: itemFile(it.id) }] : [];
    });
    out.set(cat, { icon: itemFile(id), glyph: itemFile(id, 128), companions, tweak: named ? tweak(named.name) : tweak('') });
  }
  return out;
}

/** Every picture a category card shows (icons and companions, each once): what bake-icons bakes. */
export function cardPictures(arts: Iterable<CategoryArt>): string[] {
  return [...new Set([...arts].flatMap((a) => [a.icon, ...a.companions.map((c) => c.icon)]))];
}
