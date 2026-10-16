import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkJoin, checkRoom, isOwnerProof, joinProof, newChallenge, ownerPublicKey, ownerUnlocked, roomProof, unlockOwner } from '../src/lib/ownerKey.ts';

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

test("the owner's signatures check out only over the challenge and the room they were made for", async () => {
  // The real words are not in the repo, so this runs against a test key.
  const key = await ownerPublicKey('test words');
  assert.match(key, /^[A-Za-z0-9_-]{43}$/);
  const hi = newChallenge();
  assert.equal(await joinProof('ABCD', hi, key), null, 'a device without the key signs nothing');
  assert.equal(await unlockOwner('other words', key), false);
  assert.equal(ownerUnlocked(key), false);
  assert.ok(await unlockOwner('Test Words', key));
  assert.ok(ownerUnlocked(key));

  // Joining: over the host's challenge, which a host never sends twice.
  const join = (await joinProof('ABCD', hi, key))!;
  assert.ok(isOwnerProof(join));
  assert.ok(await checkJoin('ABCD', hi, join, key));
  assert.equal(await checkJoin('ABCD', newChallenge(), join, key), false, "another link's challenge: seen once, of no use again");
  assert.equal(await checkJoin('WXYZ', hi, join, key), false, "another room's");
  assert.equal(await checkRoom('ABCD', hi, join, key), false, "a join's isn't a listing's");
  const flipped = join[0] === 'A' ? 'B' + join.slice(1) : 'A' + join.slice(1);
  assert.equal(await checkJoin('ABCD', hi, flipped, key), false, 'a forged signature');
  assert.equal(await checkJoin('ABCD', hi, join, await ownerPublicKey('other words')), false, "another key's");
  assert.equal(await checkJoin('ABCD', hi, join, ''), false, 'no key set: nobody is the owner');
  for (const junk of [null, 'x', 'x'.repeat(5000), { sig: join }]) assert.equal(await checkJoin('ABCD', hi, junk, key), false);
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
