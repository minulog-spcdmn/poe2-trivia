// Prints the hash for a new owner key, to paste into HELD_KEY_HASH in
// src/lib/names.ts. Usage: node --experimental-strip-types scripts/held-key-hash.mjs "some words here"
// Pick the words at random (four or more) and never commit the key itself.
import { heldKeyHash } from '../src/lib/names.ts';

const key = process.argv.slice(2).join(' ');
if (!key) {
  console.error('Usage: node --experimental-strip-types scripts/held-key-hash.mjs "some words here"');
  process.exit(1);
}
console.log(await heldKeyHash(key));
