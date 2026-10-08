// The backdrop's two sets of programs (lib/backdrop.ts): the lean ones the
// start page and the other modes draw with, and Delve's, built only once
// Delve is on its way. The lean ones must hold none of Delve's code (that's
// what they save), be Delve's with only Delve's parts taken out (so the two
// can't drift apart), and stand in for them only where those parts are off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// The app's own imports leave out the extension (Vite finds the file).
registerHooks({
  resolve(spec, context, next) {
    if (/^\.\.?\//.test(spec) && !/\.[a-z]+$/.test(spec) && context.parentURL?.includes('/src/')) {
      try {
        return next(spec + '.ts', context);
      } catch {
        /* not a .ts module: resolved as written below */
      }
    }
    return next(spec, context);
  },
});

const g = globalThis as Record<string, unknown>;
g.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
g.document = { documentElement: { hasAttribute: () => false } };

const { backdropShaders, delveScene } = await import('../src/lib/backdrop.ts');
const { ENV_GLSL } = await import('../src/lib/shaders/effects.ts');
const { FX_NOISE_GLSL, SHAFTS_GLSL, SPORES_GLSL } = await import('../src/lib/shaders/newEffects.ts');
const { ENVIRONMENTS, SURFACE, descent } = await import('../src/lib/descent.ts');

/** Names only Delve's parts of the shaders use. */
const DELVE_ONLY = /\b(env_\w+|fx_spores|fx_shafts|environments|closing|tendrils|fxSlot|vnoise|fbm|ridge|smin3|gFrost|gDark|gLit|uDark|uFx|uFxK|uEddy|uCityA|uCityB|uCityC|uIce|frost|near)\b/;

for (const n of [4, 16]) {
  const lean = backdropShaders(n);
  const delve = backdropShaders(n, true);
  const passes = ['smooth', 'split', 'whole'] as const;

  test(`the lean programs hold none of Delve's code (${n} elements)`, () => {
    for (const k of passes) {
      for (const part of [ENV_GLSL, FX_NOISE_GLSL, SPORES_GLSL, SHAFTS_GLSL]) assert.ok(!lean[k].includes(part.trim().slice(0, 400)), `${k} holds an environment's code`);
      const code = lean[k].replace(/\/\/[^\n]*/g, '');
      assert.doesNotMatch(code, DELVE_ONLY, `${k}`);
      assert.ok(lean[k].length < delve[k].length * 0.4, `${k} is much smaller than Delve's`);
    }
    assert.equal(lean.vert, delve.vert);
  });

  test(`Delve's programs are the lean ones with Delve's parts put back, and nothing else changed (${n} elements)`, () => {
    for (const k of passes) {
      // Every environment, the dark closing in and its tendrils are in Delve's.
      for (const part of [ENV_GLSL, FX_NOISE_GLSL, SPORES_GLSL, SHAFTS_GLSL]) assert.ok(delve[k].includes(part), `${k} lacks an environment's code`);
      for (const name of ENVIRONMENTS) assert.match(delve[k], new RegExp(`(env|fx)_${name}\\(`), `${k}: ${name}`);
      assert.match(delve[k], /float closing\(vec2 p\)/);
      assert.match(delve[k], /float tendrils\(vec2 p\)/);
      // The lean program's lines are Delve's, in order, but for the two
      // values it has in place of Delve's (a frost of 0, the embers' light
      // never dimmed by the dark): nothing in it is its own.
      const leanLines = lean[k].split('\n');
      const delveLines = delve[k].replace(' * uEmberGain * near;', ' * uEmberGain;').replace('vec4(col, gFrost)', 'vec4(col, 0.0)').split('\n');
      let j = 0;
      for (const line of delveLines) if (j < leanLines.length && line === leanLines[j]) j++;
      assert.equal(j, leanLines.length, `${k}: lean line ${j + 1} is not Delve's: ${JSON.stringify(leanLines[j])}`);
    }
    // The main pass, with the soft light split off or not.
    assert.match(delve.split, /uniform sampler2D uSmooth;/);
    assert.match(delve.whole, /vec3 col = smoothLight\(p\);\n  float frost = gFrost;/);
  });
}

test("Delve's parts are off at the surface's look, so the lean programs draw it exactly", () => {
  const city = ENVIRONMENTS.indexOf('city');
  assert.equal(delveScene(SURFACE, 0, 0, SURFACE.env[city]), false);
  const surface = descent(0);
  assert.equal(delveScene(surface.look, surface.close, 0, surface.look.env[city]), false);
  // A question's clock, or the light of a right answer (a little under 0), is Delve's.
  assert.equal(delveScene(SURFACE, 0, 0.3, 0), true);
  assert.equal(delveScene(SURFACE, 0, -0.05, 0), true);
  assert.equal(delveScene(SURFACE, 0.2, 0, 0), true);
  assert.equal(delveScene(SURFACE, 0, 0, 0.5), true);
  // Deep down, the stratum's smoke and dark.
  const deep = descent(45);
  assert.equal(delveScene(deep.look, deep.close, 0, deep.look.env[city]), true);
});
