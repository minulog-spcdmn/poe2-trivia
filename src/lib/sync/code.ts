// The sync code: what pairs a player's devices (lib/sync/link.ts). A device
// makes it, and the others take it from its QR code (a link to the site,
// the code after `#sync=`, which the browser never sends to the server) or
// typed in. Sixteen characters of Crockford's base32 (no I, L, O or U, so
// none is taken for another): 80 random bits, read back from what a person
// types in whatever case, with spaces or dashes, and O, I or L for 0 and 1.
//
// Two things come of it, both one-way: the name its devices meet under on
// the matchmaking server (peerName), and the key each proves to the other
// that it has the code with (codeKey). Neither gives the code away.

import { base64url, fromBase64url } from '../base64url.ts';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const CODE_LENGTH = 16;

/** A new code, from the browser's secure random numbers. */
export function newCode(): string {
  // 256 is a multiple of 32: each byte's low five bits are as random as the byte.
  return Array.from(crypto.getRandomValues(new Uint8Array(CODE_LENGTH)), (b) => ALPHABET[b & 31]).join('');
}

/** A code as typed or linked, as its sixteen characters; null when it can't be one. */
export function readCode(input: string): string | null {
  const s = input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  return s.length === CODE_LENGTH && [...s].every((c) => ALPHABET.includes(c)) ? s : null;
}

/** A code in four groups of four, to read and type. */
export const shownCode = (code: string) => code.match(/.{1,4}/g)!.join('-');

/** The link a QR code holds: the site where it was made, the code after its hash. */
export const codeLink = (code: string, site: string) => `${site.replace(/[#?].*$/, '')}#sync=${shownCode(code)}`;

/** The code in an address's hash (`#sync=…`), or null for none. */
export function codeInHash(hash: string): string | null {
  const m = /^#sync=([0-9A-Za-z-]{16,24})$/.exec(hash);
  return m ? readCode(m[1]) : null;
}

async function digest(use: string, code: string): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`poe2.quest sync ${use} ${code}`)));
}

/** The name the code's devices meet under (lowercase base32, 104 bits of a hash of it). */
export async function peerName(code: string): Promise<string> {
  const bytes = await digest('meeting', code);
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes.slice(0, 13)) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out.toLowerCase();
}

/** The key the code's devices prove they have it with (HMAC-SHA-256, from another hash of it). */
export async function codeKey(code: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', await digest('proof', code), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

/** The proof of `text` under `key`. */
export async function prove(key: CryptoKey, text: string): Promise<string> {
  return base64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text))));
}

/** Whether `proof` is `text`'s under `key`. */
export async function proves(key: CryptoKey, text: string, proof: unknown): Promise<boolean> {
  const bytes = typeof proof === 'string' ? fromBase64url(proof) : null;
  return !!bytes && crypto.subtle.verify('HMAC', key, bytes, new TextEncoder().encode(text));
}
