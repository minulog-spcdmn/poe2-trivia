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
  // A streak can't be longer than the right answers so far: blue fire never comes before depth 20 (the Frozen Hollow).
  assert.equal(DELVE_BLUE_FROM, 20);
});

test("a game's fire is orange then blue, and a long Delve run climbs on up the daily's colours to gold at a hundred", async () => {
  const { DAILY_LADDER, DELVE_BLUE_FROM, DELVE_FLAMES, flameOf } = await import('../src/lib/fx/streaks.ts');
  assert.equal(flameOf(ABLAZE_FROM).name, 'orange');
  assert.equal(flameOf(BLUE_FROM - 1).name, 'orange');
  assert.equal(flameOf(BLUE_FROM).name, 'blue');
  assert.equal(flameOf(50).name, 'blue', 'never past blue in a game');
  assert.deepEqual(
    DELVE_FLAMES.map((f) => [f.from, f.name]),
    [[ABLAZE_FROM, 'orange'], [DELVE_BLUE_FROM, 'blue'], [30, 'ice'], [40, 'chaos'], [60, 'violet'], [80, 'crimson'], [100, 'gold']],
  );
  assert.equal(flameOf(BLUE_FROM, true).name, 'orange', 'not blue at seven');
  assert.equal(flameOf(DELVE_BLUE_FROM, true).blue, true, "the game's own blue fire");
  assert.equal(flameOf(86, true).name, 'crimson');
  assert.equal(flameOf(500, true).name, 'gold');
  for (const f of DELVE_FLAMES) {
    const daily = DAILY_LADDER.find((d) => d.name === f.name)!;
    assert.deepEqual({ ...f, from: daily.from }, daily, `${f.name} burns as the daily's`);
  }
});

test('a run of daily answers burns from the first day and grows every day, quickly at first', async () => {
  const { DAILY_FULL, dailyHeatOf } = await import('../src/lib/fx/streaks.ts');
  assert.equal(dailyHeatOf(0), 0);
  assert.ok(dailyHeatOf(1) > 0.1, 'lit on day one');
  for (let d = 1; d < DAILY_FULL; d++) assert.ok(dailyHeatOf(d + 1) > dailyHeatOf(d), `grows from day ${d} to ${d + 1}`);
  assert.ok(dailyHeatOf(7) - dailyHeatOf(1) > dailyHeatOf(100) - dailyHeatOf(30), 'the first week grows more than days 30 to 100');
  assert.equal(dailyHeatOf(DAILY_FULL), 1);
  assert.equal(dailyHeatOf(1000), 1, 'never past full');
});

test('the daily fire changes colour at each milestone, orange then blue as in the game, gold after a year', async () => {
  const { DAILY_FULL, DAILY_LADDER, dailyFlameOf } = await import('../src/lib/fx/streaks.ts');
  assert.deepEqual(
    DAILY_LADDER.map((f) => [f.from, f.name]),
    [[1, 'orange'], [BLUE_FROM, 'blue'], [14, 'ice'], [30, 'chaos'], [60, 'violet'], [100, 'crimson'], [DAILY_FULL, 'gold']],
  );
  for (let i = 1; i < DAILY_LADDER.length; i++) assert.ok(DAILY_LADDER[i].from > DAILY_LADDER[i - 1].from, 'in order');
  assert.equal(dailyFlameOf(1).name, 'orange');
  assert.equal(dailyFlameOf(BLUE_FROM - 1).name, 'orange');
  assert.equal(dailyFlameOf(BLUE_FROM).name, 'blue');
  assert.equal(dailyFlameOf(BLUE_FROM).blue, true, "the game's own blue fire");
  assert.equal(dailyFlameOf(99).name, 'violet');
  assert.equal(dailyFlameOf(DAILY_FULL).name, 'gold');
  assert.equal(dailyFlameOf(2000).name, 'gold');
  for (const f of DAILY_LADDER) assert.ok(f.blue || !f.tint || f.tint.every((v) => v >= 0 && v <= 1), `${f.name} has a usable tint`);
});
