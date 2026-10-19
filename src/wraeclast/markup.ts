// A clue's text as the tooltip sets it (clues.json keeps itemStats.json's
// marks): values in their colour ({w|65}), as ItemDetails does, and the
// masked words of the item's name (▮▮▮) as a piece of their own.

import type { Tuning } from './rules.ts';

/** A value's colour, by its letter, as ItemDetails names them. */
const COLOURS: Record<string, string> = { w: 'white', a: 'aug', p: 'white', f: 'fire', c: 'cold', l: 'lightning', h: 'chaos' };
const MASK = '▮▮▮';

export type Run = { t: string; c: string; mask?: true };

/** A line's text in runs: plain, a value in its colour, or a mask. */
export function runs(text: string): Run[] {
  return text.split(/(\{\w\|[^}]*\})/).flatMap((part) => {
    if (!part) return [];
    const m = /^\{(\w)\|([^}]*)\}$/.exec(part);
    const [t, c] = m ? [m[2], COLOURS[m[1]] ?? ''] : [part, ''];
    return t.split(/(▮▮▮)/).flatMap((bit): Run[] => (!bit ? [] : bit === MASK ? [{ t: bit, c, mask: true }] : [{ t: bit, c }]));
  });
}

/**
 * Flavour text in its lines, as ItemDetails breaks it: a line that goes on
 * with a small letter goes on the line before it.
 */
export const verses = (text: string) =>
  text.split('\n').reduce<string[]>((out, l) => {
    if (out.length && /^[a-z▮]/.test(l)) out[out.length - 1] += ` ${l}`;
    else out.push(l);
    return out;
  }, []);

/** A number among words with its sign, as a change: +5, −25. */
export const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

/** A multiplier as cards and logs write it: ×1.25. */
export const times = (m: number) => `×${m}`;

/** The tuning's word for a section of the run. */
export const SECTION_NAMES: Record<keyof Tuning['missCost'], string> = { early: 'Steps 1 to 5', mid: 'Steps 6 to 10', late: 'Steps 11 to 15', boss: 'Boss' };
