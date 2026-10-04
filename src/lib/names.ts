// Player name hygiene: strip invisible / direction-flipping characters and
// "zalgo" stacks, and catch names that impersonate the host, another player or
// the site's creator.

import { CREATOR } from './site.ts';

export const MAX_NAME = 20;

const RESERVED = new Set(['host', 'admin', 'administrator', 'system', 'server', 'moderator', 'mod', 'you', 'ggg']);

// Common look-alike letters from other scripts and digits, folded to ASCII.
const CONFUSABLES: Record<string, string> = {
  а: 'a', в: 'b', е: 'e', ё: 'e', к: 'k', м: 'm', н: 'h', о: 'o', р: 'p', с: 'c', т: 't', у: 'y', х: 'x',
  і: 'i', ї: 'i', ј: 'j', ѕ: 's', ԁ: 'd', ɡ: 'g', ո: 'n', ս: 'u',
  α: 'a', β: 'b', ε: 'e', η: 'n', ι: 'i', κ: 'k', ν: 'v', ο: 'o', ρ: 'p', τ: 't', υ: 'u', χ: 'x', ω: 'w',
  '0': 'o', '1': 'l', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '$': 's', '@': 'a', '|': 'l', '!': 'i',
};

/**
 * Cleans a display name. Returns '' when nothing usable is left.
 * NFKC folds full-width and styled letters (𝓗𝓸𝓼𝓽 → Host).
 */
export function cleanName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  let s = raw.slice(0, 200).normalize('NFKC');
  // Control and format characters: zero-width joiners, bidi overrides, etc.
  s = s.replace(/[\p{Cc}\p{Cf}\p{Co}\p{Cn}\u2028\u2029]/gu, '');
  // At most one combining mark per letter (no zalgo towers).
  s = s.replace(/(\p{M})\p{M}+/gu, '$1');
  s = s.replace(/\s+/g, ' ').trim();
  // Limit by characters, not UTF-16 units, so we never cut a surrogate pair.
  s = Array.from(s).slice(0, MAX_NAME).join('').trim();
  if (!/[\p{L}\p{N}]/u.test(s)) return '';
  return s;
}

/**
 * More look-alikes, only for telling the creator's name apart. Kept out of
 * CONFUSABLES so they don't change every other name's skeleton (which the
 * clash checks and the kicked names saved with a room rely on).
 */
const OWNER_CONFUSABLES: Record<string, string> = {
  ζ: 'z', є: 'e', ø: 'o', ɵ: 'o', ə: 'e', ɛ: 'e', ƶ: 'z', ȥ: 'z', ɀ: 'z', ʐ: 'z', ʑ: 'z', ᴢ: 'z', ᴏ: 'o', ᴇ: 'e', '2': 'z',
  // Armenian, Coptic, Cherokee, Lisu, Tifinagh and other letters drawn like z, o or e (lowercased).
  օ: 'o', ⲟ: 'o', ꮓ: 'z', ꭼ: 'e', ꮻ: 'o', ꓜ: 'z', ꓳ: 'o', ꓰ: 'e', ⵔ: 'o', ꝋ: 'o', ℮: 'e',
  ǝ: 'e', ԑ: 'e', ɘ: 'e', ʒ: 'z', ӡ: 'z', ⱬ: 'z', ө: 'o',
};

/** What a name "looks like": lowercase ASCII-ish letters only. `extra`: more look-alikes to fold. */
export function nameSkeleton(name: string, extra: Record<string, string> = {}): string {
  const folded = Array.from(name.normalize('NFKD').toLowerCase())
    .map((c) => CONFUSABLES[c] ?? extra[c] ?? c)
    .join('')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z]/g, '')
    .replace(/(.)\1+/g, '$1') // "Hoost" ~ "Host"
    .replace(/rn/g, 'm')
    .replace(/vv/g, 'w')
    .replace(/i/g, 'l');
  return folded || name.toLowerCase();
}

/**
 * What only the site's creator (`CREATOR` in site.ts) may be called: their
 * name, or just its first part, spelled any way that looks the same
 * (Zoe, z0ë, ZOE_4RCANA, Zoë Arcana). Names that merely contain it don't
 * count (Zoey, Ozoemena).
 */
const OWNER_SKELETONS = [CREATOR, CREATOR.split(/[^\p{L}\p{N}]+/u)[0]].map((n) => nameSkeleton(n, OWNER_CONFUSABLES));

/**
 * Whether some reading of `name` folds to `target`: letters as they look,
 * each digit or symbol either as the letter it looks like (z0e) or left out
 * (zoe_arcana2, Zoe!), in any mix (Z0e1), and doubled letters counted once,
 * as in `nameSkeleton`. No look-alike table is complete, so a letter none of
 * them knows may stand in for the next letter of the target (Zoǝ), up to one
 * in three; it never just drops out, so "Zoe 太郎" isn't the creator's name,
 * and neither is a short name written in another script altogether.
 */
function readsAs(name: string, target: string): boolean {
  const maxStandIns = Math.floor(target.length / 3);
  // Each way of reading the name so far: how much of the target it spells, and with how many stand-ins.
  let readings = new Map<string, [number, number]>([['0:0', [0, 0]]]);
  for (const c of name.normalize('NFKD').toLowerCase()) {
    if (/\p{M}/u.test(c)) continue;
    const folded = (CONFUSABLES[c] ?? OWNER_CONFUSABLES[c] ?? c).replace('i', 'l');
    const letter = /^[a-z]$/.test(folded) ? folded : null;
    const isLetter = /\p{L}/u.test(c);
    const next = new Map<string, [number, number]>();
    const add = (n: number, w: number) => next.set(`${n}:${w}`, [n, w]);
    for (const [n, w] of readings.values()) {
      if (isLetter && !letter) {
        // An unknown letter: a stand-in for the next one, if any are left.
        if (n < target.length && w < maxStandIns) add(n + 1, w + 1);
        continue;
      }
      // A digit or symbol may also be left out.
      if (!isLetter) add(n, w);
      if (!letter) continue;
      if (n > 0 && letter === target[n - 1]) add(n, w);
      else if (letter === target[n]) add(n + 1, w);
    }
    readings = next;
    if (!readings.size) return false;
  }
  return [...readings.values()].some(([n]) => n === target.length);
}

/** Whether a name could pass for the site's creator. */
export const looksLikeOwner = (name: string) => OWNER_SKELETONS.some((target) => readsAs(name, target));

/**
 * Returns why a name is not allowed, or null if it's fine. `owner`: the
 * creator proved it's them (lib/owner.ts), so their own name is allowed.
 */
export function nameProblem(name: string, others: string[], owner = false): string | null {
  if (!name) return 'Please enter a name with at least one letter or number.';
  const skel = nameSkeleton(name);
  if (RESERVED.has(skel) || RESERVED.has(name.toLowerCase().replace(/[^a-z]/g, '')))
    return `"${name}" is reserved. Pick another name.`;
  if (!owner && looksLikeOwner(name)) return `"${name}" is too close to the creator's name. Pick another name.`;
  const clash = others.find((o) => nameSkeleton(o) === skel);
  if (clash) return `"${name}" looks too much like "${clash}". Pick another name.`;
  return null;
}
