// How difficulties are put into words. Presets and custom difficulties are
// described by the same sentences, and the custom editor uses the same terms,
// so a knob reads the same wherever it shows up.

import { knobsOf, type Knobs, type Settings } from './game.ts';

const NUMBER = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const cap = (t: string) => t[0].toUpperCase() + t.slice(1);

/** How often something happens, for knobs that are a chance or a share. */
function often(v: number): string {
  return v === 0 ? 'Never' : v === 1 ? 'Always' : v === 0.5 ? 'Half' : 'Some';
}

/** The difficulty a room plays, in a few sentences. */
export function describe(settings: Pick<Settings, 'difficulty'> & Partial<Settings>): string {
  const k = knobsOf(settings);
  const custom = settings.difficulty === 'custom';
  const lines: string[] = [];

  const made = k.fakes ? ` and ${NUMBER[k.fakes]} made up` : '';
  if (k.similarNames === 0) lines.push(`${cap(NUMBER[k.options])} options of the same kind (all rings, all bows…)${k.fakes ? `, ${NUMBER[k.fakes]} of them made up` : ''}.`);
  else lines.push(`${cap(NUMBER[k.options])} options, ${k.similarNames === 1 ? 'all' : 'half of them'} with look-alike names${made}.`);

  if (k.artChance > 0) {
    const share = k.artChance === 1 ? 'Every question asks' : k.artChance === 0.5 ? 'Half the questions ask' : 'Some questions ask';
    lines.push(`${share} you to find the art for a name.`);
  }

  // Tiles only cover the art of "name the art" questions. A preset only uses
  // them in race, so on turns its description still says what race adds.
  const raceOnly = !custom && settings.mode !== 'race';
  const veil = raceOnly ? knobsOf({ ...settings, mode: 'race' }).veil : k.veil;
  if (veil !== 'off' && k.artChance < 1) {
    const pace = veil === 'fast' ? 'one by one' : veil === 'slow' ? 'slowly' : 'very slowly';
    lines.push(`${raceOnly ? 'In race, tiles' : 'Tiles'} hide the art and lift ${pace}.`);
  }

  if (k.grayscale === 'all') lines.push('All art is shown without colour.');
  else if (k.grayscale === 'art' && k.artChance > 0) lines.push('"Find the art" pictures are shown without colour.');

  if (k.mirror > 0) lines.push(k.mirror === 1 ? 'All art is mirrored.' : k.mirror === 0.5 ? 'Half the art is mirrored.' : 'Some art is mirrored.');
  return lines.join(' ');
}

export interface KnobText<K extends keyof Knobs = keyof Knobs> {
  key: K;
  name: string;
  hint: string;
  label: (v: Knobs[K]) => string;
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
  { key: 'fakes', name: 'Made-up names', hint: "Wrong answers that aren't real items", label: (v) => (v ? String(v) : 'None') },
  { key: 'artChance', name: 'Find the art', hint: 'Questions that give a name and ask for its art', label: often },
  {
    key: 'veil',
    name: 'Tiles',
    hint: 'Art hidden under tiles that lift one by one, in both modes',
    label: (v) => (v === 'off' ? 'Off' : v === 'fast' ? 'Fast' : v === 'slow' ? 'Slow' : 'Slowest'),
  },
  {
    key: 'grayscale',
    name: 'Grayscale',
    hint: 'Art shown without colour',
    label: (v) => (v === 'off' ? 'Off' : v === 'art' ? 'Find the art' : 'All art'),
  },
  { key: 'mirror', name: 'Mirrored art', hint: 'Art flipped left to right', label: often },
  { key: 'lockout', name: 'Category lockout', hint: 'Turns before a picked category comes back', label: (v) => (v ? String(v) : 'None') },
];
