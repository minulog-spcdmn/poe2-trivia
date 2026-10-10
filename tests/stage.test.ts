import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stageZoom } from '../src/lib/stage.ts';

const near = (a: number, b: number) => Math.abs(a - b) < 0.005;

test('laptops and ordinary desktops are never scaled', () => {
  assert.equal(stageZoom(1440, 725), 1);
  assert.equal(stageZoom(1512, 790), 1);
  assert.equal(stageZoom(1728, 925), 1);
  assert.equal(stageZoom(1920, 970), 1, 'just under 980 tall');
  assert.equal(stageZoom(1280, 1400), 1, 'narrow and tall');
});

test('larger windows scale by the smaller of width / 1440 and height / 980', () => {
  assert.ok(near(stageZoom(2560, 1310), 1.34), `1440p: ${stageZoom(2560, 1310)}`);
  assert.ok(near(stageZoom(3840, 2030), 2.07), `4K: ${stageZoom(3840, 2030)}`);
  assert.ok(near(stageZoom(1920, 1080), 1080 / 980), 'a full-screen 1080p window by its height');
  assert.ok(near(stageZoom(3440, 1440), 1440 / 980), 'an ultrawide by its height');
});

test('the scale stops at 2.2', () => {
  assert.equal(stageZoom(7680, 4320), 2.2);
});
