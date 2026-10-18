import { test } from 'node:test';
import assert from 'node:assert/strict';
import { itemFile } from '../src/lib/ui-paths.ts';

test("an item's picture path can't be made to name a picture elsewhere", () => {
  assert.equal(itemFile('4f588a87bc12', 128), 'items/128/4f588a87bc12.avif');
  // In a srcset, a comma and a space would start a candidate of the host's choosing.
  assert.ok(!/[\s,]/.test(itemFile('a 9x, https://example.com/x?', 256)));
  assert.ok(!itemFile('../../x', 256).includes('/../'));
});
