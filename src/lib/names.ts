// Player name hygiene: strip invisible / direction-flipping characters and
// "zalgo" stacks, catch names that impersonate the host or another player,
// and turn down slurs and the like (offensive.ts).

import { lookalikeOf } from './lookalikes.ts';
import { offensive } from './offensive.ts';
import { OWNER_PUBLIC_KEY, ownerUnlocked, unlockOwner } from './ownerKey.ts';

export const MAX_NAME = 20;
/** The entry the name this browser plays under is stored under (lib/session.svelte.ts saveName; lib/sync/chosen.ts). */
export const NAME_STORED = 'name';
export const MIN_NAME = 2;

const RESERVED = new Set(['host', 'admin', 'administrator', 'system', 'server', 'moderator', 'mod', 'you', 'ggg']);

// Digits and signs that pass for letters, and common look-alike letters
// from other scripts, folded to ASCII; ahead of lookalikes.ts (the
// look-alikes Unicode lists), which folds the rest. Where both have a letter
// these win: Greek ν passes for a v here and η for an n, as they always did.
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
  // Control and format characters: zero-width joiners, bidi overrides, etc.;
  // characters that draw nothing yet count as letters (the Hangul fillers);
  // and a few that draw many letters wide.
  s = s.replace(/[\p{Cc}\p{Cf}\p{Co}\p{Cn}\p{Default_Ignorable_Code_Point}\u2028\u2029\u2800\u2E3A\u2E3B\uFDFD\u{12000}-\u{1254F}]/gu, '');
  // At most one combining mark per letter (no zalgo towers).
  s = s.replace(/(\p{M})\p{M}+/gu, '$1');
  s = s.replace(/\s+/g, ' ').trim();
  // Limit by characters, not UTF-16 units, so we never cut a surrogate pair.
  s = Array.from(s).slice(0, MAX_NAME).join('').trim();
  if (!/[\p{L}\p{N}]/u.test(s)) return '';
  return s;
}

/** A name's first letter, capitalised, for its avatar ('' for none). */
export const initialOf = (name: string) => (Array.from(name.trim())[0] ?? '').toUpperCase();

/**
 * What a name "looks like": its letters, lower case, each that passes for a
 * Latin one as that one. Letters of other scripts that don't stay as they
 * are, so names written in them are told apart by their own letters.
 */
export function nameSkeleton(name: string): string {
  const folded = Array.from(name.normalize('NFKD').toLowerCase())
    .map((c) => CONFUSABLES[c] ?? lookalikeOf(c) ?? c)
    .join('')
    .replace(/\p{M}/gu, '')
    // Modifier letters (ـ ʼ ˑ) are letters to Unicode but draw as signs: no part of a name's look.
    .replace(/[\P{L}\p{Lm}]/gu, '')
    .replace(/(.)\1+/gu, '$1') // "Hoost" ~ "Host"
    .replace(/rn/g, 'm')
    .replace(/vv/g, 'w')
    .replace(/i/g, 'l');
  return folded || name.toLowerCase();
}

// A name held back for one person: only a device holding the owner key
// (ownerKey.ts) can take it, in the fields where names are typed, and
// online only with that key's signature, which the host and every device
// in the room check.
const HELD_NAME = 'zoearcana';

/** Keeps the owner key on this device when the words (?owner=<words>) make it. */
export const unlockHeldName = (words: string, key = OWNER_PUBLIC_KEY) => unlockOwner(words, key);

/** Whether a name is the held one, in any spelling the name check treats as the same ("Zoe Arcana"). */
export function isHeldName(name: string): boolean {
  const skel = nameSkeleton(cleanName(name));
  // Read without other scripts' letters too: some draw as a stroke or a dot (一, ㅡ), and "zoe一arcana" passes for it.
  return skel === HELD_NAME || skel.replace(/[^a-z]/g, '').replace(/(.)\1+/g, '$1') === HELD_NAME;
}

/** True when the name is held and this device doesn't hold the owner key. */
export function nameHeld(name: string, key = OWNER_PUBLIC_KEY): boolean {
  return isHeldName(name) && !ownerUnlocked(key);
}

/** True when a name is too short to be a name (counted in characters, after cleanup). */
export function nameTooShort(name: string): boolean {
  return Array.from(cleanName(name)).length < MIN_NAME;
}

export const NAME_TOO_SHORT = `Names need at least ${MIN_NAME} characters.`;

/** Why a name was turned down: the reason to show, or null for the held name, which is refused without saying why. */
export type NameRefusal = { reason: string | null };

/** Why this device can't play under a name (other players' names aside), or null when it's fine. */
export function nameRefusal(name: string): NameRefusal | null {
  const clean = cleanName(name);
  if (nameHeld(clean)) return { reason: null };
  const reason = nameProblem(clean, []);
  return reason ? { reason } : null;
}

/** Whether this device can play under a name: long enough, not reserved, not held. */
export const nameUsable = (name: string) => nameRefusal(name) === null;

/** Returns why a name is not allowed, or null if it's fine. */
export function nameProblem(name: string, others: string[]): string | null {
  if (!name) return 'Please enter a name with at least one letter or number.';
  if (nameTooShort(name)) return NAME_TOO_SHORT;
  // Doesn't repeat the name back, which would show it to the host when it's turned down at the door.
  if (offensive(name)) return 'That name is not allowed. Pick another name.';
  const skel = nameSkeleton(name);
  if (RESERVED.has(skel) || RESERVED.has(name.toLowerCase().replace(/[^a-z]/g, '')))
    return `“${name}” is reserved. Pick another name.`;
  const clash = others.find((o) => nameSkeleton(o) === skel);
  if (clash) return `“${name}” looks too much like “${clash}”. Pick another name.`;
  return null;
}
