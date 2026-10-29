// Fossils: Path of Exile's 25 crafting fossils, as collectibles a Delve run
// can turn up (docs/gameplay.md, Delve, "Fossils"). Now and then one of the
// cards on offer is a fossil: picked and answered right, the fossil is the
// player's, kept in the codex at once (lib/fossilStore.ts). It does nothing
// in the run; taking it means passing up whatever else is on the offer, a
// find among them. Only fossils a player lacks ever turn up, so the set can
// be completed.
//
// Which offer holds one, and which, is dealt by dealFossil alone, every
// number of it in FOSSIL_DEAL. Only types come from game.ts, so the engine
// can import this module without a cycle.

/** A fossil, by the one word of its name. */
export type FossilId =
  | 'scorched'
  | 'frigid'
  | 'metallic'
  | 'jagged'
  | 'aberrant'
  | 'pristine'
  | 'dense'
  | 'corroded'
  | 'prismatic'
  | 'aetheric'
  | 'serrated'
  | 'lucent'
  | 'shuddering'
  | 'bound'
  | 'opulent'
  | 'deft'
  | 'fundamental'
  | 'faceted'
  | 'bloodstained'
  | 'hollow'
  | 'fractured'
  | 'glyphic'
  | 'tangled'
  | 'sanctified'
  | 'gilded';

export interface Fossil {
  id: FossilId;
  /** As poedb's item page names it. */
  name: string;
  /** Its crafting effect, a line each, as poedb's item page gives it. */
  effect: string[];
  /** One of the eight that turn up only deeper down, and much more rarely (FOSSIL_DEAL). */
  rare: boolean;
}

/**
 * All 25, the 17 common ones first, then the 8 rare ones, in PoE's own
 * pairs where they come in pairs (more fire, no cold; more cold, no fire).
 * Names and effects as poedb's item pages give them (poedb.tw/us/<Name>_Fossil).
 * The order is for good: a fossil's place in it is its bit in the masks a
 * player's device sends its host (fossilMask), so a new fossil only ever
 * goes at the end.
 */
export const FOSSILS: readonly Fossil[] = [
  { id: 'scorched', name: 'Scorched Fossil', effect: ['More Fire modifiers', 'No Cold modifiers'], rare: false },
  { id: 'frigid', name: 'Frigid Fossil', effect: ['More Cold modifiers', 'No Fire modifiers'], rare: false },
  { id: 'metallic', name: 'Metallic Fossil', effect: ['More Lightning modifiers', 'No Physical modifiers'], rare: false },
  { id: 'jagged', name: 'Jagged Fossil', effect: ['More Physical modifiers', 'No Chaos modifiers'], rare: false },
  { id: 'aberrant', name: 'Aberrant Fossil', effect: ['More Chaos modifiers', 'No Lightning modifiers'], rare: false },
  { id: 'pristine', name: 'Pristine Fossil', effect: ['More Life modifiers', 'No Defence modifiers'], rare: false },
  { id: 'dense', name: 'Dense Fossil', effect: ['More Defence modifiers', 'No Life Modifiers'], rare: false },
  { id: 'corroded', name: 'Corroded Fossil', effect: ['More Physical Ailment or Chaos Ailment modifiers', 'No Elemental modifiers'], rare: false },
  { id: 'prismatic', name: 'Prismatic Fossil', effect: ['More Elemental modifiers', 'No Physical Ailment or Chaos Ailment modifiers'], rare: false },
  { id: 'aetheric', name: 'Aetheric Fossil', effect: ['More Caster modifiers', 'Fewer Attack modifiers'], rare: false },
  { id: 'serrated', name: 'Serrated Fossil', effect: ['More Attack modifiers', 'Fewer Caster modifiers'], rare: false },
  { id: 'lucent', name: 'Lucent Fossil', effect: ['More Mana modifiers', 'No Speed modifiers'], rare: false },
  { id: 'shuddering', name: 'Shuddering Fossil', effect: ['More Speed modifiers', 'No Mana modifiers'], rare: false },
  { id: 'bound', name: 'Bound Fossil', effect: ['More Minion, Aura or Curse modifiers'], rare: false },
  { id: 'opulent', name: 'Opulent Fossil', effect: ['More Drop modifiers', 'No Tagless modifiers'], rare: false },
  { id: 'deft', name: 'Deft Fossil', effect: ['More Critical modifiers', 'No Attribute modifiers'], rare: false },
  { id: 'fundamental', name: 'Fundamental Fossil', effect: ['More Attribute modifiers', 'No Critical modifiers'], rare: false },
  { id: 'faceted', name: 'Faceted Fossil', effect: ['More Gem modifiers'], rare: true },
  { id: 'bloodstained', name: 'Bloodstained Fossil', effect: ['Corrupted', 'Has a Corrupted implicit modifier'], rare: true },
  { id: 'hollow', name: 'Hollow Fossil', effect: ['Has an Abyssal socket'], rare: true },
  { id: 'fractured', name: 'Fractured Fossil', effect: ['Fracture a random modifier', 'Cannot be used on Influenced or Fractured items'], rare: true },
  { id: 'glyphic', name: 'Glyphic Fossil', effect: ['Has a Corrupt Essence modifier'], rare: true },
  {
    id: 'tangled',
    name: 'Tangled Fossil',
    effect: ['Makes a random modifier type much more likely and prevents another random modifier type', 'Effects revealed once resonator is fully socketed'],
    rare: true,
  },
  { id: 'sanctified', name: 'Sanctified Fossil', effect: ['Numeric modifier values are lucky', 'High Level modifiers are more common'], rare: true },
  { id: 'gilded', name: 'Gilded Fossil', effect: ['Item is overvalued by vendors'], rare: true },
];

export const FOSSIL_COUNT = FOSSILS.length;
export const FOSSIL_IDS: readonly FossilId[] = FOSSILS.map((f) => f.id);
const BY_ID = new Map(FOSSILS.map((f) => [f.id as string, f]));

export const isFossilId = (v: unknown): v is FossilId => typeof v === 'string' && BY_ID.has(v);
export const fossilById = (id: FossilId): Fossil => BY_ID.get(id)!;

/** A fossil's picture (public/fossils/, upscaled as the items' are: scripts/upscale-art.py --fossils), full size or its `size` px copy. */
export const fossilArt = (id: FossilId, size?: 128 | 256) => `${import.meta.env.BASE_URL}fossils/${size ? `${size}/` : ''}${encodeURIComponent(id)}.avif`;

// ---- masks: a set of fossils as one number -----------------------------------

/** The bit of a fossil in a mask (its place in FOSSILS). */
const bitOf = (id: FossilId) => 1 << FOSSIL_IDS.indexOf(id);

/** Every fossil there is, as a mask. */
export const ALL_FOSSILS = (1 << FOSSIL_COUNT) - 1;

/** A set of fossils as a mask, one bit each (FOSSILS' order): what a device tells its host it holds. */
export const fossilMask = (ids: Iterable<FossilId>) => {
  let m = 0;
  for (const id of ids) if (isFossilId(id)) m |= bitOf(id);
  return m;
};

/** Whether `v` reads as a mask of fossils this build knows. */
export const isFossilMask = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= ALL_FOSSILS;

/** Whether mask `m` holds `id`. */
export const holds = (m: number, id: FossilId) => (m & bitOf(id)) !== 0;

/** The fossils in mask `m`, in FOSSILS' order. */
export const fossilsIn = (m: number): FossilId[] => FOSSIL_IDS.filter((id) => holds(m, id));

// ---- the deal ------------------------------------------------------------------

/**
 * Every number the deal goes by, in the engine's depths (one more than a
 * player sees: delve.ts shownDepth). A fossil rides on an ordinary category
 * card, as a find does, never on a find's card, and at most one an offer.
 * They are dealt as the finds are: one roll per offer against two slices in
 * turn, the rares' and then the commons', each with its own chance by depth.
 *
 * - The first-fossil hook: until a player holds their first fossil, the
 *   first offer of every depth from `hookFrom` (shown 5) holds a common,
 *   certain, as a find is on its own first depth; one after a miss there
 *   rolls as any other. Together, while anyone standing holds none.
 * - Commons, from `common.from` (shown 5): `common.start` of plain offers,
 *   `common.step` more every depth, `common.cap` from shown 35 and holding;
 *   on an offer that holds a find (from shown 10) `common.withFind`, so most
 *   fossil cards past 10 sit beside a find, and taking one means passing it.
 * - Rares (the 8), none above `rare.from` (shown 25, the Azurite Vein's
 *   depth): `rare.start` there, `rare.step` more every depth, `rare.cap`
 *   from shown 55 and holding; `rare.findBoost` times that on an offer with
 *   a find.
 * - Caps a run, each player's own: `caps.common` commons and `caps.rare`
 *   rares. A slice whose cap a taker has reached, or whose fossils they all
 *   hold, finds nothing for them; once it does for every taker, its roll
 *   finds nothing at all and never feeds the other slice.
 *
 * Tuned on 95 counted runs (58 ended before shown 10, 22 in 10 to 19, 12 in
 * 20 to 29, 3 at 30 or deeper; about 75% of answers right) and the design
 * review's simulation: a newcomer has their first fossil in their first run
 * or two that reach depth 5, the 17 commons take some fifty runs of a
 * regular (weeks), the 8 rares a hundred or more of a player who gets past
 * 25 to 30 (weeks to months). docs/gameplay.md, "Fossils", has the table.
 */
export const FOSSIL_DEAL = {
  hookFrom: 6,
  common: { from: 6, start: 0.04, step: 0.002, cap: 0.1, withFind: 0.4 },
  rare: { from: 26, start: 0.02, step: 0.002, cap: 0.08, findBoost: 4 },
  caps: { common: 2, rare: 1 },
} as const;

const depthOf = (d: number) => (Number.isFinite(d) ? Math.floor(d) : 0);
const round4 = (x: number) => Math.round(x * 10_000) / 10_000;

/** How likely an offer at depth `d` is to hold a fossil of a tier, for a taker its slice finds one for; `withFind`: the offer holds a find. */
export function fossilChance(rare: boolean, d: number, withFind: boolean): number {
  const depth = depthOf(d);
  if (rare) {
    const r = FOSSIL_DEAL.rare;
    if (depth < r.from) return 0;
    return round4(Math.min(r.cap, r.start + r.step * (depth - r.from)) * (withFind ? r.findBoost : 1));
  }
  const c = FOSSIL_DEAL.common;
  if (depth < c.from) return 0;
  return withFind ? c.withFind : round4(Math.min(c.cap, c.start + c.step * (depth - c.from)));
}

/**
 * One player an offer could hold a fossil for: the fossils they hold (a
 * mask, those given this run in it) and how many of each tier this run gave
 * them.
 */
export interface FossilTaker {
  held: number;
  common: number;
  rare: number;
}

/** The fossils of a tier a slice could give `t`: those they lack, while the run's cap for it isn't reached. */
export function lackedBy(t: FossilTaker, rare: boolean): FossilId[] {
  if (t[rare ? 'rare' : 'common'] >= FOSSIL_DEAL.caps[rare ? 'rare' : 'common']) return [];
  return FOSSILS.filter((f) => f.rare === rare && !holds(t.held, f.id)).map((f) => f.id);
}

/** Whether the first-fossil hook holds for `t`: they hold none yet. */
export const hooked = (t: FossilTaker) => t.held === 0;

/**
 * The fossil an offer at depth `d` holds, or null: the whole deal (see
 * FOSSIL_DEAL). `takers`: alone the player on turn, together everyone
 * standing. `fresh`: the depth's first offer (not one after a miss there);
 * `withFind`: the offer holds a find. `rng` in [0, 1). The fossil is drawn
 * from those of its tier that any taker its slice counts lacks.
 */
export function dealFossil(d: number, takers: FossilTaker[], opts: { fresh: boolean; withFind: boolean }, rng: () => number): FossilId | null {
  const pool = (rare: boolean, who = takers) => [...new Set(who.flatMap((t) => lackedBy(t, rare)))].sort((a, b) => FOSSIL_IDS.indexOf(a) - FOSSIL_IDS.indexOf(b));
  const draw = (ids: FossilId[]) => (ids.length ? ids[Math.min(ids.length - 1, Math.floor(rng() * ids.length))] : null);
  const hook = takers.filter(hooked);
  if (opts.fresh && depthOf(d) >= FOSSIL_DEAL.hookFrom && hook.length) return draw(pool(false, hook));
  const rare = fossilChance(true, d, opts.withFind);
  const common = fossilChance(false, d, opts.withFind);
  if (rare + common <= 0) return null;
  const r = rng();
  if (r < rare) return draw(pool(true));
  if (r < rare + common) return draw(pool(false));
  return null;
}

/** A fossil on one of the cards on offer (Delve.fossil). */
export interface CardFossil {
  category: string;
  id: FossilId;
}

