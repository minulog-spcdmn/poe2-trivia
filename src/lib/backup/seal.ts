// What a backup's secret makes, and how a device's progress is sealed with
// it (lib/backup/backup.svelte.ts says what the secret is and where it lives).
//
// The secret is 32 random bytes, the passkey's user id after a byte naming
// the channel (the beta's passkeys are the live game's site's too, so the
// player's password manager offers both: one of the other channel's is
// turned away, never taken for an empty bucket). Two things are drawn
// from it (HKDF, SHA-256), apart for each channel so the beta and the dev
// server never write into the live game's: the bucket, the name the server
// keeps a player's entries under, and the key they are sealed with. The
// server has only the bucket's name and what it can't read.
//
// An entry is one device's progress as JSON, gzipped, then sealed with
// AES-GCM (a fresh 12-byte nonce before it): the bucket and the device are
// bound into the seal, so an entry opens only as the device it was made for.

import { base64url } from '../base64url.ts';
import type { Channel } from '../channel.ts';

export const SECRET_BYTES = 32;

/** A new secret. */
export const newSecret = (): Uint8Array<ArrayBuffer> => crypto.getRandomValues(new Uint8Array(SECRET_BYTES));

const CHANNEL_BYTE: Record<Channel, number> = { live: 1, beta: 2, local: 3 };

/** The passkey's user id for `secret` on `channel`. */
export function userId(secret: Uint8Array<ArrayBuffer>, channel: Channel): Uint8Array<ArrayBuffer> {
  const id = new Uint8Array(1 + SECRET_BYTES);
  id[0] = CHANNEL_BYTE[channel];
  id.set(secret, 1);
  return id;
}

/** The secret in a passkey's user id: the channel it's another's (`elsewhere`), or null for one the game didn't make. */
export function secretIn(id: Uint8Array<ArrayBuffer>, channel: Channel): Uint8Array<ArrayBuffer> | { elsewhere: Channel } | null {
  if (id.length !== 1 + SECRET_BYTES) return null;
  const of = (Object.keys(CHANNEL_BYTE) as Channel[]).find((c) => CHANNEL_BYTE[c] === id[0]);
  if (!of) return null;
  return of === channel ? id.slice(1) : { elsewhere: of };
}

const enc = new TextEncoder();

/** The bucket and the key a secret makes on a channel. */
export async function fromSecret(secret: Uint8Array<ArrayBuffer>, channel: string): Promise<{ bucket: string; key: CryptoKey }> {
  const base = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveBits', 'deriveKey']);
  const params = (what: string) => ({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('poe2.quest backup'), info: enc.encode(`${what} ${channel}`) });
  const [bits, key] = await Promise.all([
    crypto.subtle.deriveBits(params('bucket'), base, 256),
    crypto.subtle.deriveKey(params('key'), base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']),
  ]);
  return { bucket: base64url(new Uint8Array(bits)), key };
}

async function through(bytes: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

const bound = (bucket: string, device: string) => enc.encode(`${bucket}/${device}`);

/** `text` sealed for `device` in `bucket`. */
export async function seal(text: string, key: CryptoKey, bucket: string, device: string): Promise<Uint8Array<ArrayBuffer>> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const zipped = await through(enc.encode(text), new CompressionStream('gzip'));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: bound(bucket, device) }, key, zipped));
  const out = new Uint8Array(iv.length + sealed.length);
  out.set(iv);
  out.set(sealed, iv.length);
  return out;
}

/** What `seal` made, or null where it doesn't open (another key, another device's, damaged, or more than `max` characters once unzipped). */
export async function unseal(data: Uint8Array<ArrayBuffer>, key: CryptoKey, bucket: string, device: string, max: number): Promise<string | null> {
  try {
    const zipped = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: data.slice(0, 12), additionalData: bound(bucket, device) }, key, data.slice(12));
    const reader = new Blob([zipped]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
    const parts: Uint8Array[] = [];
    let n = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      n += value.length;
      // (Bytes, at least as many as the characters they make.)
      if (n > max * 3) {
        void reader.cancel();
        return null;
      }
      parts.push(value);
    }
    const text = new TextDecoder().decode(await new Blob(parts as BlobPart[]).arrayBuffer());
    return text.length <= max ? text : null;
  } catch {
    return null;
  }
}
