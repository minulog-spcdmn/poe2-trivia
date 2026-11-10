import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accelerationFix, drawsInSoftware, firefoxInSoftware, firefoxOnWindows, GENERAL_FIX, softwareRenderer, type FirefoxSigns, type Probe } from '../src/lib/gpuCheck.ts';

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

test('no WebGL at all tells nothing, so it is not called software', () => {
  assert.equal(drawsInSoftware(probe(false, false).p), false);
});

/** Firefox's signs, a test's own: what it says of a tall video and a small one, and of WebGPU; and what was asked. */
function signs(tall: boolean | null, small: boolean | null, gpu: boolean | null) {
  const asked: string[] = [];
  const s: FirefoxSigns = {
    sparing: async (height) => {
      asked.push(`video ${height}`);
      return height > 480 ? tall : small;
    },
    findsGpu: async () => {
      asked.push('webgpu');
      return gpu;
    },
  };
  return { s, asked };
}

test('Firefox with acceleration off: the tall video not sparing, the small one sparing, no GPU for WebGPU', async () => {
  assert.equal(await firefoxInSoftware(signs(false, true, false).s), true);
});

test('Firefox decoding with the GPU is asked nothing more', async () => {
  const on = signs(true, true, true);
  assert.equal(await firefoxInSoftware(on.s), false);
  assert.deepEqual(on.asked, ['video 1080']);
});

test('one sign alone is not enough: a GPU kept from decoding video, a card too old for WebGPU', async () => {
  assert.equal(await firefoxInSoftware(signs(false, true, true).s), false, 'WebGPU finds a GPU');
  assert.equal(await firefoxInSoftware(signs(true, true, false).s), false, 'the GPU decodes');
});

test('a Firefox that says "not sparing" to every video (resisting fingerprinting) tells nothing', async () => {
  const resisting = signs(false, false, false);
  assert.equal(await firefoxInSoftware(resisting.s), false);
  assert.deepEqual(resisting.asked, ['video 1080', 'video 360'], 'WebGPU not asked');
});

test('a sign Firefox can’t give counts as the GPU', async () => {
  assert.equal(await firefoxInSoftware(signs(null, true, false).s), false, 'no telling of the video');
  assert.equal(await firefoxInSoftware(signs(false, null, false).s), false);
  assert.equal(await firefoxInSoftware(signs(false, true, null).s), false, 'no WebGPU to ask');
});

test('the signs are Firefox’s on Windows, where they were measured: no other browser’s, nor Firefox’s elsewhere', () => {
  assert.equal(firefoxOnWindows('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:159.0) Gecko/20100101 Firefox/159.0'), true);
  assert.equal(firefoxOnWindows('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'), false);
  assert.equal(firefoxOnWindows('Mozilla/5.0 (X11; Linux x86_64; rv:159.0) Gecko/20100101 Firefox/159.0'), false);
  assert.equal(firefoxOnWindows('Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:159.0) Gecko/20100101 Firefox/159.0'), false);
  assert.equal(firefoxOnWindows('Mozilla/5.0 (Android 14; Mobile; rv:159.0) Gecko/159.0 Firefox/159.0'), false);
});

test('the fix gives the settings address, the switch and the restart of the browser at hand', () => {
  const chrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
  assert.deepEqual(accelerationFix(chrome), {
    name: 'Graphics acceleration',
    address: 'chrome://settings/system',
    turnOn: 'Turn on “Use graphics acceleration when available”.',
    restart: 'Press Relaunch, the button that shows beside it.',
  });
  // Edge and Opera say they are Chrome too: their own address, not Chrome's.
  const edge = accelerationFix(`${chrome} Edg/141.0.0.0`);
  assert.equal(edge?.address, 'edge://settings/system');
  assert.match(edge?.restart ?? '', /^Press Restart/);
  // Opera's switch keeps the older name.
  const opera = accelerationFix(`${chrome} OPR/120.0.0.0`);
  assert.equal(opera?.address, 'opera://settings/system');
  assert.equal(opera?.turnOn, 'Turn on “Use hardware acceleration when available”.');
  const firefox = accelerationFix('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0');
  assert.equal(firefox?.address, 'about:preferences#general');
  // Named as each browser's settings name it: the title the player reads is the word they then look for.
  assert.equal(firefox?.name, 'Hardware acceleration');
  assert.equal(opera?.name, 'Hardware acceleration');
  assert.equal(edge?.name, 'Graphics acceleration');
  assert.equal(firefox?.turnOn, 'Under Performance, tick “Use hardware acceleration when available”.');
});

test('a browser not known by name gets the steps in general', () => {
  const other = accelerationFix('Mozilla/5.0 (X11; Linux x86_64) SomeBrowser/1.0');
  assert.equal(other, GENERAL_FIX);
  assert.equal(other?.address, null);
  assert.match(other?.turnOn ?? '', /hardware acceleration/);
  assert.equal(accelerationFix(''), GENERAL_FIX);
});

test('Safari gets no fix, on a Mac or an iPad (which says it is a Mac): it has no such setting', () => {
  assert.equal(accelerationFix('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'), null);
});

test('phones and tablets get no fix: their browsers have no such setting', () => {
  assert.equal(accelerationFix('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36'), null);
  assert.equal(accelerationFix('Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36'), null);
  assert.equal(accelerationFix('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36 EdgA/141.0.0.0'), null);
  assert.equal(accelerationFix('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'), null);
});
