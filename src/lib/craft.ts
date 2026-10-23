// Craft: every round each player is dealt a unique, scrambles it with
// currency (aimed, as currency is used in Path of Exile 2: picked up, then
// put on the line or the part of the picture it is for) and passes it on; the next player un-scrambles what they can
// and names it from six. A right name earns gold from the bank, a wrong one
// pays the item's maker. Gold buys the currency between rounds, and it is
// the score: the most after the last round wins, or the first to the cap.
//
// The rules here are pure: the engine (game.ts) keeps a Craft in the state
// and calls them, the host's session times its steps and sends each player
// the pictures they may see (craftLooks.ts).

type Rng = () => number;

/** The currencies. Some names are working names until the owner picks theirs. */
export type Orb = 'annul' | 'chaos' | 'veil' | 'chance' | 'exalt' | 'divine' | 'unveil';

/** Scrambles are used on your own item, undos on the one you guess. */
export type Side = 'scramble' | 'undo';

export interface OrbKind {
  name: string;
  price: number;
  side: Side;
  /** What it does, in a line. */
  does: string;
}

export const ORBS: Record<Orb, OrbKind> = {
  annul: { name: 'Orb of Annulment', price: 2, side: 'scramble', does: 'Takes away the mod line you put it on.' },
  chaos: { name: 'Chaos Orb', price: 4, side: 'scramble', does: 'Swaps the line you put it on, or the picture, for another item’s.' },
  veil: { name: 'Veil Orb', price: 2, side: 'scramble', does: 'Hides the part of the picture you put it on.' },
  chance: { name: 'Orb of Chance', price: 2, side: 'scramble', does: 'Trades your item for a fresh one.' },
  exalt: { name: 'Exalted Orb', price: 3, side: 'undo', does: 'Brings back a line that was taken away.' },
  divine: { name: 'Divine Orb', price: 4, side: 'undo', does: 'Puts back a line, or the picture, that was swapped.' },
  unveil: { name: 'Unveil Orb', price: 2, side: 'undo', does: 'Uncovers a hidden part of the picture.' },
};

export const ORB_LIST = Object.keys(ORBS) as Orb[];
export const SCRAMBLES = ORB_LIST.filter((o) => ORBS[o].side === 'scramble');
export const UNDOS = ORB_LIST.filter((o) => ORBS[o].side === 'undo');
export const isOrb = (v: unknown): v is Orb => typeof v === 'string' && Object.hasOwn(ORBS, v);

/** The numbers to tune, all in one place. */
export const CRAFT = {
  /** Gold each player starts with. */
  startGold: 20,
  /** A right name: from the bank to the guesser. */
  rightPay: 10,
  /** A wrong name (or none in time): from the guesser to the maker, as much of it as they have. */
  wrongCost: 10,
  /** The game ends after this round… */
  rounds: 8,
  /** …or after the round someone reaches this much gold. */
  goldCap: 80,
  shopMs: 30_000,
  craftMs: 40_000,
  guessMs: 45_000,
  revealMs: 12_000,
  /** Names to pick from. */
  options: 6,
  /** Only items with at least this many mod lines are dealt. */
  minLines: 3,
  /** Each Veil Orb hides about one in this many of the picture's patches (those nearest where it was put), and a picture takes this many at most. */
  veilLayers: 4,
  /** The picture's patches are about the size of a grid this many across (patches.ts labelPatches). */
  veilSize: 7,
} as const;

export type CraftStep = 'shop' | 'craft' | 'guess' | 'reveal';

/**
 * A mod line as it stands: the item's own, taken away, or swapped for
 * another item's line (that item's art id, and which of its mod lines).
 */
export type Slot = 'kept' | 'gone' | { art: string; line: number };

/** One item in play this round: its maker scrambles it, its guesser names it. */
export interface Piece {
  maker: string;
  guesser: string;
  /** The item (its art is its own: Item.id). Hidden from the guesser until the reveal. */
  item: string;
  /** Its mod lines as they stand, one slot per line of its own. Hidden from the guesser. */
  slots: Slot[];
  /** The art a Chaos Orb swapped in for its own (an item id), or null. Hidden from the guesser. */
  picture: string | null;
  /** Where Veil Orbs were put on its picture (each 0 to 1 across and down it), at most CRAFT.veilLayers. Hidden from the guesser. */
  veils: [number, number][];
  /** How its picture is cut into patches, and drawn (patches.ts, prepArt.ts). */
  seed: number;
  /** The names to pick from, as item ids, in the order shown. */
  options: string[];
  /** What the guesser sees: its mod lines as they stand. */
  shown: string[];
  /** Bumped whenever its picture changes (a new one goes out: craftLooks.ts). */
  look: number;
  /** The guesser's pick (an index into options), null for none in time; missing until they pick. */
  guess?: number | null;
  /** The gold the pick moved (to the guesser if right, to the maker if wrong), once settled. */
  paid?: number;
  /** The last orb used on it, and whether it changed anything (an undo with nothing to undo doesn't). */
  last?: { orb: Orb; hit: boolean };
}

export interface Craft {
  round: number;
  step: CraftStep;
  /** Host clock when the step ends by itself. */
  until: number;
  /** Each player's currency, by player id. */
  stash: Record<string, Partial<Record<Orb, number>>>;
  /** Players done with the step (it ends early once everyone playing is). */
  ready: string[];
  /** This round's items, one per player dealt in. */
  pieces: Piece[];
  /**
   * Everyone's gold as the round's shop opened: what the others see of it
   * until the reveal, so nobody reads what someone bought off their gold.
   */
  opening: Record<string, number>;
}

/** The mod lines of an item's art, by art id (itemStats.json's explicit lines). */
export type ModLines = (art: string) => readonly string[];

/** What the rules need of an item. */
export interface CraftItem {
  id: string;
  name: string;
  group: string;
  category: string;
  kind: 'unique' | 'gem';
}

/** The explicit mod lines in an item's tooltip sections (itemStats.json), without the corrupted mark. */
export function modLinesOf(sections: readonly (readonly (readonly [string, string])[])[] | undefined): string[] {
  return (sections ?? []).flatMap((s) => s.filter(([k]) => k === 'e').map(([, t]) => t));
}

/** Whether an item can be dealt: a unique with enough mod lines to scramble. */
export const dealable = (it: CraftItem, lines: ModLines) => it.kind === 'unique' && lines(it.id).length >= CRAFT.minLines;

/** How many of each orb `id` holds. */
export const holds = (c: Craft, id: string, orb: Orb) => c.stash[id]?.[orb] ?? 0;

/** The step's length. */
export const stepMs = (step: CraftStep) =>
  step === 'shop' ? CRAFT.shopMs : step === 'craft' ? CRAFT.craftMs : step === 'guess' ? CRAFT.guessMs : CRAFT.revealMs;

/** The piece `id` makes this round, and the one they guess. */
export const madeBy = (c: Craft, id: string) => c.pieces.find((p) => p.maker === id) ?? null;
export const guessedBy = (c: Craft, id: string) => c.pieces.find((p) => p.guesser === id) ?? null;

/** The mod lines as the guesser sees them. */
export function shownOf(p: Pick<Piece, 'item' | 'slots'>, lines: ModLines): string[] {
  const own = lines(p.item);
  return p.slots.flatMap((s, i) => (s === 'kept' ? [own[i]] : s === 'gone' ? [] : [lines(s.art)[s.line] ?? '']));
}

/**
 * Where a scramble is put: on a mod line (its slot, as the maker's tooltip
 * lists them, those taken away included), on the picture, or at a place on
 * the picture (0 to 1 across and down it). Chance needs none: it is put on
 * the item.
 */
export interface Aim {
  line?: number;
  picture?: boolean;
  at?: [number, number];
}

/** Whether an orb would do anything to the piece anywhere, as its maker knows it. */
export function canScramble(p: Piece, orb: Orb): boolean {
  if (orb === 'annul') return p.slots.some((s) => s !== 'gone');
  if (orb === 'veil') return p.veils.length < CRAFT.veilLayers;
  return orb === 'chaos' || orb === 'chance';
}

/** Whether an orb can be put there: Annulment on a line still there, Chaos on one or on the picture, a Veil Orb on a place on the picture, Chance on the item. */
export function canAim(p: Piece, orb: Orb, aim: Aim): boolean {
  const line = aim.line;
  const onLine = typeof line === 'number' && Number.isInteger(line) && line >= 0 && line < p.slots.length && p.slots[line] !== 'gone';
  if (orb === 'annul') return onLine;
  if (orb === 'chaos') return onLine || aim.picture === true;
  if (orb === 'veil') return canScramble(p, 'veil') && !!aim.at && aim.at.length === 2 && aim.at.every((v) => Number.isFinite(v) && v >= 0 && v <= 1);
  return orb === 'chance';
}

/** What the rules need to scramble: the items, their lines, a random source. */
export interface Table {
  items: readonly CraftItem[];
  lines: ModLines;
  rng: Rng;
}

const pick = <T>(list: readonly T[], rng: Rng): T => list[Math.floor(rng() * list.length)];

/** The items an item's lies come from: its own group's, or its category's when the group is small. */
function kin(t: Table, item: CraftItem): CraftItem[] {
  const group = t.items.filter((o) => o.id !== item.id && o.kind === 'unique' && o.group === item.group);
  if (group.length >= 3) return group;
  return t.items.filter((o) => o.id !== item.id && o.kind === 'unique' && o.category === item.category);
}

/** A mod line from another item to swap in: never one the piece already shows, nor the line it replaces. */
function strangeLine(t: Table, p: Piece, item: CraftItem, replacing: string): { art: string; line: number } | null {
  const shown = new Set([...shownOf(p, t.lines), replacing]);
  const choices = kin(t, item).flatMap((o) => t.lines(o.id).flatMap((text, line) => (shown.has(text) ? [] : [{ art: o.id, line }])));
  return choices.length ? pick(choices, t.rng) : null;
}

/**
 * Uses a scramble on the maker's piece where they put it (Chance is the
 * engine's: it deals a new item). Annulment takes the line away; Chaos
 * swaps the line, or the picture, for another item's (what it swaps in is
 * up to chance); a Veil Orb hides the part of the picture round where it
 * was put. False where it can't be put, or with nothing to swap in.
 */
export function scramble(t: Table, p: Piece, orb: Exclude<Orb, 'chance'>, aim: Aim): boolean {
  if (!canAim(p, orb, aim)) return false;
  const item = t.items.find((it) => it.id === p.item)!;
  if (orb === 'annul') p.slots[aim.line!] = 'gone';
  else if (orb === 'chaos') {
    if (aim.picture) {
      const others = kin(t, item).filter((o) => o.id !== p.picture);
      if (!others.length) return false;
      p.picture = pick(others, t.rng).id;
      p.look++;
    } else {
      const i = aim.line!;
      const s = p.slots[i];
      const now = s === 'kept' ? t.lines(p.item)[i] : t.lines((s as { art: string }).art)[(s as { line: number }).line];
      const line = strangeLine(t, p, item, now);
      if (!line) return false;
      p.slots[i] = line;
    }
  } else if (orb === 'veil') {
    p.veils.push([aim.at![0], aim.at![1]]);
    p.look++;
  } else return false;
  p.shown = shownOf(p, t.lines);
  return true;
}

/**
 * Uses an undo on the guesser's piece, aimed by chance: Exalted brings back
 * a random line that was taken away, Divine puts back a random line or the
 * picture that Chaos swapped, Unveil takes one of its veils off. With
 * nothing of its kind to undo, it does nothing (and is spent all the same).
 */
export function undo(t: Table, p: Piece, orb: Orb): boolean {
  if (orb === 'exalt') {
    const gone = p.slots.flatMap((s, i) => (s === 'gone' ? [i] : []));
    if (!gone.length) return false;
    p.slots[pick(gone, t.rng)] = 'kept';
  } else if (orb === 'divine') {
    const swapped = p.slots.flatMap((s, i) => (typeof s === 'object' ? [i] : []));
    const at = Math.floor(t.rng() * (swapped.length + (p.picture ? 1 : 0)));
    if (at < swapped.length) p.slots[swapped[at]] = 'kept';
    else if (p.picture) {
      p.picture = null;
      p.look++;
    } else return false;
  } else if (orb === 'unveil') {
    if (!p.veils.length) return false;
    p.veils.splice(Math.floor(t.rng() * p.veils.length), 1);
    p.look++;
  } else return false;
  p.shown = shownOf(p, t.lines);
  return true;
}

/**
 * Deals `maker` an item for `guesser` to name: a unique with enough lines
 * (not one in `used` while others are left), fresh, with its six names
 * (`decoys` picks the other five from the pool it's given).
 */
export function deal(
  t: Table,
  maker: string,
  guesser: string,
  used: ReadonlySet<string>,
  decoys: (answer: CraftItem, pool: CraftItem[], count: number) => CraftItem[],
): Piece {
  const all = t.items.filter((it) => dealable(it, t.lines));
  const fresh = all.filter((it) => !used.has(it.id));
  const item = pick(fresh.length ? fresh : all, t.rng);
  return {
    maker,
    guesser,
    item: item.id,
    slots: t.lines(item.id).map(() => 'kept' as const),
    picture: null,
    veils: [],
    seed: Math.floor(t.rng() * 2 ** 31),
    options: optionsFor(t, item, decoys),
    shown: [...t.lines(item.id)],
    look: 0,
  };
}

/**
 * The six names: the item and five others of its kind, from its own group
 * first (the tooltip's class says what it is), shuffled.
 */
function optionsFor(t: Table, item: CraftItem, decoys: (answer: CraftItem, pool: CraftItem[], count: number) => CraftItem[]): string[] {
  const need = CRAFT.options - 1;
  const group = t.items.filter((o) => o.id !== item.id && o.kind === 'unique' && o.group === item.group);
  const pool =
    group.length >= need ? group : [...group, ...t.items.filter((o) => o.id !== item.id && o.kind === 'unique' && o.category === item.category && o.group !== item.group)];
  const others = decoys(item, pool, need).slice(0, need);
  for (const o of pool) if (others.length < need && !others.includes(o)) others.push(o);
  const ids = [item.id, ...others.map((o) => o.id)];
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(t.rng() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
}

/** Whether the piece's guess is right. */
export const rightGuess = (p: Piece) => typeof p.guess === 'number' && p.options[p.guess] === p.item;

/**
 * Settles every piece's guess: a right one is paid by the bank, a wrong one
 * (or none) by the guesser to the maker, as much as they have.
 */
export function settle(c: Craft, gold: (id: string) => number, give: (id: string, n: number) => void) {
  for (const p of c.pieces) {
    if (p.paid !== undefined) continue;
    if (p.guess === undefined) p.guess = null;
    if (rightGuess(p)) {
      p.paid = CRAFT.rightPay;
      give(p.guesser, CRAFT.rightPay);
    } else {
      p.paid = Math.min(CRAFT.wrongCost, Math.max(0, gold(p.guesser)));
      give(p.guesser, -p.paid);
      give(p.maker, p.paid);
    }
  }
}

/** Whether the game is over once round `round` has been played: the last round, or someone at the cap. */
export const craftOver = (round: number, golds: readonly number[]) => round >= CRAFT.rounds || golds.some((g) => g >= CRAFT.goldCap);

/**
 * The patches a picture's veils hide (by index): for each veil, the patches
 * nearest where it was put (by their middles), as many as make up one in
 * CRAFT.veilLayers of the picture. `patches`: each one's middle (in the
 * picture's pixels) and size; `w`, `h`: the picture's.
 */
export function veiledPatches(patches: readonly { x: number; y: number; area: number }[], veils: readonly (readonly [number, number])[], w: number, h: number): Set<number> {
  const hidden = new Set<number>();
  const total = patches.reduce((sum, p) => sum + p.area, 0);
  for (const [vx, vy] of veils) {
    const [x, y] = [vx * w, vy * h];
    const near = patches.map((p, i) => [i, (p.x - x) ** 2 + (p.y - y) ** 2] as const).sort((a, b) => a[1] - b[1]);
    let covered = 0;
    for (const [i] of near) {
      if (covered >= total / CRAFT.veilLayers) break;
      hidden.add(i);
      covered += patches[i].area;
    }
  }
  return hidden;
}

/** Which piece (by its maker) and which of its looks a picture is, in a round. */
export const lookKey = (round: number, maker: string, look: number) => `${round}.${maker}.${look}`;

/** A look the host is to send: its key, who may see it, and how to draw it. */
export interface WantedLook {
  key: string;
  to: string[];
  /** The art to draw (an item id: the piece's own, or the one swapped in). */
  art: string;
  hide: { size: number; seed: number; veils: [number, number][] };
}

/** The looks the game wants out now: each piece's to its maker while it is in play, and to its guesser while they name it. */
export function wantedLooks(s: { phase: string; craft?: Craft | null }): WantedLook[] {
  const c = s.craft;
  if (s.phase !== 'craft' || !c || (c.step !== 'craft' && c.step !== 'guess')) return [];
  return c.pieces.map((p) => ({
    key: lookKey(c.round, p.maker, p.look),
    to: c.step === 'guess' ? [p.maker, p.guesser] : [p.maker],
    art: p.picture ?? p.item,
    hide: { size: CRAFT.veilSize, seed: p.seed, veils: p.veils },
  }));
}
