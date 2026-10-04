// Player name hygiene: strip invisible / direction-flipping characters and
// "zalgo" stacks, and catch names that impersonate the host or another player.

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

// A name held back for one person. Typing it needs the passphrase after a "#"
// (zoe_arcana#<passphrase>); the passphrase is stripped before the name is used.
// A deterrent against casual impersonation, not security: it is only checked in
// the name field, and the hash is public.
const HELD_NAME = 'zoearcana';
const HELD_KEY_HASH = '26ec19a7';

function keyHash(s: string): string {
  let h = 0x811c9dc5;
  for (const c of s) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}

/** Checks the name field entry against the held name. Returns the name to use, or null if it is held. */
export function claimName(raw: string): string | null {
  const [name, ...rest] = raw.split('#');
  const key = rest.join('#').trim();
  if (nameSkeleton(cleanName(name)) !== HELD_NAME) return raw;
  return keyHash(key) === HELD_KEY_HASH ? name.trim() : null;
}

/** Returns why a name is not allowed, or null if it's fine. */
export function nameProblem(name: string, others: string[]): string | null {
  if (!name) return 'Please enter a name with at least one letter or number.';
  const skel = nameSkeleton(name);
  if (RESERVED.has(skel) || RESERVED.has(name.toLowerCase().replace(/[^a-z]/g, '')))
    return `"${name}" is reserved. Pick another name.`;
  const clash = others.find((o) => nameSkeleton(o) === skel);
  if (clash) return `"${name}" looks too much like "${clash}". Pick another name.`;
  return null;
}
