// Player name hygiene: strip invisible / direction-flipping characters and
// "zalgo" stacks, and catch names that impersonate the host or another player.

import { readKey, writeKey } from './storage.ts';

export const MAX_NAME = 20;
export const MIN_NAME = 2;

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

/** What a name "looks like": lowercase ASCII-ish letters only. */
export function nameSkeleton(name: string): string {
  const folded = Array.from(name.normalize('NFKD').toLowerCase())
    .map((c) => CONFUSABLES[c] ?? c)
    .join('')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z]/g, '')
    .replace(/(.)\1+/g, '$1') // "Hoost" ~ "Host"
    .replace(/rn/g, 'm')
    .replace(/vv/g, 'w')
    .replace(/i/g, 'l');
  return folded || name.toLowerCase();
}

// A name held back for one person. Opening the site once with ?owner=<key>
// unlocks it on that device (remembered in localStorage). The key is a few
// random words; only its PBKDF2-SHA256 hash is in the source, and
// scripts/held-key-hash.mjs makes the hash for a new key. Case, spaces and
// dashes don't count, so "Ember Tower" and "ember-tower" are the same key.
// A deterrent against impersonation, not security: the check only runs in
// the fields where names are typed (the start page and hot-seat lobby).
const HELD_NAME = 'zoearcana';
const HELD_KEY_HASH = '5ddd2ad1ad21e94175a14999359a9e8b2b508a70c769f49f71a6d94e5821a607';
const HELD_SALT = 'poe2trivia.held-name';
const HELD_ITERATIONS = 600_000;
// A whole key, not a name under STORE: a device unlocked for the live game is unlocked for the beta too.
const OWNER_KEY = 'poe2trivia.owner';

/** Hex PBKDF2 hash of a key. Throws where Web Crypto is missing (plain http). */
export async function heldKeyHash(key: string): Promise<string> {
  const enc = new TextEncoder();
  const plain = key.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const base = await crypto.subtle.importKey('raw', enc.encode(plain), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(HELD_SALT), iterations: HELD_ITERATIONS },
    base,
    256,
  );
  return Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Remembers this device as the owner's when the key is right. */
export async function unlockHeldName(key: string, hash = HELD_KEY_HASH): Promise<boolean> {
  try {
    if ((await heldKeyHash(key)) !== hash) return false;
  } catch {
    return false;
  }
  return writeKey(OWNER_KEY, hash);
}

/** Whether a name is the held one, in any spelling the name check treats as the same ("Zoe Arcana"). */
export function isHeldName(name: string): boolean {
  return nameSkeleton(cleanName(name)) === HELD_NAME;
}

/** True when the name is held and this device is not unlocked. */
export function nameHeld(name: string, hash = HELD_KEY_HASH): boolean {
  if (!isHeldName(name)) return false;
  return readKey(OWNER_KEY) !== hash;
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
  const skel = nameSkeleton(name);
  if (RESERVED.has(skel) || RESERVED.has(name.toLowerCase().replace(/[^a-z]/g, '')))
    return `"${name}" is reserved. Pick another name.`;
  const clash = others.find((o) => nameSkeleton(o) === skel);
  if (clash) return `"${name}" looks too much like "${clash}". Pick another name.`;
  return null;
}
