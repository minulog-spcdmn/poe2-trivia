// Lets the site's creator, and only them, use their name (see `looksLikeOwner`
// in names.ts). There is no server to log in to, so it's a signature: the
// creator's browsers hold the secret half of an ECDSA key, everyone has the
// public half below, and whoever checks a name asks for a signature over the
// room code and a nonce the checker picked, so a copied one is useless:
//   • joining: the host sends every new connection a nonce, and checks the
//     guest's signature over it (with the room code and the guest's token);
//   • hosting: each guest sends a nonce with its hello, checks the host's
//     signature over it (with the room code), and leaves a room whose host
//     uses the name without one;
//   • the room list: each browser looking checks the listing's signature over
//     the room code and a nonce it picked, and hides the room otherwise.
// The creator's browser keeps the key as a non-extractable CryptoKey in
// IndexedDB: it can sign with it, but no script can read the secret back.
// The secret is pasted in once (open the site with #owner), never put in the
// address, where it would stay in the browser's history.
// A new key: node scripts/owner-key.mjs

import { base64url, fromBase64url } from './tokens.ts';

/** The public half of the creator's key (P-256 coordinates, base64url). */
const OWNER_PUBLIC_KEY = { x: 'idKRiqon1E5aWA_uolv4BQYhFI9o7lyE7iirGkU8f68', y: 'mPHMs_sbTo_nCeGjEEJXvbvQjrUtmQ4sDx0w7tgD3ck' };

/** Opening the site with `#owner` asks for the key; `#owner=forget` removes it. */
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
/** What the creator signs, as host of room `code`, for the guest connection that sent `nonce`. */
export const hostClaim = (code: string, nonce: string) => `poe2.quest host ${code} ${nonce}`;
/** What the creator's room listing signs for a browser that asked with `nonce`. */
export const listClaim = (code: string, nonce: string) => `poe2.quest list ${code} ${nonce}`;

const bytes = (s: string) => new TextEncoder().encode(s);

/** Null where WebCrypto is missing (plain http): nobody can prove anything there. */
const subtle = () => globalThis.crypto?.subtle ?? null;

/** Imported once; a failed import isn't kept, so the next check tries again. */
let publicKey: Promise<CryptoKey> | null = null;

function ownerPublicKey(s: SubtleCrypto): Promise<CryptoKey> {
  if (!publicKey) {
    const importing = s.importKey('jwk', { kty: 'EC', crv: 'P-256', ...OWNER_PUBLIC_KEY }, ALGORITHM, false, ['verify']);
    publicKey = importing;
    importing.catch(() => publicKey === importing && (publicKey = null));
  }
  return publicKey;
}

/** Whether `proof` is the creator's signature of `claim`. */
export async function verifyOwner(claim: string, proof: unknown): Promise<boolean> {
  const s = subtle();
  if (!s || !isProof(proof)) return false;
  try {
    return await s.verify(SIGNING, await ownerPublicKey(s), fromBase64url(proof), bytes(claim));
  } catch {
    return false;
  }
}

/**
 * Whether `key` is the creator's: a test signature that verifies against the
 * public key. Undefined when that couldn't be checked (an error along the
 * way), so nothing should be concluded from it.
 */
async function keyFits(key: CryptoKey): Promise<boolean | undefined> {
  const s = subtle();
  if (!s) return undefined;
  const alg = key.algorithm as EcKeyAlgorithm;
  if (alg.name !== 'ECDSA' || alg.namedCurve !== 'P-256' || !key.usages.includes('sign')) return false;
  try {
    const test = bytes('poe2.quest key check');
    const sig = await s.sign(SIGNING, key, test);
    return await s.verify(SIGNING, await ownerPublicKey(s), sig, test);
  } catch {
    return undefined;
  }
}

/**
 * The signing key for a secret (not extractable). Null if it isn't the other
 * half of the public key; undefined if that couldn't be checked (no WebCrypto,
 * or it failed for some other reason).
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
  // Others don't: the test signature does.
  const fits = await keyFits(key);
  return fits ? key : fits === false ? null : undefined;
}

/** Where this browser keeps the creator's key. */
export interface KeyStore {
  get(): Promise<CryptoKey | null>;
  set(key: CryptoKey): Promise<void>;
  delete(): Promise<void>;
}

/** IndexedDB, which can hold a CryptoKey as it is (localStorage could only hold the secret itself). */
const indexedDbStore: KeyStore = (() => {
  const DB = 'poe2trivia';
  const STORE = 'keys';
  const ID = 'owner';
  const open = () =>
    new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB is not available'));
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  const run = async <T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>) => {
    const db = await open();
    try {
      return await new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = op(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  };
  return {
    get: async () => {
      const key = await run<unknown>('readonly', (s) => s.get(ID));
      return key instanceof CryptoKey ? key : null;
    },
    set: (key) => run('readwrite', (s) => s.put(key, ID)).then(() => {}),
    delete: () => run('readwrite', (s) => s.delete(ID)).then(() => {}),
  };
})();

let store: KeyStore = indexedDbStore;

/** The stored key, once it was found to fit (failed checks aren't kept, so they're tried again). */
let checked: CryptoKey | null = null;
/** A check under way: everyone who asks meanwhile waits for the same one. */
let checking: Promise<OwnerKeyState> | null = null;

/** Tests keep the key somewhere else. */
export function useKeyStore(s: KeyStore) {
  store = s;
  checked = null;
  checking = null;
}

export type OwnerKeyState = 'ok' | 'none' | 'removed' | 'unchecked';

/** What to tell the creator when their key couldn't be checked (rather than that their own name is taken). */
export const OWNER_KEY_UNCHECKED = "This browser's owner key couldn't be checked just now. Try again in a moment.";

/**
 * Checks the key this browser holds. One that doesn't fit the public half
 * (an old key, after a new one was made) is forgotten: `removed`. `unchecked`:
 * couldn't tell this time (it's kept and tried again later).
 */
export function checkOwnerKey(): Promise<OwnerKeyState> {
  if (checked) return Promise.resolve('ok');
  return (checking ??= check().finally(() => (checking = null)));
}

async function check(): Promise<OwnerKeyState> {
  let key: CryptoKey | null;
  try {
    key = await store.get();
  } catch {
    return 'unchecked';
  }
  if (!key) return 'none';
  const fits = await keyFits(key);
  if (fits) {
    checked = key;
    return 'ok';
  }
  if (fits === undefined) return 'unchecked';
  try {
    await store.delete();
  } catch {
    /* tried again next time */
  }
  return 'removed';
}

/** Whether this browser holds the creator's key, and it has been found to fit (see `checkOwnerKey`). */
export const hasOwnerKey = () => checked !== null;

/** The creator's signature of `claim`, or null when this browser doesn't hold the key (or it doesn't fit). */
export async function signAsOwner(claim: string): Promise<string | null> {
  const s = subtle();
  if (!s || (await checkOwnerKey()) !== 'ok' || !checked) return null;
  try {
    return base64url(new Uint8Array(await s.sign(SIGNING, checked, bytes(claim))));
  } catch {
    return null;
  }
}

/** Saves the creator's key from its secret (as pasted in). */
export async function saveOwnerKey(secret: string): Promise<'saved' | 'invalid' | 'unchecked'> {
  const key = await importOwnerKey(secret.trim());
  if (key === undefined) return 'unchecked';
  if (!key) return 'invalid';
  try {
    await store.set(key);
  } catch {
    return 'unchecked';
  }
  checked = key;
  checking = null;
  return 'saved';
}

/** Removes the creator's key from this browser. */
export async function forgetOwnerKey() {
  checked = null;
  checking = null;
  await store.delete();
}

/**
 * Handles `#owner` in the address: asks for the key (with `ask`) and saves
 * it, or removes it for `#owner=forget`, and takes it out of the address.
 * A secret put in the address itself isn't saved: the browser has already
 * recorded it in its history (`in-address`). Null if the address had nothing
 * for it; `cancelled` if nothing was pasted.
 */
export async function takeOwnerKeyFromUrl(
  ask: () => string | null,
): Promise<'saved' | 'forgotten' | 'invalid' | 'unchecked' | 'in-address' | 'cancelled' | null> {
  const params = new URLSearchParams(location.hash.slice(1));
  if (!params.has(URL_PARAM)) return null;
  const value = params.get(URL_PARAM);
  params.delete(URL_PARAM);
  const hash = params.toString();
  history.replaceState(history.state, '', `${location.pathname}${location.search}${hash ? `#${hash}` : ''}`);
  if (value === 'forget') {
    try {
      await forgetOwnerKey();
    } catch {
      return 'unchecked';
    }
    return 'forgotten';
  }
  if (value) return 'in-address';
  const secret = ask();
  if (!secret?.trim()) return 'cancelled';
  return saveOwnerKey(secret);
}
