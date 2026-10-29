// Fossils: Path of Exile's 25 fossils, as collectibles a Delve run can turn
// up (docs/gameplay.md, Delve, "Fossils"). Now and then one of the cards on
// offer is a fossil: picked and answered right, the fossil is the player's,
// kept in the codex at once (lib/fossilStore.ts). It does nothing in the
// run; taking it means passing up whatever else is on the offer, a find
// among them. Only fossils a player lacks ever turn up, so the set can be
// completed, and at most one a run and one a day (UTC), so it takes weeks
// of coming back.
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
  /** One of the eight that turn up only deeper down, and much more rarely (FOSSIL_DEAL). */
  rare: boolean;
}

/**
 * All 25, the 17 common ones first, then the 8 rare ones, in PoE's own
 * pairs where they come in pairs (more fire, no cold; more cold, no fire).
 * Names as poedb's item pages give them (poedb.tw/us/<Name>_Fossil).
 * The order is for good: a fossil's place in it is its bit in the masks a
 * player's device sends its host (fossilMask), so a new fossil only ever
 * goes at the end.
 */
export const FOSSILS: readonly Fossil[] = [
  { id: 'scorched', name: 'Scorched Fossil', rare: false },
  { id: 'frigid', name: 'Frigid Fossil', rare: false },
  { id: 'metallic', name: 'Metallic Fossil', rare: false },
  { id: 'jagged', name: 'Jagged Fossil', rare: false },
  { id: 'aberrant', name: 'Aberrant Fossil', rare: false },
  { id: 'pristine', name: 'Pristine Fossil', rare: false },
  { id: 'dense', name: 'Dense Fossil', rare: false },
  { id: 'corroded', name: 'Corroded Fossil', rare: false },
  { id: 'prismatic', name: 'Prismatic Fossil', rare: false },
  { id: 'aetheric', name: 'Aetheric Fossil', rare: false },
  { id: 'serrated', name: 'Serrated Fossil', rare: false },
  { id: 'lucent', name: 'Lucent Fossil', rare: false },
  { id: 'shuddering', name: 'Shuddering Fossil', rare: false },
  { id: 'bound', name: 'Bound Fossil', rare: false },
  { id: 'opulent', name: 'Opulent Fossil', rare: false },
  { id: 'deft', name: 'Deft Fossil', rare: false },
  { id: 'fundamental', name: 'Fundamental Fossil', rare: false },
  { id: 'faceted', name: 'Faceted Fossil', rare: true },
  { id: 'bloodstained', name: 'Bloodstained Fossil', rare: true },
  { id: 'hollow', name: 'Hollow Fossil', rare: true },
  { id: 'fractured', name: 'Fractured Fossil', rare: true },
  { id: 'glyphic', name: 'Glyphic Fossil', rare: true },
  { id: 'tangled', name: 'Tangled Fossil', rare: true },
  { id: 'sanctified', name: 'Sanctified Fossil', rare: true },
  { id: 'gilded', name: 'Gilded Fossil', rare: true },
];

export const FOSSIL_COUNT = FOSSILS.length;
export const FOSSIL_IDS: readonly FossilId[] = FOSSILS.map((f) => f.id);
const BY_ID = new Map(FOSSILS.map((f) => [f.id as string, f]));

export const isFossilId = (v: unknown): v is FossilId => typeof v === 'string' && BY_ID.has(v);
export const fossilById = (id: FossilId): Fossil => BY_ID.get(id)!;

/** A fossil's name with its article, as a sentence names it: an Aberrant Fossil, a Jagged Fossil. */
export const aFossil = (id: FossilId) => {
  const name = fossilById(id).name;
  return `${/^[AEIOU]/.test(name) ? 'an' : 'a'} ${name}`;
};

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

/** A UTC day, as a number (days since 1970): the day a fossil was found, for the one a day. */
export const fossilDay = (ms: number) => Math.floor(ms / 86_400_000);

/**
 * What a player's device holds, for the deal: its fossils as a mask, and the
 * UTC day of its latest find (null for none), from the found dates it keeps
 * (fossilStore.ts), so paired devices, which keep the earlier date of one
 * both found, agree on it.
 */
export interface FossilsHeld {
  held: number;
  day: number | null;
}
export const NO_FOSSILS: FossilsHeld = { held: 0, day: null };

/** Whether `v` reads as a UTC day a fossil could have been found on. */
export const isFossilDay = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 1_000_000;

/**
 * The host's answer to the deal's question of what each of `ids` holds
 * (Engine.setFossilsHeld): a guest's device's as its hello said (and runs
 * since gave), kept by player id past a dropped link, so a player away from
 * a run they still stand in is dealt as themselves; this device's own
 * (`here`) only for its own players (the host, those at its screen, `own`).
 * A player never heard from holds none.
 */
export function heldFor(ids: readonly string[], known: ReadonlyMap<string, FossilsHeld>, own: (id: string) => boolean, here: () => FossilsHeld): FossilsHeld[] {
  let mine: FossilsHeld | null = null;
  return ids.map((id) => (own(id) ? (mine ??= here()) : (known.get(id) ?? NO_FOSSILS)));
}

// ---- the deal ------------------------------------------------------------------

/**
 * Every number the deal goes by, in the engine's depths (one more than a
 * player sees: delve.ts shownDepth). A fossil rides on an ordinary category
 * card, as a find does, never on a find's card, and at most one an offer.
 * They are dealt as the finds are: one roll per offer against two slices in
 * turn, the rares' and then the commons', each with its own chance by depth.
 *
 * - One a day and one a run, each player's own: one found today (UTC, by
 *   the found dates), or given this run, and nothing more turns up for them
 *   until tomorrow, or the next run.
 * - The first-fossil hook: until a player holds their first fossil, the
 *   first offer of every depth from `hookFrom` (shown 5) holds a common,
 *   certain, as a find is on its own first depth; one after a miss there
 *   rolls as any other. That first one is the day's. Together, while anyone
 *   standing holds none.
 * - Commons, from `common.from` (shown 5): `common.start` of plain offers,
 *   `common.step` more every depth, `common.cap` from shown 30 and holding;
 *   on an offer that holds a find (from shown 10) `common.withFind`.
 * - Rares (the 8), none above `rare.from` (shown 25, the Azurite Vein's
 *   depth): `rare.start` there, `rare.step` more every depth, `rare.cap`
 *   from shown 55 and holding; `rare.findBoost` times that on an offer with
 *   a find.
 * - A slice whose fossils its takers all hold, or that can't give them one
 *   today or this run, finds nothing; it never feeds the other slice.
 *
 * Tuned on the counted runs (of 95, 58 ended before shown 10, 22 in 10 to
 * 19, 12 in 20 to 29, 3 at 30 or deeper; about 75% of answers right) by
 * simulation, at three runs a day: a player whose runs end about 12 deep
 * finds the day's fossil on about half the days, one whose runs end past 20
 * on most; the whole set takes such a deep player about three months, one
 * whose runs end near 30 about seven weeks. docs/gameplay.md, "Fossils",
 * has the table.
 */
export const FOSSIL_DEAL = {
  hookFrom: 6,
  common: { from: 6, start: 0.01, step: 0.002, cap: 0.06, withFind: 0.3 },
  rare: { from: 26, start: 0.01, step: 0.001, cap: 0.04, findBoost: 3 },
  perRun: 1,
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
 * mask, those given this run in it), how many this run gave them, and
 * whether they found one today.
 */
export interface FossilTaker {
  held: number;
  run: number;
  today: boolean;
}

/** Whether `t` can be given a fossil now: none found today, none given this run. */
const open = (t: FossilTaker) => !t.today && t.run < FOSSIL_DEAL.perRun;

/** The fossils of a tier a slice could give `t`: those they lack, while they found none today and the run gave them none. */
export function lackedBy(t: FossilTaker, rare: boolean): FossilId[] {
  if (!open(t)) return [];
  return FOSSILS.filter((f) => f.rare === rare && !holds(t.held, f.id)).map((f) => f.id);
}

/** Whether the first-fossil hook holds for `t`: they hold none yet. */
export const hooked = (t: FossilTaker) => t.held === 0 && open(t);

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
  // Nobody it could go to (each found today's, or took this run's): no roll at all.
  if (!takers.some(open)) return null;
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

