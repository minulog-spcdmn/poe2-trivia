// Prints the public key for new owner key words, to paste into
// OWNER_PUBLIC_KEY in src/lib/ownerKey.ts. Then open the site once with
// ?owner=<the words> on each device that should play under the held name.
// Usage: node --experimental-strip-types scripts/owner-key.mjs "some words here"
// Pick the words at random (four or more) and never commit them.
import { ownerPublicKey } from '../src/lib/ownerKey.ts';

const words = process.argv.slice(2).join(' ');
if (!words) {
  console.error('Usage: node --experimental-strip-types scripts/owner-key.mjs "some words here"');
  process.exit(1);
}
console.log(await ownerPublicKey(words));
