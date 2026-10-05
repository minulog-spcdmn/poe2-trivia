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

test('in Delve the fire grows over a long run, and only burns blue deep down', async () => {
  const { DELVE_ABLAZE_FULL, DELVE_BLUE_FROM } = await import('../src/lib/fx/streaks.ts');
  assert.equal(heatOf(ABLAZE_FROM, true) > 0, true, 'it still lights at three in a row');
  assert.ok(heatOf(ABLAZE_FULL, true) < 0.5, 'far from full at ten');
  assert.equal(heatOf(DELVE_ABLAZE_FULL, true), 1);
  assert.equal(burnsBlue(heatOf(DELVE_BLUE_FROM - 1, true), true), false);
  assert.equal(burnsBlue(heatOf(DELVE_BLUE_FROM, true), true), true);
  assert.equal(burnsBlue(heatOf(BLUE_FROM, true), true), false, 'not blue at seven');
  // A streak can't be longer than the depth: blue fire never comes before the blue embers.
  const { delveRules } = await import('../src/lib/delve.ts');
  assert.equal(delveRules(DELVE_BLUE_FROM).grayscale, 'all');
});
