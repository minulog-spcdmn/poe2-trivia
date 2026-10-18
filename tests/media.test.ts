// A guest's side of a question's pictures (lib/media.svelte.ts, Shown): the
// host's word on them is a stranger's, so a veil no real cut makes is
// dropped; patches that overtake their (sealed) veil wait for it; a veil sent
// again on a reconnect keeps what has burnt in; and a new question starts
// clean.
import './asVite.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { packLabels } from '../src/lib/patches.ts';
import type { MediaMsg } from '../src/lib/protocol.ts';

const { shown, imageType } = await import('../src/lib/media.svelte.ts');

type Veil = Extract<MediaMsg, { t: 'veil' }>;

/** A W × H veiled picture cut in four, its quarters numbered as `order` says (top left, top right, bottom left, bottom right). */
function quarters(W: number, H: number, order = [0, 1, 2, 3]) {
  const label = new Int16Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) label[y * W + x] = order[(y < H / 2 ? 0 : 2) + (x < W / 2 ? 0 : 1)];
  return label;
}
const veil = (qid: number, o: Partial<Veil> & { label?: Int16Array } = {}): Veil => {
  const { label = quarters(8, 8), ...rest } = o;
  return { t: 'veil', qid, w: 8, h: 8, burn: 400, count: 4, box: [0, 0, 8, 8], data: new ArrayBuffer(16), labels: packLabels(label).buffer as ArrayBuffer, ...rest };
};
const patch = (qid: number, i: number, tile?: number): MediaMsg => ({ t: 'patch', qid, i, ...(tile === undefined ? {} : { tile }) });
/** Lets the cut's places come in (a promise, as from its worker). */
const settle = () => new Promise((r) => setImmediate(r));
const burnt = () => Object.keys(shown.patches).map(Number);

let qid = 100;
const next = () => (qid += 10);

test('patches that come before their veil wait for it, and burn in as it lands', async () => {
  const q = next();
  shown.receive(patch(q, 2));
  shown.receive(patch(q, 0));
  await settle();
  assert.deepEqual(burnt(), []);
  shown.receive(veil(q));
  await settle();
  assert.deepEqual(burnt(), [0, 2]);
  // Patch 2 is the bottom left quarter.
  assert.ok(shown.patches[2].x === 0 && shown.patches[2].y > 0);
  // Another picture's patch ("find the art", Delve) waits for that picture, not this one.
  shown.receive(patch(q, 1, 3));
  await settle();
  assert.deepEqual(shown.tilePatches, {});
  shown.receive(veil(q, { tile: 3 }));
  await settle();
  assert.deepEqual(Object.keys(shown.tilePatches[3]), ['1']);
  assert.deepEqual(burnt(), [0, 2]);
});

test('patches waiting are held only so far: past that, more are not kept', async () => {
  const q = next();
  // A host flooding patches for a question to come.
  for (let i = 0; i < 1024; i++) shown.receive(patch(q + 5, i % 4));
  shown.receive(patch(q, 1));
  shown.receive(veil(q));
  await settle();
  assert.deepEqual(burnt(), []);
  shown.receive(patch(q, 1));
  await settle();
  assert.deepEqual(burnt(), [1], 'once its veil is here, a patch shows at once');
});

test("a veil whose labels don't make the patches it counts is dropped, its patches never shown", async () => {
  const q = next();
  shown.receive(veil(q, { count: 5 }));
  shown.receive(patch(q, 0));
  await settle();
  assert.equal(shown.veil, null);
  assert.deepEqual(burnt(), []);
  // Numbered with one left out (0, 1, 3, 4): no cut numbers its patches so.
  shown.receive(veil(q, { label: quarters(8, 8, [0, 1, 3, 4]), count: 4 }));
  assert.equal(shown.veil, null);
});

test('a veil no real cut makes, too big or too much work to cut, is dropped', async () => {
  const q = next();
  // Over 512 × 512.
  const big = 513 * 512;
  shown.receive(veil(q, { w: 513, h: 512, label: new Int16Array(big), count: 1, box: [0, 0, 513, 512] }));
  assert.equal(shown.veil, null);
  // 255 patches, each a pixel in the top row and one in the bottom: every one's box is the whole picture.
  const W = 512;
  const label = new Int16Array(W * W).fill(-1);
  for (let k = 0; k < 255; k++) [label[k], label[W * W - 1 - k]] = [k, k];
  shown.receive(veil(q, { w: W, h: W, label, count: 255, box: [0, 0, W, W] }));
  assert.equal(shown.veil, null);
  // The same picture cut as a real cut would be (its patches side by side) is taken.
  const fair = new Int16Array(W * W);
  for (let i = 0; i < fair.length; i++) fair[i] = Math.floor((i % W) / 2.01);
  shown.receive(veil(q, { w: W, h: W, label: fair, count: 255, box: [0, 0, W, W] }));
  assert.equal(shown.veil?.count, 255);
});

test('the same veil sent again (a guest reconnecting) keeps what burnt in; a different cut starts afresh', async () => {
  const q = next();
  shown.receive(veil(q));
  shown.receive(patch(q, 0));
  shown.receive(patch(q, 3));
  await settle();
  const before = shown.patches;
  shown.receive(veil(q));
  // And the patches sent again with it are there already.
  shown.receive(patch(q, 0));
  await settle();
  assert.deepEqual(burnt(), [0, 3]);
  assert.equal(shown.patches[0], before[0]);
  shown.receive(veil(q, { label: quarters(8, 8, [3, 2, 1, 0]) }));
  await settle();
  assert.deepEqual(burnt(), []);
  shown.receive(patch(q, 0));
  await settle();
  // Patch 0 is the bottom right quarter now.
  assert.ok(shown.patches[0].x > 0 && shown.patches[0].y > 0, 'from the new cut');
});

test("a new question starts clean, and an older one's pictures are left", async () => {
  const q = next();
  shown.receive(veil(q));
  shown.receive(patch(q, 1));
  await settle();
  const q2 = next();
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]).buffer;
  shown.receive({ t: 'art', qid: q2, w: 10, h: 10, data: png });
  assert.equal(shown.qid, q2);
  assert.equal(shown.veil, null);
  assert.deepEqual(burnt(), []);
  assert.equal(shown.art?.w, 10);
  // The previous question's, arriving late, changes nothing.
  shown.receive(veil(q));
  shown.receive(patch(q, 2));
  await settle();
  assert.equal(shown.veil, null);
  assert.deepEqual(burnt(), []);
  assert.equal(shown.qid, q2);
});

test("a picture's type is read from its first bytes, not from what the host says", () => {
  const bytes = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
  assert.equal(imageType(bytes('RIFF\0\0\0\0WEBPVP8 ')), 'image/webp');
  assert.equal(imageType(bytes('\x89PNG\r\n\x1a\n')), 'image/png');
  assert.equal(imageType(bytes('<svg onload=')), '');
  assert.equal(imageType(new Uint8Array(0)), '');
  // A view into a larger buffer is read from where it starts.
  const buf = bytes('xxxx\x89PNG');
  assert.equal(imageType(buf.subarray(4)), 'image/png');
});
