// How difficulties are put into words. Presets and custom difficulties are
// described by the same sentences, and the custom editor uses the same terms,
// so a knob reads the same wherever it shows up.

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

/** What changes at the first depth of a Delve stratum (none for the first). */
const DELVE_CHANGES: Record<number, string> = {
  2: 'Find the art',
  3: 'Six options',
  4: 'Look-alike and made-up names',
  5: 'Eight options',
  6: 'All look-alikes',
  7: 'Grayscale art, mirrored pictures',
  8: 'Three made-up names',
  9: 'All grayscale',
  10: 'Always mirrored',
  11: 'Longest lockout',
  12: 'Less time',
  13: 'Less time',
  14: 'Less time',
  15: 'Less time',
  16: 'Five seconds',
};

/** The change a new Delve stratum brings, or null; past the last one the rules stay as they are. */
export function delveChange(stratum: number): string | null {
  return DELVE_CHANGES[stratum] ?? null;
}

/** The milestones of a descent, for the lobby and the start page. */
export const DELVE_LADDER: { depth: number; text: string }[] = [
  { depth: 1, text: 'Four options, 20 seconds' },
  { depth: 13, text: 'Look-alike and made-up names' },
  { depth: 25, text: 'Grayscale, mirrored pictures' },
  { depth: 41, text: 'Longest lockout, 10 seconds' },
  { depth: 61, text: 'The abyss; 5 seconds' },
];
