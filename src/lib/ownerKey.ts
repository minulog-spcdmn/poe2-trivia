// The owner key: what lets zoe_arcana, and nobody else, play under the held
// name (names.ts isHeldName) with its creator's foil, everywhere it shows.
//
// The key is a few random words. Opening the site once with ?owner=<words>
// turns them (PBKDF2, slow on purpose) into an Ed25519 signing key, and the
// device keeps it if its public half is OWNER_PUBLIC_KEY, the only part in
// the source. In an online room the owner's device signs the room's code
// with a fresh nonce (ownerProof); the host lets the held name in only with
// a signature that checks out, and passes it on in the game (GameState
// owner), where every device checks it again (checkOwner), so neither a
// guest nor a host can put the name and its foil on anyone else. A room's
// listing carries a signature of its own (roomProof). Hot-seat, nobody else
// looks: there it is this device's own word (ownerUnlocked).
//
// scripts/owner-key.mjs prints the public key for new words. Pick them
// at random (four or more) and never commit them.

import { readKey, writeKey } from './storage.ts';

/** The owner key's public half (raw Ed25519, base64url): scripts/owner-key.mjs prints it for the words. */
export const OWNER_PUBLIC_KEY = '';

const SALT = 'poe2trivia.owner-key';
const ITERATIONS = 600_000;
// A whole key, not a name under STORE: a device unlocked for the live game is unlocked for the beta too.
const STORED = 'poe2trivia.owner';

/** A signature's length in base64url (64 bytes). */
const SIG = /^[A-Za-z0-9_-]{86}$/;
/** A nonce, as random as a tab's id (protocol.ts). */
const NONCE = /^[A-Za-z0-9_-]{8,64}$/;
/** PKCS #8 wrapping of a raw Ed25519 private key (RFC 8410). */
const PKCS8_PREFIX = [0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20];

/** The owner's signature on a room (its code) or on a player in it: a fresh nonce, and the signature of both. */
export interface OwnerProof {
  n: string;
  sig: string;
}

export const isOwnerProof = (v: unknown): v is OwnerProof =>
  typeof v === 'object' && v !== null && NONCE.test((v as OwnerProof).n) && SIG.test((v as OwnerProof).sig);

const toBase64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

function fromBase64url(s: string): Uint8Array<ArrayBuffer> | null {
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** What the owner signs: playing in room `code` (`what` 'player'), or hosting it ('room'), with a nonce. */
const signed = (what: 'player' | 'room', code: string, n: string) => new TextEncoder().encode(`poe2.quest ${what} ${code} ${n}`);

/** The signing key's 32-byte seed from the words. Case, spaces and dashes don't count ("Ember Tower" is "ember-tower"). */
async function seedOf(words: string): Promise<Uint8Array<ArrayBuffer>> {
  const enc = new TextEncoder();
  const plain = words.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const base = await crypto.subtle.importKey('raw', enc.encode(plain), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(SALT), iterations: ITERATIONS }, base, 256);
  return new Uint8Array(bits);
}

const signingKey = (seed: Uint8Array) =>
  crypto.subtle.importKey('pkcs8', new Uint8Array([...PKCS8_PREFIX, ...seed]), { name: 'Ed25519' }, true, ['sign']);

/** The public key (raw, base64url) the words make. Throws where Web Crypto or Ed25519 is missing. */
export async function ownerPublicKey(words: string): Promise<string> {
  const jwk = await crypto.subtle.exportKey('jwk', await signingKey(await seedOf(words)));
  return jwk.x!;
}

/** The seed this device keeps, when it is the owner's (and the public half it makes, checked when it was kept). */
function storedSeed(key = OWNER_PUBLIC_KEY): Uint8Array | null {
  const [pub, seed] = (readKey(STORED) ?? '').split('.');
  if (!key || pub !== key || !seed) return null;
  const bytes = fromBase64url(seed);
  return bytes?.length === 32 ? bytes : null;
}

/** Whether this device holds the owner key. */
export const ownerUnlocked = (key = OWNER_PUBLIC_KEY) => storedSeed(key) !== null;

/** Keeps the owner key on this device when the words make it. */
export async function unlockOwner(words: string, key = OWNER_PUBLIC_KEY): Promise<boolean> {
  if (!key) return false;
  try {
    const seed = await seedOf(words);
    const jwk = await crypto.subtle.exportKey('jwk', await signingKey(seed));
    if (jwk.x !== key) return false;
    return writeKey(STORED, `${key}.${toBase64url(seed)}`);
  } catch {
    return false;
  }
}

async function sign(what: 'player' | 'room', code: string, key: string): Promise<OwnerProof | null> {
  const seed = storedSeed(key);
  if (!seed) return null;
  try {
    const n = toBase64url(crypto.getRandomValues(new Uint8Array(16)));
    const sig = await crypto.subtle.sign({ name: 'Ed25519' }, await signingKey(seed), signed(what, code, n));
    return { n, sig: toBase64url(new Uint8Array(sig)) };
  } catch {
    return null;
  }
}

/** This device's signature for playing in room `code` under the held name; null unless it holds the owner key. */
export const ownerProof = (code: string, key = OWNER_PUBLIC_KEY) => sign('player', code, key);

/** This device's signature for hosting room `code` (its listing, rooms.ts); null unless it holds the owner key. */
export const roomProof = (code: string, key = OWNER_PUBLIC_KEY) => sign('room', code, key);

async function check(what: 'player' | 'room', code: string, proof: unknown, key: string): Promise<boolean> {
  if (!key || !isOwnerProof(proof)) return false;
  const pub = fromBase64url(key);
  const sig = fromBase64url(proof.sig);
  if (!pub || !sig) return false;
  try {
    const verifier = await crypto.subtle.importKey('raw', pub, { name: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify({ name: 'Ed25519' }, verifier, sig, signed(what, code, proof.n));
  } catch {
    return false;
  }
}

/** Whether `proof` is the owner's signature for playing in room `code`. */
export const checkOwner = (code: string, proof: unknown, key = OWNER_PUBLIC_KEY) => check('player', code, proof, key);

/** Whether `proof` is the owner's signature for hosting room `code`. */
export const checkRoom = (code: string, proof: unknown, key = OWNER_PUBLIC_KEY) => check('room', code, proof, key);
