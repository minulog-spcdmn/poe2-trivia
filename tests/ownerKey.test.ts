import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkOwner, checkRoom, isOwnerProof, ownerProof, ownerPublicKey, ownerUnlocked, roomProof, unlockOwner } from '../src/lib/ownerKey.ts';

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

test("the owner's signature checks out only for the room, and the role, it was made for", async () => {
  // The real words are not in the repo, so this runs against a test key.
  const key = await ownerPublicKey('test words');
  assert.match(key, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(await ownerProof('ABCD', key), null, 'a device without the key signs nothing');
  assert.equal(await unlockOwner('other words', key), false);
  assert.equal(ownerUnlocked(key), false);
  assert.ok(await unlockOwner('Test Words', key));
  assert.ok(ownerUnlocked(key));

  const proof = (await ownerProof('ABCD', key))!;
  assert.ok(isOwnerProof(proof));
  assert.ok(await checkOwner('ABCD', proof, key));
  assert.equal(await checkOwner('WXYZ', proof, key), false, "another room's");
  assert.equal(await checkRoom('ABCD', proof, key), false, "a player's signature isn't a listing's");
  assert.equal(await checkOwner('ABCD', { ...proof, n: proof.n + 'x' }, key), false, 'another nonce');
  const flipped = proof.sig[0] === 'A' ? 'B' + proof.sig.slice(1) : 'A' + proof.sig.slice(1);
  assert.equal(await checkOwner('ABCD', { ...proof, sig: flipped }, key), false, 'a forged signature');
  assert.equal(await checkOwner('ABCD', proof, await ownerPublicKey('other words')), false, "another key's");
  assert.equal(await checkOwner('ABCD', proof, ''), false, 'no key set: nobody is the owner');
  for (const junk of [null, 'x', { n: 'short', sig: proof.sig }, { n: proof.n, sig: 'x'.repeat(5000) }]) assert.equal(await checkOwner('ABCD', junk, key), false);

  const listing = (await roomProof('ABCD', key))!;
  assert.ok(await checkRoom('ABCD', listing, key));
  assert.equal(await checkRoom('WXYZ', listing, key), false);
  assert.equal(await checkOwner('ABCD', listing, key), false);
});
