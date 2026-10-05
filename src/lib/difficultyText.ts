// How difficulties are put into words. Presets and custom difficulties are
// described by the same sentences, and the custom editor uses the same terms,
// so a knob reads the same wherever it shows up.

import {
  BLAST_OPTIONS,
  BLAST_TIMER,
  DELVE_MIN_TIMER,
  FIND_DEEPER,
  FLARE_MS,
  SHARDS_PER_WARD,
  delveChangeAt,
  delveLockout,
  delveTimer,
  findDepth,
  findReward,
  findTimer,
  veinWindow,
  type FindKind,
  type Inventory,
  type ItemKind,
} from './delve.ts';
import { knobsOf, maxFakes, type Difficulty, type Knobs, type Settings, type VeilSpeed } from './game.ts';

/** Display names, in the order the lobby offers them. */
export const DIFFICULTY_NAMES: Record<Difficulty, string> = {
  cruel: 'Cruel',
  merciless: 'Merciless',
  eternal: 'Eternal',
  custom: 'Custom',
};

const NUMBER = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const cap = (t: string) => t[0].toUpperCase() + t.slice(1);

type Often = 'Never' | 'Some' | 'Half' | 'Always';
/** How often something happens, for knobs that are a chance or a share. */
function often(v: number): Often {
  return v === 0 ? 'Never' : v === 1 ? 'Always' : v === 0.5 ? 'Half' : 'Some';
}

const VEIL_WORD: Record<VeilSpeed, string> = { off: 'Off', fast: 'Fast', slow: 'Slow', slowest: 'Slowest' };
const VEIL_PACE: Record<Exclude<VeilSpeed, 'off'>, string> = { fast: 'bit by bit', slow: 'slowly', slowest: 'very slowly' };
const ART_SHARE: Record<Exclude<Often, 'Never'>, string> = {
  Some: 'Some questions ask',
  Half: 'Half the questions ask',
  Always: 'Every question asks',
};
const MIRROR_SHARE: Record<Exclude<Often, 'Never'>, string> = { Some: 'Some art is', Half: 'Half the art is', Always: 'All art is' };

/** The difficulty a room plays, in a few sentences. */
export function describe(settings: Pick<Settings, 'difficulty'> & Partial<Settings>): string {
  const k = knobsOf(settings);
  const custom = settings.difficulty === 'custom';
  const lines: string[] = [];

  const count = cap(NUMBER[k.options]);
  if (k.similarNames === 0) {
    // Small groups (five crossbows) can't fill a big question on their own,
    // and once a group runs low the engine mixes groups at any size.
    lines.push(`${count} options of the same kind where the category allows (all rings, all bows…)${k.fakes ? `, ${NUMBER[k.fakes]} of them made up` : ''}.`);
  } else {
    const alike = k.similarNames === 1 ? 'all' : 'half of them';
    lines.push(`${count} options, ${alike} with look-alike names${k.fakes ? ` and ${NUMBER[k.fakes]} made up` : ''}.`);
  }

  const art = often(k.artChance);
  if (art !== 'Never') lines.push(`${ART_SHARE[art]} you to find the art for a name.`);

  // Only the art of name questions burns into view. A preset only does it in
  // race, so in take turns its description still says what race adds.
  const raceOnly = !custom && settings.mode !== 'race';
  const veil = raceOnly ? knobsOf({ ...settings, mode: 'race' }).veil : k.veil;
  if (veil !== 'off' && art !== 'Always') lines.push(`${raceOnly ? 'In race, the' : 'The'} art burns into view ${VEIL_PACE[veil]}.`);

  if (k.grayscale === 'all') lines.push('All art is shown without colour.');
  else if (k.grayscale === 'art' && art !== 'Never') lines.push('"Find the art" pictures are shown without colour.');

  const mirror = often(k.mirror);
  if (mirror !== 'Never') lines.push(`${MIRROR_SHARE[mirror]} mirrored.`);
  return lines.join(' ');
}

/** What changes for deathmatch questions. */
export function deathmatchText(difficulty: Difficulty): string {
  switch (difficulty) {
    case 'cruel':
      return 'Questions are played on Merciless.';
    case 'merciless':
      return 'Questions are played on Eternal.';
    case 'eternal':
      return 'Questions go one step past Eternal.';
    default:
      return 'Each setting that makes questions harder goes one step up.';
  }
}

/** "your next 3 turns": how long a picked category stays locked. */
export const lockoutText = (turns: number) => `your next ${turns} turns`;

export interface KnobText<K extends keyof Knobs = keyof Knobs> {
  key: K;
  name: string;
  /** Kept to one line in the editor, like `off`, so swapping them never moves the rows. */
  hint: string;
  label: (v: Knobs[K]) => string;
  /** Why a step has no effect (or can't be picked) with these settings, if so. */
  off?: (step: Knobs[K], k: Knobs) => string | undefined;
}

/**
 * The custom editor's rows, in order. Labels follow one scheme: a share of
 * the options is None…All, a chance is Never…Always, a count is a number
 * (None for 0), and something that can be switched off starts with Off.
 */
export const KNOB_TEXT: { [K in keyof Knobs]: KnobText<K> }[keyof Knobs][] = [
  { key: 'options', name: 'Options', hint: 'Answers to choose from', label: String },
  {
    key: 'similarNames',
    name: 'Look-alike names',
    hint: 'Wrong answers named like the right one',
    label: (v) => (v === 0 ? 'None' : v === 1 ? 'All' : 'Half'),
  },
  {
    key: 'fakes',
    name: 'Made-up names',
    hint: "Wrong answers that aren't real items",
    label: (v) => (v ? String(v) : 'None'),
    // Each copies a real name that stays on screen.
    off: (v, k) => (v > maxFakes(k.options) ? `Needs ${v * 2} or more options` : undefined),
  },
  { key: 'artChance', name: 'Find the art', hint: 'Pick the art for a given name', label: often },
  {
    key: 'veil',
    name: 'Unveil',
    hint: 'The art burns into view bit by bit',
    label: (v) => VEIL_WORD[v],
    // Only the art of name questions burns into view.
    off: (_, k) => (k.artChance === 1 ? 'No name questions to cover' : undefined),
  },
  {
    key: 'grayscale',
    name: 'Grayscale',
    hint: 'Art shown without colour',
    label: (v) => (v === 'off' ? 'Off' : v === 'art' ? 'Find the art' : 'All art'),
    off: (v, k) => (v === 'art' && k.artChance === 0 ? 'No "find the art" questions' : undefined),
  },
  { key: 'mirror', name: 'Mirrored art', hint: 'Art flipped left to right', label: often },
  { key: 'lockout', name: 'Category lockout', hint: 'Turns until a picked category returns', label: (v) => (v ? String(v) : 'None') },
];

/** What each step of the Delve curve brings, by the depth where it starts (delve.ts DELVE_STEPS). */
export const DELVE_STEP_TEXT: Record<number, string> = {
  3: 'Six options, look-alike names',
  5: 'A made-up name',
  7: 'Eight options',
  10: 'All look-alikes, two made up',
  13: 'Mirrored pictures',
  17: 'Three made-up names',
  21: 'More mirrored pictures',
  25: 'The art burns into view',
  30: 'Find the art in grayscale',
  35: 'Always mirrored',
  40: 'All art in grayscale',
  50: 'The art burns in slower',
  75: 'The art burns in slowest',
};

/** What gets harder at a Delve depth, in a few words, or null when nothing does. */
export function delveChange(depth: number): string | null {
  const change = delveChangeAt(depth);
  if (change === 'knobs') return DELVE_STEP_TEXT[depth] ?? null;
  if (change === 'lockout') return `Locked for ${delveLockout(depth)} turns`;
  if (change === 'timer') return delveTimer(depth) === DELVE_MIN_TIMER ? 'Seven seconds' : 'Less time';
  return null;
}

/** The milestones of a descent, for the lobby and the start page. */
export const DELVE_LADDER: { depth: number; text: string }[] = [
  { depth: 1, text: 'Four options, 16 seconds' },
  { depth: 3, text: 'Look-alike names, then made-up ones' },
  { depth: 25, text: 'The art burns into view' },
  { depth: 40, text: 'All art in grayscale' },
  { depth: 55, text: 'Seven seconds' },
];

/** Small numbers in words, for the notes under the cards. */
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen'];
const words = (n: number) => WORDS[n] ?? String(n);

/** An item as a reward, with its article. */
export const ITEM_TEXT: Record<ItemKind, string> = {
  wards: 'an Azurite Ward',
  shards: 'an azurite shard',
  flares: 'a flare',
  dynamite: 'dynamite',
};

/**
 * The finds: the card's name, the tagline on its card, and what it is in a
 * line for those watching.
 */
export const FIND_TEXT: Record<FindKind, { name: string; tag: string; others: string }> = {
  azurite: {
    name: 'Azurite Vein',
    tag: 'A ward if fast, a shard if slow',
    others: `An Azurite Vein: a question from ${words(FIND_DEEPER)} depths deeper, for an Azurite Ward or a shard of one.`,
  },
  flare: {
    name: 'Flare Cache',
    tag: 'Answer right for a flare',
    others: `A Flare Cache: a question from ${words(FIND_DEEPER)} depths deeper, for a flare.`,
  },
  dynamite: {
    name: 'Dynamite Cache',
    tag: 'Answer right for dynamite',
    others: `A Dynamite Cache: a question from ${words(FIND_DEEPER)} depths deeper, for dynamite.`,
  },
};

/**
 * A find's risk and reward, for the player choosing at depth `depth` while
 * holding `inv` (`blasted`: they blasted it open, so it asks a safe question).
 */
export function findNote(kind: FindKind, depth: number, inv: Inventory, blasted = false): string {
  const secs = blasted ? BLAST_TIMER : findTimer(depth);
  const ask = blasted ? `Blasted open: a safe question, on ${secs} seconds.` : `A question from depth ${findDepth(depth)}, on ${secs} seconds.`;
  const fast = findReward(kind, inv, true);
  if (!fast) return `${ask} You can carry no more.`;
  /** The reward, saying why when it stands in for the find's own. */
  const earns = (item: ItemKind, own: ItemKind) => (item === own ? ITEM_TEXT[item] : `${ITEM_TEXT[item]}, as you carry all the ${own === 'shards' ? 'wards' : own} you can`);
  if (kind === 'azurite') {
    const slow = findReward(kind, inv, false)!;
    if (fast === 'wards' && slow === 'shards') {
      const forge = inv.shards + 1 >= SHARDS_PER_WARD ? 'it forges a ward with yours' : `${words(SHARDS_PER_WARD)} forge a ward`;
      return `${ask} Right within ${veinWindow(secs) / 1000} seconds mines ${ITEM_TEXT.wards}, which takes your next loss; slower, ${ITEM_TEXT.shards} (${forge}).`;
    }
    return `${ask} Right earns ${earns(fast, 'wards')}.`;
  }
  const own: ItemKind = kind === 'flare' ? 'flares' : 'dynamite';
  const what = fast !== own ? '' : kind === 'flare' ? `, which burns by itself as your clock runs out, for ${FLARE_MS / 1000} seconds more` : ', which blasts open a safe card while you choose';
  return `${ask} Right earns ${earns(fast, own)}${what}.`;
}

/** The card blasted open with dynamite, and the choice of what to blast. */
export const BLAST_TEXT = {
  tag: 'Blasted open',
  button: 'Blast open a card',
  pick: 'Blast open which category?',
  find: (name: string) => `Blast the ${name} open`,
  others: 'Or another category',
  note: `Any category, locked or not, as a safe question: ${words(BLAST_OPTIONS)} options, no look-alikes or made-up names, ${BLAST_TIMER} seconds.`,
  /** After `note`, while a find is on offer. */
  withFind: 'Blast the find open and it asks the same safe question, for its reward.',
  /** Under the cards, once a card is blasted open. */
  opened: `A safe question: ${words(BLAST_OPTIONS)} options, no look-alikes or made-up names, ${BLAST_TIMER} seconds; nothing to find.`,
};
