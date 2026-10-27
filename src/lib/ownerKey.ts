// The owner key: what lets zoe_arcana, and nobody else, play under the held
// name (names.ts isHeldName) with its creator's foil, everywhere it shows.
//
// The key is a few random words. Opening the site once with ?owner=<words>
// turns them (PBKDF2, slow on purpose) into an Ed25519 signing key, and the
// device keeps it if its public half is OWNER_PUBLIC_KEY, the only part in
// the source. Whoever needs to know sends a fresh challenge, and the
// owner's device signs that, so no signature is of use again: a host lets
// the held name in only with its own challenge signed (joinProof), and the
// room list shows a room under the held name only with the scan's
// challenge signed (roomProof). Guests take the host's word for who in its
// room is the owner: a host that lies can show anything in its own room
// anyway. Hot-seat, it is this device's own word (ownerUnlocked).
//
// Ed25519 comes from @noble/ed25519 (it needs no more of Web Crypto than
// SHA-512, which every browser the game runs in has, unlike Ed25519 itself),
// loaded once the start page has settled, after the game's screens
// (preloadEd25519, queued by App.svelte), or the first time something is
// signed or checked before that: the start page doesn't wait for it, and a
// tab left open across a deploy has it already.
//
// scripts/owner-key.mjs prints the public key for new words. Pick them
// at random (four or more) and never commit them.

import { base64url, fromBase64url } from './base64url.ts';
import { readKey, writeKey } from './storage.ts';
import { whenSettled } from './settled.ts';

/** The owner key's public half (raw Ed25519, base64url): scripts/owner-key.mjs prints it for the words. */
export const OWNER_PUBLIC_KEY = 'SIwtcxovVQ_Mfp8NkPmSzMKgYx1ejNtyuw-VLrgkS8M';

const ed25519 = () => import('@noble/ed25519');

/** Loads Ed25519 once the page has settled (lib/settled.ts), so a room's signature isn't left to a download that may no longer be there; returns what takes that back if it hasn't run. */
export function preloadEd25519(): () => void {
  return whenSettled(() => ed25519().catch(() => {}));
}

const SALT = 'poe2trivia.owner-key';
const ITERATIONS = 600_000;
// A whole key, not a name under STORE: a device unlocked for the live game is unlocked for the beta too.
const STORED = 'poe2trivia.owner';

/** A signature in base64url (64 bytes). */
const SIG = /^[A-Za-z0-9_-]{86}$/;
/** A challenge: random, base64url (newChallenge). */
const CHALLENGE = /^[A-Za-z0-9_-]{16,64}$/;

/** The owner key's signature (base64url). */
export type OwnerProof = string;

export const isOwnerProof = (v: unknown): v is OwnerProof => typeof v === 'string' && SIG.test(v);
export const isChallenge = (v: unknown): v is string => typeof v === 'string' && CHALLENGE.test(v);

/** A fresh challenge, for the owner key to sign over. */
export const newChallenge = () => base64url(crypto.getRandomValues(new Uint8Array(16)));

/**
 * What the owner signs: joining room `code`, or hosting it (its listing); always over someone's challenge.
 * `code` is the room's peer id (PEER_PREFIX and its code): the live game, the beta and a local one share the key but
 * not their rooms, so a signature drawn out in a beta room must be of no use in the live room of the same code.
 */
type What = 'join' | 'room';
const signed = (what: What, code: string, about: string) => new TextEncoder().encode(`poe2.quest ${what} ${code} ${about}`);

/** The signing key's 32-byte seed from the words. Case, spaces and dashes don't count ("Ember Tower" is "ember-tower"). */
async function seedOf(words: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const plain = words.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const base = await crypto.subtle.importKey('raw', enc.encode(plain), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(SALT), iterations: ITERATIONS }, base, 256);
  return new Uint8Array(bits);
}

/** The public key (raw, base64url) the words make. */
export async function ownerPublicKey(words: string): Promise<string> {
  return base64url(await (await ed25519()).getPublicKeyAsync(await seedOf(words)));
}

/** What the stored value was last read as, so the many names on screen don't each read it again. */
let read: { raw: string | null; seed: Uint8Array | null } | null = null;
if (typeof addEventListener === 'function') addEventListener('storage', (e) => e.key === STORED && (read = null));

/** The seed this device keeps, when it is the owner's (with the public half it makes, checked when it was kept). */
function storedSeed(key = OWNER_PUBLIC_KEY): Uint8Array | null {
  if (!key) return null;
  if (!read) {
    const raw = readKey(STORED);
    const [pub, seed] = (raw ?? '').split('.');
    const bytes = seed ? fromBase64url(seed) : null;
    read = { raw: pub ?? null, seed: bytes?.length === 32 ? bytes : null };
  }
  return read.raw === key ? read.seed : null;
}

/** Whether this device holds the owner key. */
export const ownerUnlocked = (key = OWNER_PUBLIC_KEY) => storedSeed(key) !== null;

/** Keeps the owner key on this device when the words make it. */
export async function unlockOwner(words: string, key = OWNER_PUBLIC_KEY): Promise<boolean> {
  if (!key) return false;
  try {
    const seed = await seedOf(words);
    if (base64url(await (await ed25519()).getPublicKeyAsync(seed)) !== key) return false;
    read = null;
    return writeKey(STORED, `${key}.${base64url(seed)}`);
  } catch {
    return false;
  }
}

/** The owner key as this device keeps it, to pass on to the player's own paired devices (lib/sync); null unless it holds it. */
export const ownerKeyKept = (key = OWNER_PUBLIC_KEY) => (ownerUnlocked(key) ? readKey(STORED) : null);

/** Keeps an owner key passed on by another of the player's devices, when it is the owner's (its seed makes the public half). */
export async function keepOwnerKey(raw: unknown, key = OWNER_PUBLIC_KEY): Promise<boolean> {
  if (!key || typeof raw !== 'string' || raw.length > 200) return false;
  const [pub, seed] = raw.split('.');
  const bytes = pub === key && seed ? fromBase64url(seed) : null;
  if (bytes?.length !== 32) return false;
  try {
    if (base64url(await (await ed25519()).getPublicKeyAsync(bytes)) !== key) return false;
  } catch {
    return false;
  }
  read = null;
  return writeKey(STORED, `${key}.${seed}`);
}

async function sign(what: What, code: string, about: string, key: string): Promise<OwnerProof | null> {
  const seed = storedSeed(key);
  if (!seed) return null;
  try {
    return base64url(await (await ed25519()).signAsync(signed(what, code, about), seed));
  } catch {
    return null;
  }
}

async function check(what: What, code: string, about: string, proof: unknown, key: string): Promise<boolean> {
  if (!key || !isOwnerProof(proof)) return false;
  const pub = fromBase64url(key);
  const sig = fromBase64url(proof);
  if (pub?.length !== 32 || sig?.length !== 64) return false;
  try {
    return await (await ed25519()).verifyAsync(sig, signed(what, code, about), pub);
  } catch {
    return false;
  }
}

/** This device's signature for joining room `code` under the held name, over the host's challenge; null unless it holds the owner key. */
export const joinProof = (code: string, challenge: string, key = OWNER_PUBLIC_KEY) => sign('join', code, challenge, key);
/** Whether `proof` is the owner's signature for joining room `code`, over this host's `challenge`. */
export const checkJoin = (code: string, challenge: string, proof: unknown, key = OWNER_PUBLIC_KEY) => check('join', code, challenge, proof, key);

/** This device's signature on its room's listing, over a prober's challenge; null unless it holds the owner key. */
export const roomProof = (code: string, challenge: string, key = OWNER_PUBLIC_KEY) => sign('room', code, challenge, key);
/** Whether `proof` is the owner's signature on room `code`'s listing, over this prober's `challenge`. */
export const checkRoom = (code: string, challenge: string, proof: unknown, key = OWNER_PUBLIC_KEY) => check('room', code, challenge, proof, key);
