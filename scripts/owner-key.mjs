// Makes a new owner key: the signing key that lets the site's creator use
// their name (see src/lib/owner.ts). Prints the public half, which goes into
// OWNER_PUBLIC_KEY in src/lib/owner.ts, and the secret half, which never goes
// into the project (or into an address): open https://poe2.quest/#owner once
// in each browser that should be allowed the name, and paste it when asked.
// A new key locks out the old one.
// Run: node scripts/owner-key.mjs
const { subtle } = globalThis.crypto;

const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const { x, y, d } = await subtle.exportKey('jwk', pair.privateKey);

console.log(`Public key (src/lib/owner.ts): { x: '${x}', y: '${y}' }`);
console.log(`Secret (keep it to yourself):  ${d}`);
console.log('To use it: open https://poe2.quest/#owner and paste the secret when asked.');
