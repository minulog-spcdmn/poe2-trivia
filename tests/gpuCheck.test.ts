import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accelerationFix, drawsInSoftware, softwareRenderer, type Probe } from '../src/lib/gpuCheck.ts';

const ctx = (renderer: string | null) => ({ renderer });
const probe = (strict: string | null | false, plain: string | null | false = false) => {
  let plainAsked = 0;
  const p: Probe = {
    strict: () => (strict === false ? null : ctx(strict)),
    plain: () => {
      plainAsked++;
      return plain === false ? null : ctx(plain);
    },
  };
  return { p, plainAsked: () => plainAsked };
};

test('the software renderers are told apart from GPUs', () => {
  assert.equal(softwareRenderer('ANGLE (Microsoft, Microsoft Basic Render Driver (0x0000008C) Direct3D11 vs_5_0 ps_5_0, D3D11)'), true);
  assert.equal(softwareRenderer('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)'), true);
  assert.equal(softwareRenderer('llvmpipe (LLVM 15.0.7, 256 bits)'), true);
  assert.equal(softwareRenderer('ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 (0x00002F04) Direct3D11 vs_5_0 ps_5_0, D3D11)'), false);
  assert.equal(softwareRenderer('Apple M2'), false);
  assert.equal(softwareRenderer('WebKit WebGL'), false);
  assert.equal(softwareRenderer(null), false);
});

test('a strict context refused while a plain one is given means software', () => {
  assert.equal(drawsInSoftware(probe(false, 'WebKit WebGL').p), true);
});

test('a strict context given means a GPU, and no second context is made', () => {
  const p = probe('ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'x');
  assert.equal(drawsInSoftware(p.p), false);
  assert.equal(p.plainAsked(), 0);
  assert.equal(drawsInSoftware(probe(null).p), false);
});

test("the renderer's name catches a software context the caveat let through", () => {
  assert.equal(drawsInSoftware(probe('llvmpipe (LLVM 15.0.7, 256 bits)').p), true);
});

test('no WebGL at all is not software: the CSS backdrop runs smoothly', () => {
  assert.equal(drawsInSoftware(probe(false, false).p), false);
});

test('the fix names the setting in the browser at hand', () => {
  const chrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
  assert.match(accelerationFix(chrome) ?? '', /^turn on Chrome’s Settings › System › “Use graphics acceleration when available”, then relaunch it\.$/);
  assert.match(accelerationFix(`${chrome} Edg/141.0.0.0`) ?? '', /^turn on Edge’s Settings › System and performance/);
  assert.match(accelerationFix(`${chrome} OPR/120.0.0.0`) ?? '', /^turn on Opera’s/);
  assert.match(accelerationFix('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0') ?? '', /Firefox’s Settings › General › Performance/);
  assert.match(accelerationFix('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15') ?? '', /your browser’s settings/);
});

test('phones and tablets get no fix: their browsers have no such setting', () => {
  assert.equal(accelerationFix('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36'), null);
  assert.equal(accelerationFix('Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36'), null);
  assert.equal(accelerationFix('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36 EdgA/141.0.0.0'), null);
  assert.equal(accelerationFix('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'), null);
});
