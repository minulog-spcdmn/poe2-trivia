import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stageZoom } from '../src/lib/stage.ts';

test('windows up to 2560 wide are never scaled', () => {
  assert.equal(stageZoom(1440, 725), 1);
  assert.equal(stageZoom(1920, 970), 1);
  assert.equal(stageZoom(2560, 1310), 1);
  assert.equal(stageZoom(2560, 3000), 1);
});

test('larger windows scale by the smaller of width / 2560 and height / 1100', () => {
  assert.equal(stageZoom(3840, 2030), 1.5);
  assert.ok(Math.abs(stageZoom(3440, 1440) - 1440 / 1100) < 1e-9, 'an ultrawide goes by its height');
  assert.equal(stageZoom(3840, 1000), 1, 'a short window is not scaled');
});

test('the scale stops at 2', () => {
  assert.equal(stageZoom(7680, 4320), 2);
});
