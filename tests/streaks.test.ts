import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ABLAZE_FROM, ABLAZE_FULL, BLUE_FROM, burnsBlue, heatOf } from '../src/lib/fx/streaks.ts';

test('the fire lights at three in a row and grows a step with every answer until ten', () => {
  assert.equal(heatOf(0), 0);
  assert.equal(heatOf(ABLAZE_FROM - 1), 0);
  assert.equal(heatOf(3), 1 / 8);
  for (let n = ABLAZE_FROM; n < ABLAZE_FULL; n++) assert.ok(heatOf(n + 1) > heatOf(n), `grows from ${n} to ${n + 1}`);
  assert.equal(heatOf(10), 1);
  assert.equal(heatOf(25), 1, 'and never past full');
});

test('the fire turns blue at seven in a row, within a game to ten', () => {
  assert.ok(BLUE_FROM > ABLAZE_FROM && BLUE_FROM <= ABLAZE_FULL);
  assert.equal(burnsBlue(heatOf(0)), false);
  assert.equal(burnsBlue(heatOf(6)), false);
  assert.equal(burnsBlue(heatOf(7)), true);
  assert.equal(burnsBlue(heatOf(10)), true);
  assert.equal(burnsBlue(heatOf(30)), true);
});
