// Lets the site's creator, and only them, use their name (see `looksLikeOwner`
// in names.ts). There is no server to log in to, so it's a signature: the
// creator's browsers hold the secret half of an ECDSA key, everyone has the
// public half below, and whoever checks a name asks for a signature over the
// room code and a nonce the checker picked, so a copied one is useless:
//   • joining: the host sends every new connection a nonce, and checks the
//     guest's signature over it (with the room code and the guest's token);
//   • hosting: each guest checks the host's signature over the room code and
//     the guest's own tab id, and leaves a room whose host uses the name
//     without one;
//   • the room list: each browser looking checks the listing's signature over
//     the room code and a nonce it picked, and hides the room otherwise.
// A new key: node scripts/owner-key.mjs

import { base64url, fromBase64url } from './tokens.ts';

/** The public half of the creator's key (P-256 coordinates, base64url). */
const OWNER_PUBLIC_KEY = { x: 'idKRiqon1E5aWA_uolv4BQYhFI9o7lyE7iirGkU8f68', y: 'mPHMs_sbTo_nCeGjEEJXvbvQjrUtmQ4sDx0w7tgD3ck' };

/** Where a browser keeps the secret half. */
const STORAGE_KEY = 'poe2trivia.ownerKey';
/** Opening the site with this in the address saves the key: `#owner=<secret>` (or `#owner=forget`). */
const URL_PARAM = 'owner';

const ALGORITHM = { name: 'ECDSA', namedCurve: 'P-256' };
const SIGNING = { name: 'ECDSA', hash: 'SHA-256' };
/** A P-256 signature: 64 bytes, base64url. */
const PROOF = /^[A-Za-z0-9_-]{86}$/;
/** The secret: 32 bytes, base64url. */
const SECRET = /^[A-Za-z0-9_-]{43}$/;
/** What a host, a guest or a browser looking for rooms picks for the other side to sign. */
const NONCE = /^[A-Za-z0-9_-]{8,64}$/;

export const isProof = (v: unknown): v is string => typeof v === 'string' && PROOF.test(v);
export const isNonce = (v: unknown): v is string => typeof v === 'string' && NONCE.test(v);

/** What the creator signs to join room `code`, with their token for it, for the connection the host sent `nonce`. */
export const joinClaim = (code: string, token: string, nonce: string) => `poe2.quest join ${code} ${token} ${nonce}`;
/** What the creator signs, as host of room `code`, for the guest whose tab is `tab`. */
export const hostClaim = (code: string, tab: string) => `poe2.quest host ${code} ${tab}`;
/** What the creator's room listing signs for a browser that asked with `nonce`. */
export const listClaim = (code: string, nonce: string) => `poe2.quest list ${code} ${nonce}`;

const bytes = (s: string) => new TextEncoder().encode(s);

/** Null where WebCrypto is missing (plain http): nobody can prove anything there. */
const subtle = () => globalThis.crypto?.subtle ?? null;

/** Imported once; a failed import isn't kept, so the next check tries again. */
let publicKey: Promise<CryptoKey> | null = null;

/** Whether `proof` is the creator's signature of `claim`. */
export async function verifyOwner(claim: string, proof: unknown): Promise<boolean> {
  const s = subtle();
  if (!s || !isProof(proof)) return false;
  try {
    if (!publicKey) {
      const importing = s.importKey('jwk', { kty: 'EC', crv: 'P-256', ...OWNER_PUBLIC_KEY }, ALGORITHM, false, ['verify']);
      publicKey = importing;
      importing.catch(() => publicKey === importing && (publicKey = null));
    }
    return await s.verify(SIGNING, await publicKey, fromBase64url(proof), bytes(claim));
  } catch {
    return false;
  }
}

/**
 * The signing key for a secret. Null if it isn't the other half of the
 * public key; undefined if that couldn't be checked (no WebCrypto, or it
 * failed for some other reason), so nothing should be concluded from it.
 */
export async function importOwnerKey(secret: string): Promise<CryptoKey | null | undefined> {
  const s = subtle();
  if (!SECRET.test(secret)) return null;
  if (!s) return undefined;
  let key: CryptoKey;
  try {
    key = await s.importKey('jwk', { kty: 'EC', crv: 'P-256', ...OWNER_PUBLIC_KEY, d: secret }, ALGORITHM, false, ['sign']);
  } catch (err) {
    // Some browsers check that the secret fits the public half right here.
    return (err as Error)?.name === 'DataError' ? null : undefined;
  }
  // Others don't: a test signature does.
  try {
    const test = 'poe2.quest key check';
    const sig = base64url(new Uint8Array(await s.sign(SIGNING, key, bytes(test))));
    if (await verifyOwner(test, sig)) return key;
    // A failure to verify our own signature, rather than a wrong one, says nothing.
    return publicKey ? null : undefined;
  } catch {
    return undefined;
  }
}

function readKey(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** The stored secret's key, once it was found to fit (failed checks aren't kept, so they're tried again). */
let checked: { secret: string; key: CryptoKey } | null = null;

/**
 * Checks the key this browser holds. One that doesn't fit the public half
 * (an old key, after a new one was made) is forgotten: `removed`. `unchecked`:
 * couldn't tell this time (it's kept and tried again later).
 */
export async function checkOwnerKey(): Promise<'ok' | 'none' | 'removed' | 'unchecked'> {
  const secret = readKey();
  if (!secret) return 'none';
  if (checked?.secret === secret) return 'ok';
  const key = await importOwnerKey(secret);
  if (key) {
    if (readKey() === secret) checked = { secret, key };
    return 'ok';
  }
  if (key === undefined) return 'unchecked';
  try {
    if (localStorage.getItem(STORAGE_KEY) === secret) localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  return 'removed';
}

/** Whether this browser holds the creator's key, and it has been found to fit (see `checkOwnerKey`). */
export const hasOwnerKey = () => !!checked && checked.secret === readKey();

/** The creator's signature of `claim`, or null when this browser doesn't hold the key (or it doesn't fit). */
export async function signAsOwner(claim: string): Promise<string | null> {
  const s = subtle();
  if (!s || (await checkOwnerKey()) !== 'ok' || !checked) return null;
  try {
    return base64url(new Uint8Array(await s.sign(SIGNING, checked.key, bytes(claim))));
  } catch {
    return null;
  }
}

/**
 * Saves (or forgets) the key given in the address (`#owner=…`), and takes it
 * out of the address right away so it doesn't end up in a bookmark or a
 * screenshot. Says what happened, or null if the address had nothing for it.
 */
export async function takeOwnerKeyFromUrl(): Promise<'saved' | 'forgotten' | 'invalid' | 'unchecked' | null> {
  const params = new URLSearchParams(location.hash.slice(1));
  const secret = params.get(URL_PARAM);
  if (secret === null) return null;
  params.delete(URL_PARAM);
  const hash = params.toString();
  history.replaceState(history.state, '', `${location.pathname}${location.search}${hash ? `#${hash}` : ''}`);
  try {
    if (secret === 'forget') {
      localStorage.removeItem(STORAGE_KEY);
      checked = null;
      return 'forgotten';
    }
    const key = await importOwnerKey(secret);
    if (key === undefined) return 'unchecked';
    if (!key) return 'invalid';
    localStorage.setItem(STORAGE_KEY, secret);
    checked = { secret, key };
    return 'saved';
  } catch {
    return 'invalid';
  }
}
