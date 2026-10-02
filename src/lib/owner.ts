// Lets the site's creator, and only them, use their name (see `looksLikeOwner`
// in names.ts). There is no server to log in to, so it's a signature: the
// creator's browsers hold the secret half of an ECDSA key, everyone has the
// public half below, and whoever checks a name asks for a signature over
// something tied to this room and this moment, so a copied one is useless:
//   • joining: the host checks the guest's signature over the room code and
//     the guest's token for that room (a different one per room);
//   • hosting: each guest checks the host's signature over the room code and
//     the guest's own tab id, and leaves a room whose host can't give one;
//   • the room list: each browser looking checks the listing's signature over
//     the room code and a nonce it picked, and hides the room otherwise.
// A new key: node scripts/owner-key.mjs

/** The public half of the creator's key (P-256 coordinates, base64url). */
const OWNER_PUBLIC_KEY = { x: 'idKRiqon1E5aWA_uolv4BQYhFI9o7lyE7iirGkU8f68', y: 'mPHMs_sbTo_nCeGjEEJXvbvQjrUtmQ4sDx0w7tgD3ck' };

/** Where a browser keeps the secret half, once checked. */
const STORAGE_KEY = 'poe2trivia.ownerKey';
/** Opening the site with this in the address saves the key: `#owner=<secret>` (or `#owner=forget`). */
const URL_PARAM = 'owner';

const ALGORITHM = { name: 'ECDSA', namedCurve: 'P-256' };
const SIGNING = { name: 'ECDSA', hash: 'SHA-256' };
/** A P-256 signature: 64 bytes, base64url. */
const PROOF = /^[A-Za-z0-9_-]{86}$/;
/** The secret: 32 bytes, base64url. */
const SECRET = /^[A-Za-z0-9_-]{43}$/;
/** What a guest or a browser looking for rooms picks for the other side to sign. */
const NONCE = /^[A-Za-z0-9_-]{8,64}$/;

export const isProof = (v: unknown): v is string => typeof v === 'string' && PROOF.test(v);
export const isNonce = (v: unknown): v is string => typeof v === 'string' && NONCE.test(v);

/** What the creator signs to join room `code`, with their token for it. */
export const joinClaim = (code: string, token: string) => `poe2.quest join ${code} ${token}`;
/** What the creator signs, as host of room `code`, for the guest whose tab is `tab`. */
export const hostClaim = (code: string, tab: string) => `poe2.quest host ${code} ${tab}`;
/** What the creator's room listing signs for a browser that asked with `nonce`. */
export const listClaim = (code: string, nonce: string) => `poe2.quest list ${code} ${nonce}`;

const bytes = (s: string) => new TextEncoder().encode(s);

const toBase64url = (b: Uint8Array) =>
  btoa(String.fromCharCode(...b))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const fromBase64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

/** Null where WebCrypto is missing (plain http): nobody can prove anything there. */
const subtle = () => globalThis.crypto?.subtle ?? null;

let publicKey: Promise<CryptoKey> | null = null;

/** Whether `proof` is the creator's signature of `claim`. */
export async function verifyOwner(claim: string, proof: unknown): Promise<boolean> {
  const s = subtle();
  if (!s || !isProof(proof)) return false;
  try {
    publicKey ??= s.importKey('jwk', { kty: 'EC', crv: 'P-256', ...OWNER_PUBLIC_KEY }, ALGORITHM, false, ['verify']);
    return await s.verify(SIGNING, await publicKey, fromBase64url(proof), bytes(claim));
  } catch {
    return false;
  }
}

/** The signing key for a secret, or null if it isn't the other half of the public key. */
export async function importOwnerKey(secret: string): Promise<CryptoKey | null> {
  const s = subtle();
  if (!s || !SECRET.test(secret)) return null;
  try {
    const jwk = { kty: 'EC', crv: 'P-256', ...OWNER_PUBLIC_KEY, d: secret };
    const key = await s.importKey('jwk', jwk, ALGORITHM, false, ['sign']);
    // Importing doesn't check that the secret fits the public half: a test signature does.
    const test = 'poe2.quest key check';
    const ok = await verifyOwner(test, toBase64url(new Uint8Array(await s.sign(SIGNING, key, bytes(test)))));
    return ok ? key : null;
  } catch {
    return null;
  }
}

function readKey(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Whether this browser holds the creator's key (it's checked before it's saved). */
export const hasOwnerKey = () => !!readKey();

let signingKey: { secret: string; key: Promise<CryptoKey | null> } | null = null;

/** The creator's signature of `claim`, or null when this browser doesn't hold the key. */
export async function signAsOwner(claim: string): Promise<string | null> {
  const s = subtle();
  const secret = readKey();
  if (!s || !secret) return null;
  if (signingKey?.secret !== secret) signingKey = { secret, key: importOwnerKey(secret) };
  const key = await signingKey.key;
  if (!key) return null;
  try {
    return toBase64url(new Uint8Array(await s.sign(SIGNING, key, bytes(claim))));
  } catch {
    return null;
  }
}

/**
 * Saves (or forgets) the key given in the address (`#owner=…`), and takes it
 * out of the address right away so it doesn't end up in a bookmark or a
 * screenshot. Says what happened, or null if the address had nothing for it.
 */
export async function takeOwnerKeyFromUrl(): Promise<'saved' | 'forgotten' | 'invalid' | null> {
  const params = new URLSearchParams(location.hash.slice(1));
  const secret = params.get(URL_PARAM);
  if (secret === null) return null;
  params.delete(URL_PARAM);
  const hash = params.toString();
  history.replaceState(history.state, '', `${location.pathname}${location.search}${hash ? `#${hash}` : ''}`);
  try {
    if (secret === 'forget') {
      localStorage.removeItem(STORAGE_KEY);
      return 'forgotten';
    }
    if (!(await importOwnerKey(secret))) return 'invalid';
    localStorage.setItem(STORAGE_KEY, secret);
    return 'saved';
  } catch {
    return 'invalid';
  }
}
