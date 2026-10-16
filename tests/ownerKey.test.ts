import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkOwner, checkRoom, isOwnerProof, newChallenge, ownerProof, ownerPublicKey, ownerUnlocked, roomProof, unlockOwner } from '../src/lib/ownerKey.ts';
import { playerIdFor } from '../src/lib/guard.ts';

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

test("the owner's signature checks out only for the room and the player it was made for", async () => {
  // The real words are not in the repo, so this runs against a test key.
  const key = await ownerPublicKey('test words');
  assert.match(key, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(await ownerProof('ABCD', 'p1', key), null, 'a device without the key signs nothing');
  assert.equal(await unlockOwner('other words', key), false);
  assert.equal(ownerUnlocked(key), false);
  assert.ok(await unlockOwner('Test Words', key));
  assert.ok(ownerUnlocked(key));

  const proof = (await ownerProof('ABCD', 'p1', key))!;
  assert.ok(isOwnerProof(proof));
  assert.ok(await checkOwner('ABCD', 'p1', proof, key));
  assert.equal(await checkOwner('WXYZ', 'p1', proof, key), false, "another room's");
  // Seen in the room, it's of no use to anyone playing under another id.
  assert.equal(await checkOwner('ABCD', 'p2', proof, key), false, "another player's");
  assert.equal(await checkRoom('ABCD', 'p1', proof, key), false, "a player's signature isn't a listing's");
  const flipped = proof[0] === 'A' ? 'B' + proof.slice(1) : 'A' + proof.slice(1);
  assert.equal(await checkOwner('ABCD', 'p1', flipped, key), false, 'a forged signature');
  assert.equal(await checkOwner('ABCD', 'p1', proof, await ownerPublicKey('other words')), false, "another key's");
  assert.equal(await checkOwner('ABCD', 'p1', proof, ''), false, 'no key set: nobody is the owner');
  for (const junk of [null, 'x', 'x'.repeat(5000), { sig: proof }]) assert.equal(await checkOwner('ABCD', 'p1', junk, key), false);
});

test("a listing is signed over each prober's own challenge, so an old one can't be shown again", async () => {
  const key = await ownerPublicKey('test words');
  assert.ok(await unlockOwner('test words', key));
  const challenge = newChallenge();
  const listing = (await roomProof('ABCD', challenge, key))!;
  assert.ok(await checkRoom('ABCD', challenge, listing, key));
  assert.equal(await checkRoom('ABCD', newChallenge(), listing, key), false, "another probe's");
  assert.equal(await checkRoom('WXYZ', challenge, listing, key), false);
});

test("a newcomer's id comes from its room token: the same token, the same id; no other token makes it", async () => {
  const a = await playerIdFor('a'.repeat(43));
  assert.equal(a, await playerIdFor('a'.repeat(43)));
  assert.notEqual(a, await playerIdFor('b'.repeat(43)));
  assert.match(a, /^[A-Za-z0-9_-]{16}$/);
});
